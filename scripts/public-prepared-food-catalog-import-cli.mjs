#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";

import { runLocalPsqlJson } from "./lib/ingredient-nutrition-local-db.mjs";
import { publishArtifactBundle } from "./lib/public-nutrition-artifacts.mjs";
import {
  PreparedFoodCatalogImportError,
  buildPreparedFoodRawBatch,
  buildPreparedFoodSnapshotInput,
  buildPreparedFoodCatalogImportBundle,
  buildPreparedFoodCatalogReview,
  createMemoryPreparedFoodCatalogImportStore,
  fetchPreparedFoodCatalogLiveBatch,
  generatePreparedFoodCatalogPerfRows,
  normalizePreparedFoodCatalogBatch,
  parsePreparedFoodCsv,
  runPreparedFoodCatalogImport,
} from "./lib/public-prepared-food-catalog-import.mjs";

const command = process.argv[2] ?? "";
const DEFAULT_SOURCE = Object.freeze({
  id: "data-go-kr-15100066",
  provider: "data.go.kr",
  dataset: "전국통합식품영양성분정보(가공식품) 표준데이터",
  source_version: "2026-06-26",
  data_basis_date: "2026-06-26",
  endpoint_or_file_url: "https://www.data.go.kr/data/15100066/standard.do",
  license: "이용허락범위 제한 없음",
  license_url: "https://www.data.go.kr/data/15100066/standard.do",
  license_evidence_url: "https://www.data.go.kr/data/15100066/standard.do",
  license_verified_at: "2026-07-17",
});

function parseArgs(values) {
  const args = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (token === "--" || !token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = values[index + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function requireArg(args, key) {
  const value = args[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PreparedFoodCatalogImportError("CLI_ARGUMENT_MISSING", { argument: key });
  }
  return value;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new PreparedFoodCatalogImportError("MALFORMED_INPUT_FILE");
    }
    throw error;
  }
}

async function readInputRows(filePath) {
  const text = await readFile(filePath, "utf8");
  if (/\.csv$/i.test(filePath)) {
    return parsePreparedFoodCsv(text);
  }
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.rows)) return parsed.rows;
  if (Array.isArray(parsed.items)) return parsed.items;
  throw new PreparedFoodCatalogImportError("MALFORMED_INPUT_FILE");
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function jsonLines(rows) {
  return rows.length > 0 ? `${rows.map((row) => JSON.stringify(row)).join("\n")}\n` : "";
}

function successSummary(currentCommand, extra = {}) {
  return {
    success: true,
    command: currentCommand,
    production_db_writes: 0,
    ...extra,
  };
}

function sqlJsonExpression(value) {
  return `convert_from(decode('${Buffer.from(JSON.stringify(value), "utf8").toString("base64")}', 'base64'), 'UTF8')::jsonb`;
}

function sqlTextExpression(value) {
  return `convert_from(decode('${Buffer.from(String(value), "utf8").toString("base64")}', 'base64'), 'UTF8')`;
}

async function runFetch(args) {
  const outputDir = requireArg(args, "output-dir");
  const fetchedAt =
    typeof args["fetched-at"] === "string"
      ? args["fetched-at"]
      : new Date().toISOString();
  let raw;
  if (args.live) {
    const apiKey = process.env.DATA_GO_KR_API_KEY ?? "";
    if (apiKey.length === 0) {
      throw new PreparedFoodCatalogImportError("CLI_ARGUMENT_MISSING", { argument: "DATA_GO_KR_API_KEY" });
    }
    raw = await fetchPreparedFoodCatalogLiveBatch({
      apiKey,
      fetchedAt,
      source: DEFAULT_SOURCE,
      pageSize: Number(args["page-size"] ?? 1000),
      maxPages: Number(args["max-pages"] ?? 10),
    });
  } else {
    const inputPath = requireArg(args, "input");
    const rows = await readInputRows(inputPath);
    raw = buildPreparedFoodRawBatch({
      ...buildPreparedFoodSnapshotInput({
        source: DEFAULT_SOURCE,
        query: {
          acquisition_mode: "file",
          file_name: path.basename(inputPath),
        },
        rows,
      }),
      fetchedAt,
    });
  }

  const summary = successSummary("fetch", {
    status: "raw",
    logical_batch_id: raw.manifest.logical_batch_id,
    fetched_raw_count: raw.manifest.fetched_raw_count,
    raw_sha256: raw.manifest.sha256,
  });
  await publishArtifactBundle(outputDir, {
    "raw-snapshot.json": jsonText(raw.rawSnapshot),
    "manifest.json": jsonText(raw.manifest),
    "summary.json": jsonText(summary),
  }, { secretValues: [process.env.DATA_GO_KR_API_KEY ?? ""] });
  return summary;
}

async function runNormalize(args) {
  const inputDir = requireArg(args, "input-dir");
  const outputDir = requireArg(args, "output-dir");
  const manifest = await readJson(path.join(inputDir, "manifest.json"));
  const rawSnapshot = await readJson(path.join(inputDir, "raw-snapshot.json"));
  const normalized = normalizePreparedFoodCatalogBatch({
    rawSnapshot,
    manifest,
    adapterSchemaVersion: "public-prepared-food-row-v1",
  });
  const summary = successSummary("normalize", {
    status: "normalized",
    logical_batch_id: normalized.logical_batch_id,
    counts: normalized.counts,
    normalized_content_hash: normalized.normalized_content_hash,
  });
  await publishArtifactBundle(outputDir, {
    "source-manifest.json": jsonText(manifest),
    "normalized-bundle.json": jsonText(normalized),
    "normalized-rows.jsonl": jsonLines(normalized.rows),
    "quarantine-report.json": jsonText({
      counts: normalized.counts,
      reason_counts: normalized.quarantine_reason_counts,
      rows: normalized.quarantined,
      production_db_writes: 0,
    }),
    "summary.json": jsonText(summary),
  }, { secretValues: [process.env.DATA_GO_KR_API_KEY ?? ""] });
  return summary;
}

