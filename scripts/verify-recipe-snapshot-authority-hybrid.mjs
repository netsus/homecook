#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import {
  buildRecipeSnapshotAuthorityHybridLocalPsqlRequest,
  buildRecipeSnapshotAuthorityHybridSummary,
  buildRecipeSnapshotAuthorityHybridVerificationPlan,
} from "./lib/recipe-snapshot-authority-hybrid-verifier.mjs";
import {
  assertRecipeSnapshotAuthorityMergedExactSource,
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
    throw new Error(`${command} failed without exposing captured output`);
  }
  return result.stdout.trim();
}

function assertMergedExactSource(repositoryRoot) {
  run("git", ["fetch", "--quiet", "origin", "master"], {
    cwd: repositoryRoot,
  });
  return assertRecipeSnapshotAuthorityMergedExactSource({
    head: run("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot }),
    originMaster: run("git", ["rev-parse", "origin/master"], {
      cwd: repositoryRoot,
    }),
    trackedStatus: run(
      "git",
      ["status", "--short", "--untracked-files=no"],
      { cwd: repositoryRoot },
    ),
  });
}

const mode = readOption("--mode");
const evidencePath = readOption("--remote-auth-evidence");
const dryRun = process.argv.includes("--dry-run");
const pretty = process.argv.includes("--json");
const repositoryRoot = process.cwd();

try {
  const plan = buildRecipeSnapshotAuthorityHybridVerificationPlan({ mode });
  const mergeSha = assertMergedExactSource(repositoryRoot);

  if (dryRun) {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      mode: plan.mode,
      target: plan.target,
      read_only: plan.readOnly,
      requires_merged_origin_master: plan.requiresMergedOriginMaster,
      requires_clean_tracked_tree: plan.requiresCleanTrackedTree,
      remote_auth_evidence_required: plan.remoteAuthEvidenceRequired,
      merge_sha: mergeSha,
      production_writes: 0,
      staging_writes: 0,
      remote_application_writes: 0,
    }, null, pretty ? 2 : 0)}\n`);
    process.exit(0);
  }

  if (!evidencePath) {
    throw new Error("--remote-auth-evidence is required");
  }
  const databaseUrl =
    process.env.RECIPE_SNAPSHOT_AUTHORITY_LOCAL_DATABASE_URL ?? "";
  const request = buildRecipeSnapshotAuthorityHybridLocalPsqlRequest({
    baseEnvironment: process.env,
    databaseUrl,
    planSql: plan.sql,
  });
  const localResult = JSON.parse(run("psql", request.args, {
    cwd: repositoryRoot,
    env: request.environment,
    input: request.input,
  }));
  const remoteAuthEvidence = JSON.parse(
    readFileSync(evidencePath, "utf8"),
  );
  const summary = buildRecipeSnapshotAuthorityHybridSummary({
    mergeSha,
    localResult,
    remoteAuthEvidence,
  });

  process.stdout.write(
    `${JSON.stringify(summary, null, pretty ? 2 : 0)}\n`,
  );
} catch (error) {
  process.stderr.write(
    `recipe snapshot authority hybrid verification failed: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exit(1);
}
