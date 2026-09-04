import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  CAMPAIGN_RELEASE_EXPIRES_AT,
  CAMPAIGN_RELEASE_REQUIRED_CONTEXTS,
  buildCampaignManifestFromAuthorities,
  runCampaignPromotionTransaction,
  sealCampaignAuthorityArtifact,
  rehearseCampaignBundle,
  validateCampaignPostdeployEvidence,
  verifyCampaignPromotionAuthority,
  verifyCampaignActiveTransaction,
} from "../scripts/lib/marketing-campaign-fast-release.mjs";
import { runMarketingCampaignFastReleaseCli } from "../scripts/marketing-campaign-fast-release.mjs";
import { createDefaultCampaignReleaseOperations } from "../scripts/lib/marketing-campaign-fast-release-operations.mjs";
import { verifyCampaignGitHubAttestation } from "../scripts/lib/marketing-campaign-github-attestation.mjs";

const RELEASE_SHA = "1".repeat(40);
const RELEASE_TREE = "2".repeat(40);
const PREVIOUS_SHA = "3".repeat(40);
const BUNDLE_BYTES = Buffer.from("sealed campaign bundle bytes");
const BUNDLE_DIGEST = createHash("sha256").update(BUNDLE_BYTES).digest("hex");
const PREVIOUS_BUNDLE_DIGEST = "4".repeat(64);
const ATTESTATION_BYTES = Buffer.from("github attestation bundle bytes");
const BACKUP_BYTES = Buffer.from("encrypted backup archive bytes");

function checks() {
  return CAMPAIGN_RELEASE_REQUIRED_CONTEXTS.map((name, index) => ({
    id: index + 1,
    name,
    head_sha: RELEASE_SHA,
    status: "completed",
    conclusion: "success",
    completed_at: `2026-09-04T00:00:0${index}.000Z`,
    app: { id: 15368 },
    repository: { full_name: "netsus/homecook" },
  }));
}

function componentIdentities(releaseSha = RELEASE_SHA, digest = BUNDLE_DIGEST) {
  return ["app", "full-local", "youtube-worker"].map((component) => ({
    component,
    release_sha: releaseSha,
    build_id: releaseSha === RELEASE_SHA ? "build-1" : "previous-build",
    release_bundle_sha256: digest,
  }));
}

function producer() {
  return {
    repository: "netsus/homecook",
    workflow_path: ".github/workflows/marketing-campaign-release-authority.yml",
    workflow_run_id: 777,
    workflow_run_attempt: 1,
    workflow_head_sha: RELEASE_SHA,
  };
}

function authorities({
  snapshotAt = "2026-09-04T00:05:00.000Z",
  backupAt = "2026-09-04T00:06:00.000Z",
  approvedAt = "2026-09-04T00:07:00.000Z",
} = {}) {
  const bundle = sealCampaignAuthorityArtifact({
    schema: "homecook.marketing-campaign-bundle-authority.v1",
    release_sha: RELEASE_SHA,
    release_tree: RELEASE_TREE,
    build_id: "build-1",
    release_bundle_sha256: BUNDLE_DIGEST,
    components: componentIdentities(),
    producer: producer(),
  }, "authority_sha256");
  const rehearsal = sealCampaignAuthorityArtifact({
    schema: "homecook.marketing-campaign-rehearsal-receipt.v1",
    release_sha: RELEASE_SHA,
    build_id: "build-1",
    release_bundle_sha256: BUNDLE_DIGEST,
    run_count: 1,
    candidate_health: "pass",
    previous_bundle_rollback: "pass",
    production_guard: "unchanged",
    cleanup: "complete",
    isolation: {
      private_root: true,
      unique_docker_project: true,
      unique_volumes: true,
      fresh_database: true,
    },
    producer: producer(),
  }, "receipt_sha256");
  const snapshot = sealCampaignAuthorityArtifact({
    schema: "homecook.marketing-campaign-production-snapshot.v1",
    captured_at: snapshotAt,
    complete: true,
    promotion_safe: true,
    previous_release_sha: PREVIOUS_SHA,
    inventory_sha256: "7".repeat(64),
    producer: producer(),
  }, "snapshot_sha256");
  const backup = sealCampaignAuthorityArtifact({
    schema: "homecook.marketing-campaign-backup-receipt.v1",
    created_at: backupAt,
    source_snapshot_sha256: snapshot.snapshot_sha256,
    archive_sha256: createHash("sha256").update(BACKUP_BYTES).digest("hex"),
    encrypted: true,
    verified: true,
    producer: producer(),
  }, "receipt_sha256");
  const approval = sealCampaignAuthorityArtifact({
    schema: "homecook.marketing-campaign-approval-authority.v1",
    environment: "production-release-approval",
    approved_at: approvedAt,
    reviewer_id: 57648890,
    prevent_self_review: true,
    workflow_run_id: 1234,
    workflow_run_attempt: 1,
    workflow_head_sha: RELEASE_SHA,
  }, "authority_sha256");
  return { bundle, rehearsal, snapshot, backup, approval };
}

