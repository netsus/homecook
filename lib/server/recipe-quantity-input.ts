import { fail } from "@/lib/api/response";
import { quantityInputWriteEnabled } from "@/lib/server/quantity-input";
import { isRecipeIngredientIdentityValid } from "@/lib/recipe-ingredient-source";
import { isQuantityInputDraft } from "@/lib/quantity-input";
import type { RecipeQuantitySource, RecipeQuantityInputDraft, RecipeIngredientQuantityContext } from "@/types/recipe";
import type { IngredientUnitContext, IngredientUnitSource } from "@/lib/nutrition/ingredient-quantity";
import type { RecipeNutritionIngredientInput } from "@/lib/nutrition/recipe-nutrition-calculator";
import type { RecipeProductNutritionClient } from "@/lib/server/recipe-product-nutrition";
import type { IngredientQuantityOptions } from "@/types/quantity-input";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isRecipeQuantityInputDraft(value: unknown, ingredient: {
  amount: number | null;
  unit: string | null;
  ingredient_type: string;
  food_product_nutrition_version_id?: string | null;
}): value is RecipeQuantityInputDraft | null {
  if (value === null) return ingredient.ingredient_type === "TO_TASTE" && ingredient.amount === null && ingredient.unit === null;
  if (!record(value) || typeof value.expected_context_sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(value.expected_context_sha256)) return false;
  const raw = { ...value };
  delete raw.expected_context_sha256;
  return ingredient.ingredient_type === "QUANT" && ingredient.amount !== null && ingredient.unit !== null
    && isQuantityInputDraft(raw, { amount: ingredient.amount, unit: ingredient.unit })
    && raw.expected_batch_revision === undefined
    && (ingredient.food_product_nutrition_version_id
      ? raw.expected_product_nutrition_version_id === ingredient.food_product_nutrition_version_id
      : raw.expected_product_nutrition_version_id === undefined);
}

/** Opaque source IDs only: personal quantity text and owner never go in this read request. */
export function parseRecipeQuantitySources(value: unknown):
  { ok: true; sources: RecipeQuantitySource[] } | { ok: false; fields: Array<{ field: string; reason: string }> } {
  if (!record(value) || Object.keys(value).length !== 1 || !Array.isArray(value.sources)
    || value.sources.length === 0 || value.sources.length > 200) {
    return { ok: false, fields: [{ field: "sources", reason: "bounded_source_list_required" }] };
  }
  const sources: RecipeQuantitySource[] = [];
  const rowKeys = new Set<string>();
  for (const [index, item] of value.sources.entries()) {
    if (!record(item) || Object.keys(item).length !== 4
      || typeof item.row_key !== "string"
      || !(typeof item.ingredient_id === "string" || item.ingredient_id === null)
      || !(typeof item.food_product_id === "string" || item.food_product_id === null)
      || !(typeof item.food_product_nutrition_version_id === "string" || item.food_product_nutrition_version_id === null)
      || !isRecipeIngredientIdentityValid({ ingredient_id: item.ingredient_id,
        row_key: item.row_key, food_product_id: item.food_product_id,
        food_product_nutrition_version_id: item.food_product_nutrition_version_id })
      || rowKeys.has(item.row_key)) {
      return { ok: false, fields: [{ field: `sources[${index}]`, reason: "invalid_source_identity" }] };
    }
    rowKeys.add(item.row_key);
    sources.push({ row_key: item.row_key, ingredient_id: item.ingredient_id,
      food_product_id: item.food_product_id, food_product_nutrition_version_id: item.food_product_nutrition_version_id });
  }
  return { ok: true, sources };
}

