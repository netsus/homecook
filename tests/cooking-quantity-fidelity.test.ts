import { describe, expect, it } from "vitest";
import { toCookingModeIngredient, type CookingIngredientRow } from "@/lib/server/cooking";
import { projectMealRecipeSnapshot } from "@/lib/server/meal-recipe-snapshot";
import { projectSnapshotV2CookModeData } from "@/lib/server/recipe-content-snapshot-future-propagation";
import { normalizeRecipeIngredients } from "@/lib/recipe-detail";
import { formatIngredientAmountOnly } from "@/components/cooking/cook-mode-step-model";
import type { RecipeQuantityInputSnapshot } from "@/types/recipe";

const id = (n: number) => `550e8400-e29b-41d4-a716-${String(n).padStart(12, "0")}`;
function row(raw = "1/3", unit = "L"): CookingIngredientRow & { id: string; quantity_input: RecipeQuantityInputSnapshot } {
  const denominator = raw.split("/")[1];
  const amount = 1 / Number(denominator);
  return { id: id(1), ingredient_id: id(2), amount, unit, ingredient_type: "QUANT", scalable: true,
    display_text: "검증재료 원문", ingredients: { standard_name: "검증재료" },
    quantity_input: { schema_version: "quantity-v4", raw_value: raw, raw_unit: unit, numerator: "1", denominator,
      normalized: { amount: amount * 1000, unit: unit === "L" ? "ml" : "g" }, display_quantity: { amount, unit },
      quality: "direct", reason: null, evidence_ids: [], source_versions: [], batch_basis: null, context_sha256: "a".repeat(64) } };
}
function mode(ingredient: CookingIngredientRow, cookingServings = 3) {
  return { session_id: id(3), contract_version: "snapshot_v2", mode: "planner", status: "in_progress",
    recipe: { id: id(4), title: "고정 레시피", base_servings: 2, cooking_servings: cookingServings,
      ingredients: [{ ...ingredient, standard_name: "검증재료" }],
      steps: [{ step_number: 1, instruction: "물 1/3L를 넣고 2번 섞어요.", cooking_methods: [{ code: "MIX", label: "섞기", color_key: "green" }], ingredients_used: [] }] }, pantry_candidates: [] };
}

