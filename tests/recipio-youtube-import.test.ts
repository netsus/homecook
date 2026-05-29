import { describe, expect, it } from "vitest";

import {
  buildRecipioYoutubeRegisterBody,
  getRecipioAutoRegisterBlockers,
  getRecipioYoutubeProgress,
  normalizeRecipioYoutubeUrl,
} from "@/lib/recipio-youtube-import";
import type { YoutubeRecipeExtractData } from "@/types/recipe";

const ingredientId = "550e8400-e29b-41d4-a716-446655440013";
const methodId = "550e8400-e29b-41d4-a716-446655440218";

function buildExtractData(
  patch: Partial<YoutubeRecipeExtractData> = {},
): YoutubeRecipeExtractData {
  return {
    extraction_id: "550e8400-e29b-41d4-a716-446655441201",
    title: "백종원 불어묵 꼬마김밥",
    base_servings: 1,
    extraction_methods: ["description"],
    draft_warnings: [],
    blocking_issues: [],
    ingredients: [
      {
        draft_ingredient_id: "550e8400-e29b-41d4-a716-446655441301",
        ingredient_id: ingredientId,
        standard_name: "어묵",
        amount: 2,
        unit: "장",
        ingredient_type: "QUANT",
        display_text: "어묵 2장",
        component_label: "김밥 속재료",
        sort_order: 1,
        scalable: true,
        confidence: 0.91,
        resolution_status: "resolved",
        raw_text: "어묵 2장",
      },
    ],
    steps: [
      {
        step_number: 1,
        instruction: "어묵을 잘게 썰어 볶아요.",
        component_label: "김밥 속재료",
        cooking_method: {
          id: methodId,
          code: "stir_fry",
          label: "볶기",
          color_key: "orange",
          is_new: false,
        },
        duration_text: "5분",
        is_incomplete: false,
        missing_fields: [],
      },
    ],
    new_cooking_methods: [],
    ...patch,
  };
}

describe("Recipio-style YouTube import helpers", () => {
  it("normalizes watch, short, and youtu.be URLs to a canonical watch URL", () => {
    expect(normalizeRecipioYoutubeUrl("https://youtu.be/X9CqUvteeMo?si=abc")).toEqual({
      videoId: "X9CqUvteeMo",
      youtubeUrl: "https://www.youtube.com/watch?v=X9CqUvteeMo",
    });
    expect(normalizeRecipioYoutubeUrl("https://www.youtube.com/shorts/X9CqUvteeMo")).toEqual({
      videoId: "X9CqUvteeMo",
      youtubeUrl: "https://www.youtube.com/watch?v=X9CqUvteeMo",
    });
    expect(normalizeRecipioYoutubeUrl("https://www.youtube.com/watch?v=X9CqUvteeMo&list=abc")).toEqual({
      videoId: "X9CqUvteeMo",
      youtubeUrl: "https://www.youtube.com/watch?v=X9CqUvteeMo",
    });
  });

  it("blocks one-click registration when extract data still needs user review", () => {
    const unresolved = buildExtractData({
      ingredients: [
        {
          ...buildExtractData().ingredients[0],
          ingredient_id: "",
          standard_name: "",
          resolution_status: "unresolved",
        },
      ],
    });
    const incompleteStep = buildExtractData({
      steps: [
        {
          ...buildExtractData().steps[0],
          instruction: "",
          missing_fields: ["instruction"],
          is_incomplete: true,
        },
      ],
    });

    expect(getRecipioAutoRegisterBlockers(buildExtractData())).toEqual([]);
    expect(getRecipioAutoRegisterBlockers(unresolved)).toContain("확정되지 않은 재료가 있어요.");
    expect(getRecipioAutoRegisterBlockers(incompleteStep)).toContain("필수 조리 단계가 비어 있어요.");
    expect(getRecipioAutoRegisterBlockers(buildExtractData({
      multi_recipe_status: "multiple",
      recipe_candidates: [
        {
          candidate_id: "candidate-1",
          title: "첫 번째 요리",
          start_ms: null,
          end_ms: null,
          confidence: 0.8,
          ingredients: buildExtractData().ingredients,
          steps: buildExtractData().steps,
          draft_warnings: [],
          blocking_issues: [],
          evidence_refs: [],
        },
        {
          candidate_id: "candidate-2",
          title: "두 번째 요리",
          start_ms: null,
          end_ms: null,
          confidence: 0.8,
          ingredients: buildExtractData().ingredients,
          steps: buildExtractData().steps,
          draft_warnings: [],
          blocking_issues: [],
          evidence_refs: [],
        },
      ],
    }))).toContain("영상 안에 여러 요리 후보가 있어요.");
  });

  it("builds the existing register contract from extracted data without leaking draft-only fields", () => {
    const registerBody = buildRecipioYoutubeRegisterBody(
      buildExtractData(),
      "https://www.youtube.com/watch?v=X9CqUvteeMo",
    );

    expect(registerBody).toEqual({
      extraction_id: "550e8400-e29b-41d4-a716-446655441201",
      title: "백종원 불어묵 꼬마김밥",
      base_servings: 1,
      youtube_url: "https://www.youtube.com/watch?v=X9CqUvteeMo",
      ingredients: [
        {
          ingredient_id: ingredientId,
          standard_name: "어묵",
          amount: 2,
          unit: "장",
          ingredient_type: "QUANT",
          display_text: "어묵 2장",
          component_label: "김밥 속재료",
          scalable: true,
          sort_order: 1,
        },
      ],
      steps: [
        {
          step_number: 1,
          instruction: "어묵을 잘게 썰어 볶아요.",
          component_label: "김밥 속재료",
          cooking_method_id: methodId,
          ingredients_used: [],
          heat_level: null,
          duration_seconds: null,
          duration_text: "5분",
        },
      ],
    });
  });

  it("keeps progress truthful by capping active extraction below completion", () => {
    expect(getRecipioYoutubeProgress({ phase: "extracting", elapsedMs: 90_000 }).percent).toBe(95);
    expect(getRecipioYoutubeProgress({ phase: "complete", elapsedMs: 90_000 }).percent).toBe(100);
  });
});
