import { describe, expect, it } from "vitest";

import {
  P0_RECIPE_TAG_SEEDS,
  buildSuggestedRecipeTags,
  normalizeReviewedRecipeTagLabels,
} from "@/lib/server/recipe-tags";

describe("recipe tag normalization and suggestions", () => {
  it("keeps the P0 semantic/source taxonomy explicit and Korean-keyed", () => {
    expect(P0_RECIPE_TAG_SEEDS).toHaveLength(36);
    expect(P0_RECIPE_TAG_SEEDS.filter((tag) => tag.kind === "source")).toHaveLength(1);
    expect(P0_RECIPE_TAG_SEEDS.filter((tag) => tag.kind === "semantic")).toHaveLength(35);

    expect(P0_RECIPE_TAG_SEEDS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "자취요리",
          normalized_key: "자취요리",
          kind: "semantic",
          theme_eligible: true,
        }),
        expect.objectContaining({
          label: "한식",
          normalized_key: "한식",
          kind: "semantic",
          theme_eligible: true,
        }),
        expect.objectContaining({
          label: "유튜브레시피",
          normalized_key: "유튜브레시피",
          kind: "source",
          theme_eligible: true,
        }),
      ]),
    );
  });

  it("normalizes reviewed labels while keeping user tags pending and theme-ineligible", () => {
    const result = normalizeReviewedRecipeTagLabels([" #한식 ", "내메모", "한식"]);

    expect(result).toEqual({
      fields: [{ field: "tags", reason: "duplicate" }],
      tags: [],
    });

    const validResult = normalizeReviewedRecipeTagLabels([" #한식 ", "내메모"]);

    expect(validResult.fields).toEqual([]);
    expect(validResult.tags).toEqual([
      expect.objectContaining({
        label: "한식",
        normalized_key: "한식",
        kind: "semantic",
        source: "user_reviewed",
        visibility: "public",
        review_status: "approved",
        theme_eligible: true,
        is_system: true,
      }),
      expect.objectContaining({
        label: "내메모",
        normalized_key: "내메모",
        kind: "user",
        source: "user_reviewed",
        visibility: "public_pending",
        review_status: "pending",
        theme_eligible: false,
        is_system: false,
      }),
    ]);
  });

  it("rejects empty, spam-like, overlong, and non-array reviewed tags", () => {
    expect(normalizeReviewedRecipeTagLabels("한식")).toEqual({
      fields: [{ field: "tags", reason: "invalid_array" }],
      tags: [],
    });
    expect(normalizeReviewedRecipeTagLabels(["   "]).fields).toEqual([
      { field: "tags", reason: "empty" },
    ]);
    expect(normalizeReviewedRecipeTagLabels(["https://example.com"]).fields).toEqual([
      { field: "tags", reason: "blocked" },
    ]);
    expect(normalizeReviewedRecipeTagLabels(["열두글자를넘는매우긴태그들"]).fields).toEqual([
      { field: "tags", reason: "max_length" },
    ]);
  });

  it("infers meaningful tags from recipe content instead of generic ingredient labels", () => {
    const suggested = buildSuggestedRecipeTags({
      sourceType: "youtube",
      title: "초보도 쉬운 매콤 김치찌개",
      ingredientNames: ["김치", "고춧가루", "돼지고기"],
      stepTexts: ["냄비에 김치를 넣고 볶아요.", "물을 붓고 보글보글 끓여요."],
      cookingMethodLabels: ["끓이기"],
    });

    expect(suggested.map((tag) => tag.label)).toEqual([
      "유튜브레시피",
      "한식",
      "국물요리",
      "매콤",
      "초보가능",
      "고단백",
    ]);
    expect(suggested).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "유튜브레시피",
          kind: "source",
          source: "system_suggested",
          confidence: 0.99,
        }),
        expect.objectContaining({
          label: "한식",
          kind: "semantic",
          source: "system_suggested",
          confidence: expect.any(Number),
        }),
      ]),
    );
  });
});
