#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { normalizeAutomationSpec } from "./lib/omo-automation-spec.mjs";

function parseArgs(argv) {
  const args = [...argv];
  let slice = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--slice") {
      slice = args[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg.startsWith("--slice=")) {
      slice = arg.slice("--slice=".length);
    }
  }

  return {
    slice: typeof slice === "string" && slice.trim().length > 0 ? slice.trim() : null,
  };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function listAutomationSpecPaths({ rootDir, slice }) {
  if (slice) {
    return [join(rootDir, "docs", "workpacks", slice, "automation-spec.json")];
  }

  const workpacksDir = join(rootDir, "docs", "workpacks");
  if (!existsSync(workpacksDir)) {
    return [];
  }

  return readdirSync(workpacksDir)
    .map((entry) => join(workpacksDir, entry, "automation-spec.json"))
    .filter((filePath) => existsSync(filePath));
}

function validateAutomationSpecs({ rootDir = process.cwd(), slice = null } = {}) {
  const paths = listAutomationSpecPaths({ rootDir, slice });

  if (slice && paths.length > 0 && !existsSync(paths[0])) {
    return [
      {
        name: `docs/workpacks/${slice}/automation-spec.json`,
        errors: [
          {
            path: "automation-spec.json",
            message: "File does not exist.",
          },
        ],
      },
    ];
  }

  return paths.map((filePath) => {
    try {
      normalizeAutomationSpec(readJson(filePath));
      return {
        name: filePath,
        errors: [],
      };
    } catch (error) {
      return {
        name: filePath,
        errors: [
          {
            path: "automation-spec.json",
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  });
}

const { slice } = parseArgs(process.argv.slice(2));
const results = validateAutomationSpecs({ slice });
const failed = results.filter((result) => result.errors.length > 0);

if (failed.length === 0) {
  process.stdout.write("automation-spec validation passed\n");
  process.exit(0);
}

for (const result of failed) {
  console.error(`automation-spec validation failed for ${result.name}`);
  for (const error of result.errors) {
    console.error(`- ${error.path}: ${error.message}`);
  }
}

process.exit(1);
