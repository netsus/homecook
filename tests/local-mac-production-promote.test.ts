import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getLocalMacProductionReleasePaths,
  promoteLocalMacProductionRelease,
} from "../scripts/lib/local-mac-production-release.mjs";
import * as localRelease from "../scripts/lib/local-mac-production-release.mjs";
import {
  createLocalMacProductionGitEvidence,
  createLocalMacProductionReleaseManifest,
  VERIFIED_ATTESTATION,
} from "./helpers/local-mac-production-release-fixtures";

const temporaryDirectories: string[] = [];
const PREVIOUS_RELEASE_SHA = "c".repeat(40);
const PREVIOUS_RELEASE_TREE = "f".repeat(40);
const FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA =
  "3bdd814da8f9849805185d1b3be5a6ee703133a0";

function createTempDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function sha256(bytes: Buffer | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

function createRunningDescriptor(overrides: Record<string, unknown> = {}) {
  return {
    schema: "homecook.local-mac-production-running-release.v1",
    release_tag: "prod-20260824.1",
    release_sha: PREVIOUS_RELEASE_SHA,
    release_tree: PREVIOUS_RELEASE_TREE,
    build_id: "build-previous",
    promotion_id: "promo-previous",
    promoted_at: "2026-08-24T09:00:00.000Z",
    source_manifest_sha256: "9".repeat(64),
    execution_app_root: "/private/current-execution/app",
    execution_snapshot_digest: "8".repeat(64),
    worker_artifact_root: "/private/current-worker",
    worker_manifest_path: "/private/current-worker/artifact.json",
    worker_artifact_sha256: "7".repeat(64),
    worker_app_descriptor_sha256: "6".repeat(64),
    worker_config_sha256: "5".repeat(64),
    worker_credential_sha256: "4".repeat(64),
    worker_expected_schema_sha256: "3".repeat(64),
    worker_policy_sha256: "2".repeat(64),
    ...overrides,
  };
}

function createReadyBundle(manifest: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  const identity = {
    ready: true,
    release_sha: manifest.release_sha,
    release_tree: manifest.release_tree,
    build_id: manifest.build_id,
    promotion_id: manifest.promotion_id,
  };
  return {
    app: { ...identity },
    full_local: { ...identity },
    youtube_worker: { ...identity },
    ...overrides,
  };
}

function createFixture(manifestOverrides: Record<string, unknown> = {}) {
  const homeDir = createTempDirectory("homecook-promote-home-");
  const rootDir = createTempDirectory("homecook-promote-root-");
  const manifestPath = join(rootDir, "release.json");
  const manifest = createLocalMacProductionReleaseManifest(manifestPath, {
    previous_release_sha: PREVIOUS_RELEASE_SHA,
    ...manifestOverrides,
  });
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2));
  writeFileSync(manifestPath, manifestBytes, { mode: 0o600 });

  const paths = getLocalMacProductionReleasePaths(homeDir);
  mkdirSync(paths.releaseRoot, { recursive: true, mode: 0o700 });
  chmodSync(join(paths.releaseRoot, ".."), 0o700);
  chmodSync(paths.releaseRoot, 0o700);
  writeFileSync(
    paths.currentDescriptorPath,
    JSON.stringify(createRunningDescriptor(), null, 2),
    { mode: 0o600 },
  );

  const releaseDir = join(paths.releaseRoot, String(manifest.release_tag));
  mkdirSync(releaseDir, { mode: 0o700 });
  mkdirSync(join(releaseDir, ".git"), { mode: 0o700 });
  mkdirSync(join(releaseDir, ".next"), { mode: 0o700 });
  writeFileSync(join(releaseDir, ".next", "BUILD_ID"), `${manifest.build_id}\n`);
  writeFileSync(join(releaseDir, "release-manifest.json"), manifestBytes, { mode: 0o600 });
  writeFileSync(join(releaseDir, "prepare.json"), JSON.stringify({
    schema: "homecook.local-mac-production-prepare.v1",
    status: "prepared",
    prepared_at: "2026-08-25T10:00:00.000Z",
    promotion_id: manifest.promotion_id,
    release_tag: manifest.release_tag,
    release_sha: manifest.release_sha,
    release_tree: manifest.release_tree,
    build_id: manifest.build_id,
    source_manifest_path: manifest.release_manifest_path,
    source_manifest_sha256: sha256(manifestBytes),
    attestation_source: "test-attestation",
    validation_commands: [],
  }, null, 2), { mode: 0o600 });

  const workerRoot = createTempDirectory("homecook-promote-worker-");
  const workerAuthorityRoot = createTempDirectory("homecook-promote-worker-authority-");
  const workerManifestPath = join(workerRoot, "artifact.json");
  const workerAppDescriptorPath = join(workerAuthorityRoot, "app-descriptor.json");
  const workerExpectedSchemaPath = join(workerAuthorityRoot, "expected-schema.json");
  const workerPolicyPath = join(workerAuthorityRoot, "policy.json");
  writeFileSync(workerManifestPath, "worker-artifact\n", { mode: 0o600 });
  writeFileSync(workerAppDescriptorPath, "worker-app\n", { mode: 0o600 });
  writeFileSync(workerExpectedSchemaPath, "worker-schema\n", { mode: 0o600 });
  writeFileSync(workerPolicyPath, "worker-policy\n", { mode: 0o600 });

  const commandInvocations: Array<{ command: string, args: string[] }> = [];
  const runCommandMock = vi.fn((command: string, args: readonly string[] = []) => {
    commandInvocations.push({ command, args: [...args] });
    return createFixtureCommandResult({ manifest } as ReturnType<typeof createFixture>, command, args);
  });
  const runCommand = runCommandMock as unknown as typeof import("node:child_process").spawnSync;
  const installBundle = vi.fn(async () => ({ installed: true }));
  const preflightBundle = vi.fn(async () => ({
    stable_key: "runtime-stable",
    worker: {
      artifactRoot: workerRoot,
      manifestPath: workerManifestPath,
      appDescriptorPath: workerAppDescriptorPath,
      configPath: "/private/worker/worker.env",
      credentialPath: "/private/worker/credential.json",
      expectedSchemaPath: workerExpectedSchemaPath,
      policyPath: workerPolicyPath,
      secretRoot: "/private/worker/secrets",
      artifactSha256: "7".repeat(64),
      appDescriptorSha256: "6".repeat(64),
      configSha256: "5".repeat(64),
      credentialSha256: "4".repeat(64),
      expectedSchemaSha256: "3".repeat(64),
      policySha256: "2".repeat(64),
    },
  }));
  const readinessProbe = vi.fn(async () => createReadyBundle(manifest));
  const finalWorkerProbe = vi.fn(async () => ({
    ...createReadyBundle(manifest).youtube_worker,
    artifactSha256: "7".repeat(64),
    appDescriptorSha256: sha256(readFileSync(workerAppDescriptorPath)),
    configSha256: "5".repeat(64),
    credentialSha256: "4".repeat(64),
    expectedSchemaSha256: sha256(readFileSync(workerExpectedSchemaPath)),
    policySha256: "2".repeat(64),
  }));

  return {
    commandInvocations,
    finalWorkerProbe,
    homeDir,
    installBundle,
    manifest,
    manifestBytes,
    manifestPath,
    paths,
    preflightBundle,
    readinessProbe,
    releaseDir,
    rootDir,
    runCommand,
    runCommandMock,
    workerAppDescriptorPath,
    workerExpectedSchemaPath,
    workerManifestPath,
    workerPolicyPath,
    workerRoot,
  };
}

