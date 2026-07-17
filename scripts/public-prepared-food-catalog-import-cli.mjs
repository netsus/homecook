#!/usr/bin/env node

import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { finished } from "node:stream/promises";

import {
  runLocalPsqlJson,
  runLocalPsqlJsonFileFunction,
} from "./lib/ingredient-nutrition-local-db.mjs";
import {
  ArtifactPublishError,
  assertArtifactSetSafe,
  containsAuthLeak,
  publishArtifactBundle,
} from "./lib/public-nutrition-artifacts.mjs";
import {
  PreparedFoodCatalogImportError,
  attachPreparedFoodApprovalCheckpoint,
  buildPreparedFoodRawBatch,
  buildPreparedFoodSnapshotInput,
  buildPreparedFoodCatalogImportBundle,
  buildPreparedFoodCatalogReview,
  createMemoryPreparedFoodCatalogImportStore,
  fetchPreparedFoodCatalogLiveBatch,
  generatePreparedFoodCatalogPerfRows,
  hydratePreparedFoodNormalizedBundle,
  normalizePreparedFoodCatalogBatch,
  parsePreparedFoodCsv,
  runPreparedFoodCatalogImport,
  serializePreparedFoodArtifactJson,
  stripPreparedFoodNormalizedBundle,
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
const NORMALIZED_ROWS_FILE = "normalized-rows.jsonl";
const QUARANTINED_ROWS_FILE = "quarantined-rows.jsonl";

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

async function readJsonLines(filePath) {
  const rows = [];
  const stream = createReadStream(filePath, { encoding: "utf8" });
  const lineReader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });
  try {
    for await (const line of lineReader) {
      if (line.trim().length === 0) continue;
      try {
        rows.push(JSON.parse(line));
      } catch {
        throw new PreparedFoodCatalogImportError("MALFORMED_INPUT_FILE");
      }
    }
  } finally {
    lineReader.close();
  }
  return rows;
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
  return serializePreparedFoodArtifactJson(value);
}

async function writeJsonLinesFile(filePath, rows, { secretValues = [] } = {}) {
  const stream = createWriteStream(filePath, { flags: "wx", encoding: "utf8" });
  try {
    for (const row of rows) {
      const line = `${JSON.stringify(row)}\n`;
      if (containsAuthLeak(line, { secretValues })) {
        throw new ArtifactPublishError("SECRET_EXPOSURE_DETECTED", { artifact: path.basename(filePath) });
      }
      if (!stream.write(line)) {
        await once(stream, "drain");
      }
    }
    stream.end();
    await finished(stream);
  } catch (error) {
    stream.destroy();
    throw error;
  }
}

