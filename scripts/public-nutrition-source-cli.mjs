import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { publishArtifactBundle } from "./lib/public-nutrition-artifacts.mjs";
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

async function runFetch(args) {
  const outputDir = requireArg(args, "output-dir");
  const fetchedAt =
    typeof args["fetched-at"] === "string"
      ? args["fetched-at"]
      : new Date().toISOString();
  let raw;
  let apiKey = "";
  if (args.live) {
    apiKey = process.env.DATA_GO_KR_API_KEY ?? "";
    raw = await fetchMfdsBatch({
      apiKey,
      fetchedAt,
    });
  } else {
    raw = buildRawBatch({
      ...(await readJson(requireArg(args, "input"))),
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
  }, { secretValues: [apiKey] });
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
  });
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
  });
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
  });
  return summary;
}

function safeFailureDetails(value, secretValues = []) {
  if (Array.isArray(value)) return value.map((item) => safeFailureDetails(item, secretValues));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !/(?:serviceKey|apiKey|api_key|access_token|authorization)/i.test(key))
      .map(([key, item]) => [key, safeFailureDetails(item, secretValues)]));
  }
  if (typeof value !== "string") return value;
  if (secretValues.some((secret) => secret && value.includes(secret))) return "[redacted]";
  if (/(?:serviceKey|apiKey|api_key|access_token|authorization)/i.test(value)) return "[redacted]";
  return value;
}

async function persistFailure(commandName, args, error) {
  const requestedOutput = typeof args["output-dir"] === "string" ? args["output-dir"] : null;
  if (requestedOutput === null) return null;
  const secretValues = [process.env.DATA_GO_KR_API_KEY ?? ""].filter(Boolean);
  const code = typeof error?.code === "string" ? error.code : "UNEXPECTED_ERROR";
  const details = safeFailureDetails(error?.details ?? {}, secretValues);
  let receivedContext = details;
  if (typeof args["input-dir"] === "string") {
    for (const manifestName of ["manifest.json", "source-manifest.json"]) {
      try {
        const manifest = await readJson(path.join(args["input-dir"], manifestName));
        receivedContext = {
          ...details,
          logical_batch_id: manifest.logical_batch_id,
          source_url: safeFailureDetails(manifest.endpoint_or_file_url, secretValues),
          received_page_count: manifest.page_count,
          raw_sha256: manifest.sha256,
          adapter_schema_version: manifest.adapter_schema_version,
        };
        break;
      } catch {
        // The failure bundle remains valid even when the upstream manifest itself is unreadable.
      }
    }
  }
  const status = commandName === "fetch" || commandName === "promote" ? "failed" : "quarantined";
  const failure = {
    schema_version: "public-nutrition-failure-v1",
    status,
    lifecycle: [status],
    command: commandName,
    reason_code: code,
    reason_counts: { [code]: 1 },
    received_context: receivedContext,
    production_db_writes: 0,
  };
  const summary = {
    success: false,
    command: commandName,
    status,
    error: { code },
    reason_counts: failure.reason_counts,
    production_db_writes: 0,
  };
  const failureOutput = `${requestedOutput}.failure-${randomUUID()}`;
  await publishArtifactBundle(failureOutput, {
    "failure-manifest.json": jsonText(failure),
    "summary.json": jsonText(summary),
  }, { secretValues });
  return failureOutput;
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
  const secretValues = [process.env.DATA_GO_KR_API_KEY ?? ""].filter(Boolean);
  const details = safeFailureDetails(error?.details ?? {}, secretValues);
  let failureBundlePath = null;
  try {
    failureBundlePath = await persistFailure(command, args, error);
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
