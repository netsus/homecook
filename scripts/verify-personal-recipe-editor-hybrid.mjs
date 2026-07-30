#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

import {
  assertPersonalRecipeEditorHybridSourceEvidence,
  assertPersonalRecipeEditorMergedSource,
  buildPersonalRecipeEditorHybridLocalPsqlRequest,
  buildPersonalRecipeEditorHybridSummary,
  buildPersonalRecipeEditorHybridVerificationPlan,
  collectPersonalRecipeEditorHybridSourceEvidence,
} from "./lib/personal-recipe-editor-hybrid-verifier.mjs";

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

function runStatus(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`${command} failed without exposing captured output`);
  }
  return result.status;
}

function assertMergedExactSource(repositoryRoot) {
  run("git", ["fetch", "--quiet", "origin", "master"], {
    cwd: repositoryRoot,
  });
  const head = run("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
  });
  const originMaster = run("git", ["rev-parse", "origin/master"], {
    cwd: repositoryRoot,
  });
  return assertPersonalRecipeEditorMergedSource({
    head,
    originMaster,
    isAncestorOfOriginMaster:
      runStatus(
        "git",
        ["merge-base", "--is-ancestor", head, originMaster],
        { cwd: repositoryRoot },
      ) === 0,
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
  const plan = buildPersonalRecipeEditorHybridVerificationPlan({ mode });
  const mergeSha = assertMergedExactSource(repositoryRoot);
  const sourceEvidence =
    collectPersonalRecipeEditorHybridSourceEvidence(repositoryRoot);
  assertPersonalRecipeEditorHybridSourceEvidence(sourceEvidence);

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
      service_role_user_path_count:
        sourceEvidence.user_direct_service_role_count
        + sourceEvidence.user_service_role_violation_count,
      browser_direct_storage_path_count:
        sourceEvidence.browser_direct_storage_path_count,
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
    process.env.PERSONAL_RECIPE_EDITOR_LOCAL_DATABASE_URL ?? "";
  const request = buildPersonalRecipeEditorHybridLocalPsqlRequest({
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
  const summary = buildPersonalRecipeEditorHybridSummary({
    localResult,
    mergeSha,
    remoteAuthEvidence,
    sourceEvidence,
  });

  process.stdout.write(
    `${JSON.stringify(summary, null, pretty ? 2 : 0)}\n`,
  );
} catch (error) {
  process.stderr.write(
    `personal recipe editor hybrid verification failed: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exit(1);
}
