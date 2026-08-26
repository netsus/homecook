import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

import { afterEach, describe, expect, it } from "vitest";

import {
  acquireLocalMacProductionPromotionLock,
  getLocalMacProductionReleasePaths,
  getLocalMacProductionReleaseStatus,
  isLocalMacProductionMutationCommand,
  readLocalMacProductionGitReleaseEvidence,
  readLocalMacProductionRepoHeadSha,
  validateLocalMacProductionMutationAuthority,
  validateLocalMacProductionReleaseManifest,
} from "../scripts/lib/local-mac-production-release.mjs";
import { validateProductionReleaseTag } from "../scripts/lib/production-release-approval-policy.mjs";

const temporaryDirectories: string[] = [];
const VERIFIED_ATTESTATION = () => ({ source: "test-attestation", verified: true });

function createTempDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function createManifest(overrides: Record<string, unknown> = {}) {
  return {
    schema: "homecook.local-mac-production-release.v1",
    repository: "netsus/homecook",
    source_ref: "refs/heads/master",
    signer_workflow: "netsus/homecook/.github/workflows/production-release-attestation.yml",
    signer_digest: "a".repeat(40),
    expected_release_integration_id: 15368,
    promotion_id: "promo-20260825-01",
    release_tag: "prod-20260825.1",
    release_manifest_path: "/Users/tester/.homecook/releases/manifests/prod-20260825.1.json",
    release_sha: "a".repeat(40),
    release_tree: "b".repeat(40),
    master_sha_at_approval: "a".repeat(40),
    approved_at: "2026-08-25T09:00:00.000Z",
    approved_by_task_id: "task-019-release",
    migration_head: "20260825090000_release_gate",
    build_id: "build-20260825-01",
    backup_readiness_evidence: "backup-20260825-01",
    previous_release_sha: "c".repeat(40),
    required_check_summary: {
      total: 12,
      success: 10,
      intended_skip: 2,
    },
    expected_release_contexts: [
      "build",
      "changes",
      "dependency-audit",
      "policy",
      "quality",
      "security-function-authorization",
      "security-smoke",
    ],
    attestation_digest: "d".repeat(64),
    app_launch_agent_enabled: true,
    full_local_launch_agent_enabled: true,
    youtube_worker_launch_agent_enabled: true,
    ...overrides,
  };
}

