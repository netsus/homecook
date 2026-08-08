#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import {
  checkWorkpackDocs,
  ensureRemoteBaseRef,
  resolveBaseRef,
  resolveSliceFromBranch,
} from "./lib/check-workpack-docs.mjs";

function parseExplicitSlice(argv) {
  let slice = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;

    if (arg === "--slice") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--slice requires a value");
      }
      slice = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--slice=")) {
      slice = arg.slice("--slice=".length);
      if (!slice) throw new Error("--slice requires a value");
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (slice && !/^[a-z0-9][a-z0-9-]*$/.test(slice)) {
    throw new Error(`Invalid --slice value: ${slice}`);
  }

  return slice;
}

let explicitSlice;
try {
  explicitSlice = parseExplicitSlice(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}

let branchName = process.env.BRANCH_NAME ?? "";
if (!branchName) {
  const branchResult = spawnSync("git", ["branch", "--show-current"], {
    encoding: "utf8",
  });
  if (branchResult.status === 0) branchName = branchResult.stdout.trim();
}

const slice = explicitSlice ?? resolveSliceFromBranch(branchName);

if (!slice) {
  // Non-feature branch — pass silently
  process.exit(0);
}

const baseRef = resolveBaseRef(process.env, spawnSync);

if (!baseRef) {
  if (explicitSlice) {
    process.stderr.write(
      `Cannot determine the base branch for explicit slice '${explicitSlice}'.\n`,
    );
    process.exit(1);
  }

  // Preserve the established branch-derived local fallback; CI supplies a base.
  process.exit(0);
}

if (!ensureRemoteBaseRef(baseRef, spawnSync)) {
  process.stderr.write(
    `Cannot resolve origin/${baseRef}; workpack validation fails closed.\n`,
  );
  process.exit(1);
}

const missing = checkWorkpackDocs({ slice, baseRef, spawnSyncFn: spawnSync });

if (missing.length > 0) {
  process.stderr.write(
    `Workpack docs not found in origin/${baseRef} for slice '${slice}'.\n` +
      `Stage 1 docs must be merged before starting feature/be-* or feature/fe-* branches.\n` +
      `Missing:\n` +
      missing.map((p) => `  - ${p}`).join("\n") +
      "\n",
  );
  process.exit(1);
}

process.stdout.write(`Workpack docs OK for slice '${slice}' (base: ${baseRef})\n`);