describe("cooking and plan frozen quantity fidelity", () => {
  it.each([
    ["1/3", "L", 2, 1 / 3, "1/3L"],
    ["1/7", "kg", 3, 3 / 14, "0.214kg"],
  ] as const)("keeps %s%s metadata and numeric precision at %s servings", (raw, unit, servings, amount, label) => {
    const ingredient = row(raw, unit);
    const before = JSON.stringify(ingredient);
    const direct = toCookingModeIngredient({ row: ingredient, baseServings: 2, cookingServings: servings });
    const snapshot = { id: id(5), recipe_id: id(4), owner_user_id: null, title: "고정 레시피", base_servings: 2,
      ingredients_json: [ingredient], steps_json: [] };
    const planned = projectMealRecipeSnapshot({ id: id(6), user_id: id(7), recipe_id: id(4), recipe_content_snapshot_id: snapshot.id,
      planned_servings: servings, recipe_content_snapshots: snapshot }, id(7), new Map([[id(2), "검증재료"]]));
    const cooking = projectSnapshotV2CookModeData(mode(ingredient, servings));
    for (const projected of [direct, planned?.ingredients[0], cooking?.recipe.ingredients[0]]) {
      expect(projected?.amount).toBeCloseTo(amount, 15);
      expect(projected).toHaveProperty("quantity_input", ingredient.quantity_input);
      expect(projected?.display_text).toBe(`검증재료 ${label}`);
      expect(projected && formatIngredientAmountOnly(projected)).toBe(label);
    }
    expect(JSON.stringify(ingredient)).toBe(before);
    expect(cooking?.recipe.steps[0].instruction).toBe(mode(ingredient).recipe.steps[0].instruction);
  });

  it("preserves the validated worker snapshot without manufacturing a recipe context", () => {
    const original = row();
    const { context_sha256, ...saved } = original.quantity_input;
    expect(context_sha256).toHaveLength(64);
    const input = { ...original, quantity_input: saved };
    const projected = toCookingModeIngredient({ row: input, baseServings: 2, cookingServings: 2 });
    expect(projected.amount).toBe(1 / 3);
    expect(projected.quantity_input).toEqual(saved);
    expect(projected.quantity_input).not.toHaveProperty("context_sha256");
    expect(formatIngredientAmountOnly(projected)).toBe("1/3L");
  });

  it("does not promote an unavailable conversion into a mass or density proof", () => {
    const original = row();
    const input = { ...original, quantity_input: { ...original.quantity_input, normalized: null,
      quality: "unavailable" as const, reason: "DENSITY_REQUIRED" } };
    const projected = toCookingModeIngredient({ row: input, baseServings: 2, cookingServings: 3 });
    expect(projected.amount).toBe(.5);
    expect(projected.unit).toBe("L");
    expect(projected.quantity_input).toEqual(input.quantity_input);
    expect(formatIngredientAmountOnly(projected)).toBe("0.5L");
  });

  it("ignores non-finite raw ratios while retaining the old cooking projection", () => {
    const original = row();
    const { quantity_input, ...legacy } = original;
    const invalid = { ...original, quantity_input: { ...quantity_input, numerator: "9".repeat(400), denominator: "9".repeat(400) } };
    expect(toCookingModeIngredient({ row: invalid, baseServings: 2, cookingServings: 3 }))
      .toEqual(toCookingModeIngredient({ row: legacy, baseServings: 2, cookingServings: 3 }));
    expect(projectSnapshotV2CookModeData(mode(invalid))).toEqual(projectSnapshotV2CookModeData(mode(legacy)));
  });

  it("uses fixed serving and saved product version, without reinterpreting converted raw units", () => {
    const original = row();
    const ingredient = { ...original, ingredient_id: null, food_product_id: id(8), food_product_nutrition_version_id: id(9),
      food_product_name: "고정 제품", amount: 40, unit: "g", scalable: false,
      quantity_input: { ...original.quantity_input, raw_unit: "package", normalized: { amount: 40, unit: "g" as const },
        display_quantity: { amount: 40, unit: "g" }, source_versions: [id(9)] } };
    const projected = toCookingModeIngredient({ row: ingredient, baseServings: 2, cookingServings: 6 });
    expect(projected).toMatchObject({ amount: 40, unit: "g", food_product_id: id(8), food_product_nutrition_version_id: id(9), quantity_input: ingredient.quantity_input });
    expect(formatIngredientAmountOnly(projected)).toBe("40g");
  });

  it.each([
    { context_sha256: "bad" }, { raw_value: "1/9" }, { display_quantity: { amount: 9, unit: "L" } },
    { batch_basis: { batch_id: id(1), revision: 1, cooking_servings: 2, finished_weight_g: 300, weight_source: null } },
  ])("ignores invalid optional raw only, keeping legacy rows and structured steps: %j", patch => {
    const original = row();
    const { quantity_input, ...legacy } = original;
    const value = { ...original, quantity_input: { ...quantity_input, ...patch } };
    const before = JSON.stringify(value);
    expect(toCookingModeIngredient({ row: value, baseServings: 2, cookingServings: 3 }))
      .toEqual(toCookingModeIngredient({ row: legacy, baseServings: 2, cookingServings: 3 }));
    expect(projectSnapshotV2CookModeData(mode(value))).toEqual(projectSnapshotV2CookModeData(mode(legacy)));
    expect(JSON.stringify(value)).toBe(before);
    expect(() => normalizeRecipeIngredients([{ ...value, sort_order: 0 }])).toThrow("INVALID_RECIPE_QUANTITY_SNAPSHOT");
  });

  it("rejects stale product raw metadata without changing the fixed product row", () => {
    const original = row();
    const product = { ...original, ingredient_id: null, food_product_id: id(8), food_product_nutrition_version_id: id(9),
      quantity_input: { ...original.quantity_input, source_versions: [id(10)] } };
    const { quantity_input: ignored, ...legacy } = product;
    expect(ignored.source_versions).toEqual([id(10)]);
    expect(toCookingModeIngredient({ row: product, baseServings: 2, cookingServings: 3 }))
      .toEqual(toCookingModeIngredient({ row: legacy, baseServings: 2, cookingServings: 3 }));
  });

  it("keeps normal recipe metadata and legacy/to-taste/unknown behavior", () => {
    const original = row();
    expect(normalizeRecipeIngredients([{ ...original, sort_order: 0 }])[0].quantity_input).toEqual(original.quantity_input);
    const { quantity_input: ignored, ...legacy } = original;
    expect(ignored.raw_value).toBe("1/3");
    expect(toCookingModeIngredient({ row: legacy, baseServings: 2, cookingServings: 2 }).amount).toBe(.33);
    for (const changes of [{ ingredient_type: "TO_TASTE" as const }, { amount: null, unit: null }]) {
      const projected = toCookingModeIngredient({ row: { ...legacy, ...changes }, baseServings: 2, cookingServings: 3 });
      expect(projected).not.toHaveProperty("quantity_input");
      expect(projected.display_text).toBe("검증재료 원문");
    }
  });
});
