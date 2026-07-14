import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { containsAuthLeak, publishArtifactBundle } from "./public-nutrition-artifacts.mjs";

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export function sanitizeFailureDetails(value, secretValues = []) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeFailureDetails(item, secretValues));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !containsAuthLeak(key, { secretValues }))
      .map(([key, item]) => [key, sanitizeFailureDetails(item, secretValues)]));
  }
  if (typeof value === "string" && containsAuthLeak(value, { secretValues })) {
    return "[redacted]";
  }
  return value;
}

export async function persistNutritionFailure(
  commandName,
  args,
  error,
  { secretValues = [] } = {},
) {
  const requestedOutput = typeof args["output-dir"] === "string" ? args["output-dir"] : null;
  if (requestedOutput === null) return null;
  const code = typeof error?.code === "string" ? error.code : "UNEXPECTED_ERROR";
  const details = sanitizeFailureDetails(error?.details ?? {}, secretValues);
  let receivedContext = details;
  if (typeof args["input-dir"] === "string") {
    for (const manifestName of ["manifest.json", "source-manifest.json"]) {
      try {
        const manifest = await readJson(path.join(args["input-dir"], manifestName));
        receivedContext = {
          ...details,
          logical_batch_id: manifest.logical_batch_id,
          source_url: sanitizeFailureDetails(manifest.endpoint_or_file_url, secretValues),
          received_page_count: manifest.page_count,
          raw_sha256: manifest.sha256,
          adapter_schema_version: manifest.adapter_schema_version,
        };
        break;
      } catch {
        // The failure remains useful even when the upstream manifest cannot be read.
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
