import type { RecipeNutrition } from "@/types/recipe";

const CORE_NUTRIENT_CODES = [
  "energy_kcal",
  "carbohydrate_g",
  "protein_g",
  "fat_g",
  "sodium_mg",
] as const;

export function buildUnavailableRecipeNutrition(): RecipeNutrition {
  return {
    basis: { amount: 1, unit: "serving" },
    values: Object.fromEntries(
      CORE_NUTRIENT_CODES.map((code) => [code, {
        amount: null,
        known_amount: null,
        status: "unavailable" as const,
        display_mode: null,
      }]),
    ),
    calculation_status: "unavailable",
    calculation_quality: null,
    warnings: ["RECIPE_NUTRITION_SNAPSHOT_MISSING"],
    sources: [],
  };
}
