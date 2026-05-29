import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildApprovedIngredientSeedPromotionArtifact,
  buildExternalIngredientCandidateReport,
  normalizeExternalIngredientName,
  parseExternalIngredientSourceRows,
} from "@/lib/server/external-ingredient-ingest";
import {
  chooseDataGoKrIngredientName,
  chooseRdaFoodCompositionIngredientName,
  mapDataGoKrNutritionRowsToExternalIngredientSourceRows,
  mapRdaFoodCompositionRowsToExternalIngredientSourceRows,
  type DataGoKrNutritionStandardRow,
  type RdaFoodCompositionRow,
} from "@/lib/server/external-ingredient-source-adapters";

import invalidRowsFixture from "@/tests/fixtures/external-ingredient-ingest/source-invalid-v1.json";
import realSourceSampleFixture from "@/tests/fixtures/external-ingredient-ingest/real-source-sample-2026-05-29.json";
import sourceRowsFixture from "@/tests/fixtures/external-ingredient-ingest/source-sample-v1.json";

describe("external ingredient ingest gate", () => {
  it("parses file-backed source rows while preserving raw payload and source metadata", () => {
    const parsed = parseExternalIngredientSourceRows(sourceRowsFixture);

    expect(parsed.file_errors).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({
      source_system: "mfds",
      source_file: "mfds-sample-export-v1.json",
      source_version: "2026-05-sample",
      source_date: "2026-05-25",
      source_license: "public-open-data",
      source_row_id: "MFDS-001",
      original_name: " 양파 (국산) ",
      legacy_category: "채소",
      raw_payload: {
        PRDLST_NM: " 양파 (국산) ",
        CL_NM: "채소",
      },
    });
  });

  it("normalizes names deterministically without a model or network source", () => {
    expect(normalizeExternalIngredientName(" 양파 (국산) ")).toBe("양파");
    expect(normalizeExternalIngredientName("간   장")).toBe("간 장");
    expect(normalizeExternalIngredientName("대파/쪽파")).toBe("대파 쪽파");
    expect(normalizeExternalIngredientName(null)).toBe("");
  });

  it("generates review candidates with legacy category confidence and separated duplicate reasons", () => {
    const report = buildExternalIngredientCandidateReport(parseExternalIngredientSourceRows(sourceRowsFixture).rows, {
      generatedAt: "2026-05-25T00:00:00.000Z",
      knownSynonyms: [{ synonym: "실파", canonical_name: "쪽파" }],
    });

    const onion = report.candidates.find((candidate) => candidate.source_row_id === "MFDS-001");
    const duplicateOnion = report.candidates.find((candidate) => candidate.source_row_id === "RDA-004");
    const spacedSoySauce = report.candidates.find((candidate) => candidate.source_row_id === "RDA-001");
    const soySauce = report.candidates.find((candidate) => candidate.source_row_id === "RDA-002");
    const scallion = report.candidates.find((candidate) => candidate.source_row_id === "RDA-003");
    const fishCake = report.candidates.find((candidate) => candidate.source_row_id === "MFDS-004");

    expect(report.blocked).toBe(false);
    expect(onion).toMatchObject({
      original_name: " 양파 (국산) ",
      normalized_name: "양파",
      review_status: "pending_review",
      category_candidate: {
        label: "채소",
        confidence: "high",
        reason_code: "source_legacy_category_match",
      },
    });
    expect(onion?.duplicate_candidates).toEqual([
      {
        kind: "exact_normalized_name",
        matched_source_fingerprint: duplicateOnion?.source_fingerprint,
        matched_name: "양파",
      },
    ]);
    expect(spacedSoySauce?.duplicate_candidates).toEqual([
      {
        kind: "folded_name",
        matched_source_fingerprint: soySauce?.source_fingerprint,
        matched_name: "간장",
      },
    ]);
    expect(scallion?.duplicate_candidates).toEqual([
      {
        kind: "known_synonym",
        matched_source_fingerprint: null,
        matched_name: "쪽파",
      },
    ]);
    expect(fishCake).toMatchObject({
      normalized_name: "어묵",
      review_status: "pending_review",
      category_candidate: {
        label: "기타",
        confidence: "low",
        reason_code: "unknown_legacy_category_candidate",
      },
    });
    expect(report.summary).toMatchObject({
      total_rows: 8,
      candidate_count: 8,
      pending_review_count: 6,
      rejected_count: 1,
      needs_source_check_count: 1,
      duplicate_count: 5,
      low_confidence_category_count: 1,
    });
  });

  it("rejects empty names and gates rows with unknown source license", () => {
    const report = buildExternalIngredientCandidateReport(parseExternalIngredientSourceRows(sourceRowsFixture).rows, {
      generatedAt: "2026-05-25T00:00:00.000Z",
    });

    expect(report.candidates.find((candidate) => candidate.source_row_id === "MFDS-002")).toMatchObject({
      normalized_name: "참기름",
      review_status: "needs_source_check",
      reason_codes: ["source_license_unconfirmed"],
    });
    expect(report.candidates.find((candidate) => candidate.source_row_id === "MFDS-003")).toMatchObject({
      normalized_name: "",
      review_status: "rejected",
      reason_codes: ["empty_original_name"],
    });
  });

  it("requires source license values to be explicitly approved tokens", () => {
    const report = buildExternalIngredientCandidateReport(
      parseExternalIngredientSourceRows([
        {
          ...sourceRowsFixture[0],
          source_license: "확인 중",
          source_row_id: "MFDS-LICENSE-PENDING",
          original_name: "부추",
        },
      ]).rows,
      {
        generatedAt: "2026-05-25T00:00:00.000Z",
      },
    );

    expect(report.candidates[0]).toMatchObject({
      normalized_name: "부추",
      review_status: "needs_source_check",
      reason_codes: ["source_license_unconfirmed"],
    });
  });

  it("accepts confirmed Kogl type 1 source rows after explicit source review", () => {
    const report = buildExternalIngredientCandidateReport(
      parseExternalIngredientSourceRows([
        {
          ...sourceRowsFixture[0],
          source_license: "kogl-type-1",
          source_row_id: "RDA-KOGL-001",
          original_name: "귀리",
        },
      ]).rows,
      {
        generatedAt: "2026-05-29T00:00:00.000Z",
      },
    );

    expect(report.candidates[0]).toMatchObject({
      normalized_name: "귀리",
      review_status: "pending_review",
      reason_codes: [],
    });
  });

  it("maps actual public source sample rows into the file-backed ingest shape", () => {
    const mfdsRows = mapDataGoKrNutritionRowsToExternalIngredientSourceRows(
      realSourceSampleFixture.dataGoKrProcessedFoodRows as DataGoKrNutritionStandardRow[],
      {
        sourceFile: "data-go-kr-15100066-standard-html-sample-2026-05-29",
        sourceVersion: "data.go.kr 15100066 2026-04-29",
        sourceLicense: "public-open-data",
      },
    );
    const rdaRows = mapRdaFoodCompositionRowsToExternalIngredientSourceRows(
      realSourceSampleFixture.rdaFoodCompositionRows as RdaFoodCompositionRow[],
      {
        sourceFile: "rda-koreanfood-search-grid-sample-2026-05-29",
        sourceVersion: "RDA National Standard Food Composition DB 10.4",
        sourceLicense: "kogl-type-1",
      },
    );
    const parsed = parseExternalIngredientSourceRows([...mfdsRows, ...rdaRows]);
    const report = buildExternalIngredientCandidateReport(parsed.rows, {
      generatedAt: "2026-05-29T00:00:00.000Z",
    });

    expect(parsed.file_errors).toEqual([]);
    expect(parsed.rows).toHaveLength(8);
    expect(parsed.rows.find((row) => row.source_row_id === "P120-600060000-1716")).toMatchObject({
      source_system: "mfds",
      original_name: "기타 수산가공품",
      legacy_category: "해산물",
      raw_payload: {
        FOOD_NM: "망고맛 열빙어알",
        SRC_NM: "식품의약품안전처",
      },
    });
    expect(parsed.rows.find((row) => row.source_row_id === "A001001A010a")).toMatchObject({
      source_system: "rda",
      original_name: "귀리",
      legacy_category: "곡류",
      raw_payload: {
        fdNm: "귀리, 겉귀리, 도정, 생것",
      },
    });
    expect(report).toMatchObject({
      blocked: false,
      summary: {
        total_rows: 8,
        candidate_count: 8,
        pending_review_count: 8,
        needs_source_check_count: 0,
      },
    });
    expect(report.candidates.every((candidate) => candidate.review_status === "pending_review")).toBe(
      true,
    );
  });

  it("keeps source-name selection deterministic for representative ingredient levels", () => {
    expect(
      chooseDataGoKrIngredientName({
        FOOD_NM: "파_대파_생것",
        FOOD_LV4_NM: "파",
        FOOD_LV5_NM: "대파",
      }),
    ).toBe("대파");
    expect(chooseRdaFoodCompositionIngredientName({ fdNm: "파, 대파, 생것" })).toBe("대파");
    expect(chooseRdaFoodCompositionIngredientName({ fdNm: "마늘, 구근, 생것" })).toBe("마늘");
  });

  it("blocks import when required source metadata is missing", () => {
    const report = buildExternalIngredientCandidateReport(parseExternalIngredientSourceRows(invalidRowsFixture).rows, {
      generatedAt: "2026-05-25T00:00:00.000Z",
    });

    expect(report.blocked).toBe(true);
    expect(report.candidates).toEqual([]);
    expect(report.invalid_rows).toEqual([
      {
        row_index: 0,
        source_row_id: "BROKEN-001",
        code: "missing_source_metadata",
        message: "source_system and source_file are required before candidate generation.",
      },
    ]);
  });

  it("creates an idempotent approved-only seed promotion artifact", () => {
    const parsed = parseExternalIngredientSourceRows(sourceRowsFixture);
    const initialReport = buildExternalIngredientCandidateReport(parsed.rows, {
      generatedAt: "2026-05-25T00:00:00.000Z",
    });
    const onionFingerprint = initialReport.candidates.find(
      (candidate) => candidate.source_row_id === "MFDS-001",
    )?.source_fingerprint;
    const soySauceFingerprint = initialReport.candidates.find(
      (candidate) => candidate.source_row_id === "RDA-002",
    )?.source_fingerprint;

    expect(onionFingerprint).toBeDefined();
    expect(soySauceFingerprint).toBeDefined();

    const reviewedReport = buildExternalIngredientCandidateReport(parsed.rows, {
      generatedAt: "2026-05-25T00:00:00.000Z",
      reviewDecisions: [
        { source_fingerprint: onionFingerprint!, status: "approved" },
        { source_fingerprint: soySauceFingerprint!, status: "approved" },
      ],
    });
    const firstArtifact = buildApprovedIngredientSeedPromotionArtifact(reviewedReport, {
      artifactId: "slice28-approved-seed-v1",
      generatedAt: "2026-05-25T00:00:00.000Z",
    });
    const secondArtifact = buildApprovedIngredientSeedPromotionArtifact(reviewedReport, {
      artifactId: "slice28-approved-seed-v1",
      generatedAt: "2026-05-25T00:00:00.000Z",
    });

    expect(firstArtifact).toEqual(secondArtifact);
    expect(firstArtifact.seed_rows).toEqual([
      {
        seed_idempotency_key: `external:${onionFingerprint}`,
        standard_name: "양파",
        legacy_category: "채소",
        source_fingerprint: onionFingerprint,
        source_system: "mfds",
        source_file: "mfds-sample-export-v1.json",
        source_row_id: "MFDS-001",
      },
      {
        seed_idempotency_key: `external:${soySauceFingerprint}`,
        standard_name: "간장",
        legacy_category: "양념",
        source_fingerprint: soySauceFingerprint,
        source_system: "rda",
        source_file: "rda-sample-export-v1.json",
        source_row_id: "RDA-002",
      },
    ]);
    expect(firstArtifact.skipped_rows.map((row) => row.review_status)).toEqual([
      "pending_review",
      "pending_review",
      "pending_review",
      "needs_source_check",
      "rejected",
      "pending_review",
    ]);
  });

  it("does not promote approved rows when the batch report is blocked", () => {
    const parsed = parseExternalIngredientSourceRows([...sourceRowsFixture.slice(0, 1), ...invalidRowsFixture]);
    const initialReport = buildExternalIngredientCandidateReport(parsed.rows, {
      generatedAt: "2026-05-25T00:00:00.000Z",
    });
    const approvedFingerprint = initialReport.candidates[0]?.source_fingerprint;
    const blockedReport = buildExternalIngredientCandidateReport(parsed.rows, {
      generatedAt: "2026-05-25T00:00:00.000Z",
      reviewDecisions: [{ source_fingerprint: approvedFingerprint!, status: "approved" }],
    });
    const artifact = buildApprovedIngredientSeedPromotionArtifact(blockedReport, {
      artifactId: "slice28-blocked-seed-v1",
      generatedAt: "2026-05-25T00:00:00.000Z",
    });

    expect(blockedReport.blocked).toBe(true);
    expect(artifact.seed_rows).toEqual([]);
    expect(artifact.skipped_rows).toEqual([
      {
        source_fingerprint: approvedFingerprint,
        normalized_name: "양파",
        review_status: "approved",
        reason_codes: ["blocked_report"],
      },
    ]);
  });

  it("keeps the gate file-backed without production ingredient writes", () => {
    const source = [
      "lib/server/external-ingredient-ingest.ts",
      "lib/server/external-ingredient-source-adapters.ts",
    ]
      .map((filePath) => readFileSync(join(process.cwd(), filePath), "utf8"))
      .join("\n");

    expect(source).not.toContain("insert into public.ingredients");
    expect(source).not.toContain("insert into public.ingredient_synonyms");
    expect(source).not.toContain(".from(\"ingredients\")");
    expect(source).not.toContain(".from('ingredients')");
  });
});
