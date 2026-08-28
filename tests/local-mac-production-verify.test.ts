import { createHash } from "node:crypto";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createLocalMacProductionExecutionSnapshot,
  getLocalMacProductionReleasePaths,
  readAndVerifyLocalMacProductionExecutionSnapshot,
  verifyLocalMacProductionRelease,
} from "../scripts/lib/local-mac-production-release.mjs";
import {
  createLocalMacProductionGitEvidence,
  createLocalMacProductionReleaseManifest,
  VERIFIED_ATTESTATION,
} from "./helpers/local-mac-production-release-fixtures";

const temporaryDirectories: string[] = [];

function temp(prefix: string) {
  const path = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(path);
  return path;
}

function digest(bytes: Buffer | string) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readyRuntime(manifest: Record<string, unknown>) {
  const identity = {
    ready: true,
    release_sha: manifest.release_sha,
    release_tree: manifest.release_tree,
    build_id: manifest.build_id,
    promotion_id: manifest.promotion_id,
  };
  return {
    app: { ...identity },
    full_local: {
      ...identity,
      authorization_contract_status: "PASS",
      auth_ready: true,
      docker_ready: true,
      healthy: true,
      jwks_ready: true,
      local_only: true,
      migration_head: manifest.migration_head,
      product_catalog_status: "PASS",
      runtime_present: true,
      volume_identity_verified: true,
    },
    youtube_worker: { ...identity },
  };
}

function fixture() {
  const homeDir = temp("homecook-verify-home-");
  const rootDir = temp("homecook-verify-root-");
  const manifestPath = join(rootDir, "release.json");
  const manifest = createLocalMacProductionReleaseManifest(manifestPath);
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(manifestPath, manifestBytes, { mode: 0o600 });

  const paths = getLocalMacProductionReleasePaths(homeDir);
  mkdirSync(paths.releaseRoot, { recursive: true, mode: 0o700 });
  chmodSync(join(paths.releaseRoot, ".."), 0o700);
  chmodSync(paths.releaseRoot, 0o700);
  const executionRoot = join(paths.releaseRoot, "execution-snapshots", "8".repeat(64));
  const executionAppRoot = join(executionRoot, "app");
  const workerArtifactRoot = join(executionRoot, "worker");
  mkdirSync(executionAppRoot, { recursive: true, mode: 0o700 });
  mkdirSync(workerArtifactRoot, { recursive: true, mode: 0o700 });
  writeFileSync(paths.currentDescriptorPath, `${JSON.stringify({
    schema: "homecook.local-mac-production-running-release.v1",
    release_tag: manifest.release_tag,
    release_sha: manifest.release_sha,
    release_tree: manifest.release_tree,
    build_id: manifest.build_id,
    promotion_id: manifest.promotion_id,
    restart_capability: "full-local-resume-current-v1",
    full_local_config_sha256: "1".repeat(64),
    promoted_at: "2026-08-25T11:00:00.000Z",
    source_manifest_sha256: digest(manifestBytes),
    execution_app_root: executionAppRoot,
    execution_snapshot_digest: "8".repeat(64),
    worker_artifact_root: workerArtifactRoot,
    worker_manifest_path: join(workerArtifactRoot, "artifact.json"),
    worker_artifact_sha256: "7".repeat(64),
    worker_app_descriptor_sha256: "6".repeat(64),
    worker_config_sha256: "5".repeat(64),
    worker_credential_sha256: "4".repeat(64),
    worker_expected_schema_sha256: "3".repeat(64),
    worker_policy_sha256: "2".repeat(64),
  }, null, 2)}\n`, { mode: 0o600 });

  return {
    homeDir,
    manifest,
    manifestBytes,
    manifestPath,
    paths,
    rootDir,
  };
}

function verifyOptions(subject: ReturnType<typeof fixture>) {
  return {
    homeDir: subject.homeDir,
    manifestPath: subject.manifestPath,
    rootDir: subject.rootDir,
    readGitEvidence: () => createLocalMacProductionGitEvidence({
      releaseSha: String(subject.manifest.release_sha),
      releaseTree: String(subject.manifest.release_tree),
    }),
    verifyAttestation: VERIFIED_ATTESTATION,
    verifyExecutionSnapshot: vi.fn(() => ({
      digest: "8".repeat(64),
      verified: true,
    })),
    verifyRuntimeBundle: vi.fn(async () => readyRuntime(subject.manifest)),
  };
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const path = temporaryDirectories.pop()!;
    const makeWritable = (target: string) => {
      const stat = lstatSync(target);
      if (stat.isSymbolicLink()) return;
      if (stat.isDirectory()) {
        chmodSync(target, 0o700);
        for (const name of readdirSync(target)) makeWritable(join(target, name));
      } else {
        chmodSync(target, 0o600);
      }
    };
    makeWritable(path);
    rmSync(path, { recursive: true, force: true });
  }
});

