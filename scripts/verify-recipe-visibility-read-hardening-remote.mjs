#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import {
  assertRecipeVisibilityMergedExactSource,
  assertRecipeVisibilityRemoteVerificationResult,
  buildRecipeVisibilityPsqlRequest,
  buildRecipeVisibilityRemoteVerificationPlan,
  parseRecipeVisibilityDatabaseEnvironment,
} from "./lib/recipe-visibility-read-hardening-remote-verifier.mjs";
import { resolveSecurityFunctionLinkedRoot } from "./security-function-linked-root.mjs";

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed without exposing captured output`);
  }
  return result.stdout.trim();
}

function assertMergedExactSource(repositoryRoot) {
  run("git", ["fetch", "--quiet", "origin", "master"], {
    cwd: repositoryRoot,
  });
  const head = run("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot });
  const originMaster = run("git", ["rev-parse", "origin/master"], {
    cwd: repositoryRoot,
  });
  const trackedStatus = run(
    "git",
    ["status", "--short", "--untracked-files=no"],
    { cwd: repositoryRoot },
  );

  return assertRecipeVisibilityMergedExactSource({
    head,
    originMaster,
    trackedStatus,
  });
}

const mode = readOption("--mode");
const dryRun = process.argv.includes("--dry-run");
const json = process.argv.includes("--json");
const plan = buildRecipeVisibilityRemoteVerificationPlan({ mode });
const repositoryRoot = process.cwd();

try {
  const mergeSha = assertMergedExactSource(repositoryRoot);

  if (dryRun) {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      mode: plan.mode,
      readOnly: plan.readOnly,
      requiresMergedOriginMaster: plan.requiresMergedOriginMaster,
      requiresCleanTrackedTree: plan.requiresCleanTrackedTree,
      mergeSha,
    }, null, json ? 2 : 0)}\n`);
    process.exit(0);
  }

  const linkedRoot = resolveSecurityFunctionLinkedRoot({
    requireEnvironment: false,
  });
  const databaseEnvironment = parseRecipeVisibilityDatabaseEnvironment({
    output: run(
      "pnpm",
      ["exec", "supabase", "db", "dump", "--dry-run", "--linked"],
      { cwd: linkedRoot },
    ),
    baseEnvironment: process.env,
  });
  const request = buildRecipeVisibilityPsqlRequest({
    databaseEnvironment,
    planSql: plan.sql,
  });
  const rawResult = run(
    "psql",
    request.args,
    {
      cwd: linkedRoot,
      input: request.input,
      env: request.environment,
    },
  );
  const result = JSON.parse(rawResult);
  assertRecipeVisibilityRemoteVerificationResult(result);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: plan.mode,
    mergeSha,
    result,
  }, null, json ? 2 : 0)}\n`);
} catch (error) {
  process.stderr.write(
    `recipe visibility remote verification failed: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exit(1);
}
