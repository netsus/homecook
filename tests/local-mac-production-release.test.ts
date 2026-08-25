import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  acquireLocalMacProductionPromotionLock,
  getLocalMacProductionReleaseStatus,
  isLocalMacProductionMutationCommand,
  readLocalMacProductionRepoHeadSha,
  validateLocalMacProductionMutationAuthority,
  validateLocalMacProductionReleaseManifest,
} from "../scripts/lib/local-mac-production-release.mjs";

const temporaryDirectories: string[] = [];

function createTempDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function createManifest(overrides: Record<string, unknown> = {}) {
  return {
    schema: "homecook.local-mac-production-release.v1",
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
    attestation_digest: "d".repeat(64),
    app_launch_agent_enabled: true,
    full_local_launch_agent_enabled: true,
    youtube_worker_launch_agent_enabled: true,
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
        currentHeadSha: "a".repeat(40),
        manifestPath: "/tmp/release.json",
      }),
    ).toThrow(/prod-/iu);

    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({ master_sha_at_approval: "e".repeat(40) }),
        currentHeadSha: "a".repeat(40),
        manifestPath: "/tmp/release.json",
      }),
    ).toThrow(/origin\/master|approved master|exact/iu);

    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest(),
        currentHeadSha: "f".repeat(40),
        manifestPath: "/tmp/release.json",
      }),
    ).toThrow(/origin\/master|approved master|exact/iu);
  });

  it("rejects missing launch-agent enablement fields instead of silently defaulting them", () => {
    expect(() =>
      validateLocalMacProductionReleaseManifest({
        manifest: createManifest({
          app_launch_agent_enabled: undefined,
          release_manifest_path: "/tmp/release.json",
        }),
        currentHeadSha: "a".repeat(40),
        manifestPath: "/tmp/release.json",
      }),
    ).toThrow(/app_launch_agent_enabled/iu);
  });
});

describe("local Mac production promotion lock", () => {
  it("allows only one writer and reports stale lock candidates without auto-deleting them", () => {
    const homeDir = createTempDirectory("homecook-release-lock-home-");
    const manifest = createManifest();
    const first = acquireLocalMacProductionPromotionLock({
      homeDir,
      manifest,
      manifestPath: manifest.release_manifest_path,
      lockToken: "11111111-1111-4111-8111-111111111111",
      pid: 4242,
      bootSessionId: "boot-session-a",
      promoterTaskId: "task-019-release",
      now: new Date("2026-08-25T10:00:00.000Z"),
    });

    expect(first.lockPath).toContain(".homecook/locks/production-promotion.lock");

    expect(() =>
      acquireLocalMacProductionPromotionLock({
        homeDir,
        manifest,
        manifestPath: manifest.release_manifest_path,
        lockToken: "22222222-2222-4222-8222-222222222222",
        pid: 4343,
        bootSessionId: "boot-session-b",
        promoterTaskId: "task-020-release",
        now: new Date("2026-08-25T10:05:00.000Z"),
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
      }),
    ).toThrow(/ambient|environment|--release-manifest|--lock-token/iu);
  });
});
