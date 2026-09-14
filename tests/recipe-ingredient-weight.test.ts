import { describe, expect, it } from "vitest";

import {
  calculateRecipeIngredientWeightGrams,
  type RecipeNutritionIngredientInput,
} from "@/lib/nutrition/recipe-nutrition-calculator";

function ingredient(
  patch: Partial<RecipeNutritionIngredientInput>,
): RecipeNutritionIngredientInput {
  return {
    id: "ingredient-row",
    ingredient_id: "ingredient-id",
    amount: 100,
    unit: "g",
    ingredient_type: "QUANT",
    scalable: true,
    preparation_state: "default",
    ...patch,
  };
}

describe("recipe ingredient weight", () => {
  it("sums direct mass, approved volume conversion and approved piece weights", () => {
    const approvedSource = {
      id: "source-id",
      provider: "source",
      dataset: "dataset",
      source_version: "v1",
      data_basis_date: null,
      license: "public",
      source_url: "https://example.com",
      review_status: "approved",
      freshness_status: "current",
      is_active: true,
    };

    expect(calculateRecipeIngredientWeightGrams([
      ingredient({ amount: 250, unit: "g" }),
      ingredient({ id: "kg", amount: 0.2, unit: "kg" }),
      ingredient({
        id: "volume",
        amount: 2,
        unit: "tbsp",
        conversion_assignment: {
          id: "conversion",
          ingredient_id: "ingredient-id",
          preparation_state: "default",
          review_status: "approved",
          is_active: true,
          profile: {
            code: "VOLUME_G10",
            basis_volume_ml: 15,
            representative_weight_g: 10,
            is_active: true,
          },
          evidence: {
            normalized_g_per_15ml: 10,
            review_status: "approved",
            is_active: true,
            source: approvedSource,
          },
        },
      }),
      ingredient({
        id: "piece",
        amount: 2,
        unit: "개",
        size_code: "medium",
        piece_weight: {
          id: "piece-weight",
          ingredient_id: "ingredient-id",
          size_code: "medium",
          preparation_state: "default",
          weight_g: 80,
          review_status: "approved",
          is_active: true,
          evidence: {
            review_status: "approved",
            is_active: true,
            source: approvedSource,
          },
        },
      }),
      ingredient({
        id: "to-taste",
        amount: null,
        unit: null,
        ingredient_type: "TO_TASTE",
        scalable: false,
      }),
    ])).toBe(630);
  });

  it("sums the convertible ingredient weights when one ingredient has no approved conversion", () => {
    expect(calculateRecipeIngredientWeightGrams([
      ingredient({ amount: 100, unit: "g" }),
      ingredient({ id: "unknown", amount: 1, unit: "봉" }),
    ])).toBe(100);
  });
});
