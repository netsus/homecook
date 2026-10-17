import { calculateRecipeNutrition, type RecipeNutritionIngredientInput } from "@/lib/nutrition/recipe-nutrition-calculator";
import { buildUnavailableRecipeNutrition } from "@/lib/nutrition/recipe-nutrition-presentation";
import { hydrateRecipeNutritionIngredients, loadRecipeNutritionPredecessors } from "@/scripts/lib/recipe-nutrition-predecessor.mjs";
import type { RecipeIngredient, RecipeNutrition } from "@/types/recipe";

/** Only call after the public canonical bridge has authorized/projected the rows.
 * No owner records are queried and no GET request writes a nutrition snapshot. */
export async function calculatePublicYoutubeRecipeNutrition({ client, recipeId, revision, baseServings, ingredients }: {
  client: { from(table: string): unknown };
  recipeId: string;
  revision: number;
  baseServings: number;
  ingredients: RecipeIngredient[];
}): Promise<RecipeNutrition> {
  if (!ingredients.length || ingredients.length > 200 || !Number.isFinite(baseServings) || baseServings <= 0
    || !Number.isSafeInteger(revision) || revision <= 0) return buildUnavailableRecipeNutrition();
  // Quantity-v4 pins require their own reviewed context. Never reinterpret them
  // through the older household-spoon aliases, or treat a product as a generic.
  if (ingredients.some(row => row.quantity_input || row.food_product_id || row.food_product_nutrition_version_id)) return buildUnavailableRecipeNutrition();
  const rows: RecipeNutritionIngredientInput[] = ingredients.map(row => ({
    id: row.id, ingredient_id: row.ingredient_id, amount: row.amount, unit: row.unit,
    ingredient_type: row.ingredient_type, scalable: row.scalable, preparation_state: null,
  }));
  const ids = [...new Set(rows.flatMap(row => row.ingredient_id ? [row.ingredient_id] : []))];
  const predecessors = await loadRecipeNutritionPredecessors(client, ids);
  const calculation = calculateRecipeNutrition({ recipe_id: recipeId, recipe_version: `revision:${revision}`,
    base_servings: baseServings, ingredients: hydrateRecipeNutritionIngredients(rows, predecessors) });
  return { basis: calculation.basis, base_servings: calculation.base_servings,
    values: calculation.values, scalable_values: calculation.scalable_values, fixed_values: calculation.fixed_values,
    calculation_status: calculation.calculation_status, calculation_quality: calculation.calculation_quality,
    reflected_ingredient_count: calculation.reflected_ingredient_count, target_ingredient_count: calculation.target_ingredient_count,
    warnings: calculation.warnings, sources: calculation.sources, availability_reason: null, calculated_at: new Date().toISOString() };
}
