import { readFile } from "node:fs/promises";
import path from "node:path";

import { publishArtifactBundle } from "./lib/public-nutrition-artifacts.mjs";
import { mfdsLiveOptions } from "./lib/public-nutrition-cli-options.mjs";
import {
  persistNutritionFailure,
  sanitizeFailureDetails,
} from "./lib/public-nutrition-failure.mjs";
import {
  NutritionPipelineError,
  buildApprovedPinnedHandoff,
  buildNutritionReview,
  buildRawBatch,
  fetchMfdsBatch,
  normalizeNutritionBatch,
} from "./lib/public-nutrition-pipeline.mjs";
import { loadRda104Workbook } from "./lib/rda-nutrition-xlsx.mjs";

const command = process.argv[2] ?? "";

function parseArgs(values) {
  const args = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (token === "--") continue;
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

function runtimeSecretValues() {
  return [process.env.DATA_GO_KR_API_KEY ?? ""].filter(Boolean);
}

async function runFetch(args) {
  const outputDir = requireArg(args, "output-dir");
  const fetchedAt =
    typeof args["fetched-at"] === "string"
      ? args["fetched-at"]
      : new Date().toISOString();
  let raw;
  const secretValues = runtimeSecretValues();
  const apiKey = secretValues[0] ?? "";
  if (args.live) {
    const options = apiKey.length > 0
      ? mfdsLiveOptions(args)
      : {};
    raw = await fetchMfdsBatch({
      apiKey,
      fetchedAt,
      ...options,
    });
  } else {
    const inputPath = requireArg(args, "input");
    if (/\.xlsx$/i.test(inputPath)) {
      const scope = typeof args["scope-file"] === "string"
        ? await readJson(args["scope-file"])
        : null;
      if (
        scope !== null &&
        (!Array.isArray(scope.item_keys) || Object.keys(scope).some((key) => key !== "item_keys"))
      ) {
        throw new NutritionPipelineError("RDA_SCOPE_INVALID");
      }
      raw = loadRda104Workbook(inputPath, {
        fetchedAt,
        selectedItemKeys: scope?.item_keys ?? null,
      });
    } else {
      raw = buildRawBatch({
        ...(await readJson(inputPath)),
        fetchedAt,
      });
    }
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
  }, { secretValues });
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
  const quarantineReport = {
    counts: normalized.counts,
    reason_counts: normalized.quarantine_reason_counts,
    rows: normalized.quarantined,
    production_db_writes: 0,
  };
  const summary = successSummary("normalize", {
    status: "normalized",
    logical_batch_id: normalized.logical_batch_id,
    counts: normalized.counts,
    normalized_content_hash: normalized.normalized_content_hash,
  });
  await publishArtifactBundle(outputDir, {
    "source-manifest.json": jsonText(manifest),
    "normalized-manifest.json": jsonText(normalizedManifest),
    "staged-rows.jsonl": jsonLines(normalized.staged_rows),
    "normalized-rows.jsonl": jsonLines(normalized.rows),
    "normalized-bundle.json": jsonText(normalized),
    "quarantine-report.json": jsonText(quarantineReport),
    "summary.json": jsonText(summary),
  }, { secretValues: runtimeSecretValues() });
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
  const summary = successSummary("review", {
    status: "reviewed",
    logical_batch_id: review.logical_batch_id,
    blocker_count: review.blocker_count,
    review_checksum: review.review_checksum,
  });
  await publishArtifactBundle(outputDir, {
    "source-manifest.json": jsonText(manifest),
    "normalized-bundle.json": jsonText(normalized),
    "review-report.json": jsonText(review),
    "reviewed-manifest.json": jsonText(reviewedManifest),
    "measurement-evidence.json": jsonText(review.measurement_evidence),
    "summary.json": jsonText(summary),
  }, { secretValues: runtimeSecretValues() });
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
  const summary = successSummary("promote", {
    status: "approved_pinned",
    logical_batch_id: handoff.logical_batch_id,
    approved_count: handoff.approved_items.length,
    handoff_checksum: handoff.handoff_checksum,
  });
  await publishArtifactBundle(outputDir, {
    "approved-promotion-input.json": jsonText(handoff),
    "public-source-attribution.json": jsonText(handoff.public_attribution),
    "handoff-manifest.json": jsonText(handoff),
    "summary.json": jsonText(summary),
  }, { secretValues: runtimeSecretValues() });
  return summary;
}

const args = parseArgs(process.argv.slice(3));

async function main() {
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

main().catch(async (error) => {
  const code = typeof error?.code === "string" ? error.code : "UNEXPECTED_ERROR";
  const secretValues = runtimeSecretValues();
  const details = sanitizeFailureDetails(error?.details ?? {}, secretValues);
  let failureBundlePath = null;
  try {
    failureBundlePath = await persistNutritionFailure(command, args, error, { secretValues });
  } catch {
    failureBundlePath = null;
  }
  process.stderr.write(`${JSON.stringify({
    success: false,
    command,
    error: { code, details },
    failure_bundle_path: failureBundlePath,
    production_db_writes: 0,
  })}\n`);
  process.exitCode = 1;
});
