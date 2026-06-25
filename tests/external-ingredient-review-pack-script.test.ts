import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const SCRIPT_PATH = "scripts/external-ingredient-review-pack.mjs";

function runReviewPack(args: string[]) {
  return spawnSync("node", [SCRIPT_PATH, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

function candidate(overrides: Record<string, unknown>) {
  return {
    row_index: 0,
    source_fingerprint: "fingerprint-base",
    source_system: "rda",
    source_file: "live-source-export.json#rda-food-composition",
    source_version: "국가표준식품성분표",
    source_date: null,
    source_license: "kogl-type-1",
    source_row_id: "RDA-BASE",
    original_name: "양파",
    normalized_name: "양파",
    folded_name: "양파",
    raw_payload: { fdNm: "양파, 생것", fdGrupp: "F", fdGruppNm: "채소류" },
    review_status: "pending_review",
    category_candidate: {
      label: "채소",
      confidence: "high",
      reason_code: "source_legacy_category_match",
    },
    duplicate_candidates: [],
    reason_codes: [],
    ...overrides,
  };
}

describe("external ingredient review pack script", () => {
  it("splits a candidate report into canonical, synonym, and held review files", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "homecook-external-ingredient-review-pack-"));
    const inputPath = join(tempDir, "candidate-report.json");
    const outputDir = join(tempDir, "out");

    writeFileSync(
      inputPath,
      `${JSON.stringify(
        {
          batch_id: "batch-test",
          generated_at: "2026-06-24T00:00:00.000Z",
          blocked: false,
          invalid_rows: [],
          candidates: [
            candidate({
              row_index: 0,
              source_fingerprint: "fingerprint-onion-1",
              source_row_id: "RDA-ONION-1",
              raw_payload: { fdNm: "양파, 생것", fdGrupp: "F", fdGruppNm: "채소류" },
            }),
            candidate({
              row_index: 1,
              source_fingerprint: "fingerprint-onion-2",
              source_row_id: "RDA-ONION-2",
              raw_payload: { fdNm: "양파, 깐것", fdGrupp: "F", fdGruppNm: "채소류" },
              duplicate_candidates: [
                {
                  kind: "exact_normalized_name",
                  matched_source_fingerprint: "fingerprint-onion-1",
                  matched_name: "양파",
                },
              ],
            }),
            candidate({
              row_index: 2,
              source_fingerprint: "fingerprint-cabbage-1",
              source_row_id: "RDA-CABBAGE-1",
              original_name: "양배추",
              normalized_name: "양배추",
              folded_name: "양배추",
              raw_payload: { fdNm: "캐비지, 양배추, 생것", fdGrupp: "F", fdGruppNm: "채소류" },
            }),
            candidate({
              row_index: 3,
              source_fingerprint: "fingerprint-chicken-1",
              source_row_id: "RDA-CHICKEN-1",
              original_name: "닭고기",
              normalized_name: "닭고기",
              folded_name: "닭고기",
              raw_payload: { fdNm: "닭고기, 다리, 생것", fdGrupp: "I", fdGruppNm: "육류" },
              category_candidate: {
                label: "육류",
                confidence: "high",
                reason_code: "source_legacy_category_match",
              },
            }),
            candidate({
              row_index: 4,
              source_fingerprint: "fingerprint-processed-1",
              source_row_id: "RDA-PROCESSED-1",
              original_name: "기타 가공품",
              normalized_name: "기타 가공품",
              folded_name: "기타가공품",
              raw_payload: { fdNm: "기타 가공품, 조리됨", fdGrupp: "A", fdGruppNm: "곡류" },
              category_candidate: {
                label: "곡류",
                confidence: "high",
                reason_code: "source_legacy_category_match",
              },
            }),
          ],
          summary: {
            total_rows: 4,
            candidate_count: 5,
            approved_count: 0,
            rejected_count: 0,
            pending_review_count: 5,
            needs_source_check_count: 0,
            duplicate_count: 1,
            low_confidence_category_count: 0,
          },
        },
        null,
        2,
      )}\n`,
    );

    const result = runReviewPack([
      "--candidate-report",
      inputPath,
      "--output-dir",
      outputDir,
      "--generated-at",
      "2026-06-24T00:00:00.000Z",
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("canonical-ingredient-candidates.json");

    const canonicalPath = join(outputDir, "canonical-ingredient-candidates.json");
    const synonymPath = join(outputDir, "synonym-candidates.json");
    const heldPath = join(outputDir, "rejected-source-rows.json");
    const summaryPath = join(outputDir, "candidate-review-summary.md");

    expect(existsSync(canonicalPath)).toBe(true);
    expect(existsSync(synonymPath)).toBe(true);
    expect(existsSync(heldPath)).toBe(true);
    expect(existsSync(summaryPath)).toBe(true);

    const canonicalPack = JSON.parse(readFileSync(canonicalPath, "utf8"));
    const synonymPack = JSON.parse(readFileSync(synonymPath, "utf8"));
    const heldPack = JSON.parse(readFileSync(heldPath, "utf8"));
    const summary = readFileSync(summaryPath, "utf8");

    expect(canonicalPack.summary).toMatchObject({
      source_candidate_count: 5,
      canonical_candidate_count: 4,
      review_before_insert_count: 1,
    });
    expect(canonicalPack.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          standard_name: "양파",
          source_count: 2,
          duplicate_source_count: 1,
          suggested_action: "candidate_insert",
        }),
        expect.objectContaining({
          standard_name: "기타 가공품",
          suggested_action: "review_before_insert",
          risk_flags: expect.arrayContaining(["broad_or_processed_name"]),
        }),
        expect.objectContaining({
          standard_name: "닭고기 다리",
          source_count: 1,
          suggested_action: "candidate_insert",
        }),
      ]),
    );
    expect(synonymPack.candidates).toEqual([
      expect.objectContaining({
        standard_name: "양배추",
        synonym: "캐비지",
        review_status: "pending_review",
      }),
    ]);
    expect(heldPack.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "held_duplicate_source_row",
          standard_name: "양파",
          source_fingerprint: "fingerprint-onion-2",
        }),
        expect.objectContaining({
          status: "synonym_excluded_by_rule",
          standard_name: "양파",
          synonym: "깐것",
        }),
      ]),
    );
    expect(summary).toContain("대표 재료 후보: 4개");
    expect(summary).toContain("동의어 후보: 1개");
  });

  it("keeps meat cut rows as separate canonical ingredient candidates", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "homecook-external-ingredient-review-pack-meat-"));
    const inputPath = join(tempDir, "candidate-report.json");
    const outputDir = join(tempDir, "out");

    writeFileSync(
      inputPath,
      `${JSON.stringify(
        {
          batch_id: "batch-meat-test",
          generated_at: "2026-06-24T00:00:00.000Z",
          blocked: false,
          invalid_rows: [],
          candidates: [
            candidate({
              row_index: 0,
              source_fingerprint: "fingerprint-beef-chuck-1",
              source_row_id: "RDA-BEEF-CHUCK-1",
              original_name: "소고기",
              normalized_name: "소고기",
              folded_name: "소고기",
              raw_payload: { fdNm: "소고기, 한우, 채끝, 생것", fdGrupp: "I", fdGruppNm: "육류" },
              category_candidate: {
                label: "육류",
                confidence: "high",
                reason_code: "source_legacy_category_match",
              },
            }),
            candidate({
              row_index: 1,
              source_fingerprint: "fingerprint-beef-chuck-2",
              source_row_id: "RDA-BEEF-CHUCK-2",
              original_name: "소고기",
              normalized_name: "소고기",
              folded_name: "소고기",
              raw_payload: { fdNm: "소고기, 한우(1등급), 채끝, 구운것(팬)", fdGrupp: "I", fdGruppNm: "육류" },
              category_candidate: {
                label: "육류",
                confidence: "high",
                reason_code: "source_legacy_category_match",
              },
            }),
            candidate({
              row_index: 2,
              source_fingerprint: "fingerprint-beef-tenderloin-1",
              source_row_id: "RDA-BEEF-TENDERLOIN-1",
              original_name: "소고기",
              normalized_name: "소고기",
              folded_name: "소고기",
              raw_payload: { fdNm: "소고기, 수입산, 안심(안심살), 구운것", fdGrupp: "I", fdGruppNm: "육류" },
              category_candidate: {
                label: "육류",
                confidence: "high",
                reason_code: "source_legacy_category_match",
              },
            }),
            candidate({
              row_index: 3,
              source_fingerprint: "fingerprint-beef-generic-1",
              source_row_id: "RDA-BEEF-GENERIC-1",
              original_name: "소고기",
              normalized_name: "소고기",
              folded_name: "소고기",
              raw_payload: { fdNm: "소고기, 한우(1등급), 살코기, 생것", fdGrupp: "I", fdGruppNm: "육류" },
              category_candidate: {
                label: "육류",
                confidence: "high",
                reason_code: "source_legacy_category_match",
              },
            }),
            candidate({
              row_index: 4,
              source_fingerprint: "fingerprint-pork-loin-1",
              source_row_id: "RDA-PORK-LOIN-1",
              original_name: "돼지고기",
              normalized_name: "돼지고기",
              folded_name: "돼지고기",
              raw_payload: { fdNm: "돼지고기, 등심(등심덧살), 생것", fdGrupp: "I", fdGruppNm: "육류" },
              category_candidate: {
                label: "육류",
                confidence: "high",
                reason_code: "source_legacy_category_match",
              },
            }),
            candidate({
              row_index: 5,
              source_fingerprint: "fingerprint-beef-salchisal-1",
              source_row_id: "RDA-BEEF-SALCHISAL-1",
              original_name: "소고기",
              normalized_name: "소고기",
              folded_name: "소고기",
              raw_payload: { fdNm: "소고기, 한우(1등급), 등심(살치살), 생것", fdGrupp: "I", fdGruppNm: "육류" },
              category_candidate: {
                label: "육류",
                confidence: "high",
                reason_code: "source_legacy_category_match",
              },
            }),
            candidate({
              row_index: 6,
              source_fingerprint: "fingerprint-beef-salchisal-2",
              source_row_id: "RDA-BEEF-SALCHISAL-2",
              original_name: "소고기",
              normalized_name: "소고기",
              folded_name: "소고기",
              raw_payload: { fdNm: "소고기, 한우(1+등급), 등심(살치살), 생것", fdGrupp: "I", fdGruppNm: "육류" },
              category_candidate: {
                label: "육류",
                confidence: "high",
                reason_code: "source_legacy_category_match",
              },
            }),
            candidate({
              row_index: 7,
              source_fingerprint: "fingerprint-beef-blade-1",
              source_row_id: "RDA-BEEF-BLADE-1",
              original_name: "소고기",
              normalized_name: "소고기",
              folded_name: "소고기",
              raw_payload: { fdNm: "소고기, 한우(1등급), 앞다리(부채살), 생것", fdGrupp: "I", fdGruppNm: "육류" },
              category_candidate: {
                label: "육류",
                confidence: "high",
                reason_code: "source_legacy_category_match",
              },
            }),
            candidate({
              row_index: 8,
              source_fingerprint: "fingerprint-beef-skirt-1",
              source_row_id: "RDA-BEEF-SKIRT-1",
              original_name: "소고기",
              normalized_name: "소고기",
              folded_name: "소고기",
              raw_payload: { fdNm: "소고기, 한우(1등급), 갈비(토시살), 생것", fdGrupp: "I", fdGruppNm: "육류" },
              category_candidate: {
                label: "육류",
                confidence: "high",
                reason_code: "source_legacy_category_match",
              },
            }),
            candidate({
              row_index: 9,
              source_fingerprint: "fingerprint-mutton-leg-1",
              source_row_id: "RDA-MUTTON-LEG-1",
              original_name: "양고기",
              normalized_name: "양고기",
              folded_name: "양고기",
              raw_payload: { fdNm: "양고기, 수입산, 다리, 생것", fdGrupp: "I", fdGruppNm: "육류" },
              category_candidate: {
                label: "육류",
                confidence: "high",
                reason_code: "source_legacy_category_match",
              },
            }),
            candidate({
              row_index: 10,
              source_fingerprint: "fingerprint-lamb-rib-1",
              source_row_id: "RDA-LAMB-RIB-1",
              original_name: "어린양고기",
              normalized_name: "어린양고기",
              folded_name: "어린양고기",
              raw_payload: { fdNm: "어린양고기, 수입산, 갈비, 생것", fdGrupp: "I", fdGruppNm: "육류" },
              category_candidate: {
                label: "육류",
                confidence: "high",
                reason_code: "source_legacy_category_match",
              },
            }),
            candidate({
              row_index: 11,
              source_fingerprint: "fingerprint-lamb-leg-1",
              source_row_id: "RDA-LAMB-LEG-1",
              original_name: "어린양고기",
              normalized_name: "어린양고기",
              folded_name: "어린양고기",
              raw_payload: { fdNm: "어린양고기, 수입산, 다리, 구운것(오븐)", fdGrupp: "I", fdGruppNm: "육류" },
              category_candidate: {
                label: "육류",
                confidence: "high",
                reason_code: "source_legacy_category_match",
              },
            }),
            candidate({
              row_index: 12,
              source_fingerprint: "fingerprint-lamb-shoulder-1",
              source_row_id: "RDA-LAMB-SHOULDER-1",
              original_name: "어린양고기",
              normalized_name: "어린양고기",
              folded_name: "어린양고기",
              raw_payload: { fdNm: "어린양고기, 수입산, 어깨, 생것", fdGrupp: "I", fdGruppNm: "육류" },
              category_candidate: {
                label: "육류",
                confidence: "high",
                reason_code: "source_legacy_category_match",
              },
            }),
            candidate({
              row_index: 13,
              source_fingerprint: "fingerprint-lamb-generic-1",
              source_row_id: "RDA-LAMB-GENERIC-1",
              original_name: "어린양고기",
              normalized_name: "어린양고기",
              folded_name: "어린양고기",
              raw_payload: { fdNm: "어린양고기, 수입산, 살코기, 생것", fdGrupp: "I", fdGruppNm: "육류" },
              category_candidate: {
                label: "육류",
                confidence: "high",
                reason_code: "source_legacy_category_match",
              },
            }),
          ],
          summary: {
            total_rows: 14,
            candidate_count: 14,
            approved_count: 0,
            rejected_count: 0,
            pending_review_count: 14,
            needs_source_check_count: 0,
            duplicate_count: 0,
            low_confidence_category_count: 0,
          },
        },
        null,
        2,
      )}\n`,
    );

    const result = runReviewPack([
      "--candidate-report",
      inputPath,
      "--output-dir",
      outputDir,
      "--generated-at",
      "2026-06-24T00:00:00.000Z",
    ]);

    expect(result.status).toBe(0);

    const canonicalPack = JSON.parse(readFileSync(join(outputDir, "canonical-ingredient-candidates.json"), "utf8"));
    const synonymPack = JSON.parse(readFileSync(join(outputDir, "synonym-candidates.json"), "utf8"));
    const heldPack = JSON.parse(readFileSync(join(outputDir, "rejected-source-rows.json"), "utf8"));

    expect(canonicalPack.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          standard_name: "소고기",
          source_count: 1,
        }),
        expect.objectContaining({
          standard_name: "소고기 안심",
          source_count: 1,
          sample_raw_names: expect.arrayContaining(["소고기, 수입산, 안심(안심살), 구운것"]),
        }),
        expect.objectContaining({
          standard_name: "소고기 채끝",
          source_count: 2,
          sample_raw_names: expect.arrayContaining([
            "소고기, 한우, 채끝, 생것",
            "소고기, 한우(1등급), 채끝, 구운것(팬)",
          ]),
        }),
        expect.objectContaining({
          standard_name: "돼지고기 등심",
          source_count: 1,
        }),
        expect.objectContaining({
          standard_name: "소고기 살치살",
          source_count: 2,
          sample_raw_names: expect.arrayContaining([
            "소고기, 한우(1등급), 등심(살치살), 생것",
            "소고기, 한우(1+등급), 등심(살치살), 생것",
          ]),
        }),
        expect.objectContaining({
          standard_name: "소고기 부채살",
          source_count: 1,
        }),
        expect.objectContaining({
          standard_name: "소고기 토시살",
          source_count: 1,
        }),
        expect.objectContaining({
          standard_name: "양고기",
          source_count: 1,
          sample_raw_names: expect.arrayContaining(["어린양고기, 수입산, 살코기, 생것"]),
        }),
        expect.objectContaining({
          standard_name: "양고기 갈비",
          source_count: 1,
        }),
        expect.objectContaining({
          standard_name: "양고기 다리",
          source_count: 2,
          sample_raw_names: expect.arrayContaining([
            "양고기, 수입산, 다리, 생것",
            "어린양고기, 수입산, 다리, 구운것(오븐)",
          ]),
        }),
        expect.objectContaining({
          standard_name: "양고기 어깨",
          source_count: 1,
        }),
      ]),
    );
    expect(canonicalPack.candidates).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          standard_name: "어린양고기",
        }),
      ]),
    );
    expect(synonymPack.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          standard_name: "양고기",
          synonym: "어린양고기",
          reason_code: "service_lamb_alias",
        }),
        expect.objectContaining({
          standard_name: "양고기",
          synonym: "램",
          reason_code: "service_lamb_alias",
        }),
        expect.objectContaining({
          standard_name: "양고기 갈비",
          synonym: "어린양고기 갈비",
          reason_code: "service_lamb_alias",
        }),
        expect.objectContaining({
          standard_name: "양고기 갈비",
          synonym: "램갈비",
          reason_code: "service_lamb_alias",
        }),
      ]),
    );
    expect(heldPack.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "held_duplicate_source_row",
          standard_name: "소고기 채끝",
          source_fingerprint: "fingerprint-beef-chuck-2",
        }),
      ]),
    );
  });
});
