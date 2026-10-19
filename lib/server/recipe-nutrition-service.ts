import type { SupabaseClient } from "@supabase/supabase-js";
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

type RecipeNutritionRecipeRow = {
  id: string;
  base_servings: number;
  updated_at: string;
  created_by?: string | null;
  revision?: number;
};

type RecipeNutritionIngredientRow = {
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
};

// Only the owner-row projections consumed below, not a replacement DB schema.
// Keep native query phases and selected-row inference. Insert/Update payloads
// are never, but native builders still expose delete; this is not deep-readonly
// typing or a runtime permission grant. This consumer only issues selects.
type RecipeNutritionReadClient = Pick<SupabaseClient<{
  public: {
    Tables: {
      recipes: {
        Row: RecipeNutritionRecipeRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      recipe_ingredients: {
        Row: RecipeNutritionIngredientRow & { recipe_id: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
  };
}>, "from">;

// Preserve the library's select-builder type instead of requiring query methods
// on from() itself. Predecessor evidence never reads or writes owner recipe rows.
type RecipeNutritionPredecessorTable = Pick<ReturnType<SupabaseClient["from"]>, "select">;

export interface RecipeNutritionPredecessorClient extends RecipeProductNutritionClient {
  from(table: "ingredient_nutrition_profiles" | "ingredient_conversion_assignments" | "piece_unit_weights"): RecipeNutritionPredecessorTable;
}

interface RecipeNutritionWriterClient {
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

export type RecipeNutritionServiceClient =
  RecipeNutritionReadClient & RecipeNutritionPredecessorClient & RecipeNutritionWriterClient;

export class RecipeNutritionServiceError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "RecipeNutritionServiceError";
  }
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidRecipe(
  row: unknown,
  recipeId: string,
): row is RecipeNutritionRecipeRow {
  return isRecord(row) &&
    row.id === recipeId &&
    typeof row.base_servings === "number" &&
    Number.isFinite(row.base_servings) &&
    row.base_servings > 0 &&
    isNonEmptyText(row.updated_at) &&
    (row.created_by === undefined || row.created_by === null || typeof row.created_by === "string") &&
    (row.revision === undefined || typeof row.revision === "number");
}

function isValidIngredient(row: unknown): row is RecipeNutritionIngredientRow {
  if (!isRecord(row) || !isNonEmptyText(row.id)
    || !(row.ingredient_id === null || typeof row.ingredient_id === "string")
    || !(row.food_product_id === undefined || row.food_product_id === null || typeof row.food_product_id === "string")
    || !(row.food_product_nutrition_version_id === undefined || row.food_product_nutrition_version_id === null
      || typeof row.food_product_nutrition_version_id === "string")) return false;
  const product = row.food_product_id ?? null;
  const version = row.food_product_nutrition_version_id ?? null;
  if ((product === null) !== (version === null)) return false;
  if (product ? !isNonEmptyText(product) || !isNonEmptyText(version) : !isNonEmptyText(row.ingredient_id)) return false;
  if (typeof row.sort_order !== "number" || !Number.isInteger(row.sort_order) || typeof row.scalable !== "boolean") return false;
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
  predecessorClient: RecipeNutritionPredecessorClient = dbClient,
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
  return prepareRecipeNutritionSnapshotFromInput({
    recipeId, recipe: recipeResult.data, ingredients: ingredientsResult.data,
    loadPredecessors: ids => loadRecipeNutritionPredecessors(predecessorClient, ids),
    predecessorClient, sessionAuthority,
  });
}

/** Prepare from either SDK-selected rows or an authenticated job bundle.
 * Input rows are validated here; the evidence loader and RPC reader are real
 * consumed capabilities, not a memory object pretending to be an SDK client.
 */
export async function prepareRecipeNutritionSnapshotFromInput({
  recipeId, recipe, ingredients, loadPredecessors, predecessorClient, sessionAuthority,
}: {
  recipeId: string;
  recipe: unknown;
  ingredients: unknown;
  loadPredecessors: (ingredientIds: string[]) => ReturnType<typeof loadRecipeNutritionPredecessors>;
  predecessorClient: RecipeProductNutritionClient;
  sessionAuthority?: AccountGenerationBootstrapSessionAuthority;
}) {
  if (!isNonEmptyText(recipeId) || !isValidRecipe(recipe, recipeId)
    || !Array.isArray(ingredients) || !ingredients.every(isValidIngredient)) {
    throw new RecipeNutritionServiceError("INVALID_RECIPE_NUTRITION_INPUT");
  }

  // Ingredient quantities remain subject to the caller's recipe ownership.
  // Approved nutrition evidence is internal-only; publication supplies its
  // existing scoped reader instead of mistaking RLS-filtered rows for missing data.
  let predecessors;
  try {
    predecessors = await loadPredecessors(
      ingredients.flatMap((ingredient) => ingredient.food_product_id || !ingredient.ingredient_id ? [] : [ingredient.ingredient_id]),
    );
  } catch {
    throw new RecipeNutritionServiceError("RECIPE_NUTRITION_INPUT_READ_FAILED");
  }

  let productHydration;
  try {
    productHydration = await hydrateRecipeProductNutrition(
      predecessorClient,
      ingredients,
      hydrateRecipeNutritionIngredients(ingredients, predecessors),
      recipe.created_by,
    );
  } catch {
    throw new RecipeNutritionServiceError("RECIPE_NUTRITION_INPUT_READ_FAILED");
  }
  let quantityV4: boolean;
  let quantityRecipeRevision: number | undefined;
  if (sessionAuthority) {
    if (recipe.created_by !== sessionAuthority.ownerUuid) {
      throw new RecipeNutritionServiceError("RESOURCE_NOT_FOUND");
    }
    const revision = recipe.revision;
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
        || mode.quantity_recipe_revision !== recipe.revision) throw new RecipeNutritionServiceError("UNIT_CONTEXT_STALE");
      quantityRecipeRevision = recipe.revision;
      quantityV4 = true;
    }
  }
  if (!quantityV4 && ingredients.some(row => row.quantity_input !== null && row.quantity_input !== undefined)) {
    throw new RecipeNutritionServiceError("UNIT_CONTEXT_STALE");
  }
  let quantityHydration;
  try {
    quantityHydration = quantityV4 ? await hydrateRecipeQuantityNutrition(predecessorClient, ingredients,
      productHydration.ingredients, recipe.created_by ?? undefined) : null;
  } catch { throw new RecipeNutritionServiceError("RECIPE_NUTRITION_INPUT_READ_FAILED"); }
  const calculation = calculateRecipeNutrition({
    recipe_id: recipeId,
    recipe_version: recipe.updated_at,
    base_servings: recipe.base_servings,
    ingredients: quantityHydration?.ingredients ?? productHydration.ingredients,
    calculation_version: quantityV4 ? RECIPE_NUTRITION_EXPLICIT_UNIT_VERSION : undefined,
  });

  const guard = addRecipeProductNutritionGuard(
    buildRecipeNutritionInputGuard(ingredients, predecessors), ingredients, productHydration.predecessors);
  if (quantityHydration) {
    Object.assign(guard, { quantity_policy_version: "quantity-v4", quantity_recipe_revision: quantityRecipeRevision });
  }
  if (quantityHydration && Array.isArray(guard.recipe_ingredients)) {
    guard.recipe_ingredients = guard.recipe_ingredients.map(row => ({ ...row,
      recipe_quantity_context_sha256: quantityHydration.hashes.get(String(row.id)) }));
  }
  return {
    calculation,
    expectedRecipeVersion: recipe.updated_at,
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
