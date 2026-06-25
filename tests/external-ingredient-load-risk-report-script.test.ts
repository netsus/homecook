import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const SCRIPT_PATH = "scripts/external-ingredient-load-risk-report.mjs";

function runLoadRiskReport(args: string[]) {
  return spawnSync("node", [SCRIPT_PATH, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

describe("external ingredient load risk report script", () => {
  it("reports pre-load risks from approved canonical and synonym decisions", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "homecook-external-ingredient-risk-report-"));
    const inputPath = join(tempDir, "decisions.json");
    const outputDir = join(tempDir, "out");

    writeFileSync(
      inputPath,
      `${JSON.stringify(
        {
          generated_at: "2026-06-25T00:00:00.000Z",
          decisions: [
            {
              review_id: "canonical:양파",
              type: "canonical",
              standard_name: "양파",
              category: "채소",
              decision: "approve",
            },
            {
              review_id: "canonical:양파-duplicate",
              type: "canonical",
              standard_name: "양파",
              category: "채소",
              decision: "approve",
            },
            {
              review_id: "canonical:체다치즈",
              type: "canonical",
              standard_name: "체다 치즈",
              category: "유제품",
              decision: "approve",
              promoted_from_review_id: "synonym:치즈:체다",
            },
            {
              review_id: "canonical:닭가슴",
              type: "canonical",
              standard_name: "닭고기 가슴",
              category: "육류",
              decision: "rename",
              rename_to: "닭가슴살",
            },
            {
              review_id: "canonical:볶은참깨",
              type: "canonical",
              standard_name: "볶은 참깨",
              category: "양념",
              decision: "approve",
            },
            {
              review_id: "synonym:양파:둥근파",
              type: "synonym",
              standard_name: "양파",
              synonym: "둥근파",
              category: "채소",
              decision: "approve",
            },
            {
              review_id: "synonym:감:청도반시",
              type: "synonym",
              standard_name: "연시",
              synonym: "청도반시",
              category: "과일",
              decision: "approve",
              mapped_from_standard_name: "감",
              mapped_to_standard_name: "연시",
            },
            {
              review_id: "synonym:감:잼",
              type: "synonym",
              standard_name: "감",
              synonym: "잼",
              category: "과일",
              decision: "approve",
            },
            {
              review_id: "synonym:딸기잼:잼",
              type: "synonym",
              standard_name: "딸기잼",
              synonym: "잼",
              category: "과일",
              decision: "approve",
            },
            {
              review_id: "synonym:마늘:마늘",
              type: "synonym",
              standard_name: "마늘",
              synonym: "마늘",
              category: "채소",
              decision: "approve",
            },
            {
              review_id: "canonical:보류",
              type: "canonical",
              standard_name: "기타 가공품",
              category: "기타",
              decision: "exclude",
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const result = runLoadRiskReport([
      "--review-decisions",
      inputPath,
      "--output-dir",
      outputDir,
      "--generated-at",
      "2026-06-25T00:00:00.000Z",
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ingredient-load-risk-report.json");

    const jsonPath = join(outputDir, "ingredient-load-risk-report.json");
    const markdownPath = join(outputDir, "ingredient-load-risk-report.md");
    const canonicalTsvPath = join(outputDir, "canonical-risk-rows.tsv");
    const synonymTsvPath = join(outputDir, "synonym-risk-rows.tsv");

    expect(existsSync(jsonPath)).toBe(true);
    expect(existsSync(markdownPath)).toBe(true);
    expect(existsSync(canonicalTsvPath)).toBe(true);
    expect(existsSync(synonymTsvPath)).toBe(true);

    const report = JSON.parse(readFileSync(jsonPath, "utf8"));
    const markdown = readFileSync(markdownPath, "utf8");

    expect(report.summary).toMatchObject({
      input_decision_count: 11,
      insertable_canonical_count: 5,
      approved_synonym_count: 5,
      duplicate_canonical_name_count: 1,
      missing_synonym_target_count: 4,
      ambiguous_synonym_count: 1,
    });
    expect(report.canonical_risks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          review_id: "canonical:양파",
          standard_name: "양파",
          risk_flags: expect.arrayContaining(["duplicate_canonical_name"]),
        }),
        expect.objectContaining({
          review_id: "canonical:체다치즈",
          standard_name: "체다 치즈",
          risk_flags: expect.arrayContaining(["promoted_from_synonym_review"]),
        }),
        expect.objectContaining({
          review_id: "canonical:닭가슴",
          standard_name: "닭가슴살",
          risk_flags: expect.arrayContaining(["renamed_canonical"]),
        }),
        expect.objectContaining({
          review_id: "canonical:볶은참깨",
          standard_name: "볶은 참깨",
          risk_flags: expect.arrayContaining(["state_or_form_name"]),
        }),
      ]),
    );
    expect(report.synonym_risks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          review_id: "synonym:감:청도반시",
          standard_name: "연시",
          synonym: "청도반시",
          risk_flags: expect.arrayContaining(["mapped_to_missing_canonical"]),
        }),
        expect.objectContaining({
          synonym: "잼",
          risk_flags: expect.arrayContaining(["ambiguous_approved_synonym"]),
        }),
        expect.objectContaining({
          review_id: "synonym:마늘:마늘",
          risk_flags: expect.arrayContaining(["same_as_standard_name", "approved_synonym_target_missing"]),
        }),
      ]),
    );
    expect(markdown).toContain("대표 재료 리스크");
    expect(markdown).toContain("동의어 리스크");
  });
});
