#!/usr/bin/env node
/* eslint-disable no-console */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { freshTiming, timingSummary } from "../pi-extractor/render-comparison-html.mjs";
import { assertProtectedDatasetProfile, loadDatasetProfile } from "./lib/dataset-profile.mjs";
import { assertFrozenResults } from "./lib/freeze-guard.mjs";
import { evaluatePromotionGates } from "./lib/promotion-gates.mjs";

function parseCliArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else { args[key] = next; index += 1; }
  }
  return args;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function evaluatePromotionRun(rawArgs = {}, options = {}) {
  const args = typeof rawArgs.length === "number" ? parseCliArgs(rawArgs) : rawArgs;
  const projectRoot = options.projectRoot ?? process.cwd();
  const split = typeof args.split === "string" ? args.split : "train";
  const outTag = typeof args["out-tag"] === "string" ? args["out-tag"] : null;
  const manifestPath = typeof args["dataset-manifest"] === "string" ? args["dataset-manifest"] : null;
  if (!outTag) throw new Error("--out-tag is required");
  if (!manifestPath) throw new Error("--dataset-manifest is required");

  const datasetProfile = await loadDatasetProfile({ projectRoot, manifestPath, split });
  assertProtectedDatasetProfile({ split, datasetProfile });
  const ids = datasetProfile.ids;
  await assertFrozenResults({ projectRoot, split, outTag, ids, datasetProfile });
  const splitDir = path.join(projectRoot, "notebooks/recipe_loop_data", split);
  const deterministic = (await readJson(path.join(splitDir, `_grade_summary.${outTag}.json`))).aggregate;
  const semantic = (await readJson(path.join(splitDir, `_semantic_summary.${outTag}.json`))).aggregate;
  const requestedRunType = datasetProfile.gates?.timing?.runType ?? "cold";
  const timings = [];
  const modelCallCounts = [];

  for (const id of ids) {
    const runDir = path.join(splitDir, id, "runs", outTag);
    const result = await readJson(path.join(runDir, "result.json"));
    const progress = await readJson(path.join(runDir, "run-progress.json"));
    timings.push(freshTiming(progress, result, { requestedRunType }));
    modelCallCounts.push(Number(result?.meta?.modelCallCount));
  }
  const timing = timingSummary(timings, requestedRunType);
  const evaluation = evaluatePromotionGates({
    gates: datasetProfile.gates ?? {},
    deterministic,
    semantic,
    timing,
    modelCallCounts,
    expectedCount: datasetProfile.expectedCount,
    longVideoSceneScanImprovement: args["long-video-scene-scan-improvement"] === undefined
      ? null
      : Number(args["long-video-scene-scan-improvement"]),
  });
  const aggregate = {
    ...evaluation,
    split,
    outTag,
    datasetProfileId: datasetProfile.profileId,
    count: datasetProfile.expectedCount,
    timing,
    maxModelCallCount: modelCallCounts.length ? Math.max(...modelCallCounts) : null,
  };
  const outputPath = path.join(splitDir, `_promotion_summary.${outTag}.json`);
  await writeFile(outputPath, JSON.stringify({ aggregate }, null, 2) + "\n", "utf8");
  return { aggregate, outputPath };
}

async function main() {
  const result = await evaluatePromotionRun(process.argv.slice(2));
  console.log(`promotion ${result.aggregate.split}/${result.aggregate.outTag}: ${result.aggregate.success ? "PASS" : "FAIL"}`);
  if (!result.aggregate.success) console.log(`failed gates: ${result.aggregate.failures.join(", ")}`);
  process.exit(result.aggregate.success ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
