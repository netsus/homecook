import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createLocalMacProductionPromoteAdapters,
} from "../scripts/lib/local-mac-production-promote-adapters.mjs";
import * as promoteAdapters from "../scripts/lib/local-mac-production-promote-adapters.mjs";
import { renderLocalMacProductionPlist } from "../scripts/lib/local-mac-production.mjs";
import { renderFullLocalLaunchAgentPlist } from "../scripts/lib/full-local-launch-agent.mjs";
import {
  renderYoutubeExtractionWorkerPlist,
} from "../scripts/lib/youtube-extraction-worker-ops.mjs";

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
const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

function createOptions(overrides: Record<string, unknown> = {}) {
  return {
    confirmation: "LOCAL_FULL_PRODUCTION_WORKER_INSTALL",
    fullLocalConfigPath: "/private/full-local.env",
    homeDir: "/Users/tester",
    nodeBin: "/usr/bin/node",
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

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    currentDescriptor: {
      ...CURRENT_IDENTITY,
      release_tag: "prod-20260824.1",
      worker_artifact_root: "/private/current-worker-authority",
      worker_manifest_path: "/private/current-worker-authority/artifact.json",
      worker_app_descriptor_path: "/private/current-worker-authority/app.json",
      worker_config_path: "/private/current-worker-authority/worker.env",
      worker_credential_path: "/private/current-worker-authority/credential.json",
      worker_expected_schema_path: "/private/current-worker-authority/schema.json",
      worker_policy_path: "/private/current-worker-authority/policy.json",
      worker_secret_root: "/private/current-worker-authority/secrets",
    },
    currentReleaseDir: "/Users/tester/.homecook/releases/prod-20260824.1",
    homeDir: "/Users/tester",
    manifest: { ...RELEASE_IDENTITY },
    mutationAuthority: { required: true },
    releaseDir: "/Users/tester/.homecook/releases/prod-20260825.1",
    rootDir: "/repo",
    ...overrides,
  };
}

describe("local Mac production promote adapters", () => {
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
  });

  it("installs the worker from its separately attested artifact root", async () => {
    const { calls, dependencies } = createDependencies();
    const adapters = createLocalMacProductionPromoteAdapters(createOptions(), dependencies);
    const context = createContext();
    const preflight = await adapters.preflightBundle(context);

    await adapters.installBundle({ ...context, preflight });

    expect(dependencies.installFullLocal).toHaveBeenCalledWith(expect.objectContaining({
      rootDir: context.releaseDir,
      runtimeCommand: "status",
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
      renderWorkerPlist: renderWorkerPlist as unknown as typeof renderYoutubeExtractionWorkerPlist,
    });

    expect(renderWorkerPlist).toHaveBeenCalledWith(expect.objectContaining({
      appDescriptorPath: currentDescriptor.worker_app_descriptor_path,
      configPath: currentDescriptor.worker_config_path,
      credentialPath: currentDescriptor.worker_credential_path,
      currentPolicyPath: currentDescriptor.worker_policy_path,
      expectedSchemaPath: currentDescriptor.worker_expected_schema_path,
      secretRoot: currentDescriptor.worker_secret_root,
      manifestPath: currentDescriptor.worker_manifest_path,
      rootDir: currentDescriptor.worker_artifact_root,
    }));
    expect(renderWorkerPlist).not.toHaveBeenCalledWith(expect.objectContaining({
      rootDir: "/private/current-worker-artifact",
    }));
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
