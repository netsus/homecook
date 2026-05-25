import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseFixtureWithYoutubeParserV2,
  type YoutubeCorpusFixture,
} from "@/lib/server/youtube-corpus-scoring";
import {
  scoreYoutubeImportReadinessFixtures,
  type YoutubeImportReadinessReport,
} from "@/lib/server/youtube-import-readiness-scoring";
import type { YoutubeDictionaryResolutionReport } from "@/lib/server/youtube-dictionary-resolution-scoring";

import corpusData from "@/tests/fixtures/youtube-corpus/corpus-v1.json";
import dictionaryReportData from "@/tests/fixtures/youtube-corpus/reports/dictionary-resolution-v1.json";

const corpus = corpusData as YoutubeCorpusFixture[];
const dictionaryReport = dictionaryReportData as {
  post_seed: YoutubeDictionaryResolutionReport;
  pre_seed: YoutubeDictionaryResolutionReport;
};
const readinessReportPath = join(
  process.cwd(),
  "tests/fixtures/youtube-corpus/reports/import-readiness-v1.json",
);

describe("YouTube import readiness scoring", () => {
  it("computes the slice27 weighted readiness score independently from live YouTube or LLM calls", () => {
    const report = scoreYoutubeImportReadinessFixtures(corpus, {
      parserVersion: "v2-slice27",
      corpusVersion: "v1",
      runId: "import-readiness-v1",
      timestamp: "2026-05-25T00:00:00.000Z",
      parser: parseFixtureWithYoutubeParserV2,
      dictionaryReport: dictionaryReport.post_seed,
    });

    if (process.env.UPDATE_YOUTUBE_IMPORT_READINESS === "1") {
      writeFileSync(readinessReportPath, `${JSON.stringify(report, null, 2)}\n`);
    }

    expect(report.aggregate.corpus_fixture_count).toBeGreaterThanOrEqual(50);
    expect(report.aggregate.real_description_fixture_count).toBeGreaterThanOrEqual(30);
    expect(report.aggregate.ingredient_f1).toBeGreaterThanOrEqual(0.9);
    expect(report.aggregate.step_f1).toBeGreaterThanOrEqual(0.9);
    expect(report.aggregate.resolution_rate).toBeGreaterThanOrEqual(1);
    expect(report.aggregate.import_readiness_score).toBeGreaterThanOrEqual(0.8);
    expect(report.aggregate.llm_fallback_used).toBe(false);
    expect(report.aggregate.external_api_used).toBe(false);
    expect(report.per_fixture.every((fixture) => fixture.errors.length === 0)).toBe(true);

    expect(existsSync(readinessReportPath)).toBe(true);
    const checkedInReport = JSON.parse(
      readFileSync(readinessReportPath, "utf8"),
    ) as YoutubeImportReadinessReport;

    expect(checkedInReport).toEqual(report);
  });
});
