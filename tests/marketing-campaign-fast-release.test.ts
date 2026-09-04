import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  CAMPAIGN_RELEASE_EXPIRES_AT,
  CAMPAIGN_RELEASE_REQUIRED_CONTEXTS,
  assertCampaignCommandAllowed,
  assertNoCampaignSecretMaterial,
  buildCampaignManifest,
  createCampaignProductionAdapterBridge,
  prepareCampaignBundle,
  rehearseCampaignBundle,
  runCampaignPromotionTransaction,
  selectLatestRequiredCampaignChecks,
  validateCampaignPostdeployEvidence,
  validateCampaignManifest,
} from "../scripts/lib/marketing-campaign-fast-release.mjs";
import { runMarketingCampaignFastReleaseCli } from "../scripts/marketing-campaign-fast-release.mjs";

const RELEASE_SHA = "1".repeat(40);
const RELEASE_TREE = "2".repeat(40);
const DIGEST = "a".repeat(64);

function successfulCheck(name: string, id: number, completedAt = "2026-09-04T00:00:00.000Z") {
  return {
    id,
    name,
    head_sha: RELEASE_SHA,
    status: "completed",
    conclusion: "success",
    completed_at: completedAt,
    app: { id: 15368 },
    repository: { full_name: "netsus/homecook" },
  };
}

function manifestInput() {
  return {
    schema: "homecook.marketing-campaign-fast-release.v1",
    expires_at: CAMPAIGN_RELEASE_EXPIRES_AT,
    repository: "netsus/homecook",
    source_ref: "refs/heads/master",
    release_sha: RELEASE_SHA,
    release_tree: RELEASE_TREE,
    build_id: "campaign-build-1",
    release_bundle_sha256: DIGEST,
    required_ci_evidence_sha256: "b".repeat(64),
    rehearsal_receipt_sha256: "c".repeat(64),
    production_snapshot_sha256: "d".repeat(64),
    backup_receipt_sha256: "e".repeat(64),
    previous_release_sha: "3".repeat(40),
    approval: {
      environment: "production-release-approval",
      approved: true,
      approval_count: 1,
      prevent_self_review: true,
      approver: "human-release-approver",
    },
    rehearsal: {
      run_count: 1,
      candidate_health: "pass",
      previous_bundle_rollback: "pass",
      production_guard: "unchanged",
      cleanup: "complete",
    },
    backup: { fresh: true, encrypted: true, verified: true },
    components: ["app", "full-local", "youtube-worker"].map((component) => ({
      component,
      release_sha: RELEASE_SHA,
      build_id: "campaign-build-1",
      release_bundle_sha256: DIGEST,
    })),
    release_tag: "prod-20260904.1",
  };
}

