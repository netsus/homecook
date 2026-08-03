#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import {
  assertRecipeContentSnapshotFuturePropagationLocalRehearsalEnvironment,
  assertRecipeContentSnapshotFuturePropagationReleaseMatrix,
  assertRecipeContentSnapshotFuturePropagationTwoOwnerResult,
  buildRecipeContentSnapshotFuturePropagationLocalRehearsalPlan,
} from "./lib/recipe-content-snapshot-future-propagation-local-rehearsal-verifier.mjs";

function readOption(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME,
      LANG: process.env.LANG ?? "C.UTF-8",
      LC_ALL: process.env.LC_ALL ?? "C.UTF-8",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_SSH_COMMAND: "ssh -F /dev/null",
    },
  });
  if (result.status !== 0) {
    throw new Error("exact current head / immediate previous SHA resolution failed");
  }
  return result.stdout.trim();
}

function readReport(reportPath) {
  try {
    return JSON.parse(readFileSync(resolve(reportPath), "utf8"));
  } catch {
    throw new Error("local rehearsal requires a collector report path with valid JSON");
  }
}

function readStructuredSection(report, key) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("local rehearsal report must be a structured object");
  }
  if (!Object.hasOwn(report, key)) {
    throw new Error(`local rehearsal report is missing required ${key} data`);
  }
  return report[key];
}

try {
  const argv = process.argv.slice(2);
  const currentHeadSha = readOption(argv, "--current-head-sha");
  const immediatePreviousSha = readOption(argv, "--immediate-previous-sha");
  const reportPath = readOption(argv, "--report");
  const localSupabaseApiUrl = process.env.HOMECOOK_LOCAL_REHEARSAL_SUPABASE_URL;
  const localDatabaseUrl = process.env.HOMECOOK_LOCAL_REHEARSAL_DATABASE_URL;
  const localRehearsalOptIn =
    process.env.HOMECOOK_LOCAL_REHEARSAL_OPT_IN === "1";

  if (!reportPath) {
    throw new Error("local rehearsal requires an explicit collector report path");
  }

  const environment = assertRecipeContentSnapshotFuturePropagationLocalRehearsalEnvironment({
    local_rehearsal_opt_in: localRehearsalOptIn,
    local_supabase_api_url: localSupabaseApiUrl,
    local_database_url: localDatabaseUrl,
    current_head_sha: currentHeadSha,
    immediate_previous_sha: immediatePreviousSha,
    resolved_current_head_sha: runGit(["rev-parse", currentHeadSha]),
    resolved_immediate_previous_sha: runGit(["rev-parse", immediatePreviousSha]),
  });
  const exactCurrentHead = runGit(["rev-parse", "HEAD"]);
  if (exactCurrentHead !== environment.current_head_sha) {
    throw new Error("local rehearsal requires the explicit current HEAD SHA to match git HEAD exactly");
  }

  const plan = buildRecipeContentSnapshotFuturePropagationLocalRehearsalPlan({
    current_head_sha: environment.current_head_sha,
    immediate_previous_sha: environment.immediate_previous_sha,
  });
  const report = readReport(reportPath);
  const twoOwnerResult =
    assertRecipeContentSnapshotFuturePropagationTwoOwnerResult(
      readStructuredSection(report, "two_owner_result"),
    );
  const releaseMatrix =
    assertRecipeContentSnapshotFuturePropagationReleaseMatrix(
      readStructuredSection(report, "release_matrix"),
    );

  process.stdout.write(JSON.stringify({
    ok: true,
    mode: plan.mode,
    current_head_sha: plan.current_head_sha,
    immediate_previous_sha: plan.immediate_previous_sha,
    external_writes: 0,
    local_fixture_mutation: plan.local_fixture_mutation,
    collector_status: "report-validated",
    verified_sections: [
      "two_owner_result",
      "release_matrix",
    ],
    unchanged_digest_scope_count: twoOwnerResult.unchanged_digest_scope_count,
    legacy_v1_shape_preserved:
      releaseMatrix.current_release.legacy_v1_shape_preserved
      && releaseMatrix.immediate_previous_release.legacy_v1_shape_preserved,
  }) + "\n");
} catch (error) {
  const message = error instanceof Error
    ? error.message
    : "local rehearsal verification failed";
  process.stderr.write(
    `recipe content snapshot future propagation local rehearsal verification failed: ${message}\n`,
  );
  process.exitCode = 1;
}
