import { calculateRecipeNutrition, type RecipeNutritionCalculation, type RecipeNutritionIngredientInput } from "@/lib/nutrition/recipe-nutrition-calculator";
import type { IngredientUnitContext } from "@/lib/nutrition/ingredient-quantity";
import { density, piece, volumeDefinition } from "./ingredient-quantity-v4";

export const reasons = ["DENSITY_REQUIRED", "UNIT_DEFINITION_REQUIRED", "UNIT_DEFINITION_CONFLICT", "PIECE_IDENTITY_REQUIRED", "AMBIGUOUS_EVIDENCE"] as const;
const source = { id: "nutrition-source", provider: "nutrition-fixture", dataset: "Nutrition synthetic", source_version: "1",
  data_basis_date: null, license: "test", source_url: "https://example.test/nutrition", review_status: "approved", freshness_status: "current", is_active: true };
function ingredient(id: string, unit: string, amount: number): RecipeNutritionIngredientInput {
  return { id, ingredient_id: "fixture", preparation_state: "raw", size_code: "medium", amount, unit, ingredient_type: "QUANT", scalable: true,
    nutrition: { link: { id: "link", review_status: "approved", is_active: true, is_primary: true, preparation_state: "raw" },
      profile: { id: "profile", basis_amount: 100, basis_unit: "g", review_status: "approved", is_active: true,
        values: Object.fromEntries(["energy_kcal", "carbohydrate_g", "protein_g", "fat_g", "sodium_mg"].map(code => [code, { amount: 100, value_status: "observed" }])) }, source } };
}
export function calculation(reason: typeof reasons[number] | "UNIT_MEASUREMENT_ESTIMATE_USED", withKnown = true) {
  const context: IngredientUnitContext = { edible_portion_basis: "edible", source_id: "source", densities: [], pieces: [] };
  const row = ingredient("unknown-row", "L", 1 / 3);
  if (reason === "UNIT_DEFINITION_REQUIRED") row.unit = "cup";
  if (reason === "UNIT_DEFINITION_CONFLICT") {
    row.unit = "cup";
    context.volume_definitions = [{ ...volumeDefinition("cup", 240), reference_volume_ml: 200 }];
  }
  if (reason === "PIECE_IDENTITY_REQUIRED") row.unit = "알";
  if (reason === "AMBIGUOUS_EVIDENCE") context.densities = [density, { ...density, id: "second-density" }];
  if (reason === "UNIT_MEASUREMENT_ESTIMATE_USED") { row.unit = "알"; context.pieces = [piece]; }
  row.unit_context = context;
  return calculateRecipeNutrition({ recipe_id: "recipe", recipe_version: 1, base_servings: 2, calculation_version: "recipe-nutrition-v4",
    ingredients: withKnown ? [row, ingredient("known-row", "kg", 1 / 7)] : [row] });
}
export function stored(calculation: RecipeNutritionCalculation) {
  return { id: "snapshot", base_servings: calculation.base_servings, scalable_values_json: calculation.scalable_values,
    fixed_values_json: calculation.fixed_values, nutrient_status_json: calculation.values, calculation_status: calculation.calculation_status,
    calculation_quality: calculation.calculation_quality, reflected_ingredient_count: calculation.reflected_ingredient_count,
    target_ingredient_count: calculation.target_ingredient_count, warnings_json: calculation.warnings, sources_json: calculation.sources,
    calculated_at: "2026-10-15T00:00:00Z" };
}
