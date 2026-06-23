import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const SCRIPT_PATH = "scripts/external-ingredient-live-fetch.mjs";

function runLiveFetch(args: string[], envOverrides: Record<string, string | undefined> = {}) {
  return spawnSync("node", [SCRIPT_PATH, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      DATA_GO_KR_API_KEY: "test-public-data-key",
      KOREANFOOD_RDA_API_KEY: "",
      FOODSERVICE_API_KEY: "",
      ...envOverrides,
    },
  });
}

describe("external ingredient live fetch script", () => {
  it("uses the public data portal key for MFDS and RDA exports before running the file dry-run", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "homecook-external-ingredient-live-fetch-"));
    const mockDir = join(tempDir, "mock");
    const outputDir = join(tempDir, "out");
    mkdirSync(mockDir);

    writeFileSync(
      join(mockDir, "mfds.json"),
      `${JSON.stringify({
        response: {
          header: { resultCode: "00", resultMsg: "NORMAL SERVICE." },
          body: {
            items: [
              {
                foodCd: "MFDS-LIVE-001",
                foodNm: "양파 스낵",
                typeNm: "가공식품",
                srcNm: "식품의약품안전처",
                insttNm: "식품의약품안전처",
                foodLv3Nm: "채소류",
                foodLv4Nm: "양파",
                foodLv5Nm: "해당없음",
                foodLv6Nm: "해당없음",
                crtrYmd: "2026-05-29",
              },
            ],
          },
        },
      })}\n`,
      { flag: "wx" },
    );
    writeFileSync(
      join(mockDir, "rda-A.xml"),
      [
        "<response>",
        "<header><result_Code>200</result_Code><result_Msg>OK</result_Msg></header>",
        "<body><total_Count>1</total_Count><items><item>",
        "<no>1</no>",
        "<food_Code>A001001A010a</food_Code>",
        "<food_Grupp>곡류 및 그 제품</food_Grupp>",
        "<food_Nm>귀리, 겉귀리, 도정, 생것</food_Nm>",
        "<food_Eng_Nm>Oat</food_Eng_Nm>",
        "<origin_Nm>국가표준식품성분 DB 10.4(2026)</origin_Nm>",
        "<examin_Year>2026</examin_Year>",
        "</item></items></body>",
        "</response>\n",
      ].join(""),
      { flag: "wx" },
    );

    const result = runLiveFetch([
      "--providers",
      "mfds,rda",
      "--mock-response-dir",
      mockDir,
      "--output-dir",
      outputDir,
      "--generated-at",
      "2026-05-29T00:00:00.000Z",
      "--rda-groups",
      "A",
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Successful providers: 2/2");
    expect(result.stdout).not.toContain("test-public-data-key");

    const sourceExport = JSON.parse(readFileSync(join(outputDir, "live-source-export.json"), "utf8"));
    const liveReport = JSON.parse(readFileSync(join(outputDir, "live-fetch-report.json"), "utf8"));
    const candidateReport = JSON.parse(readFileSync(join(outputDir, "candidate-report.json"), "utf8"));
    const seedArtifact = JSON.parse(
      readFileSync(join(outputDir, "approved-seed-promotion-artifact.json"), "utf8"),
    );

    expect(sourceExport.dataGoKrProcessedFoodRows).toHaveLength(1);
    expect(sourceExport.rdaFoodCompositionRows).toHaveLength(1);
    expect(liveReport.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "mfds", status: "ok", key_source: "DATA_GO_KR_API_KEY" }),
        expect.objectContaining({ provider: "rda", status: "ok", key_source: "DATA_GO_KR_API_KEY" }),
      ]),
    );
    expect(candidateReport).toMatchObject({
      blocked: false,
      summary: {
        total_rows: 2,
        candidate_count: 2,
        pending_review_count: 2,
      },
    });
    expect(candidateReport.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source_system: "mfds",
          source_row_id: "MFDS-LIVE-001",
          normalized_name: "양파",
        }),
        expect.objectContaining({
          source_system: "rda",
          source_row_id: "A001001A010a",
          normalized_name: "귀리",
        }),
      ]),
    );
    expect(seedArtifact.seed_rows).toEqual([]);
  });

  it("ignores RDA-specific key aliases for the current public data portal endpoint", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "homecook-external-ingredient-rda-key-alias-"));
    const mockDir = join(tempDir, "mock");
    const outputDir = join(tempDir, "out");
    mkdirSync(mockDir);

    writeFileSync(
      join(mockDir, "rda-A.xml"),
      [
        "<response>",
        "<header><result_Code>200</result_Code><result_Msg>OK</result_Msg></header>",
        "<body><total_Count>1</total_Count><items><item>",
        "<food_Code>A001001A010a</food_Code>",
        "<food_Grupp>곡류 및 그 제품</food_Grupp>",
        "<food_Nm>귀리, 겉귀리, 도정, 생것</food_Nm>",
        "<origin_Nm>국가표준식품성분 DB 10.4(2026)</origin_Nm>",
        "</item></items></body>",
        "</response>\n",
      ].join(""),
      { flag: "wx" },
    );

    const result = runLiveFetch(
      [
        "--providers",
        "rda",
        "--mock-response-dir",
        mockDir,
        "--output-dir",
        outputDir,
        "--generated-at",
        "2026-06-24T00:00:00.000Z",
        "--rda-groups",
        "A",
      ],
      {
        DATA_GO_KR_API_KEY: "",
        KOREANFOOD_RDA_API_KEY: "legacy-rda-key",
        FOODSERVICE_API_KEY: "legacy-foodservice-key",
      },
    );

    expect(result.status).toBe(0);
    expect(result.stdout).not.toContain("legacy-rda-key");
    expect(result.stdout).not.toContain("legacy-foodservice-key");

    const liveReport = JSON.parse(readFileSync(join(outputDir, "live-fetch-report.json"), "utf8"));

    const rdaProvider = liveReport.providers.find(
      (provider: { provider: string }) => provider.provider === "rda",
    );

    expect(rdaProvider).toMatchObject({
      provider: "rda",
      status: "ok",
    });
    expect(["DATA_GO_KR_API_KEY", null]).toContain(rdaProvider.key_source);
  });

  it("records provider failures without writing a candidate report when no rows are fetched", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "homecook-external-ingredient-live-failure-"));
    const mockDir = join(tempDir, "mock");
    const outputDir = join(tempDir, "out");
    mkdirSync(mockDir);

    writeFileSync(
      join(mockDir, "mfds.json"),
      `${JSON.stringify({
        response: {
          header: { resultCode: "30", resultMsg: "SERVICE KEY IS NOT REGISTERED ERROR." },
        },
      })}\n`,
      { flag: "wx" },
    );
    writeFileSync(
      join(mockDir, "rda-A.xml"),
      "<response><header><result_Code>101</result_Code><result_Msg>서비스키 인증 실패</result_Msg></header></response>\n",
      { flag: "wx" },
    );

    const result = runLiveFetch([
      "--providers",
      "mfds,rda",
      "--mock-response-dir",
      mockDir,
      "--output-dir",
      outputDir,
      "--generated-at",
      "2026-05-29T00:00:00.000Z",
      "--rda-groups",
      "A",
    ]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Successful providers: 0/2");
    expect(existsSync(join(outputDir, "candidate-report.json"))).toBe(false);

    const liveReport = JSON.parse(readFileSync(join(outputDir, "live-fetch-report.json"), "utf8"));

    expect(liveReport.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: "mfds",
          status: "failed",
          error_code: "30",
        }),
        expect.objectContaining({
          provider: "rda",
          status: "failed",
          error_code: "101",
        }),
      ]),
    );
  });
});
