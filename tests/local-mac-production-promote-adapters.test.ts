import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  allowFirstCanonicalAdoptionWorkerPlist,
  allowFirstCanonicalAdoptionWorkerStandby,
  buildWorkerRuntimeStableProjection,
  buildFullLocalWorkloadStableDigest,
  waitForFullLocalCandidateIdentity,
  createLocalMacProductionPromoteAdapters,
} from "../scripts/lib/local-mac-production-promote-adapters.mjs";
import * as promoteAdapters from "../scripts/lib/local-mac-production-promote-adapters.mjs";
import { renderLocalMacProductionPlist } from "../scripts/lib/local-mac-production.mjs";
import { renderFullLocalLaunchAgentPlist } from "../scripts/lib/full-local-launch-agent.mjs";
import {
  buildYoutubeExtractionAppDescriptor,
  buildYoutubeExtractionCurrentPolicy,
  materializeYoutubeExtractionWorkerArtifact,
  YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
} from "../scripts/lib/youtube-extraction-worker-artifact.mjs";
import {
  buildYoutubeExtractionWorkerCredentialState,
  renderYoutubeExtractionWorkerPlist,
  writeCredentialMetadata,
} from "../scripts/lib/youtube-extraction-worker-ops.mjs";
import {
  buildGitHubProductionReleaseAttestationArtifacts,
  buildProductionReleaseAnnotatedTagMessage,
  GITHUB_PRODUCTION_RELEASE_PREDICATE_TYPE_V2,
} from "../scripts/lib/github-production-release-attestation.mjs";
import { acquireLocalMacProductionPromotionLock } from "../scripts/lib/local-mac-production-release.mjs";
import {
  createLocalMacProductionGitEvidence,
  createLocalMacProductionReleaseManifest,
  VERIFIED_ATTESTATION,
} from "./helpers/local-mac-production-release-fixtures";

const RELEASE_IDENTITY = Object.freeze({
  release_sha: "a".repeat(40),
  release_tree: "b".repeat(40),
  build_id: "build-promote",
  promotion_id: "promotion-release",
});
const CURRENT_IDENTITY = Object.freeze({
  release_sha: "c".repeat(40),
  release_tree: "d".repeat(40),
  build_id: "build-current",
  promotion_id: "promotion-current",
});
const FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA =
  "3bdd814da8f9849805185d1b3be5a6ee703133a0";
const FIRST_CANONICAL_ADOPTION_FULL_LOCAL_SOURCE_SHA =
  "36e7aecfe429875f2dc12f3effc020ab1296a818";
const FIRST_CANONICAL_ADOPTION_APP_ROOT =
  "/Users/tester/01_vibe_coding/homecook-production-current";
const FIRST_CANONICAL_ADOPTION_FULL_LOCAL_ROOT =
  "/Users/tester/01_vibe_coding/homecook-session-refresh-storm-deploy-v9";
const FIRST_CANONICAL_ADOPTION_WORKER_ROOT =
  "/Users/tester/.homecook/youtube-extraction-releases/3bdd814da8f9849805185d1b3be5a6ee703133a0-admin-acl-v1";
const FIRST_CANONICAL_ADOPTION_WORKER_MANIFEST =
  "/Users/tester/.homecook/youtube-extraction-releases/3bdd814da8f9849805185d1b3be5a6ee703133a0-admin-acl-v1/artifact.json";
const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()!;
    makeTemporaryTreeRemovable(directory);
    rmSync(directory, { recursive: true, force: true });
  }
});

function makeTemporaryTreeRemovable(path: string) {
  if (!existsSync(path)) return;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory()) makeTemporaryTreeRemovable(join(path, entry.name));
  }
  chmodSync(path, 0o700);
}

function createOptions(overrides: Record<string, unknown> = {}) {
  return {
    confirmation: "LOCAL_FULL_PRODUCTION_WORKER_INSTALL",
    bundlePath: "/private/attestation/bundle.jsonl",
    fullLocalConfigPath: "/private/full-local.env",
    homeDir: "/Users/tester",
    nodeBin: "/usr/bin/node",
    subjectManifestPath: "/private/attestation/subject.json",
    trustedRootPath: "/private/attestation/trusted-root.jsonl",
    workerAppDescriptorPath: "/private/worker/app.json",
    workerConfigPath: "/private/worker/worker.env",
    workerCredentialPath: "/private/worker/credential.json",
    workerExpectedSchemaPath: "/private/worker/scripts/manifests/schema.json",
    workerManifestPath: "/private/worker/worker-artifact.json",
    workerPolicyPath: "/private/worker/policy.json",
    workerSecretRoot: "/private/worker-secrets",
    ...overrides,
  };
}

function createDependencies(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const dependencies = {
    validateMutationTargets: vi.fn(() => calls.push("validate-targets")),
    readWorkerReleasePreflight: vi.fn(async () => {
      calls.push("worker-preflight");
      return {
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
        fullLocalConfigSha256: "1".repeat(64),
        i031Preflight: { ready: true },
        preflight: {
          ready: true,
          ...RELEASE_IDENTITY,
          promotion_id: "promotion-release",
        },
        userId: 501,
      };
    }),
    readCurrentRuntimeBundle: vi.fn(async () => {
      calls.push("current-runtime");
      return {
        stable_key: "current-runtime-stable",
        app: { ...CURRENT_IDENTITY, ready: true },
        full_local: { ...CURRENT_IDENTITY, ready: true },
        youtube_worker: { ...CURRENT_IDENTITY, ready: true },
      };
    }),
    readFullLocalConfigEvidence: vi.fn(() => ({
      digest: "1".repeat(64),
      path: "/private/full-local.env",
    })),
    installFullLocal: vi.fn(() => {
      calls.push("install-full-local");
      return { changed: true };
    }),
    startFullLocal: vi.fn(() => {
      calls.push("start-full-local");
      return { started: true };
    }),
    confirmFullLocalCandidate: vi.fn(async () => {
      calls.push("confirm-full-local-candidate");
      return {
        ...RELEASE_IDENTITY,
        ready: true,
        runtime_present: true,
        healthy: true,
        authorization_contract_status: "PASS",
        product_catalog_status: "PASS",
      };
    }),
    installApp: vi.fn(() => {
      calls.push("install-app");
      return { changed: true };
    }),
    installWorker: vi.fn(() => {
      calls.push("install-worker");
      return { changed: true, service_target: "gui/501/worker" };
    }),
    readAppRuntimeIdentity: vi.fn(async () => {
      calls.push("ready-app");
      return { ...RELEASE_IDENTITY, ready: true };
    }),
    readFullLocalWorkloadIdentity: vi.fn(async () => {
      calls.push("ready-full-local-workload");
      return {
        ...RELEASE_IDENTITY,
        ready: true,
        runtime_present: true,
        healthy: true,
        authorization_contract_status: "PASS",
        product_catalog_status: "PASS",
      };
    }),
    readWorkerRuntimeIdentity: vi.fn(async () => {
      calls.push("ready-worker");
      return { ...RELEASE_IDENTITY, ready: true };
    }),
    ...overrides,
  };
  return { calls, dependencies };
}