function promoteOptions(fixture: ReturnType<typeof createFixture>) {
  return {
    homeDir: fixture.homeDir,
    manifestPath: fixture.manifestPath,
    rootDir: fixture.rootDir,
    runCommand: fixture.runCommand,
    readGitEvidence: () => createLocalMacProductionGitEvidence({
      releaseSha: String(fixture.manifest.release_sha),
      releaseTree: String(fixture.manifest.release_tree),
      overrides: {
        releaseTagObjectSha: String(fixture.manifest.release_tag_object_sha),
      },
    }),
    verifyAttestation: VERIFIED_ATTESTATION,
    installBundle: fixture.installBundle,
    finalWorkerProbe: fixture.finalWorkerProbe,
    preflightBundle: fixture.preflightBundle,
    readinessProbe: fixture.readinessProbe,
    lockToken: "88888888-8888-4888-8888-888888888888" as const,
    now: new Date("2026-08-25T11:00:00.000Z"),
  };
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) {
      const makeWritable = (path: string) => {
        if (!existsSync(path)) return;
        const stat = lstatSync(path);
        if (stat.isSymbolicLink()) return;
        if (stat.isDirectory()) {
          chmodSync(path, 0o700);
          for (const name of readdirSync(path)) makeWritable(join(path, name));
        } else {
          chmodSync(path, 0o600);
        }
      };
      makeWritable(directory);
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("local Mac production promote", () => {
  it("exposes a runtime-owned release identity probe", () => {
    expect(localRelease).toHaveProperty(
      "readLocalMacProductionRuntimeIdentity",
      expect.any(Function),
    );
    expect(localRelease).toHaveProperty(
      "readLocalMacProductionPreparedReleaseIdentity",
      expect.any(Function),
    );
  });

  it("derives runtime identity from the live process cwd instead of manifest claims", () => {
    const fixture = createFixture();
    const runCommandMock = vi.fn((command: string, args: readonly string[] = []) => {
      if (command === "/usr/sbin/lsof") {
        return {
          status: 0,
          stdout: `p4242\nfcwd\nn${realpathSync(fixture.releaseDir)}\n`,
          stderr: "",
        };
      }
      return createFixtureCommandResult(fixture, command, args);
    });

    expect(localRelease.readLocalMacProductionRuntimeIdentity({
      component: "app",
      expectedReleaseDir: fixture.releaseDir,
      pid: 4242,
      runCommand: runCommandMock as unknown as typeof import("node:child_process").spawnSync,
    })).toMatchObject({
      component: "app",
      ready: true,
      release_sha: fixture.manifest.release_sha,
      release_tree: fixture.manifest.release_tree,
      build_id: fixture.manifest.build_id,
    });
  });

  it("rejects a live process whose cwd is not the exact prepared release", () => {
    const fixture = createFixture();
    const unrelatedCwd = createTempDirectory("homecook-promote-unrelated-runtime-");
    const runCommand = vi.fn((command: string) => ({
      status: command === "/usr/sbin/lsof" ? 0 : 1,
      stdout: command === "/usr/sbin/lsof" ? `p4242\nfcwd\nn${unrelatedCwd}\n` : "",
      stderr: "",
    })) as unknown as typeof import("node:child_process").spawnSync;

    expect(() => localRelease.readLocalMacProductionRuntimeIdentity({
      component: "full_local",
      expectedReleaseDir: fixture.releaseDir,
      pid: 4242,
      runCommand,
    })).toThrow(/cwd|runtime|exact|release/iu);
  });

  it.each([
    ["dirty tracked source", "status --porcelain=v1 --untracked-files=no", " M scripts/start-production.mjs\n"],
    ["unexpected untracked runtime source", "ls-files --others --exclude-standard -z", "runtime-injection.mjs\0"],
  ])("rejects runtime identity with %s", (_label, failingCommand, stdout) => {
    const fixture = createFixture();
    const runCommand = vi.fn((command: string, args: readonly string[] = []) => {
      if (command === "/usr/sbin/lsof") {
        return {
          status: 0,
          stdout: `p4242\nfcwd\nn${realpathSync(fixture.releaseDir)}\n`,
          stderr: "",
        };
      }
      if (args.join(" ") === failingCommand) {
        return { status: 0, stdout, stderr: "" };
      }
      return createFixtureCommandResult(fixture, command, args);
    }) as unknown as typeof import("node:child_process").spawnSync;

    expect(() => localRelease.readLocalMacProductionRuntimeIdentity({
      component: "app",
      expectedReleaseDir: fixture.releaseDir,
      pid: 4242,
      runCommand,
    })).toThrow(/dirty|tracked|untracked|runtime|source/iu);
  });

  it("rejects a missing completed prepare candidate before acquiring a lock or installing", async () => {
    const fixture = createFixture();
    rmSync(fixture.releaseDir, { recursive: true, force: true });

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/prepared release|candidate|does not exist/iu);
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it("publishes only current.json for the exact first canonical adoption bridge", async () => {
    const fixture = createFixture();
    fixture.manifest = createLocalMacProductionReleaseManifest(fixture.manifestPath, {
      previous_release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA,
    });
    fixture.manifestBytes = Buffer.from(JSON.stringify(fixture.manifest, null, 2));
    writeFileSync(fixture.manifestPath, fixture.manifestBytes, { mode: 0o600 });
    writeFileSync(join(fixture.releaseDir, "release-manifest.json"), fixture.manifestBytes, {
      mode: 0o600,
    });
    const preparePath = join(fixture.releaseDir, "prepare.json");
    const prepare = JSON.parse(readFileSync(preparePath, "utf8"));
    writeFileSync(preparePath, JSON.stringify({
      ...prepare,
      source_manifest_sha256: sha256(fixture.manifestBytes),
    }, null, 2), { mode: 0o600 });
    rmSync(fixture.paths.currentDescriptorPath, { force: true });
    fixture.preflightBundle.mockImplementation(async (...args: unknown[]) => {
      const context = args[0] as {
        currentDescriptor: null,
        currentRuntimeBridge: Record<string, string>,
      };
      expect(context.currentDescriptor).toBeNull();
      expect(context.currentRuntimeBridge).toMatchObject({
        app_release_dir: expect.stringContaining("/01_vibe_coding/homecook-production-current"),
        full_local_source_sha: "36e7aecfe429875f2dc12f3effc020ab1296a818",
        full_local_root: expect.stringContaining(
          "/01_vibe_coding/homecook-session-refresh-storm-deploy-v9",
        ),
        mode: "first-canonical-adoption-v1",
        previous_release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA,
        worker_artifact_root: expect.stringContaining(
          "/.homecook/youtube-extraction-releases/3bdd814da8f9849805185d1b3be5a6ee703133a0-admin-acl-v1",
        ),
        worker_manifest_path: expect.stringContaining(
          "/.homecook/youtube-extraction-releases/3bdd814da8f9849805185d1b3be5a6ee703133a0-admin-acl-v1/",
        ),
      });
      return {
        stable_key: "bridge-stable",
        worker: {
          artifactRoot: fixture.workerRoot,
          manifestPath: fixture.workerManifestPath,
          appDescriptorPath: fixture.workerAppDescriptorPath,
          configPath: "/private/worker/worker.env",
          credentialPath: "/private/worker/credential.json",
          expectedSchemaPath: fixture.workerExpectedSchemaPath,
          policyPath: fixture.workerPolicyPath,
          secretRoot: "/private/worker/secrets",
          artifactSha256: "7".repeat(64),
          appDescriptorSha256: "6".repeat(64),
          configSha256: "5".repeat(64),
          credentialSha256: "4".repeat(64),
          expectedSchemaSha256: "3".repeat(64),
          policySha256: "2".repeat(64),
        },
      };
    });

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .resolves.toMatchObject({ promoted: true });
    expect(existsSync(fixture.paths.currentDescriptorPath)).toBe(true);
    expect(existsSync(fixture.paths.previousDescriptorPath)).toBe(false);
  });

  it("fails closed when current.json is absent for any non-bridge predecessor SHA", async () => {
    const fixture = createFixture();
    rmSync(fixture.paths.currentDescriptorPath, { force: true });

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/current.*descriptor|first canonical adoption|previous_release_sha|bridge/iu);
    expect(existsSync(fixture.paths.previousDescriptorPath)).toBe(false);
  });

  it("rejects a partial candidate without a completed prepare marker and preserves it", async () => {
    const fixture = createFixture();
    rmSync(join(fixture.releaseDir, "prepare.json"));

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/prepare.*marker|partial|prepare\.json/iu);
    expect(existsSync(fixture.releaseDir)).toBe(true);
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
  });

  it("accepts an owner-controlled mode 0644 release manifest prepared by the existing flow", async () => {
    const fixture = createFixture();
    chmodSync(fixture.manifestPath, 0o644);

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .resolves.toMatchObject({ promoted: true });
  });

  it("rejects a group-writable release manifest before lock or mutation", async () => {
    const fixture = createFixture();
    chmodSync(fixture.manifestPath, 0o664);

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/manifest.*writable|mode|unsafe/iu);
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it.each([
    ["marker status", (value: Record<string, unknown>) => ({ ...value, status: "building" }), /status|prepared/iu],
    ["manifest digest", (value: Record<string, unknown>) => ({ ...value, source_manifest_sha256: "0".repeat(64) }), /digest|sha256/iu],
    ["release SHA", (value: Record<string, unknown>) => ({ ...value, release_sha: "0".repeat(40) }), /release.*sha/iu],
    ["release tree", (value: Record<string, unknown>) => ({ ...value, release_tree: "0".repeat(40) }), /tree/iu],
    ["build ID", (value: Record<string, unknown>) => ({ ...value, build_id: "other-build" }), /build.*id/iu],
  ])("rejects candidate %s drift", async (_label, mutate, message) => {
    const fixture = createFixture();
    const path = join(fixture.releaseDir, "prepare.json");
    const value = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, JSON.stringify(mutate(value), null, 2), { mode: 0o600 });

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(message);
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it("rejects candidate manifest byte drift", async () => {
    const fixture = createFixture();
    writeFileSync(
      join(fixture.releaseDir, "release-manifest.json"),
      JSON.stringify({ ...fixture.manifest, approved_by_task_id: "forged" }, null, 2),
      { mode: 0o600 },
    );

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/manifest|digest/iu);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it.each(["HEAD", "HEAD^{tree}"])("rejects checked-out %s drift", async (ref) => {
    const fixture = createFixture();
    fixture.runCommandMock.mockImplementation((command: string, args: readonly string[] = []) => (
      args.join(" ") === `rev-parse ${ref}`
        ? { status: 0, stdout: `${"0".repeat(40)}\n`, stderr: "" }
        : createFixtureCommandResult(fixture, command, args)
    ));

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/sha|tree|identity/iu);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it("rejects checked-out build ID drift", async () => {
    const fixture = createFixture();
    writeFileSync(join(fixture.releaseDir, ".next", "BUILD_ID"), "wrong-build\n");

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/build.*id/iu);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it("rejects a build path that escapes the immutable candidate through a symlink", async () => {
    const fixture = createFixture();
    const externalBuild = createTempDirectory("homecook-promote-external-build-");
    writeFileSync(join(externalBuild, "BUILD_ID"), `${fixture.manifest.build_id}\n`);
    rmSync(join(fixture.releaseDir, ".next"), { recursive: true, force: true });
    symlinkSync(externalBuild, join(fixture.releaseDir, ".next"));

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/symlink|escape|candidate|build/iu);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it("requires app, full-local, and worker enablement as one indivisible bundle", async () => {
    const fixture = createFixture();
    Object.assign(fixture.manifest, { full_local_launch_agent_enabled: false });
    const manifestBytes = Buffer.from(JSON.stringify(fixture.manifest, null, 2));
    writeFileSync(fixture.manifestPath, manifestBytes, { mode: 0o600 });
    writeFileSync(join(fixture.releaseDir, "release-manifest.json"), manifestBytes, { mode: 0o600 });
    const markerPath = join(fixture.releaseDir, "prepare.json");
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    marker.source_manifest_sha256 = sha256(manifestBytes);
    writeFileSync(markerPath, JSON.stringify(marker, null, 2), { mode: 0o600 });

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/bundle|app|full-local|worker|enabled/iu);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it.each(["held", "corrupt"])("fails closed when the promotion lock is %s", async (state) => {
    const fixture = createFixture();
    mkdirSync(fixture.paths.lockPath, { recursive: true, mode: 0o700 });
    if (state === "held") {
      writeFileSync(fixture.paths.lockMetadataPath, JSON.stringify({
        acquired_at: "2026-08-25T10:30:00.000Z",
        boot_session_id: "boot-other",
        lock_token: "other-token",
        manifest_path: fixture.manifestPath,
        pid: 4242,
        promoter_task_id: "task-other",
        promotion_id: fixture.manifest.promotion_id,
        release_sha: fixture.manifest.release_sha,
        release_tag: fixture.manifest.release_tag,
      }), { mode: 0o600 });
    }

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/lock|already held|corrupt|manual recovery/iu);
    expect(existsSync(fixture.paths.lockPath)).toBe(true);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it("rejects a symlink promotion lock root without writing through it", async () => {
    const fixture = createFixture();
    const externalLockRoot = createTempDirectory("homecook-promote-external-lock-");
    symlinkSync(externalLockRoot, fixture.paths.lockRoot);

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/lock.*symlink|symlink.*lock|symbolic link/iu);
    expect(existsSync(join(externalLockRoot, "production-promotion.lock"))).toBe(false);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it("rejects current running descriptor drift before installing", async () => {
    const fixture = createFixture();
    writeFileSync(fixture.paths.currentDescriptorPath, JSON.stringify(createRunningDescriptor({
      release_sha: "1".repeat(40),
    }), null, 2), { mode: 0o600 });

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/current|running|previous_release_sha|drift/iu);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it("rejects a partial worker path authority in a non-legacy running descriptor", async () => {
    const fixture = createFixture();
    const partialDescriptor = createRunningDescriptor();
    for (const field of [
      "worker_manifest_path",
      "worker_artifact_sha256",
      "worker_app_descriptor_sha256",
      "worker_config_sha256",
      "worker_credential_sha256",
      "worker_expected_schema_sha256",
      "worker_policy_sha256",
    ]) delete partialDescriptor[field as keyof typeof partialDescriptor];
    writeFileSync(
      fixture.paths.currentDescriptorPath,
      JSON.stringify(partialDescriptor, null, 2),
      { mode: 0o600 },
    );

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/worker.*path|descriptor|partial|authority/iu);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it("preserves the lock and unchanged descriptors when the installer fails", async () => {
    const fixture = createFixture();
    const currentBefore = readFileSync(fixture.paths.currentDescriptorPath);
    fixture.installBundle.mockRejectedValueOnce(new Error("fixture installer failed"));

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/installer failed/iu);
    expect(existsSync(fixture.paths.lockPath)).toBe(true);
    expect(readFileSync(fixture.paths.currentDescriptorPath)).toEqual(currentBefore);
    expect(existsSync(fixture.paths.previousDescriptorPath)).toBe(false);
  });

  it("blocks a current runtime preflight failure before any install helper", async () => {
    const fixture = createFixture();
    fixture.preflightBundle.mockRejectedValueOnce(new Error("current runtime drift"));

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/current runtime drift/iu);
    expect(fixture.installBundle).not.toHaveBeenCalled();
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
  });

  it("rejects runtime evidence drift between initial and locked preflight", async () => {
    const fixture = createFixture();
    fixture.preflightBundle
      .mockResolvedValueOnce({
        stable_key: "runtime-a",
        worker: {
          artifactRoot: "/private/worker",
          manifestPath: "/private/worker/worker-artifact.json",
          appDescriptorPath: "/private/worker/app.json",
          configPath: "/private/worker/worker.env",
          credentialPath: "/private/worker/credential.json",
          expectedSchemaPath: "/private/worker/schema.json",
          policyPath: "/private/worker/policy.json",
          secretRoot: "/private/worker/secrets",
          artifactSha256: "7".repeat(64),
          appDescriptorSha256: "6".repeat(64),
          configSha256: "5".repeat(64),
          credentialSha256: "4".repeat(64),
          expectedSchemaSha256: "3".repeat(64),
          policySha256: "2".repeat(64),
        },
      })
      .mockResolvedValueOnce({
        stable_key: "runtime-b",
        worker: {
          artifactRoot: "/private/worker",
          manifestPath: "/private/worker/worker-artifact.json",
          appDescriptorPath: "/private/worker/app.json",
          configPath: "/private/worker/worker.env",
          credentialPath: "/private/worker/credential.json",
          expectedSchemaPath: "/private/worker/schema.json",
          policyPath: "/private/worker/policy.json",
          secretRoot: "/private/worker/secrets",
          artifactSha256: "7".repeat(64),
          appDescriptorSha256: "6".repeat(64),
          configSha256: "5".repeat(64),
          credentialSha256: "4".repeat(64),
          expectedSchemaSha256: "3".repeat(64),
          policySha256: "2".repeat(64),
        },
      });

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/runtime|preflight|stable|drift|changed/iu);
    expect(fixture.installBundle).not.toHaveBeenCalled();
    expect(existsSync(fixture.paths.lockPath)).toBe(true);
  });

  it.each(["app", "full_local", "youtube_worker"])(
    "preserves manual recovery evidence when %s readiness fails",
    async (component) => {
      const fixture = createFixture();
      const currentBefore = readFileSync(fixture.paths.currentDescriptorPath);
      const bundle = createReadyBundle(fixture.manifest);
      bundle[component as keyof typeof bundle] = {
        ...bundle[component as keyof typeof bundle],
        ready: false,
      };
      fixture.readinessProbe.mockResolvedValueOnce(bundle);

      await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
        .rejects.toThrow(new RegExp(`${component}|readiness|ready`, "iu"));
      expect(existsSync(fixture.paths.lockPath)).toBe(true);
      expect(readFileSync(fixture.paths.currentDescriptorPath)).toEqual(currentBefore);
      expect(existsSync(fixture.paths.previousDescriptorPath)).toBe(false);
    },
  );

  it("runs the complete worker probe immediately before descriptor commit", async () => {
    const fixture = createFixture();
    const currentBefore = readFileSync(fixture.paths.currentDescriptorPath);
    fixture.finalWorkerProbe.mockRejectedValueOnce(
      new Error("final worker policy/config/credential drift"),
    );

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/final worker|policy|credential|drift/iu);
    expect(fixture.finalWorkerProbe).toHaveBeenCalledTimes(1);
    expect(readFileSync(fixture.paths.currentDescriptorPath)).toEqual(currentBefore);
    expect(existsSync(fixture.paths.previousDescriptorPath)).toBe(false);
    expect(existsSync(fixture.paths.lockPath)).toBe(true);
  });

  it("rejects promotion_id-only drift after locked validation", async () => {
    const fixture = createFixture();
    fixture.readinessProbe.mockResolvedValueOnce(createReadyBundle(fixture.manifest, {
      full_local: {
        ...createReadyBundle(fixture.manifest).full_local,
        promotion_id: "different-promotion",
      },
    }));

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/promotion|identity|bundle/iu);
    expect(existsSync(fixture.paths.lockPath)).toBe(true);
  });

  it.each(["app", "full_local", "youtube_worker"])(
    "rejects %s identity drift even when readiness reports ready",
    async (component) => {
      const fixture = createFixture();
      const bundle = createReadyBundle(fixture.manifest);
      bundle[component as keyof typeof bundle] = {
        ...bundle[component as keyof typeof bundle],
        release_sha: "2".repeat(40),
      };
      fixture.readinessProbe.mockResolvedValueOnce(bundle);

      await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
        .rejects.toThrow(/identity|release.*sha|bundle/iu);
      expect(existsSync(fixture.paths.lockPath)).toBe(true);
      expect(existsSync(fixture.paths.previousDescriptorPath)).toBe(false);
    },
  );

  it("detects a competing current descriptor write after readiness and writes neither descriptor", async () => {
    const fixture = createFixture();
    const competing = JSON.stringify(createRunningDescriptor({ promotion_id: "competing" }), null, 2);
    fixture.readinessProbe.mockImplementationOnce(async () => {
      writeFileSync(fixture.paths.currentDescriptorPath, competing, { mode: 0o600 });
      return createReadyBundle(fixture.manifest);
    });

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/descriptor.*drift|concurrent|race|changed/iu);
    expect(readFileSync(fixture.paths.currentDescriptorPath, "utf8")).toBe(competing);
    expect(existsSync(fixture.paths.previousDescriptorPath)).toBe(false);
    expect(existsSync(fixture.paths.lockPath)).toBe(true);
  });

  it("rejects a previous descriptor that appears after the initial preflight", async () => {
    const fixture = createFixture();
    fixture.readinessProbe.mockImplementationOnce(async () => {
      writeFileSync(
        fixture.paths.previousDescriptorPath,
        JSON.stringify(createRunningDescriptor({ promotion_id: "competing-previous" }), null, 2),
        { mode: 0o600 },
      );
      return createReadyBundle(fixture.manifest);
    });

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/previous.*descriptor|concurrent|race|changed/iu);
    expect(existsSync(fixture.paths.lockPath)).toBe(true);
  });

  it.each(["after_previous_publish", "after_current_publish"])(
    "restores both descriptors when a post-write fault occurs at %s",
    async (faultPhase) => {
      const fixture = createFixture();
      const currentBefore = readFileSync(fixture.paths.currentDescriptorPath);
      const options = {
        ...promoteOptions(fixture),
        descriptorFault: (phase: string) => {
          if (phase === faultPhase) throw new Error(`fixture ${faultPhase}`);
        },
      } as Parameters<typeof promoteLocalMacProductionRelease>[0] & {
        descriptorFault: (phase: string) => void;
      };

      await expect(promoteLocalMacProductionRelease(options))
        .rejects.toThrow(new RegExp(faultPhase, "u"));
      expect(readFileSync(fixture.paths.currentDescriptorPath)).toEqual(currentBefore);
      expect(existsSync(fixture.paths.previousDescriptorPath)).toBe(false);
      expect(existsSync(fixture.paths.lockPath)).toBe(true);
    },
  );

  it("never overwrites a competing current descriptor at the final publish boundary", async () => {
    const fixture = createFixture();
    const competing = JSON.stringify(
      createRunningDescriptor({ promotion_id: "final-boundary-writer" }),
      null,
      2,
    );
    const options = {
      ...promoteOptions(fixture),
      descriptorFault: (phase: string) => {
        if (phase === "before_current_publish") {
          writeFileSync(fixture.paths.currentDescriptorPath, competing, { mode: 0o600 });
        }
      },
    } as Parameters<typeof promoteLocalMacProductionRelease>[0] & {
      descriptorFault: (phase: string) => void;
    };

    await expect(promoteLocalMacProductionRelease(options))
      .rejects.toThrow(/current|publish|exists|concurrent|race/iu);
    expect(readFileSync(fixture.paths.currentDescriptorPath, "utf8")).toBe(competing);
    expect(existsSync(fixture.paths.previousDescriptorPath)).toBe(false);
    expect(existsSync(fixture.paths.lockPath)).toBe(true);
  });

  it("keeps the old current descriptor when the atomic current descriptor write fails", async () => {
    const fixture = createFixture();
    const currentBefore = readFileSync(fixture.paths.currentDescriptorPath);
    const writeDescriptorAtomically = vi.fn((path: string, bytes: Buffer) => {
      if (path.endsWith("/current.json")) {
        throw new Error("fixture current descriptor write failed");
      }
      writeFileSync(path, bytes, { mode: 0o600 });
    });

    await expect(promoteLocalMacProductionRelease({
      ...promoteOptions(fixture),
      writeDescriptorAtomically,
    })).rejects.toThrow(/descriptor write failed/iu);
    expect(readFileSync(fixture.paths.currentDescriptorPath)).toEqual(currentBefore);
    expect(existsSync(fixture.paths.previousDescriptorPath)).toBe(false);
    expect(existsSync(fixture.paths.lockPath)).toBe(true);
  });

  it("detects a current descriptor race between previous and current commit writes", async () => {
    const fixture = createFixture();
    const competing = JSON.stringify(createRunningDescriptor({ promotion_id: "mid-commit-race" }), null, 2);
    const writeDescriptorAtomically = vi.fn((path: string, bytes: Buffer) => {
      writeFileSync(path, bytes, { mode: 0o600 });
      if (path.endsWith("/previous.json")) {
        writeFileSync(fixture.paths.currentDescriptorPath, competing, { mode: 0o600 });
      }
    });

    await expect(promoteLocalMacProductionRelease({
      ...promoteOptions(fixture),
      writeDescriptorAtomically,
    })).rejects.toThrow(/descriptor.*drift|concurrent|race|changed/iu);
    expect(readFileSync(fixture.paths.currentDescriptorPath, "utf8")).toBe(competing);
    expect(existsSync(fixture.paths.previousDescriptorPath)).toBe(false);
    expect(existsSync(fixture.paths.lockPath)).toBe(true);
  });

  it("revalidates candidate bytes after locking and before invoking the installer", async () => {
    const fixture = createFixture();
    const mkdir = vi.fn((path: Parameters<typeof mkdirSync>[0], options?: Parameters<typeof mkdirSync>[1]) => {
      const result = mkdirSync(path, options);
      if (String(path).endsWith("/production-promotion.lock")) {
        writeFileSync(join(fixture.releaseDir, ".next", "BUILD_ID"), "raced-build\n");
      }
      return result;
    }) as typeof mkdirSync;

    await expect(promoteLocalMacProductionRelease({
      ...promoteOptions(fixture),
      mkdir,
    })).rejects.toThrow(/build|candidate|drift/iu);
    expect(fixture.installBundle).not.toHaveBeenCalled();
    expect(existsSync(fixture.paths.lockPath)).toBe(true);
  });

  it("executes only the sealed snapshot when the prepared candidate mutates after locked preflight", async () => {
    const fixture = createFixture();
    const originalBuild = readFileSync(join(fixture.releaseDir, ".next", "BUILD_ID"));
    const options = {
      ...promoteOptions(fixture),
      afterLockedPreflight: ({ executionSnapshot }: {
        executionSnapshot: { appRoot: string };
      }) => {
        writeFileSync(join(fixture.releaseDir, ".next", "BUILD_ID"), "mutated-then-restored\n");
        writeFileSync(join(fixture.releaseDir, ".next", "BUILD_ID"), originalBuild);
        expect(executionSnapshot.appRoot).not.toBe(realpathSync(fixture.releaseDir));
      },
      installBundle: vi.fn(async ({ releaseDir, executionSnapshot }) => {
        expect(releaseDir).toBe(executionSnapshot.appRoot);
        expect(readFileSync(join(releaseDir, ".next", "BUILD_ID"))).toEqual(originalBuild);
        return { installed: true };
      }),
    } as Parameters<typeof promoteLocalMacProductionRelease>[0] & {
      afterLockedPreflight: (input: { executionSnapshot: { appRoot: string } }) => void;
    };

    await expect(promoteLocalMacProductionRelease(options)).resolves.toMatchObject({
      promoted: true,
      release_dir: expect.stringContaining("execution-snapshots"),
    });
  });

  it("blocks before installation when the sealed execution snapshot mutates", async () => {
    const fixture = createFixture();
    const options = {
      ...promoteOptions(fixture),
      afterLockedPreflight: ({ executionSnapshot }: {
        executionSnapshot: { appRoot: string };
      }) => {
        chmodSync(join(executionSnapshot.appRoot, ".next", "BUILD_ID"), 0o600);
        writeFileSync(join(executionSnapshot.appRoot, ".next", "BUILD_ID"), "tampered\n");
      },
    } as Parameters<typeof promoteLocalMacProductionRelease>[0] & {
      afterLockedPreflight: (input: { executionSnapshot: { appRoot: string } }) => void;
    };

    await expect(promoteLocalMacProductionRelease(options))
      .rejects.toThrow(/sealed|execution snapshot|digest|drift/iu);
    expect(fixture.installBundle).not.toHaveBeenCalled();
    expect(existsSync(fixture.paths.lockPath)).toBe(true);
  });

  it("rejects a symlink execution-snapshot ancestor before copying candidate bytes", async () => {
    const fixture = createFixture();
    const external = createTempDirectory("homecook-execution-snapshot-external-");
    const executionRoot = join(fixture.paths.releaseRoot, "execution-snapshots");
    symlinkSync(external, executionRoot);

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/execution.*snapshot|symlink|symbolic|ancestor/iu);
    expect(readdirSync(external)).toEqual([]);
    expect(fixture.installBundle).not.toHaveBeenCalled();
    expect(existsSync(fixture.paths.lockPath)).toBe(true);
  });

  it("rewrites an absolute internal symlink so original candidate mutation cannot affect execution", async () => {
    const fixture = createFixture();
    const sourceTarget = join(fixture.releaseDir, "runtime-target.txt");
    const sourceLink = join(fixture.releaseDir, "runtime-link.txt");
    writeFileSync(sourceTarget, "sealed-original\n", { mode: 0o600 });
    symlinkSync(sourceTarget, sourceLink);
    const installBundle = vi.fn(async ({ executionSnapshot }) => {
      const snapshotLink = join(executionSnapshot.appRoot, "runtime-link.txt");
      expect(realpathSync(snapshotLink).startsWith(`${executionSnapshot.appRoot}/`)).toBe(true);
      expect(readFileSync(snapshotLink, "utf8")).toBe("sealed-original\n");
      return { installed: true };
    });

    const options = {
      ...promoteOptions(fixture),
      afterLockedPreflight: () => {
        writeFileSync(sourceTarget, "mutated-original\n");
      },
      installBundle,
    } as unknown as Parameters<typeof promoteLocalMacProductionRelease>[0];
    await expect(promoteLocalMacProductionRelease(options))
      .resolves.toMatchObject({ promoted: true });
  });

  it("rejects an execution symlink whose resolved target escapes the candidate root", async () => {
    const fixture = createFixture();
    const external = join(createTempDirectory("homecook-snapshot-link-external-"), "outside.txt");
    writeFileSync(external, "outside\n", { mode: 0o600 });
    symlinkSync(external, join(fixture.releaseDir, "outside-link.txt"));

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/symlink.*target|escape|outside|contain/iu);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it("keeps a relative internal symlink contained inside the sealed snapshot", async () => {
    const fixture = createFixture();
    writeFileSync(join(fixture.releaseDir, "relative-target.txt"), "relative\n", { mode: 0o600 });
    symlinkSync("relative-target.txt", join(fixture.releaseDir, "relative-link.txt"));
    const installBundle = vi.fn(async ({ executionSnapshot }) => {
      const snapshotLink = join(executionSnapshot.appRoot, "relative-link.txt");
      expect(realpathSync(snapshotLink).startsWith(`${executionSnapshot.appRoot}/`)).toBe(true);
      expect(readFileSync(snapshotLink, "utf8")).toBe("relative\n");
      return { installed: true };
    });

    const options = {
      ...promoteOptions(fixture),
      installBundle,
    } as unknown as Parameters<typeof promoteLocalMacProductionRelease>[0];
    await expect(promoteLocalMacProductionRelease(options))
      .resolves.toMatchObject({ promoted: true });
  });

  it("blocks when a regular execution source mutates during copy", async () => {
    const fixture = createFixture();
    const buildIdPath = join(fixture.releaseDir, ".next", "BUILD_ID");
    const options = {
      ...promoteOptions(fixture),
      executionCopyHook: ({ phase, source }: { phase: string; source: string }) => {
        if (phase === "after_file_copy" && realpathSync(source) === realpathSync(buildIdPath)) {
          chmodSync(source, 0o600);
          writeFileSync(source, "copy-raced-build\n");
        }
      },
    } as Parameters<typeof promoteLocalMacProductionRelease>[0] & {
      executionCopyHook: (input: { phase: string; source: string }) => void;
    };

    await expect(promoteLocalMacProductionRelease(options))
      .rejects.toThrow(/execution source|copy|digest|drift|mutat/iu);
    expect(fixture.installBundle).not.toHaveBeenCalled();
    expect(existsSync(fixture.paths.lockPath)).toBe(true);
  });

  it.each([
    ["app descriptor", "workerAppDescriptorPath"],
    ["expected schema", "workerExpectedSchemaPath"],
    ["policy", "workerPolicyPath"],
  ])("blocks an A→B→A copy race for worker %s authority", async (_label, field) => {
    const fixture = createFixture();
    const sourcePath = fixture[field as keyof typeof fixture] as string;
    const original = readFileSync(sourcePath);
    const options = {
      ...promoteOptions(fixture),
      executionCopyHook: ({ phase, source }: { phase: string; source: string }) => {
        if (realpathSync(source) !== realpathSync(sourcePath)) return;
        chmodSync(source, 0o600);
        if (phase === "after_authority_precheck") writeFileSync(source, "raced-B\n");
        if (phase === "after_authority_copy") writeFileSync(source, original);
      },
    } as Parameters<typeof promoteLocalMacProductionRelease>[0] & {
      executionCopyHook: (input: { phase: string; source: string }) => void;
    };

    await expect(promoteLocalMacProductionRelease(options))
      .rejects.toThrow(/authority|copied|digest|drift|race/iu);
    expect(fixture.installBundle).not.toHaveBeenCalled();
    expect(readFileSync(sourcePath)).toEqual(original);
  });

  it("rejects a candidate symlink that targets contained .git metadata", async () => {
    const fixture = createFixture();
    const gitTarget = join(fixture.releaseDir, ".git", "metadata.txt");
    writeFileSync(gitTarget, "git-metadata\n", { mode: 0o600 });
    symlinkSync(gitTarget, join(fixture.releaseDir, "git-link.txt"));

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/symlink.*git|git metadata|\.git/iu);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it("updates previous/current only after the whole bundle is ready at one exact identity", async () => {
    const fixture = createFixture();
    const currentBefore = readFileSync(fixture.paths.currentDescriptorPath);
    fixture.readinessProbe.mockImplementationOnce(async () => {
      expect(readFileSync(fixture.paths.currentDescriptorPath)).toEqual(currentBefore);
      expect(existsSync(fixture.paths.previousDescriptorPath)).toBe(false);
      return createReadyBundle(fixture.manifest);
    });

    const result = await promoteLocalMacProductionRelease(promoteOptions(fixture));

    expect(result).toMatchObject({
      promoted: true,
      release_dir: expect.stringContaining("execution-snapshots"),
      manifest: {
        release_sha: fixture.manifest.release_sha,
        release_tree: fixture.manifest.release_tree,
        build_id: fixture.manifest.build_id,
      },
    });
    expect(JSON.parse(readFileSync(fixture.paths.previousDescriptorPath, "utf8")))
      .toEqual(JSON.parse(currentBefore.toString("utf8")));
    expect(JSON.parse(readFileSync(fixture.paths.currentDescriptorPath, "utf8"))).toMatchObject({
      schema: "homecook.local-mac-production-running-release.v1",
      release_tag: fixture.manifest.release_tag,
      release_sha: fixture.manifest.release_sha,
      release_tree: fixture.manifest.release_tree,
      build_id: fixture.manifest.build_id,
      promotion_id: fixture.manifest.promotion_id,
      restart_capability: "full-local-resume-current-v1",
      source_manifest_sha256: sha256(fixture.manifestBytes),
      worker_artifact_sha256: "7".repeat(64),
      worker_app_descriptor_sha256: sha256(readFileSync(fixture.workerAppDescriptorPath)),
      worker_config_sha256: "5".repeat(64),
      worker_credential_sha256: "4".repeat(64),
      worker_expected_schema_sha256: sha256(readFileSync(fixture.workerExpectedSchemaPath)),
      worker_policy_sha256: "2".repeat(64),
    });
    const currentDescriptorText = readFileSync(fixture.paths.currentDescriptorPath, "utf8");
    expect(currentDescriptorText).not.toMatch(/credential_path|secret_root|config_path|policy_path/u);
    expect(fixture.installBundle).toHaveBeenCalledTimes(1);
    expect(fixture.preflightBundle).toHaveBeenCalledTimes(2);
    expect(fixture.readinessProbe).toHaveBeenCalledTimes(1);
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
  });

  it("adopts only the exact descriptorless pre-canonical split predecessor", async () => {
    const fixture = createFixture({
      signer_digest: "abac967556aff325207f9adf54f4dcbd07e7a492",
      release_tag: "prod-20260828.1",
      release_tag_object_sha: "93a7e84e3d502c8c91b5a0484bf079f59ffba456",
      release_sha: "abac967556aff325207f9adf54f4dcbd07e7a492",
      release_tree: "b31e7ddc6435d36ce1df15ce32ae68efe1aa9347",
      master_sha_at_approval: "abac967556aff325207f9adf54f4dcbd07e7a492",
      previous_release_sha: "3bdd814da8f9849805185d1b3be5a6ee703133a0",
      attestation_digest: "a090e1cdd4db337120aad9ed54eea8edaecc38f566663a1b302a42ca7a5b5fca",
    });
    rmSync(fixture.paths.currentDescriptorPath);

    const result = await promoteLocalMacProductionRelease(promoteOptions(fixture));

    expect(result).toMatchObject({
      promoted: true,
      predecessor_adoption: {
        contract: "prod-20260828.1-precanonical-split-v1",
        predecessor_release_sha: "3bdd814da8f9849805185d1b3be5a6ee703133a0",
        components: {
          app: {
            release_sha: "3bdd814da8f9849805185d1b3be5a6ee703133a0",
            release_tree: "255f3c23a38593aade4b1f4bc3e2941030c9fe90",
            build_id: "aKwKCpoAEwSrD6066XEwu",
          },
          full_local: {
            release_sha: "36e7aecfe429875f2dc12f3effc020ab1296a818",
            release_tree: "abfc8fae339a5d1c0dfaf261171164680e9c79c3",
            build_id: "8t5KKzb2z0Q3VO4SnnLOh",
            runtime_command: "start",
          },
          youtube_worker: {
            release_sha: "3bdd814da8f9849805185d1b3be5a6ee703133a0",
            artifact_sha256: "e228d46c1074ec499b709803bab4cc8dc8e2add30655fa1648dab564423e2c01",
          },
        },
      },
    });
    expect(existsSync(fixture.paths.previousDescriptorPath)).toBe(false);
    expect(JSON.parse(readFileSync(fixture.paths.currentDescriptorPath, "utf8")))
      .toMatchObject({
        release_tag: "prod-20260828.1",
        release_sha: "abac967556aff325207f9adf54f4dcbd07e7a492",
      });
  });

  it("keeps descriptorless adoption fail-closed for every other target identity", async () => {
    const fixture = createFixture({
      previous_release_sha: "3bdd814da8f9849805185d1b3be5a6ee703133a0",
    });
    rmSync(fixture.paths.currentDescriptorPath);

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/current.*descriptor|one-time|adoption|pre-canonical/iu);
    expect(fixture.installBundle).not.toHaveBeenCalled();
    expect(existsSync(fixture.paths.previousDescriptorPath)).toBe(false);
  });

  it("blocks a descriptor that appears during locked one-time adoption preflight", async () => {
    const fixture = createFixture({
      signer_digest: "abac967556aff325207f9adf54f4dcbd07e7a492",
      release_tag: "prod-20260828.1",
      release_tag_object_sha: "93a7e84e3d502c8c91b5a0484bf079f59ffba456",
      release_sha: "abac967556aff325207f9adf54f4dcbd07e7a492",
      release_tree: "b31e7ddc6435d36ce1df15ce32ae68efe1aa9347",
      master_sha_at_approval: "abac967556aff325207f9adf54f4dcbd07e7a492",
      previous_release_sha: "3bdd814da8f9849805185d1b3be5a6ee703133a0",
      attestation_digest: "a090e1cdd4db337120aad9ed54eea8edaecc38f566663a1b302a42ca7a5b5fca",
    });
    rmSync(fixture.paths.currentDescriptorPath);
    const originalPreflight = fixture.preflightBundle.getMockImplementation();
    if (!originalPreflight) throw new Error("Fixture preflight implementation is missing.");
    fixture.preflightBundle.mockImplementationOnce(originalPreflight);
    fixture.preflightBundle.mockImplementationOnce(async () => {
      writeFileSync(
        fixture.paths.currentDescriptorPath,
        JSON.stringify(createRunningDescriptor(), null, 2),
        { mode: 0o600 },
      );
      return {
        stable_key: "runtime-stable",
        worker: {
          artifactRoot: fixture.workerRoot,
          manifestPath: fixture.workerManifestPath,
          appDescriptorPath: fixture.workerAppDescriptorPath,
          configPath: "/private/worker/worker.env",
          credentialPath: "/private/worker/credential.json",
          expectedSchemaPath: fixture.workerExpectedSchemaPath,
          policyPath: fixture.workerPolicyPath,
          secretRoot: "/private/worker/secrets",
          artifactSha256: "7".repeat(64),
          appDescriptorSha256: "6".repeat(64),
          configSha256: "5".repeat(64),
          credentialSha256: "4".repeat(64),
          expectedSchemaSha256: "3".repeat(64),
          policySha256: "2".repeat(64),
        },
      };
    });

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/descriptor.*changed|concurrent/iu);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });
});

function createFixtureCommandResult(
  fixture: { manifest: Record<string, unknown> },
  command: string,
  args: readonly string[],
) {
  const joined = args.join(" ");
  if (joined === "rev-parse HEAD") {
    return { status: 0, stdout: `${fixture.manifest.release_sha}\n`, stderr: "" };
  }
  if (joined === "rev-parse HEAD^{tree}") {
    return { status: 0, stdout: `${fixture.manifest.release_tree}\n`, stderr: "" };
  }
  if (joined === "symbolic-ref -q HEAD") return { status: 1, stdout: "", stderr: "" };
  if (joined === "status --porcelain=v1 --untracked-files=no") {
    return { status: 0, stdout: "", stderr: "" };
  }
  if (joined === "ls-files --others --exclude-standard -z") {
    return { status: 0, stdout: "", stderr: "" };
  }
  if (joined === "ls-files -s -z") return { status: 0, stdout: "", stderr: "" };
  throw new Error(`Unexpected fixture command: ${command} ${joined}`);
}
