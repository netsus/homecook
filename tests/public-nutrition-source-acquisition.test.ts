import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const PIPELINE_MODULE = pathToFileURL(
  join(process.cwd(), "scripts/lib/public-nutrition-pipeline.mjs"),
).href;
const RDA_XLSX_MODULE = pathToFileURL(
  join(process.cwd(), "scripts/lib/rda-nutrition-xlsx.mjs"),
).href;
const FIXTURE_DIR = join(process.cwd(), "tests/fixtures/public-nutrition-source");

async function loadPipeline() {
  return import(PIPELINE_MODULE);
}

async function loadRdaXlsx() {
  return import(RDA_XLSX_MODULE);
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

function officialRdaSchema({
  dataRowCount = 3_366,
  stableKeyHeader = "DB10.4\r\n색인",
  skipRowAt = null as number | null,
} = {}) {
  const inlineCell = (reference: string, value: string) =>
    `<c r="${reference}" t="inlineStr"><is><t>${value}</t></is></c>`;
  const dataRows = Array.from({ length: dataRowCount }, (_, index) => {
    const rowNumber = index + 4 + (skipRowAt !== null && index >= skipRowAt ? 1 : 0);
    return `<row r="${rowNumber}">${inlineCell(`A${rowNumber}`, `RDA-${index + 1}`)}</row>`;
  }).join("");
  return {
    sharedStringsXml:
      '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"></sst>',
    worksheetXml: `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
      <row r="1">${inlineCell("D1", "가식부 100g 당 (per 100g Edible Portion)")}</row>
      <row r="2">
        ${inlineCell("A2", stableKeyHeader)}${inlineCell("D2", "식품명")}
        ${inlineCell("F2", "에너지")}${inlineCell("H2", "단백질")}
        ${inlineCell("I2", "지방")}${inlineCell("K2", "탄수화물")}
        ${inlineCell("AA2", "나트륨")}
      </row>
      <row r="3">
        ${inlineCell("F3", "kcal")}${inlineCell("H3", "g")}
        ${inlineCell("I3", "g")}${inlineCell("K3", "g")}${inlineCell("AA3", "mg")}
      </row>
      ${dataRows}
    </sheetData></worksheet>`,
  };
}

describe("public nutrition source acquisition core", () => {
  it("hashes the original RDA workbook bytes without an extracted-member proxy", async () => {
    const { sourceFileEvidence } = await loadRdaXlsx();
    const directory = mkdtempSync(join(tmpdir(), "rda-source-evidence-"));
    const filePath = join(directory, "식품성분표(10개정판).xlsx");
    const bytes = Buffer.from("original-workbook-bytes");
    writeFileSync(filePath, bytes);

    expect(sourceFileEvidence(filePath)).toEqual({
      name: "식품성분표(10개정판).xlsx",
      size_bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    expect(() => sourceFileEvidence(join(directory, "missing.xlsx")))
      .toThrowError(expect.objectContaining({ code: "RDA_SOURCE_FILE_INVALID" }));
    expect(() => sourceFileEvidence(directory))
      .toThrowError(expect.objectContaining({ code: "RDA_SOURCE_FILE_INVALID" }));
  });

  it("fails closed with a domain error when the pinned workbook cannot be unzipped", async () => {
    const { loadRda104Workbook } = await loadRdaXlsx();
    const directory = mkdtempSync(join(tmpdir(), "rda-corrupt-workbook-"));
    const filePath = join(directory, "식품성분표(10개정판).xlsx");
    writeFileSync(filePath, Buffer.from("not-an-xlsx"));

    expect(() => loadRda104Workbook(filePath, {
      fetchedAt: "2026-07-15T00:00:00.000Z",
    })).toThrowError(expect.objectContaining({ code: "RDA_SOURCE_FILE_INVALID" }));
  });

  it("pins the exact official RDA file identity and detects source swaps", async () => {
    const {
      RDA_OFFICIAL_FILE_SHA256,
      RDA_OFFICIAL_FILE_SIZE_BYTES,
      assertRda104OfficialSourceFile,
      assertRdaSourceFileUnchanged,
    } = await loadRdaXlsx();
    const official = {
      name: "식품성분표(10개정판).xlsx",
      size_bytes: RDA_OFFICIAL_FILE_SIZE_BYTES,
      sha256: RDA_OFFICIAL_FILE_SHA256,
    };

    expect(assertRda104OfficialSourceFile(official)).toEqual(official);
    for (const sourceFile of [
      { ...official, size_bytes: official.size_bytes - 1 },
      { ...official, sha256: "0".repeat(64) },
    ]) {
      expect(() => assertRda104OfficialSourceFile(sourceFile)).toThrowError(
        expect.objectContaining({ code: "RDA_SOURCE_FILE_INVALID" }),
      );
    }
    expect(() => assertRdaSourceFileUnchanged(
      official,
      { ...official, sha256: "0".repeat(64) },
    )).toThrowError(expect.objectContaining({ code: "RDA_SOURCE_FILE_CHANGED" }));
  });

  it("keeps the official RDA worksheet adapter behind the hard-pinned file loader", async () => {
    const rdaModule = await loadRdaXlsx();

    expect(rdaModule).not.toHaveProperty("adaptRda104OfficialWorksheet");
    expect(rdaModule).toHaveProperty("loadRda104Workbook", expect.any(Function));
  });

  it("validates the official RDA stable-key header and all 3,366 contiguous rows", async () => {
    const { assertRda104OfficialWorksheetSchema } = await loadRdaXlsx();

    expect(() => assertRda104OfficialWorksheetSchema(officialRdaSchema())).not.toThrow();
    expect(() => assertRda104OfficialWorksheetSchema(
      officialRdaSchema({ dataRowCount: 3_365 }),
    )).toThrowError(expect.objectContaining({ code: "RDA_WORKBOOK_SCHEMA_INVALID" }));
    expect(() => assertRda104OfficialWorksheetSchema(
      officialRdaSchema({ skipRowAt: 100 }),
    )).toThrowError(expect.objectContaining({ code: "RDA_WORKBOOK_SCHEMA_INVALID" }));
    expect(() => assertRda104OfficialWorksheetSchema(
      officialRdaSchema({ stableKeyHeader: "식품코드" }),
    )).toThrowError(expect.objectContaining({ code: "RDA_WORKBOOK_SCHEMA_INVALID" }));
  });

  it("adapts the pinned RDA 10.4 worksheet without losing official-file provenance", async () => {
    const { adaptRda104Worksheet } = await loadRdaXlsx();
    const sharedStringsXml = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      ${[
        "DB10.4 색인", "식품명", "에너지", "단백질", "지방", "탄수화물", "나트륨",
        "kcal", "g", "mg", "RDA-FOOD", "시험 식품",
        "가식부 100g 당 (per 100g Edible Portion)",
      ].map((value) => `<si><t>${value}</t></si>`).join("")}
    </sst>`;
    const worksheetXml = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>
      <row r="1"><c r="D1" t="s"><v>12</v></c></row>
      <row r="2">
        <c r="A2" t="s"><v>0</v></c><c r="D2" t="s"><v>1</v></c>
        <c r="F2" t="s"><v>2</v></c><c r="H2" t="s"><v>3</v></c>
        <c r="I2" t="s"><v>4</v></c><c r="K2" t="s"><v>5</v></c>
        <c r="AA2" t="s"><v>6</v></c>
      </row>
      <row r="3">
        <c r="F3" t="s"><v>7</v></c><c r="H3" t="s"><v>8</v></c>
        <c r="I3" t="s"><v>8</v></c><c r="K3" t="s"><v>8</v></c>
        <c r="AA3" t="s"><v>9</v></c>
      </row>
      <row r="4">
        <c r="A4" t="s"><v>10</v></c><c r="D4" t="s"><v>11</v></c>
        <c r="F4"><v>84</v></c><c r="H4"><v>9.3</v></c>
        <c r="I4"><v>4.7</v></c><c r="K4"><v>2.4</v></c>
        <c r="AA4"><v>5</v></c>
      </row>
    </sheetData></worksheet>`;

    const result = adaptRda104Worksheet({
      worksheetXml,
      sharedStringsXml,
      fetchedAt: "2026-07-15T00:00:00.000Z",
      selectedItemKeys: ["RDA-FOOD"],
      sourceFile: {
        name: "식품성분표(10개정판).xlsx",
        size_bytes: 123,
        sha256: "a".repeat(64),
      },
    });

    expect(result.manifest).toMatchObject({
      provider: "농촌진흥청",
      dataset: "국가표준식품성분 DB 10.4",
      source_version: "10.4",
      fetched_raw_count: 1,
      input_shape: "adapted-row-v1",
      query: {
        acquisition_mode: "official-ui-post",
        official_file_name: "식품성분표(10개정판).xlsx",
        official_file_sha256: "a".repeat(64),
        official_file_size_bytes: "123",
        scope_item_keys_sha256: createHash("sha256")
          .update(JSON.stringify(["RDA-FOOD"]))
          .digest("hex"),
        scope_selection: "selected_item_keys",
        scope_item_count: "1",
        workbook_sheet: "국가표준식품성분 Database 10.4",
      },
    });
    expect(result.rawSnapshot.pages[0].items).toEqual([expect.objectContaining({
      external_item_key: "RDA-FOOD",
      external_name: "시험 식품",
      basis_text: "100 g",
      edible_portion: {
        text: "가식부 100g 당 (per 100g Edible Portion)",
      },
      preparation_state: "as_published",
      nutrients: {
        energy: { value: "84", unit: "kcal" },
        carbohydrate: { value: "2.4", unit: "g" },
        protein: { value: "9.3", unit: "g" },
        fat: { value: "4.7", unit: "g" },
        sodium: { value: "5", unit: "mg" },
      },
    })]);
    expect(() => adaptRda104Worksheet({
      worksheetXml: worksheetXml.replace('<row r="1"><c r="D1" t="s"><v>12</v></c></row>', ""),
      sharedStringsXml,
      fetchedAt: "2026-07-15T00:00:00.000Z",
      sourceFile: {
        name: "식품성분표(10개정판).xlsx",
        size_bytes: 123,
        sha256: "a".repeat(64),
      },
    })).toThrowError(expect.objectContaining({ code: "RDA_WORKBOOK_ROW_INVALID" }));
  });

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
      preparation_state: "as_published",
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

  it("changes normalized identity when only preparation state changes", async () => {
    const { buildRawBatch, normalizeNutritionBatch } = await loadPipeline();
    const normalizeWithState = (preparationState: string) => {
      const input = fixture("mfds-source-sample.json");
      input.pages[0].items[0].preparation_state = preparationState;
      const raw = buildRawBatch({ ...input, fetchedAt: "2026-07-13T00:00:00.000Z" });
      return normalizeNutritionBatch({
        rawSnapshot: raw.rawSnapshot,
        manifest: raw.manifest,
        adapterSchemaVersion: "nutrition-source-row-v1",
      }).rows[0];
    };

    const raw = normalizeWithState("raw");
    const cooked = normalizeWithState("cooked");

    expect(raw.business_key).toBe(cooked.business_key);
    expect(raw.content_hash).not.toBe(cooked.content_hash);
    expect(raw.fingerprint).not.toBe(cooked.fingerprint);
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

    const importer = await import(pathToFileURL(
      join(process.cwd(), "scripts/lib/ingredient-nutrition-import.mjs"),
    ).href);
    expect(importer.validateHandoffBundle(first)).toMatchObject({
      handoff_schema_checksum: first.handoff_schema_checksum,
      handoff_checksum: first.handoff_checksum,
      status: "approved_pinned",
    });
    for (const row of first.measurement_evidence) {
      expect(row).toMatchObject({
        evidence_schema_version: "public-nutrition-measurement-evidence-v1",
        evidence_kind: expect.stringMatching(/^(volume_weight|piece_weight)$/),
        evidence_checksum: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
    }
    expect(JSON.stringify(first)).not.toMatch(/AMT_NUM|provider_response|raw_row|raw_payload/);
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

  it("requires the reviewed fingerprint set to exactly match normalized rows", async () => {
    const {
      buildApprovedPinnedHandoff,
      buildNutritionReview,
      buildRawBatch,
      normalizeNutritionBatch,
      sha256,
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
    const tampered = structuredClone(review);
    tampered.reviewed_rows = [
      { fingerprint: normalized.rows[0].fingerprint, status: "approved" },
      { fingerprint: "f".repeat(64), status: "approved" },
    ];
    tampered.approved_fingerprints = tampered.reviewed_rows
      .map((row: { fingerprint: string }) => row.fingerprint)
      .sort();
    const reviewBase = Object.fromEntries(
      Object.entries(tampered).filter(([key]) => key !== "review_checksum"),
    );
    tampered.review_checksum = sha256(reviewBase);

    expect(errorCode(() => buildApprovedPinnedHandoff({
      manifest: raw.manifest,
      normalizedBundle: normalized,
      reviewReport: tampered,
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