async function runReview(args) {
  const inputDir = requireArg(args, "input-dir");
  const outputDir = requireArg(args, "output-dir");
  const normalized = await readJson(path.join(inputDir, "normalized-bundle.json"));
  const review = buildPreparedFoodCatalogReview({
    normalizedBundle: normalized,
    decisions: (await readJson(requireArg(args, "decisions"))).decisions,
  });
  const sourceManifest = await readJson(path.join(inputDir, "source-manifest.json")).catch(() =>
    readJson(path.join(inputDir, "manifest.json")),
  );
  const summary = successSummary("review", {
    status: "reviewed",
    logical_batch_id: review.logical_batch_id,
    blocker_count: review.blocker_count,
    review_checksum: review.review_checksum,
  });
  await publishArtifactBundle(outputDir, {
    "source-manifest.json": jsonText(sourceManifest),
    "normalized-bundle.json": jsonText(normalized),
    "review-report.json": jsonText(review),
    "summary.json": jsonText(summary),
  }, { secretValues: [process.env.DATA_GO_KR_API_KEY ?? ""] });
  return summary;
}

async function runImport(args) {
  const inputDir = requireArg(args, "input-dir");
  const manifest = await readJson(path.join(inputDir, "source-manifest.json")).catch(() =>
    readJson(path.join(inputDir, "manifest.json")),
  );
  const normalizedBundle = await readJson(path.join(inputDir, "normalized-bundle.json"));
  const reviewReport = await readJson(path.join(inputDir, "review-report.json"));
  const bundle = buildPreparedFoodCatalogImportBundle({
    manifest,
    normalizedBundle,
    reviewReport,
  });
  const actor_user_id = requireArg(args, "actor-user-id");
  const run_id = requireArg(args, "run-id");
  const idempotency_key = requireArg(args, "idempotency-key");
  const mode = String(args.mode ?? "apply");
  if (mode !== "apply") {
    return runPreparedFoodCatalogImport({
      bundle,
      mode: "dry-run",
      environment: "local",
      store: createMemoryPreparedFoodCatalogImportStore(),
      actor_user_id,
      run_id,
      idempotency_key,
    });
  }
  return runLocalPsqlJson(`
    select public.apply_public_prepared_food_catalog_import(
      ${sqlJsonExpression({
        actor_user_id,
        run_id,
        idempotency_key,
        bundle,
      })}
    )::text;
  `);
}

function runReport(args) {
  return runLocalPsqlJson(`
    select public.get_public_prepared_food_catalog_import_run(
      ${sqlTextExpression(requireArg(args, "run-id"))}
    )::text;
  `);
}

function runDisable(args) {
  return runLocalPsqlJson(`
    select public.disable_public_prepared_food_catalog_import(
      ${sqlTextExpression(requireArg(args, "model-run-key"))},
      ${sqlTextExpression(requireArg(args, "disable-key"))},
      ${sqlTextExpression(requireArg(args, "actor-user-id"))}::uuid,
      ${sqlTextExpression(requireArg(args, "reason"))},
      ${sqlTextExpression(requireArg(args, "reviewed-at"))}::timestamptz
    )::text;
  `);
}

async function runPerfFixture(args) {
  const count = Number(requireArg(args, "count"));
  const outputDir = requireArg(args, "output-dir");
  const rows = generatePreparedFoodCatalogPerfRows({
    count,
    seed: String(args.seed ?? `perf-${count}`),
  });
  const raw = buildPreparedFoodRawBatch({
    ...buildPreparedFoodSnapshotInput({
      source: DEFAULT_SOURCE,
      query: {
        acquisition_mode: "perf-fixture",
        count: String(count),
      },
      rows,
    }),
    fetchedAt: new Date().toISOString(),
  });
  const normalized = normalizePreparedFoodCatalogBatch({
    rawSnapshot: raw.rawSnapshot,
    manifest: raw.manifest,
    adapterSchemaVersion: "public-prepared-food-row-v1",
  });
  const review = buildPreparedFoodCatalogReview({
    normalizedBundle: normalized,
    decisions: normalized.rows.map((row) => ({ fingerprint: row.fingerprint, status: "approved" })),
  });
  const bundle = buildPreparedFoodCatalogImportBundle({
    manifest: raw.manifest,
    normalizedBundle: normalized,
    reviewReport: review,
  });
  const summary = successSummary("perf-fixture", {
    count,
    logical_batch_id: bundle.logical_batch_id,
    content_hash: bundle.content_hash,
  });
  await publishArtifactBundle(outputDir, {
    "manifest.json": jsonText(raw.manifest),
    "normalized-bundle.json": jsonText(normalized),
    "review-report.json": jsonText(review),
    "approved-import-bundle.json": jsonText(bundle),
    "summary.json": jsonText(summary),
  });
  return summary;
}

const args = parseArgs(process.argv.slice(3));

async function main() {
  const runners = {
    fetch: runFetch,
    normalize: runNormalize,
    review: runReview,
    import: runImport,
    report: runReport,
    disable: runDisable,
    "perf-fixture": runPerfFixture,
  };
  const runner = runners[command];
  if (!runner) {
    throw new PreparedFoodCatalogImportError("UNKNOWN_COMMAND");
  }
  const summary = await runner(args);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    success: false,
    command,
    error: {
      code: error?.code ?? "UNKNOWN_ERROR",
      details: error?.details ?? {},
    },
    production_db_writes: 0,
  })}\n`);
  process.exitCode = 1;
});
