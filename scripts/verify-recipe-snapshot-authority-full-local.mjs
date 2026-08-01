#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

import {
  assertRecipeSnapshotAuthorityFullLocalEnvironment,
  assertRecipeSnapshotAuthorityFullLocalResult,
  buildRecipeSnapshotAuthorityFullLocalPsqlRequest,
  buildRecipeSnapshotAuthorityFullLocalSummary,
  buildRecipeSnapshotAuthorityFullLocalVerificationPlan,
} from "./lib/recipe-snapshot-authority-full-local-verifier.mjs";
import {
  assertRecipeSnapshotAuthorityMergedExactSource,
  buildRecipeSnapshotAuthorityGitEnvironment,
} from "./lib/recipe-snapshot-authority-remote-verifier.mjs";

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
    throw new Error(command + " failed without exposing captured output");
  }
  return result.stdout.trim();
}

function runStatus(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(command + " failed without exposing captured output");
  }
  return result.status;
}

function assertMergedExactSource(repositoryRoot) {
  const gitEnvironment = buildRecipeSnapshotAuthorityGitEnvironment({
    baseEnvironment: process.env,
  });
  run("git", ["fetch", "--quiet", "origin", "master"], {
    cwd: repositoryRoot,
    env: gitEnvironment,
  });
  const head = run("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    env: gitEnvironment,
  });
  const originMaster = run("git", ["rev-parse", "origin/master"], {
    cwd: repositoryRoot,
    env: gitEnvironment,
  });
  const graftsPath = run("git", ["rev-parse", "--git-path", "info/grafts"], {
    cwd: repositoryRoot,
    env: gitEnvironment,
  });
  const resolvedGraftsPath = isAbsolute(graftsPath)
    ? graftsPath
    : resolve(repositoryRoot, graftsPath);
  const legacyGrafts = existsSync(resolvedGraftsPath)
    ? readFileSync(resolvedGraftsPath, "utf8").trim()
    : "";
  return assertRecipeSnapshotAuthorityMergedExactSource({
    head,
    originMaster,
    isAncestorOfOriginMaster:
      runStatus(
        "git",
        [
          "--no-replace-objects",
          "merge-base",
          "--is-ancestor",
          head,
          originMaster,
        ],
        { cwd: repositoryRoot, env: gitEnvironment },
      ) === 0,
    legacyGrafts,
    trackedStatus: run(
      "git",
      ["status", "--short", "--untracked-files=all"],
      { cwd: repositoryRoot, env: gitEnvironment },
    ),
  });
}

function runRequiredChecks(plan, repositoryRoot) {
  const checks = {};
  for (const check of plan.requiredChecks) {
    const result = spawnSync(check.command, check.args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: process.env,
    });
    if (result.status !== 0) {
      throw new Error(
        "required check " + check.id
          + " failed without exposing captured output",
      );
    }
    checks[check.id] = "passed";
  }
  return checks;
}

const mode = readOption("--mode");
const dryRun = process.argv.includes("--dry-run");
const pretty = process.argv.includes("--json");
const repositoryRoot = process.cwd();

try {
  assertRecipeSnapshotAuthorityFullLocalEnvironment(process.env);
  const plan = buildRecipeSnapshotAuthorityFullLocalVerificationPlan({ mode });
  const mergeSha = assertMergedExactSource(repositoryRoot);

  if (dryRun) {
    process.stdout.write(JSON.stringify({
      ok: true,
      mode: plan.mode,
      target: plan.target,
      read_only: plan.readOnly,
      requires_merged_origin_master: plan.requiresMergedOriginMaster,
      requires_clean_tree: plan.requiresCleanTrackedTree,
      required_checks: plan.requiredChecks.map((check) => check.id),
      manual_only_status: "pending",
      manual_only_pending: plan.manualOnlyPending,
      merge_sha: mergeSha,
      production_writes: 0,
      staging_writes: 0,
      remote_application_writes: 0,
    }, null, pretty ? 2 : 0) + "\n");
    process.exit(0);
  }

  const databaseUrl =
    process.env.RECIPE_SNAPSHOT_AUTHORITY_FULL_LOCAL_DATABASE_URL ?? "";
  const request = buildRecipeSnapshotAuthorityFullLocalPsqlRequest({
    baseEnvironment: process.env,
    databaseUrl,
    planSql: plan.sql,
  });
  const localResult = JSON.parse(run("psql", request.args, {
    cwd: repositoryRoot,
    env: request.environment,
    input: request.input,
  }));
  assertRecipeSnapshotAuthorityFullLocalResult(localResult);

  const executionEvidence = {
    source_merge_sha: mergeSha,
    checks: runRequiredChecks(plan, repositoryRoot),
    manual_only: Object.fromEntries(
      plan.manualOnlyPending.map((name) => [name, "pending"]),
    ),
    production_writes: 0,
    staging_writes: 0,
    remote_application_writes: 0,
  };
  const summary = buildRecipeSnapshotAuthorityFullLocalSummary({
    mergeSha,
    localResult,
    executionEvidence,
  });
  process.stdout.write(JSON.stringify(summary, null, pretty ? 2 : 0) + "\n");
} catch (error) {
  process.stderr.write(
    "recipe snapshot authority full-local verification failed: "
      + (error instanceof Error ? error.message : String(error))
      + "\n",
  );
  process.exit(1);
}