function createFrozenRuntimeInputsFixture(fullLocalConfigBytes: Buffer | string = "FULL_LOCAL_CONFIG=fixture\n") {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "homecook-adapter-frozen-inputs-")));
  temporaryDirectories.push(root);
  const scratchRoot = join(root, "scratch");
  const secretRoot = join(root, "secrets");
  mkdirSync(scratchRoot, { mode: 0o700 });
  mkdirSync(secretRoot, { mode: 0o700 });
  const fullLocalConfigPath = join(root, "full-local.env");
  const workerConfigPath = join(secretRoot, "worker.env");
  const workerCredentialPath = join(secretRoot, "credential.json");
  const tokenPath = join(secretRoot, "worker.jwt");
  writeFileSync(fullLocalConfigPath, fullLocalConfigBytes, { mode: 0o600 });
  writeFileSync(workerConfigPath, `TOKEN_FILE=${tokenPath}\n`, { mode: 0o600 });
  writeFileSync(workerCredentialPath, JSON.stringify({ token_file: tokenPath }), { mode: 0o600 });
  writeFileSync(tokenPath, "token\n", { mode: 0o600 });
  const digest = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
  return promoteAdapters.freezeLocalMacProductionRuntimeInputs({
    options: { fullLocalConfigPath },
    preflight: {
      full_local_config_sha256: digest(fullLocalConfigPath),
      worker: {
        configPath: workerConfigPath,
        credentialPath: workerCredentialPath,
        secretRoot,
        configSha256: digest(workerConfigPath),
        credentialSha256: digest(workerCredentialPath),
      },
    },
    scratchRoot,
  });
}

function createContext(overrides: Record<string, unknown> = {}) {
  const executionSnapshot = { schema: "fixture-snapshot", appRoot: "/sealed/app" };
  return {
    currentDescriptor: {
      ...CURRENT_IDENTITY,
      release_tag: "prod-20260824.1",
      execution_app_root: "/private/current-execution/app",
      execution_snapshot_digest: "8".repeat(64),
      worker_artifact_root: "/private/current-worker-authority",
      worker_manifest_path: "/private/current-worker-authority/artifact.json",
      worker_artifact_sha256: "7".repeat(64),
      worker_app_descriptor_sha256: "6".repeat(64),
      worker_config_sha256: "5".repeat(64),
      worker_credential_sha256: "4".repeat(64),
      worker_expected_schema_sha256: "3".repeat(64),
      worker_policy_sha256: "2".repeat(64),
    },
    currentReleaseDir: "/Users/tester/.homecook/releases/prod-20260824.1",
    homeDir: "/Users/tester",
    manifest: { ...RELEASE_IDENTITY },
    mutationAuthority: { required: true },
    frozenRuntimeInputs: createFrozenRuntimeInputsFixture(),
    executionSnapshot,
    verifyExecutionSnapshot: vi.fn(() => executionSnapshot),
    releaseDir: "/Users/tester/.homecook/releases/prod-20260825.1",
    rootDir: "/repo",
    ...overrides,
  };
}

function createDefaultWorkerPreflightFixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "homecook-default-worker-preflight-")));
  temporaryDirectories.push(root);
  const homeDir = join(root, "home");
  const secretRoot = join(root, "worker-secrets");
  const releaseDir = join(root, "app-candidate");
  const artifactRoot = join(root, "worker-artifact");
  mkdirSync(homeDir, { mode: 0o700 });
  mkdirSync(secretRoot, { mode: 0o700 });
  mkdirSync(releaseDir, { mode: 0o700 });

  const snapshotDigest = "e".repeat(64);
  const materialized = materializeYoutubeExtractionWorkerArtifact({
    rootDir: process.cwd(),
    outputDir: artifactRoot,
    releaseSha: RELEASE_IDENTITY.release_sha,
    releaseTree: RELEASE_IDENTITY.release_tree,
    buildId: RELEASE_IDENTITY.build_id,
    promotionId: RELEASE_IDENTITY.promotion_id,
    schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
    allowedSnapshotDigest: snapshotDigest,
  });
  const appDescriptorPath = join(root, "app-descriptor.json");
  const policyPath = join(root, "policy.json");
  const tokenPath = join(secretRoot, "worker.jwt");
  const credentialPath = join(secretRoot, "credential.json");
  const providerSecretPath = join(secretRoot, "provider.env");
  const configPath = join(secretRoot, "worker.env");
  const fullLocalConfigPath = join(homeDir, ".homecook/config/full-local-production.env");
  mkdirSync(dirname(fullLocalConfigPath), { recursive: true, mode: 0o700 });
  writeFileSync(fullLocalConfigPath, "FULL_LOCAL_CONFIG=fixture\n", { mode: 0o600 });
  writeFileSync(tokenPath, "worker-token\n", { mode: 0o600 });
  writeFileSync(providerSecretPath, "YOUTUBE_API_KEY=test-key\n", { mode: 0o600 });
  writeFileSync(
    configPath,
    `HOMECOOK_YOUTUBE_WORKER_PROVIDER_SECRET_FILE=${providerSecretPath}\n`,
    { mode: 0o600 },
  );
  writeFileSync(appDescriptorPath, JSON.stringify(buildYoutubeExtractionAppDescriptor({
    releaseSha: RELEASE_IDENTITY.release_sha,
    schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
    expectedPolicyVersion: 1,
    expectedPolicySnapshotDigest: snapshotDigest,
    artifactSha256: materialized.manifest.artifact_sha256,
    expectedSchemaSha256: materialized.manifest.expected_schema_sha256,
  })), { mode: 0o600 });
  writeFileSync(policyPath, JSON.stringify(buildYoutubeExtractionCurrentPolicy({
    policySnapshotDigest: snapshotDigest,
    enabled: true,
  })), { mode: 0o600 });
  writeCredentialMetadata(
    credentialPath,
    buildYoutubeExtractionWorkerCredentialState({
      tokenFile: tokenPath,
      generation: 1,
      jtiHash: "f".repeat(64),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      releaseSha: RELEASE_IDENTITY.release_sha,
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      allowedSnapshotDigest: snapshotDigest,
      secretRoot,
    }),
    { secretRoot },
  );

  return {
    context: createContext({ homeDir, releaseDir }),
    options: createOptions({
      fullLocalConfigPath,
      homeDir,
      workerAppDescriptorPath: appDescriptorPath,
      workerConfigPath: configPath,
      workerCredentialPath: credentialPath,
      workerExpectedSchemaPath: join(
        artifactRoot,
        "scripts/manifests/youtube-extraction-expected-schema.json",
      ),
      workerManifestPath: materialized.manifest_path,
      workerPolicyPath: policyPath,
      workerSecretRoot: secretRoot,
    }),
    policyPath,
  };
}

