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

  it("preserves raw MFDS provider rows and adapts official fields at normalization", async () => {
    const { buildRawBatch, normalizeNutritionBatch } = await loadPipeline();
    const input = fixture("mfds-provider-shaped-sample.json");
    const raw = buildRawBatch({ ...input, fetchedAt: "2026-07-13T00:00:00.000Z" });
    const normalized = normalizeNutritionBatch({
      rawSnapshot: raw.rawSnapshot,
      manifest: raw.manifest,
      adapterSchemaVersion: "nutrition-source-row-v1",
    });

    expect(raw.rawSnapshot.pages[0].items).toEqual(input.pages[0].items);
    expect(raw.manifest.input_shape).toBe("mfds-provider-v1");
    expect(normalized.rows[0]).toMatchObject({
      external_item_key: "MFDS-PROVIDER-001",
      external_name: "공식 필드 검수 두부",
      values: {
        energy_kcal: { amount: 84, unit: "kcal" },
        carbohydrate_g: { amount: 2.4, unit: "g" },
        protein_g: { amount: 9.3, unit: "g" },
        fat_g: { amount: 4.7, unit: "g" },
        sodium_mg: { amount: 5, unit: "mg" },
        sugars_g: { amount: 0.7, unit: "g" },
        fiber_g: { amount: 1.2, unit: "g" },
        saturated_fat_g: { amount: 0.8, unit: "g" },
      },
    });
    expect(normalized.rows[1].values).toMatchObject({
      energy_kcal: { amount: 0, missing_reason: null },
      carbohydrate_g: { amount: null, missing_reason: "blank" },
      protein_g: { amount: null, missing_reason: "dash" },
      fat_g: { amount: null, missing_reason: "trace" },
      sodium_mg: { amount: null, missing_reason: "not_detected" },
    });
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
      { fingerprint: normalized.rows[1].fingerprint, status: "approved" },
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

    expect(first.approved_items).toHaveLength(2);
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

  it("rejects a review that is not pinned to the normalized bundle being promoted", async () => {
    const {
      buildApprovedPinnedHandoff,
      buildNutritionReview,
      buildRawBatch,
      normalizeNutritionBatch,
    } = await loadPipeline();
    const input = fixture("mfds-source-sample.json");
    const raw = buildRawBatch({ ...input, fetchedAt: "2026-07-13T00:00:00.000Z" });
    const normalized = normalizeNutritionBatch({
      rawSnapshot: raw.rawSnapshot,
      manifest: raw.manifest,
      adapterSchemaVersion: "nutrition-source-row-v1",
    });
    const review = buildNutritionReview({
      normalizedBundle: normalized,
      decisions: normalized.rows.map((row: { fingerprint: string }) => ({
        fingerprint: row.fingerprint,
        status: "approved",
      })),
    });
    const otherReview = structuredClone(review);
    otherReview.normalized_content_hash = "0".repeat(64);

    expect(errorCode(() => buildApprovedPinnedHandoff({
      manifest: raw.manifest,
      normalizedBundle: normalized,
      reviewReport: otherReview,
      measurementEvidence: [],
    }))).toBe("REVIEW_CONTENT_MISMATCH");
  });

  it("rejects measurement evidence that differs from the reviewed evidence", async () => {
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
    const review = buildNutritionReview({
      normalizedBundle: normalized,
      decisions: normalized.rows.map((row: { fingerprint: string }) => ({
        fingerprint: row.fingerprint,
        status: "approved",
      })),
      measurementEvidence: evidence,
    });
    const tamperedEvidence = structuredClone(evidence);
    tamperedEvidence[0].observed_g_per_15ml = 99;

    expect(errorCode(() => buildApprovedPinnedHandoff({
      manifest: raw.manifest,
      normalizedBundle: normalized,
      reviewReport: review,
      measurementEvidence: tamperedEvidence,
    }))).toBe("REVIEW_EVIDENCE_MISMATCH");
  });

  it("recomputes normalized content identity before promotion", async () => {
    const {
      buildApprovedPinnedHandoff,
      buildNutritionReview,
      buildRawBatch,
      normalizeNutritionBatch,
    } = await loadPipeline();
    const input = fixture("mfds-source-sample.json");
    const raw = buildRawBatch({ ...input, fetchedAt: "2026-07-13T00:00:00.000Z" });
    const normalized = normalizeNutritionBatch({
      rawSnapshot: raw.rawSnapshot,
      manifest: raw.manifest,
      adapterSchemaVersion: "nutrition-source-row-v1",
    });
    const review = buildNutritionReview({
      normalizedBundle: normalized,
      decisions: normalized.rows.map((row: { fingerprint: string }) => ({
        fingerprint: row.fingerprint,
        status: "approved",
      })),
    });
    const tampered = structuredClone(normalized);
    tampered.rows[0].values.energy_kcal.amount = 999;

    expect(errorCode(() => buildApprovedPinnedHandoff({
      manifest: raw.manifest,
      normalizedBundle: tampered,
      reviewReport: review,
      measurementEvidence: [],
    }))).toBe("NORMALIZED_CONTENT_HASH_MISMATCH");
  });

  it("requires manifest, normalized, and review batch/raw/schema pins to agree", async () => {
    const {
      buildApprovedPinnedHandoff,
      buildNutritionReview,
      buildRawBatch,
      normalizeNutritionBatch,
    } = await loadPipeline();
    const input = fixture("mfds-source-sample.json");
    const raw = buildRawBatch({ ...input, fetchedAt: "2026-07-13T00:00:00.000Z" });
    const normalized = normalizeNutritionBatch({
      rawSnapshot: raw.rawSnapshot,
      manifest: raw.manifest,
      adapterSchemaVersion: "nutrition-source-row-v1",
    });
    const review = buildNutritionReview({
      normalizedBundle: normalized,
      decisions: normalized.rows.map((row: { fingerprint: string }) => ({
        fingerprint: row.fingerprint,
        status: "approved",
      })),
    });
    const cases = [
      { manifest: { ...raw.manifest, logical_batch_id: "other" }, normalized, review },
      { manifest: raw.manifest, normalized: { ...normalized, logical_batch_id: "other" }, review },
      { manifest: raw.manifest, normalized: { ...normalized, raw_sha256: "other" }, review },
      { manifest: raw.manifest, normalized: { ...normalized, adapter_schema_version: "other" }, review },
      { manifest: raw.manifest, normalized, review: { ...review, logical_batch_id: "other" } },
    ];

    for (const current of cases) {
      expect(errorCode(() => buildApprovedPinnedHandoff({
        manifest: current.manifest,
        normalizedBundle: current.normalized,
        reviewReport: current.review,
        measurementEvidence: [],
      }))).toBe("BATCH_PIN_MISMATCH");
    }
  });

  it("recomputes logical identity and pins normalized source provenance to the manifest", async () => {
    const {
      buildApprovedPinnedHandoff,
      buildNutritionReview,
      buildRawBatch,
      normalizeNutritionBatch,
    } = await loadPipeline();
    const input = fixture("mfds-source-sample.json");
    const raw = buildRawBatch({ ...input, fetchedAt: "2026-07-13T00:00:00.000Z" });
    const normalized = normalizeNutritionBatch({
      rawSnapshot: raw.rawSnapshot,
      manifest: raw.manifest,
      adapterSchemaVersion: "nutrition-source-row-v1",
    });
    const review = buildNutritionReview({
      normalizedBundle: normalized,
      decisions: normalized.rows.map((row: { fingerprint: string }) => ({
        fingerprint: row.fingerprint,
        status: "approved",
      })),
    });
    const promote = (manifest: unknown, bundle: unknown) => buildApprovedPinnedHandoff({
      manifest,
      normalizedBundle: bundle,
      reviewReport: review,
      measurementEvidence: [],
    });

    expect(errorCode(() => promote(
      { ...raw.manifest, provider: "변조된 기관" },
      normalized,
    ))).toBe("BATCH_PIN_MISMATCH");
    expect(errorCode(() => promote(
      { ...raw.manifest, license: "변조된 이용조건" },
      { ...normalized, source: { ...normalized.source, license: "변조된 이용조건" } },
    ))).toBe("BATCH_PIN_MISMATCH");
    expect(errorCode(() => promote(
      raw.manifest,
      { ...normalized, source: { ...normalized.source, dataset: "변조된 dataset" } },
    ))).toBe("SOURCE_PIN_MISMATCH");
    expect(errorCode(() => promote(
      { ...raw.manifest, license_evidence_url: "" },
      normalized,
    ))).toBe("MANIFEST_PROVENANCE_INVALID");
    expect(errorCode(() => promote(
      { ...raw.manifest, endpoint_or_file_url: "https://example.test/data?serviceKey=secret" },
      normalized,
    ))).toBe("MANIFEST_PROVENANCE_INVALID");
  });

  it("blocks promotion unless every normalized row is explicitly approved", async () => {
    const {
      buildApprovedPinnedHandoff,
      buildNutritionReview,
      buildRawBatch,
      normalizeNutritionBatch,
    } = await loadPipeline();
    const input = fixture("mfds-source-sample.json");
    const raw = buildRawBatch({ ...input, fetchedAt: "2026-07-13T00:00:00.000Z" });
    const normalized = normalizeNutritionBatch({
      rawSnapshot: raw.rawSnapshot,
      manifest: raw.manifest,
      adapterSchemaVersion: "nutrition-source-row-v1",
    });
    const review = buildNutritionReview({
      normalizedBundle: normalized,
      decisions: [{ fingerprint: normalized.rows[0].fingerprint, status: "approved" }],
    });

    expect(review.reviewed_rows).toEqual([
      expect.objectContaining({ status: "approved" }),
      expect.objectContaining({ status: "pending" }),
    ]);
    expect(errorCode(() => buildApprovedPinnedHandoff({
      manifest: raw.manifest,
      normalizedBundle: normalized,
      reviewReport: review,
      measurementEvidence: [],
    }))).toBe("PROMOTION_BLOCKED");
  });

  it("excludes fetched_at from content identity and scopes fingerprints by source", async () => {
    const { buildRawBatch, normalizeNutritionBatch } = await loadPipeline();
    const input = fixture("mfds-source-sample.json");
    const first = buildRawBatch({ ...input, fetchedAt: "2026-07-13T00:00:00.000Z" });
    const second = buildRawBatch({ ...input, fetchedAt: "2026-07-14T00:00:00.000Z" });
    expect(first.manifest.logical_batch_id).toBe(second.manifest.logical_batch_id);
    expect(first.manifest.sha256).toBe(second.manifest.sha256);

    const direct = normalizeNutritionBatch({
      rawSnapshot: first.rawSnapshot,
      manifest: first.manifest,
      adapterSchemaVersion: "nutrition-source-row-v1",
    });
    const reconciliationInput = structuredClone(input);
    reconciliationInput.source.provider = "전국통합식품영양성분정보표준데이터";
    reconciliationInput.source.dataset = "15100064-reconciliation";
    const reconciliationRaw = buildRawBatch({
      ...reconciliationInput,
      fetchedAt: "2026-07-13T00:00:00.000Z",
    });
    const reconciliation = normalizeNutritionBatch({
      rawSnapshot: reconciliationRaw.rawSnapshot,
      manifest: reconciliationRaw.manifest,
      adapterSchemaVersion: "nutrition-source-row-v1",
    });
    expect(direct.rows[0].fingerprint).not.toBe(reconciliation.rows[0].fingerprint);
  });
});
