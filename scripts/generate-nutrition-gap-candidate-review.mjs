#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildNutritionGapCandidateReport,
  renderNutritionGapCandidateHtml,
} from "./lib/nutrition-gap-candidates.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_BASE = path.join(ROOT, ".artifacts/ops/nutrient-gap-20260721");
const DEFAULT_OUTPUT_DIR = path.join(ROOT, "outputs/nutrition-review-20260721");

function parseArgs(values) {
  const args = { mfds: [] };
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const value = values[index + 1];
    if (typeof value !== "string" || value.startsWith("--")) {
      throw new Error(`CLI_ARGUMENT_MISSING:${key}`);
    }
    index += 1;
    if (key === "mfds") args.mfds.push(value);
    else args[key] = value;
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function normalizedBundle(directory) {
  return readJson(path.join(path.resolve(directory), "normalized-bundle.json"));
}

function rowValues(row) {
  return Object.fromEntries(
    Object.entries(row.values ?? {}).map(([code, value]) => [code, value?.amount ?? null]),
  );
}

function rdaCandidates(bundle) {
  return bundle.rows.map((row) => ({
    provider_code: "RDA_10_4",
    provider_label: "농촌진흥청 국가표준식품성분 DB 10.4",
    provider_rank: 2,
    source_version: bundle.source.source_version,
    external_item_key: row.external_item_key,
    external_name: row.external_name,
    name_components: String(row.external_name).split(/[,_/]/),
    source_state: String(row.external_name).split(/[,_/]/).slice(1).join(" "),
    basis: row.basis,
    values: rowValues(row),
  }));
}

function integratedCandidates(bundle) {
  const rawByKey = new Map(
    (bundle.staged_rows ?? []).map((row) => [String(row.foodCd), row]),
  );
  return bundle.rows.flatMap((row) => {
    const raw = rawByKey.get(String(row.external_item_key));
    if (raw === undefined) return [];
    const originalProvider = String(raw.srcNm ?? raw.insttNm ?? "K-FIND 통합 DB");
    const isNifs = originalProvider.includes("수산과학원");
    const isRda = originalProvider.includes("농촌진흥청") || originalProvider.includes("식량과학원");
    if (isRda) return [];
    return [{
      provider_code: isNifs ? "NIFS_KFIND" : "K_FIND",
      provider_label: isNifs
        ? "국립수산과학원 · K-FIND 통합 DB"
        : `${originalProvider} · K-FIND 통합 DB`,
      provider_rank: isNifs ? 1 : 3,
      source_version: bundle.source.source_version,
      external_item_key: row.external_item_key,
      external_name: row.external_name,
      name_components: [
        raw.foodLv4Nm,
        raw.foodLv5Nm,
        raw.foodLv6Nm,
        raw.foodLv7Nm,
        ...String(row.external_name).split(/[,_/]/),
      ].filter(Boolean),
      source_state: raw.foodLv7Nm ?? null,
      basis: row.basis,
      values: rowValues(row),
    }];
  });
}

function mfdsCandidates(bundle, scopeName) {
  return bundle.rows.map((row) => ({
    provider_code: "MFDS",
    provider_label: "식품의약품안전처 식품영양성분DB정보",
    provider_rank: 1,
    source_version: bundle.source.source_version,
    external_item_key: row.external_item_key,
    external_name: row.external_name,
    name_components: String(row.external_name).split(/[,_/]/),
    match_scope_names: [scopeName],
    source_state: "제품 표시값",
    basis: row.basis,
    values: rowValues(row),
  }));
}

function parseMfdsSpec(value) {
  const separator = value.indexOf("|");
  if (separator < 1 || separator === value.length - 1) throw new Error("MFDS_SPEC_INVALID");
  return { scopeName: value.slice(0, separator), directory: value.slice(separator + 1) };
}

export function generateCandidateReview(args) {
  const inventoryPath = path.resolve(
    args.inventory ?? path.join(DEFAULT_BASE, "inventory.json"),
  );
  const rdaDirectory = path.resolve(
    args.rda ?? path.join(DEFAULT_BASE, "rda-normalized"),
  );
  const integratedDirectory = path.resolve(
    args.integrated ?? path.join(DEFAULT_BASE, "integrated-normalized"),
  );
  const outputDirectory = path.resolve(args["output-dir"] ?? DEFAULT_OUTPUT_DIR);
  const inventory = readJson(inventoryPath);
  const candidates = [
    ...rdaCandidates(normalizedBundle(rdaDirectory)),
    ...integratedCandidates(normalizedBundle(integratedDirectory)),
  ];
  for (const specValue of args.mfds ?? []) {
    const spec = parseMfdsSpec(specValue);
    candidates.push(...mfdsCandidates(normalizedBundle(spec.directory), spec.scopeName));
  }
  const report = buildNutritionGapCandidateReport({
    inventory,
    candidates,
    generatedAt: new Date().toISOString(),
  });
  const reportPath = path.join(outputDirectory, "homecook-nutrition-candidate-report.json");
  const htmlPath = path.join(outputDirectory, "homecook-nutrition-candidate-review.html");
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(htmlPath, renderNutritionGapCandidateHtml(report), "utf8");
  return { report, reportPath, htmlPath, sourceCandidateCount: candidates.length };
}

function main() {
  const result = generateCandidateReview(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({
    success: true,
    html_output: result.htmlPath,
    report_output: result.reportPath,
    target_count: result.report.target_count,
    classification_counts: result.report.classification_counts,
    unclassified_count: result.report.unclassified_count,
    source_candidate_count: result.sourceCandidateCount,
    report_checksum: result.report.report_checksum,
    production_db_writes: 0,
  })}\n`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
