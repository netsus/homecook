import type { RecipeIngredientSourceKind } from "@/types/recipe";

export interface RecipeIngredientIdentity {
  ingredient_id: string | null;
  food_product_id?: string | null;
  food_product_nutrition_version_id?: string | null;
  source_kind?: RecipeIngredientSourceKind;
  row_key?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function recipeIngredientSourceKind(row: RecipeIngredientIdentity): RecipeIngredientSourceKind {
  return row.food_product_id ? "food_product" : "ingredient";
}

export function isRecipeIngredientIdentityValid(row: RecipeIngredientIdentity) {
  const product = row.food_product_id ?? null;
  const version = row.food_product_nutrition_version_id ?? null;
  if ((product === null) !== (version === null)) return false;
  if (product !== null && (!UUID.test(product) || version === null || !UUID.test(version))) return false;
  if (row.ingredient_id !== null && !UUID.test(row.ingredient_id)) return false;
  if (!product && row.ingredient_id === null) return false;
  if (row.source_kind !== undefined && row.source_kind !== recipeIngredientSourceKind(row)) return false;
  return row.row_key === undefined || UUID.test(row.row_key);
}

export function recipeIngredientSourceId(row: RecipeIngredientIdentity): string {
  return row.food_product_id ?? row.ingredient_id ?? "";
}
