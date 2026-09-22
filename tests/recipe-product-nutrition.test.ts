import { describe, expect, it, vi } from "vitest";
import {
  calculateRecipeNutrition,
  type RecipeNutritionIngredientInput,
} from "@/lib/nutrition/recipe-nutrition-calculator";
import { hydrateRecipeProductNutrition } from "@/lib/server/recipe-product-nutrition";
import { hydrateRecipeNutritionIngredients } from "@/scripts/lib/recipe-nutrition-predecessor.mjs";

const source = {
  id: "source", provider: "MFDS", dataset: "label", source_version: "1",
  data_basis_date: null, license: "Open", source_url: "https://example.test/label",
  review_status: "approved", freshness_status: "current", is_active: true,
};
function nutrition(energy: number): NonNullable<RecipeNutritionIngredientInput["nutrition"]> {
  return {
    link: { id: "link", review_status: "approved", is_active: true, is_primary: true, preparation_state: "raw" },
    profile: { id: `profile-${energy}`, basis_amount: 100, basis_unit: "g", review_status: "approved", is_active: true,
      values: Object.fromEntries(["energy_kcal", "carbohydrate_g", "protein_g", "fat_g", "sodium_mg"].map((code) =>
        [code, { amount: code === "energy_kcal" ? energy : 10, value_status: "observed" }])) },
    source,
  };
}
function row(): RecipeNutritionIngredientInput {
  return {
    id: "row", ingredient_id: "generic", amount: 50, unit: "g", ingredient_type: "QUANT",
    scalable: true, preparation_state: "raw", nutrition: nutrition(100),
    food_product_id: "product", food_product_nutrition_version_id: "saved-version",
  };
}
const predecessor = {
  nutrition: nutrition(300),
  basis_relations: [{ from: { amount: 1, unit: "package" }, to: { amount: 200, unit: "g" } }],
};
function calculate(ingredients: RecipeNutritionIngredientInput[]) {
  return calculateRecipeNutrition({ recipe_id: "recipe", recipe_version: "1", base_servings: 2, ingredients });
}

describe("pinned product recipe nutrition", () => {
  it("uses the selected product version, not the generic ingredient, and preserves fixed/scalable contributions", async () => {
    const scalable = row();
    const fixed = { ...row(), id: "fixed", amount: 0.5, unit: "package", scalable: false };
    const client = { rpc: vi.fn(async () => ({ data: [
      { id: "row", product_predecessor: predecessor },
      { id: "fixed", product_predecessor: predecessor },
    ], error: null })) };
    const hydrated = await hydrateRecipeProductNutrition(client, [scalable, fixed], [scalable, fixed], "owner");
    expect(client.rpc).toHaveBeenCalledWith("read_recipe_product_nutrition_predecessors", expect.objectContaining({
      p_owner_uuid: "owner", p_ingredients: [
        expect.objectContaining({ food_product_nutrition_version_id: "saved-version" }),
        expect.objectContaining({ food_product_nutrition_version_id: "saved-version" }),
      ],
    }));
    const result = calculate(hydrated.ingredients);
    expect(result.values.energy_kcal.amount).toBe(450);
    expect(result.scalable_values.energy_kcal).toBe(150);
    expect(result.fixed_values.energy_kcal).toBe(300);
    expect(result.calculation_status).toBe("complete");
  });

  it("retains approved inactive historical labels while refusing revoked labels", () => {
    const historical = {
      ...row(), product_basis_relations: [], nutrition: nutrition(300),
    };
    historical.nutrition.profile.is_active = false;
    expect(calculate([historical]).values.energy_kcal.amount).toBe(150);
    historical.nutrition.profile.review_status = "revoked";
    expect(calculate([historical]).calculation_status).toBe("unavailable");
    const generic = { ...historical, food_product_id: null, food_product_nutrition_version_id: null };
    generic.nutrition.profile.review_status = "approved";
    expect(calculate([generic]).calculation_status).toBe("unavailable");
  });

  it("does not use generic nutrition when the label is unavailable", async () => {
    const pin = row();
    const client = { rpc: vi.fn(async () => ({ data: [{ id: pin.id, product_predecessor: null }], error: null })) };
    const hydrated = await hydrateRecipeProductNutrition(client, [pin], [pin], "owner");
    expect(calculate(hydrated.ingredients).calculation_status).toBe("unavailable");
    const generic = { ...row(), id: "plain", food_product_id: null, food_product_nutrition_version_id: null };
    const partial = calculate([...hydrated.ingredients, generic]);
    expect(partial.values.energy_kcal).toMatchObject({ amount: null, known_amount: 50, status: "partial" });
  });

  it("fails closed when the product owner is denied or the version pin is incomplete", async () => {
    const client = { rpc: vi.fn(async () => ({ data: null, error: { code: "FORBIDDEN" } })) };
    await expect(hydrateRecipeProductNutrition(client, [row()], [row()], "other-owner"))
      .rejects.toThrow("RECIPE_PRODUCT_NUTRITION_READ_FAILED");
    const invalid = { ...row(), food_product_nutrition_version_id: null };
    await expect(hydrateRecipeProductNutrition(client, [invalid], [invalid]))
      .rejects.toThrow("INVALID_RECIPE_PRODUCT_PIN");
  });

  it("uses label relations bidirectionally but rejects unsupported or ambiguous units", () => {
    const product = { ...row(), nutrition: predecessor.nutrition, product_basis_relations: predecessor.basis_relations };
    expect(calculate([{ ...product, amount: 0.1, unit: "kg" }]).values.energy_kcal.amount).toBe(300);
    expect(calculate([{ ...product, unit: "개" }]).calculation_status).toBe("unavailable");
    expect(calculate([{ ...product, unit: "ml" }]).calculation_status).toBe("unavailable");
    expect(calculate([{ ...product, unit: "package", product_basis_relations: [
      ...predecessor.basis_relations, ...predecessor.basis_relations,
    ] }]).calculation_status).toBe("unavailable");
    expect(calculate([{ ...product, amount: 50, unit: "g", nutrition: {
      ...predecessor.nutrition, profile: { ...predecessor.nutrition.profile, basis_amount: 1, basis_unit: "package" },
    } }]).values.energy_kcal.amount).toBe(75);
  });

  it("retains missing label nutrients and prevents generic-only hydration from silently calculating a product", () => {
    const product = { ...row(), product_basis_relations: [], nutrition: nutrition(300) };
    delete product.nutrition.profile.values.protein_g;
    const result = calculate([product]);
    expect(result.values.energy_kcal.amount).toBe(150);
    expect(result.values.protein_g.status).toBe("unavailable");
    expect(result.calculation_status).toBe("partial");
    const hydrated = hydrateRecipeNutritionIngredients([row()], new Map([["generic", {
      nutrition_candidates: [{ ingredientId: "generic", preparationState: "raw", nutrition: nutrition(100) }],
      conversion_candidates: [], piece_weight_candidates: [],
    }]]));
    expect(calculate(hydrated).calculation_status).toBe("unavailable");
  });
});