export function projectRecipeQuantityContext(value: unknown, source: RecipeQuantitySource): RecipeIngredientQuantityContext | null {
  if (!record(value) || typeof value.ready !== "boolean"
    || value.context_sha256 !== undefined && (typeof value.context_sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(value.context_sha256))
    || value.ready && typeof value.context_sha256 !== "string") return null;
  const context: RecipeIngredientQuantityContext = { ready: value.ready };
  if (typeof value.context_sha256 === "string") context.context_sha256 = value.context_sha256;
  if (value.raw_default_unit !== undefined) {
    if (source.food_product_id || value.raw_default_unit !== "g" && value.raw_default_unit !== "mL") return null;
    context.raw_default_unit = value.raw_default_unit;
  }
  if (value.options !== undefined) {
    const options = value.options;
    if (!record(options) || options.policy_version !== "ingredient-units-v4" || typeof options.profile_id !== "string"
      || !(options.preparation_state === null || typeof options.preparation_state === "string")
      || typeof options.default_unit !== "string" || !Array.isArray(options.choices) || options.choices.length > 32) return null;
    const choices: IngredientQuantityOptions["choices"] = [];
    for (const choice of options.choices) {
      if (!record(choice) || typeof choice.unit !== "string" || !choice.unit
        || choice.quality !== "direct" && choice.quality !== "estimated" && choice.quality !== "unavailable"
        || !(choice.reason === null || typeof choice.reason === "string")) return null;
      let normalized: IngredientQuantityOptions["choices"][number]["normalized"] = null;
      if (choice.normalized !== null) {
        const quantity = choice.normalized;
        if (!record(quantity) || typeof quantity.amount !== "number" || !Number.isFinite(quantity.amount) || quantity.amount <= 0
          || quantity.unit !== "g" && quantity.unit !== "ml") return null;
        normalized = { amount: quantity.amount, unit: quantity.unit };
      }
      choices.push({ unit: choice.unit, normalized, quality: choice.quality, reason: choice.reason });
    }
    context.options = { policy_version: "ingredient-units-v4", profile_id: options.profile_id,
      preparation_state: options.preparation_state, default_unit: options.default_unit, choices };
  }
  if (value.product !== undefined) {
    const product = value.product;
    if (!record(product) || product.id !== source.food_product_id || product.nutrition_version_id !== source.food_product_nutrition_version_id
      || typeof product.id !== "string" || typeof product.nutrition_version_id !== "string" || !Array.isArray(product.basis_relations)
      || product.basis_unit !== "g" && product.basis_unit !== "ml" && product.basis_unit !== "serving" && product.basis_unit !== "package") return null;
    const relations: NonNullable<RecipeIngredientQuantityContext["product"]>["basis_relations"] = [];
    for (const relation of product.basis_relations) {
      if (!record(relation) || !record(relation.from) || !record(relation.to)
        || typeof relation.from.amount !== "number" || !Number.isFinite(relation.from.amount) || relation.from.amount <= 0
        || typeof relation.to.amount !== "number" || !Number.isFinite(relation.to.amount) || relation.to.amount <= 0
        || relation.from.unit !== "g" && relation.from.unit !== "ml" && relation.from.unit !== "serving" && relation.from.unit !== "package"
        || relation.to.unit !== "g" && relation.to.unit !== "ml" && relation.to.unit !== "serving" && relation.to.unit !== "package") return null;
      relations.push({ from: { amount: relation.from.amount, unit: relation.from.unit }, to: { amount: relation.to.amount, unit: relation.to.unit } });
    }
    context.product = { id: product.id, nutrition_version_id: product.nutrition_version_id, basis_unit: product.basis_unit, basis_relations: relations };
  }
  if (context.ready && (source.food_product_id ? !context.product || context.options : (!context.options && !context.raw_default_unit) || context.product)) return null;
  return context;
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}
function unitSource(value: unknown): value is IngredientUnitSource {
  return record(value) && ["id", "provider", "dataset", "source_version", "license", "source_url", "review_status", "freshness_status"]
    .every(key => typeof value[key] === "string") && typeof value.is_active === "boolean"
    && (value.data_basis_date === null || typeof value.data_basis_date === "string");
}
function unitContext(value: unknown): value is IngredientUnitContext {
  if (!record(value) || value.edible_portion_basis !== "edible" && value.edible_portion_basis !== "as_purchased") return false;
  for (const kind of ["densities", "pieces"] as const) {
    if (!Array.isArray(value[kind]) || value[kind].length > 200) return false;
    for (const row of value[kind]) {
      if (!record(row) || typeof row.id !== "string" || typeof row.ingredient_id !== "string" || typeof row.preparation_state !== "string"
        || row.edible_portion_basis !== "edible" && row.edible_portion_basis !== "as_purchased"
        || row.quality !== "measured" && row.quality !== "average"
        || typeof row.review_status !== "string" || typeof row.is_active !== "boolean" || !unitSource(row.source)) return false;
      if (kind === "densities" ? row.kind !== "density" || !positive(row.grams_per_ml)
        : row.kind !== "piece" || typeof row.physical_unit !== "string" || typeof row.size_code !== "string"
          || typeof row.observed_unit !== "string" || !positive(row.weight_g) || !positive(row.observed_amount) || !positive(row.observed_weight_g)) return false;
    }
  }
  return true;
}

