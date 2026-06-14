import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const gradeExtractionScript = path.join(repoRoot, "scripts/recipe-loop/grade-extraction.mjs");
const gradeSemanticScript = path.join(repoRoot, "scripts/recipe-loop/grade-semantic.mjs");

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function splitCase(root: string, id: string) {
  return path.join(root, "notebooks/recipe_loop_data/validation", id);
}

function approvedGolden(reviewStatus = "approved") {
  return {
    schemaVersion: 1,
    videoId: "case-a",
    reviewStatus,
    recipes: [
      {
        title: "테스트 레시피",
        ingredients: [{ name: "양파", amount: "1", unit: "개" }],
        steps: [{ order: 1, instruction: "양파를 볶는다" }],
      },
    ],
  };
}

function matchingResult() {
  return {
    recipes: [
      {
        title: "테스트 레시피",
        ingredients: [{ name: "양파", amount: "1", unit: "개" }],
        steps: ["양파를 볶는다"],
      },
    ],
  };
}

describe("recipe-loop local integrity gates", () => {
  let workdir: string;

  beforeEach(() => {
    workdir = mkdtempSync(path.join(tmpdir(), "recipe-loop-integrity-"));
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("records missing deterministic artifacts as explicit failed rows", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden());
    writeJson(path.join(splitCase(workdir, "case-a"), "runs/latest/result.json"), matchingResult());
    writeJson(path.join(splitCase(workdir, "case-missing"), "golden.json"), approvedGolden());

    const result = spawnSync(
      "node",
      [gradeExtractionScript, "--split", "validation", "--out-tag", "latest", "--expected-count", "2"],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_grade_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      success: false,
      expected_count: 2,
      actual_count: 2,
      missing_result_count: 1,
      unapproved_golden_count: 0,
      expected_count_mismatch: false,
      failed_row_count: 1,
    });
    expect(summary.perVideo.find((row: { videoId: string }) => row.videoId === "case-missing")).toMatchObject({
      success: false,
      failureReason: "missing_result",
    });
  });

  it("fails deterministic grading when a gate golden is not approved", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden("draft"));
    writeJson(path.join(splitCase(workdir, "case-a"), "runs/latest/result.json"), matchingResult());

    const result = spawnSync(
      "node",
      [gradeExtractionScript, "--split", "validation", "--out-tag", "latest", "--expected-count", "1"],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_grade_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      success: false,
      expected_count: 1,
      actual_count: 1,
      unapproved_golden_count: 1,
      failed_row_count: 1,
    });
  });

  it("records semantic missing artifacts without calling the provider", () => {
    writeJson(path.join(splitCase(workdir, "case-a"), "golden.json"), approvedGolden());

    const result = spawnSync(
      "node",
      [gradeSemanticScript, "--split", "validation", "--out-tag", "latest", "--expected-count", "1"],
      { cwd: workdir, encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    const summary = JSON.parse(
      readFileSync(
        path.join(workdir, "notebooks/recipe_loop_data/validation/_semantic_summary.latest.json"),
        "utf8",
      ),
    );
    expect(summary.aggregate).toMatchObject({
      success: false,
      expected_count: 1,
      actual_count: 1,
      provider_error_count: 0,
      parse_error_count: 0,
      empty_case_count: 0,
      expected_count_mismatch: false,
      failed_row_count: 1,
    });
    expect(summary.perVideo[0]).toMatchObject({
      videoId: "case-a",
      success: false,
      failureReason: "missing_result",
    });
  });
});
