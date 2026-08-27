import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  createLocalMacProductionPromoteAdapters,
} from "../scripts/lib/local-mac-production-promote-adapters.mjs";

const RELEASE_IDENTITY = Object.freeze({
  release_sha: "a".repeat(40),
  release_tree: "b".repeat(40),
  build_id: "build-promote",
});
const CURRENT_IDENTITY = Object.freeze({
  release_sha: "c".repeat(40),
  release_tree: "d".repeat(40),
  build_id: "build-current",
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
        i031Preflight: { ready: true },
        preflight: { ready: true, release_sha: RELEASE_IDENTITY.release_sha },
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

function createContext() {
  return {
    currentDescriptor: {
      ...CURRENT_IDENTITY,
      release_tag: "prod-20260824.1",
    },
    currentReleaseDir: "/Users/tester/.homecook/releases/prod-20260824.1",
    homeDir: "/Users/tester",
    manifest: { ...RELEASE_IDENTITY },
    mutationAuthority: { required: true },
    releaseDir: "/Users/tester/.homecook/releases/prod-20260825.1",
    rootDir: "/repo",
  };
}

describe("local Mac production promote adapters", () => {
  it("provides an importable adapter composition module", () => {
    expect(existsSync(join(
      process.cwd(),
      "scripts/lib/local-mac-production-promote-adapters.mjs",
    ))).toBe(true);
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
});
