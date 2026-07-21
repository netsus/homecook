import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { describe, expect, it, vi } from "vitest";

const MODULE_URL = pathToFileURL(
  `${process.cwd()}/scripts/apply-nutrition-review-results.mjs`,
).href;

async function loadModule(): Promise<Record<string, unknown>> {
  try {
    return await import(MODULE_URL);
  } catch {
    return {};
  }
}

describe("nutrition review apply CLI safety", () => {
  it("requires both the explicit flag and environment approval before local DB writes", async () => {
    const applyModule = await loadModule();
    expect(applyModule.assertNutritionReviewWriteApproved).toBeTypeOf("function");
    const assertNutritionReviewWriteApproved = applyModule.assertNutritionReviewWriteApproved as (
      input: Record<string, unknown>,
    ) => void;

    expect(() => assertNutritionReviewWriteApproved({
      mode: "apply",
      allowWrite: false,
      env: { HOMECOOK_NUTRITION_REVIEW_WRITE_APPROVED: "1" },
    })).toThrow("WRITE_APPROVAL_REQUIRED");
    expect(() => assertNutritionReviewWriteApproved({
      mode: "apply",
      allowWrite: true,
      env: {},
    })).toThrow("WRITE_APPROVAL_REQUIRED");
    expect(() => assertNutritionReviewWriteApproved({
      mode: "apply",
      allowWrite: true,
      env: { HOMECOOK_NUTRITION_REVIEW_WRITE_APPROVED: "1" },
    })).not.toThrow();
    expect(() => assertNutritionReviewWriteApproved({
      mode: "finalize",
      allowWrite: false,
      env: {},
    })).not.toThrow();
  });

  it("uses the durable reviewed payload when source snapshots are unavailable", async () => {
    const applyModule = await loadModule();
    expect(applyModule.selectNutritionReviewFinalization).toBeTypeOf("function");
    const selectNutritionReviewFinalization = applyModule.selectNutritionReviewFinalization as (
      input: Record<string, unknown>,
    ) => unknown;
    const buildFinalization = vi.fn(() => ({ source: "rebuilt" }));
    const readDurablePayload = vi.fn(() => ({ source: "durable" }));

    expect(selectNutritionReviewFinalization({
      sourcesAvailable: false,
      buildFinalization,
      readDurablePayload,
    })).toEqual({ source: "durable" });
    expect(buildFinalization).not.toHaveBeenCalled();
    expect(readDurablePayload).toHaveBeenCalledOnce();
  });

  it("rejects a durable payload whose reviewed contents no longer match its checksum", async () => {
    const applyModule = await loadModule();
    expect(applyModule.validateNutritionReviewApplyPayload).toBeTypeOf("function");
    const validateNutritionReviewApplyPayload = applyModule.validateNutritionReviewApplyPayload as (
      input: Record<string, unknown>,
    ) => Record<string, unknown>;
    const payload = JSON.parse(readFileSync(
      `${process.cwd()}/outputs/nutrition-review-20260721/homecook-nutrition-review-apply.json`,
      "utf8",
    ));

    expect(validateNutritionReviewApplyPayload(payload)).toBe(payload);
    expect(() => validateNutritionReviewApplyPayload({
      ...payload,
      summary: { ...payload.summary, apply_count: 84 },
    })).toThrow("DURABLE_REVIEW_PAYLOAD_INVALID");
  });

  it("keeps immutable source inputs separate from final review outputs", async () => {
    const applyModule = await loadModule();
    expect(applyModule.NUTRITION_REVIEW_OUTPUT_PATHS).toMatchObject({
      sourceReport: expect.any(String),
      sourceReview: expect.any(String),
      finalReport: expect.any(String),
      finalReview: expect.any(String),
    });
    const paths = applyModule.NUTRITION_REVIEW_OUTPUT_PATHS as Record<string, string>;

    expect(paths.finalReport).not.toBe(paths.sourceReport);
    expect(paths.finalReview).not.toBe(paths.sourceReview);
  });

  it("removes local database identifiers from the durable execution result", async () => {
    const applyModule = await loadModule();
    expect(applyModule.sanitizeLocalDatabaseResult).toBeTypeOf("function");
    const sanitizeLocalDatabaseResult = applyModule.sanitizeLocalDatabaseResult as (
      input: Record<string, unknown>,
    ) => Record<string, unknown>;

    expect(sanitizeLocalDatabaseResult({
      status: "applied",
      replayed: true,
      applied_count: 85,
      writes_committed: 0,
      source_ids: ["local-source-id"],
      nutrition_link_ids: ["local-link-id"],
      production_db_writes: 0,
    })).toEqual({
      status: "applied",
      replayed: true,
      applied_count: 85,
      writes_committed: 0,
    });
  });
});
