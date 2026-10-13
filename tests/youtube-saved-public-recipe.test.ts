import { describe, expect, it } from "vitest";

import {
  parseYoutubeSavedPublicRecipeProjection,
} from "@/lib/server/youtube-saved-public-recipe";

describe("public YouTube saved recipe projection", () => {
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
