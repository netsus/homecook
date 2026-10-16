import { describe, expect, it } from "vitest";
import { calculateRecipeNutrition, type RecipeNutritionIngredientInput } from "@/lib/nutrition/recipe-nutrition-calculator";
import { density, piece, volumeDefinition } from "./fixtures/ingredient-quantity-v4";

function ingredient(unit: string): RecipeNutritionIngredientInput {
  const source = { id: "source", provider: "fixture", dataset: "synthetic", source_version: "1",
    data_basis_date: null, license: "test", source_url: "https://example.test", review_status: "approved",
    freshness_status: "current", is_active: true };
  return {
    id: "row", ingredient_id: "garlic", amount: 1, unit, ingredient_type: "QUANT", scalable: true,
    preparation_state: "raw", size_code: "medium",
    nutrition: {
      link: { id: "link", review_status: "approved", is_active: true, is_primary: true, preparation_state: "raw" },
      profile: { id: "profile", basis_amount: 100, basis_unit: "g", review_status: "approved", is_active: true,
        values: { energy_kcal: { amount: 100, value_status: "observed" } } }, source,
    },
    conversion_assignment: { id: "density", ingredient_id: "garlic", preparation_state: "raw",
      review_status: "approved", is_active: true,
      profile: { code: "fixture", basis_volume_ml: 15, representative_weight_g: 15, is_active: true },
      evidence: { normalized_g_per_15ml: 15, review_status: "approved", is_active: true, source } },
    piece_weight: { id: "piece", ingredient_id: "garlic", evidence_id: "piece-evidence", size_code: "medium",
      preparation_state: "raw", weight_g: 3, review_status: "approved", is_active: true,
      evidence: { id: "piece-evidence", evidence_kind: "piece_weight", preparation_state: "raw", size_code: "medium",
        source_observed_amount: 1, source_observed_unit: "알", observed_weight_g: 3,
        review_status: "approved", is_active: true, source } },
  };
}

describe("explicit v4 quantity policy without changing v3 snapshots", () => {
  it.each(["cup", "스푼", "통"])("does not guess a definition for raw %s in v4", (unit) => {
    const row = ingredient(unit);
    const input = { recipe_id: "fixture", recipe_version: 1, base_servings: 1, ingredients: [row] };
    const before = structuredClone(row);
    const legacy = calculateRecipeNutrition(input);
    const strict = calculateRecipeNutrition({ ...input, calculation_version: "recipe-nutrition-v4" });
    expect(legacy.values.energy_kcal.status).toBe("complete");
    expect(strict.values.energy_kcal.status).toBe("unavailable");
    expect(strict.values.energy_kcal.amount).toBeNull();
    expect(row).toEqual(before);
    expect(calculateRecipeNutrition(input)).toEqual(legacy);
  });
  it("uses the explicit source cup and own density in the actual calculator, recording both sources and v4 hash", () => {
    const row = ingredient("cup");
    row.unit_context = { edible_portion_basis: "edible", source_id: "source", volume_definitions: [volumeDefinition("cup", 240)],
      densities: [{ ...density, ingredient_id: "garlic" }] };
    const input = { recipe_id: "fixture", recipe_version: 1, base_servings: 1, ingredients: [row] };
    const strict = calculateRecipeNutrition({ ...input, calculation_version: "recipe-nutrition-v4" });
    expect(strict.values.energy_kcal.amount).toBeCloseTo(247.2);
    expect(strict.sources).toHaveLength(2);
    expect(strict.calculation_version).toBe("recipe-nutrition-v4");
    expect(calculateRecipeNutrition(input).values.energy_kcal.amount).toBe(200);
    const changed = structuredClone(row); changed.unit_context!.volume_definitions![0].source.source_version = "2";
    expect(calculateRecipeNutrition({ ...input, calculation_version: "recipe-nutrition-v4", ingredients: [changed] }).input_hash)
      .not.toBe(strict.input_hash);
  });
  it("keeps mean physical-unit nutrition estimated and does not fall back to legacy piece evidence", () => {
    const row = ingredient("알");
    row.unit_context = { edible_portion_basis: "edible", pieces: [{ ...piece, ingredient_id: "garlic" }] };
    const input = { recipe_id: "fixture", recipe_version: 1, base_servings: 1,
      calculation_version: "recipe-nutrition-v4", ingredients: [row] };
    expect(calculateRecipeNutrition(input)).toMatchObject({ calculation_quality: "estimated", warnings: ["UNIT_MEASUREMENT_ESTIMATE_USED"] });
    row.unit = "통";
    expect(calculateRecipeNutrition(input).missing_reasons).toContain("PIECE_IDENTITY_REQUIRED:row");
  });
  it("leaves the existing pinned-product relation path outside the general v4 policy", () => {
    const row = ingredient("package"); row.amount = 0.5;
    row.food_product_id = "product"; row.food_product_nutrition_version_id = "label-version";
    row.product_basis_relations = [{ from: { amount: 1, unit: "package" }, to: { amount: 120, unit: "g" } }];
    const input = { recipe_id: "fixture", recipe_version: 1, base_servings: 1, ingredients: [row] };
    const legacy = calculateRecipeNutrition(input);
    const strict = calculateRecipeNutrition({ ...input, calculation_version: "recipe-nutrition-v4" });
    expect(legacy.values.energy_kcal.amount).toBe(60);
    expect(strict.values).toEqual(legacy.values);
    expect(strict.calculation_quality).toEqual(legacy.calculation_quality);
  });
});
