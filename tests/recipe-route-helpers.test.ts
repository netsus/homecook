import { describe, expect, it } from "vitest";

import {
  mapRecipeUserStatus,
  normalizeRecipeIngredients,
  normalizeRecipeSteps,
} from "@/lib/recipe-detail";
import {
  clampLimit,
  filterRecipeIdsByIngredients,
  parseIngredientIds,
} from "@/lib/recipe-list";

describe("recipe route helpers", () => {
  it("clamps limit query to allowed range", () => {
    expect(clampLimit(null)).toBe(20);
    expect(clampLimit("bad")).toBe(20);
    expect(clampLimit("0")).toBe(1);
    expect(clampLimit("50")).toBe(40);
  });

  it("parses ingredient ids by removing blanks, duplicates, and malformed tokens", () => {
    expect(
      parseIngredientIds(
        "550e8400-e29b-41d4-a716-446655440000,,bad,550e8400-e29b-41d4-a716-446655440001,550e8400-e29b-41d4-a716-446655440000",
      ),
    ).toEqual([
      "550e8400-e29b-41d4-a716-446655440000",
      "550e8400-e29b-41d4-a716-446655440001",
    ]);
  });

  it("returns empty ingredient ids when nothing valid remains", () => {
    expect(parseIngredientIds("bad,, ,123")).toEqual([]);
  });

  it("keeps only recipe ids that contain every selected ingredient with distinct matching", () => {
    expect(
      filterRecipeIdsByIngredients(
        [
          {
            recipe_id: "recipe-a",
            ingredient_id: "550e8400-e29b-41d4-a716-446655440000",
          },
          {
            recipe_id: "recipe-a",
            ingredient_id: "550e8400-e29b-41d4-a716-446655440001",
          },
          {
            recipe_id: "recipe-a",
            ingredient_id: "550e8400-e29b-41d4-a716-446655440000",
          },
          {
            recipe_id: "recipe-b",
            ingredient_id: "550e8400-e29b-41d4-a716-446655440000",
          },
        ],
        [
          "550e8400-e29b-41d4-a716-446655440000",
          "550e8400-e29b-41d4-a716-446655440001",
        ],
      ),
    ).toEqual(["recipe-a"]);
  });

  it("maps recipe user status from liked and saved rows", () => {
    expect(mapRecipeUserStatus([{ id: "like-1" }], [{ book_id: "book-1" }])).toEqual({
      is_liked: true,
      is_saved: true,
      saved_book_ids: ["book-1"],
    });
  });

  it("normalizes ingredient rows from object or array relations", () => {
    expect(
      normalizeRecipeIngredients([
        {
          id: "ing-1",
          ingredient_id: "ingredient-1",
          amount: "2",
          unit: "개",
          ingredient_type: "QUANT",
          display_text: "양파 2개",
          scalable: true,
          sort_order: 1,
          ingredients: [{ standard_name: "양파" }],
        },
        {
          id: "ing-2",
          ingredient_id: "ingredient-2",
          amount: null,
          unit: null,
          ingredient_type: "TO_TASTE",
          display_text: "소금 약간",
          scalable: false,
          sort_order: 2,
          ingredients: { standard_name: "소금" },
        },
      ]),
    ).toEqual([
      expect.objectContaining({ standard_name: "양파", amount: 2 }),
      expect.objectContaining({ standard_name: "소금", amount: null }),
    ]);
  });

  it("normalizes step rows and defaults invalid arrays safely", () => {
    expect(
      normalizeRecipeSteps([
        {
          id: "step-1",
          step_number: 1,
          instruction: "끓입니다.",
          ingredients_used: null,
          heat_level: "중",
          duration_seconds: 60,
          duration_text: "1분",
          cooking_methods: [
            {
              id: "method-1",
              code: "boil",
              label: "끓이기",
              color_key: "red",
            },
          ],
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        ingredients_used: [],
        cooking_method: expect.objectContaining({ label: "끓이기" }),
      }),
    ]);
  });
});
