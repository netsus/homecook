#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runLocalPsqlJson } from "./lib/ingredient-nutrition-local-db.mjs";
import {
  buildUserNutritionManualResolutions,
  collectNormalizedCandidateSourceRows,
  finalizeNutritionReview,
  renderNutritionReviewApplySql,
} from "./lib/nutrition-review-apply.mjs";
import { renderNutritionGapCandidateHtml } from "./lib/nutrition-gap-candidates.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_BASE = path.join(ROOT, ".artifacts/ops/nutrient-gap-20260721");
const OUTPUT_DIR = path.join(ROOT, "outputs/nutrition-review-20260721");
const SOURCE_REPORT_PATH = path.join(
  OUTPUT_DIR,
  "homecook-nutrition-candidate-report.source.json",
);
const SOURCE_REVIEW_PATH = path.join(
  OUTPUT_DIR,
  "homecook-nutrition-candidate-review.source.json",
);
const FINAL_REPORT_PATH = path.join(
  OUTPUT_DIR,
  "homecook-nutrition-final-review.json",
);
const FINAL_REVIEW_PATH = path.join(
  OUTPUT_DIR,
  "homecook-nutrition-final-review-decisions.json",
);
const HTML_PATH = path.join(OUTPUT_DIR, "homecook-nutrition-final-review.html");
const PATCH_PATH = path.join(OUTPUT_DIR, "homecook-nutrition-review-apply.json");
const RESULT_PATH = path.join(OUTPUT_DIR, "homecook-nutrition-review-apply-result.json");
const REVIEWED_AT = "2026-07-22T00:00:00.000+09:00";
const REVIEWED_BY = "10000000-0000-4000-8000-000000000001";

export const NUTRITION_REVIEW_OUTPUT_PATHS = Object.freeze({
  sourceReport: SOURCE_REPORT_PATH,
  sourceReview: SOURCE_REVIEW_PATH,
  finalReport: FINAL_REPORT_PATH,
  finalReview: FINAL_REVIEW_PATH,
  finalHtml: HTML_PATH,
  patch: PATCH_PATH,
  result: RESULT_PATH,
});

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function parseArgs(args) {
  const modeIndex = args.indexOf("--mode");
  const mode = modeIndex >= 0 ? args[modeIndex + 1] : "finalize";
  if (!['finalize', 'apply'].includes(mode)) throw new Error("MODE_INVALID");
  return {
    mode,
    allowWrite: args.includes("--allow-write"),
  };
}

export function assertNutritionReviewWriteApproved({ mode, allowWrite, env }) {
  if (
    mode === "apply" &&
    (!allowWrite || env?.HOMECOOK_NUTRITION_REVIEW_WRITE_APPROVED !== "1")
  ) {
    throw new Error("WRITE_APPROVAL_REQUIRED");
  }
}

export function selectNutritionReviewFinalization({
  sourcesAvailable,
  buildFinalization,
  readDurablePayload,
}) {
  return sourcesAvailable ? buildFinalization() : readDurablePayload();
}

export function sanitizeLocalDatabaseResult(databaseResult) {
  if (!databaseResult) return null;
  const sanitized = { ...databaseResult };
  delete sanitized.production_db_writes;
  delete sanitized.source_ids;
  delete sanitized.nutrition_link_ids;
  return sanitized;
}

function normalizedBundle(directoryName) {
  return readJson(path.join(SOURCE_BASE, directoryName, "normalized-bundle.json"));
}

function sourceBundleDescriptors() {
  const descriptors = [
    { kind: "rda", bundle: normalizedBundle("rda-normalized") },
    { kind: "integrated", bundle: normalizedBundle("integrated-normalized") },
  ];
  const mfdsDirectories = readdirSync(SOURCE_BASE)
    .filter((name) => /^mfds-.+-normalized$/.test(name))
    .filter((name) => existsSync(path.join(SOURCE_BASE, name, "normalized-bundle.json")))
    .sort();
  descriptors.push(...mfdsDirectories.map((name) => ({
    kind: "mfds",
    bundle: normalizedBundle(name),
  })));
  return descriptors;
}

