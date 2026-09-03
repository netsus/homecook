import { join } from "node:path";
import { writeFileSync } from "node:fs";

import {
  acquireLocalMacProductionPromotionLock,
  validateLocalMacProductionMutationAuthority,
} from "../../scripts/lib/local-mac-production-release.mjs";

export const VERIFIED_ATTESTATION = () => ({ source: "test-attestation", verified: true });

export function createCompleteProductionCheckPageInput({
  checkRuns,
  releaseSha,
  selfSuiteId = null,
}: {
  checkRuns: Array<Record<string, unknown>>,
  releaseSha: string,
  selfSuiteId?: number | null,
}) {
  const allCheckRuns = selfSuiteId === null
    ? checkRuns
    : [
        ...checkRuns,
        {
          id: 9_000_000 + selfSuiteId,
          app: { id: 15368 },
          check_suite: { id: selfSuiteId },
          name: "approve-and-tag",
          started_at: "2026-08-28T09:05:00Z",
          status: "in_progress",
        },
      ];
  const suiteIds = [...new Set(allCheckRuns.map((entry) =>
    Number((entry.check_suite as { id?: unknown } | undefined)?.id)))];
  const workflowRuns = suiteIds
    .filter((id) => id !== selfSuiteId)
    .map((checkSuiteId) => ({
      id: 5_000_000 + checkSuiteId,
      check_suite_id: checkSuiteId,
      conclusion: "success",
      event: "push",
      head_sha: releaseSha,
      repository: { full_name: "netsus/homecook" },
      run_attempt: 1,
      status: "completed",
    }));
  return {
    checkRuns: allCheckRuns,
    checkRunPages: [{ total_count: allCheckRuns.length, check_runs: allCheckRuns }],
    checkSuitePages: [{
      total_count: suiteIds.length,
      check_suites: suiteIds.map((id) => ({ id, head_sha: releaseSha })),
    }],
    excludedCheckSuiteIds: selfSuiteId === null ? [] : [selfSuiteId],
    workflowRuns,
  };
}

export function createLocalMacProductionReleaseManifest(
  manifestPath: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    schema: "homecook.local-mac-production-release.v2",
    repository: "netsus/homecook",
    source_ref: "refs/heads/master",
    signer_workflow: "netsus/homecook/.github/workflows/production-release-attestation.yml",
    signer_digest: "a".repeat(40),
    expected_release_integration_id: 15368,
    promotion_id: "promo-20260825-01",
    release_tag: "prod-20260825.1",
    release_tag_object_sha: "e".repeat(40),
    release_manifest_path: manifestPath,
    release_sha: "a".repeat(40),
    release_tree: "b".repeat(40),
    workflow_head_sha: "a".repeat(40),
    workflow_head_tree: "b".repeat(40),
    workflow_run_id: 9_001,
    workflow_run_attempt: 1,
    workflow_check_suite_id: 9_002,
    master_sha_at_approval: "a".repeat(40),
    master_tree_at_approval: "b".repeat(40),
    approved_at: "2026-08-25T09:00:00.000Z",
    approved_by_task_id: "task-019-release",
    migration_head: "20260825090000_release_gate",
    build_id: "build-20260825-01",
    rehearsal_receipt_schema: "homecook.local-mac-production-rehearsal-repeatability-receipt.v1",
    selected_sha: null,
    selected_tree: null,
    observed_master_sha: null,
    observed_master_tree: null,
    selected_at: null,
    expires_at: null,
    approver_role: null,
    approver_id: null,
    approval_digest: null,
    selection_digest: null,
    sealed_bundle_digest: "f".repeat(64),
    repeatability_receipt_digest: "1".repeat(64),
    rehearsal_receipt_valid_until: "2026-08-30T09:00:00.000Z",
    backup_readiness_evidence: "backup-20260825-01",
    previous_release_sha: "c".repeat(40),
    expected_release_contexts: [
      "build",
      "changes",
      "dependency-audit",
      "policy",
      "quality",
      "security-function-authorization",
      "security-smoke",
    ],
    required_check_summary: {
      total: 12,
      success: 10,
      intended_skip: 2,
    },
    all_check_suite_count: 2,
    all_check_suite_ids_digest: "4".repeat(64),
    all_context_check_run_instances_digest: "2".repeat(64),
    all_context_check_suite_ids: [200, 201],
    all_context_commit_statuses_digest: "3".repeat(64),
    attestation_digest: "d".repeat(64),
    app_launch_agent_enabled: true,
    full_local_launch_agent_enabled: true,
    youtube_worker_launch_agent_enabled: true,
    ...overrides,
  };
}

export function createLocalMacProductionGitEvidence({
  releaseSha = "a".repeat(40),
  releaseTree = "b".repeat(40),
  overrides = {},
}: {
  releaseSha?: string,
  releaseTree?: string,
  overrides?: Record<string, unknown>,
} = {}) {
  return {
    originMasterSha: releaseSha,
    workflowHeadTreeSha: releaseTree,
    masterAtApprovalTreeSha: releaseTree,
    releaseIsAncestorOfWorkflowHead: true,
    workflowHeadIsAncestorOfMasterAtApproval: true,
    masterAtApprovalIsAncestorOfOriginMaster: true,
    releaseTagObjectSha: "e".repeat(40),
    releaseTagCommitSha: releaseSha,
    releaseTreeSha: releaseTree,
    releaseTagMessage: [
      "Approved production release prod-20260825.1",
      "build_id build-20260825-01",
      "rehearsal_receipt_schema homecook.local-mac-production-rehearsal-repeatability-receipt.v1",
      `workflow_head_sha ${"a".repeat(40)}`,
      `workflow_head_tree ${"b".repeat(40)}`,
      `master_sha_at_approval ${"a".repeat(40)}`,
      `master_tree_at_approval ${"b".repeat(40)}`,
      "selection_digest none",
      `sealed_bundle_digest ${"f".repeat(64)}`,
      `repeatability_receipt_digest ${"1".repeat(64)}`,
      "rehearsal_receipt_valid_until 2026-08-30T09:00:00.000Z",
    ].join("\n"),
    ...overrides,
  };
}

export function createValidatedLocalMacMutationAuthority({
  command,
  homeDir,
  rootDir,
  lockToken = "44444444-4444-4444-8444-444444444444",
  manifestPath = join(homeDir, "release.json"),
  manifestOverrides = {},
}: {
  command: string,
  homeDir: string,
  rootDir: string,
  lockToken?: string,
  manifestPath?: string,
  manifestOverrides?: Record<string, unknown>,
}) {
  const manifest = createLocalMacProductionReleaseManifest(manifestPath, manifestOverrides);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  acquireLocalMacProductionPromotionLock({
    homeDir,
    manifest,
    manifestPath,
    lockToken,
    readCurrentHeadSha: () => manifest.release_sha,
    readGitEvidence: () => createLocalMacProductionGitEvidence({
      releaseSha: manifest.release_sha,
      releaseTree: manifest.release_tree,
    }),
    verifyAttestation: VERIFIED_ATTESTATION,
  });
  return {
    lockToken,
    manifest,
    manifestPath,
    mutationAuthority: validateLocalMacProductionMutationAuthority({
      command,
      homeDir,
      rootDir,
      releaseManifestPath: manifestPath,
      lockToken,
      readCurrentHeadSha: () => manifest.release_sha,
      readGitEvidence: () => createLocalMacProductionGitEvidence({
        releaseSha: manifest.release_sha,
        releaseTree: manifest.release_tree,
      }),
      verifyAttestation: VERIFIED_ATTESTATION,
    }),
  };
}
