#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import {
  checkWorkpackDocs,
  resolveBaseRef,
  resolveSliceFromBranch,
} from "./lib/check-workpack-docs.mjs";

const branchName = process.env.BRANCH_NAME ?? "";
const slice = resolveSliceFromBranch(branchName);

if (!slice) {
  // Non-feature branch — pass silently
  process.exit(0);
}

const baseRef = resolveBaseRef(process.env, spawnSync);

if (!baseRef) {
  // Cannot determine base branch — pass silently; CI will enforce on PR
  process.exit(0);
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
