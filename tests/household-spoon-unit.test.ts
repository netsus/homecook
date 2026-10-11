import { describe, expect, it } from "vitest";
import { pieceSizeCode, pieceUnitFamily } from "@/lib/nutrition/ingredient-piece-units.mjs";
import {
  calculateRecipeIngredientWeightGrams,
  calculateRecipeNutrition,
  type RecipeNutritionIngredientInput,
} from "@/lib/nutrition/recipe-nutrition-calculator";

function soySauce(unit = "밥숟가락", amount = 2): RecipeNutritionIngredientInput {
  const source = {
    id: "approved-measurement-source", provider: "HOMECOOK_USER_STANDARD",
    dataset: "synthetic approved household-spoon estimate", source_version: "1",
    data_basis_date: null, license: "test", source_url: "https://example.test/measurement",
    review_status: "approved", freshness_status: "current", is_active: true,
  };
  return {
    id: "soy-sauce-row", ingredient_id: "soy-sauce", amount, unit,
    ingredient_type: "QUANT", scalable: true, preparation_state: "as_published",
    nutrition: {
      link: { id: "link", review_status: "approved", is_active: true, is_primary: true, preparation_state: "as_published" },
      profile: {
        id: "profile", basis_amount: 100, basis_unit: "g", review_status: "approved", is_active: true,
        values: Object.fromEntries(["energy_kcal", "carbohydrate_g", "protein_g", "fat_g", "sodium_mg"].map(
          code => [code, { amount: 100, value_status: "observed" }],
        )),
      },
      source,
    },
    conversion_assignment: {
      id: "density", ingredient_id: "soy-sauce", preparation_state: "as_published",
      review_status: "approved", is_active: true,
      profile: { code: "soy-sauce", basis_volume_ml: 15, representative_weight_g: 17.7, is_active: true },
      evidence: { normalized_g_per_15ml: 17.7, review_status: "approved", is_active: true, source },
    },
    piece_weight: {
      id: "household-spoon-weight", ingredient_id: "soy-sauce", evidence_id: "household-spoon-evidence",
      size_code: "household_spoon", preparation_state: "as_published", weight_g: 14,
      review_status: "approved", is_active: true,
      evidence: {
        id: "household-spoon-evidence", evidence_kind: "piece_weight", preparation_state: "as_published",
        size_code: "household_spoon", source_observed_amount: 1, source_observed_unit: "밥숟가락",
        observed_weight_g: 14, review_status: "approved", is_active: true, source,
      },
    },
  };
}

function nutrition(ingredient: RecipeNutritionIngredientInput) {
  return calculateRecipeNutrition({ recipe_id: "recipe", recipe_version: 1, base_servings: 1, ingredients: [ingredient] });
}

describe("explicit household-spoon measurements", () => {
  it("uses its own size family and accepts a one-spoon source observation", () => {
    expect(pieceUnitFamily("밥숟가락")).toBe("household_spoon");
    expect(pieceSizeCode("밥숟가락", "medium")).toBe("household_spoon");
    expect(pieceUnitFamily("1밥숟가락")).toBeNull();
    expect(pieceUnitFamily("1 밥숟가락", true)).toBe("household_spoon");
    expect(pieceUnitFamily("2밥숟가락", true)).toBeNull();
    expect(pieceUnitFamily("11밥숟가락", true)).toBeNull();
  });

  it.each(["밥숟가락", "1밥숟가락"])("calculates two spoons as 28g from an approved %s observation", observedUnit => {
    const ingredient = soySauce();
    ingredient.piece_weight!.evidence!.source_observed_unit = observedUnit;
    expect(calculateRecipeIngredientWeightGrams([ingredient])).toBe(28);
    const result = nutrition(ingredient);
    expect(result.values.energy_kcal.amount).toBeCloseTo(28);
    expect(result.calculation_quality).toBe("estimated");
    expect(result.warnings).toContain("PIECE_WEIGHT_CONVERSION_USED");
    expect(ingredient).toMatchObject({ amount: 2, unit: "밥숟가락" });
  });

  it.each(["T", "큰술", "tbsp", "스푼", "숟가락", "숟갈", "밥숟갈", "왕큰술"])("keeps legacy %s at 15ml per spoon", unit => {
    expect(pieceUnitFamily(unit)).toBeNull();
    const ingredient = soySauce(unit);
    expect(calculateRecipeIngredientWeightGrams([ingredient])).toBeCloseTo(35.4);
    expect(nutrition(ingredient).values.energy_kcal.amount).toBeCloseTo(35.4);
  });

  it.each(["개", "줌", "숟가락"])("rejects a %s observation for the household-spoon family", observedUnit => {
    const ingredient = soySauce();
    ingredient.piece_weight!.evidence!.source_observed_unit = observedUnit;
    expect(calculateRecipeIngredientWeightGrams([ingredient])).toBeNull();
    expect(nutrition(ingredient).missing_reasons).toContain("PIECE_WEIGHT_REQUIRED:soy-sauce-row");
  });

  it("does not fall back to 15ml or an unapproved/foreign ingredient measurement", () => {
    for (const mutation of ["missing", "pending", "different-ingredient", "multi-spoon"] as const) {
      const ingredient = soySauce();
      if (mutation === "missing") ingredient.piece_weight = null;
      if (mutation === "pending") ingredient.piece_weight!.review_status = "pending";
      if (mutation === "different-ingredient") ingredient.piece_weight!.ingredient_id = "other";
      if (mutation === "multi-spoon") ingredient.piece_weight!.evidence!.source_observed_amount = 2;
      expect(calculateRecipeIngredientWeightGrams([ingredient]), mutation).toBeNull();
      expect(nutrition(ingredient).missing_reasons, mutation).toContain("PIECE_WEIGHT_REQUIRED:soy-sauce-row");
    }
  });

  it("keeps direct gram quantities independent from spoon estimates", () => {
    const ingredient = soySauce("g", 99);
    expect(calculateRecipeIngredientWeightGrams([ingredient])).toBe(99);
    expect(nutrition(ingredient).values.energy_kcal.amount).toBe(99);
    expect(nutrition(ingredient).calculation_quality).toBe("direct");
  });
});
