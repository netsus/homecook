import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  classifyYoutubeIngredientResolutionTransition,
  resolveYoutubeIngredientAgainstCatalog,
} from "@/lib/server/youtube-ingredient-resolution-regression";

const catalog = {
  ingredients: [
    { id: "tofu", standard_name: "두부" },
    { id: "pasta", standard_name: "파스타면" },
    { id: "direct", standard_name: "큰 사이즈 두부" },
  ],
  synonyms: [
    { ingredient_id: "pasta", synonym: "스파게티면" },
    { ingredient_id: "tofu", synonym: "콩 두부" },
  ],
};

describe("YouTube ingredient resolution regression delta", () => {
  it("records only reviewable changes across all 30 frozen v59 outputs", () => {
    const report = JSON.parse(readFileSync(
      "docs/engineering/data/youtube-ingredient-resolution-v59-dev30-regression-20261009.json",
      "utf8",
    )) as {
      scope: Record<string, number>;
      transition_summary: Record<string, number>;
      changed_rows: Array<{ name: string; transition: string }>;
      evaluation_contract: { accuracy_claim_for_unreviewed_rows: boolean };
    };

    expect(report.scope).toMatchObject({
      video_count: 30,
      ingredient_occurrence_count: 344,
      policy_unchanged_occurrence_count: 341,
      policy_delta_eligible_occurrence_count: 3,
    });
    expect(report.transition_summary).toMatchObject({
      newly_resolved: 3,
      resolved_id_changed: 0,
      resolved_to_needs_review: 0,
      resolved_to_unresolved: 0,
      newly_needs_review: 0,
    });
    expect(report.changed_rows.map((row) => [row.name, row.transition])).toEqual([
      ["큰 사이즈 두부", "newly_resolved"],
      ["맛술(미림)", "newly_resolved"],
      ["스파게티", "newly_resolved"],
    ]);
    expect(report.evaluation_contract.accuracy_claim_for_unreviewed_rows).toBe(false);
  });

  it("uses fallback candidates only after exact rank has no matches", () => {
    expect(resolveYoutubeIngredientAgainstCatalog({
      name: "큰 사이즈 두부", unit: "모", rawText: "큰 사이즈 두부 1모",
    }, catalog, { expandLookupCandidates: true })).toEqual({
      status: "resolved", candidate_ids: ["direct"], final_id: "direct",
    });
    expect(resolveYoutubeIngredientAgainstCatalog({
      name: "작은 사이즈 두부", unit: "모", rawText: "작은 사이즈 두부 1모",
    }, catalog, { expandLookupCandidates: true })).toEqual({
      status: "resolved", candidate_ids: ["tofu"], final_id: "tofu",
    });
  });

  it("preserves ambiguity and classifies harmful transitions separately", () => {
    const ambiguousCatalog = {
      ingredients: catalog.ingredients,
      synonyms: [
        ...catalog.synonyms,
        { ingredient_id: "other", synonym: "콩 두부" },
      ],
    };
    expect(resolveYoutubeIngredientAgainstCatalog({
      name: "콩 두부", unit: null, rawText: "콩 두부",
    }, ambiguousCatalog, { expandLookupCandidates: false })).toEqual({
      status: "needs_review", candidate_ids: ["other", "tofu"], final_id: null,
    });
    expect(classifyYoutubeIngredientResolutionTransition(
      { status: "resolved", candidate_ids: ["tofu"], final_id: "tofu" },
      { status: "resolved", candidate_ids: ["other"], final_id: "other" },
    )).toBe("resolved_id_changed");
    expect(classifyYoutubeIngredientResolutionTransition(
      { status: "resolved", candidate_ids: ["tofu"], final_id: "tofu" },
      { status: "needs_review", candidate_ids: ["other", "tofu"], final_id: null },
    )).toBe("resolved_to_needs_review");
  });

  it("requires explicit spaghetti evidence before using the noodle synonym", () => {
    expect(resolveYoutubeIngredientAgainstCatalog({
      name: "스파게티", unit: "g", rawText: "Spaghetti 250g",
    }, catalog, { expandLookupCandidates: true })).toEqual({
      status: "resolved", candidate_ids: ["pasta"], final_id: "pasta",
    });
    expect(resolveYoutubeIngredientAgainstCatalog({
      name: "스파게티", unit: "인분", rawText: "오늘은 스파게티",
    }, catalog, { expandLookupCandidates: true })).toEqual({
      status: "unresolved", candidate_ids: [], final_id: null,
    });
    for (const rawText of [
      "Spaghetti sauce 250g",
      "Cooked Spaghetti 250g",
      "Barilla Spaghetti 250g",
      "Spaghetti squash 250g",
    ]) {
      expect(resolveYoutubeIngredientAgainstCatalog({
        name: "스파게티", unit: "g", rawText,
      }, catalog, { expandLookupCandidates: true }), rawText).toEqual({
        status: "unresolved", candidate_ids: [], final_id: null,
      });
    }
  });
});