function createGitEvidence(overrides: Record<string, unknown> = {}) {
  return {
    originMasterSha: "a".repeat(40),
    releaseTagObjectSha: "e".repeat(40),
    releaseTagCommitSha: "a".repeat(40),
    releaseTreeSha: "b".repeat(40),
    ...overrides,
  };
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("local Mac production release manifest", () => {
  it("uses one strict shared prod tag validator and validates the closed release schema", () => {
    expect(validateProductionReleaseTag("prod-20260826.1")).toBe("prod-20260826.1");
    for (const invalidTag of [
      "xprod-20260826.1",
      "prod-20260826.1-extra",
      "prod-20260826x1",
      "prod-20260826.",
      "prod-20260826.01/evil",
    ]) {
      expect(() => validateProductionReleaseTag(invalidTag)).toThrow(/prod-|release tag|format/iu);
    }

    const schema = JSON.parse(readFileSync(
      new URL("../scripts/schemas/local-mac-production-release.schema.json", import.meta.url),
      "utf8",
    ));
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toContain("expected_release_contexts");
    expect(schema.properties.expected_release_contexts).toMatchObject({
      type: "array",
      minItems: 7,
      maxItems: 7,
      uniqueItems: true,
    });
    expect(schema.properties.repository).toEqual({ const: "netsus/homecook" });
    expect(schema.properties.source_ref).toEqual({ const: "refs/heads/master" });
    expect(schema.properties.signer_workflow).toEqual({
      const: "netsus/homecook/.github/workflows/production-release-attestation.yml",
    });
    expect(schema.properties.expected_release_integration_id).toEqual({ const: 15368 });

    const require = createRequire(import.meta.url);
    const eslintPackage = require.resolve("@eslint/eslintrc/package.json");
    const Ajv = require(require.resolve("ajv", { paths: [eslintPackage] }));
    const validateSummary = new Ajv({ allErrors: true }).compile(
      schema.properties.required_check_summary,
    );
    expect(validateSummary({
      total: 7,
      success: 5,
      intended_skip: 2,
      bad: 0,
      cancelled: 0,
      failed: 0,
      pending: 0,
      queued: 0,
      rerun: 0,
    })).toBe(true);
    for (const invalidSummary of [
      { total: -1, success: 0, intended_skip: 0 },
      { total: 7, success: 7, intended_skip: 0, failed: 1 },
      { total: 7, success: 7, intended_skip: 0, unexpected: 0 },
    ]) {
      expect(validateSummary(invalidSummary), JSON.stringify(validateSummary.errors)).toBe(false);
    }
  });

  it("resolves the approved release SHA from origin/master instead of the local checkout head", () => {
    const invocations: string[][] = [];
    const releaseSha = "a".repeat(40);
    const runCommand = ((_: string, args?: readonly string[]) => {
      invocations.push([...(args ?? [])]);
      return {
        status: 0,
        stdout: `${releaseSha}\n`,
      };
    }) as typeof import("node:child_process").spawnSync;

    expect(
      readLocalMacProductionRepoHeadSha({
        rootDir: "/repo",
        runCommand,
      }),
    ).toBe(releaseSha);

    expect(invocations).toEqual([["rev-parse", "origin/master"]]);
  });

  it("rejects a manifest when the release tag or approved SHA does not match the exact approved master head", () => {
    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({ release_tag: "release-20260825.1" }),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence(),
      }),
    ).toThrow(/prod-/iu);

    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({ master_sha_at_approval: "e".repeat(40) }),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence(),
      }),
    ).toThrow(/origin\/master|approved master|exact/iu);

    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest(),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence({ originMasterSha: "f".repeat(40) }),
      }),
    ).toThrow(/origin\/master|approved master|exact/iu);
  });

  it("reads annotated tag, tag commit, tree, and origin/master evidence from git instead of trusting manifest self-claims", () => {
    const invocations: string[][] = [];
    const runCommand = ((_: string, args?: readonly string[]) => {
      const joined = (args ?? []).join(" ");
      invocations.push([...(args ?? [])]);
      if (joined === "rev-parse refs/remotes/origin/master^{commit}") {
        return { status: 0, stdout: `${"a".repeat(40)}\n` };
      }
      if (joined === "rev-parse refs/tags/prod-20260825.1^{tag}") {
        return { status: 0, stdout: `${"e".repeat(40)}\n` };
      }
      if (joined === "rev-parse refs/tags/prod-20260825.1^{commit}") {
        return { status: 0, stdout: `${"a".repeat(40)}\n` };
      }
      if (joined === `rev-parse ${"a".repeat(40)}^{tree}`) {
        return { status: 0, stdout: `${"b".repeat(40)}\n` };
      }
      throw new Error(`Unexpected git command: ${joined}`);
    }) as typeof import("node:child_process").spawnSync;

    expect(
      readLocalMacProductionGitReleaseEvidence({
        releaseSha: "a".repeat(40),
        releaseTag: "prod-20260825.1",
        rootDir: "/repo",
        runCommand,
      }),
    ).toEqual(createGitEvidence());

    expect(invocations).toEqual([
      ["rev-parse", "refs/remotes/origin/master^{commit}"],
      ["rev-parse", "refs/tags/prod-20260825.1^{tag}"],
      ["rev-parse", "refs/tags/prod-20260825.1^{commit}"],
      ["rev-parse", `${"a".repeat(40)}^{tree}`],
    ]);
  });

  it("rejects forged tag commit, tree drift, and nonzero bad/pending/rerun checks", () => {
    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({ release_manifest_path: "/tmp/release.json" }),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence({ releaseTagCommitSha: "f".repeat(40) }),
      }),
    ).toThrow(/tag|commit|release_sha/iu);

    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({ release_manifest_path: "/tmp/release.json" }),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence({ releaseTreeSha: "f".repeat(40) }),
      }),
    ).toThrow(/tree/iu);

    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({
          release_manifest_path: "/tmp/release.json",
          required_check_summary: {
            total: 12,
            success: 10,
            intended_skip: 1,
            pending: 1,
          },
        }),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence(),
      }),
    ).toThrow(/pending|bad|rerun|check summary/iu);
  });

  it("requires a nonempty expected release context set in the manifest", () => {
    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({
          expected_release_contexts: [],
          release_manifest_path: "/tmp/release.json",
        }),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence(),
      }),
    ).toThrow(/expected release context|context set|non-empty/iu);
  });

  it("rejects missing launch-agent enablement fields instead of silently defaulting them", () => {
    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({
          app_launch_agent_enabled: undefined,
          release_manifest_path: "/tmp/release.json",
        }),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence(),
      }),
    ).toThrow(/app_launch_agent_enabled/iu);
  });

  it("rejects unknown top-level manifest fields before they can carry credentials", () => {
    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({
          credentials: { token: "must-not-be-accepted" },
          release_manifest_path: "/tmp/release.json",
        }),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence(),
      }),
    ).toThrow(/unknown|allowed|unexpected|credentials/iu);
  });

  it("rejects unknown required-check summary fields", () => {
    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({
          release_manifest_path: "/tmp/release.json",
          required_check_summary: {
            total: 12,
            success: 10,
            intended_skip: 2,
            secret: "must-not-be-accepted",
          },
        }),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence(),
      }),
    ).toThrow(/unknown|allowed|unexpected|secret/iu);
  });

  it("still accepts an approved tagged release after origin/master advances later", () => {
    expect(
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({ release_manifest_path: "/tmp/release.json" }),
        manifestPath: "/tmp/release.json",
        readGitEvidence: () => createGitEvidence({ originMasterSha: "f".repeat(40) }),
      }).release_sha,
    ).toBe("a".repeat(40));
  });
});

