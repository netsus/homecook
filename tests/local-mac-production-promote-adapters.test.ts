import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readFileSync,
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
import {
  buildGitHubProductionReleaseAttestationArtifacts,
  GITHUB_PRODUCTION_RELEASE_PREDICATE_TYPE,
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
const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

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
    executionSnapshot,
    verifyExecutionSnapshot: vi.fn(() => executionSnapshot),
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
    expect(dependencies.readWorkerRuntimeIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ requirePolicyEnabled: false }),
    );
    await adapters.finalWorkerProbe({ ...context, preflight });
    expect(dependencies.readWorkerRuntimeIdentity).toHaveBeenLastCalledWith(
      expect.objectContaining({ requirePolicyEnabled: true }),
    );
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
    expect(context.verifyExecutionSnapshot).toHaveBeenCalledTimes(5);
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
      subjectOutputPath: subjectPath,
    });
    const manifest = createLocalMacProductionReleaseManifest(manifestPath, {
      attestation_digest: artifacts.subject_manifest_sha256,
      required_check_summary: artifacts.subject.required_check_summary,
    });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { mode: 0o600 });
    writeFileSync(bundlePath, "{}\n", { mode: 0o600 });
    const ghPayload = [{ verificationResult: { statement: {
      predicateType: GITHUB_PRODUCTION_RELEASE_PREDICATE_TYPE,
      predicate: artifacts.predicate,
      subject: [{ digest: { sha256: artifacts.subject_manifest_sha256 } }],
    } } }];
    const markerPath = join(fixtureRoot, "docker-invoked");
    const fakeGhPath = join(binDir, "gh");
    writeFileSync(fakeGhPath, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(`${JSON.stringify(ghPayload)}\n`)});\n`, { mode: 0o700 });
    const fakeGitPath = join(binDir, "git");
    writeFileSync(fakeGitPath, `#!/usr/bin/env node
const arg = process.argv.slice(2).join(" ");
if (arg.includes("origin/master") || arg.includes("^{commit}")) process.stdout.write("${"a".repeat(40)}\\n");
else if (arg.includes("^{tree}")) process.stdout.write("${"b".repeat(40)}\\n");
else if (arg.includes("^{tag}")) process.stdout.write("${"e".repeat(40)}\\n");
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
      digestFile: vi.fn((path: string) => ({
        ["/private/current-worker-authority/artifact.json"]: "7".repeat(64),
        ["/private/current-worker-authority/authority/app-descriptor.json"]: "6".repeat(64),
        [String(options.workerConfigPath)]: "5".repeat(64),
        [String(options.workerCredentialPath)]: "4".repeat(64),
        ["/private/current-worker-authority/authority/expected-schema.json"]: "3".repeat(64),
        ["/private/current-worker-authority/authority/policy.json"]: "2".repeat(64),
      })[path] ?? "0".repeat(64)),
      renderWorkerPlist: renderWorkerPlist as unknown as typeof renderYoutubeExtractionWorkerPlist,
    });

    expect(renderWorkerPlist).toHaveBeenCalledWith(expect.objectContaining({
      appDescriptorPath: "/private/current-worker-authority/authority/app-descriptor.json",
      configPath: options.workerConfigPath,
      credentialPath: options.workerCredentialPath,
      currentPolicyPath: "/private/current-worker-authority/authority/policy.json",
      expectedSchemaPath: "/private/current-worker-authority/authority/expected-schema.json",
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
