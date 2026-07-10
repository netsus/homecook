#!/usr/bin/env node
/* eslint-disable no-console */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { loadDatasetProfile } from "./lib/dataset-profile.mjs";

function parseCliArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

export async function validateDatasetProfile({
  projectRoot = process.cwd(),
  manifestPath,
  dataRoot = "notebooks/recipe_loop_data",
} = {}) {
  if (!manifestPath) throw new Error("--dataset-manifest is required");
  const manifestResolvedPath = path.isAbsolute(manifestPath)
    ? manifestPath
    : path.resolve(projectRoot, manifestPath);
  const manifest = JSON.parse(await readFile(manifestResolvedPath, "utf8"));
  const splitNames = Object.keys(manifest?.splits ?? {});
  if (splitNames.length === 0) throw new Error("dataset profile has no splits");

  const seenIds = new Set();
  const summaries = [];
  for (const split of splitNames) {
    const profile = await loadDatasetProfile({ projectRoot, manifestPath: manifestResolvedPath, split });
    let approvedCount = 0;
    for (const id of profile.ids) {
      if (seenIds.has(id)) throw new Error(`dataset profile id appears in multiple splits: ${id}`);
      seenIds.add(id);
      const caseDir = path.join(projectRoot, dataRoot, split, id);
      const sourcePath = path.join(caseDir, "source.json");
      const goldenPath = path.join(caseDir, "golden.json");
      if (!existsSync(sourcePath) || !existsSync(goldenPath)) {
        throw new Error(`dataset profile missing source or golden: ${split}/${id}`);
      }
      const golden = JSON.parse(await readFile(goldenPath, "utf8"));
      if (golden.reviewStatus !== "approved") {
        throw new Error(`dataset profile golden is not approved: ${split}/${id}`);
      }
      if (!Array.isArray(golden.recipes) || golden.recipes.length !== manifest.expectedRecipeCountPerVideo) {
        throw new Error(`dataset profile recipe count mismatch: ${split}/${id}`);
      }
      approvedCount += 1;
    }
    summaries.push({ split, expectedCount: profile.profileExpectedCount, approvedCount });
  }

  return {
    success: true,
    profileId: manifest.profileId,
    expectedRecipeCountPerVideo: manifest.expectedRecipeCountPerVideo,
    totalCount: summaries.reduce((sum, entry) => sum + entry.approvedCount, 0),
    splits: summaries,
  };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const summary = await validateDatasetProfile({ manifestPath: args["dataset-manifest"] });
  console.log(`[OK] ${summary.profileId}: ${summary.totalCount}개 단일 레시피 case 인증`);
  for (const split of summary.splits) {
    console.log(`${split.split}: ${split.approvedCount}/${split.expectedCount}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
