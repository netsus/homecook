#!/usr/bin/env node

import { resolve } from "node:path";

import {
  validateEvidenceAttempt,
} from "./lib/cooking-meal-log-release-evidence.mjs";

function parseArgs(argv) {
  const args = {
    attemptDir: null,
    attemptId: null,
    expectedHead: null,
    profile: "full",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];
    if (value === "--") continue;
    if (value === "--attempt-dir") args.attemptDir = next;
    if (value === "--attempt-id") args.attemptId = next;
    if (value === "--expected-head") args.expectedHead = next;
    if (value === "--profile") args.profile = next;
    if (value.startsWith("--")) index += 1;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
if (!args.attemptDir || !args.attemptId || !args.expectedHead) {
  throw new Error(
    "--attempt-dir, --attempt-id, and --expected-head are required",
  );
}
if (!new Set(["proof", "full"]).has(args.profile)) {
  throw new Error("--profile must be proof or full");
}

const result = validateEvidenceAttempt({
  attemptDir: resolve(args.attemptDir),
  expectedAttemptId: args.attemptId,
  expectedHeadSha: args.expectedHead,
  expectedProfile: args.profile,
});
process.stdout.write(`${JSON.stringify(result)}\n`);