describe("marketing campaign fast release authority", () => {
  it("fails mutation commands at the expiry boundary before adapter creation", () => {
    const createAdapters = vi.fn();
    expect(() => assertCampaignCommandAllowed({
      command: "promote",
      now: new Date(CAMPAIGN_RELEASE_EXPIRES_AT),
      beforeSensitiveAccess: createAdapters,
    })).toThrow(/campaign_release_expired/u);
    expect(createAdapters).not.toHaveBeenCalled();
  });

  it("allows status, verify, and an already-started rollback after expiry", () => {
    const now = new Date("2026-09-16T00:00:00.000Z");
    expect(assertCampaignCommandAllowed({ command: "status", now })).toBe("status");
    expect(assertCampaignCommandAllowed({ command: "verify", now })).toBe("verify");
    expect(assertCampaignCommandAllowed({
      command: "rollback",
      now,
      activeTransaction: {
        started_at: "2026-09-15T14:59:59.000Z",
        state: "failed_deploy",
      },
    })).toBe("rollback");
    expect(() => assertCampaignCommandAllowed({ command: "rollback", now })).toThrow(
      /active pre-expiry transaction/u,
    );
  });

  it("accepts the latest successful required contexts for the exact SHA", () => {
    const checks = CAMPAIGN_RELEASE_REQUIRED_CONTEXTS.flatMap((name, index) => [
      successfulCheck(name, index + 1, "2026-09-04T00:00:00.000Z"),
      successfulCheck(name, index + 101, "2026-09-04T01:00:00.000Z"),
    ]);
    const evidence = selectLatestRequiredCampaignChecks({
      releaseSha: RELEASE_SHA,
      checkRuns: checks,
    });
    expect(evidence.checks).toHaveLength(7);
    expect(evidence.checks.every((check: { id: number }) => check.id >= 101)).toBe(true);
    expect(evidence.sha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("rejects a failed latest rerun even when an older run succeeded", () => {
    const checks = CAMPAIGN_RELEASE_REQUIRED_CONTEXTS.map((name, index) =>
      successfulCheck(name, index + 1));
    checks.push({
      ...successfulCheck("quality", 999, "2026-09-04T02:00:00.000Z"),
      conclusion: "failure",
    });
    expect(() => selectLatestRequiredCampaignChecks({
      releaseSha: RELEASE_SHA,
      checkRuns: checks,
    })).toThrow(/latest required check quality/u);
  });

  it("locks one rehearsal, verified backup, one approval, and bundle parity", () => {
    const manifest = buildCampaignManifest(manifestInput());
    expect(validateCampaignManifest(manifest)).toEqual(manifest);
    expect(manifest.manifest_sha256).toMatch(/^[0-9a-f]{64}$/u);

    expect(() => buildCampaignManifest({
      ...manifestInput(),
      rehearsal: { ...manifestInput().rehearsal, run_count: 2 },
    })).toThrow(/run_count must be exactly 1/u);
    expect(() => buildCampaignManifest({
      ...manifestInput(),
      components: manifestInput().components.map((component, index) => ({
        ...component,
        release_bundle_sha256: index === 2 ? "f".repeat(64) : DIGEST,
      })),
    })).toThrow(/bundle parity/u);
    expect(() => buildCampaignManifest({
      ...manifestInput(),
      approval: { ...manifestInput().approval, approval_count: 2 },
    })).toThrow(/approval_count must be exactly 1/u);
    expect(() => buildCampaignManifest({
      ...manifestInput(),
      debug_note: "unexpected authority extension",
    })).toThrow(/unknown fields: debug_note/u);
  });

  it("builds once from a clean isolated exact-master checkout", async () => {
    const adapters = {
      resolveOriginMasterSha: vi.fn(async () => RELEASE_SHA),
      createCleanIsolatedCheckout: vi.fn(async () => ({ clean: true, head_sha: RELEASE_SHA })),
      installFrozenOffline: vi.fn(async () => ({ frozen: true, offline: true })),
      buildSealedBundleOnce: vi.fn(async () => ({
        build_id: "campaign-build-1",
        release_bundle_sha256: DIGEST,
        components: manifestInput().components,
      })),
    };
    const prepared = await prepareCampaignBundle({
      releaseSha: RELEASE_SHA,
      now: new Date("2026-09-04T00:00:00.000Z"),
      adapters,
    });
    expect(prepared.release_bundle_sha256).toBe(DIGEST);
    expect(adapters.installFrozenOffline).toHaveBeenCalledTimes(1);
    expect(adapters.buildSealedBundleOnce).toHaveBeenCalledTimes(1);
  });

  it("runs one high-port rehearsal including previous-bundle rollback", async () => {
    const adapters = {
      reserveHighPort: vi.fn(async () => 42017),
      snapshotProductionReadOnly: vi.fn()
        .mockResolvedValueOnce({ digest: "9".repeat(64) })
        .mockResolvedValueOnce({ digest: "9".repeat(64) }),
      runCandidateHealth: vi.fn(async () => ({ status: "pass" })),
      runPreviousBundleRollback: vi.fn(async () => ({ status: "pass" })),
      cleanupOwnedResources: vi.fn(async () => ({ status: "complete", residue: 0 })),
    };
    const receipt = await rehearseCampaignBundle({
      prepared: {
        release_sha: RELEASE_SHA,
        build_id: "campaign-build-1",
        release_bundle_sha256: DIGEST,
        components: manifestInput().components,
      },
      now: new Date("2026-09-04T00:00:00.000Z"),
      adapters,
    });
    expect(receipt).toMatchObject({
      run_count: 1,
      port: 42017,
      candidate_health: "pass",
      previous_bundle_rollback: "pass",
      production_guard: "unchanged",
      cleanup: "complete",
    });
    expect(adapters.runCandidateHealth).toHaveBeenCalledTimes(1);
    expect(adapters.runPreviousBundleRollback).toHaveBeenCalledTimes(1);
  });

  it("rejects secret-bearing fields and values from public evidence", () => {
    expect(() => assertNoCampaignSecretMaterial({
      release_sha: RELEASE_SHA,
      worker_token: "super-secret",
    })).toThrow(/secret material/u);
    expect(() => assertNoCampaignSecretMaterial({
      note: "Authorization: Bearer abc.def.ghi",
    })).toThrow(/secret material/u);
  });

  it("requires all internal, public, marketing, and worker postdeploy checks", () => {
    const evidence = {
      components: manifestInput().components,
      full_local: {
        healthy_services: [
          "api-gateway", "auth", "auth-proxy", "postgres", "postgrest",
          "postgrest-probe", "storage",
        ],
        auth_jwks: "pass",
        volume_provenance: "pass",
        migration_head: "pass",
        authorization_contract: "pass",
      },
      worker_identity: "pass",
      internal_readiness: "pass",
      public_http: { root: 200, beta: 200, privacy: 200, auth_health: 401 },
      marketing: {
        canary_id: "release_canary_promotion-1",
        api: "pass",
        state: "pass",
        database: "pass",
        analytics_excludes_canary: "pass",
      },
    };
    expect(validateCampaignPostdeployEvidence(evidence, manifestInput())).toEqual(evidence);
    expect(() => validateCampaignPostdeployEvidence({
      ...evidence,
      public_http: { ...evidence.public_http, privacy: 500 },
    }, manifestInput())).toThrow(/public HTTP checks failed/u);
  });

  it("rolls back the previous bundle when deploy verification fails", async () => {
    const calls: string[] = [];
    const adapters = {
      acquireProductionLock: vi.fn(async () => {
        calls.push("lock");
        return { token: "lock-token" };
      }),
      installBundleTransactionally: vi.fn(async () => {
        calls.push("install");
        return { installed: true };
      }),
      verifyPostdeploy: vi.fn(async () => {
        calls.push("verify");
        throw new Error("public health failed");
      }),
      rollbackPreviousBundle: vi.fn(async () => {
        calls.push("rollback");
        return { recovered: true };
      }),
      releaseProductionLock: vi.fn(async () => {
        calls.push("unlock");
      }),
    };
    await expect(runCampaignPromotionTransaction({
      manifest: buildCampaignManifest(manifestInput()),
      now: new Date("2026-09-04T03:00:00.000Z"),
      adapters,
    })).rejects.toThrow(/deployment failed and previous bundle was restored/u);
    expect(calls).toEqual(["lock", "install", "verify", "rollback", "unlock"]);
  });

  it("bridges install and readiness through the existing production adapters", async () => {
    const installBundle = vi.fn(async () => ({ installed: true }));
    const readinessProbe = vi.fn(async () => ({ ready: true }));
    const finalWorkerProbe = vi.fn(async () => ({ ready: true }));
    const contextFactory = vi.fn((input) => ({ ...input, legacy_context: true }));
    const verifyPostdeployEvidence = vi.fn(async () => ({ verified: true }));
    const bridge = createCampaignProductionAdapterBridge({
      productionAdapterFactory: vi.fn(() => ({ installBundle, readinessProbe, finalWorkerProbe })),
      productionAdapterOptions: { homeDir: "/private/home" },
      contextFactory,
      acquireProductionLock: vi.fn(),
      releaseProductionLock: vi.fn(),
      rollbackPreviousBundle: vi.fn(),
      verifyPostdeployEvidence,
    });
    const input = { lock: { token: "lock" }, manifest: manifestInput() };
    await expect(bridge.installBundleTransactionally(input)).resolves.toEqual({ installed: true });
    await expect(bridge.verifyPostdeploy(input)).resolves.toEqual({ verified: true });
    expect(installBundle).toHaveBeenCalledWith(expect.objectContaining({ legacy_context: true }));
    expect(readinessProbe).toHaveBeenCalledTimes(1);
    expect(finalWorkerProbe).toHaveBeenCalledTimes(1);
    expect(verifyPostdeployEvidence).toHaveBeenCalledWith(expect.objectContaining({
      readiness: { ready: true },
      worker: { ready: true },
    }));
  });

  it("keeps the author CLI activation blocked before production adapters", async () => {
    const createProductionAdapters = vi.fn();
    await expect(runMarketingCampaignFastReleaseCli(
      ["promote", "--manifest", "/private/manifest.json"],
      { createProductionAdapters },
    )).rejects.toThrow(/activation_blocked/u);
    expect(createProductionAdapters).not.toHaveBeenCalled();
  });

  it("declares separate campaign workflows and package commands", () => {
    const root = process.cwd();
    const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const releaseWorkflow = readFileSync(
      join(root, ".github/workflows/marketing-campaign-fast-release.yml"),
      "utf8",
    );
    const assuranceWorkflow = readFileSync(
      join(root, ".github/workflows/marketing-campaign-release-assurance.yml"),
      "utf8",
    );
    for (const command of ["plan", "prepare", "rehearse", "promote", "status", "verify", "rollback"]) {
      expect(packageJson.scripts[`release:campaign:${command}`]).toBeTruthy();
    }
    expect(releaseWorkflow).toContain("production-release-approval");
    expect(releaseWorkflow).toContain("activation_blocked");
    expect(releaseWorkflow).toContain("2026-09-15T15:00:00.000Z");
    expect(releaseWorkflow).toContain("release:campaign:promote");
    expect(assuranceWorkflow).toContain("test:local-mac-production-release");
    expect(assuranceWorkflow).toContain("schedule:");
  });
});
