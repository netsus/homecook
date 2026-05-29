import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import realSourceSampleFixture from "@/tests/fixtures/external-ingredient-ingest/real-source-sample-2026-05-29.json";

const SCRIPT_PATH = "scripts/external-ingredient-file-dry-run.mjs";

function runDryRun(args: string[]) {
  return spawnSync("node", [SCRIPT_PATH, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      DATA_GO_KR_API_KEY: "",
      FOODSERVICE_API_KEY: "",
      KOREANFOOD_RDA_API_KEY: "",
    },
  });
}

describe("external ingredient file dry-run script", () => {
  it("writes a review report and empty seed artifact from local source rows without API keys", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "homecook-external-ingredient-dry-run-"));
    const inputPath = join(tempDir, "source-rows.json");
    const outputDir = join(tempDir, "out");

    writeFileSync(
      inputPath,
      `${JSON.stringify(
        [
          {
            source_system: "mfds",
            source_file: "manual-file-export.json",
            source_version: "2026-05-file",
            source_date: "2026-05-29",
            source_license: "public-open-data",
            source_row_id: "MFDS-FILE-001",
            original_name: " 양파 (국산) ",
            legacy_category: "채소",
            raw_payload: { FOOD_NM: " 양파 (국산) " },
          },
        ],
        null,
        2,
      )}\n`,
    );

    const result = runDryRun([
      "--input",
      inputPath,
      "--output-dir",
      outputDir,
      "--generated-at",
      "2026-05-29T00:00:00.000Z",
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("candidate-report.json");
    expect(result.stdout).toContain("Production DB writes: 0");

    const reportPath = join(outputDir, "candidate-report.json");
    const seedPath = join(outputDir, "approved-seed-promotion-artifact.json");
    const summaryPath = join(outputDir, "summary.md");

    expect(existsSync(reportPath)).toBe(true);
    expect(existsSync(seedPath)).toBe(true);
    expect(existsSync(summaryPath)).toBe(true);

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const seedArtifact = JSON.parse(readFileSync(seedPath, "utf8"));
    const summary = readFileSync(summaryPath, "utf8");

    expect(report).toMatchObject({
      generated_at: "2026-05-29T00:00:00.000Z",
      blocked: false,
      summary: {
        total_rows: 1,
        candidate_count: 1,
        pending_review_count: 1,
      },
    });
    expect(report.candidates[0]).toMatchObject({
      source_system: "mfds",
      source_file: "manual-file-export.json",
      source_row_id: "MFDS-FILE-001",
      original_name: " 양파 (국산) ",
      normalized_name: "양파",
      review_status: "pending_review",
      raw_payload: { FOOD_NM: " 양파 (국산) " },
    });
    expect(seedArtifact.seed_rows).toEqual([]);
    expect(summary).toContain("Production DB writes: 0");
    expect(summary).toContain("No API key was read or required.");
  });

  it("maps keyless real-source sample exports before generating candidates", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "homecook-external-ingredient-real-source-"));
    const inputPath = join(tempDir, "real-source-export.json");
    const outputDir = join(tempDir, "out");

    writeFileSync(inputPath, `${JSON.stringify(realSourceSampleFixture, null, 2)}\n`);

    const result = runDryRun([
      "--input",
      inputPath,
      "--output-dir",
      outputDir,
      "--generated-at",
      "2026-05-29T00:00:00.000Z",
    ]);

    expect(result.status).toBe(0);

    const report = JSON.parse(readFileSync(join(outputDir, "candidate-report.json"), "utf8"));

    expect(report).toMatchObject({
      blocked: false,
      summary: {
        total_rows: 8,
        candidate_count: 8,
        pending_review_count: 8,
        needs_source_check_count: 0,
      },
    });
    expect(report.candidates.find((candidate: { source_row_id: string }) => candidate.source_row_id === "P120-600060000-1716")).toMatchObject({
      source_system: "mfds",
      normalized_name: "기타 수산가공품",
      category_candidate: { label: "해산물" },
    });
    expect(report.candidates.find((candidate: { source_row_id: string }) => candidate.source_row_id === "A001001A010a")).toMatchObject({
      source_system: "rda",
      normalized_name: "귀리",
      category_candidate: { label: "곡류" },
    });
  });

  it("promotes only approved review-decision fingerprints into the seed artifact", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "homecook-external-ingredient-review-decision-"));
    const inputPath = join(tempDir, "source-rows.json");
    const pendingOutputDir = join(tempDir, "pending");
    const reviewedOutputDir = join(tempDir, "reviewed");
    const decisionsPath = join(tempDir, "review-decisions.json");

    writeFileSync(
      inputPath,
      `${JSON.stringify(
        [
          {
            source_system: "rda",
            source_file: "manual-rda-export.json",
            source_version: "2026-05-file",
            source_date: "2026-05-29",
            source_license: "kogl-type-1",
            source_row_id: "RDA-APPROVE-001",
            original_name: "귀리, 겉귀리, 도정, 생것",
            legacy_category: "곡류",
            raw_payload: { fdCode: "RDA-APPROVE-001" },
          },
          {
            source_system: "rda",
            source_file: "manual-rda-export.json",
            source_version: "2026-05-file",
            source_date: "2026-05-29",
            source_license: "kogl-type-1",
            source_row_id: "RDA-PENDING-001",
            original_name: "감자, 생것",
            legacy_category: "곡류",
            raw_payload: { fdCode: "RDA-PENDING-001" },
          },
        ],
        null,
        2,
      )}\n`,
    );

    const pendingResult = runDryRun([
      "--input",
      inputPath,
      "--output-dir",
      pendingOutputDir,
      "--generated-at",
      "2026-05-29T00:00:00.000Z",
    ]);

    expect(pendingResult.status).toBe(0);

    const pendingReport = JSON.parse(
      readFileSync(join(pendingOutputDir, "candidate-report.json"), "utf8"),
    );
    const approvedCandidate = pendingReport.candidates.find(
      (candidate: { source_row_id: string }) => candidate.source_row_id === "RDA-APPROVE-001",
    );

    writeFileSync(
      decisionsPath,
      `${JSON.stringify(
        {
          decisions: [
            {
              source_fingerprint: approvedCandidate.source_fingerprint,
              status: "approved",
            },
          ],
        },
        null,
        2,
      )}\n`,
    );

    const reviewedResult = runDryRun([
      "--input",
      inputPath,
      "--review-decisions",
      decisionsPath,
      "--output-dir",
      reviewedOutputDir,
      "--generated-at",
      "2026-05-29T00:00:00.000Z",
    ]);

    expect(reviewedResult.status).toBe(0);

    const reviewedReport = JSON.parse(
      readFileSync(join(reviewedOutputDir, "candidate-report.json"), "utf8"),
    );
    const seedArtifact = JSON.parse(
      readFileSync(join(reviewedOutputDir, "approved-seed-promotion-artifact.json"), "utf8"),
    );

    expect(reviewedReport).toMatchObject({
      summary: {
        approved_count: 1,
        pending_review_count: 1,
      },
    });
    expect(seedArtifact.seed_rows).toEqual([
      expect.objectContaining({
        seed_idempotency_key: `external:${approvedCandidate.source_fingerprint}`,
        standard_name: "귀리, 겉귀리, 도정, 생것",
        legacy_category: "곡류",
        source_fingerprint: approvedCandidate.source_fingerprint,
        source_system: "rda",
        source_row_id: "RDA-APPROVE-001",
      }),
    ]);
    expect(seedArtifact.skipped_rows).toEqual([
      expect.objectContaining({
        normalized_name: "감자, 생것",
        review_status: "pending_review",
      }),
    ]);
  });
});
