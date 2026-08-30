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
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

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
  const directory = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
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
    sealed_bundle_digest: manifest.sealed_bundle_digest,
    repeatability_receipt_digest: manifest.repeatability_receipt_digest,
  };
  return {
    app: { ...identity },
    full_local: { ...identity },
    youtube_worker: { ...identity },
    ...overrides,
  };
}

function createFixture() {
  const homeDir = createTempDirectory("homecook-promote-home-");
  const rootDir = createTempDirectory("homecook-promote-root-");
  const manifestPath = join(rootDir, "release.json");
  const manifest = createLocalMacProductionReleaseManifest(manifestPath, {
    previous_release_sha: PREVIOUS_RELEASE_SHA,
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
    full_local_config_sha256: "1".repeat(64),
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
      fullLocalConfigSha256: "1".repeat(64),
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
    fullLocalConfigSha256: "1".repeat(64),
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
    sealedCandidateDigest: localRelease.digestLocalMacProductionExecutionTree(releaseDir),
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
  const frozenRuntimeInputs = {
    schema: "homecook.local-mac-production-frozen-runtime-inputs.v1",
    authority_digest: "6".repeat(64),
    paths: {
      fullLocalConfigPath: "/private/frozen/full-local.env",
      workerConfigPath: "/private/frozen/worker.env",
      workerCredentialPath: "/private/frozen/credential.json",
      workerSecretRoot: "/private/frozen/secrets",
      releaseManifestPath: "/private/frozen/release-manifest.json",
    },
    digests: {
      fullLocalConfigSha256: "1".repeat(64),
      workerConfigSha256: "5".repeat(64),
      workerCredentialSha256: "4".repeat(64),
      releaseManifestSha256: sha256(fixture.manifestBytes),
    },
  };
  return {
    homeDir: fixture.homeDir,
    manifestPath: fixture.manifestPath,
    rootDir: fixture.rootDir,
    runCommand: fixture.runCommand,
    readGitEvidence: () => createLocalMacProductionGitEvidence({
      releaseSha: String(fixture.manifest.release_sha),
      releaseTree: String(fixture.manifest.release_tree),
    }),
    verifyAttestation: VERIFIED_ATTESTATION,
    verifyRehearsalAuthority: vi.fn(() => ({
      verified: true,
      authority_digest: localRelease.digestLocalMacProductionExecutionTree(fixture.releaseDir) === fixture.sealedCandidateDigest
        ? "9".repeat(64)
        : "8".repeat(64),
      sealed_candidate: {
        root: fixture.releaseDir,
        appRoot: fixture.releaseDir,
        fullLocalRoot: null,
        workerRoot: fixture.workerRoot,
        workerManifestPath: fixture.workerManifestPath,
        candidateIdentityDigest: "a".repeat(64),
        bundleManifestDigest: "b".repeat(64),
        sealedBundleDigest: fixture.manifest.sealed_bundle_digest,
        repeatabilityReceiptDigest: fixture.manifest.repeatability_receipt_digest,
        appSourceDigest: fixture.sealedCandidateDigest,
        fullLocalSourceDigest: null,
        workerSourceDigest: localRelease.digestLocalMacProductionExecutionTree(fixture.workerRoot),
      },
    })),
    expectedRehearsalAuthorityDigest: "9".repeat(64),
    installBundle: fixture.installBundle,
    finalWorkerProbe: fixture.finalWorkerProbe,
    cleanupFrozenRuntimeInputs: vi.fn(() => ({ cleaned: true })),
    freezeRuntimeInputs: vi.fn(async ({ scratchRoot }: { scratchRoot: string }) => {
      const runtimeInputRoot = join(scratchRoot, "runtime-inputs");
      mkdirSync(runtimeInputRoot, { mode: 0o700 });
      const releaseManifestPath = join(runtimeInputRoot, "release-manifest.json");
      writeFileSync(releaseManifestPath, fixture.manifestBytes, { mode: 0o600 });
      return {
        ...frozenRuntimeInputs,
        root: runtimeInputRoot,
        paths: { ...frozenRuntimeInputs.paths, releaseManifestPath },
      };
    }),
    preflightBundle: fixture.preflightBundle,
    readinessProbe: fixture.readinessProbe,
    verifyFrozenRuntimeInputs: vi.fn((value) => value),
    lockToken: "88888888-8888-4888-8888-888888888888" as const,
    now: new Date("2026-08-25T11:00:00.000Z"),
  };
}

function createAnchoredDigestFixture() {
  const root = createTempDirectory("homecook-anchored-digest-");
  const appRoot = join(root, "app");
  const fullLocalRoot = join(root, "full-local");
  const workerRoot = join(root, "worker");
  const authorityRoot = join(root, "authority");
  for (const directory of [appRoot, fullLocalRoot, workerRoot, authorityRoot]) {
    mkdirSync(join(directory, "nested"), { recursive: true, mode: 0o700 });
    writeFileSync(join(directory, "nested", "value.txt"), `${directory}\n`, { mode: 0o400 });
    chmodSync(join(directory, "nested"), 0o500);
    chmodSync(directory, 0o500);
  }
  const appStat = lstatSync(appRoot);
  const fullLocalStat = lstatSync(fullLocalRoot);
  const workerStat = lstatSync(workerRoot);
  const authorityStat = lstatSync(authorityRoot);
  return {
    root,
    snapshot: {
      appRoot,
      fullLocalRoot,
      workerRoot,
      authorityRoot,
      appDigest: localRelease.digestLocalMacProductionExecutionTree(appRoot),
      fullLocalDigest: localRelease.digestLocalMacProductionExecutionTree(fullLocalRoot),
      workerDigest: localRelease.digestLocalMacProductionExecutionTree(workerRoot),
      authorityDigest: localRelease.digestLocalMacProductionExecutionTree(authorityRoot),
      appDev: appStat.dev,
      appIno: appStat.ino,
      fullLocalDev: fullLocalStat.dev,
      fullLocalIno: fullLocalStat.ino,
      workerDev: workerStat.dev,
      workerIno: workerStat.ino,
      authorityDev: authorityStat.dev,
      authorityIno: authorityStat.ino,
    },
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
  it.each([
    "component_root",
    "authority_file",
    "nested_file",
  ])("never accepts pathname substitution during FD-anchored %s digest", (attack) => {
    const fixture = createAnchoredDigestFixture();
    let attacked = false;
    expect(() => localRelease.redigestLocalMacProductionFrozenScratch(
      fixture.snapshot,
      {
        anchoredTraversalHook: (event: {
          anchoredPath?: string;
          label: string;
          originalPath?: string;
          path?: string;
          phase: string;
          relativePath?: string;
        }) => {
          if (attacked) return;
          if (attack === "component_root"
            && event.phase === "after_root_anchor" && event.label === "app") {
            attacked = true;
            mkdirSync(event.originalPath!, { mode: 0o700 });
            writeFileSync(join(event.originalPath!, "replacement.txt"), "replacement\n");
            rmSync(event.originalPath!, { recursive: true, force: true });
          }
          if (attack === "authority_file"
            && event.phase === "after_file_open" && event.label === "authority") {
            attacked = true;
            const backup = `${event.path}.original`;
            chmodSync(dirname(event.path!), 0o700);
            renameSync(event.path!, backup);
            writeFileSync(event.path!, "replacement-authority\n", { mode: 0o400 });
            rmSync(event.path!, { force: true });
            renameSync(backup, event.path!);
            chmodSync(dirname(event.path!), 0o500);
          }
          if (attack === "nested_file"
            && event.phase === "after_file_open"
            && event.label === "worker"
            && event.relativePath === "nested/value.txt") {
            attacked = true;
            const backup = `${event.path}.original`;
            chmodSync(dirname(event.path!), 0o700);
            renameSync(event.path!, backup);
            writeFileSync(event.path!, "replacement-worker\n", { mode: 0o400 });
            rmSync(event.path!, { force: true });
            renameSync(backup, event.path!);
            chmodSync(dirname(event.path!), 0o500);
          }
        },
      } as unknown as Parameters<typeof localRelease.redigestLocalMacProductionFrozenScratch>[1],
    )).toThrow(/anchor|identity|changed|digest|replacement/iu);
    expect(attacked).toBe(true);
  });

  it("tracks exactly three FD-rooted component digests plus authority", () => {
    const fixture = createAnchoredDigestFixture();
    const labels: string[] = [];
    const result = localRelease.redigestLocalMacProductionFrozenScratch(
      fixture.snapshot,
      {
        anchoredTraversalHook: ({ label, phase }: { label: string; phase: string }) => {
          if (phase === "after_tree_digest") labels.push(label);
        },
      } as unknown as Parameters<typeof localRelease.redigestLocalMacProductionFrozenScratch>[1],
    );
    expect(labels).toEqual(["app", "full_local", "worker", "authority"]);
    expect(result).toMatchObject({
      appDigest: fixture.snapshot.appDigest,
      fullLocalDigest: fixture.snapshot.fullLocalDigest,
      workerDigest: fixture.snapshot.workerDigest,
      authorityDigest: fixture.snapshot.authorityDigest,
    });
  });

  it("sanitizes anchored traversal inconsistency before production lock", async () => {
    const fixture = createFixture();
    let attacked = false;
    await expect(promoteLocalMacProductionRelease({
      ...promoteOptions(fixture),
      anchoredTraversalHook: (event: {
        label: string;
        originalPath?: string;
        phase: string;
      }) => {
        if (attacked || event.phase !== "after_root_anchor" || event.label !== "app") return;
        attacked = true;
        mkdirSync(event.originalPath!, { mode: 0o700 });
        rmSync(event.originalPath!, { recursive: true, force: true });
      },
    } as unknown as Parameters<typeof promoteLocalMacProductionRelease>[0]))
      .rejects.toThrow(/^promotion_authority_source_changed: production promotion authority source changed\.$/u);
    expect(attacked).toBe(true);
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it.each([
    "missing_manifest",
    "malformed_manifest",
    "git_readback",
    "attestation_command",
  ])("sanitizes the first external promotion read for %s", async (attack) => {
    const fixture = createFixture();
    const rawMarker = `RAW_${attack}_ENOENT_EACCES_gh-git-stderr`;
    const options = promoteOptions(fixture);
    if (attack === "missing_manifest") rmSync(fixture.manifestPath, { force: true });
    if (attack === "malformed_manifest") writeFileSync(fixture.manifestPath, `{${rawMarker}`, { mode: 0o600 });
    if (attack === "git_readback") options.readGitEvidence = () => {
      throw new Error(`${rawMarker} '${fixture.manifestPath}'`);
    };
    if (attack === "attestation_command") options.verifyAttestation = () => {
      throw new Error(`${rawMarker} '${fixture.manifestPath}'`);
    };

    let message = "";
    try {
      await promoteLocalMacProductionRelease(options);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe(
      "promotion_authority_source_changed: production promotion authority source changed.",
    );
    for (const prohibited of [fixture.rootDir, fixture.manifestPath, "release.json", rawMarker, "ENOENT", "EACCES", "stderr"]) {
      expect(message).not.toContain(prohibited);
    }
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
    expect(fixture.preflightBundle).not.toHaveBeenCalled();
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it.each([
    "initial_authority_mismatch",
    "sealed_candidate_identity",
    "final_authority_substitution",
    "candidate_root_change",
    "prelock_authority_drift",
    "manifest_source_revalidation",
    "scratch_authority_mismatch",
  ])("normalizes the pre-lock semantic postcondition %s", async (attack) => {
    const fixture = createFixture();
    const options = promoteOptions(fixture);
    const authority = options.verifyRehearsalAuthority();
    let authorityCalls = 0;
    options.verifyRehearsalAuthority = vi.fn(() => {
      authorityCalls += 1;
      if (attack === "initial_authority_mismatch" && authorityCalls === 1) {
        return { ...authority, authority_digest: "8".repeat(64) };
      }
      if (attack === "sealed_candidate_identity" && authorityCalls === 1) {
        return { ...authority, sealed_candidate: { ...authority.sealed_candidate, sealedBundleDigest: "8".repeat(64) } };
      }
      if (attack === "final_authority_substitution" && authorityCalls === 2) {
        return { ...authority, authority_digest: "8".repeat(64) };
      }
      if (attack === "candidate_root_change" && authorityCalls === 2) {
        return { ...authority, sealed_candidate: { ...authority.sealed_candidate, root: "/private/substituted-candidate" } };
      }
      if (attack === "prelock_authority_drift" && authorityCalls === 3) {
        return { ...authority, authority_digest: "8".repeat(64) };
      }
      return authority;
    });
    if (attack === "manifest_source_revalidation") {
      const originalFreeze = options.freezeRuntimeInputs;
      options.freezeRuntimeInputs = vi.fn(async (input) => {
        const frozen = await originalFreeze(input);
        const replacement = `${fixture.manifestPath}.replacement`;
        writeFileSync(replacement, fixture.manifestBytes, { mode: 0o600 });
        renameSync(replacement, fixture.manifestPath);
        return frozen;
      });
    }
    if (attack === "scratch_authority_mismatch") {
      let sourceChecks = 0;
      options.verifyFrozenRuntimeInputs = vi.fn((value, verifyOptions: { checkSources?: boolean } = {}) => {
        if (verifyOptions.checkSources && ++sourceChecks === 2) {
          throw new Error("runtime_input_source_changed: internal scratch authority mismatch");
        }
        return value;
      });
    }

    await expect(promoteLocalMacProductionRelease(options))
      .rejects.toThrow(/^promotion_authority_source_changed: production promotion authority source changed\.$/u);
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it("re-digests all frozen scratch components through anchored roots immediately before lock", async () => {
    const fixture = createFixture();
    const options = promoteOptions(fixture);
    const fullLocalRoot = createTempDirectory("homecook-prelock-full-local-");
    mkdirSync(join(fullLocalRoot, "infra"), { mode: 0o700 });
    writeFileSync(join(fullLocalRoot, "infra", "marker.txt"), "full-local\n", { mode: 0o400 });
    const authority = options.verifyRehearsalAuthority();
    const completeAuthority = {
      ...authority,
      sealed_candidate: {
        ...authority.sealed_candidate,
        fullLocalRoot,
        fullLocalSourceDigest: localRelease.digestLocalMacProductionExecutionTree(fullLocalRoot),
      },
    };
    let scratchAttempt = "";
    const originalFreeze = options.freezeRuntimeInputs;
    options.freezeRuntimeInputs = vi.fn(async (input) => {
      scratchAttempt = input.scratchRoot;
      return originalFreeze(input);
    });
    const verifyRehearsalAuthority = vi.fn(({ phase }: { phase: string }) => {
      if (phase === "pre-lock") {
        const snapshotName = readdirSync(join(scratchAttempt, "execution-snapshots"))[0];
        const buildIdPath = join(scratchAttempt, "execution-snapshots", snapshotName, "app/.next/BUILD_ID");
        chmodSync(buildIdPath, 0o600);
        writeFileSync(buildIdPath, "mutated-frozen-scratch\n");
        chmodSync(buildIdPath, 0o400);
      }
      return completeAuthority;
    });
    const digestedLabels: string[] = [];
    const anchoredTraversalHook = vi.fn((event: {
      anchoredPath?: string;
      label: string;
      phase: string;
    }) => {
      if (event.anchoredPath) {
        expect(event.anchoredPath.startsWith(`${scratchAttempt}/execution-snapshots/`)).toBe(true);
        expect(event.anchoredPath).not.toBe(fixture.releaseDir);
      }
      if (event.phase === "after_tree_digest") digestedLabels.push(event.label);
    });

    await expect(promoteLocalMacProductionRelease({
      ...options,
      verifyRehearsalAuthority,
      anchoredTraversalHook,
    } as unknown as Parameters<typeof promoteLocalMacProductionRelease>[0]))
      .rejects.toThrow(/^promotion_authority_source_changed: production promotion authority source changed\.$/u);
    expect(digestedLabels.filter((label) => label !== "authority")).toEqual([
      "app",
      "full_local",
      "worker",
    ]);
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it("builds execution snapshots only from verified sealed app, full-local, and worker roots", () => {
    const fixture = createFixture();
    const sealedRoot = createTempDirectory("homecook-sealed-candidate-");
    const sealedAppRoot = join(sealedRoot, "app");
    const sealedFullLocalRoot = join(sealedRoot, "full_local");
    const sealedWorkerRoot = join(sealedRoot, "worker");
    mkdirSync(join(sealedAppRoot, ".next"), { recursive: true, mode: 0o700 });
    mkdirSync(join(sealedFullLocalRoot, "infra", "full-local-supabase"), { recursive: true, mode: 0o700 });
    mkdirSync(sealedWorkerRoot, { mode: 0o700 });
    writeFileSync(join(sealedAppRoot, ".next", "BUILD_ID"), "sealed-app\n", { mode: 0o400 });
    writeFileSync(join(sealedFullLocalRoot, "infra", "full-local-supabase", "sealed.txt"), "sealed-full-local\n", { mode: 0o400 });
    writeFileSync(join(sealedWorkerRoot, "artifact.json"), "{}\n", { mode: 0o400 });
    writeFileSync(join(sealedWorkerRoot, "sealed-worker.txt"), "sealed-worker\n", { mode: 0o400 });
    writeFileSync(join(fixture.releaseDir, ".next", "BUILD_ID"), "attacker-rebuild\n");

    const snapshot = localRelease.createLocalMacProductionExecutionSnapshot({
      manifest: fixture.manifest,
      prelockScratchAuthorityDigest: "d".repeat(64),
      preparedReleaseDir: fixture.releaseDir,
      releaseRoot: fixture.paths.releaseRoot,
      sealedCandidate: {
        appRoot: sealedAppRoot,
        fullLocalRoot: sealedFullLocalRoot,
        workerRoot: sealedWorkerRoot,
        workerManifestPath: join(sealedWorkerRoot, "artifact.json"),
        candidateIdentityDigest: "a".repeat(64),
        bundleManifestDigest: "b".repeat(64),
        sealedBundleDigest: fixture.manifest.sealed_bundle_digest,
        repeatabilityReceiptDigest: fixture.manifest.repeatability_receipt_digest,
        appSourceDigest: localRelease.digestLocalMacProductionExecutionTree(sealedAppRoot),
        fullLocalSourceDigest: localRelease.digestLocalMacProductionExecutionTree(sealedFullLocalRoot),
        workerSourceDigest: localRelease.digestLocalMacProductionExecutionTree(sealedWorkerRoot),
      },
      worker: {
        artifactRoot: fixture.workerRoot,
        manifestPath: fixture.workerManifestPath,
        appDescriptorPath: fixture.workerAppDescriptorPath,
        expectedSchemaPath: fixture.workerExpectedSchemaPath,
        policyPath: fixture.workerPolicyPath,
      },
    } as unknown as Parameters<typeof localRelease.createLocalMacProductionExecutionSnapshot>[0]);

    expect(readFileSync(join(snapshot.appRoot, ".next", "BUILD_ID"), "utf8")).toBe("sealed-app\n");
    expect(readFileSync(join(snapshot.appRoot, "infra", "full-local-supabase", "sealed.txt"), "utf8")).toBe("sealed-full-local\n");
    expect(readFileSync(join(snapshot.workerRoot, "sealed-worker.txt"), "utf8")).toBe("sealed-worker\n");
    expect(snapshot).toMatchObject({
      prelockScratchAuthorityDigest: "d".repeat(64),
      sealedBundleDigest: fixture.manifest.sealed_bundle_digest,
      repeatabilityReceiptDigest: fixture.manifest.repeatability_receipt_digest,
    });
    expect(() => localRelease.verifyLocalMacProductionExecutionSnapshot({
      ...snapshot,
      prelockScratchAuthorityDigest: "e".repeat(64),
    })).toThrow(/scratch|authority|metadata|drift/iu);
  });

  it("rejects a mutated app destination when the full-local overlay is present", () => {
    const fixture = createFixture();
    const sealedRoot = createTempDirectory("homecook-overlay-destination-");
    const appRoot = join(sealedRoot, "app");
    const fullLocalRoot = join(sealedRoot, "full-local");
    const workerRoot = join(sealedRoot, "worker");
    mkdirSync(join(appRoot, ".next"), { recursive: true, mode: 0o700 });
    mkdirSync(join(fullLocalRoot, "infra"), { recursive: true, mode: 0o700 });
    mkdirSync(workerRoot, { mode: 0o700 });
    writeFileSync(join(appRoot, ".next", "BUILD_ID"), "sealed-app\n", { mode: 0o400 });
    writeFileSync(join(fullLocalRoot, "infra", "overlay.txt"), "sealed-overlay\n", { mode: 0o400 });
    writeFileSync(join(workerRoot, "artifact.json"), "{}\n", { mode: 0o400 });

    expect(() => localRelease.createLocalMacProductionExecutionSnapshot({
      copyEntryHook: ({ destination, phase }: { destination: string; phase: string }) => {
        if (phase === "after_file_copy" && destination.endsWith("/app/infra/overlay.txt")) {
          chmodSync(destination, 0o600);
          writeFileSync(destination, "tampered-overlay\n");
        }
      },
      manifest: fixture.manifest,
      preparedReleaseDir: fixture.releaseDir,
      releaseRoot: fixture.paths.releaseRoot,
      sealedCandidate: {
        appRoot,
        fullLocalRoot,
        workerRoot,
        workerManifestPath: join(workerRoot, "artifact.json"),
        candidateIdentityDigest: "a".repeat(64),
        bundleManifestDigest: "b".repeat(64),
        sealedBundleDigest: fixture.manifest.sealed_bundle_digest,
        repeatabilityReceiptDigest: fixture.manifest.repeatability_receipt_digest,
        appSourceDigest: localRelease.digestLocalMacProductionExecutionTree(appRoot),
        fullLocalSourceDigest: localRelease.digestLocalMacProductionExecutionTree(fullLocalRoot),
        workerSourceDigest: localRelease.digestLocalMacProductionExecutionTree(workerRoot),
      },
      worker: {
        artifactRoot: fixture.workerRoot,
        manifestPath: fixture.workerManifestPath,
        appDescriptorPath: fixture.workerAppDescriptorPath,
        expectedSchemaPath: fixture.workerExpectedSchemaPath,
        policyPath: fixture.workerPolicyPath,
      },
    } as unknown as Parameters<typeof localRelease.createLocalMacProductionExecutionSnapshot>[0]))
      .toThrow(/app|overlay|destination|digest|copied/iu);
  });

  it("rejects candidate mutation immediately after the final verifier without creating the production lock", async () => {
    const fixture = createFixture();
    const baseOptions = promoteOptions(fixture);
    const authority = baseOptions.verifyRehearsalAuthority();
    const verifyRehearsalAuthority = vi.fn()
      .mockReturnValueOnce(authority)
      .mockImplementationOnce(() => {
        writeFileSync(join(fixture.releaseDir, ".next", "BUILD_ID"), "mutated-after-final-verifier\n");
        return authority;
      });

    await expect(promoteLocalMacProductionRelease({
      ...baseOptions,
      verifyRehearsalAuthority,
    } as Parameters<typeof promoteLocalMacProductionRelease>[0]))
      .rejects.toThrow(/candidate|physical|source|digest|scratch|bytes/iu);
    expect(fixture.installBundle).toHaveBeenCalledTimes(0);
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
    const scratchParent = join(dirname(fixture.paths.releaseRoot), "rehearsal", "promotion-scratch");
    expect(existsSync(scratchParent) ? readdirSync(scratchParent) : []).toEqual([]);
  });

  it("rejects a symlinked scratch attempt root before writing external bytes or acquiring the production lock", async () => {
    const fixture = createFixture();
    const external = createTempDirectory("homecook-scratch-symlink-external-");
    const mkdir = vi.fn((path: Parameters<typeof mkdirSync>[0], options?: Parameters<typeof mkdirSync>[1]) => {
      const value = String(path);
      if (value.includes("/rehearsal/promotion-scratch/") && !value.endsWith("/promotion-scratch")) {
        symlinkSync(external, value);
        return undefined;
      }
      return mkdirSync(path, options);
    }) as typeof mkdirSync;

    await expect(promoteLocalMacProductionRelease({
      ...promoteOptions(fixture),
      mkdir,
    })).rejects.toThrow(/^promotion_authority_source_changed: production promotion authority source changed\.$/u);
    expect(readdirSync(external)).toEqual([]);
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
    expect(fixture.installBundle).toHaveBeenCalledTimes(0);
  });

  it("never cleans through a replaced scratch attempt root", async () => {
    const fixture = createFixture();
    const external = createTempDirectory("homecook-scratch-cleanup-external-");
    let replaced = false;
    await expect(promoteLocalMacProductionRelease({
      ...promoteOptions(fixture),
      executionCopyHook: ({ destination, phase }: { destination: string; phase: string }) => {
        if (replaced || phase !== "after_file_copy") return;
        const marker = "/execution-snapshots/";
        const index = destination.indexOf(marker);
        if (index < 0) return;
        replaced = true;
        const scratchRoot = destination.slice(0, index);
        renameSync(scratchRoot, `${scratchRoot}.replaced`);
        symlinkSync(external, scratchRoot);
      },
    } as Parameters<typeof promoteLocalMacProductionRelease>[0]))
      .rejects.toThrow(/^promotion_authority_source_changed: production promotion authority source changed\.$/u);
    expect(readdirSync(external)).toEqual([]);
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
    expect(fixture.installBundle).toHaveBeenCalledTimes(0);
  });

  it("revalidates fresh expiry and inventory authority after scratch sealing and before lock creation", async () => {
    const fixture = createFixture();
    const clock = vi.fn()
      .mockReturnValueOnce(new Date("2026-08-25T10:50:00.000Z"))
      .mockReturnValueOnce(new Date("2026-08-25T10:51:00.000Z"))
      .mockReturnValueOnce(new Date("2026-08-25T11:01:00.000Z"));
    const baseAuthority = promoteOptions(fixture).verifyRehearsalAuthority();
    const verifyRehearsalAuthority = vi.fn(({ now, phase }: { now: Date; phase: string }) => {
      if (phase === "pre-lock" && now >= new Date("2026-08-25T11:00:00.000Z")) {
        throw new Error("frozen scratch receipt expired and inventory became stale before lock");
      }
      return baseAuthority;
    });

    await expect(promoteLocalMacProductionRelease({
      ...promoteOptions(fixture),
      clock,
      verifyRehearsalAuthority,
    } as Parameters<typeof promoteLocalMacProductionRelease>[0]))
      .rejects.toThrow(/^promotion_authority_source_changed: production promotion authority source changed\.$/u);
    expect(clock).toHaveBeenCalledTimes(3);
    expect(verifyRehearsalAuthority).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "pre-lock" }));
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
    expect(fixture.installBundle).toHaveBeenCalledTimes(0);
  });

  it("rejects external config or credential source substitution at the final pre-lock hook with mutation zero", async () => {
    const fixture = createFixture();
    let sourceChecks = 0;
    const verifyFrozenRuntimeInputs = vi.fn((value, options: { checkSources?: boolean } = {}) => {
      if (options.checkSources && ++sourceChecks === 2) {
        throw new Error("external runtime input source identity changed after freeze");
      }
      return value;
    });
    await expect(promoteLocalMacProductionRelease({
      ...promoteOptions(fixture),
      verifyFrozenRuntimeInputs,
    } as Parameters<typeof promoteLocalMacProductionRelease>[0]))
      .rejects.toThrow(/^promotion_authority_source_changed: production promotion authority source changed\.$/u);
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
    expect(fixture.installBundle).toHaveBeenCalledTimes(0);
    expect(fixture.readinessProbe).toHaveBeenCalledTimes(0);
  });

  it("rejects same-byte attestation inode substitution at the final pre-lock hook with mutation zero", async () => {
    const fixture = createFixture();
    const authorityRoot = createTempDirectory("homecook-attestation-source-");
    const authorityPath = join(authorityRoot, "bundle.jsonl");
    const authorityBytes = Buffer.from("attestation-authority\n");
    writeFileSync(authorityPath, authorityBytes, { mode: 0o600 });
    const authoritySnapshot = localRelease.readLocalMacProductionAuthorityInputSnapshot({
      label: "attestation_bundle",
      path: authorityPath,
      trustedRoot: authorityRoot,
    });
    const baseOptions = promoteOptions(fixture);
    let sourceChecks = 0;
    const freezeRuntimeInputs = vi.fn(async (input: { scratchRoot: string }) => ({
      ...(await baseOptions.freezeRuntimeInputs(input)),
      attestationSourceSnapshot: authoritySnapshot,
    }));
    const verifyFrozenRuntimeInputs = vi.fn((value: Record<string, unknown> & {
      attestationSourceSnapshot: typeof authoritySnapshot;
    }, options: { checkSources?: boolean } = {}) => {
      if (options.checkSources) {
        localRelease.verifyLocalMacProductionAuthorityInputSnapshot(
          value.attestationSourceSnapshot,
        );
        if (++sourceChecks === 1) {
          const replacement = join(authorityRoot, "replacement.jsonl");
          writeFileSync(replacement, authorityBytes, { mode: 0o600 });
          renameSync(replacement, authorityPath);
        }
      }
      return value;
    });

    await expect(promoteLocalMacProductionRelease({
      ...baseOptions,
      freezeRuntimeInputs,
      verifyFrozenRuntimeInputs,
    } as Parameters<typeof promoteLocalMacProductionRelease>[0]))
      .rejects.toThrow(/authority|identity|inode|changed/iu);
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it("sanitizes every post-freeze source validation failure before lock creation", async () => {
    const fixture = createFixture();
    const sourceRoot = createTempDirectory("homecook-sensitive-source-");
    const sourcePath = join(sourceRoot, "provider-secret.env");
    const secretValue = "provider-secret-value-that-must-not-escape";
    let sourceChecks = 0;
    const verifyFrozenRuntimeInputs = vi.fn((value, options: { checkSources?: boolean } = {}) => {
      if (options.checkSources && ++sourceChecks === 2) {
        throw new Error(`ENOENT lstat '${sourcePath}' containing ${secretValue}`);
      }
      return value;
    });

    let message = "";
    try {
      await promoteLocalMacProductionRelease({
        ...promoteOptions(fixture),
        verifyFrozenRuntimeInputs,
      } as Parameters<typeof promoteLocalMacProductionRelease>[0]);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe(
      "promotion_authority_source_changed: production promotion authority source changed.",
    );
    for (const prohibited of [
      sourceRoot,
      sourcePath,
      "provider-secret.env",
      secretValue,
      "ENOENT",
      "lstat",
    ]) expect(message).not.toContain(prohibited);
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it("rechecks a fresh clock at final-pre-mutation and expires before lock or install", async () => {
    const fixture = createFixture();
    const currentBefore = readFileSync(fixture.paths.currentDescriptorPath);
    const clock = vi.fn()
      .mockReturnValueOnce(new Date("2026-08-25T10:30:00.000Z"))
      .mockReturnValueOnce(new Date("2026-08-25T11:01:00.000Z"));
    const verifyRehearsalAuthority = vi.fn(({ now }: { now: Date }) => {
      if (now.getTime() >= Date.parse("2026-08-25T11:00:00.000Z")) {
        throw new Error("repeatability receipt expired before first mutation");
      }
      return {
        verified: true,
        authority_digest: "9".repeat(64),
        sealed_candidate: {
          root: fixture.releaseDir,
          appRoot: fixture.releaseDir,
          fullLocalRoot: null,
          workerRoot: fixture.workerRoot,
          workerManifestPath: fixture.workerManifestPath,
          candidateIdentityDigest: "a".repeat(64),
          bundleManifestDigest: "b".repeat(64),
          sealedBundleDigest: fixture.manifest.sealed_bundle_digest,
          repeatabilityReceiptDigest: fixture.manifest.repeatability_receipt_digest,
          appSourceDigest: fixture.sealedCandidateDigest,
          fullLocalSourceDigest: null,
          workerSourceDigest: localRelease.digestLocalMacProductionExecutionTree(fixture.workerRoot),
        },
      };
    });

    await expect(promoteLocalMacProductionRelease({
      ...promoteOptions(fixture),
      clock,
      expectedRehearsalAuthorityDigest: "9".repeat(64),
      now: new Date("2026-08-25T10:30:00.000Z"),
      verifyRehearsalAuthority,
    } as Parameters<typeof promoteLocalMacProductionRelease>[0]))
      .rejects.toThrow(/^promotion_authority_source_changed: production promotion authority source changed\.$/u);

    expect(clock).toHaveBeenCalledTimes(2);
    expect(fixture.preflightBundle).toHaveBeenCalledTimes(1);
    expect(fixture.installBundle).toHaveBeenCalledTimes(0);
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
    expect(readFileSync(fixture.paths.currentDescriptorPath)).toEqual(currentBefore);
  });

  it("rejects valid-to-valid authority substitution between initial and final with mutation zero", async () => {
    const fixture = createFixture();
    const initial = promoteOptions(fixture).verifyRehearsalAuthority();
    const substituted = {
      ...initial,
      authority_digest: "8".repeat(64),
      sealed_candidate: {
        ...initial.sealed_candidate,
        root: "/private/substituted-valid-candidate",
      },
    };
    const verifyRehearsalAuthority = vi.fn()
      .mockReturnValueOnce(initial)
      .mockReturnValueOnce(substituted);

    await expect(promoteLocalMacProductionRelease({
      ...promoteOptions(fixture),
      verifyRehearsalAuthority,
    } as Parameters<typeof promoteLocalMacProductionRelease>[0]))
      .rejects.toThrow(/^promotion_authority_source_changed: production promotion authority source changed\.$/u);

    expect(fixture.preflightBundle).toHaveBeenCalledTimes(1);
    expect(fixture.installBundle).toHaveBeenCalledTimes(0);
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
  });

  it.each([
    ["initial", 1],
    ["final-pre-mutation", 2],
    ["pre-lock", 3],
  ])("sanitizes raw promotion authority failures at %s with lock zero", async (_phase, failingCall) => {
    const fixture = createFixture();
    const baseOptions = promoteOptions(fixture);
    const authority = baseOptions.verifyRehearsalAuthority();
    const rawRoot = createTempDirectory("homecook-authority-raw-");
    const rawMarker = "RAW_AUTHORITY_ENOENT_EACCES_gh-stderr";
    let calls = 0;
    const verifyRehearsalAuthority = vi.fn(() => {
      calls += 1;
      if (calls === failingCall) {
        throw new Error(`${rawMarker} '${join(rawRoot, "repeatability-receipt.json")}'`);
      }
      return authority;
    });

    let message = "";
    try {
      await promoteLocalMacProductionRelease({
        ...baseOptions,
        verifyRehearsalAuthority,
      } as Parameters<typeof promoteLocalMacProductionRelease>[0]);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe(
      "promotion_authority_source_changed: production promotion authority source changed.",
    );
    for (const prohibited of [rawRoot, rawMarker, "repeatability-receipt.json", "ENOENT", "EACCES", "gh-stderr"]) {
      expect(message).not.toContain(prohibited);
    }
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });


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

  it("captures manifest authority with FD and ancestor identity and rejects same-byte replacement", () => {
    expect(localRelease).toHaveProperty(
      "readLocalMacProductionAuthorityInputSnapshot",
      expect.any(Function),
    );
    expect(localRelease).toHaveProperty(
      "verifyLocalMacProductionAuthorityInputSnapshot",
      expect.any(Function),
    );
    const trustedRoot = createTempDirectory("homecook-authority-input-");
    const path = join(trustedRoot, "release.json");
    const bytes = Buffer.from('{"authority":true}\n');
    writeFileSync(path, bytes, { mode: 0o600 });
    const snapshot = localRelease.readLocalMacProductionAuthorityInputSnapshot({
      label: "release_manifest",
      path,
      trustedRoot,
    });
    expect(snapshot).toMatchObject({
      bytes,
      mode: 0o600,
      nlink: 1,
      path: realpathSync(path),
    });
    expect(snapshot.ancestorIdentityDigest).toMatch(/^[0-9a-f]{64}$/u);

    const replacement = join(trustedRoot, "replacement.json");
    writeFileSync(replacement, bytes, { mode: 0o600 });
    renameSync(replacement, path);
    expect(() => localRelease.verifyLocalMacProductionAuthorityInputSnapshot(snapshot))
      .toThrow(/authority|identity|inode|changed/iu);
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

  it("derives worker rehearsal authority from the live process cwd instead of adapter expectations", () => {
    expect(localRelease).toHaveProperty(
      "readLocalMacProductionRuntimeRehearsalAuthority",
      expect.any(Function),
    );
    const snapshotRoot = createTempDirectory("homecook-worker-runtime-authority-");
    const workerRoot = join(snapshotRoot, "worker");
    mkdirSync(workerRoot, { mode: 0o500 });
    const observed = {
      sealed_bundle_digest: "a".repeat(64),
      repeatability_receipt_digest: "b".repeat(64),
    };
    writeFileSync(join(snapshotRoot, "evidence.json"), JSON.stringify(observed), {
      mode: 0o400,
    });
    const runCommand = vi.fn(() => ({
      status: 0,
      stdout: `p5151\nfcwd\nn${workerRoot}\n`,
      stderr: "",
    })) as unknown as typeof import("node:child_process").spawnSync;

    expect(localRelease.readLocalMacProductionRuntimeRehearsalAuthority({
      component: "youtube_worker",
      expectedRuntimeDir: workerRoot,
      pid: 5151,
      runCommand,
    })).toEqual(observed);

    chmodSync(join(snapshotRoot, "evidence.json"), 0o600);
    writeFileSync(join(snapshotRoot, "evidence.json"), JSON.stringify({
      ...observed,
      repeatability_receipt_digest: "c".repeat(64),
    }), { mode: 0o400 });
    chmodSync(join(snapshotRoot, "evidence.json"), 0o400);
    expect(localRelease.readLocalMacProductionRuntimeRehearsalAuthority({
      component: "youtube_worker",
      expectedRuntimeDir: workerRoot,
      pid: 5151,
      runCommand,
    })).toEqual({
      ...observed,
      repeatability_receipt_digest: "c".repeat(64),
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
      .rejects.toThrow(/sealed|candidate|authority|ENOENT|does not exist/iu);
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
    fixture.sealedCandidateDigest = localRelease.digestLocalMacProductionExecutionTree(fixture.releaseDir);
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
        full_local_config_sha256: "1".repeat(64),
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
          fullLocalConfigSha256: "1".repeat(64),
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
      .rejects.toThrow(/^promotion_authority_source_changed: production promotion authority source changed\.$/u);
    expect(existsSync(fixture.paths.previousDescriptorPath)).toBe(false);
  });

  it("rejects a partial candidate without a completed prepare marker and preserves it", async () => {
    const fixture = createFixture();
    rmSync(join(fixture.releaseDir, "prepare.json"));

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/prepare.*marker|partial|prepare\.json|sealed|authority/iu);
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
      .rejects.toThrow(/^promotion_authority_source_changed: production promotion authority source changed\.$/u);
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
    void message;
    const fixture = createFixture();
    const path = join(fixture.releaseDir, "prepare.json");
    const value = JSON.parse(readFileSync(path, "utf8"));
    writeFileSync(path, JSON.stringify(mutate(value), null, 2), { mode: 0o600 });

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/authority|sealed|status|prepared|digest|sha|tree|build/iu);
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
      .rejects.toThrow(/manifest|digest|authority|sealed/iu);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it.each(["HEAD", "HEAD^{tree}"])("does not consume rebuilt checkout %s when sealed candidate authority is valid", async (ref) => {
    const fixture = createFixture();
    fixture.runCommandMock.mockImplementation((command: string, args: readonly string[] = []) => (
      args.join(" ") === `rev-parse ${ref}`
        ? { status: 0, stdout: `${"0".repeat(40)}\n`, stderr: "" }
        : createFixtureCommandResult(fixture, command, args)
    ));

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .resolves.toMatchObject({ promoted: true });
    expect(fixture.installBundle).toHaveBeenCalledTimes(1);
  });

  it("rejects checked-out build ID drift", async () => {
    const fixture = createFixture();
    writeFileSync(join(fixture.releaseDir, ".next", "BUILD_ID"), "wrong-build\n");

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/build.*id|authority|sealed/iu);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it("rejects a build path that escapes the immutable candidate through a symlink", async () => {
    const fixture = createFixture();
    const externalBuild = createTempDirectory("homecook-promote-external-build-");
    writeFileSync(join(externalBuild, "BUILD_ID"), `${fixture.manifest.build_id}\n`);
    rmSync(join(fixture.releaseDir, ".next"), { recursive: true, force: true });
    symlinkSync(externalBuild, join(fixture.releaseDir, ".next"));

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/symlink|escape|candidate|build|authority|sealed/iu);
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
      .rejects.toThrow(/^promotion_authority_source_changed: production promotion authority source changed\.$/u);
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
      .rejects.toThrow(/^promotion_authority_source_changed: production promotion authority source changed\.$/u);
    expect(existsSync(fixture.paths.lockPath)).toBe(true);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it("rejects a symlink promotion lock root without writing through it", async () => {
    const fixture = createFixture();
    const externalLockRoot = createTempDirectory("homecook-promote-external-lock-");
    symlinkSync(externalLockRoot, fixture.paths.lockRoot);

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/^promotion_authority_source_changed: production promotion authority source changed\.$/u);
    expect(existsSync(join(externalLockRoot, "production-promotion.lock"))).toBe(false);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it("rejects current running descriptor drift before installing", async () => {
    const fixture = createFixture();
    writeFileSync(fixture.paths.currentDescriptorPath, JSON.stringify(createRunningDescriptor({
      release_sha: "1".repeat(40),
    }), null, 2), { mode: 0o600 });

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/^promotion_authority_source_changed: production promotion authority source changed\.$/u);
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
    const scratchParent = join(dirname(fixture.paths.releaseRoot), "rehearsal", "promotion-scratch");
    expect(readdirSync(scratchParent)).toHaveLength(1);
  });

  it("blocks a current runtime preflight failure before any install helper", async () => {
    const fixture = createFixture();
    fixture.preflightBundle.mockRejectedValueOnce(new Error("current runtime drift"));

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/^promotion_authority_source_changed: production promotion authority source changed\.$/u);
    expect(fixture.installBundle).not.toHaveBeenCalled();
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
  });

  it("never rereads external runtime preflight after the frozen scratch is sealed", async () => {
    const fixture = createFixture();
    fixture.preflightBundle
      .mockResolvedValueOnce({
        full_local_config_sha256: "1".repeat(64),
        stable_key: "runtime-a",
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
          fullLocalConfigSha256: "1".repeat(64),
        },
      })
      .mockRejectedValueOnce(new Error("external preflight was reread after scratch sealing"));

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .resolves.toMatchObject({ promoted: true });
    expect(fixture.preflightBundle).toHaveBeenCalledTimes(1);
    expect(fixture.installBundle).toHaveBeenCalledTimes(1);
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

  it.each(["app", "full_local", "youtube_worker"])(
    "rejects %s readiness when observed rehearsal digests are missing despite a valid manifest",
    async (component) => {
      const fixture = createFixture();
      const currentBefore = readFileSync(fixture.paths.currentDescriptorPath);
      const bundle = createReadyBundle(fixture.manifest);
      delete (bundle[component as keyof typeof bundle] as Record<string, unknown>).sealed_bundle_digest;
      delete (bundle[component as keyof typeof bundle] as Record<string, unknown>).repeatability_receipt_digest;
      fixture.readinessProbe.mockResolvedValueOnce(bundle);
      await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
        .rejects.toThrow(/rehearsal|sealed|repeatability|identity|readiness/iu);
      expect(readFileSync(fixture.paths.currentDescriptorPath)).toEqual(currentBefore);
      expect(existsSync(fixture.paths.previousDescriptorPath)).toBe(false);
    },
  );

  it("rejects cross-component observed rehearsal digest mismatch before descriptor commit", async () => {
    const fixture = createFixture();
    const currentBefore = readFileSync(fixture.paths.currentDescriptorPath);
    const bundle = createReadyBundle(fixture.manifest);
    bundle.full_local = {
      ...bundle.full_local,
      sealed_bundle_digest: "0".repeat(64),
      repeatability_receipt_digest: fixture.manifest.repeatability_receipt_digest,
    };
    fixture.readinessProbe.mockResolvedValueOnce(bundle);
    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/sealed|repeatability|identity|readiness/iu);
    expect(readFileSync(fixture.paths.currentDescriptorPath)).toEqual(currentBefore);
    expect(existsSync(fixture.paths.previousDescriptorPath)).toBe(false);
  });

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

  it("consumes only frozen scratch bytes when the candidate mutates while the production lock is acquired", async () => {
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
    })).resolves.toMatchObject({ promoted: true });
    expect(fixture.installBundle).toHaveBeenCalledTimes(1);
  });

  it("never reopens original manifest or attestation authority after the production lock", async () => {
    const fixture = createFixture();
    const originalManifest = readFileSync(fixture.manifestPath);
    const verifyAttestation = vi.fn(() => {
      if (existsSync(fixture.paths.lockPath)) throw new Error("forbidden post-lock attestation source open");
      return VERIFIED_ATTESTATION();
    });
    const mkdir = vi.fn((path: Parameters<typeof mkdirSync>[0], options?: Parameters<typeof mkdirSync>[1]) => {
      const result = mkdirSync(path, options);
      if (String(path).endsWith("/production-promotion.lock")) {
        writeFileSync(fixture.manifestPath, Buffer.from(originalManifest.toString("utf8").replace("backup-20260825-01", "backup-20260825-02")), { mode: 0o600 });
      }
      return result;
    }) as typeof mkdirSync;
    await expect(promoteLocalMacProductionRelease({
      ...promoteOptions(fixture),
      mkdir,
      verifyAttestation,
    } as Parameters<typeof promoteLocalMacProductionRelease>[0]))
      .resolves.toMatchObject({ promoted: true });
    expect(verifyAttestation.mock.calls.every(() => true)).toBe(true);
    expect(fixture.installBundle).toHaveBeenCalledTimes(1);
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
    fixture.sealedCandidateDigest = localRelease.digestLocalMacProductionExecutionTree(fixture.releaseDir);
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
      .rejects.toThrow(/^promotion_authority_source_changed: production promotion authority source changed\.$/u);
    expect(fixture.installBundle).not.toHaveBeenCalled();
  });

  it("keeps a relative internal symlink contained inside the sealed snapshot", async () => {
    const fixture = createFixture();
    writeFileSync(join(fixture.releaseDir, "relative-target.txt"), "relative\n", { mode: 0o600 });
    symlinkSync("relative-target.txt", join(fixture.releaseDir, "relative-link.txt"));
    fixture.sealedCandidateDigest = localRelease.digestLocalMacProductionExecutionTree(fixture.releaseDir);
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
      .rejects.toThrow(/^promotion_authority_source_changed: production promotion authority source changed\.$/u);
    expect(fixture.installBundle).not.toHaveBeenCalled();
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
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
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
    expect(readFileSync(sourcePath)).toEqual(original);
  });

  it("rejects a candidate symlink that targets contained .git metadata", async () => {
    const fixture = createFixture();
    const gitTarget = join(fixture.releaseDir, ".git", "metadata.txt");
    writeFileSync(gitTarget, "git-metadata\n", { mode: 0o600 });
    symlinkSync(gitTarget, join(fixture.releaseDir, "git-link.txt"));

    await expect(promoteLocalMacProductionRelease(promoteOptions(fixture)))
      .rejects.toThrow(/^promotion_authority_source_changed: production promotion authority source changed\.$/u);
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
      readiness: {
        app: {
          sealed_bundle_digest: fixture.manifest.sealed_bundle_digest,
          repeatability_receipt_digest: fixture.manifest.repeatability_receipt_digest,
        },
        full_local: {
          sealed_bundle_digest: fixture.manifest.sealed_bundle_digest,
          repeatability_receipt_digest: fixture.manifest.repeatability_receipt_digest,
        },
        youtube_worker: {
          sealed_bundle_digest: fixture.manifest.sealed_bundle_digest,
          repeatability_receipt_digest: fixture.manifest.repeatability_receipt_digest,
        },
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
      full_local_config_sha256: "1".repeat(64),
      source_manifest_sha256: sha256(fixture.manifestBytes),
      sealed_bundle_digest: fixture.manifest.sealed_bundle_digest,
      repeatability_receipt_digest: fixture.manifest.repeatability_receipt_digest,
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
    expect(fixture.preflightBundle).toHaveBeenCalledTimes(1);
    expect(fixture.readinessProbe).toHaveBeenCalledTimes(1);
    expect(existsSync(fixture.paths.lockPath)).toBe(false);
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
