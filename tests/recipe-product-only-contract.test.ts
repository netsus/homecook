import { describe, expect, it } from "vitest";
import { isRecipeIngredientIdentityValid, recipeIngredientSourceId } from "@/lib/recipe-ingredient-source";
import { convertProductQuantity } from "@/lib/nutrition/product-quantity";
import { changeRecipeIngredient, toRecipeEditIngredient, withRecipeIngredientRowKeys } from "@/lib/recipe-editor-ingredients";
import type { RecipeEditDraft } from "@/types/recipe";

const id = (n: number) => `79000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const product = { ingredient_id: null, food_product_id: id(1), food_product_nutrition_version_id: id(2), source_kind: "food_product" as const, row_key: id(3) };
const relations = [{ from: { amount: 1, unit: "package" }, to: { amount: 200, unit: "g" } }];
const row = () => toRecipeEditIngredient({ ...product, standard_name: "원본 제품", amount: 0.5, unit: "package", ingredient_type: "QUANT", display_text: "0.5팩", scalable: true, sort_order: 0 });
function draft(): RecipeEditDraft {
  return { title: "원문", description: null, base_servings: 2, ingredients: [row()], steps: [{
    step_number: 1, instruction: "0.5팩을 넣습니다.", cooking_method_id: id(4), cooking_method_ids: [id(4)],
    ingredients_used: [{ ingredient_id: null, row_key: id(3), amount: 0.5, unit: "package", cut_size: null }],
    component_label: null, heat_level: null, duration_seconds: null, duration_text: null,
  }] };
}
describe("recipe product source identity", () => {
  it("accepts a complete product pin without a generic ingredient and never uses a dummy ID", () => {
    expect(isRecipeIngredientIdentityValid(product)).toBe(true);
    expect(recipeIngredientSourceId(product)).toBe(id(1));
    expect(isRecipeIngredientIdentityValid({ ingredient_id: id(9) })).toBe(true);
  });
  it.each([
    { ...product, food_product_nutrition_version_id: null },
    { ...product, food_product_id: null },
    { ...product, source_kind: "ingredient" as const },
    { ...product, row_key: "not-uuid" },
    { ingredient_id: null },
    { ...product, ingredient_id: "dummy" },
  ])("rejects a contradictory or incomplete source %#", (input) => {
    expect(isRecipeIngredientIdentityValid(input)).toBe(false);
  });
  it("replaces only a keyed row and requires new product quantity even when the unit is equal", () => {
    const original = draft();
    original.ingredients.push({ ...row(), row_key: id(5), food_product_id: id(6), food_product_nutrition_version_id: id(7) });
    original.steps[0].ingredients_used.push({ ingredient_id: null, row_key: id(5), amount: 0.2, unit: "package", cut_size: null });
    const replacement = { ...row(), food_product_id: id(8), food_product_nutrition_version_id: id(9) };
    const changed = changeRecipeIngredient(original, 0, replacement);
    expect(changed.ingredients[0]).toMatchObject({ row_key: id(3), ingredient_id: null, amount: null, unit: "package" });
    expect(changed.steps[0].ingredients_used).toEqual([
      { ingredient_id: null, row_key: id(3), amount: null, unit: null, cut_size: null },
      original.steps[0].ingredients_used[1],
    ]);
    expect(changed.steps[0].instruction).toBe("0.5팩을 넣습니다.");
    expect(original.ingredients[0].amount).toBe(0.5);
  });
  it("leaves ambiguous legacy references intact and maps a single legacy source without rewriting quantities", () => {
    const original = draft();
    original.ingredients = ["A", "B"].map((component_label, index) => ({ ...row(), ingredient_id: id(10), row_key: undefined, component_label, food_product_id: id(20 + index) }));
    original.steps[0].ingredients_used = [{ ingredient_id: id(10), amount: 1, unit: "g", cut_size: null }];
    expect(withRecipeIngredientRowKeys(original).steps[0].ingredients_used).toEqual(original.steps[0].ingredients_used);
    original.steps[0].component_label = "A";
    const normalized = withRecipeIngredientRowKeys(original);
    expect(normalized.steps[0].ingredients_used[0]).toEqual({ ...original.steps[0].ingredients_used[0], row_key: normalized.ingredients[0].row_key });
  });
});
describe("pinned product direct quantity evidence", () => {
  it("preserves physical quantity through the same fixed basis without guessed density", () => {
    const commonBasis = [
      { from: { amount: 1, unit: "package" }, to: { amount: 120, unit: "g" } },
      { from: { amount: 1, unit: "serving" }, to: { amount: 60, unit: "g" } },
    ];
    expect(convertProductQuantity(0.5, "package", "serving", commonBasis)).toBe(1);
    expect(convertProductQuantity(1, "serving", "package", commonBasis)).toBe(0.5);
    expect(convertProductQuantity(1, "serving", "ml", commonBasis)).toBeNull();
    expect(convertProductQuantity(0.5, "package", "serving", [...commonBasis, commonBasis[1]])).toBeNull();
    const conflicting = [
      {from:{amount:1,unit:"package"},to:{amount:2,unit:"serving"}},
      {from:{amount:1,unit:"package"},to:{amount:200,unit:"g"}},
      {from:{amount:1,unit:"serving"},to:{amount:50,unit:"g"}},
    ];
    expect(convertProductQuantity(1,"package","serving",conflicting)).toBeNull();
    expect(convertProductQuantity(1,"package","g",conflicting)).toBeNull();
  });
  it("uses exact mass/volume dimensions and the selected version's relation in both directions", () => {
    expect(convertProductQuantity(0.5, "package", "g", relations)).toBe(100);
    expect(convertProductQuantity(100, "g", "package", relations)).toBe(0.5);
    expect(convertProductQuantity(0.1, "kg", "package", relations)).toBe(0.5);
    expect(convertProductQuantity(1, "L", "ml", [])).toBe(1000);
    expect(convertProductQuantity(0.5, "package", "g", [{ from: { amount: 1, unit: "package" }, to: { amount: 300, unit: "g" } }])).toBe(150);
  });
  it("rejects missing, ambiguous and invalid cross-dimension evidence without density or pieces guessing", () => {
    expect(convertProductQuantity(50, "ml", "g", relations)).toBeNull();
    expect(convertProductQuantity(1, "개", "g", relations)).toBeNull();
    expect(convertProductQuantity(1, "package", "g", [...relations, ...relations])).toBeNull();
    expect(convertProductQuantity(1, "package", "g", [{ from: { amount: 0, unit: "package" }, to: { amount: 200, unit: "g" } }])).toBeNull();
    for (const amount of [0, -1, NaN, Infinity]) expect(convertProductQuantity(amount, "g", "g", [])).toBeNull();
  });
});