function sourceReviewInputs() {
  const report = readJson(SOURCE_REPORT_PATH);
  const reviewExport = readJson(SOURCE_REVIEW_PATH);
  reviewExport.decisions["76c93ac3-66f8-43dc-8a2b-16922da63753"] = {
    decision: "approve_candidate",
    external_item_key: "R112-819013990-5402",
  };
  reviewExport.decisions["794227ac-134c-4c30-8c1d-b76f0e5b7dbb"] = {
    decision: "keep_current",
    external_item_key: null,
  };
  reviewExport.decisions["7d4459c1-2651-4b4c-b1f5-97d324147cd3"] = {
    decision: "keep_current",
    external_item_key: null,
  };
  return { report, reviewExport };
}

function sourceInputsAvailable() {
  return existsSync(SOURCE_BASE) &&
    existsSync(SOURCE_REPORT_PATH) &&
    existsSync(SOURCE_REVIEW_PATH);
}

export function validateNutritionReviewApplyPayload(payload) {
  if (
    payload?.schema_version !== "homecook-nutrition-review-apply-v1" ||
    typeof payload.reviewed_by !== "string" ||
    typeof payload.reviewed_at !== "string" ||
    typeof payload.decision_reason !== "string" ||
    typeof payload.source_report_checksum !== "string" ||
    !Array.isArray(payload.entries) ||
    !payload.summary ||
    typeof payload.payload_checksum !== "string" ||
    payload.payload_checksum.length !== 64 ||
    !payload.final_report ||
    !payload.final_review_export
  ) {
    throw new Error("DURABLE_REVIEW_PAYLOAD_INVALID");
  }
  const checksumInput = {
    schema_version: payload.schema_version,
    reviewed_by: payload.reviewed_by,
    reviewed_at: payload.reviewed_at,
    decision_reason: payload.decision_reason,
    source_report_checksum: payload.source_report_checksum,
    entries: payload.entries,
    summary: payload.summary,
  };
  if (sha256(checksumInput) !== payload.payload_checksum) {
    throw new Error("DURABLE_REVIEW_PAYLOAD_INVALID");
  }
  return payload;
}

function readDurablePayload() {
  if (!existsSync(PATCH_PATH)) throw new Error("DURABLE_REVIEW_PAYLOAD_MISSING");
  return validateNutritionReviewApplyPayload(readJson(PATCH_PATH));
}

export function buildNutritionReviewFinalization() {
  const { report, reviewExport } = sourceReviewInputs();
  const sourceRows = collectNormalizedCandidateSourceRows({
    bundles: sourceBundleDescriptors(),
    snapshotDate: "2026-07-22",
  });
  const manualResolutions = buildUserNutritionManualResolutions({
    rows: report.rows,
    sourceRows,
  });
  return finalizeNutritionReview({
    report,
    reviewExport,
    sourceRows,
    manualResolutions,
    reviewedBy: REVIEWED_BY,
    reviewedAt: REVIEWED_AT,
  });
}

function main() {
  const { mode, allowWrite } = parseArgs(process.argv.slice(2));
  assertNutritionReviewWriteApproved({ mode, allowWrite, env: process.env });
  const finalized = selectNutritionReviewFinalization({
    sourcesAvailable: sourceInputsAvailable(),
    buildFinalization: buildNutritionReviewFinalization,
    readDurablePayload,
  });
  writeJson(PATCH_PATH, finalized);
  writeJson(FINAL_REPORT_PATH, finalized.final_report);
  writeJson(FINAL_REVIEW_PATH, finalized.final_review_export);
  writeFileSync(
    HTML_PATH,
    renderNutritionGapCandidateHtml(finalized.final_report),
    "utf8",
  );

  const databaseResult = sanitizeLocalDatabaseResult(
    mode === "apply"
      ? runLocalPsqlJson(
        renderNutritionReviewApplySql(finalized),
        process.env,
        undefined,
        { timeoutMs: 120_000 },
      )
      : null,
  );
  const result = {
    success: true,
    mode,
    summary: finalized.summary,
    report_checksum: finalized.final_report.report_checksum,
    payload_checksum: finalized.payload_checksum,
    html_output: path.relative(ROOT, HTML_PATH),
    report_output: path.relative(ROOT, FINAL_REPORT_PATH),
    review_output: path.relative(ROOT, FINAL_REVIEW_PATH),
    patch_output: path.relative(ROOT, PATCH_PATH),
    local_database_result: databaseResult,
    production_db_writes: 0,
  };
  writeJson(RESULT_PATH, result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
