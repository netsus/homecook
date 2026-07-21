import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const MODULE_URL = pathToFileURL(
  `${process.cwd()}/scripts/lib/ingredient-nutrition-matching.mjs`,
).href;

async function loadMatching(): Promise<Record<string, unknown>> {
  try {
    return await import(MODULE_URL);
  } catch {
    return {};
  }
}

function requireFunction(
  module: Record<string, unknown>,
  name: string,
): (...args: never[]) => unknown {
  expect(module[name], `missing matching behavior: ${name}`).toBeTypeOf("function");
  return module[name] as (...args: never[]) => unknown;
}

const ingredient = {
  ingredient_id: "ingredient-tofu",
  normalized_names: ["두부", "tofu"],
  preparation_state: "raw",
  edible_portion: "edible",
  basis_dimension: "mass",
};

describe("ingredient nutrition candidate matching", () => {
  it("applies MFDS rank 1 and RDA 10.4 rank 2 only after semantic compatibility", async () => {
    const matching = await loadMatching();
    const rankNutritionCandidates = requireFunction(matching, "rankNutritionCandidates");

    const result = rankNutritionCandidates(ingredient as never, [
      {
        id: "mfds-incompatible",
        provider_code: "MFDS",
        normalized_name: "두부",
        preparation_state: "fried",
        edible_portion: "edible",
        basis_dimension: "mass",
        confidence_score: 1,
        freshness_status: "current",
        source_review_status: "approved",
        source_is_active: true,
      },
      {
        id: "rda-compatible",
        provider_code: "RDA_10_4",
        normalized_name: "두부",
        preparation_state: "raw",
        edible_portion: "edible",
        basis_dimension: "mass",
        confidence_score: 0.7,
        freshness_status: "current",
        source_review_status: "approved",
        source_is_active: true,
      },
    ] as never) as { candidates: Array<Record<string, unknown>> };

    expect(result.candidates).toEqual([
      expect.objectContaining({
        id: "rda-compatible",
        candidate_rank: 2,
        review_status: "pending",
        is_active: false,
      }),
    ]);
  });

  it("ranks K-FIND rows by their original NIFS/MFDS provenance", async () => {
    const matching = await loadMatching();
    const rankNutritionCandidates = requireFunction(matching, "rankNutritionCandidates");

    const result = rankNutritionCandidates(ingredient as never, [
      {
        id: "kfind-mfds",
        provider_code: "MFDS_KFIND",
        normalized_name: "두부",
        preparation_state: "raw",
        edible_portion: "edible",
        basis_dimension: "mass",
        freshness_status: "current",
        source_review_status: "approved",
        source_is_active: true,
      },
      {
        id: "kfind-nifs",
        provider_code: "NIFS_KFIND",
        normalized_name: "tofu",
        preparation_state: "raw",
        edible_portion: "edible",
        basis_dimension: "mass",
        freshness_status: "current",
        source_review_status: "approved",
        source_is_active: true,
      },
    ] as never) as { candidates: Array<Record<string, unknown>> };

    expect(result.candidates).toEqual([
      expect.objectContaining({ id: "kfind-nifs", candidate_rank: 1 }),
      expect.objectContaining({ id: "kfind-mfds", candidate_rank: 3 }),
    ]);
  });

  it("never auto-approves exact or confidence-1 candidates and fails closed on an ambiguous tie", async () => {
    const matching = await loadMatching();
    const rankNutritionCandidates = requireFunction(matching, "rankNutritionCandidates");

    const result = rankNutritionCandidates(ingredient as never, [
      {
        id: "mfds-a",
        provider_code: "MFDS",
        normalized_name: "두부",
        preparation_state: "raw",
        edible_portion: "edible",
        basis_dimension: "mass",
        confidence_score: 1,
        freshness_status: "current",
        source_review_status: "approved",
        source_is_active: true,
      },
      {
        id: "mfds-b",
        provider_code: "MFDS",
        normalized_name: "tofu",
        preparation_state: "raw",
        edible_portion: "edible",
        basis_dimension: "mass",
        confidence_score: 1,
        freshness_status: "current",
        source_review_status: "approved",
        source_is_active: true,
      },
    ] as never) as {
      candidates: Array<Record<string, unknown>>;
      reason_codes: string[];
    };

    expect(result.reason_codes).toContain("AMBIGUOUS_NUTRITION_MATCH");
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ review_status: "needs_review", is_active: false }),
      ]),
    );
  });

  it("excludes stale, unapproved, or inactive sources before candidate ranking", async () => {
    const matching = await loadMatching();
    const rankNutritionCandidates = requireFunction(matching, "rankNutritionCandidates");

    const result = rankNutritionCandidates(ingredient as never, [
      {
        id: "mfds-stale",
        provider_code: "MFDS",
        normalized_name: "두부",
        preparation_state: "raw",
        edible_portion: "edible",
        basis_dimension: "mass",
        freshness_status: "stale",
        source_review_status: "approved",
        source_is_active: true,
      },
    ] as never) as { candidates: unknown[]; reason_codes: string[] };

    expect(result.candidates).toEqual([]);
    expect(result.reason_codes).toContain("SOURCE_NOT_CURRENT");
  });

  it("requires explicit audited approval before a nutrition link becomes active", async () => {
    const matching = await loadMatching();
    const transitionReviewDecision = requireFunction(matching, "transitionReviewDecision");
    const selectActiveNutritionProfile = requireFunction(
      matching,
      "selectActiveNutritionProfile",
    );

    const pending = {
      id: "link-1",
      review_status: "pending",
      is_active: false,
      is_primary: false,
    };
    const approved = transitionReviewDecision(pending as never, {
      status: "approved",
      actor: "operator-1",
      reason: "semantic match reviewed",
      reviewed_at: "2026-07-14T00:00:00.000Z",
    } as never) as Record<string, unknown>;

    expect(approved).toMatchObject({
      review_status: "approved",
      is_active: true,
      is_primary: true,
      reviewed_by: "operator-1",
      decision_reason: "semantic match reviewed",
    });
    expect(selectActiveNutritionProfile([approved] as never)).toEqual(approved);
  });

  it("excludes revoked nutrition links and rejects resurrection", async () => {
    const matching = await loadMatching();
    const transitionReviewDecision = requireFunction(matching, "transitionReviewDecision");
    const selectActiveNutritionProfile = requireFunction(
      matching,
      "selectActiveNutritionProfile",
    );
    const approved = {
      id: "link-1",
      review_status: "approved",
      is_active: true,
      is_primary: true,
    };
    const revoked = transitionReviewDecision(approved as never, {
      status: "revoked",
      actor: "operator-2",
      reason: "source withdrawn",
      reviewed_at: "2026-07-14T01:00:00.000Z",
    } as never) as Record<string, unknown>;

    expect(revoked).toMatchObject({ review_status: "revoked", is_active: false });
    expect(selectActiveNutritionProfile([revoked] as never)).toBeNull();
    expect(() => transitionReviewDecision(revoked as never, {
      status: "approved",
      actor: "operator-3",
      reason: "invalid resurrection",
      reviewed_at: "2026-07-14T02:00:00.000Z",
    } as never)).toThrowError(expect.objectContaining({ code: "INVALID_REVIEW_TRANSITION" }));
  });
});
