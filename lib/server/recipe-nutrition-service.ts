import { hydrateRecipeQuantityNutrition } from "@/lib/server/recipe-quantity-input";
import { RECIPE_NUTRITION_EXPLICIT_UNIT_VERSION } from "@/lib/nutrition/recipe-nutrition-calculator";
import { addRecipeProductNutritionGuard, hydrateRecipeProductNutrition, type RecipeProductNutritionClient } from "@/lib/server/recipe-product-nutrition";
import {
  calculateRecipeNutrition,
} from "@/lib/nutrition/recipe-nutrition-calculator";
import { writeRecipeNutritionSnapshot } from "@/lib/server/recipe-nutrition-snapshot";
import type { AccountGenerationBootstrapSessionAuthority } from "@/lib/server/account-generation/session-authority";
import { readRecipeQuantityMode } from "@/lib/server/recipe-snapshot-entrypoint";
import {
  buildRecipeNutritionInputGuard,
  hydrateRecipeNutritionIngredients,
  loadRecipeNutritionPredecessors,
} from "@/scripts/lib/recipe-nutrition-predecessor.mjs";

interface RecipeNutritionRecipeRow {
  id: string;
  base_servings: number;
  updated_at: string;
  created_by?: string | null;
  revision?: number;
}

interface RecipeNutritionIngredientRow {
  id: string;
  ingredient_id: string | null;
  amount: number | null;
  unit: string | null;
  ingredient_type: "QUANT" | "TO_TASTE";
  scalable: boolean;
  sort_order: number;
  quantity_input?: unknown;
  food_product_id?: string | null;
  food_product_nutrition_version_id?: string | null;
}

interface MaybeSingleQuery<T> {
  select(columns: string): MaybeSingleQuery<T>;
  eq(column: string, value: string): MaybeSingleQuery<T>;
  maybeSingle(): PromiseLike<{ data: T | null; error: unknown }>;
}

interface ListQuery<T> extends PromiseLike<{ data: T[] | null; error: unknown }> {
  select(columns: string): ListQuery<T>;
  in(column: string, values: string[]): ListQuery<T>;
  eq(column: string, value: string | boolean): ListQuery<T>;
  order(column: string, options: { ascending: boolean }): ListQuery<T>;
  range(from: number, to: number): ListQuery<T>;
}

interface IngredientQuery {
  select(columns: string): IngredientQuery;
  eq(column: string, value: string): IngredientQuery;
  order(
    column: string,
    options: { ascending: boolean },
  ): PromiseLike<{ data: RecipeNutritionIngredientRow[] | null; error: unknown }>;
}

export interface RecipeNutritionServiceClient {
  from(table: "recipes"): MaybeSingleQuery<RecipeNutritionRecipeRow>;
  from(table: "recipe_ingredients"): IngredientQuery;
  from(table: "ingredient_nutrition_profiles"): ListQuery<Record<string, unknown>>;
  from(table: "ingredient_conversion_assignments"): ListQuery<Record<string, unknown>>;
  rpc(
    functionName: "write_recipe_nutrition_snapshot",
    args: {
      p_recipe_id: string;
      p_snapshot: Record<string, unknown>;
      p_expected_recipe_updated_at: string;
      p_input_guard: Record<string, unknown>;
    },
  ): PromiseLike<{
    data: { snapshot_id: string; created: boolean; is_current: boolean } | null;
    error: unknown;
  }>;
}

export class RecipeNutritionServiceError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "RecipeNutritionServiceError";
  }
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidRecipe(
  row: RecipeNutritionRecipeRow | null,
  recipeId: string,
): row is RecipeNutritionRecipeRow {
  return row !== null &&
    row.id === recipeId &&
    Number.isFinite(row.base_servings) &&
    row.base_servings > 0 &&
    isNonEmptyText(row.updated_at);
}

function isValidIngredient(row: RecipeNutritionIngredientRow) {
  if (!isNonEmptyText(row.id)) return false;
  const product = row.food_product_id ?? null;
  const version = row.food_product_nutrition_version_id ?? null;
  if ((product === null) !== (version === null)) return false;
  if (product ? !isNonEmptyText(product) || !isNonEmptyText(version) : !isNonEmptyText(row.ingredient_id)) return false;
  if (!Number.isInteger(row.sort_order) || typeof row.scalable !== "boolean") return false;
  if (row.ingredient_type === "TO_TASTE") {
    return row.amount === null && row.unit === null && row.scalable === false;
  }
  return row.ingredient_type === "QUANT" &&
    typeof row.amount === "number" &&
    Number.isFinite(row.amount) &&
    row.amount > 0 &&
    isNonEmptyText(row.unit);
}

