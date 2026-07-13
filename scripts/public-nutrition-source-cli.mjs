import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  NutritionPipelineError,
  buildApprovedPinnedHandoff,
  buildNutritionReview,
  buildRawBatch,
  fetchMfdsBatch,
  normalizeNutritionBatch,
} from "./lib/public-nutrition-pipeline.mjs";

const command = process.argv[2] ?? "";

function parseArgs(values) {
  const args = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith("--")) continue;
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
    throw new NutritionPipelineError("CLI_ARGUMENT_MISSING", { argument: key });
  }
  return value;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) throw new NutritionPipelineError("MALFORMED_INPUT_FILE");
    throw error;
  }
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function writeImmutableText(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  if (existsSync(filePath)) {
    const existing = await readFile(filePath, "utf8");
    if (existing !== content) {
      throw new NutritionPipelineError("ARTIFACT_IMMUTABLE", { artifact: path.basename(filePath) });
    }
    return "reused";
  }
  await writeFile(filePath, content, { flag: "wx" });
  return "created";
}

async function writeImmutableJson(filePath, value) {
  return writeImmutableText(filePath, jsonText(value));
}

async function writeJsonLines(filePath, rows) {
  const content = rows.length > 0 ? `${rows.map((row) => JSON.stringify(row)).join("\n")}\n` : "";
  return writeImmutableText(filePath, content);
}

function successSummary(currentCommand, extra = {}) {
  return {
    success: true,
    command: currentCommand,
    production_db_writes: 0,
    ...extra,
  };
}

async function runFetch(args) {
  const outputDir = requireArg(args, "output-dir");
  const fetchedAt =
    typeof args["fetched-at"] === "string"
      ? args["fetched-at"]
      : new Date().toISOString();
  let raw;
  if (args.live) {
    raw = await fetchMfdsBatch({
      apiKey: process.env.DATA_GO_KR_API_KEY ?? "",
      fetchedAt,
    });
  } else {
    raw = buildRawBatch({
      ...(await readJson(requireArg(args, "input"))),
      fetchedAt,
    });
  }
  await writeImmutableJson(path.join(outputDir, "raw-snapshot.json"), raw.rawSnapshot);
  await writeImmutableJson(path.join(outputDir, "manifest.json"), raw.manifest);
  const summary = successSummary("fetch", {
    status: "raw",
    logical_batch_id: raw.manifest.logical_batch_id,
    fetched_raw_count: raw.manifest.fetched_raw_count,
    raw_sha256: raw.manifest.sha256,
  });
  await writeImmutableJson(path.join(outputDir, "summary.json"), summary);
  return summary;
}

async function runNormalize(args) {
  const inputDir = requireArg(args, "input-dir");
  const outputDir = requireArg(args, "output-dir");
  const manifest = await readJson(path.join(inputDir, "manifest.json"));
  const rawSnapshot = await readJson(path.join(inputDir, "raw-snapshot.json"));
  const normalized = normalizeNutritionBatch({
    rawSnapshot,
    manifest,
    adapterSchemaVersion: manifest.adapter_schema_version,
  });
  const normalizedManifest = {
    ...manifest,
    status: "normalized",
    lifecycle: normalized.lifecycle,
    ...normalized.counts,
    staged_content_hash: normalized.staged_content_hash,
    normalized_content_hash: normalized.normalized_content_hash,
    failed_reason_counts: normalized.quarantine_reason_counts,
    production_db_writes: 0,
  };
  await writeImmutableJson(path.join(outputDir, "source-manifest.json"), manifest);
  await writeImmutableJson(path.join(outputDir, "normalized-manifest.json"), normalizedManifest);
  await writeJsonLines(path.join(outputDir, "staged-rows.jsonl"), normalized.staged_rows);
  await writeJsonLines(path.join(outputDir, "normalized-rows.jsonl"), normalized.rows);
  await writeImmutableJson(path.join(outputDir, "normalized-bundle.json"), normalized);
  await writeImmutableJson(path.join(outputDir, "quarantine-report.json"), {
    counts: normalized.counts,
    reason_counts: normalized.quarantine_reason_counts,
    rows: normalized.quarantined,
    production_db_writes: 0,
  });
  const summary = successSummary("normalize", {
    status: "normalized",
    logical_batch_id: normalized.logical_batch_id,
    counts: normalized.counts,
    normalized_content_hash: normalized.normalized_content_hash,
  });
  await writeImmutableJson(path.join(outputDir, "summary.json"), summary);
  return summary;
}

