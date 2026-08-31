#!/usr/bin/env node

import { readFileSync } from "node:fs";

import {
  buildGitHubProductionReleaseAttestationArtifacts,
} from "./lib/github-production-release-attestation.mjs";
import { normalizeExpectedReleaseContexts } from "./lib/production-release-approval-policy.mjs";

function parseArgs(argv) {
  const options = {
    approvalAuthorityPath: null,
    checkRunPagesPath: null,
    checkRunsPath: null,
    checkSuitePagesPath: null,
    commitStatusesPath: null,
    excludedCheckSuiteIdsPath: null,
    expectedContexts: null,
    predicateOutputPath: null,
    releaseSha: null,
    releaseTag: null,
    releaseTagObjectSha: null,
    releaseTree: null,
    repository: null,
    rehearsalAuthorityPath: null,
    subjectOutputPath: null,
    workflowAuthorityPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") {
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${token} requires a value.`);
    }

    if (token === "--approval-authority-json") {
      options.approvalAuthorityPath = value;
    } else if (token === "--check-run-pages-json") {
      options.checkRunPagesPath = value;
    } else if (token === "--check-runs-json") {
      options.checkRunsPath = value;
    } else if (token === "--check-suite-pages-json") {
      options.checkSuitePagesPath = value;
    } else if (token === "--commit-statuses-json") {
      options.commitStatusesPath = value;
    } else if (token === "--excluded-check-suite-ids-json") {
      options.excludedCheckSuiteIdsPath = value;
    } else if (token === "--expected-contexts") {
      options.expectedContexts = value;
    } else if (token === "--predicate-output") {
      options.predicateOutputPath = value;
    } else if (token === "--release-sha") {
      options.releaseSha = value;
    } else if (token === "--release-tag") {
      options.releaseTag = value;
    } else if (token === "--release-tag-object-sha") {
      options.releaseTagObjectSha = value;
    } else if (token === "--release-tree") {
      options.releaseTree = value;
    } else if (token === "--repository") {
      options.repository = value;
    } else if (token === "--rehearsal-authority-json") {
      options.rehearsalAuthorityPath = value;
    } else if (token === "--subject-output") {
      options.subjectOutputPath = value;
    } else if (token === "--workflow-authority-json") {
      options.workflowAuthorityPath = value;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
    index += 1;
  }

  return options;
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (!options.checkRunPagesPath) {
    throw new Error("--check-run-pages-json <path> is required.");
  }
  if (!options.checkSuitePagesPath) {
    throw new Error("--check-suite-pages-json <path> is required.");
  }
  if (!options.subjectOutputPath) {
    throw new Error("--subject-output <path> is required.");
  }
  if (!options.predicateOutputPath) {
    throw new Error("--predicate-output <path> is required.");
  }
  if (!options.excludedCheckSuiteIdsPath) {
    throw new Error("--excluded-check-suite-ids-json <path> is required.");
  }

  const checkRunPages = JSON.parse(readFileSync(options.checkRunPagesPath, "utf8"));
  const checkSuitePages = JSON.parse(readFileSync(options.checkSuitePagesPath, "utf8"));
  const checkRuns = options.checkRunsPath
    ? JSON.parse(readFileSync(options.checkRunsPath, "utf8"))
    : [];
  const commitStatuses = options.commitStatusesPath
    ? JSON.parse(readFileSync(options.commitStatusesPath, "utf8"))
    : [];
  const expectedContexts = options.expectedContexts
    ? normalizeExpectedReleaseContexts(
      options.expectedContexts.split(",").map((value) => value.trim()).filter(Boolean),
      "expected_release_contexts",
    )
    : undefined;
  const excludedSuiteEvidence = JSON.parse(
    readFileSync(options.excludedCheckSuiteIdsPath, "utf8"),
  );
  if (
    !excludedSuiteEvidence
    || typeof excludedSuiteEvidence !== "object"
    || Array.isArray(excludedSuiteEvidence)
  ) {
    throw new Error("Excluded check suite evidence must be an object.");
  }
  if (!Array.isArray(excludedSuiteEvidence.check_suite_ids)) {
    throw new Error("Excluded check suite evidence check_suite_ids must be an array.");
  }
  if (!options.rehearsalAuthorityPath) {
    throw new Error("--rehearsal-authority-json <path> is required for production release v2.");
  }
  if (!options.workflowAuthorityPath) {
    throw new Error("--workflow-authority-json <path> is required for production release v2.");
  }
  if (!options.approvalAuthorityPath) {
    throw new Error("--approval-authority-json <path> is required for production release v2.");
  }
  const authority = JSON.parse(readFileSync(options.rehearsalAuthorityPath, "utf8"));
  if (authority.release_sha !== options.releaseSha || authority.release_tree !== options.releaseTree) {
    throw new Error("Rehearsal authority SHA/tree does not match the requested release.");
  }
  const rehearsalAuthority = {
    rehearsal_receipt_schema: authority.rehearsal_receipt_schema,
    selected_sha: authority.selected_sha,
    selected_tree: authority.selected_tree,
    observed_master_sha: authority.observed_master_sha,
    observed_master_tree: authority.observed_master_tree,
    selected_at: authority.selected_at,
    expires_at: authority.expires_at,
    approver_role: authority.approver_role,
    approver_id: authority.approver_id,
    approval_digest: authority.approval_digest,
    selection_digest: authority.selection_digest,
    build_id: authority.build_id,
    sealed_bundle_digest: authority.sealed_bundle_digest,
    repeatability_receipt_digest: authority.repeatability_receipt_digest,
    rehearsal_receipt_valid_until: authority.rehearsal_receipt_valid_until,
  };
  const workflowAuthority = JSON.parse(readFileSync(options.workflowAuthorityPath, "utf8"));
  const approvalAuthority = JSON.parse(readFileSync(options.approvalAuthorityPath, "utf8"));
  const artifacts = buildGitHubProductionReleaseAttestationArtifacts({
    approvalAuthority,
    checkRunPages,
    checkRuns,
    checkSuitePages,
    commitStatuses,
    excludedCheckSuiteIds: excludedSuiteEvidence.check_suite_ids,
    expectedContexts,
    predicateOutputPath: options.predicateOutputPath,
    releaseSha: options.releaseSha,
    releaseTag: options.releaseTag,
    releaseTagObjectSha: options.releaseTagObjectSha,
    releaseTree: options.releaseTree,
    repository: options.repository,
    rehearsalAuthority,
    subjectOutputPath: options.subjectOutputPath,
    workflowAuthority,
  });

  process.stdout.write(`${JSON.stringify(artifacts, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
