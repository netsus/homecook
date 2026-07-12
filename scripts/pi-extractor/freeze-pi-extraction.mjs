#!/usr/bin/env node
/* eslint-disable no-console */

import path from "node:path";
import { pathToFileURL } from "node:url";

import { freezePiExtraction } from "./lib/artifacts.mjs";
import { assertProtectedDatasetProfile, loadDatasetProfile } from "../recipe-loop/lib/dataset-profile.mjs";

const PROJECT_ROOT = process.cwd();

function parseCliArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function idsFromArgs(args) {
  return typeof args.ids === "string"
    ? args.ids.split(",").map((item) => item.trim()).filter(Boolean)
    : null;
}

export async function runFreeze(rawArgs = {}, options = {}) {
  const args = typeof rawArgs.length === "number" ? parseCliArgs(rawArgs) : rawArgs;
  const projectRoot = options.projectRoot ?? PROJECT_ROOT;
  const split = typeof args.split === "string" ? args.split : "train";
  const outTag = typeof args["out-tag"] === "string" ? args["out-tag"] : null;
  if (!outTag) throw new Error("--out-tag is required");
  const requestedIds = idsFromArgs(args);
  const datasetProfile = typeof args["dataset-manifest"] === "string"
    ? await loadDatasetProfile({
      projectRoot,
      manifestPath: args["dataset-manifest"],
      split,
      requestedIds,
    })
    : null;
  assertProtectedDatasetProfile({ split, datasetProfile, requestedIds });
  return freezePiExtraction({
    projectRoot,
    dataRoot: options.dataRoot ?? "notebooks/recipe_loop_data",
    split,
    outTag,
    ids: datasetProfile?.ids ?? requestedIds,
    datasetProfile,
  });
}

async function main() {
  const { freezePath, freeze } = await runFreeze(process.argv.slice(2));
  console.log(`[OK] freeze ${freeze.split}/${freeze.outTag}: ${freeze.completedCount}/${freeze.caseCount} 결과 고정`);
  console.log(`freeze 저장: ${path.relative(PROJECT_ROOT, freezePath)}`);
  process.exit(freeze.completedCount === freeze.caseCount && freeze.forbiddenReadCount === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
