import { describe, expect, it } from "vitest";
import { changeRecipeIngredient, toRecipeEditIngredient } from "@/lib/recipe-editor-ingredients";
import { formatScaledIngredient } from "@/lib/recipe";
import type { RecipeEditDraft } from "@/types/recipe";

const ingredient = (id: string) => toRecipeEditIngredient({ ingredient_id: id, standard_name: id, amount: 100, unit: "g", ingredient_type: "QUANT", display_text: id, scalable: true, sort_order: 1 });
const fixture = (): RecipeEditDraft => ({ title: "버섯볶음", description: null, base_servings: 1,
  ingredients: [ingredient("old"), ingredient("onion")],
  steps: [{ step_number: 1, instruction: "버섯을 볶아요", cooking_method_id: "fry", cooking_method_ids: ["fry"],
    ingredients_used: [{ ingredient_id: "old", amount: 20, unit: "g", cut_size: null }], component_label: null, heat_level: null, duration_seconds: null, duration_text: null }],
});
describe("personal recipe ingredient correction", () => {
  it("replaces a mistaken ingredient and updates structured cooking references without rewriting instructions", () => {
    const draft = fixture();
    draft.ingredients[0].amount = 200;
    draft.ingredients[0].unit = "kg";
    draft.ingredients[0].scalable = false;
    const next = changeRecipeIngredient(draft, 0, ingredient("mushroom"));
    expect(next.ingredients[0].ingredient_id).toBe("mushroom");
    expect(next.ingredients[0]).toMatchObject({ amount: 200, unit: "kg", scalable: false });
    expect(formatScaledIngredient({ ...next.ingredients[0], id: "row", sort_order: 1, standard_name: "양송이버섯" }, 1, 4))
      .toBe("양송이버섯 200kg");
    expect(next.steps[0].ingredients_used).toEqual([{ ingredient_id: "mushroom", amount: 20, unit: "g", cut_size: null }]);
    expect(next.steps[0].instruction).toBe("버섯을 볶아요");
    expect(draft.ingredients[0].ingredient_id).toBe("old");
  });
  it("requires a new amount and clears stale step quantities when a product changes the unit", () => {
    const replacement = { ...ingredient("yogurt"), food_product_id: "product", food_product_nutrition_version_id: "v1", unit: "serving" };
    const next = changeRecipeIngredient(fixture(), 0, replacement);
    expect(next.ingredients[0]).toMatchObject({ amount: null, unit: "serving", ingredient_type: "QUANT" });
    expect(next.steps[0].ingredients_used).toEqual([{ ingredient_id: "yogurt", amount: null, unit: null, cut_size: null }]);
  });
  it("removes references to deleted ingredients so later saves do not fail", () => {
    const next = changeRecipeIngredient(fixture(), 0, null);
    expect(next.ingredients.map((item) => item.ingredient_id)).toEqual(["onion"]);
    expect(next.steps[0].ingredients_used).toEqual([]);
  });
  it("rejects duplicate canonical ingredient replacement", () => {
    const draft = fixture(); expect(changeRecipeIngredient(draft, 0, ingredient("onion"))).toBe(draft);
  });
  it("preserves the chosen product and exact nutrition version", () => {
    expect(toRecipeEditIngredient({ ingredient_id: "soy", standard_name: "간장", amount: 10, unit: "g", ingredient_type: "QUANT", display_text: null, scalable: true, sort_order: 1, food_product_id: "product", food_product_nutrition_version_id: "version" })).toMatchObject({ ingredient_id: "soy", food_product_id: "product", food_product_nutrition_version_id: "version" });
  });
});