describe("local Mac production promotion lock", () => {
  it("removes only its own partial lock directory when metadata persistence fails", () => {
    const homeDir = createTempDirectory("homecook-release-lock-cleanup-home-");
    const manifestPath = join(homeDir, "release.json");
    const manifest = createManifest({ release_manifest_path: manifestPath });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    expect(() =>
      acquireLocalMacProductionPromotionLock({
        homeDir,
        manifest,
        manifestPath,
        lockToken: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        readCurrentHeadSha: () => manifest.release_sha,
        readGitEvidence: () => createGitEvidence(),
      verifyAttestation: VERIFIED_ATTESTATION,
      writeFile: () => {
        throw new Error("metadata write failed");
      },
      }),
    ).toThrow(/metadata write failed/iu);

    const status = getLocalMacProductionReleaseStatus({
      homeDir,
      manifestPath: null,
      currentBootSessionId: "boot-session-a",
    });
    expect(status.lock.locked).toBe(false);
  });

  it("allows only one writer and reports stale lock candidates without auto-deleting them", () => {
    const homeDir = createTempDirectory("homecook-release-lock-home-");
    const manifestPath = join(homeDir, "release.json");
    const manifest = createManifest({ release_manifest_path: manifestPath });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const first = acquireLocalMacProductionPromotionLock({
      homeDir,
      manifest,
      manifestPath,
      lockToken: "11111111-1111-4111-8111-111111111111",
      pid: 4242,
      bootSessionId: "boot-session-a",
      promoterTaskId: "task-019-release",
      now: new Date("2026-08-25T10:00:00.000Z"),
      readCurrentHeadSha: () => manifest.release_sha,
      readGitEvidence: () => createGitEvidence(),
      verifyAttestation: VERIFIED_ATTESTATION,
    });

    expect(first.lockPath).toContain(".homecook/locks/production-promotion.lock");

    expect(() =>
      acquireLocalMacProductionPromotionLock({
        homeDir,
        manifest,
        manifestPath,
        lockToken: "22222222-2222-4222-8222-222222222222",
        pid: 4343,
        bootSessionId: "boot-session-b",
        promoterTaskId: "task-020-release",
        now: new Date("2026-08-25T10:05:00.000Z"),
        readCurrentHeadSha: () => manifest.release_sha,
        readGitEvidence: () => createGitEvidence(),
        verifyAttestation: VERIFIED_ATTESTATION,
      }),
    ).toThrow(/already held|lock/iu);

    const status = getLocalMacProductionReleaseStatus({
      homeDir,
      manifestPath: null,
      currentHeadSha: manifest.release_sha,
      currentBootSessionId: "boot-session-b",
      isProcessRunning: () => false,
    });

    expect(status.lock.locked).toBe(true);
    expect(status.lock.staleCandidate).toBe(true);
    expect(status.lock.holder).toMatchObject({
      pid: 4242,
      promotion_id: manifest.promotion_id,
      release_sha: manifest.release_sha,
      release_tag: manifest.release_tag,
    });
    expect(status.lock.holder).not.toHaveProperty("lock_token");
  });

  it("treats an orphaned or corrupt lock directory as locked and manual-recovery only", () => {
    const homeDir = createTempDirectory("homecook-release-lock-corrupt-home-");
    const { lockPath } = getLocalMacProductionReleasePaths(homeDir);
    mkdirSync(lockPath, { recursive: true, mode: 0o700 });

    const status = getLocalMacProductionReleaseStatus({
      homeDir,
      manifestPath: null,
      currentBootSessionId: "boot-session-a",
    });

    expect(status.lock.locked).toBe(true);
    expect(status.lock.corrupt).toBe(true);
    expect(status.lock.holder).toBeNull();
  });

  it("returns the resolved current origin/master head in status output when provided", () => {
    const currentHeadSha = "f".repeat(40);

    const status = getLocalMacProductionReleaseStatus({
      currentHeadSha,
      homeDir: createTempDirectory("homecook-release-status-head-home-"),
      manifestPath: null,
      currentBootSessionId: "boot-session-a",
    });

    expect(status.current_head_sha).toBe(currentHeadSha);
  });
});

