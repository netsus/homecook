#!/usr/bin/env node

import { runFullLocalVerificationCli } from
  "./lib/full-local-verification-cli-runner.mjs";
import {
  assertPersonalRecipeEditorFullLocalEnvironment,
  assertPersonalRecipeEditorFullLocalResult,
  assertPersonalRecipeEditorMergedExactSource,
  assertPersonalRecipeEditorSourceEvidence,
  buildPersonalRecipeEditorCheckEnvironment,
  buildPersonalRecipeEditorBoundaryChecks,
  buildPersonalRecipeEditorFullLocalPsqlRequest,
  buildPersonalRecipeEditorFullLocalSummary,
  buildPersonalRecipeEditorFullLocalVerificationPlan,
  collectPersonalRecipeEditorSourceEvidence,
} from "./lib/personal-recipe-editor-full-local-verifier.mjs";
import {
  buildRecipeSnapshotAuthorityGitEnvironment,
} from "./lib/recipe-snapshot-authority-remote-verifier.mjs";

process.exitCode = runFullLocalVerificationCli({
  assertEnvironment: assertPersonalRecipeEditorFullLocalEnvironment,
  assertLocalResult: assertPersonalRecipeEditorFullLocalResult,
  assertMergedSource: assertPersonalRecipeEditorMergedExactSource,
  assertSourceEvidence: assertPersonalRecipeEditorSourceEvidence,
  buildCheckEnvironment: buildPersonalRecipeEditorCheckEnvironment,
  buildDryRunPayload: ({ mergeSha, plan }) => ({
    ok: true,
    mode: plan.mode,
    target: plan.target,
    source_of_record_status: plan.sourceOfRecord,
    restore_manifest_status: plan.restoreManifest,
    read_only: plan.readOnly,
    requires_merged_origin_master: plan.requiresMergedOriginMaster,
    requires_clean_tree: plan.requiresCleanTrackedTree,
    required_checks: plan.requiredChecks.map((check) => check.id),
    manual_only_status: "pending",
    manual_only_pending: plan.manualOnlyPending,
    merge_sha: mergeSha,
    external_personal_write_status: plan.externalPersonalWrite,
    production_writes: 0,
    staging_writes: 0,
    remote_application_writes: 0,
  }),
  buildExecutionEvidence: ({ checks, localResult, mergeSha, plan }) => ({
    source_merge_sha: mergeSha,
    checks,
    manual_only: Object.fromEntries(
      plan.manualOnlyPending.map((name) => [name, "pending"]),
    ),
    boundary_checks: buildPersonalRecipeEditorBoundaryChecks({
      checks,
      localResult,
    }),
    production_writes: 0,
    staging_writes: 0,
    remote_application_writes: 0,
  }),
  buildGitEnvironment: buildRecipeSnapshotAuthorityGitEnvironment,
  buildLocalResult: ({ databaseResult, sourceEvidence }) => ({
    full_local_authority: databaseResult,
    personal_editor_source: sourceEvidence,
  }),
  buildPlan: buildPersonalRecipeEditorFullLocalVerificationPlan,
  buildPsqlRequest: buildPersonalRecipeEditorFullLocalPsqlRequest,
  buildSummary: buildPersonalRecipeEditorFullLocalSummary,
  collectSourceEvidence: collectPersonalRecipeEditorSourceEvidence,
  databaseUrlEnvironmentKey:
    "PERSONAL_RECIPE_EDITOR_FULL_LOCAL_DATABASE_URL",
  failurePrefix: "personal recipe editor full-local verification failed: ",
});
