import { join } from "node:path";
import { writeFileSync } from "node:fs";

import {
  acquireLocalMacProductionPromotionLock,
  validateLocalMacProductionMutationAuthority,
} from "../../scripts/lib/local-mac-production-release.mjs";

export const VERIFIED_ATTESTATION = () => ({ source: "test-attestation", verified: true });

export function createLocalMacProductionReleaseManifest(
  manifestPath: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    schema: "homecook.local-mac-production-release.v1",
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
    master_sha_at_approval: "a".repeat(40),
    approved_at: "2026-08-25T09:00:00.000Z",
    approved_by_task_id: "task-019-release",
    migration_head: "20260825090000_release_gate",
    build_id: "build-20260825-01",
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
    releaseTagObjectSha: "e".repeat(40),
    releaseTagCommitSha: releaseSha,
    releaseTreeSha: releaseTree,
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
