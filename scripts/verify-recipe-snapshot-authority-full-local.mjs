#!/usr/bin/env node

import { runFullLocalVerificationCli } from
  "./lib/full-local-verification-cli-runner.mjs";
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

process.exitCode = runFullLocalVerificationCli({
  assertEnvironment: assertRecipeSnapshotAuthorityFullLocalEnvironment,
  assertLocalResult: assertRecipeSnapshotAuthorityFullLocalResult,
  assertMergedSource: assertRecipeSnapshotAuthorityMergedExactSource,
  buildDryRunPayload: ({ mergeSha, plan }) => ({
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
  }),
  buildExecutionEvidence: ({ checks, mergeSha, plan }) => ({
    source_merge_sha: mergeSha,
    checks,
    manual_only: Object.fromEntries(
      plan.manualOnlyPending.map((name) => [name, "pending"]),
    ),
    production_writes: 0,
    staging_writes: 0,
    remote_application_writes: 0,
  }),
  buildGitEnvironment: buildRecipeSnapshotAuthorityGitEnvironment,
  buildPlan: buildRecipeSnapshotAuthorityFullLocalVerificationPlan,
  buildPsqlRequest: buildRecipeSnapshotAuthorityFullLocalPsqlRequest,
  buildSummary: buildRecipeSnapshotAuthorityFullLocalSummary,
  databaseUrlEnvironmentKey:
    "RECIPE_SNAPSHOT_AUTHORITY_FULL_LOCAL_DATABASE_URL",
  failurePrefix: "recipe snapshot authority full-local verification failed: ",
});