export async function prepareRecipeNutritionSnapshot(
  dbClient: RecipeNutritionServiceClient,
  recipeId: string,
  predecessorClient: Pick<RecipeNutritionServiceClient, "from"> & RecipeProductNutritionClient = dbClient,
  sessionAuthority?: AccountGenerationBootstrapSessionAuthority,
) {
  if (!isNonEmptyText(recipeId)) {
    throw new RecipeNutritionServiceError("INVALID_RECIPE_NUTRITION_INPUT");
  }

  const [recipeResult, ingredientsResult] = await Promise.all([
    dbClient
      .from("recipes")
      .select("id, base_servings, updated_at, created_by, revision")
      .eq("id", recipeId)
      .maybeSingle(),
    dbClient
      .from("recipe_ingredients")
      .select("id, ingredient_id, amount, unit, ingredient_type, scalable, sort_order, quantity_input, food_product_id, food_product_nutrition_version_id")
      .eq("recipe_id", recipeId)
      .order("sort_order", { ascending: true }),
  ]);

  if (recipeResult.error || ingredientsResult.error) {
    throw new RecipeNutritionServiceError("RECIPE_NUTRITION_INPUT_READ_FAILED");
  }
  if (!isValidRecipe(recipeResult.data, recipeId) ||
    !ingredientsResult.data ||
    ingredientsResult.data.some((ingredient) => !isValidIngredient(ingredient))) {
    throw new RecipeNutritionServiceError("INVALID_RECIPE_NUTRITION_INPUT");
  }

  // Ingredient quantities remain subject to the caller's recipe ownership.
  // Approved nutrition evidence is internal-only; publication supplies its
  // existing scoped reader instead of mistaking RLS-filtered rows for missing data.
  let predecessors;
  try {
    predecessors = await loadRecipeNutritionPredecessors(
      predecessorClient,
      ingredientsResult.data.flatMap((ingredient) => ingredient.food_product_id || !ingredient.ingredient_id ? [] : [ingredient.ingredient_id]),
    );
  } catch {
    throw new RecipeNutritionServiceError("RECIPE_NUTRITION_INPUT_READ_FAILED");
  }

  let productHydration;
  try {
    productHydration = await hydrateRecipeProductNutrition(
      predecessorClient,
      ingredientsResult.data,
      hydrateRecipeNutritionIngredients(ingredientsResult.data, predecessors),
      recipeResult.data.created_by,
    );
  } catch {
    throw new RecipeNutritionServiceError("RECIPE_NUTRITION_INPUT_READ_FAILED");
  }
  let quantityV4: boolean;
  let quantityRecipeRevision: number | undefined;
  if (sessionAuthority) {
    if (recipeResult.data.created_by !== sessionAuthority.ownerUuid) {
      throw new RecipeNutritionServiceError("RESOURCE_NOT_FOUND");
    }
    const revision = recipeResult.data.revision;
    if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision <= 0) {
      throw new RecipeNutritionServiceError("UNIT_CONTEXT_STALE");
    }
    // Publication's existing scope permits this owner/gen/session reader.
    // The service-only guard builder has no HTTP path in that scope.
    quantityV4 = await readRecipeQuantityMode({ client: predecessorClient,
      sessionAuthority, recipeId, expectedRevision: revision });
    if (quantityV4) quantityRecipeRevision = revision;
  } else {
    const modeRead = await predecessorClient.rpc("build_recipe_nutrition_input_guard", { p_recipe_id: recipeId });
    const mode = modeRead.data;
    if (modeRead.error || !mode || typeof mode !== "object" || !("recipe_ingredients" in mode)
      || !Array.isArray(mode.recipe_ingredients)) throw new RecipeNutritionServiceError("UNIT_CONTEXT_STALE");
    quantityV4 = false;
    if ("quantity_policy_version" in mode) {
      if (!("quantity_recipe_revision" in mode) || mode.quantity_policy_version !== "quantity-v4"
        || mode.quantity_recipe_revision !== recipeResult.data.revision) throw new RecipeNutritionServiceError("UNIT_CONTEXT_STALE");
      quantityRecipeRevision = recipeResult.data.revision;
      quantityV4 = true;
    }
  }
  if (!quantityV4 && ingredientsResult.data.some(row => row.quantity_input !== null && row.quantity_input !== undefined)) {
    throw new RecipeNutritionServiceError("UNIT_CONTEXT_STALE");
  }
  let quantityHydration;
  try {
    quantityHydration = quantityV4 ? await hydrateRecipeQuantityNutrition(predecessorClient, ingredientsResult.data,
      productHydration.ingredients, recipeResult.data.created_by ?? undefined) : null;
  } catch { throw new RecipeNutritionServiceError("RECIPE_NUTRITION_INPUT_READ_FAILED"); }
  const calculation = calculateRecipeNutrition({
    recipe_id: recipeId,
    recipe_version: recipeResult.data.updated_at,
    base_servings: recipeResult.data.base_servings,
    ingredients: quantityHydration?.ingredients ?? productHydration.ingredients,
    calculation_version: quantityV4 ? RECIPE_NUTRITION_EXPLICIT_UNIT_VERSION : undefined,
  });

  const guard = addRecipeProductNutritionGuard(
    buildRecipeNutritionInputGuard(ingredientsResult.data, predecessors), ingredientsResult.data, productHydration.predecessors);
  if (quantityHydration) {
    Object.assign(guard, { quantity_policy_version: "quantity-v4", quantity_recipe_revision: quantityRecipeRevision });
  }
  if (quantityHydration && Array.isArray(guard.recipe_ingredients)) {
    guard.recipe_ingredients = guard.recipe_ingredients.map(row => ({ ...row,
      recipe_quantity_context_sha256: quantityHydration.hashes.get(String(row.id)) }));
  }
  return {
    calculation,
    expectedRecipeVersion: recipeResult.data.updated_at,
    inputGuard: guard,
  };
}

export async function recalculateRecipeNutritionSnapshot(
  dbClient: RecipeNutritionServiceClient,
  recipeId: string,
  options: { calculatedAt?: string } = {},
) {
  const prepared = await prepareRecipeNutritionSnapshot(dbClient, recipeId);
  return writeRecipeNutritionSnapshot(dbClient, recipeId, prepared.calculation, {
    ...options,
    expectedRecipeVersion: prepared.expectedRecipeVersion,
    inputGuard: prepared.inputGuard,
  });
}
