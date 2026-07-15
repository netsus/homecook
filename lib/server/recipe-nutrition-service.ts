import {
  calculateRecipeNutrition,
  type RecipeNutritionIngredientInput,
} from "@/lib/nutrition/recipe-nutrition-calculator";
import { writeRecipeNutritionSnapshot } from "@/lib/server/recipe-nutrition-snapshot";

interface RecipeNutritionRecipeRow {
  id: string;
  base_servings: number;
  updated_at: string;
}

interface RecipeNutritionIngredientRow {
  id: string;
  ingredient_id: string;
  amount: number | null;
  unit: string | null;
  ingredient_type: "QUANT" | "TO_TASTE";
  scalable: boolean;
  sort_order: number;
}

interface MaybeSingleQuery<T> {
  select(columns: string): MaybeSingleQuery<T>;
  eq(column: string, value: string): MaybeSingleQuery<T>;
  maybeSingle(): PromiseLike<{ data: T | null; error: unknown }>;
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
  rpc(
    functionName: "write_recipe_nutrition_snapshot",
    args: {
      p_recipe_id: string;
      p_snapshot: Record<string, unknown>;
      p_expected_recipe_updated_at: string;
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
  if (!isNonEmptyText(row.id) || !isNonEmptyText(row.ingredient_id)) return false;
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

function toFailClosedCalculatorIngredient(
  row: RecipeNutritionIngredientRow,
): RecipeNutritionIngredientInput {
  return {
    id: row.id,
    ingredient_id: row.ingredient_id,
    amount: row.amount,
    unit: row.unit,
    ingredient_type: row.ingredient_type,
    scalable: row.scalable,
    preparation_state: null,
    size_code: null,
    edible_state: null,
    nutrition: undefined,
    conversion_assignment: null,
    piece_weight: null,
  };
}

export async function recalculateRecipeNutritionSnapshot(
  dbClient: RecipeNutritionServiceClient,
  recipeId: string,
  options: { calculatedAt?: string } = {},
) {
  if (!isNonEmptyText(recipeId)) {
    throw new RecipeNutritionServiceError("INVALID_RECIPE_NUTRITION_INPUT");
  }

  const [recipeResult, ingredientsResult] = await Promise.all([
    dbClient
      .from("recipes")
      .select("id, base_servings, updated_at")
      .eq("id", recipeId)
      .maybeSingle(),
    dbClient
      .from("recipe_ingredients")
      .select("id, ingredient_id, amount, unit, ingredient_type, scalable, sort_order")
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

  const calculation = calculateRecipeNutrition({
    recipe_id: recipeId,
    recipe_version: recipeResult.data.updated_at,
    base_servings: recipeResult.data.base_servings,
    ingredients: ingredientsResult.data.map(toFailClosedCalculatorIngredient),
  });

  return writeRecipeNutritionSnapshot(dbClient, recipeId, calculation, {
    ...options,
    expectedRecipeVersion: recipeResult.data.updated_at,
  });
}