describe("local Mac production promote adapters", () => {
  it("distinguishes exact abac v1 start plists from resume-capable descriptors", () => {
    const sealedV1Descriptor = {
      ...createContext().currentDescriptor,
      schema: "homecook.local-mac-production-running-release.v1",
      promoted_at: "2026-08-24T09:00:00.000Z",
      source_manifest_sha256: "9".repeat(64),
    };
    expect(promoteAdapters.resolveFullLocalCurrentRestartContract(
      sealedV1Descriptor,
    )).toEqual({
      includeReleaseIdentity: true,
      legacyContract: "abac967-full-local-start-v1",
      runtimeCommand: "start",
    });
    expect(promoteAdapters.resolveFullLocalCurrentRestartContract({
      release_sha: CURRENT_IDENTITY.release_sha,
      restart_capability: "full-local-resume-current-v1",
    })).toEqual({
      includeReleaseIdentity: false,
      legacyContract: null,
      runtimeCommand: "resume-current",
    });
    expect(() => promoteAdapters.resolveFullLocalCurrentRestartContract({
      release_sha: CURRENT_IDENTITY.release_sha,
      restart_capability: "unknown",
    })).toThrow(/restart capability|unknown|unsupported/iu);
    expect(() => promoteAdapters.resolveFullLocalCurrentRestartContract({
      release_sha: CURRENT_IDENTITY.release_sha,
    })).toThrow(/sealed|legacy|descriptor|incomplete/iu);
  });

  it("provides an importable adapter composition module", () => {
    expect(existsSync(join(
      process.cwd(),
      "scripts/lib/local-mac-production-promote-adapters.mjs",
    ))).toBe(true);
    expect(promoteAdapters).toHaveProperty(
      "assertCanonicalLocalMacProductionPlist",
      expect.any(Function),
    );
    expect(promoteAdapters).toHaveProperty(
      "buildCanonicalCurrentYoutubeWorkerPlist",
      expect.any(Function),
    );
  });

  it("uses one-shot full-local Docker workload health without requiring a starter PID", async () => {
    const { calls, dependencies } = createDependencies();
    const adapters = createLocalMacProductionPromoteAdapters(createOptions(), dependencies);
    const context = createContext();
    const preflight = await adapters.preflightBundle(context);

    const readiness = await adapters.readinessProbe({ ...context, preflight });

    expect(readiness.full_local).toMatchObject({
      ...RELEASE_IDENTITY,
      ready: true,
      runtime_present: true,
      healthy: true,
    });
    expect(calls).toContain("ready-full-local-workload");
    expect(calls).not.toContain("read-full-local-starter-pid");
    expect(dependencies.readWorkerRuntimeIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ requirePolicyEnabled: false }),
    );
    await adapters.finalWorkerProbe({ ...context, preflight });
    expect(dependencies.readWorkerRuntimeIdentity).toHaveBeenLastCalledWith(
      expect.objectContaining({ requirePolicyEnabled: true }),
    );
  });

  it("runs the default worker release preflight from the explicit candidate authority paths", async () => {
    const fixture = createDefaultWorkerPreflightFixture();
    const readCurrentRuntimeBundle = vi.fn(async () => ({
      stable_key: "current-runtime-stable",
      app: { ...CURRENT_IDENTITY, ready: true },
      full_local: { ...CURRENT_IDENTITY, ready: true },
      youtube_worker: { ...CURRENT_IDENTITY, ready: true },
    }));
    const adapters = createLocalMacProductionPromoteAdapters(fixture.options, {
      validateMutationTargets: vi.fn(),
      readCurrentRuntimeBundle,
      i031PreflightVerifier: vi.fn(async () => ({
        codexCliVersion: "0.144.0-alpha.4",
      })),
    });

    const preflight = await adapters.preflightBundle(fixture.context);

    expect(preflight.worker.preflight.ready).toBe(true);
    expect(preflight.worker.policyPath).toBe(realpathSync(fixture.policyPath));
    expect(readCurrentRuntimeBundle).toHaveBeenCalledOnce();
  });

  it("freezes every external runtime config and secret input before installation", async () => {
    const fixture = createDefaultWorkerPreflightFixture();
    const adapters = createLocalMacProductionPromoteAdapters(fixture.options, {
      validateMutationTargets: vi.fn(),
      readCurrentRuntimeBundle: vi.fn(async () => ({
        stable_key: "current-runtime-stable",
        app: { ...CURRENT_IDENTITY, ready: true },
        full_local: { ...CURRENT_IDENTITY, ready: true },
        youtube_worker: { ...CURRENT_IDENTITY, ready: true },
      })),
      i031PreflightVerifier: vi.fn(async () => ({ codexCliVersion: "0.144.0-alpha.4" })),
    });
    const preflight = await adapters.preflightBundle(fixture.context);
    const scratchRoot = realpathSync(mkdtempSync(join(tmpdir(), "homecook-frozen-runtime-inputs-")));
    temporaryDirectories.push(scratchRoot);

    expect(adapters).toHaveProperty("freezeRuntimeInputs", expect.any(Function));
    expect(adapters).toHaveProperty("verifyFrozenRuntimeInputs", expect.any(Function));
    const frozen = await adapters.freezeRuntimeInputs({ scratchRoot, preflight });
    expect(adapters.verifyFrozenRuntimeInputs(frozen)).toBe(frozen);
    expect(Object.values(frozen.paths).every((path) => realpathSync(String(path)).startsWith(`${scratchRoot}/`))).toBe(true);

    const originalConfig = readFileSync(String(fixture.options.workerConfigPath));
    const originalCredential = readFileSync(String(fixture.options.workerCredentialPath));
    writeFileSync(String(fixture.options.workerConfigPath), "HOMECOOK_YOUTUBE_WORKER_PROVIDER_SECRET_FILE=/private/substituted.env\n", { mode: 0o600 });
    writeFileSync(String(fixture.options.workerCredentialPath), JSON.stringify({ substituted: true }), { mode: 0o600 });
    expect(() => adapters.verifyFrozenRuntimeInputs(frozen)).toThrow(/source|identity|changed/iu);
    writeFileSync(String(fixture.options.workerConfigPath), originalConfig, { mode: 0o600 });
    writeFileSync(String(fixture.options.workerCredentialPath), originalCredential, { mode: 0o600 });
    expect(() => adapters.verifyFrozenRuntimeInputs(frozen)).toThrow(/source|identity|changed/iu);

    const refreezeRoot = realpathSync(mkdtempSync(join(tmpdir(), "homecook-refrozen-runtime-inputs-")));
    temporaryDirectories.push(refreezeRoot);
    const refrozen = await adapters.freezeRuntimeInputs({ scratchRoot: refreezeRoot, preflight });

    const created = createDependencies();
    const installAdapters = createLocalMacProductionPromoteAdapters(fixture.options, created.dependencies);
    await installAdapters.installBundle({
      ...createContext({ frozenRuntimeInputs: refrozen }),
      preflight,
    });
    expect(created.dependencies.installFullLocal).toHaveBeenCalledWith(expect.objectContaining({
      configPath: refrozen.paths.fullLocalConfigPath,
    }));
    expect(created.dependencies.installWorker).toHaveBeenCalledWith(expect.objectContaining({
      configPath: refrozen.paths.workerConfigPath,
      credentialPath: refrozen.paths.workerCredentialPath,
      secretRoot: refrozen.paths.workerSecretRoot,
    }));
    expect(installAdapters.cleanupFrozenRuntimeInputs(refrozen)).toMatchObject({ cleaned: true });
    expect(existsSync(refrozen.root)).toBe(false);
    expect(adapters.cleanupFrozenRuntimeInputs(frozen)).toMatchObject({ cleaned: true });
  });

  it("installs the worker from its separately attested artifact root", async () => {
    const { calls, dependencies } = createDependencies();
    const adapters = createLocalMacProductionPromoteAdapters(createOptions(), dependencies);
    const context = createContext();
    const preflight = await adapters.preflightBundle(context);

    await adapters.installBundle({ ...context, preflight });

    expect(dependencies.installFullLocal).toHaveBeenCalledWith(expect.objectContaining({
      currentDescriptorPath: "/Users/tester/.homecook/releases/current.json",
      rootDir: context.releaseDir,
      runtimeCommand: "resume-current",
    }));
    expect(dependencies.installApp).toHaveBeenCalledWith(expect.objectContaining({
      rootDir: context.releaseDir,
    }));
    expect(dependencies.installWorker).toHaveBeenCalledWith(expect.objectContaining({
      rootDir: "/private/worker",
    }));
    expect(dependencies.installWorker).not.toHaveBeenCalledWith(expect.objectContaining({
      rootDir: context.releaseDir,
    }));
    expect(calls.indexOf("worker-preflight")).toBeLessThan(calls.indexOf("install-full-local"));
    expect(calls.indexOf("worker-preflight")).toBeLessThan(calls.indexOf("install-app"));
    expect(calls.indexOf("start-full-local")).toBeLessThan(calls.indexOf("install-app"));
    expect(calls.indexOf("confirm-full-local-candidate")).toBeLessThan(
      calls.indexOf("install-app"),
    );
    expect(context.verifyExecutionSnapshot).toHaveBeenCalledTimes(5);
  });

  it("fails closed when the first canonical adoption bridge sees an unexpected full-local source SHA", async () => {
    const { dependencies } = createDependencies({
      readCurrentRuntimeBundle: vi.fn(async () => ({
        stable_key: "bridge-runtime-stable",
        app: { ...CURRENT_IDENTITY, release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA, ready: true },
        full_local: {
          ...CURRENT_IDENTITY,
          authorization_contract_status: "PASS",
          healthy: true,
          product_catalog_status: "PASS",
          ready: true,
          release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA,
          runtime_present: true,
        },
        youtube_worker: {
          ...CURRENT_IDENTITY,
          release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA,
          ready: true,
        },
        bridge: {
          app_release_dir: FIRST_CANONICAL_ADOPTION_APP_ROOT,
          full_local_root: FIRST_CANONICAL_ADOPTION_FULL_LOCAL_ROOT,
          full_local_source_sha: "0".repeat(40),
          mode: "first-canonical-adoption-v1",
          worker_artifact_root: FIRST_CANONICAL_ADOPTION_WORKER_ROOT,
          worker_manifest_path: FIRST_CANONICAL_ADOPTION_WORKER_MANIFEST,
        },
      })),
    });
    const adapters = createLocalMacProductionPromoteAdapters(createOptions(), dependencies);
    const context = createContext({
      currentDescriptor: null,
      currentReleaseDir: null,
      currentRuntimeBridge: {
        full_local_source_sha: FIRST_CANONICAL_ADOPTION_FULL_LOCAL_SOURCE_SHA,
        mode: "first-canonical-adoption-v1",
        previous_release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA,
      },
    });

    await expect(adapters.preflightBundle(context))
      .rejects.toThrow(/full-local.*source.*sha|first canonical adoption|bridge/iu);
  });

  it("fails closed when the first canonical adoption bridge sees an unexpected app root", async () => {
    const { dependencies } = createDependencies({
      readCurrentRuntimeBundle: vi.fn(async () => ({
        stable_key: "bridge-runtime-stable",
        app: { ...CURRENT_IDENTITY, release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA, ready: true },
        full_local: {
          ...CURRENT_IDENTITY,
          authorization_contract_status: "PASS",
          healthy: true,
          product_catalog_status: "PASS",
          ready: true,
          release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA,
          runtime_present: true,
        },
        youtube_worker: {
          ...CURRENT_IDENTITY,
          release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA,
          ready: true,
        },
        bridge: {
          app_release_dir: "/Users/tester/01_vibe_coding/wrong-app-root",
          full_local_root: FIRST_CANONICAL_ADOPTION_FULL_LOCAL_ROOT,
          full_local_source_sha: FIRST_CANONICAL_ADOPTION_FULL_LOCAL_SOURCE_SHA,
          mode: "first-canonical-adoption-v1",
          worker_artifact_root: FIRST_CANONICAL_ADOPTION_WORKER_ROOT,
          worker_manifest_path: FIRST_CANONICAL_ADOPTION_WORKER_MANIFEST,
        },
      })),
    });
    const adapters = createLocalMacProductionPromoteAdapters(createOptions(), dependencies);
    const context = createContext({
      currentDescriptor: null,
      currentReleaseDir: null,
      currentRuntimeBridge: {
        app_release_dir: FIRST_CANONICAL_ADOPTION_APP_ROOT,
        full_local_root: FIRST_CANONICAL_ADOPTION_FULL_LOCAL_ROOT,
        full_local_source_sha: FIRST_CANONICAL_ADOPTION_FULL_LOCAL_SOURCE_SHA,
        mode: "first-canonical-adoption-v1",
        previous_release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA,
        worker_artifact_root: FIRST_CANONICAL_ADOPTION_WORKER_ROOT,
        worker_manifest_path: FIRST_CANONICAL_ADOPTION_WORKER_MANIFEST,
      },
    });

    await expect(adapters.preflightBundle(context))
      .rejects.toThrow(/app.*root|first canonical adoption|bridge/iu);
  });

  it("fails closed when the first canonical adoption bridge sees a wrong worker root or manifest despite matching SHA", async () => {
    const { dependencies } = createDependencies({
      readCurrentRuntimeBundle: vi.fn(async () => ({
        stable_key: "bridge-runtime-stable",
        app: { ...CURRENT_IDENTITY, release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA, ready: true },
        full_local: {
          ...CURRENT_IDENTITY,
          authorization_contract_status: "PASS",
          healthy: true,
          product_catalog_status: "PASS",
          ready: true,
          release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA,
          runtime_present: true,
        },
        youtube_worker: {
          ...CURRENT_IDENTITY,
          release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA,
          ready: true,
        },
        bridge: {
          app_release_dir: FIRST_CANONICAL_ADOPTION_APP_ROOT,
          full_local_root: FIRST_CANONICAL_ADOPTION_FULL_LOCAL_ROOT,
          full_local_source_sha: FIRST_CANONICAL_ADOPTION_FULL_LOCAL_SOURCE_SHA,
          mode: "first-canonical-adoption-v1",
          worker_artifact_root: "/Users/tester/.homecook/youtube-extraction-releases/wrong-root",
          worker_manifest_path: "/Users/tester/.homecook/youtube-extraction-releases/wrong-root/worker-artifact.json",
        },
      })),
    });
    const adapters = createLocalMacProductionPromoteAdapters(createOptions(), dependencies);
    const context = createContext({
      currentDescriptor: null,
      currentReleaseDir: null,
      currentRuntimeBridge: {
        app_release_dir: FIRST_CANONICAL_ADOPTION_APP_ROOT,
        full_local_root: FIRST_CANONICAL_ADOPTION_FULL_LOCAL_ROOT,
        full_local_source_sha: FIRST_CANONICAL_ADOPTION_FULL_LOCAL_SOURCE_SHA,
        mode: "first-canonical-adoption-v1",
        previous_release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA,
        worker_artifact_root: FIRST_CANONICAL_ADOPTION_WORKER_ROOT,
        worker_manifest_path: FIRST_CANONICAL_ADOPTION_WORKER_MANIFEST,
      },
    });

    await expect(adapters.preflightBundle(context))
      .rejects.toThrow(/worker.*root|worker.*manifest|path authority|bridge/iu);
  });

  it("allows first canonical adoption worker standby only for the exact predecessor bridge", () => {
    expect(allowFirstCanonicalAdoptionWorkerStandby({
      currentRuntimeBridge: {
        app_release_dir: FIRST_CANONICAL_ADOPTION_APP_ROOT,
        full_local_root: FIRST_CANONICAL_ADOPTION_FULL_LOCAL_ROOT,
        full_local_source_sha: FIRST_CANONICAL_ADOPTION_FULL_LOCAL_SOURCE_SHA,
        mode: "first-canonical-adoption-v1",
        previous_release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA,
        worker_artifact_root: FIRST_CANONICAL_ADOPTION_WORKER_ROOT,
        worker_manifest_path: FIRST_CANONICAL_ADOPTION_WORKER_MANIFEST,
      },
      workerStatus: {
        loaded: true,
        pid: null,
        state: "spawn scheduled",
      },
      currentWorkerPreflight: {
        ready: true,
        release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA,
      },
    })).toBe(true);

    expect(allowFirstCanonicalAdoptionWorkerStandby({
      currentRuntimeBridge: {
        previous_release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA,
      },
      workerStatus: {
        loaded: true,
        pid: null,
        state: "waiting",
      },
      currentWorkerPreflight: {
        ready: true,
        release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA,
      },
    })).toBe(true);

    expect(allowFirstCanonicalAdoptionWorkerStandby({
      currentRuntimeBridge: {
        previous_release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA,
      },
      workerStatus: {
        loaded: true,
        pid: null,
        state: "running",
      },
      currentWorkerPreflight: {
        ready: true,
        release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA,
      },
    })).toBe(false);

    expect(allowFirstCanonicalAdoptionWorkerStandby({
      currentRuntimeBridge: {
        previous_release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA,
      },
      workerStatus: {
        loaded: true,
        pid: null,
        state: "spawn scheduled",
      },
      currentWorkerPreflight: {
        ready: true,
        release_sha: "0".repeat(40),
      },
    })).toBe(false);
  });

  it("accepts only the exact immutable predecessor worker plist digest", () => {
    expect(allowFirstCanonicalAdoptionWorkerPlist({
      currentRuntimeBridge: { previous_release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA },
      actualDigest: "69393712e063e6e0f84c869c330ff4f58f718b73184a20250395d8c9cfd39da8",
    })).toBe(true);
    expect(allowFirstCanonicalAdoptionWorkerPlist({
      currentRuntimeBridge: { previous_release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA },
      actualDigest: "0".repeat(64),
    })).toBe(false);
    expect(allowFirstCanonicalAdoptionWorkerPlist({
      currentRuntimeBridge: null,
      actualDigest: "69393712e063e6e0f84c869c330ff4f58f718b73184a20250395d8c9cfd39da8",
    })).toBe(false);
  });

  it("normalizes only the exact bridge worker runtime into a stable projection", () => {
    const bridge = { previous_release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA };
    expect(buildWorkerRuntimeStableProjection({
      currentRuntimeBridge: bridge,
      workerStatus: { pid: null, state: "spawn scheduled" },
    })).toEqual({ worker_pid: null, worker_state: "first-canonical-adoption-verified" });
    expect(buildWorkerRuntimeStableProjection({
      currentRuntimeBridge: bridge,
      workerStatus: { pid: 321, state: "running" },
    })).toEqual({ worker_pid: null, worker_state: "first-canonical-adoption-verified" });
    expect(buildWorkerRuntimeStableProjection({
      currentRuntimeBridge: null,
      workerStatus: { pid: 321, state: "running" },
    })).toEqual({ worker_pid: 321, worker_state: "running" });
  });

  it("excludes dynamic backup timing from the full-local workload digest", () => {
    const stable = {
      healthy: true,
      authorization_contract_status: "PASS",
      authorization_contract_missing_requirements: [],
      product_catalog_status: "PASS",
      product_catalog_missing_columns: [],
      product_catalog_missing_functions: [],
      product_catalog_missing_relations: [],
      container_count: 7,
      exited: [],
      status: "running",
    };
    expect(buildFullLocalWorkloadStableDigest({ ...stable, backup_readiness: { age_seconds: 1 } }))
      .toBe(buildFullLocalWorkloadStableDigest({ ...stable, backup_readiness: { age_seconds: 2 } }));
    expect(buildFullLocalWorkloadStableDigest({ ...stable, healthy: false }))
      .not.toBe(buildFullLocalWorkloadStableDigest(stable));
  });

  it("waits only for a bounded candidate identity transition", async () => {
    let reads = 0;
    const sleeps: number[] = [];
    await expect(waitForFullLocalCandidateIdentity({
      attempts: 3,
      intervalMs: 5,
      read: async () => {
        reads += 1;
        if (reads < 3) throw new Error("Full-local Docker workload release identity mismatch.");
        return { ready: true };
      },
      sleep: async (ms: number) => { sleeps.push(ms); },
    })).resolves.toEqual({ ready: true });
    expect(sleeps).toEqual([5, 5]);

    await expect(waitForFullLocalCandidateIdentity({
      attempts: 3,
      read: async () => { throw new Error("authorization contract failed"); },
      sleep: async () => undefined,
    })).rejects.toThrow(/authorization contract failed/iu);
  });

  it("blocks all bundle mutation when sealed snapshot verification fails", async () => {
    const { dependencies } = createDependencies();
    const adapters = createLocalMacProductionPromoteAdapters(createOptions(), dependencies);
    const context = createContext({
      verifyExecutionSnapshot: vi.fn(() => {
        throw new Error("sealed snapshot digest drift");
      }),
    });
    const preflight = await adapters.preflightBundle(context);

    await expect(adapters.installBundle({ ...context, preflight }))
      .rejects.toThrow(/sealed snapshot|digest|drift/iu);
    expect(dependencies.startFullLocal).not.toHaveBeenCalled();
    expect(dependencies.installApp).not.toHaveBeenCalled();
    expect(dependencies.installWorker).not.toHaveBeenCalled();
  });

  it("stops before app or worker mutation when synchronous full-local start fails", async () => {
    const { dependencies } = createDependencies({
      startFullLocal: vi.fn(() => {
        throw new Error("candidate full-local start failed");
      }),
    });
    const adapters = createLocalMacProductionPromoteAdapters(createOptions(), dependencies);
    const context = createContext();
    const preflight = await adapters.preflightBundle(context);

    await expect(adapters.installBundle({ ...context, preflight }))
      .rejects.toThrow(/full-local start failed/iu);
    expect(dependencies.installFullLocal).not.toHaveBeenCalled();
    expect(dependencies.installApp).not.toHaveBeenCalled();
    expect(dependencies.installWorker).not.toHaveBeenCalled();
  });

  it("uses the default full-local child with the complete offline attestation authority", async () => {
    const created = createDependencies();
    const lowLevelDependencies = { ...created.dependencies };
    Reflect.deleteProperty(lowLevelDependencies, "startFullLocal");
    const commandRunner = vi.fn((
      command: string,
      args: readonly string[],
      options?: Record<string, unknown>,
    ) => {
      void command;
      void args;
      void options;
      return { status: 0, stdout: "", stderr: "" };
    });
    const adapters = createLocalMacProductionPromoteAdapters(createOptions(), {
      ...lowLevelDependencies,
      commandRunner,
    });
    const context = createContext();
    const preflight = await adapters.preflightBundle(context);

    await adapters.installBundle({ ...context, preflight });

    expect(commandRunner).toHaveBeenCalledWith(
      "/usr/bin/node",
      expect.arrayContaining([
        "start",
        "--bundle", "/private/attestation/bundle.jsonl",
        "--subject-manifest", "/private/attestation/subject.json",
        "--trusted-root", "/private/attestation/trusted-root.jsonl",
        "--authority-root", "/repo",
      ]),
      expect.objectContaining({ cwd: context.releaseDir }),
    );
    const childArgs = commandRunner.mock.calls[0]?.[1] as string[];
    expect(childArgs).toContain("--lock-token");
    expect(JSON.stringify(childArgs)).not.toContain("LaunchAgents");
  });

  it("runs the real default child through offline authority before the fake Docker boundary", async () => {
    const fixtureRoot = realpathSync(mkdtempSync(join(tmpdir(), "homecook-child-authority-")));
    temporaryDirectories.push(fixtureRoot);
    const homeDir = join(fixtureRoot, "home");
    const candidateRoot = join(fixtureRoot, "candidate");
    const binDir = join(fixtureRoot, "bin");
    mkdirSync(homeDir, { mode: 0o700 });
    mkdirSync(candidateRoot, { mode: 0o700 });
    mkdirSync(binDir, { mode: 0o700 });
    symlinkSync(join(process.cwd(), "scripts"), join(candidateRoot, "scripts"));
    symlinkSync(process.execPath, join(binDir, "node"));

    const manifestPath = join(fixtureRoot, "release.json");
    const subjectPath = join(fixtureRoot, "subject.json");
    const bundlePath = join(fixtureRoot, "bundle.jsonl");
    const trustedRootPath = join(
      process.cwd(),
      "tests/fixtures/github-attestation-trusted-root.jsonl",
    );
    const checkRuns = [
      "build", "changes", "dependency-audit", "policy", "quality",
      "security-function-authorization", "security-smoke",
      "extra-a", "extra-b", "extra-c", "extra-d", "extra-e",
    ].map((name, index) => ({
      app: { id: 15368 },
      check_suite: { id: 900 + index },
      completed_at: `2026-08-25T09:00:${String(index).padStart(2, "0")}Z`,
      conclusion: index >= 10 ? "skipped" : "success",
      name,
      status: "completed",
    }));
    const artifacts = buildGitHubProductionReleaseAttestationArtifacts({
      checkRuns,
      releaseSha: "a".repeat(40),
      releaseTag: "prod-20260825.1",
      releaseTagObjectSha: "e".repeat(40),
      releaseTree: "b".repeat(40),
      repository: "netsus/homecook",
      rehearsalAuthority: {
        rehearsal_receipt_schema: "homecook.local-mac-production-rehearsal-repeatability-receipt.v1",
        build_id: "build-20260825-01",
        sealed_bundle_digest: "f".repeat(64),
        repeatability_receipt_digest: "1".repeat(64),
        rehearsal_receipt_valid_until: "2026-08-30T09:00:00.000Z",
      },
      subjectOutputPath: subjectPath,
    });
    const manifest = createLocalMacProductionReleaseManifest(manifestPath, {
      attestation_digest: artifacts.subject_manifest_sha256,
      required_check_summary: artifacts.subject.required_check_summary,
    });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
    writeFileSync(bundlePath, "{}\n", { mode: 0o600 });
    const ghPayload = [{ verificationResult: { statement: {
      predicateType: GITHUB_PRODUCTION_RELEASE_PREDICATE_TYPE_V2,
      predicate: artifacts.predicate,
      subject: [{ digest: { sha256: artifacts.subject_manifest_sha256 } }],
    } } }];
    const markerPath = join(fixtureRoot, "docker-invoked");
    const fakeGhPath = join(binDir, "gh");
    writeFileSync(fakeGhPath, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(`${JSON.stringify(ghPayload)}\n`)});\n`, { mode: 0o700 });
    const releaseTagMessage = buildProductionReleaseAnnotatedTagMessage({
      releaseTag: manifest.release_tag,
      build_id: manifest.build_id,
      rehearsal_receipt_schema: manifest.rehearsal_receipt_schema,
      sealed_bundle_digest: manifest.sealed_bundle_digest,
      repeatability_receipt_digest: manifest.repeatability_receipt_digest,
      rehearsal_receipt_valid_until: manifest.rehearsal_receipt_valid_until,
    });
    const fakeGitPath = join(binDir, "git");
    writeFileSync(fakeGitPath, `#!/usr/bin/env node
const arg = process.argv.slice(2).join(" ");
if (arg.includes("origin/master") || arg.includes("^{commit}")) process.stdout.write("${"a".repeat(40)}\\n");
else if (arg.includes("^{tree}")) process.stdout.write("${"b".repeat(40)}\\n");
else if (arg.includes("^{tag}")) process.stdout.write("${"e".repeat(40)}\\n");
else if (arg.includes("cat-file tag")) process.stdout.write(${JSON.stringify(`object ${"a".repeat(40)}\ntype commit\ntag prod-20260825.1\ntagger test <test@example.com> 0 +0000\n\n${releaseTagMessage}\n`)});
else process.exit(1);
`, { mode: 0o700 });
    const fakeSecurityPath = join(binDir, "security");
    writeFileSync(fakeSecurityPath, `#!/usr/bin/env node
const args = process.argv.slice(2);
const account = args[args.indexOf("-a") + 1] || "";
if (account.endsWith("__count")) process.stdout.write("1\\n");
else if (account === "jwt_keys__000") process.stdout.write(JSON.stringify({keys:[{d:"private-key-material",kid:"local-es256"}]}) + "\\n");
else if (account === "jwt_jwks__000") process.stdout.write(JSON.stringify({keys:[{kid:"local-es256",kty:"EC"}]}) + "\\n");
else process.stdout.write(account + "-unique-secret-value-at-least-32-bytes\\n");
`, { mode: 0o700 });
    const fakeDockerPath = join(binDir, "docker");
    writeFileSync(fakeDockerPath, `#!/usr/bin/env node
require("node:fs").writeFileSync(${JSON.stringify(markerPath)}, process.argv.slice(2).join(" "));
process.exit(42);
`, { mode: 0o700 });
    for (const path of [fakeGhPath, fakeGitPath, fakeSecurityPath, fakeDockerPath]) {
      chmodSync(path, 0o700);
    }

    const configPath = join(fixtureRoot, "full-local.env");
    const config = readFileSync(
      join(process.cwd(), "infra/full-local-supabase/.env.production.example"),
      "utf8",
    ).replaceAll("/Users/REPLACE_ME", homeDir);
    writeFileSync(configPath, config, { mode: 0o600 });
    chmodSync(configPath, 0o600);
    writeFileSync(join(candidateRoot, "prepare.json"), JSON.stringify({
      schema: "homecook.local-mac-production-prepare.v1",
      status: "prepared",
      prepared_at: "2026-08-25T10:00:00.000Z",
      promotion_id: manifest.promotion_id,
      release_tag: manifest.release_tag,
      release_sha: manifest.release_sha,
      release_tree: manifest.release_tree,
      build_id: manifest.build_id,
      source_manifest_path: manifest.release_manifest_path,
      source_manifest_sha256: createHash("sha256").update(readFileSync(manifestPath)).digest("hex"),
      attestation_source: "fixture",
      validation_commands: [],
    }), { mode: 0o600 });
    const lockToken = "99999999-9999-4999-8999-999999999999";
    acquireLocalMacProductionPromotionLock({
      homeDir,
      manifest,
      manifestPath,
      lockToken,
      readGitEvidence: () => createLocalMacProductionGitEvidence(),
      verifyAttestation: VERIFIED_ATTESTATION,
    });

    const created = createDependencies();
    const dependencies = { ...created.dependencies };
    Reflect.deleteProperty(dependencies, "startFullLocal");
    const options = createOptions({
      bundlePath,
      fullLocalConfigPath: configPath,
      homeDir,
      nodeBin: join(binDir, "node"),
      subjectManifestPath: subjectPath,
      trustedRootPath,
    });
    const adapters = createLocalMacProductionPromoteAdapters(options, dependencies);
    const context = createContext({
      frozenRuntimeInputs: createFrozenRuntimeInputsFixture(readFileSync(configPath)),
      homeDir,
      lockToken,
      manifest: {
        ...manifest,
        build_id: RELEASE_IDENTITY.build_id,
        promotion_id: RELEASE_IDENTITY.promotion_id,
      },
      releaseDir: candidateRoot,
      rootDir: process.cwd(),
    });
    const preflight = await adapters.preflightBundle(context);

    await expect(adapters.installBundle({ ...context, preflight }))
      .rejects.toThrow(/full-local synchronous start failed/iu);
    expect(readFileSync(markerPath, "utf8")).toContain("compose");
    expect(dependencies.installApp).not.toHaveBeenCalled();
    expect(dependencies.installWorker).not.toHaveBeenCalled();
  });

  it("migrates the exact e02f legacy runtime to a labeled candidate under the locked installer", async () => {
    const legacyIdentity = {
      release_sha: "e02f02a87d1d955dc598728e7029a745a650a5c3",
      release_tree: "d".repeat(40),
      build_id: "build-current",
      promotion_id: "promotion-current",
    };
    const { calls, dependencies } = createDependencies({
      readCurrentRuntimeBundle: vi.fn(async () => ({
        stable_key: "legacy-e02f-canonical",
        app: { ...legacyIdentity, ready: true },
        full_local: {
          ...legacyIdentity,
          ready: true,
          legacy_bootstrap: true,
          legacy_bootstrap_contract: "e02f-full-local-v1",
        },
        youtube_worker: {
          ...legacyIdentity,
          ready: true,
          legacy_bootstrap: true,
          legacy_bootstrap_contract: "e02f-worker-v1",
        },
      })),
    });
    const adapters = createLocalMacProductionPromoteAdapters(createOptions(), dependencies);
    const context = {
      ...createContext(),
      currentDescriptor: { ...legacyIdentity, release_tag: "prod-legacy.1" },
    };
    const legacyPlist = renderFullLocalLaunchAgentPlist({
      configPath: "/private/full-local.env",
      homeDir: "/Users/tester",
      includeReleaseIdentity: false,
      nodeBin: "/usr/bin/node",
      rootDir: context.currentReleaseDir,
      runtimeCommand: "start",
    });
    expect(legacyPlist).toContain("<string>start</string>");
    expect(legacyPlist).not.toContain("--release-identity");
    const preflight = await adapters.preflightBundle(context);

    await adapters.installBundle({ ...context, preflight });
    const readiness = await adapters.readinessProbe({ ...context, preflight });

    expect(preflight.current.full_local.legacy_bootstrap).toBe(true);
    expect(preflight.current.full_local.legacy_bootstrap_contract)
      .toBe("e02f-full-local-v1");
    expect(readiness.full_local).toMatchObject(RELEASE_IDENTITY);
    expect(calls).toEqual(expect.arrayContaining([
      "start-full-local",
      "confirm-full-local-candidate",
      "install-full-local",
      "install-app",
      "install-worker",
    ]));
  });

  it("blocks current runtime drift before any install helper runs", async () => {
    const { dependencies } = createDependencies({
      readCurrentRuntimeBundle: vi.fn(async () => ({
        stable_key: "drifted",
        app: { ...CURRENT_IDENTITY, release_sha: "e".repeat(40), ready: true },
        full_local: { ...CURRENT_IDENTITY, ready: true },
        youtube_worker: { ...CURRENT_IDENTITY, ready: true },
      })),
    });
    const adapters = createLocalMacProductionPromoteAdapters(createOptions(), dependencies);

    await expect(adapters.preflightBundle(createContext()))
      .rejects.toThrow(/current|runtime|app|drift|identity/iu);
    expect(dependencies.installFullLocal).not.toHaveBeenCalled();
    expect(dependencies.installApp).not.toHaveBeenCalled();
    expect(dependencies.installWorker).not.toHaveBeenCalled();
  });

  it("rejects confirm-production mismatch before artifact or mutation preflight", async () => {
    const { dependencies } = createDependencies();
    const adapters = createLocalMacProductionPromoteAdapters(
      createOptions({ confirmation: "wrong" }),
      dependencies,
    );

    await expect(adapters.preflightBundle(createContext()))
      .rejects.toThrow(/confirm|confirmation/iu);
    expect(dependencies.validateMutationTargets).not.toHaveBeenCalled();
    expect(dependencies.readWorkerReleasePreflight).not.toHaveBeenCalled();
  });

  it("rejects incomplete candidate worker path authority before current runtime checks", async () => {
    const { dependencies } = createDependencies({
      readWorkerReleasePreflight: vi.fn(async () => ({
        artifactRoot: "/private/worker",
        manifestPath: "/private/worker/artifact.json",
        preflight: { ready: true, ...RELEASE_IDENTITY },
      })),
    });
    const adapters = createLocalMacProductionPromoteAdapters(createOptions(), dependencies);

    await expect(adapters.preflightBundle(createContext()))
      .rejects.toThrow(/worker.*path|authority|incomplete/iu);
    expect(dependencies.readCurrentRuntimeBundle).not.toHaveBeenCalled();
    expect(dependencies.installFullLocal).not.toHaveBeenCalled();
  });

  it("blocks a symlink mutation target before runtime checks or installation", async () => {
    const { dependencies } = createDependencies({
      validateMutationTargets: vi.fn(() => {
        throw new Error("app plist target is a symlink");
      }),
    });
    const adapters = createLocalMacProductionPromoteAdapters(createOptions(), dependencies);

    await expect(adapters.preflightBundle(createContext()))
      .rejects.toThrow(/plist|symlink/iu);
    expect(dependencies.readCurrentRuntimeBundle).not.toHaveBeenCalled();
    expect(dependencies.installApp).not.toHaveBeenCalled();
  });

  it.each(["app", "full-local", "worker"])(
    "rejects stable but altered %s canonical plist bytes",
    (component) => {
      const createdDirectory = mkdtempSync(join(tmpdir(), `homecook-${component}-plist-`));
      const directory = realpathSync(createdDirectory);
      temporaryDirectories.push(directory);
      const path = join(directory, `${component}.plist`);
      const releaseRoot = join(directory, "release");
      mkdirSync(releaseRoot, { mode: 0o700 });
      let expectedContent: string;
      let alteredContent: string;
      let mode: number;
      if (component === "app") {
        expectedContent = renderLocalMacProductionPlist({
          homeDir: directory,
          nodeBin: "/usr/bin/node",
          rootDir: releaseRoot,
        });
        alteredContent = expectedContent.replaceAll(releaseRoot, join(directory, "other-release"));
        mode = 0o644;
      } else if (component === "full-local") {
        const configPath = join(directory, "full-local.env");
        expectedContent = renderFullLocalLaunchAgentPlist({
          configPath,
          homeDir: directory,
          includeReleaseIdentity: false,
          nodeBin: "/usr/bin/node",
          rootDir: releaseRoot,
          runtimeCommand: "start",
        });
        alteredContent = expectedContent.replace(configPath, join(directory, "altered.env"));
        mode = 0o600;
      } else {
        const artifactRoot = join(directory, "worker-artifact");
        const secretRoot = join(directory, "worker-secrets");
        mkdirSync(artifactRoot, { mode: 0o700 });
        mkdirSync(secretRoot, { mode: 0o700 });
        const manifestPath = join(artifactRoot, "artifact.json");
        const appDescriptorPath = join(artifactRoot, "app.json");
        const policyPath = join(artifactRoot, "policy.json");
        const schemaPath = join(artifactRoot, "schema.json");
        const configPath = join(secretRoot, "worker.env");
        const credentialPath = join(secretRoot, "credential.json");
        for (const filePath of [manifestPath, appDescriptorPath, policyPath, schemaPath]) {
          writeFileSync(filePath, "{}\n", { mode: 0o644 });
        }
        writeFileSync(configPath, "", { mode: 0o600 });
        writeFileSync(credentialPath, "{}\n", { mode: 0o600 });
        chmodSync(configPath, 0o600);
        chmodSync(credentialPath, 0o600);
        expectedContent = renderYoutubeExtractionWorkerPlist({
          appDescriptorPath,
          configPath,
          credentialPath,
          currentPolicyPath: policyPath,
          expectedSchemaPath: schemaPath,
          homeDir: directory,
          manifestPath,
          nodeBin: "/usr/bin/node",
          rootDir: artifactRoot,
          secretRoot,
        });
        alteredContent = expectedContent.replace(manifestPath, join(artifactRoot, "other.json"));
        mode = 0o600;
      }
      writeFileSync(path, alteredContent, { mode });
      chmodSync(path, mode);

      expect(() => promoteAdapters.assertCanonicalLocalMacProductionPlist({
        actualPath: path,
        currentUid: process.getuid?.() ?? 0,
        expectedContent,
        expectedMode: mode,
        label: `${component} plist`,
      })).toThrow(/canonical|plist|drift|content|semantic/iu);
    },
  );

  it("builds current worker canonical plist from descriptor authority, not actual drifted args", () => {
    const renderWorkerPlist = vi.fn((input: Record<string, unknown>) => JSON.stringify(input));
    const options = createOptions();
    const currentDescriptor = createContext().currentDescriptor;

    promoteAdapters.buildCanonicalCurrentYoutubeWorkerPlist({
      currentDescriptor,
      options,
      verifyWorkerArtifact: vi.fn(() => ({ artifact_sha256: "7".repeat(64) })),
      digestFile: vi.fn((path: string) => ({
        ["/private/authority/app-descriptor.json"]: "6".repeat(64),
        [String(options.workerConfigPath)]: "5".repeat(64),
        [String(options.workerCredentialPath)]: "4".repeat(64),
        ["/private/authority/expected-schema.json"]: "3".repeat(64),
        ["/private/authority/policy.json"]: "2".repeat(64),
      })[path] ?? "0".repeat(64)),
      renderWorkerPlist: renderWorkerPlist as unknown as typeof renderYoutubeExtractionWorkerPlist,
    });

    expect(renderWorkerPlist).toHaveBeenCalledWith(expect.objectContaining({
      appDescriptorPath: "/private/authority/app-descriptor.json",
      configPath: options.workerConfigPath,
      credentialPath: options.workerCredentialPath,
      currentPolicyPath: "/private/authority/policy.json",
      expectedSchemaPath: "/private/authority/expected-schema.json",
      secretRoot: options.workerSecretRoot,
      manifestPath: currentDescriptor.worker_manifest_path,
      rootDir: currentDescriptor.worker_artifact_root,
    }));
    expect(renderWorkerPlist).not.toHaveBeenCalledWith(expect.objectContaining({
      rootDir: "/private/current-worker-artifact",
    }));
    expect(JSON.stringify(currentDescriptor)).not.toMatch(
      /credential_path|secret_root|config_path|policy_path/u,
    );
  });

  it.each(["library-symlink", "launchagents-writable"])(
    "rejects unsafe plist ancestor %s from the trusted home root",
    (variant) => {
      const homeDir = mkdtempSync(join(tmpdir(), "homecook-plist-ancestor-home-"));
      const external = mkdtempSync(join(tmpdir(), "homecook-plist-ancestor-external-"));
      temporaryDirectories.push(homeDir, external);
      const libraryPath = join(homeDir, "Library");
      const launchAgentsPath = join(libraryPath, "LaunchAgents");
      if (variant === "library-symlink") {
        mkdirSync(join(external, "LaunchAgents"), { recursive: true });
        symlinkSync(external, libraryPath);
      } else {
        mkdirSync(launchAgentsPath, { recursive: true });
        chmodSync(launchAgentsPath, 0o777);
      }
      const actualPath = join(launchAgentsPath, "com.homecook.production.plist");
      const expectedContent = "<plist><dict></dict></plist>\n";
      writeFileSync(actualPath, expectedContent, { mode: 0o644 });
      chmodSync(actualPath, 0o644);

      expect(() => promoteAdapters.assertCanonicalLocalMacProductionPlist({
        actualPath,
        currentUid: process.getuid?.() ?? 0,
        expectedContent,
        expectedMode: 0o644,
        label: "app plist",
        trustedRoot: homeDir,
      })).toThrow(/ancestor|symlink|owner|mode|unsafe|directory/iu);
    },
  );
});
