import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const REVIEW_SCRIPT_PATH = "scripts/external-ingredient-medium-risk-review.mjs";
const REPORT_SCRIPT_PATH = "scripts/external-ingredient-load-risk-report.mjs";

function runScript(scriptPath: string, args: string[]) {
  return spawnSync("node", [scriptPath, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

describe("external ingredient medium risk review script", () => {
  it("excludes broad processed representatives and keeps practical ingredients", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "homecook-external-ingredient-medium-review-"));
    const inputPath = join(tempDir, "load-ready-fixed.json");
    const outputPath = join(tempDir, "load-ready-medium-reviewed.json");
    const reviewDir = join(tempDir, "medium-review");
    const riskDir = join(tempDir, "risk");

    writeFileSync(
      inputPath,
      `${JSON.stringify(
        {
          generated_at: "2026-06-25T00:00:00.000Z",
          decisions: [
            {
              review_id: "canonical:과자",
              type: "canonical",
              standard_name: "과자",
              category: "곡류",
              decision: "approve",
              notes: "너무 광범위함.",
            },
            {
              review_id: "synonym:과자:스낵",
              type: "synonym",
              standard_name: "과자",
              synonym: "스낵",
              category: "곡류",
              decision: "approve",
            },
            {
              review_id: "canonical:쿠키",
              type: "canonical",
              standard_name: "쿠키",
              category: "곡류",
              decision: "approve",
              notes: "동의어 hold에서 대표 재료로 승격: 과자 -> 쿠키",
            },
            {
              review_id: "canonical:튀김가루",
              type: "canonical",
              standard_name: "튀김가루",
              category: "곡류",
              decision: "approve",
              notes: "동의어 hold에서 대표 재료로 승격: 밀 -> 튀김가루",
            },
            {
              review_id: "canonical:김치",
              type: "canonical",
              standard_name: "김치",
              category: "채소",
              decision: "approve",
            },
            {
              review_id: "canonical:식빵",
              type: "canonical",
              standard_name: "식빵",
              category: "곡류",
              decision: "approve",
              notes: "동의어 hold에서 대표 재료로 승격: 빵 -> 식빵",
            },
            {
              review_id: "canonical:오렌지주스",
              type: "canonical",
              standard_name: "오렌지 주스",
              category: "과일",
              decision: "approve",
            },
            {
              review_id: "canonical:레몬착즙",
              type: "canonical",
              standard_name: "레몬 착즙",
              category: "과일",
              decision: "approve",
            },
            {
              review_id: "canonical:밀떡",
              type: "canonical",
              standard_name: "밀떡",
              category: "곡류",
              decision: "approve",
            },
            {
              review_id: "canonical:멥쌀밥",
              type: "canonical",
              standard_name: "멥쌀밥",
              category: "곡류",
              decision: "approve",
            },
            {
              review_id: "canonical:샐러드드레싱",
              type: "canonical",
              standard_name: "샐러드 드레싱",
              category: "양념",
              decision: "approve",
            },
            {
              review_id: "canonical:즉석밥",
              type: "canonical",
              standard_name: "즉석밥",
              category: "곡류",
              decision: "approve",
            },
            {
              review_id: "canonical:콘샐러드",
              type: "canonical",
              standard_name: "콘샐러드",
              category: "곡류",
              decision: "approve",
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const reviewResult = runScript(REVIEW_SCRIPT_PATH, [
      "--input",
      inputPath,
      "--output",
      outputPath,
      "--review-dir",
      reviewDir,
      "--generated-at",
      "2026-06-25T00:00:00.000Z",
    ]);

    expect(reviewResult.status).toBe(0);
    expect(existsSync(outputPath)).toBe(true);
    expect(existsSync(join(reviewDir, "medium-risk-review-report.md"))).toBe(true);

    const fixed = JSON.parse(readFileSync(outputPath, "utf8"));
    const rows = fixed.decisions;

    expect(rows.find((row: { review_id: string }) => row.review_id === "canonical:과자")).toMatchObject({
      decision: "exclude",
    });
    expect(rows.find((row: { review_id: string }) => row.review_id === "synonym:과자:스낵")).toMatchObject({
      decision: "exclude",
    });
    expect(rows.find((row: { review_id: string }) => row.review_id === "canonical:쿠키")).toMatchObject({
      decision: "approve",
    });
    expect(rows.find((row: { review_id: string }) => row.review_id === "canonical:튀김가루")).toMatchObject({
      decision: "approve",
    });
    expect(rows.find((row: { review_id: string }) => row.review_id === "canonical:김치")).toMatchObject({
      decision: "approve",
    });
    expect(rows.find((row: { review_id: string }) => row.review_id === "canonical:식빵")).toMatchObject({
      decision: "approve",
    });
    expect(rows.find((row: { review_id: string }) => row.review_id === "canonical:오렌지주스")).toMatchObject({
      decision: "approve",
    });
    expect(rows.find((row: { review_id: string }) => row.review_id === "canonical:레몬착즙")).toMatchObject({
      decision: "rename",
      rename_to: "레몬즙",
    });
    expect(rows.find((row: { review_id: string }) => row.review_id === "canonical:밀떡")).toMatchObject({
      decision: "approve",
    });
    expect(rows.find((row: { review_id: string }) => row.review_id === "canonical:멥쌀밥")).toMatchObject({
      decision: "rename",
      rename_to: "쌀밥",
    });
    expect(rows.find((row: { review_id: string }) => row.review_id === "canonical:샐러드드레싱")).toMatchObject({
      decision: "approve",
    });
    expect(rows.find((row: { review_id: string }) => row.review_id === "canonical:즉석밥")).toMatchObject({
      decision: "approve",
    });
    expect(rows.find((row: { review_id: string }) => row.review_id === "canonical:콘샐러드")).toMatchObject({
      decision: "approve",
    });
    expect(fixed.summary.medium_risk_review).toMatchObject({
      auto_excluded_canonical_count: 1,
      auto_excluded_synonym_count: 1,
      auto_kept_canonical_count: 9,
      auto_renamed_canonical_count: 2,
    });

    const reportResult = runScript(REPORT_SCRIPT_PATH, [
      "--review-decisions",
      outputPath,
      "--output-dir",
      riskDir,
      "--generated-at",
      "2026-06-25T00:00:00.000Z",
    ]);

    expect(reportResult.status).toBe(0);
    const riskReport = JSON.parse(readFileSync(join(riskDir, "ingredient-load-risk-report.json"), "utf8"));
    expect(riskReport.summary.high_risk_row_count).toBe(0);
    expect(riskReport.summary.missing_synonym_target_count).toBe(0);
  });
});
