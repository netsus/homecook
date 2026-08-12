import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildYoutubeExtractionAppDescriptor,
  buildYoutubeExtractionCurrentPolicy,
  buildYoutubeExtractionWorkerArtifactManifest,
  buildYoutubeExtractionWorkerQueueState,
  ensureAbsolutePath,
  YOUTUBE_EXTRACTION_WORKER_LABEL,
  YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
} from "../scripts/lib/youtube-extraction-worker-artifact.mjs";
import {
  buildYoutubeExtractionWorkerCredentialState,
  buildYoutubeExtractionWorkerDrainPlan,
  buildYoutubeExtractionWorkerHealth,
  buildYoutubeExtractionWorkerInstallPlan,
  buildYoutubeExtractionWorkerLifecyclePlan,
  buildYoutubeExtractionWorkerRollbackPlan,
  evaluateYoutubeExtractionWorkerPreflight,
  parseLaunchctlPrintStatus,
  renderYoutubeExtractionWorkerPlist,
  rotateYoutubeExtractionWorkerCredential,
  writeCredentialMetadata,
} from "../scripts/lib/youtube-extraction-worker-ops.mjs";

const tempDirs: string[] = [];

function createTempDir(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

function writeModeFile(path: string, contents: string, mode = 0o600) {
  writeFileSync(path, contents, { encoding: "utf8", mode });
  chmodSync(path, mode);
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("YTASYNC-OPS deterministic artifact", () => {
  it("rejects relative paths instead of silently resolving them against cwd", () => {
    expect(() => ensureAbsolutePath("relative/worker.json", "workerArtifactPath"))
      .toThrow(/absolute path/i);
  });

  it("builds the same manifest for the same repo state and exact attestation inputs", () => {
    const manifestA = buildYoutubeExtractionWorkerArtifactManifest({
      rootDir: process.cwd(),
      releaseSha: "0123456789abcdef0123456789abcdef01234567",
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      allowedSnapshotDigest:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    });
    const manifestB = buildYoutubeExtractionWorkerArtifactManifest({
      rootDir: process.cwd(),
      releaseSha: "0123456789abcdef0123456789abcdef01234567",
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      allowedSnapshotDigest:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    });

    expect(manifestA).toEqual(manifestB);
    expect(manifestA.files.map((entry) => entry.path)).toEqual([
      "lib/server/youtube-async-extraction.ts",
      "lib/server/youtube-extraction-service.ts",
      "lib/server/youtube-extraction-worker-rpc.ts",
      "lib/server/youtube-i031-runtime/bundle/manifest.json",
      "lib/server/youtube-i031-runtime/bundle/worker.mjs",
      "scripts/lib/youtube-extraction-worker-artifact.mjs",
      "scripts/lib/youtube-extraction-worker-ops.mjs",
      "scripts/manifests/youtube-extraction-expected-schema.json",
      "scripts/templates/com.homecook.youtube-extraction-worker.plist.template",
      "scripts/youtube-extraction-worker-artifact.mjs",
      "scripts/youtube-extraction-worker-mac-production.mjs",
      "scripts/youtube-extraction-worker-runner.mjs",
    ]);
    expect(manifestA.artifact_sha256).toMatch(/^[0-9a-f]{64}$/u);
  });
});

describe("YTASYNC-OPS launchd contract", () => {
  it("renders a plist that runs the worker via env -i and never embeds token contents", () => {
    const rootDir = createTempDir("yta-worker-root-");
    const homeDir = createTempDir("yta-worker-home-");
    const privateDir = createTempDir("yta-worker-private-");
    const configPath = join(privateDir, ".env.production.local");
    const manifestPath = join(privateDir, "artifact.json");
    const tokenPath = join(privateDir, "worker.jwt");
    const credentialPath = join(privateDir, "credential.json");
    const releaseSha = "0123456789abcdef0123456789abcdef01234567";
    const digest =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    writeModeFile(
      configPath,
      "HOMECOOK_YOUTUBE_WORKER_DATA_API_URL=http://127.0.0.1:54321/rest/v1\n",
    );
    writeModeFile(tokenPath, "super-secret-worker-jwt\n");
    const credential = buildYoutubeExtractionWorkerCredentialState({
      tokenFile: tokenPath,
      generation: 1,
      jtiHash:
        "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      expiresAt: "2026-08-19T00:00:00.000Z",
      releaseSha,
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      allowedSnapshotDigest: digest,
    });
    writeCredentialMetadata(credentialPath, credential);
    writeModeFile(
      manifestPath,
      JSON.stringify(
        buildYoutubeExtractionWorkerArtifactManifest({
          rootDir: process.cwd(),
          releaseSha,
          schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
          allowedSnapshotDigest: digest,
        }),
      ),
    );

    const plist = renderYoutubeExtractionWorkerPlist({
      configPath,
      manifestPath,
      credentialPath,
      homeDir,
      nodeBin: "/opt/homebrew/bin/node",
      rootDir,
    });

    expect(plist).toContain(`<string>${YOUTUBE_EXTRACTION_WORKER_LABEL}</string>`);
    expect(plist).toContain("<string>/usr/bin/env</string>");
    expect(plist).toContain("<string>-i</string>");
    expect(plist).toContain(`<string>HOME=${homeDir}</string>`);
    expect(plist).toContain("<string>/opt/homebrew/bin/node</string>");
    expect(plist).toContain("<string>run</string>");
    expect(plist).toContain(`<string>${configPath}</string>`);
    expect(plist).toContain(`<string>${manifestPath}</string>`);
    expect(plist).toContain(`<string>${credentialPath}</string>`);
    expect(plist).not.toContain("super-secret-worker-jwt");
    expect(plist).not.toContain("HOMECOOK_YOUTUBE_WORKER_DATA_API_URL");
    expect(plist).not.toContain("<key>EnvironmentVariables</key>");
  });

  it("builds install and lifecycle plans only in dry-run mode", () => {
    const privateDir = createTempDir("yta-worker-lifecycle-");
    const configPath = join(privateDir, ".env.production.local");
    const manifestPath = join(privateDir, "artifact.json");
    const tokenPath = join(privateDir, "worker.jwt");
    const credentialPath = join(privateDir, "credential.json");
    const releaseSha = "0123456789abcdef0123456789abcdef01234567";
    const digest =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    writeModeFile(
      configPath,
      "HOMECOOK_YOUTUBE_WORKER_DATA_API_URL=http://127.0.0.1:54321/rest/v1\n",
    );
    writeModeFile(tokenPath, "worker-token\n");
    writeCredentialMetadata(
      credentialPath,
      buildYoutubeExtractionWorkerCredentialState({
        tokenFile: tokenPath,
        generation: 1,
        jtiHash:
          "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        expiresAt: "2026-08-19T00:00:00.000Z",
        releaseSha,
        schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
        allowedSnapshotDigest: digest,
      }),
    );
    writeModeFile(
      manifestPath,
      JSON.stringify(
        buildYoutubeExtractionWorkerArtifactManifest({
          rootDir: process.cwd(),
          releaseSha,
          schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
          allowedSnapshotDigest: digest,
        }),
      ),
    );

    const installPlan = buildYoutubeExtractionWorkerInstallPlan({
      configPath,
      manifestPath,
      credentialPath,
      homeDir: "/Users/tester",
      rootDir: "/Users/tester/homecook",
      nodeBin: "/usr/bin/node",
      userId: 501,
      dryRun: true,
    });
    expect(installPlan.commands).toHaveLength(2);
    expect(installPlan.service_target).toBe(
      "gui/501/com.homecook.youtube-extraction-worker",
    );

    const restartPlan = buildYoutubeExtractionWorkerLifecyclePlan({
      action: "restart",
      homeDir: "/Users/tester",
      userId: 501,
      dryRun: true,
    });
    expect(restartPlan.commands).toHaveLength(3);

    expect(() =>
      buildYoutubeExtractionWorkerLifecyclePlan({
        action: "start",
        homeDir: "/Users/tester",
        userId: 501,
        dryRun: false,
      }),
    ).toThrow(/manual only/i);
  });

  it("rejects service-role and secret-bearing worker config keys", () => {
    const privateDir = createTempDir("yta-worker-forbidden-config-");
    const configPath = join(privateDir, ".env.production.local");
    writeModeFile(configPath, "SUPABASE_SERVICE_ROLE_KEY=must-never-reach-worker\n");

    expect(() => renderYoutubeExtractionWorkerPlist({
      configPath,
      manifestPath: configPath,
      credentialPath: configPath,
      homeDir: "/Users/tester",
      nodeBin: "/usr/bin/node",
      rootDir: "/Users/tester/homecook",
    })).toThrow(/forbidden/i);
  });

  it("parses launchctl print output without requiring a live launchctl call", () => {
    expect(
      parseLaunchctlPrintStatus({
        serviceTarget: "gui/501/com.homecook.youtube-extraction-worker",
        status: 0,
        stdout: "state = waiting\npid = 4321\n",
      }),
    ).toMatchObject({
      loaded: true,
      state: "waiting",
      pid: 4321,
    });

    expect(
      parseLaunchctlPrintStatus({
        serviceTarget: "gui/501/com.homecook.youtube-extraction-worker",
        status: 113,
        stderr: "Could not find service",
      }),
    ).toMatchObject({
      loaded: false,
      state: "unloaded",
      pid: null,
    });
  });
});

describe("YTASYNC-OPS preflight, drain, rollback, credential", () => {
  it("fails closed on release, schema, digest, and queue drift", () => {
    const releaseSha = "0123456789abcdef0123456789abcdef01234567";
    const digest =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const privateDir = createTempDir("yta-worker-preflight-");
    const tokenPath = join(privateDir, "worker.jwt");
    writeModeFile(tokenPath, "worker-token\n");
    const credential = buildYoutubeExtractionWorkerCredentialState({
      tokenFile: tokenPath,
      generation: 1,
      jtiHash:
        "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      expiresAt: "2026-08-19T00:00:00.000Z",
      releaseSha,
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      allowedSnapshotDigest: digest,
    });
    const artifact = buildYoutubeExtractionWorkerArtifactManifest({
      rootDir: process.cwd(),
      releaseSha,
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      allowedSnapshotDigest: digest,
    });
    const app = buildYoutubeExtractionAppDescriptor({
      releaseSha,
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      expectedPolicyVersion: 1,
      expectedPolicySnapshotDigest: digest,
    });
    const policy = buildYoutubeExtractionCurrentPolicy({
      policySnapshotDigest: digest,
      enabled: true,
    });
    const queueState = buildYoutubeExtractionWorkerQueueState({
      queuedJobs: 0,
      processingJobs: 0,
      permitHeld: false,
      maintenanceMode: true,
      activeReleaseSha: releaseSha,
      activeSchemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      activePolicySnapshotDigest: digest,
    });

    const green = evaluateYoutubeExtractionWorkerPreflight({
      appDescriptor: app,
      workerArtifact: artifact,
      currentPolicy: policy,
      credentialState: credential,
      queueState,
      requirePolicyEnabled: true,
    });
    expect(green.ready).toBe(true);
    expect(green.blockers).toEqual([]);

    const red = evaluateYoutubeExtractionWorkerPreflight({
      appDescriptor: { ...app, release_sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      workerArtifact: artifact,
      currentPolicy: { ...policy, policy_snapshot_digest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
      credentialState: credential,
      queueState: { ...queueState, active_schema_identity: "other-schema" },
      requirePolicyEnabled: true,
    });
    expect(red.ready).toBe(false);
    expect(red.blockers).toEqual(expect.arrayContaining([
      "release_sha_mismatch",
      "allowed_snapshot_digest_mismatch",
      "queue_schema_identity_mismatch",
    ]));
  });

  it("requires an empty maintenance queue before drain and rollback rehearsal", () => {
    const artifact = buildYoutubeExtractionWorkerArtifactManifest({
      rootDir: process.cwd(),
      releaseSha: "0123456789abcdef0123456789abcdef01234567",
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      allowedSnapshotDigest:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    });
    const blockedDrain = buildYoutubeExtractionWorkerDrainPlan({
      workerArtifact: artifact,
      queueState: buildYoutubeExtractionWorkerQueueState({
        queuedJobs: 1,
        processingJobs: 0,
        permitHeld: true,
        maintenanceMode: false,
      }),
    });
    expect(blockedDrain.safe_to_stop).toBe(false);
    expect(blockedDrain.blockers).toEqual(expect.arrayContaining([
      "queued_jobs_present",
      "provider_permit_still_held",
      "maintenance_mode_disabled",
    ]));

    const privateDir = createTempDir("yta-worker-rollback-");
    const tokenPath = join(privateDir, "worker.jwt");
    writeModeFile(tokenPath, "worker-token\n");
    const credential = buildYoutubeExtractionWorkerCredentialState({
      tokenFile: tokenPath,
      generation: 1,
      jtiHash:
        "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      expiresAt: "2026-08-19T00:00:00.000Z",
      releaseSha: "0123456789abcdef0123456789abcdef01234567",
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      allowedSnapshotDigest:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    });
    const rollback = buildYoutubeExtractionWorkerRollbackPlan({
      currentArtifact: artifact,
      previousAppDescriptor: buildYoutubeExtractionAppDescriptor({
        releaseSha: "0123456789abcdef0123456789abcdef01234567",
        schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
        expectedPolicyVersion: 1,
        expectedPolicySnapshotDigest:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      }),
      queueState: buildYoutubeExtractionWorkerQueueState({
        queuedJobs: 0,
        processingJobs: 0,
        permitHeld: false,
        maintenanceMode: true,
        activeReleaseSha: "0123456789abcdef0123456789abcdef01234567",
        activeSchemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
        activePolicySnapshotDigest:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      }),
      currentPolicy: buildYoutubeExtractionCurrentPolicy({
        policySnapshotDigest:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        enabled: false,
      }),
      credentialState: credential,
      dryRun: true,
    });
    expect(rollback.ready).toBe(true);
    expect(rollback.steps[0]).toContain("freeze enqueue publish");
  });

  it("writes secret-safe credential metadata and enforces exact generation increments", () => {
    const privateDir = createTempDir("yta-worker-credential-");
    const tokenPath = join(privateDir, "worker.jwt");
    const metadataPath = join(privateDir, "credential.json");
    writeModeFile(tokenPath, "worker-token\n");

    const bootstrap = buildYoutubeExtractionWorkerCredentialState({
      tokenFile: tokenPath,
      generation: 1,
      jtiHash:
        "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      expiresAt: "2026-08-19T00:00:00.000Z",
      releaseSha: "0123456789abcdef0123456789abcdef01234567",
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      allowedSnapshotDigest:
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    });
    writeCredentialMetadata(metadataPath, bootstrap);
    const metadataText = readFileSync(metadataPath, "utf8");

    expect(metadataText).toContain("\"token_file_sha256\"");
    expect(metadataText).not.toContain("worker-token");
    expect(() =>
      rotateYoutubeExtractionWorkerCredential({
        tokenFile: tokenPath,
        expectedGeneration: 1,
        nextGeneration: 3,
        jtiHash:
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        expiresAt: "2026-08-26T00:00:00.000Z",
        releaseSha: "0123456789abcdef0123456789abcdef01234567",
        schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
        allowedSnapshotDigest:
          "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      }),
    ).toThrow(/expectedgeneration \+ 1/i);
  });

  it("keeps the CLIs dry-run and redacted by default", () => {
    const privateDir = createTempDir("yta-worker-cli-");
    const tokenPath = join(privateDir, "worker.jwt");
    const metadataPath = join(privateDir, "credential.json");
    const manifestPath = join(privateDir, "artifact.json");
    const appPath = join(privateDir, "app.json");
    const policyPath = join(privateDir, "policy.json");
    const configPath = join(privateDir, ".env.production.local");
    writeModeFile(tokenPath, "worker-token\n");
    writeModeFile(
      configPath,
      "HOMECOOK_YOUTUBE_WORKER_DATA_API_URL=http://127.0.0.1:54321/rest/v1\n",
    );

    const releaseSha = "0123456789abcdef0123456789abcdef01234567";
    const digest =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

    const artifact = buildYoutubeExtractionWorkerArtifactManifest({
      rootDir: process.cwd(),
      releaseSha,
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      allowedSnapshotDigest: digest,
    });
    writeModeFile(manifestPath, JSON.stringify(artifact));
    writeModeFile(
      appPath,
      JSON.stringify(
        buildYoutubeExtractionAppDescriptor({
          releaseSha,
          schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
          expectedPolicyVersion: 1,
          expectedPolicySnapshotDigest: digest,
        }),
      ),
    );
    writeModeFile(
      policyPath,
      JSON.stringify(buildYoutubeExtractionCurrentPolicy({
        policySnapshotDigest: digest,
        enabled: true,
      })),
    );
    writeCredentialMetadata(
      metadataPath,
      buildYoutubeExtractionWorkerCredentialState({
        tokenFile: tokenPath,
        generation: 1,
        jtiHash:
          "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        expiresAt: "2026-08-19T00:00:00.000Z",
        releaseSha,
        schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
        allowedSnapshotDigest: digest,
      }),
    );

    const runner = spawnSync(
      process.execPath,
      [
        "scripts/youtube-extraction-worker-runner.mjs",
        "run",
        "--dry-run",
        "--config",
        configPath,
        "--manifest",
        manifestPath,
        "--credential",
        metadataPath,
        "--app-descriptor",
        appPath,
        "--policy",
        policyPath,
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    expect(runner.status, runner.stderr).toBe(0);
    expect(runner.stdout).toContain("\"dry_run\": true");
    expect(runner.stdout).not.toContain("worker-token");

    const credentialWithoutDryRun = spawnSync(
      process.execPath,
      [
        "scripts/youtube-extraction-worker-mac-production.mjs",
        "credential-bootstrap",
        "--token-file",
        tokenPath,
        "--generation",
        "1",
        "--jti-hash",
        "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        "--expires-at",
        "2026-08-19T00:00:00.000Z",
        "--release-sha",
        releaseSha,
        "--schema-identity",
        YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
        "--allowed-snapshot-digest",
        digest,
      ],
      { cwd: process.cwd(), encoding: "utf8" },
    );
    expect(credentialWithoutDryRun.status).not.toBe(0);
    expect(credentialWithoutDryRun.stderr).toMatch(/manual only/i);

    const health = buildYoutubeExtractionWorkerHealth({
      status: { loaded: true, state: "running", pid: 1234 },
      preflight: { ready: true, blockers: [] },
      drain: { safe_to_stop: true, blockers: [] },
    });
    expect(health.ok).toBe(true);
  });
});
