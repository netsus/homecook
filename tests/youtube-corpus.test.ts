import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseFixtureWithYoutubeParserV2,
  scoreIngredientMatches,
  scoreStepMatches,
  scoreYoutubeCorpusFixtures,
  validateYoutubeCorpusFixtures,
  type YoutubeCorpusFixture,
  type YoutubeCorpusReport,
} from "@/lib/server/youtube-corpus-scoring";

import corpusData from "@/tests/fixtures/youtube-corpus/corpus-v1.json";

const corpus = corpusData as YoutubeCorpusFixture[];
const baselineReportPath = join(
  process.cwd(),
  "tests/fixtures/youtube-corpus/reports/baseline-v2.json",
);
const hardeningReportPath = join(
  process.cwd(),
  "tests/fixtures/youtube-corpus/reports/parser-hardening-v1.json",
);

describe("YouTube corpus fixture contract", () => {
  it("keeps the minimum corpus size, category distribution, real-description ratio, and sanitization contract", () => {
    const validation = validateYoutubeCorpusFixtures(corpus);

    expect(validation.errors).toEqual([]);
    expect(corpus).toHaveLength(36);
    expect(corpus.filter((fixture) => fixture.source === "real-description")).toHaveLength(24);

    for (const category of ["structured", "semi-structured", "weak", "noise", "multi-recipe"]) {
      expect(corpus.filter((fixture) => fixture.category === category).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("stores the wild sample guide next to the offline corpus", () => {
    const guide = readFileSync(
      join(process.cwd(), "tests/fixtures/youtube-corpus/wild-sample-guide.md"),
      "utf8",
    );

    expect(guide).toContain("5개 채널");
    expect(guide).toContain("10개 영상");
    expect(guide).toContain("wild_sample_aggregate");
  });

  it("warns when corpus fixture count or category minimums are below contract", () => {
    const validation = validateYoutubeCorpusFixtures([corpus[0]]);

    expect(validation.errors).toEqual([]);
    expect(validation.warnings).toContain("fixture count is below 36: 1");
    expect(validation.warnings).toContain("semi-structured fixture count is below 3: 0");
    expect(validation.warnings).toContain("real-description fixture count is below 24: 1");
  });
});

describe("YouTube corpus scoring harness", () => {
  it("scores ingredient names exactly and gives partial credit for amount/unit mismatches", () => {
    const score = scoreIngredientMatches(
      [
        { name: "김치", amount: 200, unit: "g", type: "QUANT" },
        { name: "대파", amount: null, unit: null, type: "TO_TASTE" },
      ],
      [
        { name: "김치", amount: 100, unit: "g" },
        { name: "양파", amount: 1, unit: "개" },
      ],
    );

    expect(score).toEqual({ precision: 0.25, recall: 0.25, f1: 0.25 });
  });

  it("scores steps by regex pattern and gives partial credit for order mismatch", () => {
    const score = scoreStepMatches(
      [
        { step_number: 1, instruction_pattern: "양파.*볶" },
        { step_number: 2, instruction_pattern: "물.*끓" },
      ],
      ["물을 넣고 끓인다", "양파를 볶는다"],
    );

    expect(score).toEqual({ precision: 0.7, recall: 0.7, f1: 0.7 });
  });

  it("treats a noise fixture with empty parser output as a true negative", () => {
    const report = scoreYoutubeCorpusFixtures(
      [
        {
          id: "noise-unit",
          category: "noise",
          source: "synthetic",
          description: "구독과 알림 설정을 부탁드립니다.",
          expected_ingredients: [],
          expected_steps: [],
          metadata: { video_category: "not-recipe", has_component_structure: false, multi_recipe: false },
        },
      ],
      {
        parserVersion: "unit",
        corpusVersion: "unit",
        runId: "unit",
        timestamp: "2026-05-24T00:00:00.000Z",
        parser: () => ({ ingredients: [], steps: [] }),
      },
    );

    expect(report.per_fixture[0].overall_f1).toBe(1);
    expect(report.aggregate.corpus_avg_f1).toBe(1);
  });

  it("records fixture-level errors without aborting the whole run", () => {
    const report = scoreYoutubeCorpusFixtures(
      [
        {
          id: "parser-crash-unit",
          category: "structured",
          source: "synthetic",
          description: "재료\n김치 200g\n만드는 법\n1. 김치를 볶는다.",
          expected_ingredients: [{ name: "김치", amount: 200, unit: "g", type: "QUANT" }],
          expected_steps: [{ step_number: 1, instruction_pattern: "김치.*볶" }],
          metadata: { video_category: "recipe", has_component_structure: false, multi_recipe: false },
        },
      ],
      {
        parserVersion: "unit",
        corpusVersion: "unit",
        runId: "unit",
        timestamp: "2026-05-24T00:00:00.000Z",
        parser: () => {
          throw new Error("parser exploded");
        },
      },
    );

    expect(report.per_fixture[0].errors).toEqual(["parser exploded"]);
    expect(report.per_fixture[0].overall_f1).toBe(0);
  });

  it("keeps the checked-in parser v2 baseline as the pre-hardening artifact", () => {
    expect(existsSync(baselineReportPath)).toBe(true);
    const baselineReport = JSON.parse(readFileSync(baselineReportPath, "utf8")) as YoutubeCorpusReport;

    expect(baselineReport).toMatchObject({
      run_id: "baseline-v2",
      parser_version: "v2",
      corpus_version: "v1",
      aggregate: {
        corpus_avg_f1: 0.4932,
        category_avg: {
          structured: 0.9145,
          "semi-structured": 0.1799,
          weak: 0,
          noise: 1,
          "multi-recipe": 0.5,
        },
      },
    });
    expect(baselineReport.per_fixture).toHaveLength(corpus.length);
  });

  it("recomputes the parser hardening report and enforces slice 24 score floors", () => {
    const report = scoreYoutubeCorpusFixtures(corpus, {
      parserVersion: "v2-hardening",
      corpusVersion: "v1",
      runId: "parser-hardening-v1",
      timestamp: "2026-05-25T00:00:00.000Z",
      parser: parseFixtureWithYoutubeParserV2,
    });

    if (process.env.UPDATE_YOUTUBE_CORPUS_HARDENING === "1") {
      writeFileSync(hardeningReportPath, `${JSON.stringify(report, null, 2)}\n`);
    }

    expect(existsSync(hardeningReportPath)).toBe(true);
    const hardeningReport = JSON.parse(readFileSync(hardeningReportPath, "utf8")) as YoutubeCorpusReport;

    expect(report).toEqual(hardeningReport as YoutubeCorpusReport);
    expect(report.aggregate.corpus_avg_f1).toBeGreaterThanOrEqual(0.8);
    expect(report.aggregate.category_avg.structured).toBeGreaterThanOrEqual(0.8645);
    expect(report.aggregate.category_avg["semi-structured"]).toBeGreaterThan(0.1799);
    expect(report.aggregate.category_avg.weak).toBeGreaterThan(0);
    expect(report.aggregate.category_avg.noise).toBe(1);
    expect(report.aggregate.category_avg["multi-recipe"]).toBeGreaterThanOrEqual(0.5);
    expect(report.per_fixture.every((fixture) => fixture.errors.length === 0)).toBe(true);
  });
});