async function publishPreparedFoodLargeBundle(outputDir, {
  textFiles,
  jsonLineFiles = [],
  copiedFiles = [],
  secretValues = [],
}) {
  const normalizedFiles = Object.fromEntries(
    Object.entries(textFiles).map(([name, content]) => {
      if (path.isAbsolute(name) || path.basename(name) !== name) {
        throw new ArtifactPublishError("ARTIFACT_PATH_INVALID", { artifact: name });
      }
      return [name, String(content)];
    }),
  );
  assertArtifactSetSafe(normalizedFiles, { secretValues });

  if (existsSync(outputDir)) {
    throw new ArtifactPublishError("ARTIFACT_IMMUTABLE", { artifact: path.basename(outputDir) });
  }

  const parent = path.dirname(outputDir);
  await mkdir(parent, { recursive: true });
  const tempDir = await mkdtemp(path.join(parent, `.${path.basename(outputDir)}.tmp-`));
  try {
    for (const [name, content] of Object.entries(normalizedFiles)) {
      await writeFile(path.join(tempDir, name), content, { flag: "wx" });
    }
    for (const artifact of jsonLineFiles) {
      if (path.isAbsolute(artifact.name) || path.basename(artifact.name) !== artifact.name) {
        throw new ArtifactPublishError("ARTIFACT_PATH_INVALID", { artifact: artifact.name });
      }
      await writeJsonLinesFile(path.join(tempDir, artifact.name), artifact.rows, { secretValues });
    }
    for (const artifact of copiedFiles) {
      if (path.isAbsolute(artifact.name) || path.basename(artifact.name) !== artifact.name) {
        throw new ArtifactPublishError("ARTIFACT_PATH_INVALID", { artifact: artifact.name });
      }
      await copyFile(artifact.from, path.join(tempDir, artifact.name));
    }
    await symlink(path.basename(tempDir), outputDir, "dir");
    return "created";
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

async function loadPreparedFoodNormalizedArtifacts(inputDir) {
  const normalizedBundle = await readJson(path.join(inputDir, "normalized-bundle.json"));
  if (Array.isArray(normalizedBundle.rows)) {
    return normalizedBundle;
  }
  const rows = await readJsonLines(path.join(inputDir, NORMALIZED_ROWS_FILE));
  const quarantinePath = path.join(inputDir, QUARANTINED_ROWS_FILE);
  const quarantined = existsSync(quarantinePath) ? await readJsonLines(quarantinePath) : [];
  return hydratePreparedFoodNormalizedBundle({
    normalizedBundle,
    rows,
    quarantined,
  });
}

function successSummary(currentCommand, extra = {}) {
  return {
    success: true,
    command: currentCommand,
    production_db_writes: 0,
    ...extra,
  };
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
  await publishPreparedFoodLargeBundle(outputDir, {
    textFiles: {
      "source-manifest.json": jsonText(manifest),
      "normalized-bundle.json": jsonText(stripPreparedFoodNormalizedBundle(normalized)),
      "quarantine-report.json": jsonText({
        counts: normalized.counts,
        reason_counts: normalized.quarantine_reason_counts,
        production_db_writes: 0,
      }),
      "summary.json": jsonText(summary),
    },
    jsonLineFiles: [
      { name: NORMALIZED_ROWS_FILE, rows: normalized.rows },
      { name: QUARANTINED_ROWS_FILE, rows: normalized.quarantined },
    ],
    secretValues: [process.env.DATA_GO_KR_API_KEY ?? ""],
  });
  return summary;
}

async function runReview(args) {
  const inputDir = requireArg(args, "input-dir");
  const outputDir = requireArg(args, "output-dir");
  const normalized = await loadPreparedFoodNormalizedArtifacts(inputDir);
  const review = buildPreparedFoodCatalogReview({
    normalizedBundle: normalized,
    decisions: (await readJson(requireArg(args, "decisions"))).decisions,
  });
  const sourceManifest = await readJson(path.join(inputDir, "source-manifest.json")).catch(() =>
    readJson(path.join(inputDir, "manifest.json")),
  );
  const checkpointManifest = attachPreparedFoodApprovalCheckpoint({
    manifest: sourceManifest,
    normalizedBundle: normalized,
    reviewReport: review,
    scope: requireArg(args, "scope"),
    approvedAt: requireArg(args, "approved-at"),
  });
  const summary = successSummary("review", {
    status: "reviewed",
    logical_batch_id: review.logical_batch_id,
    blocker_count: review.blocker_count,
    review_checksum: review.review_checksum,
    scope: checkpointManifest.query.scope,
    approved_row_count: checkpointManifest.query.approval_checkpoint.approved_row_count,
  });
  await publishPreparedFoodLargeBundle(outputDir, {
    textFiles: {
      "source-manifest.json": jsonText(checkpointManifest),
      "normalized-bundle.json": jsonText(stripPreparedFoodNormalizedBundle(normalized)),
      "review-report.json": jsonText(review),
      "summary.json": jsonText(summary),
    },
    copiedFiles: [
      { name: NORMALIZED_ROWS_FILE, from: path.join(inputDir, NORMALIZED_ROWS_FILE) },
      { name: QUARANTINED_ROWS_FILE, from: path.join(inputDir, QUARANTINED_ROWS_FILE) },
    ].filter((artifact) => existsSync(artifact.from)),
    secretValues: [process.env.DATA_GO_KR_API_KEY ?? ""],
  });
  return summary;
}

async function runImport(args) {
  const inputDir = requireArg(args, "input-dir");
  const manifest = await readJson(path.join(inputDir, "source-manifest.json")).catch(() =>
    readJson(path.join(inputDir, "manifest.json")),
  );
  const normalizedBundle = await loadPreparedFoodNormalizedArtifacts(inputDir);
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
  const requestDir = await mkdtemp(path.join(tmpdir(), "homecook-prepared-food-import-"));
  const requestPath = path.join(requestDir, "request.json");
  const bundledRowsPath = path.resolve(inputDir, NORMALIZED_ROWS_FILE);
  const rowsFilePath = existsSync(bundledRowsPath)
    ? bundledRowsPath
    : path.join(requestDir, "approved-items.jsonl");
  try {
    if (!existsSync(bundledRowsPath)) {
      await writeJsonLinesFile(rowsFilePath, bundle.approved_items);
    }
    const transportBundle = { ...bundle };
    delete transportBundle.approved_items;
    await writeFile(requestPath, serializePreparedFoodArtifactJson({
        actor_user_id,
        run_id,
        idempotency_key,
        bundle: transportBundle,
    }), { flag: "wx" });
    return await runLocalPsqlJsonFileFunction(
      "apply_public_prepared_food_catalog_import",
      requestPath,
      process.env,
      undefined,
      { timeoutMs: 60 * 60_000, rowsFilePath },
    );
  } finally {
    await rm(requestDir, { recursive: true, force: true });
  }
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
  await publishPreparedFoodLargeBundle(outputDir, {
    textFiles: {
      "manifest.json": jsonText(raw.manifest),
      "normalized-bundle.json": jsonText(stripPreparedFoodNormalizedBundle(normalized)),
      "review-report.json": jsonText(review),
      "approved-import-bundle.json": jsonText(bundle),
      "summary.json": jsonText(summary),
    },
    jsonLineFiles: [
      { name: NORMALIZED_ROWS_FILE, rows: normalized.rows },
      { name: QUARANTINED_ROWS_FILE, rows: normalized.quarantined },
    ],
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