function manifestAndInputs(authorityTimes: Record<string, string> = {}) {
  const source = authorities(authorityTimes);
  const manifest = buildCampaignManifestFromAuthorities({
    releaseTag: "prod-20260904.1",
    ciCheckRuns: checks(),
    bundleBytes: BUNDLE_BYTES,
    backupArchiveBytes: BACKUP_BYTES,
    ...source,
    previousBundle: {
      release_sha: PREVIOUS_SHA,
      build_id: "previous-build",
      release_bundle_sha256: PREVIOUS_BUNDLE_DIGEST,
    },
    now: new Date(authorityTimes.buildAt ?? "2026-09-04T00:08:00.000Z"),
  });
  const attestation = sealCampaignAuthorityArtifact({
    schema: "homecook.marketing-campaign-attestation-authority.v1",
    repository: "netsus/homecook",
    release_sha: RELEASE_SHA,
    release_tag: manifest.release_tag,
    manifest_sha256: manifest.manifest_sha256,
    subject_sha256: manifest.manifest_sha256,
    predicate_sha256: "6".repeat(64),
    release_bundle_sha256: BUNDLE_DIGEST,
    github_attestation_bundle_sha256: createHash("sha256").update(ATTESTATION_BYTES).digest("hex"),
    verified: true,
  }, "attestation_sha256");
  const attestationVerifier = () => ({
    verified: true,
    repository: "netsus/homecook",
    signer_workflow: "netsus/homecook/.github/workflows/marketing-campaign-fast-release.yml",
    source_ref: "refs/heads/master",
    source_digest: RELEASE_SHA,
    subject_sha256: attestation.subject_sha256,
    predicate: {
      manifest_sha256: manifest.manifest_sha256,
      release_bundle_sha256: BUNDLE_DIGEST,
    },
  });
  return {
    manifest, attestation, attestationBundleBytes: ATTESTATION_BYTES,
    attestationVerifier,
    ciCheckRuns: checks(), bundleBytes: BUNDLE_BYTES, backupArchiveBytes: BACKUP_BYTES, ...source,
  };
}

function liveAuthority(input: ReturnType<typeof manifestAndInputs>) {
  return {
    origin_master_sha: RELEASE_SHA,
    required_ci_evidence_sha256: input.manifest.required_ci_evidence_sha256,
    production_snapshot_sha256: input.manifest.production_snapshot_sha256,
    attestation_verified: true,
  };
}

