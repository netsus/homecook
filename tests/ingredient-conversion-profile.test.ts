import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const MODULE_URL = pathToFileURL(
  `${process.cwd()}/scripts/lib/ingredient-conversion-domain.mjs`,
).href;

async function loadConversion(): Promise<Record<string, unknown>> {
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
  expect(module[name], `missing conversion behavior: ${name}`).toBeTypeOf("function");
  return module[name] as (...args: never[]) => unknown;
}

describe("ingredient measurement conversion profiles", () => {
  it("binds the exact representative volume codes to 6/10/15/20/25 grams", async () => {
    const conversion = await loadConversion();

    expect(conversion.VOLUME_PROFILES, "missing conversion behavior: VOLUME_PROFILES").toEqual([
      { code: "VOLUME_G6", basis_volume_ml: 15, representative_weight_g: 6, display_qualifier: "approximate" },
      { code: "VOLUME_G10", basis_volume_ml: 15, representative_weight_g: 10, display_qualifier: "approximate" },
      { code: "VOLUME_G15", basis_volume_ml: 15, representative_weight_g: 15, display_qualifier: "approximate" },
      { code: "VOLUME_G20", basis_volume_ml: 15, representative_weight_g: 20, display_qualifier: "approximate" },
      { code: "VOLUME_G25", basis_volume_ml: 15, representative_weight_g: 25, display_qualifier: "approximate" },
    ]);
  });

  it("includes unique distance 2.5, rejects 2.5001, and retains exact evidence for 20.6 and 21.0", async () => {
    const conversion = await loadConversion();
    const generateVolumeCandidates = requireFunction(conversion, "generateVolumeCandidates");

    const boundary = generateVolumeCandidates({
      ingredient_id: "ingredient-1",
      evidence_id: "evidence-boundary",
      normalized_g_per_15ml: 3.5,
      preparation_state: "liquid",
      compatibility: "compatible",
      evidence_review_status: "approved",
      evidence_is_active: true,
      source_freshness_status: "current",
      source_review_status: "approved",
      source_is_active: true,
    } as never) as { candidates: Array<Record<string, unknown>>; reason_codes: string[] };
    expect(boundary.candidates).toEqual([
      expect.objectContaining({
        conversion_profile_code: "VOLUME_G6",
        distance_g_per_15ml: 2.5,
        review_status: "pending",
        is_active: false,
      }),
    ]);

    const exceeded = generateVolumeCandidates({
      ingredient_id: "ingredient-1",
      evidence_id: "evidence-exceeded",
      normalized_g_per_15ml: 3.4999,
      preparation_state: "liquid",
      compatibility: "compatible",
      evidence_review_status: "approved",
      evidence_is_active: true,
      source_freshness_status: "current",
      source_review_status: "approved",
      source_is_active: true,
    } as never) as { candidates: Array<Record<string, unknown>>; reason_codes: string[] };
    expect(exceeded.candidates).toEqual([]);
    expect(exceeded.reason_codes).toContain("NO_PROFILE_WITHIN_DISTANCE");

    for (const [value, distance] of [[20.6, 0.6], [21, 1]] as const) {
      const result = generateVolumeCandidates({
        ingredient_id: "ingredient-1",
        evidence_id: `evidence-${value}`,
        normalized_g_per_15ml: value,
        preparation_state: "liquid",
        compatibility: "compatible",
        evidence_review_status: "approved",
        evidence_is_active: true,
        source_freshness_status: "current",
        source_review_status: "approved",
        source_is_active: true,
      } as never) as { candidates: Array<Record<string, unknown>> };
      expect(result.candidates).toEqual([
        expect.objectContaining({
          conversion_profile_code: "VOLUME_G20",
          evidence_normalized_g_per_15ml: value,
          distance_g_per_15ml: distance,
          review_status: "pending",
          is_active: false,
        }),
      ]);
    }
  });

  it("fails closed for exact halfway ties at 17.5 and 22.5", async () => {
    const conversion = await loadConversion();
    const generateVolumeCandidates = requireFunction(conversion, "generateVolumeCandidates");

    for (const [value, codes] of [
      [17.5, ["VOLUME_G15", "VOLUME_G20"]],
      [22.5, ["VOLUME_G20", "VOLUME_G25"]],
    ] as const) {
      const result = generateVolumeCandidates({
        ingredient_id: "ingredient-1",
        evidence_id: `tie-${value}`,
        normalized_g_per_15ml: value,
        preparation_state: "liquid",
        compatibility: "compatible",
        evidence_review_status: "approved",
        evidence_is_active: true,
        source_freshness_status: "current",
        source_review_status: "approved",
        source_is_active: true,
      } as never) as { candidates: Array<Record<string, unknown>>; reason_codes: string[] };

      expect(result.reason_codes).toContain("TIED_CONVERSION_PROFILE");
      expect(result.candidates.map((candidate) => candidate.conversion_profile_code)).toEqual(codes);
      expect(result.candidates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ review_status: "needs_review", is_active: false, candidate_rank: 1 }),
        ]),
      );
    }
  });

  it("keeps an in-range candidate inactive and needs_review when preparation compatibility is ambiguous", async () => {
    const conversion = await loadConversion();
    const generateVolumeCandidates = requireFunction(conversion, "generateVolumeCandidates");

    const result = generateVolumeCandidates({
      ingredient_id: "ingredient-1",
      evidence_id: "ambiguous-evidence",
      normalized_g_per_15ml: 20.6,
      preparation_state: "unknown",
      compatibility: "ambiguous",
      evidence_review_status: "approved",
      evidence_is_active: true,
      source_freshness_status: "current",
      source_review_status: "approved",
      source_is_active: true,
    } as never) as { candidates: Array<Record<string, unknown>>; reason_codes: string[] };

    expect(result.reason_codes).toContain("AMBIGUOUS_MEASUREMENT_COMPATIBILITY");
    expect(result.candidates).toEqual([
      expect.objectContaining({
        conversion_profile_code: "VOLUME_G20",
        review_status: "needs_review",
        is_active: false,
      }),
    ]);
  });

  it("excludes stale or unapproved measurement evidence before generating assignments", async () => {
    const conversion = await loadConversion();
    const generateVolumeCandidates = requireFunction(conversion, "generateVolumeCandidates");

    const result = generateVolumeCandidates({
      ingredient_id: "ingredient-1",
      evidence_id: "stale-evidence",
      normalized_g_per_15ml: 20,
      preparation_state: "liquid",
      compatibility: "compatible",
      evidence_review_status: "approved",
      evidence_is_active: true,
      source_freshness_status: "stale",
      source_review_status: "approved",
      source_is_active: true,
    } as never) as { candidates: unknown[]; reason_codes: string[] };

    expect(result.candidates).toEqual([]);
    expect(result.reason_codes).toContain("SOURCE_NOT_CURRENT");
  });

  it("normalizes tbsp/tsp/cup/mL/L deterministically", async () => {
    const conversion = await loadConversion();
    const normalizeVolumeMl = requireFunction(conversion, "normalizeVolumeMl");

    expect(normalizeVolumeMl(1 as never, "tbsp" as never)).toBe(15);
    expect(normalizeVolumeMl(1 as never, "tsp" as never)).toBe(5);
    expect(normalizeVolumeMl(1 as never, "cup" as never)).toBe(200);
    expect(normalizeVolumeMl(250 as never, "ml" as never)).toBe(250);
    expect(normalizeVolumeMl(1 as never, "l" as never)).toBe(1000);
  });

  it("converts pieces only through an exact active approved ingredient-size-preparation row", async () => {
    const conversion = await loadConversion();
    const convertPieceToGrams = requireFunction(conversion, "convertPieceToGrams");
    const rows = [{
      ingredient_id: "ingredient-lemon",
      size_code: "medium",
      preparation_state: "edible",
      weight_g: 80,
      review_status: "approved",
      is_active: true,
    }];

    expect(convertPieceToGrams({
      ingredient_id: "ingredient-lemon",
      size_code: "medium",
      preparation_state: "edible",
      piece_count: 0.25,
    } as never, rows as never)).toEqual({ grams: 20, source: "piece_unit_weight" });

    for (const request of [
      { ingredient_id: "ingredient-lemon", size_code: null, preparation_state: "edible", piece_count: 1 },
      { ingredient_id: "ingredient-lemon", size_code: "large", preparation_state: "edible", piece_count: 1 },
      { ingredient_id: "ingredient-lemon", size_code: "medium", preparation_state: "whole", piece_count: 1 },
    ]) {
      expect(() => convertPieceToGrams(request as never, rows as never)).toThrowError(
        expect.objectContaining({ code: "PIECE_WEIGHT_REQUIRED" }),
      );
    }
  });

  it("activates only explicit audited approval and excludes revoked assignments", async () => {
    const conversion = await loadConversion();
    const transitionAssignment = requireFunction(conversion, "transitionAssignment");
    const selectActiveAssignment = requireFunction(conversion, "selectActiveAssignment");
    const pending = { id: "assignment-1", review_status: "pending", is_active: false };

    const approved = transitionAssignment(pending as never, {
      status: "approved",
      actor: "operator-1",
      reason: "measurement reviewed",
      reviewed_at: "2026-07-14T00:00:00.000Z",
    } as never) as Record<string, unknown>;
    expect(approved).toMatchObject({ review_status: "approved", is_active: true });
    expect(selectActiveAssignment([approved] as never)).toEqual(approved);

    const revoked = transitionAssignment(approved as never, {
      status: "revoked",
      actor: "operator-2",
      reason: "evidence superseded",
      reviewed_at: "2026-07-14T01:00:00.000Z",
    } as never) as Record<string, unknown>;
    expect(selectActiveAssignment([revoked] as never)).toBeNull();
  });
});
