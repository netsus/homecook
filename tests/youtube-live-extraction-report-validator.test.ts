import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  validateLiveExtractorCorpus,
  validateLiveExtractorSource,
  validateScoreLayerSeparation,
  validateYoutubeLiveExtractionReport,
} from "../scripts/validate-youtube-live-extraction-report.mjs";

const SESSION_ID = "00000000-0000-4000-8000-000000000001";

function buildLiveReport(overrides: Record<string, unknown> = {}) {
  return {
    report_schema: "youtube-live-extraction-report-v1",
    report_validation: {
      artifact_producer_path: "scripts/youtube-real-app-route-smoke.mjs",
      environment: {
        homecook_youtube_fixture_provider: "0",
        node_env: "development",
      },
      evidence_origin: "live_provider",
      extractor_entrypoint: "scripts/youtube-real-app-route-smoke.mjs",
      public_improvement_claim: false,
      run_mode: "live_smoke",
      ui_verified: false,
      verified_live: false,
    },
    results: [
      {
        db: {
          sessionExport: {
            extraction_meta_summary: {
              source_providers: ["youtube_videos_list", "description_parser"],
            },
            extraction_methods: ["description"],
            id: SESSION_ID,
            source_providers: ["youtube_videos_list", "description_parser"],
            status: "draft",
          },
          sessionFound: true,
        },
        extractionId: SESSION_ID,
        id: "case-1",
        provider_names: ["youtube_videos_list", "description_parser"],
        session_ids: [SESSION_ID],
        source_providers: ["youtube_videos_list", "description_parser"],
      },
    ],
    ...overrides,
  };
}

describe("YouTube live extraction report validator", () => {
  it("derives live status from persisted session provenance", async () => {
    const result = await validateYoutubeLiveExtractionReport(buildLiveReport(), {
      checkSource: false,
    });

    expect(result.ok).toBe(true);
    expect(result.derived.verified_live).toBe(true);
    expect(result.derived.session_ids).toEqual([SESSION_ID]);
  });

  it("rejects a live report produced by a test file", async () => {
    const result = await validateYoutubeLiveExtractionReport(
      buildLiveReport({
        report_validation: {
          ...buildLiveReport().report_validation,
          artifact_producer_path: ".omx/artifacts/youtube-12/run-report.test.ts",
        },
      }),
      { checkSource: false },
    );

    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.path)).toContain("artifact_producer_path");
  });

  it("rejects fixture, mock, parity, or test provider names in live evidence", async () => {
    const report = buildLiveReport({
      results: [
        {
          ...buildLiveReport().results[0],
          provider_names: ["youtube_videos_list", "parity-visual-recipe-provider"],
        },
      ],
    });

    const result = await validateYoutubeLiveExtractionReport(report, { checkSource: false });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.message.includes("parity-visual-recipe-provider"))).toBe(true);
  });

  it("ignores self-attested verified_live without a persisted session match", async () => {
    const report = buildLiveReport({
      report_validation: {
        ...buildLiveReport().report_validation,
        verified_live: true,
      },
      results: [
        {
          extractionId: SESSION_ID,
          id: "case-1",
          provider_names: ["youtube_videos_list", "description_parser"],
          session_ids: [SESSION_ID],
          source_providers: ["youtube_videos_list", "description_parser"],
        },
      ],
    });

    const result = await validateYoutubeLiveExtractionReport(report, { checkSource: false });

    expect(result.ok).toBe(false);
    expect(result.derived.verified_live).toBe(false);
    expect(result.errors.map((error) => error.path)).toContain("verified_live");
  });

  it("rejects public improvement claims without derived UI verification", async () => {
    const result = await validateYoutubeLiveExtractionReport(
      buildLiveReport({
        report_validation: {
          ...buildLiveReport().report_validation,
          public_improvement_claim: true,
        },
      }),
      { checkSource: false },
    );

    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.path)).toContain("public_improvement_claim");
  });

  it("rejects live extraction when fixture provider mode is enabled", async () => {
    const result = await validateYoutubeLiveExtractionReport(
      buildLiveReport({
        report_validation: {
          ...buildLiveReport().report_validation,
          environment: {
            homecook_youtube_fixture_provider: "1",
            node_env: "development",
          },
        },
      }),
      { checkSource: false },
    );

    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.path)).toContain("environment.homecook_youtube_fixture_provider");
  });

  it("rejects source imports that can read fixture or expected-answer files", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "homecook-youtube-live-source-"));
    const scriptDir = join(tempDir, "scripts");
    const fixtureDir = join(tempDir, "tests", "fixtures");
    mkdirSync(scriptDir, { recursive: true });
    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(join(fixtureDir, "expected.json"), "{}\n");
    writeFileSync(
      join(scriptDir, "bad-live-extractor.mjs"),
      "import expected from '../tests/fixtures/expected.json';\nconsole.log(expected);\n",
    );

    const result = await validateLiveExtractorSource({
      entrypointPath: "scripts/bad-live-extractor.mjs",
      rootDir: tempDir,
    } as Parameters<typeof validateLiveExtractorSource>[0] & { entrypointPath: string });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.path.includes("tests/fixtures/expected.json"))).toBe(true);
  });

  it("allows only URL strings in live extractor corpus files", () => {
    expect(validateLiveExtractorCorpus(["https://www.youtube.com/watch?v=lTCplQtiGw8"]).ok).toBe(true);
    expect(
      validateLiveExtractorCorpus([
        {
          title: "answer key label",
          url: "https://www.youtube.com/watch?v=lTCplQtiGw8",
        },
      ]),
    ).toMatchObject({ ok: false });
  });

  it("rejects reference answer fields inside live result rows", async () => {
    const report = buildLiveReport({
      results: [
        {
          ...buildLiveReport().results[0],
          expected_ingredients: ["정답 재료"],
          input: {
            title: "answer key label",
            youtube_url: "https://www.youtube.com/watch?v=lTCplQtiGw8",
          },
        },
      ],
    });

    const result = await validateYoutubeLiveExtractionReport(report, { checkSource: false });

    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.path)).toContain("results[0].expected_ingredients");
    expect(result.errors.map((error) => error.path)).toContain("results[0].input");
  });

  it("keeps fixture and reference scores out of user-facing totals", () => {
    const result = validateScoreLayerSeparation({
      fixture_replay_score: 100,
      real_smoke_score: 20,
      reference_score: 95,
      ui_visible_score: 40,
      user_facing_score_sources: ["real_smoke_score", "ui_visible_score"],
    });

    expect(result.ok).toBe(true);
    expect(result.user_facing_total).toBe(30);

    const mixed = validateScoreLayerSeparation({
      fixture_replay_score: 100,
      real_smoke_score: 20,
      user_facing_score_sources: ["fixture_replay_score", "real_smoke_score"],
    });

    expect(mixed.ok).toBe(false);
  });
});