describe("campaign release trusted authority chain", () => {
  it("verifies exact GitHub attestation subject and predicate output", () => {
    const root = mkdtempSync(join(tmpdir(), "campaign-attestation-test-"));
    try {
      const manifestPath = join(root, "manifest.json");
      const predicatePath = join(root, "predicate.json");
      const bundlePath = join(root, "attestation.jsonl");
      const manifestBytes = Buffer.from('{"release":"candidate"}\n');
      const predicate = { manifest_sha256: "a".repeat(64), release_bundle_sha256: BUNDLE_DIGEST };
      writeFileSync(manifestPath, manifestBytes);
      writeFileSync(predicatePath, JSON.stringify(predicate));
      writeFileSync(bundlePath, "signed-bundle");
      const stdout = JSON.stringify([{
        verificationResult: {
          statement: {
            subject: [{ digest: { sha256: createHash("sha256").update(manifestBytes).digest("hex") } }],
            predicateType: "https://github.com/netsus/homecook/attestations/marketing-campaign-release/v1",
            predicate,
          },
        },
      }]);
      const verified = verifyCampaignGitHubAttestation({
        manifestPath,
        predicatePath,
        attestationBundlePath: bundlePath,
        releaseSha: RELEASE_SHA,
        ghPath: "/usr/bin/true",
        runCommand: vi.fn(() => ({ status: 0, stdout, stderr: "", signal: null })),
      });
      expect(verified).toMatchObject({ verified: true, predicate });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("accepts only a sealed pre-expiry failed transaction for late rollback", () => {
    const transaction = sealCampaignAuthorityArtifact({
      schema: "homecook.marketing-campaign-production-transaction.v1",
      transaction_id: "campaign-transaction-1",
      release_sha: RELEASE_SHA,
      previous_release_sha: PREVIOUS_SHA,
      started_at: "2026-09-15T14:59:59.000Z",
      state: "failed_deploy",
    }, "transaction_sha256");
    expect(verifyCampaignActiveTransaction(transaction)).toEqual(transaction);
    expect(() => verifyCampaignActiveTransaction({ ...transaction, state: "complete" })).toThrow(
      /transaction_sha256/u,
    );
  });

  it("builds and revalidates the manifest from actual authority inputs", () => {
    const input = manifestAndInputs();
    expect(verifyCampaignPromotionAuthority({
      ...input,
      now: new Date("2026-09-04T00:08:00.000Z"),
    })).toMatchObject({ verified: true, release_bundle_sha256: BUNDLE_DIGEST });
    expect(() => verifyCampaignPromotionAuthority({
      ...input,
      bundleBytes: Buffer.from("forged bundle"),
      now: new Date("2026-09-04T00:08:00.000Z"),
    })).toThrow(/bundle bytes/u);
    expect(() => verifyCampaignPromotionAuthority({
      manifest: input.manifest,
      now: new Date("2026-09-04T00:08:00.000Z"),
    })).toThrow(/authority input/u);
  });

  it("rejects stale backup and forged self-asserted receipts", () => {
    const input = manifestAndInputs();
    expect(() => verifyCampaignPromotionAuthority({
      ...input,
      now: new Date("2026-09-06T00:08:00.000Z"),
    })).toThrow(/fresh backup/u);
    expect(() => verifyCampaignPromotionAuthority({
      ...input,
      rehearsal: { ...input.rehearsal, candidate_health: "fail" },
      now: new Date("2026-09-04T00:08:00.000Z"),
    })).toThrow(/receipt_sha256/u);
  });

  it("rechecks a fresh clock before adapter creation, lock, and each mutation", async () => {
    const input = manifestAndInputs({
      snapshotAt: "2026-09-15T14:57:00.000Z",
      backupAt: "2026-09-15T14:58:00.000Z",
      approvedAt: "2026-09-15T14:59:00.000Z",
      buildAt: "2026-09-15T14:59:30.000Z",
    });
    const moments = [
      "2026-09-15T14:59:58.000Z",
      "2026-09-15T14:59:59.000Z",
      CAMPAIGN_RELEASE_EXPIRES_AT,
    ];
    const createAdapters = vi.fn(() => ({ acquireProductionLock: vi.fn() }));
    await expect(runCampaignPromotionTransaction({
      authorityInputs: input,
      clock: () => new Date(moments.shift() ?? CAMPAIGN_RELEASE_EXPIRES_AT),
      createAdapters,
    })).rejects.toThrow(/campaign_release_expired/u);
    expect(createAdapters).toHaveBeenCalledTimes(1);
    expect(createAdapters.mock.results[0]?.value.acquireProductionLock).not.toHaveBeenCalled();
  });

  it("treats recovered false and unhealthy previous identities as manual recovery", async () => {
    const input = manifestAndInputs();
    const adapters = {
      revalidateLiveAuthority: vi.fn(async () => liveAuthority(input)),
      acquireProductionLock: vi.fn(async () => ({ token: "lock" })),
      installBundleTransactionally: vi.fn(async () => { throw new Error("deploy failed"); }),
      verifyPostdeploy: vi.fn(),
      rollbackPreviousBundle: vi.fn(async () => ({ recovered: false })),
      verifyPreviousBundleRecovery: vi.fn(),
      releaseProductionLock: vi.fn(async () => undefined),
    };
    await expect(runCampaignPromotionTransaction({
      authorityInputs: input,
      clock: () => new Date("2026-09-04T00:08:00.000Z"),
      createAdapters: () => adapters,
    })).rejects.toThrow(/manual_recovery_required/u);
    expect(adapters.verifyPreviousBundleRecovery).not.toHaveBeenCalled();
  });

  it("keeps the primary deployment failure when lock release also fails", async () => {
    const input = manifestAndInputs();
    const adapters = {
      revalidateLiveAuthority: vi.fn(async () => liveAuthority(input)),
      acquireProductionLock: vi.fn(async () => ({ token: "lock" })),
      installBundleTransactionally: vi.fn(async () => { throw new Error("primary deploy failure"); }),
      verifyPostdeploy: vi.fn(),
      rollbackPreviousBundle: vi.fn(async () => ({
        recovered: true,
        components: componentIdentities(PREVIOUS_SHA, PREVIOUS_BUNDLE_DIGEST),
        internal_health: "pass",
        public_health: "pass",
      })),
      verifyPreviousBundleRecovery: vi.fn(async (value) => value),
      releaseProductionLock: vi.fn(async () => { throw new Error("unlock failure"); }),
    };
    await expect(runCampaignPromotionTransaction({
      authorityInputs: input,
      clock: () => new Date("2026-09-04T00:08:00.000Z"),
      createAdapters: () => adapters,
    })).rejects.toThrow(/primary deploy failure.*production_lock_release_failed/u);
  });

  it("uses closed postdeploy evidence and rejects secrets and private paths", () => {
    const valid = {
      components: componentIdentities(),
      full_local: {
        healthy_services: ["api-gateway", "auth", "auth-proxy", "postgres", "postgrest", "postgrest-probe", "storage"],
        auth_jwks: "pass", volume_provenance: "pass", migration_head: "pass", authorization_contract: "pass",
      },
      worker_identity: "pass",
      internal_readiness: "pass",
      public_http: { root: 200, beta: 200, privacy: 200, auth_health: 401 },
      marketing: { canary_id: "release_canary_1", api: "pass", state: "pass", database: "pass", analytics_excludes_canary: "pass" },
    };
    const manifest = manifestAndInputs().manifest;
    expect(() => validateCampaignPostdeployEvidence({ ...valid, raw_payload: "x" }, manifest)).toThrow(/unknown fields/u);
    for (const secret of ["ghp_abcdefghijklmnopqrstuvwxyz0123456789", "ghs_abcdefghijklmnopqrstuvwxyz0123456789", "/Users/operator/private/evidence.json"]) {
      expect(() => validateCampaignPostdeployEvidence({
        ...valid,
        marketing: { ...valid.marketing, canary_id: secret },
      }, manifest)).toThrow(/secret material|canary_id/u);
    }
  });

  it("always captures the post-snapshot and reports isolation drift after rehearsal failure", async () => {
    const snapshots = vi.fn()
      .mockResolvedValueOnce({ digest: "a".repeat(64) })
      .mockResolvedValueOnce({ digest: "b".repeat(64) });
    const adapters = {
      reserveIsolation: vi.fn(async () => ({
        port: 42017, private_root: true, unique_docker_project: true,
        unique_volumes: true, fresh_database: true,
      })),
      snapshotProductionReadOnly: snapshots,
      runCandidateHealth: vi.fn(async () => { throw new Error("candidate failed"); }),
      runPreviousBundleRollback: vi.fn(),
      cleanupOwnedResources: vi.fn(async () => ({ status: "complete", residue: 0 })),
    };
    await expect(rehearseCampaignBundle({
      prepared: {
        release_sha: RELEASE_SHA,
        build_id: "build-1",
        release_bundle_sha256: BUNDLE_DIGEST,
        components: componentIdentities(),
      },
      now: new Date("2026-09-04T00:00:00.000Z"),
      adapters,
    })).rejects.toThrow(/production equality verification/u);
    expect(snapshots).toHaveBeenCalledTimes(2);
  });

  it("rejects a recovered bundle whose identities or health do not match", async () => {
    const input = manifestAndInputs();
    const adapters = {
      revalidateLiveAuthority: vi.fn(async () => liveAuthority(input)),
      acquireProductionLock: vi.fn(async () => ({ token: "lock" })),
      installBundleTransactionally: vi.fn(async () => { throw new Error("deploy failed"); }),
      verifyPostdeploy: vi.fn(),
      rollbackPreviousBundle: vi.fn(async () => ({
        recovered: true,
        components: componentIdentities(RELEASE_SHA, BUNDLE_DIGEST),
        internal_health: "pass",
        public_health: "pass",
      })),
      verifyPreviousBundleRecovery: vi.fn(),
      releaseProductionLock: vi.fn(async () => undefined),
    };
    await expect(runCampaignPromotionTransaction({
      authorityInputs: input,
      clock: () => new Date("2026-09-04T00:08:00.000Z"),
      createAdapters: () => adapters,
    })).rejects.toThrow(/manual_recovery_required/u);
  });

  it("executes prepare, rehearse, and guarded rollback CLI operations without planned stubs", async () => {
    for (const command of ["prepare", "rehearse", "rollback"] as const) {
      const operation = vi.fn(async () => ({ command, executed: true }));
      const result = await runMarketingCampaignFastReleaseCli(
        [command, "--authority-root", "/private/campaign", "--json"],
        {
          clock: () => new Date("2026-09-04T00:08:00.000Z"),
          operations: { [command]: operation },
          output: { write: vi.fn() },
        },
      );
      expect(result).toEqual({ command, executed: true });
      expect(operation).toHaveBeenCalledTimes(1);
    }
  });

  it("maps real CLI operations to the existing candidate, rehearsal, and rollback helpers", () => {
    const runHelper = vi.fn((script: string, args: string[], options?: object) => {
      void script;
      void args;
      void options;
      return { executed: true };
    });
    const runFullBundleRollback = vi.fn(() => ({ recovered: true }));
    const operations = createDefaultCampaignReleaseOperations({ runHelper, runFullBundleRollback });
    expect(operations.prepare({
      releaseSha: RELEASE_SHA,
      productionEnvAuthority: "/private/production.env",
      homeDir: "/private/home",
    })).toEqual({ executed: true });
    expect(operations.rehearse({
      candidate: "/private/candidate",
      productionEnvAuthority: "/private/production.env",
    })).toEqual({ executed: true });
    expect(operations.rollback({
      activeTransaction: "/private/transaction.json",
      authorityRoot: "/private/authority",
      rawArgs: ["--active-transaction", "/private/transaction.json", "--dry-run"],
    })).toEqual({ recovered: true });
    expect(runHelper.mock.calls.map(([script]) => script)).toEqual([
      "scripts/local-mac-production-rehearsal-candidate-bootstrap.mjs",
      "scripts/local-mac-production-rehearsal-run.mjs",
    ]);
    expect(runFullBundleRollback).toHaveBeenCalledTimes(1);
    expect(runHelper.mock.calls.flat().join(" ")).not.toContain(
      "youtube-extraction-worker-mac-production.mjs",
    );
  });

  it("requires a cryptographic GitHub attestation verifier", () => {
    const input = manifestAndInputs();
    expect(() => verifyCampaignPromotionAuthority({
      ...input,
      now: new Date("2026-09-04T00:08:00.000Z"),
      attestationVerifier: undefined,
    })).toThrow(/cryptographic attestation verifier/u);
    const attestationVerifier = vi.fn(() => ({
      verified: true,
      repository: "netsus/homecook",
      signer_workflow: "netsus/homecook/.github/workflows/marketing-campaign-fast-release.yml",
      source_ref: "refs/heads/master",
      source_digest: RELEASE_SHA,
      subject_sha256: input.attestation.subject_sha256,
      predicate: {
        manifest_sha256: input.manifest.manifest_sha256,
        release_bundle_sha256: BUNDLE_DIGEST,
      },
    }));
    expect(verifyCampaignPromotionAuthority({
      ...input,
      now: new Date("2026-09-04T00:08:00.000Z"),
      attestationVerifier,
    }).verified).toBe(true);
    expect(attestationVerifier).toHaveBeenCalledTimes(1);
  });

  it("revalidates live master, latest CI, snapshot, and attestation before mutations", async () => {
    const input = manifestAndInputs();
    const revalidateLiveAuthority = vi.fn(async () => ({
      origin_master_sha: RELEASE_SHA,
      required_ci_evidence_sha256: input.manifest.required_ci_evidence_sha256,
      production_snapshot_sha256: input.manifest.production_snapshot_sha256,
      attestation_verified: true,
    }));
    const postdeploy = {
      components: componentIdentities(),
      full_local: {
        healthy_services: ["api-gateway", "auth", "auth-proxy", "postgres", "postgrest", "postgrest-probe", "storage"],
        auth_jwks: "pass", volume_provenance: "pass", migration_head: "pass", authorization_contract: "pass",
      },
      worker_identity: "pass", internal_readiness: "pass",
      public_http: { root: 200, beta: 200, privacy: 200, auth_health: 401 },
      marketing: { canary_id: "release_canary_1", api: "pass", state: "pass", database: "pass", analytics_excludes_canary: "pass" },
    };
    const adapters = {
      revalidateLiveAuthority,
      acquireProductionLock: vi.fn(async () => ({ token: "lock" })),
      installBundleTransactionally: vi.fn(async () => ({ installed: true })),
      verifyPostdeploy: vi.fn(async () => postdeploy),
      rollbackPreviousBundle: vi.fn(),
      verifyPreviousBundleRecovery: vi.fn(),
      releaseProductionLock: vi.fn(),
    };
    await runCampaignPromotionTransaction({
      authorityInputs: {
        ...input,
        attestationVerifier: () => ({
          verified: true,
          repository: "netsus/homecook",
          signer_workflow: "netsus/homecook/.github/workflows/marketing-campaign-fast-release.yml",
          source_ref: "refs/heads/master",
          source_digest: RELEASE_SHA,
          subject_sha256: input.attestation.subject_sha256,
          predicate: {
            manifest_sha256: input.manifest.manifest_sha256,
            release_bundle_sha256: BUNDLE_DIGEST,
          },
        }),
      },
      clock: () => new Date("2026-09-04T00:08:00.000Z"),
      createAdapters: () => adapters,
    });
    expect(revalidateLiveAuthority.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("routes public verify through the complete authority operation", async () => {
    const verify = vi.fn(async () => ({ verified: true }));
    const result = await runMarketingCampaignFastReleaseCli(
      ["verify", "--authority-root", "/private/campaign-authority", "--json"],
      {
        clock: () => new Date("2026-09-04T00:08:00.000Z"),
        operations: { verify },
        output: { write: vi.fn() },
      },
    );
    expect(result).toEqual({ verified: true });
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("ships a canonical producer and recollects CI after approval without campaign kill switches", () => {
    const root = process.cwd();
    const releaseWorkflow = readFileSync(
      `${root}/.github/workflows/marketing-campaign-fast-release.yml`,
      "utf8",
    );
    const producerPath = `${root}/.github/workflows/marketing-campaign-release-authority.yml`;
    expect(existsSync(producerPath)).toBe(true);
    const producerWorkflow = existsSync(producerPath) ? readFileSync(producerPath, "utf8") : "";
    expect(producerWorkflow).toContain("release:campaign:prepare");
    expect(producerWorkflow).toContain("release:campaign:rehearse");
    const approvalIndex = releaseWorkflow.indexOf("environment: production-release-approval");
    expect(releaseWorkflow.indexOf("filter=latest", approvalIndex)).toBeGreaterThan(approvalIndex);
    expect(releaseWorkflow).not.toContain("activation_blocked");
  });
});