/** Exact server predecessors only. A raw draft cannot assert evidence or approval. */
export async function hydrateRecipeQuantityNutrition(client: RecipeProductNutritionClient,
  pins: Array<{ id: string; ingredient_id: string | null; food_product_id?: string | null; food_product_nutrition_version_id?: string | null }>,
  ingredients: RecipeNutritionIngredientInput[], owner: string | undefined) {
  const result = await client.rpc("read_recipe_product_nutrition_predecessors", {
    p_owner_uuid: owner ?? null, p_ingredients: pins.map(pin => ({ ...pin, quantity_policy_version: "quantity-v4" })),
  });
  if (result.error || !Array.isArray(result.data) || result.data.length !== pins.length) throw new Error("RECIPE_QUANTITY_CONTEXT_READ_FAILED");
  const hashes = new Map<string, string>();
  const contexts = new Map<string, { preparation_state: string | null; size_code: string | null; unit_context?: IngredientUnitContext }>();
  for (const [index, row] of result.data.entries()) {
    if (!record(row) || row.id !== pins[index].id || !record(row.recipe_quantity_predecessor)
      || typeof row.recipe_quantity_predecessor.guard_hash !== "string" || !/^[0-9a-f]{64}$/u.test(row.recipe_quantity_predecessor.guard_hash)) {
      throw new Error("RECIPE_QUANTITY_CONTEXT_READ_FAILED");
    }
    hashes.set(pins[index].id, row.recipe_quantity_predecessor.guard_hash);
    if (pins[index].food_product_id) continue;
    const context = row.recipe_quantity_predecessor.context;
    if (context === null) { contexts.set(pins[index].id, { preparation_state: null, size_code: null }); continue; }
    if (!record(context) || context.ingredient_id !== pins[index].ingredient_id
      || !(context.preparation_state === null || typeof context.preparation_state === "string")
      || !(context.size_code === null || typeof context.size_code === "string")) throw new Error("RECIPE_QUANTITY_CONTEXT_READ_FAILED");
    // Missing reviewed edible-portion metadata keeps measurements unavailable.
    // Direct mass/volume does not require such a measurement.
    if (!record(context.unit_context)) throw new Error("RECIPE_QUANTITY_CONTEXT_READ_FAILED");
    if (context.unit_context.edible_portion_basis === null) contexts.set(pins[index].id, { preparation_state: context.preparation_state, size_code: context.size_code });
    else {
      const measurementContext = { ...context.unit_context };
      for (const kind of ["densities", "pieces"] as const) {
        const rows = measurementContext[kind];
        if (!Array.isArray(rows)) throw new Error("RECIPE_QUANTITY_CONTEXT_READ_FAILED");
        // Approved measurements may still lack reviewed v4 quality/portion/count
        // metadata. The SQL resolver excludes them too; never upgrade null facts.
        measurementContext[kind] = rows.filter(row => record(row)
          && (row.quality === "measured" || row.quality === "average")
          && (row.edible_portion_basis === "edible" || row.edible_portion_basis === "as_purchased")
          && (kind !== "pieces" || typeof row.physical_unit === "string"));
      }
      if (!unitContext(measurementContext)) throw new Error("RECIPE_QUANTITY_CONTEXT_READ_FAILED");
      contexts.set(pins[index].id, { preparation_state: context.preparation_state, size_code: context.size_code, unit_context: measurementContext });
    }
  }
  return { hashes, ingredients: ingredients.map(ingredient => {
    const context = contexts.get(ingredient.id);
    return context ? { ...ingredient, ...context, conversion_assignment: null, piece_weight: null } : ingredient;
  }) };
}

export function recipeQuantityWriteFailure(request: Request, rows: unknown[]): Response | null {
  const withInput = rows.filter(row => record(row) && Object.hasOwn(row, "quantity_input"));
  if (!withInput.length) return null;
  if (!quantityInputWriteEnabled(request)) return fail("VALIDATION_ERROR", "지금은 새 수량 정보를 저장할 수 없어요. 원입력은 유지돼요.", 422,
    [{ field: "ingredients.quantity_input", reason: "quantity_contract_inactive" }]);
  for (const row of withInput) {
    if (!record(row) || !isRecipeQuantityInputDraft(row.quantity_input, {
      amount: typeof row.amount === "number" ? row.amount : null, unit: typeof row.unit === "string" ? row.unit : null,
      ingredient_type: typeof row.ingredient_type === "string" ? row.ingredient_type : "QUANT",
      food_product_nutrition_version_id: typeof row.food_product_nutrition_version_id === "string" ? row.food_product_nutrition_version_id : null,
    })) return fail("VALIDATION_ERROR", "재료의 원문 수량을 확인해 주세요.", 422,
      [{ field: "ingredients.quantity_input", reason: "invalid_raw_quantity" }]);
  }
  return null;
}
