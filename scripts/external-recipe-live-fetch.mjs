#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  buildFoodSafetyRecipeUrl,
  envValue,
  parseCliArgs,
  parseFoodSafetyRecipeResponse,
  parsePositiveInteger,
  readLocalEnv,
  resolveFoodSafetyKeyOptions,
  stringOrNull,
  writeJson,
  writeText,
} from "./lib/external-recipe-ingest.mjs";

const DEFAULT_OUTPUT_DIR = ".artifacts/external-recipe-ingest/foodsafety-source";

function keyOptionsWithSampleFallback(keyOptions, allowSampleFallback) {
  if (!allowSampleFallback) return keyOptions;

  return [...keyOptions, { key: "sample", keySource: "sample" }];
}

async function fetchFoodSafetyPayload({ key, startIndex, endIndex, mockResponseFile }) {
  if (mockResponseFile) {
    return JSON.parse(await readFile(mockResponseFile, "utf8"));
  }

  const url = buildFoodSafetyRecipeUrl({ key, startIndex, endIndex });
  const response = await fetch(url);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON response: ${text.slice(0, 300)}`);
  }
}

function providerStatusFromParsed(parsed) {
  if (parsed.rows.length > 0) return "ok";
  if (parsed.resultCode && parsed.resultCode !== "INFO-000") return "failed";

  return "empty";
}

function sourceKindForKeySource(keySource) {
  return keySource === "sample" ? "sample" : "live";
}

async function fetchWithKeyRing({ keyOptions, startIndex, endIndex, mockResponseFile }) {
  const attempts = [];

  for (const keyOption of keyOptions) {
    try {
      const payload = await fetchFoodSafetyPayload({
        key: keyOption.key,
        startIndex,
        endIndex,
        mockResponseFile,
      });
      const parsed = parseFoodSafetyRecipeResponse(payload);
      const status = providerStatusFromParsed(parsed);
      const attempt = {
        provider: "foodsafety-cookrcp",
        status,
        key_source: keyOption.keySource,
        source_kind: sourceKindForKeySource(keyOption.keySource),
        rows: parsed.rows.length,
        total_count: parsed.totalCount,
        result_code: parsed.resultCode,
        result_message: parsed.resultMessage,
        request: {
          service_id: "COOKRCP01",
          data_type: "json",
          start_index: startIndex,
          end_index: endIndex,
        },
      };

      attempts.push(attempt);

      if (status === "ok") {
        return { attempt, attempts, rows: parsed.rows };
      }
    } catch (error) {
      attempts.push({
        provider: "foodsafety-cookrcp",
        status: "failed",
        key_source: keyOption.keySource,
        source_kind: sourceKindForKeySource(keyOption.keySource),
        rows: 0,
        error_code: "request_failed",
        error_message: error instanceof Error ? error.message : String(error),
        request: {
          service_id: "COOKRCP01",
          data_type: "json",
          start_index: startIndex,
          end_index: endIndex,
        },
      });
    }

    if (mockResponseFile) break;
  }

  return { attempt: attempts.at(-1) ?? null, attempts, rows: [] };
}

function renderSummary({ generatedAt, report }) {
  const lines = [
    `# FoodSafetyKorea COOKRCP01 Fetch Summary - ${generatedAt.slice(0, 10)}`,
    "",
    `- Source rows: ${report.summary.total_source_rows}`,
    `- Production DB writes: ${report.summary.production_db_writes}`,
    `- Candidate dry-run executed: ${report.summary.candidate_dry_run_executed}`,
    "",
    "## Attempts",
    "",
    "| provider | status | key_source | source_kind | rows | result |",
    "| --- | --- | --- | --- | ---: | --- |",
    ...report.providers.map((provider) => {
      const result = provider.error_message ?? provider.result_message ?? provider.result_code ?? "";

      return `| ${provider.provider} | ${provider.status} | ${provider.key_source ?? ""} | ${provider.source_kind ?? ""} | ${provider.rows} | ${String(result).replace(/\|/g, "/")} |`;
    }),
    "",
    "## Notes",
    "",
    "- Raw source rows are stored only in the output artifact directory.",
    "- No recipe, ingredient, step, or tag table is modified by this command.",
  ];

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const localEnv = await readLocalEnv();
  const outputDir = stringOrNull(args["output-dir"]) ?? DEFAULT_OUTPUT_DIR;
  const generatedAt = stringOrNull(args["generated-at"]) ?? new Date().toISOString();
  const startIndex = parsePositiveInteger(args["start-index"], 1);
  const endIndex = parsePositiveInteger(args["end-index"], 30);
  const mockResponseFile = stringOrNull(args["mock-response-file"]);
  const allowSampleFallback = args["no-sample-fallback"] !== true;
  const keyOptions = mockResponseFile
    ? [{ key: "mock", keySource: "mock" }]
    : keyOptionsWithSampleFallback(resolveFoodSafetyKeyOptions(localEnv), allowSampleFallback);

  if (keyOptions.length === 0) {
    throw new Error("No FOODSAFETYKOREA_API_KEY or DATA_GO_KR_API_KEY* key found.");
  }

  const fetchResult = await fetchWithKeyRing({
    keyOptions,
    startIndex,
    endIndex,
    mockResponseFile,
  });
  const sourceExport = {
    generated_at: generatedAt,
    source_provider: "foodsafety-cookrcp",
    source_service_id: "COOKRCP01",
    source_url: "https://www.foodsafetykorea.go.kr/api/openApiInfo.do?svc_no=COOKRCP01",
    source_license: "source-page-indicates-attribution-commercial-derivative-allowed",
    fetch_status: fetchResult.attempt?.status ?? "failed",
    source_kind: fetchResult.attempt?.source_kind ?? null,
    key_source: fetchResult.attempt?.key_source ?? null,
    request: {
      start_index: startIndex,
      end_index: endIndex,
    },
    foodsafetyCookRecipeRows: fetchResult.rows,
  };
  const report = {
    generated_at: generatedAt,
    providers: fetchResult.attempts,
    summary: {
      total_source_rows: fetchResult.rows.length,
      production_db_writes: 0,
      candidate_dry_run_executed: false,
      used_key_source: fetchResult.attempt?.key_source ?? null,
      source_kind: fetchResult.attempt?.source_kind ?? null,
      has_foodsafety_key: Boolean(envValue("FOODSAFETYKOREA_API_KEY", localEnv)),
      has_data_go_key: keyOptions.some((option) => /^DATA_GO_KR_API_KEY\d*$/.test(option.keySource)),
    },
  };

  await writeJson(path.join(outputDir, "live-source-export.json"), sourceExport);
  await writeJson(path.join(outputDir, "live-fetch-report.json"), report);
  await writeText(path.join(outputDir, "live-fetch-summary.md"), renderSummary({ generatedAt, report }));

  process.stdout.write(`Wrote ${path.join(outputDir, "live-source-export.json")}\n`);
  process.stdout.write(`Wrote ${path.join(outputDir, "live-fetch-report.json")}\n`);
  process.stdout.write(`Source rows: ${fetchResult.rows.length}\n`);
  process.stdout.write("Production DB writes: 0\n");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
