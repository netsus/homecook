import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const FIX_SCRIPT_PATH = "scripts/external-ingredient-load-risk-fix.mjs";
const REPORT_SCRIPT_PATH = "scripts/external-ingredient-load-risk-report.mjs";

function runScript(scriptPath: string, args: string[]) {
  return spawnSync("node", [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

describe("external ingredient load risk fix script", () => {
  it("deduplicates renamed representatives and promotes missing synonym targets", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "homecook-external-ingredient-risk-fix-"));
    const inputPath = join(tempDir, "load-ready.json");
    const outputPath = join(tempDir, "load-ready-fixed.json");
    const reportDir = join(tempDir, "report");

    writeFileSync(
      inputPath,
      `${JSON.stringify(
        {
          generated_at: "2026-06-25T00:00:00.000Z",
          decisions: [
            {
              review_id: "canonical:국수",
              type: "canonical",
              standard_name: "국수",
              category: "곡류",
              decision: "rename",
              rename_to: "소면",
              notes: "국수는 보통 완제품을 얘기함.",
            },
            {
              review_id: "canonical:소면",
              type: "canonical",
              standard_name: "소면",
              category: "곡류",
              decision: "approve",
              notes: "동의어 hold에서 대표 재료로 승격: 국수 -> 소면",
            },
            {
              review_id: "canonical:개암",
              type: "canonical",
              standard_name: "개암",
              category: "과일",
              decision: "rename",
              rename_to: "헤이즐넛",
            },
            {
              review_id: "canonical:호밀",
              type: "canonical",
              standard_name: "호밀",
              category: "곡류",
              decision: "rename",
              rename_to: "호밀가루",
            },
            {
              review_id: "synonym:개암:헤이즐넛",
              type: "synonym",
              standard_name: "개암",
              synonym: "헤이즐넛",
              category: "과일",
              decision: "approve",
            },
            {
              review_id: "synonym:호밀:통호밀",
              type: "synonym",
              standard_name: "호밀",
              synonym: "통호밀",
              category: "곡류",
              decision: "approve",
            },
            {
              review_id: "synonym:감:연시",
              type: "synonym",
              standard_name: "감",
              synonym: "연시",
              category: "과일",
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
          ],
        },
        null,
        2,
      )}\n`,
    );

    const fixResult = runScript(FIX_SCRIPT_PATH, [
      "--input",
      inputPath,
      "--output",
      outputPath,
      "--generated-at",
      "2026-06-25T00:00:00.000Z",
    ]);

    expect(fixResult.status).toBe(0);
    expect(existsSync(outputPath)).toBe(true);

    const fixed = JSON.parse(readFileSync(outputPath, "utf8"));
    const rows = fixed.decisions;

    expect(rows.find((row: { review_id: string }) => row.review_id === "canonical:국수")).toMatchObject({
      decision: "exclude",
      rename_to: "",
    });
    expect(rows.find((row: { review_id: string }) => row.review_id === "synonym:소면:국수")).toMatchObject({
      type: "synonym",
      standard_name: "소면",
      synonym: "국수",
      decision: "approve",
    });
    expect(rows.find((row: { review_id: string }) => row.review_id === "canonical:연시")).toMatchObject({
      type: "canonical",
      standard_name: "연시",
      decision: "approve",
    });
    expect(rows.find((row: { review_id: string }) => row.review_id === "synonym:감:연시")).toMatchObject({
      decision: "exclude",
      standard_name: "감",
      synonym: "연시",
    });
    expect(rows.find((row: { review_id: string }) => row.review_id === "synonym:헤이즐넛:개암")).toMatchObject({
      type: "synonym",
      standard_name: "헤이즐넛",
      synonym: "개암",
      decision: "approve",
    });
    expect(rows.find((row: { review_id: string }) => row.review_id === "synonym:개암:헤이즐넛")).toMatchObject({
      decision: "exclude",
    });
    expect(rows.find((row: { review_id: string }) => row.review_id === "canonical:호밀")).toMatchObject({
      decision: "approve",
      rename_to: "",
    });
    expect(rows.find((row: { review_id: string }) => row.review_id === "canonical:호밀가루")).toMatchObject({
      type: "canonical",
      standard_name: "호밀가루",
      decision: "approve",
    });

    const reportResult = runScript(REPORT_SCRIPT_PATH, [
      "--review-decisions",
      outputPath,
      "--output-dir",
      reportDir,
      "--generated-at",
      "2026-06-25T00:00:00.000Z",
    ]);

    expect(reportResult.status).toBe(0);

    const report = JSON.parse(readFileSync(join(reportDir, "ingredient-load-risk-report.json"), "utf8"));
    expect(report.summary.high_risk_row_count).toBe(0);
    expect(report.summary.duplicate_canonical_name_count).toBe(0);
    expect(report.summary.missing_synonym_target_count).toBe(0);
  });
});