describe("local Mac production mutation authority", () => {
  it("requires explicit manifest and lock-token authority for mutation commands", () => {
    expect(isLocalMacProductionMutationCommand("prepare-env")).toBe(true);
    expect(isLocalMacProductionMutationCommand("install")).toBe(true);
    expect(isLocalMacProductionMutationCommand("restart")).toBe(true);
    expect(isLocalMacProductionMutationCommand("uninstall")).toBe(true);
    expect(isLocalMacProductionMutationCommand("status")).toBe(false);

    expect(() =>
      validateLocalMacProductionMutationAuthority({
        command: "install",
        releaseManifestPath: null,
        lockToken: null,
      }),
    ).toThrow(/--release-manifest|--lock-token/iu);
  });

  it("does not accept ambient environment variables as a mutation bypass", () => {
    const homeDir = createTempDirectory("homecook-release-authority-home-");
    const rootDir = createTempDirectory("homecook-release-authority-root-");
    mkdirSync(join(rootDir, ".git"), { recursive: true });
    const manifestPath = join(homeDir, "release.json");
    const manifest = createManifest({ release_manifest_path: manifestPath });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    acquireLocalMacProductionPromotionLock({
      homeDir,
      manifest,
      manifestPath,
      lockToken: "33333333-3333-4333-8333-333333333333",
      pid: 4242,
      bootSessionId: "boot-session-a",
      promoterTaskId: "task-019-release",
      now: new Date("2026-08-25T10:00:00.000Z"),
      readCurrentHeadSha: () => manifest.release_sha,
      readGitEvidence: () => createGitEvidence(),
      verifyAttestation: VERIFIED_ATTESTATION,
    });

    expect(() =>
      validateLocalMacProductionMutationAuthority({
        command: "restart",
        rootDir,
        homeDir,
        releaseManifestPath: null,
        lockToken: null,
        env: {
          ...process.env,
          HOMECOOK_RELEASE_MANIFEST_PATH: manifestPath,
          HOMECOOK_RELEASE_LOCK_TOKEN: "lock-token-1",
        },
        readCurrentHeadSha: () => manifest.release_sha,
        readGitEvidence: () => createGitEvidence(),
      }),
    ).toThrow(/ambient|environment|--release-manifest|--lock-token/iu);
  });

  it("fails closed for mutation authority until a trusted attestation verifier explicitly approves the manifest", () => {
    const homeDir = createTempDirectory("homecook-release-attestation-home-");
    const rootDir = createTempDirectory("homecook-release-attestation-root-");
    const manifestPath = join(homeDir, "release.json");
    const manifest = createManifest({ release_manifest_path: manifestPath });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    acquireLocalMacProductionPromotionLock({
      homeDir,
      manifest,
      manifestPath,
      lockToken: "77777777-7777-4777-8777-777777777777",
      readCurrentHeadSha: () => manifest.release_sha,
      readGitEvidence: () => createGitEvidence(),
      verifyAttestation: VERIFIED_ATTESTATION,
    });

    expect(() =>
      validateLocalMacProductionMutationAuthority({
        command: "install",
        homeDir,
        rootDir,
        releaseManifestPath: manifestPath,
        lockToken: "77777777-7777-4777-8777-777777777777",
        readCurrentHeadSha: () => manifest.release_sha,
        readGitEvidence: () => createGitEvidence(),
      }),
    ).toThrow(/attestation|trusted/i);
  });
});
