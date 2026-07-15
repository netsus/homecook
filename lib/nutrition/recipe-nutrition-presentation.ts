import type { RecipeNutrition } from "@/types/recipe";

const CORE_NUTRIENT_CODES = [
  "energy_kcal",
  "carbohydrate_g",
  "protein_g",
  "fat_g",
  "sodium_mg",
] as const;

function buildUnavailableRecipeNutritionForReason(
  availabilityReason: "missing" | "temporarily_unavailable",
): RecipeNutrition {
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
    availability_reason: availabilityReason,
    warnings: availabilityReason === "missing"
      ? ["RECIPE_NUTRITION_SNAPSHOT_MISSING"]
      : [],
    sources: [],
  };
}

export function buildUnavailableRecipeNutrition(): RecipeNutrition {
  return buildUnavailableRecipeNutritionForReason("missing");
}

export function buildTemporarilyUnavailableRecipeNutrition(): RecipeNutrition {
  return buildUnavailableRecipeNutritionForReason("temporarily_unavailable");
}
