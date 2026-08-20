#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import {
  buildLaneEnvironment,
  validateEvidenceAttempt,
  validateGitBinding,
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

function gitOutput(gitArgs) {
  const result = spawnSync("git", gitArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: buildLaneEnvironment({ ambient: process.env }),
  });
  if (result.status !== 0) {
    throw new Error("final evidence validator must run inside the repository");
  }
  return result.stdout.trim();
}

const repositoryRoot = gitOutput(["rev-parse", "--show-toplevel"]);
const actualHeadSha = gitOutput(["rev-parse", "HEAD"]);
const statusOutput = gitOutput([
  "status",
  "--porcelain",
  "--untracked-files=all",
]);
validateGitBinding({
  repositoryRoot,
  attemptDir: resolve(args.attemptDir),
  expectedHeadSha: args.expectedHead,
  actualHeadSha,
  statusOutput,
});

const result = validateEvidenceAttempt({
  attemptDir: resolve(args.attemptDir),
  expectedAttemptId: args.attemptId,
  expectedHeadSha: args.expectedHead,
  expectedProfile: args.profile,
});
process.stdout.write(`${JSON.stringify(result)}\n`);
