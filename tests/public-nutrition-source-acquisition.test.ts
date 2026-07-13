import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const PIPELINE_MODULE = pathToFileURL(
  join(process.cwd(), "scripts/lib/public-nutrition-pipeline.mjs"),
).href;
const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/public-nutrition-source");

async function loadPipeline() {
  return import(PIPELINE_MODULE);
}

function fixture(name: string) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8"));
}

function errorCode(run: () => unknown) {
  try {
    run();
  } catch (error) {
    return (error as { code?: string }).code;
  }

  return null;
}

describe("public nutrition source acquisition core", () => {
  it("pins immutable raw metadata and normalizes the exact core-five code/unit schema", async () => {
    const { buildRawBatch, normalizeNutritionBatch } = await loadPipeline();
    const input = fixture("mfds-source-sample.json");
    const raw = buildRawBatch({ ...input, fetchedAt: "2026-07-13T00:00:00.000Z" });
    const normalized = normalizeNutritionBatch({
      rawSnapshot: raw.rawSnapshot,
      manifest: raw.manifest,
      adapterSchemaVersion: "nutrition-source-row-v1",
    });

    expect(raw.manifest).toMatchObject({
      status: "raw",
      source_version: "2025-12-05-fixture",
      data_basis_date: null,
      fetched_raw_count: 2,
      adapter_schema_version: "nutrition-source-row-v1",
      lifecycle: ["raw"],
    });
    expect(raw.manifest.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(normalized.rows[0].values)).toEqual([
      "energy_kcal",
      "carbohydrate_g",
      "protein_g",
      "fat_g",
      "sodium_mg",
    ]);
    expect(normalized.rows[0].values).toMatchObject({
      energy_kcal: { amount: 84, unit: "kcal", missing_reason: null },
      carbohydrate_g: { amount: 2.4, unit: "g", missing_reason: null },
      protein_g: { amount: 9.3, unit: "g", missing_reason: null },
      fat_g: { amount: 4.7, unit: "g", missing_reason: null },
      sodium_mg: { amount: 5, unit: "mg", missing_reason: null },
    });
  });

  it("keeps blank, dash, trace, and not-detected distinct from a real numeric zero", async () => {
    const { buildRawBatch, normalizeNutritionBatch } = await loadPipeline();
    const input = fixture("mfds-source-sample.json");
    const raw = buildRawBatch({ ...input, fetchedAt: "2026-07-13T00:00:00.000Z" });
    const normalized = normalizeNutritionBatch({
      rawSnapshot: raw.rawSnapshot,
      manifest: raw.manifest,
      adapterSchemaVersion: "nutrition-source-row-v1",
    });
    const values = normalized.rows[1].values;

    expect(values.energy_kcal).toMatchObject({ amount: 0, missing_reason: null });
    expect(values.carbohydrate_g).toMatchObject({ amount: null, missing_reason: "blank" });
    expect(values.protein_g).toMatchObject({ amount: null, missing_reason: "dash" });
    expect(values.fat_g).toMatchObject({ amount: null, missing_reason: "trace" });
    expect(values.sodium_mg).toMatchObject({ amount: null, missing_reason: "not_detected" });
  });

  it("quarantines basis parse, negative, unit mismatch, and malformed rows without guessing 100g", async () => {
    const { buildRawBatch, normalizeNutritionBatch } = await loadPipeline();
    const input = fixture("mfds-source-failure-sample.json");
    const raw = buildRawBatch({ ...input, fetchedAt: "2026-07-13T00:00:00.000Z" });
    const normalized = normalizeNutritionBatch({
      rawSnapshot: raw.rawSnapshot,
      manifest: raw.manifest,
      adapterSchemaVersion: "nutrition-source-row-v1",
    });

    expect(normalized.rows).toEqual([]);
    expect(normalized.quarantined.map((row: { reason_code: string }) => row.reason_code).sort()).toEqual([
      "basis_parse_failed",
      "malformed_nutrient",
      "negative_nutrient",
      "unit_mismatch",
    ]);
    expect(normalized.counts).toEqual({
      fetched_raw_count: 4,
      unique_input_count: 4,
      normalized_count: 0,
      deduplicated_identical_count: 0,
      quarantined_count: 4,
    });
  });

  it("deduplicates only identical rows and quarantines a conflicting duplicate with lossless counts", async () => {
    const { buildRawBatch, normalizeNutritionBatch } = await loadPipeline();
    const input = fixture("mfds-source-sample.json");
    const base = input.pages[0].items[0];
    input.pages[0].items = [base, structuredClone(base), {
      ...structuredClone(base),
      nutrients: { ...structuredClone(base.nutrients), energy: { value: "999", unit: "kcal" } },
    }];
    input.pages[0].total_count = 3;
    const raw = buildRawBatch({ ...input, fetchedAt: "2026-07-13T00:00:00.000Z" });
    const normalized = normalizeNutritionBatch({
      rawSnapshot: raw.rawSnapshot,
      manifest: raw.manifest,
      adapterSchemaVersion: "nutrition-source-row-v1",
    });

    expect(normalized.rows).toHaveLength(1);
    expect(normalized.quarantined).toEqual([
      expect.objectContaining({ reason_code: "conflicting_duplicate", external_item_key: "MFDS-001" }),
    ]);
    expect(normalized.counts).toEqual({
      fetched_raw_count: 3,
      unique_input_count: 2,
      normalized_count: 1,
      deduplicated_identical_count: 1,
      quarantined_count: 1,
    });
  });

  it("fails closed on raw checksum or adapter schema mismatch", async () => {
    const { buildRawBatch, normalizeNutritionBatch } = await loadPipeline();
    const input = fixture("mfds-source-sample.json");
    const raw = buildRawBatch({ ...input, fetchedAt: "2026-07-13T00:00:00.000Z" });
    const tampered = structuredClone(raw.rawSnapshot);
    tampered.pages[0].items[0].external_name = "tampered";

    expect(errorCode(() => normalizeNutritionBatch({
      rawSnapshot: tampered,
      manifest: raw.manifest,
      adapterSchemaVersion: "nutrition-source-row-v1",
    }))).toBe("RAW_CHECKSUM_MISMATCH");
    expect(errorCode(() => normalizeNutritionBatch({
      rawSnapshot: raw.rawSnapshot,
      manifest: raw.manifest,
      adapterSchemaVersion: "nutrition-source-row-v2",
    }))).toBe("ADAPTER_SCHEMA_MISMATCH");
  });

  it("promotes explicit approvals only and returns deterministic pinned handoff hashes", async () => {
    const {
      buildApprovedPinnedHandoff,
      buildNutritionReview,
      buildRawBatch,
      normalizeNutritionBatch,
    } = await loadPipeline();
    const input = fixture("mfds-source-sample.json");
    const evidence = fixture("rda-measurement-limited-evidence.json");
    const raw = buildRawBatch({ ...input, fetchedAt: "2026-07-13T00:00:00.000Z" });
    const normalized = normalizeNutritionBatch({
      rawSnapshot: raw.rawSnapshot,
      manifest: raw.manifest,
      adapterSchemaVersion: "nutrition-source-row-v1",
    });
    const decisions = [
      { fingerprint: normalized.rows[0].fingerprint, status: "approved" },
      { fingerprint: normalized.rows[1].fingerprint, status: "rejected" },
    ];
    const review = buildNutritionReview({ normalizedBundle: normalized, decisions, measurementEvidence: evidence });
    const first = buildApprovedPinnedHandoff({
      manifest: raw.manifest,
      normalizedBundle: normalized,
      reviewReport: review,
      measurementEvidence: evidence,
    });
    const second = buildApprovedPinnedHandoff({
      manifest: raw.manifest,
      normalizedBundle: normalized,
      reviewReport: review,
      measurementEvidence: evidence,
    });

    expect(first.approved_items).toHaveLength(1);
    expect(first.approved_items[0].fingerprint).toBe(normalized.rows[0].fingerprint);
    expect(first.public_attribution).toHaveLength(1);
    expect(Object.keys(first.public_attribution[0])).toEqual([
      "provider",
      "dataset",
      "source_version",
      "data_basis_date",
      "license",
      "source_url",
    ]);
    expect(first).toMatchObject({
      status: "approved_pinned",
      lifecycle: ["raw", "staged", "normalized", "reviewed", "approved_pinned"],
      production_db_writes: 0,
      handoff_checksum: second.handoff_checksum,
      normalized_content_hash: second.normalized_content_hash,
    });
  });

  it("blocks all promotion when any row is quarantined", async () => {
    const {
      buildApprovedPinnedHandoff,
      buildNutritionReview,
      buildRawBatch,
      normalizeNutritionBatch,
    } = await loadPipeline();
    const input = fixture("mfds-source-failure-sample.json");
    const raw = buildRawBatch({ ...input, fetchedAt: "2026-07-13T00:00:00.000Z" });
    const normalized = normalizeNutritionBatch({
      rawSnapshot: raw.rawSnapshot,
      manifest: raw.manifest,
      adapterSchemaVersion: "nutrition-source-row-v1",
    });
    const review = buildNutritionReview({ normalizedBundle: normalized, decisions: [] });

    expect(review.blocker_count).toBeGreaterThan(0);
    expect(errorCode(() => buildApprovedPinnedHandoff({
      manifest: raw.manifest,
      normalizedBundle: normalized,
      reviewReport: review,
      measurementEvidence: [],
    }))).toBe("PROMOTION_BLOCKED");
  });
});