async function runReview(args) {
  const inputDir = requireArg(args, "input-dir");
  const outputDir = requireArg(args, "output-dir");
  const decisionsInput = await readJson(requireArg(args, "decisions"));
  const evidence =
    typeof args["measurement-evidence"] === "string"
      ? await readJson(args["measurement-evidence"])
      : [];
  const manifest = await readJson(path.join(inputDir, "source-manifest.json"));
  const normalized = await readJson(path.join(inputDir, "normalized-bundle.json"));
  const review = buildNutritionReview({
    normalizedBundle: normalized,
    decisions: decisionsInput.decisions,
    measurementEvidence: evidence,
  });
  const reviewedManifest = {
    ...manifest,
    status: "reviewed",
    lifecycle: review.lifecycle,
    ...normalized.counts,
    normalized_content_hash: normalized.normalized_content_hash,
    review_checksum: review.review_checksum,
    failed_reason_counts: normalized.quarantine_reason_counts,
    production_db_writes: 0,
  };
  await writeImmutableJson(path.join(outputDir, "source-manifest.json"), manifest);
  await writeImmutableJson(path.join(outputDir, "normalized-bundle.json"), normalized);
  await writeImmutableJson(path.join(outputDir, "review-report.json"), review);
  await writeImmutableJson(path.join(outputDir, "reviewed-manifest.json"), reviewedManifest);
  await writeImmutableJson(path.join(outputDir, "measurement-evidence.json"), evidence);
  const summary = successSummary("review", {
    status: "reviewed",
    logical_batch_id: review.logical_batch_id,
    blocker_count: review.blocker_count,
    review_checksum: review.review_checksum,
  });
  await writeImmutableJson(path.join(outputDir, "summary.json"), summary);
  return summary;
}

async function runPromote(args) {
  const inputDir = requireArg(args, "input-dir");
  const outputDir = requireArg(args, "output-dir");
  const manifest = await readJson(path.join(inputDir, "source-manifest.json"));
  const normalized = await readJson(path.join(inputDir, "normalized-bundle.json"));
  const review = await readJson(path.join(inputDir, "review-report.json"));
  const evidence = await readJson(path.join(inputDir, "measurement-evidence.json"));
  const handoff = buildApprovedPinnedHandoff({
    manifest,
    normalizedBundle: normalized,
    reviewReport: review,
    measurementEvidence: evidence,
  });
  await writeImmutableJson(path.join(outputDir, "approved-promotion-input.json"), handoff);
  await writeImmutableJson(
    path.join(outputDir, "public-source-attribution.json"),
    handoff.public_attribution,
  );
  await writeImmutableJson(path.join(outputDir, "handoff-manifest.json"), handoff);
  const summary = successSummary("promote", {
    status: "approved_pinned",
    logical_batch_id: handoff.logical_batch_id,
    approved_count: handoff.approved_items.length,
    handoff_checksum: handoff.handoff_checksum,
  });
  await writeImmutableJson(path.join(outputDir, "summary.json"), summary);
  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(3));
  const runners = {
    fetch: runFetch,
    normalize: runNormalize,
    review: runReview,
    promote: runPromote,
  };
  const runner = runners[command];
  if (!runner) throw new NutritionPipelineError("UNKNOWN_COMMAND");
  const summary = await runner(args);
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main().catch((error) => {
  const code = error instanceof NutritionPipelineError ? error.code : "UNEXPECTED_ERROR";
  const details = error instanceof NutritionPipelineError ? error.details : {};
  process.stderr.write(`${JSON.stringify({
    success: false,
    command,
    error: { code, details },
    production_db_writes: 0,
  })}\n`);
  process.exitCode = 1;
});
