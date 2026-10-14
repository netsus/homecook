import { describe, expect, it } from "vitest";

import {
  parseYoutubeSavedPublicRecipeProjection,
} from "@/lib/server/youtube-saved-public-recipe";
import { formatIngredientAmountOnly } from "@/components/cooking/cook-mode-step-model";

describe("public YouTube saved recipe projection", () => {
  const row = { id: "ingredient-1", ingredient_id: "ingredient-1", standard_name: "소금", amount: 1 / 3, unit: "g",
    ingredient_type: "QUANT", display_text: null, component_label: null, scalable: true, sort_order: 0 };
  const snapshot = { schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "g", numerator: "1", denominator: "3",
    display_quantity: { amount: 1 / 3, unit: "g" }, normalized: { amount: 1 / 3, unit: "g" }, quality: "direct",
    reason: null, evidence_ids: [], source_versions: [], batch_basis: null };

  it("preserves a validated stored snapshot and leaves a legacy row's exact shape unchanged", () => {
    const legacy = parseYoutubeSavedPublicRecipeProjection({ ingredients: [row], steps: [] });
    expect(legacy?.ingredients[0]).toEqual(row);
    expect(JSON.stringify(legacy?.ingredients[0])).toBe(JSON.stringify(row));
    expect(parseYoutubeSavedPublicRecipeProjection({ ingredients: [{ ...row, quantity_input: snapshot }], steps: [] })?.ingredients[0])
      .toEqual({ ...row, display_text: "소금 1/3g", quantity_input: snapshot });
  });

  it("carries the current raw snapshot to the real cook formatter without inventing a normal-recipe context", () => {
    const changed = { ...snapshot, raw_value: "1/2", numerator: "1", denominator: "2",
      normalized: { amount: 0.5, unit: "g" }, display_quantity: { amount: 0.5, unit: "g" } };
    const projection = parseYoutubeSavedPublicRecipeProjection({ ingredients: [{ ...row, amount: 0.5,
      display_text: "소금 1/3g", quantity_input: changed }], steps: [] });
    expect(projection).not.toBeNull();
    const ingredient = projection!.ingredients[0];
    expect(formatIngredientAmountOnly(ingredient)).toBe("1/2g");
    expect(ingredient.quantity_input).not.toHaveProperty("context_sha256");
  });

  it.each([{ schema_version: "quantity-v4", raw_value: "1/3", raw_unit: "g" },
    { ...snapshot, denominator: "0" }, { ...snapshot, display_quantity: { amount: 1, unit: "kg" } }])
    ("rejects unverified draft or inconsistent quantity metadata", quantity_input => {
      expect(parseYoutubeSavedPublicRecipeProjection({ ingredients: [{ ...row, quantity_input }], steps: [] })).toBeNull();
    });

  it("maps the sanitized display contract", () => {
    const projection = parseYoutubeSavedPublicRecipeProjection({
      ingredients: [{
        id: "ingredient-1",
        ingredient_id: "ingredient-1",
        standard_name: "다진 마늘",
        amount: 1,
        unit: "큰술",
        ingredient_type: "QUANT",
        display_text: "다진 마늘 1큰술",
        component_label: null,
        scalable: true,
        sort_order: 0,
      }],
      steps: [{
        id: "recipe-1:step:1",
        step_number: 1,
        instruction: "재료를 섞는다.",
        component_label: null,
        cooking_methods: [],
        ingredients_used: [],
        heat_level: null,
        duration_seconds: null,
        duration_text: null,
      }],
    });

    expect(projection?.ingredients[0]).toMatchObject({
      standard_name: "다진 마늘",
      amount: 1,
      unit: "큰술",
    });
    expect(projection?.steps[0]).toMatchObject({
      step_number: 1,
      instruction: "재료를 섞는다.",
    });
  });

  it("rejects missing or malformed display rows", () => {
    expect(parseYoutubeSavedPublicRecipeProjection(null)).toBeNull();
    expect(parseYoutubeSavedPublicRecipeProjection({ ingredients: {}, steps: [] })).toBeNull();
    expect(parseYoutubeSavedPublicRecipeProjection({
      ingredients: [{ id: "ingredient-1" }],
      steps: [],
    })).toBeNull();
  });
});
