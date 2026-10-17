import { calculateRecipeNutrition, RECIPE_NUTRITION_EXPLICIT_UNIT_VERSION, type RecipeNutritionIngredientInput } from "@/lib/nutrition/recipe-nutrition-calculator";
import { savedQuantitySnapshot } from "@/lib/youtube-saved-quantity-input";
import { parseQuantityInput } from "@/lib/quantity-input";
import { buildUnavailableRecipeNutrition } from "@/lib/nutrition/recipe-nutrition-presentation";
import { hydrateRecipeNutritionIngredients, loadRecipeNutritionPredecessors } from "@/scripts/lib/recipe-nutrition-predecessor.mjs";
import type { RecipeIngredient, RecipeNutrition } from "@/types/recipe";

// A frozen count/spoon estimate cannot become a verified gram input merely
// because the display row contains grams. Recover only exact mass/volume units.
function hasExactFrozenQuantity(row: RecipeIngredient): boolean {
  if (!row.quantity_input) return true;
  const snapshot = savedQuantitySnapshot(row.quantity_input, row.amount, row.unit);
  if (!snapshot || snapshot.quality !== "direct" || snapshot.reason !== null || !snapshot.normalized || snapshot.batch_basis !== null) return false;
  const raw = parseQuantityInput(snapshot.raw_value);
  const units: Record<string, { kind: string; factor: number }> = {
    g: { kind: "mass", factor: 1 }, kg: { kind: "mass", factor: 1000 },
    ml: { kind: "volume", factor: 1 }, mL: { kind: "volume", factor: 1 },
    l: { kind: "volume", factor: 1000 }, L: { kind: "volume", factor: 1000 },
  };
  const from = units[snapshot.raw_unit], to = units[row.unit ?? ""], normalized = units[snapshot.normalized.unit];
  if (!raw || row.amount === null || !from || !to || !normalized || from.kind !== to.kind || from.kind !== normalized.kind) return false;
  const expected = raw.amount * from.factor;
  return Math.abs(expected - row.amount * to.factor) <= Math.max(1, expected) * 1e-12
    && Math.abs(expected - snapshot.normalized.amount * normalized.factor) <= Math.max(1, expected) * 1e-12;
}

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
  if (ingredients.some(row => row.food_product_id || row.food_product_nutrition_version_id)) return buildUnavailableRecipeNutrition();
  const explicitQuantity = ingredients.some(row => Boolean(row.quantity_input));
  const rows: RecipeNutritionIngredientInput[] = ingredients.map(row => ({
    id: row.id, ingredient_id: row.ingredient_id, amount: hasExactFrozenQuantity(row) ? row.amount : null, unit: row.unit,
    ingredient_type: row.ingredient_type, scalable: row.scalable, preparation_state: null,
  }));
  const ids = [...new Set(rows.flatMap(row => row.ingredient_id ? [row.ingredient_id] : []))];
  const predecessors = await loadRecipeNutritionPredecessors(client, ids);
  const calculation = calculateRecipeNutrition({ recipe_id: recipeId, recipe_version: `revision:${revision}`,
    base_servings: baseServings, ingredients: hydrateRecipeNutritionIngredients(rows, predecessors),
    ...(explicitQuantity ? { calculation_version: RECIPE_NUTRITION_EXPLICIT_UNIT_VERSION } : {}) });
  return { basis: calculation.basis, base_servings: calculation.base_servings,
    values: calculation.values, scalable_values: calculation.scalable_values, fixed_values: calculation.fixed_values,
    calculation_status: calculation.calculation_status, calculation_quality: calculation.calculation_quality,
    reflected_ingredient_count: calculation.reflected_ingredient_count, target_ingredient_count: calculation.target_ingredient_count,
    warnings: calculation.warnings, sources: calculation.sources, availability_reason: null, calculated_at: new Date().toISOString() };
}