describe("local Mac production verify", () => {
  it("reconstructs and verifies an existing sealed execution snapshot", () => {
    const homeDir = temp("homecook-verify-snapshot-home-");
    const releaseRoot = getLocalMacProductionReleasePaths(homeDir).releaseRoot;
    mkdirSync(releaseRoot, { recursive: true, mode: 0o700 });
    chmodSync(join(releaseRoot, ".."), 0o700);
    const preparedReleaseDir = temp("homecook-verify-snapshot-app-");
    const workerRoot = temp("homecook-verify-snapshot-worker-");
    const workerAuthority = temp("homecook-verify-snapshot-authority-");
    writeFileSync(join(preparedReleaseDir, "server.mjs"), "export const ready = true;\n");
    writeFileSync(join(workerRoot, "artifact.json"), "worker artifact\n");
    for (const name of ["app-descriptor.json", "expected-schema.json", "policy.json"]) {
      writeFileSync(join(workerAuthority, name), `${name}\n`);
    }
    const identity = {
      release_sha: "a".repeat(40),
      release_tree: "b".repeat(40),
      build_id: "build-sealed",
      promotion_id: "promotion-sealed",
    };
    const snapshot = createLocalMacProductionExecutionSnapshot({
      manifest: identity,
      preparedReleaseDir,
      releaseRoot,
      worker: {
        artifactRoot: workerRoot,
        manifestPath: join(workerRoot, "artifact.json"),
        appDescriptorPath: join(workerAuthority, "app-descriptor.json"),
        expectedSchemaPath: join(workerAuthority, "expected-schema.json"),
        policyPath: join(workerAuthority, "policy.json"),
      },
    });

    expect(readAndVerifyLocalMacProductionExecutionSnapshot({
      homeDir,
      descriptor: {
        schema: "homecook.local-mac-production-running-release.v1",
        release_tag: "prod-20260828.1",
        ...identity,
        restart_capability: "full-local-resume-current-v1",
        full_local_config_sha256: "1".repeat(64),
        promoted_at: "2026-08-28T12:00:00.000Z",
        source_manifest_sha256: "9".repeat(64),
        execution_app_root: snapshot.appRoot,
        execution_snapshot_digest: snapshot.digest,
        worker_artifact_root: snapshot.workerRoot,
        worker_manifest_path: snapshot.manifestPath,
        worker_artifact_sha256: "7".repeat(64),
        worker_app_descriptor_sha256: "6".repeat(64),
        worker_config_sha256: "5".repeat(64),
        worker_credential_sha256: "4".repeat(64),
        worker_expected_schema_sha256: "3".repeat(64),
        worker_policy_sha256: "2".repeat(64),
      },
    })).toMatchObject({
      digest: snapshot.digest,
      root: snapshot.root,
    });
  });

  it("rejects worker manifest path authority that escapes the sealed worker root", () => {
    const subject = fixture();
    const descriptor = JSON.parse(readFileSync(subject.paths.currentDescriptorPath, "utf8"));

    expect(() => readAndVerifyLocalMacProductionExecutionSnapshot({
      homeDir: subject.homeDir,
      descriptor: {
        ...descriptor,
        worker_manifest_path: join(subject.homeDir, "outside-artifact.json"),
      },
    })).toThrow(/worker.*manifest.*path|path.*authority|escape/iu);
  });

  it("rejects a sealed-looking snapshot outside the canonical release root", () => {
    const subject = fixture();
    const descriptor = JSON.parse(readFileSync(subject.paths.currentDescriptorPath, "utf8"));
    const externalRoot = join(subject.rootDir, descriptor.execution_snapshot_digest);

    expect(() => readAndVerifyLocalMacProductionExecutionSnapshot({
      homeDir: subject.homeDir,
      descriptor: {
        ...descriptor,
        execution_app_root: join(externalRoot, "app"),
        worker_artifact_root: join(externalRoot, "worker"),
        worker_manifest_path: join(externalRoot, "worker", "artifact.json"),
      },
    })).toThrow(/canonical|release root|snapshot path authority/iu);
  });

  it("verifies the attested descriptor, sealed snapshot, and exact three-part runtime bundle read-only", async () => {
    const subject = fixture();
    const options = verifyOptions(subject);
    const descriptorBefore = readFileSync(subject.paths.currentDescriptorPath);

    await expect(verifyLocalMacProductionRelease(options)).resolves.toMatchObject({
      verified: true,
      release_dir: expect.stringContaining("/execution-snapshots/"),
      manifest: {
        release_sha: subject.manifest.release_sha,
        release_tree: subject.manifest.release_tree,
      },
      runtime: {
        full_local: {
          migration_head: subject.manifest.migration_head,
        },
      },
    });
    expect(options.verifyExecutionSnapshot).toHaveBeenCalledTimes(2);
    expect(options.verifyRuntimeBundle).toHaveBeenCalledTimes(1);
    expect(readFileSync(subject.paths.currentDescriptorPath)).toEqual(descriptorBefore);
  });

  it.each([
    ["release SHA", { release_sha: "0".repeat(40) }, /release.*sha|descriptor.*manifest/iu],
    ["release tree", { release_tree: "0".repeat(40) }, /release.*tree|descriptor.*manifest/iu],
    ["build ID", { build_id: "other-build" }, /build.*id|descriptor.*manifest/iu],
    ["migration head", { migration_head: "20000101000000_wrong.sql" }, /migration.*head/iu],
  ])("fails closed for runtime %s drift", async (_label, override, message) => {
    const subject = fixture();
    const options = verifyOptions(subject);
    options.verifyRuntimeBundle.mockResolvedValue({
      ...readyRuntime(subject.manifest),
      ...(Object.hasOwn(override, "migration_head")
        ? {
            full_local: {
              ...readyRuntime(subject.manifest).full_local,
              ...override,
            },
          }
        : {
            app: {
              ...readyRuntime(subject.manifest).app,
              ...override,
            },
          }),
    });

    await expect(verifyLocalMacProductionRelease(options)).rejects.toThrow(message);
  });

  it("requires app, full-local, and worker enablement as one verified bundle", async () => {
    const subject = fixture();
    const disabledManifest = {
      ...subject.manifest,
      youtube_worker_launch_agent_enabled: false,
    };
    const bytes = Buffer.from(`${JSON.stringify(disabledManifest, null, 2)}\n`);
    writeFileSync(subject.manifestPath, bytes, { mode: 0o600 });
    const descriptor = JSON.parse(readFileSync(subject.paths.currentDescriptorPath, "utf8"));
    writeFileSync(subject.paths.currentDescriptorPath, `${JSON.stringify({
      ...descriptor,
      source_manifest_sha256: digest(bytes),
    }, null, 2)}\n`, { mode: 0o600 });

    await expect(verifyLocalMacProductionRelease({
      ...verifyOptions(subject),
      manifestPath: subject.manifestPath,
    })).rejects.toThrow(/app|full-local|worker|bundle|enabled/iu);
  });

  it("fails closed when current.json changes during the runtime probe", async () => {
    const subject = fixture();
    const options = verifyOptions(subject);
    options.verifyRuntimeBundle.mockImplementation(async () => {
      const descriptor = JSON.parse(readFileSync(subject.paths.currentDescriptorPath, "utf8"));
      writeFileSync(subject.paths.currentDescriptorPath, `${JSON.stringify({
        ...descriptor,
        promoted_at: "2026-08-25T12:00:00.000Z",
      }, null, 2)}\n`, { mode: 0o600 });
      return readyRuntime(subject.manifest);
    });

    await expect(verifyLocalMacProductionRelease(options))
      .rejects.toThrow(/descriptor.*changed|concurrent/iu);
  });

  it("fails closed when the attested manifest changes during the runtime probe", async () => {
    const subject = fixture();
    const options = verifyOptions(subject);
    options.verifyRuntimeBundle.mockImplementation(async () => {
      writeFileSync(subject.manifestPath, `${JSON.stringify({
        ...subject.manifest,
        approved_by_task_id: "competing-writer",
      }, null, 2)}\n`, { mode: 0o600 });
      return readyRuntime(subject.manifest);
    });

    await expect(verifyLocalMacProductionRelease(options))
      .rejects.toThrow(/manifest.*changed|concurrent/iu);
  });

  it("fails closed while a promotion lock exists", async () => {
    const subject = fixture();
    mkdirSync(subject.paths.lockPath, { recursive: true, mode: 0o700 });

    await expect(verifyLocalMacProductionRelease(verifyOptions(subject)))
      .rejects.toThrow(/promotion.*lock|lock.*held/iu);
  });

  it("fails closed when a promotion lock appears and disappears during verify", async () => {
    const subject = fixture();
    const options = verifyOptions(subject);
    options.verifyRuntimeBundle.mockImplementation(async () => {
      mkdirSync(subject.paths.lockPath, { recursive: true, mode: 0o700 });
      rmSync(subject.paths.lockPath, { recursive: true, force: true });
      return readyRuntime(subject.manifest);
    });

    await expect(verifyLocalMacProductionRelease(options))
      .rejects.toThrow(/lock.*changed|lock.*generation|promotion.*concurrent/iu);
  });
});
