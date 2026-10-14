import { describe, expect, it } from "vitest";
import { changeRecipeQuantityUnit, recipeQuantityText, updateRecipeQuantityText, recipeQuantityContextNeedsConfirmation, isRecipeQuantityInputState } from "@/lib/recipe-quantity-input";
import type { RecipeEditIngredientDraft } from "@/types/recipe";
import type { FoodProductData } from "@/types/food-product";
import type { IngredientQuantityOptions } from "@/types/quantity-input";

const ingredient: RecipeEditIngredientDraft = {
  ingredient_id: "11111111-1111-4111-8111-111111111111", row_key: "22222222-2222-4222-8222-222222222222",
  amount: 200, unit: "mL", ingredient_type: "QUANT", display_text: "우유", component_label: null,
  scalable: true, food_product_id: null, food_product_nutrition_version_id: null,
};
const options: IngredientQuantityOptions = {
  policy_version: "ingredient-units-v4", profile_id: "33333333-3333-4333-8333-333333333333",
  preparation_state: "raw", default_unit: "mL", choices: [
    { unit: "mL", normalized: null, quality: "unavailable", reason: "DENSITY_REQUIRED" },
    { unit: "L", normalized: null, quality: "unavailable", reason: "DENSITY_REQUIRED" },
    { unit: "g", normalized: { amount: 1, unit: "g" }, quality: "direct", reason: null },
  ],
};
const product = {
  id: "44444444-4444-4444-8444-444444444444", nutrition_version_id: "55555555-5555-4555-8555-555555555555",
  basis_relations: [{ from: { amount: 1, unit: "package" }, to: { amount: 120, unit: "g" } }],
} satisfies Pick<FoodProductData, "id" | "nutrition_version_id" | "basis_relations">;

describe("recipe quantity input", () => {
  it("preserves fraction text and precision without inserting numbers into cooking text", () => {
    const row = updateRecipeQuantityText({ ...ingredient, amount: null, unit: "g" }, "1/3");
    expect(row.amount).toBe(1 / 3);
    expect(row.quantity_input).toEqual({ schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "g" });
    expect(recipeQuantityText(row)).toBe("1/3");
    expect(row.display_text).toBe("우유");
  });
  it.each(["-1", "0", "1/0", "1/", "1/2/3"])("retains invalid typed %s but cannot turn it into a valid amount", text => {
    const row = updateRecipeQuantityText(ingredient, text);
    expect(row.amount).toBeNull();
    expect(recipeQuantityText(row)).toBe(text);
  });
  it("changes 200mL to 0.2L while retaining original 200mL", () => {
    const original = updateRecipeQuantityText(ingredient, "200");
    const result = changeRecipeQuantityUnit(original, "L", { ingredientOptions: options });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ingredient).toMatchObject({ amount: 0.2, unit: "L", quantity_input: { raw_value: "200", raw_unit: "mL" } });
    expect(recipeQuantityText(result.ingredient)).toBe("0.2");
    expect(original).toMatchObject({ amount: 200, unit: "mL" });
  });
  it("refuses missing density and leaves original quantity and raw input intact", () => {
    const original = updateRecipeQuantityText(ingredient, "200");
    const result = changeRecipeQuantityUnit(original, "g", { ingredientOptions: options });
    expect(result.ok).toBe(false);
    expect(original).toMatchObject({ amount: 200, unit: "mL", quantity_input: { raw_value: "200", raw_unit: "mL" } });
  });
  it("pins a product fraction and converts only that product version", () => {
    const original = updateRecipeQuantityText({ ...ingredient, amount: null, unit: "package", food_product_id: product.id,
      food_product_nutrition_version_id: product.nutrition_version_id }, "1/3");
    expect(original.quantity_input).toMatchObject({ expected_product_nutrition_version_id: product.nutrition_version_id });
    const result = changeRecipeQuantityUnit(original, "g", { product });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ingredient).toMatchObject({ amount: 40, unit: "g", quantity_input: { raw_value: "1/3", raw_unit: "package" } });
    expect(changeRecipeQuantityUnit(original, "g", { product: { ...product, nutrition_version_id: "66666666-6666-4666-8666-666666666666" } }).ok).toBe(false);
  });
  it("does not reinterpret garlic 알 as 통 or product serving as piece", () => {
    const garlic = updateRecipeQuantityText({ ...ingredient, unit: "알" }, "1/2");
    expect(changeRecipeQuantityUnit(garlic, "통", { ingredientOptions: options }).ok).toBe(false);
    const serving = updateRecipeQuantityText({ ...ingredient, unit: "serving", food_product_id: product.id,
      food_product_nutrition_version_id: product.nutrition_version_id }, "1/2");
    expect(changeRecipeQuantityUnit(serving, "piece", { product }).ok).toBe(false);
  });
});

describe("recipe raw quantity revalidation", () => {
  it("requires a deliberate re-entry after context changes and never silently changes raw quantity", () => {
    const row = updateRecipeQuantityText(ingredient, "200", "a".repeat(64));
    const context = { ready: true, context_sha256: "b".repeat(64), options };
    expect(recipeQuantityContextNeedsConfirmation(row, context)).toBe(true);
    expect(changeRecipeQuantityUnit(row, "L", { ingredientOptions: options, contextSha256: context.context_sha256 }).ok).toBe(false);
    expect(row.amount).toBe(200); expect(row.unit).toBe("mL");
    const confirmed = updateRecipeQuantityText(row, "200", context.context_sha256);
    expect(recipeQuantityContextNeedsConfirmation(confirmed, context)).toBe(false);
    expect(changeRecipeQuantityUnit(confirmed, "L", { ingredientOptions: options, contextSha256: context.context_sha256 }).ok).toBe(true);
  });
  it("keeps incomplete raw draft text but rejects computed approval/evidence and mismatched pinned versions", () => {
    const row = updateRecipeQuantityText(ingredient, "1/", "a".repeat(64));
    expect(isRecipeQuantityInputState(row.quantity_input)).toBe(true);
    expect(isRecipeQuantityInputState({ ...row.quantity_input, evidence_ids: ["approved"] })).toBe(false);
    const pinned = updateRecipeQuantityText({ ...ingredient, food_product_id: product.id, food_product_nutrition_version_id: product.nutrition_version_id }, "1/3", "a".repeat(64));
    expect(isRecipeQuantityInputState(pinned.quantity_input, "wrong")).toBe(false);
    expect(isRecipeQuantityInputState(pinned.quantity_input, product.nutrition_version_id)).toBe(true);
  });
  it("does not manufacture a null quantity key for unchanged legacy rows", () => {
    const legacy = changeRecipeQuantityUnit({ ...ingredient, unit: "g" }, "kg", { recordInput: false });
    expect(legacy.ok).toBe(true);
    if (legacy.ok) expect(Object.hasOwn(legacy.ingredient, "quantity_input")).toBe(false);
  });
});
