import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildYoutubeExtractionAppDescriptor,
  buildYoutubeExtractionCurrentPolicy,
  buildYoutubeExtractionWorkerArtifactManifest,
  buildYoutubeExtractionWorkerQueueState,
  ensureAbsolutePath,
  materializeYoutubeExtractionWorkerArtifact,
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

function makeRemovable(path: string) {
  if (!existsSync(path)) return;
  chmodSync(path, 0o700);
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory()) makeRemovable(join(path, entry.name));
  }
}

function createReleaseInputs(privateDir: string, {
  releaseSha = "0123456789abcdef0123456789abcdef01234567",
  digest = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  enabled = true,
} = {}) {
  const tokenPath = join(privateDir, "worker.jwt");
  const credentialPath = join(privateDir, "credential.json");
  const appPath = join(privateDir, "app.json");
  const policyPath = join(privateDir, "policy.json");
  const artifactDir = join(privateDir, "worker-release");
  writeModeFile(tokenPath, "worker-token\n");
  const materialized = materializeYoutubeExtractionWorkerArtifact({
    rootDir: process.cwd(),
    outputDir: artifactDir,
    releaseSha,
    schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
    allowedSnapshotDigest: digest,
  });
  writeModeFile(appPath, JSON.stringify(buildYoutubeExtractionAppDescriptor({
    releaseSha,
    schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
    expectedPolicyVersion: 1,
    expectedPolicySnapshotDigest: digest,
  })));
  writeModeFile(policyPath, JSON.stringify(buildYoutubeExtractionCurrentPolicy({
    policySnapshotDigest: digest,
    enabled,
  })));
  writeCredentialMetadata(credentialPath, buildYoutubeExtractionWorkerCredentialState({
    tokenFile: tokenPath,
    generation: 1,
    jtiHash: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    expiresAt: "2026-08-19T00:00:00.000Z",
    releaseSha,
    schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
    allowedSnapshotDigest: digest,
  }));
  return {
    appPath,
    artifactDir,
    credentialPath,
    digest,
    expectedSchemaPath: join(
      artifactDir,
      "scripts/manifests/youtube-extraction-expected-schema.json",
    ),
    manifestPath: materialized.manifest_path,
    policyPath,
    releaseSha,
    tokenPath,
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory) {
      makeRemovable(directory);
      rmSync(directory, { recursive: true, force: true });
    }
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
    expect(manifestA.files.map((entry) => entry.path)).toEqual(expect.arrayContaining([
      "lib/server/youtube-i031-runtime/bundle/manifest.json",
      "lib/server/youtube-i031-runtime/bundle/worker.mjs",
      "scripts/lib/youtube-extraction-worker-artifact.mjs",
      "scripts/lib/youtube-extraction-worker-ops.mjs",
      "scripts/lib/youtube-extraction-worker-runtime.mjs",
      "scripts/manifests/youtube-extraction-expected-schema.json",
      "scripts/youtube-extraction-worker-runner.mjs",
    ]));
    expect(manifestA.artifact_sha256).toMatch(/^[0-9a-f]{64}$/u);
  });
});

describe("YTASYNC-OPS launchd contract", () => {
  it("renders a plist that runs the worker via env -i and never embeds token contents", () => {
    const homeDir = createTempDir("yta-worker-home-");
    const privateDir = createTempDir("yta-worker-private-");
    const configPath = join(privateDir, ".env.production.local");
    const inputs = createReleaseInputs(privateDir);

    writeModeFile(
      configPath,
      "HOMECOOK_YOUTUBE_WORKER_DATA_API_URL=http://127.0.0.1:54321/rest/v1\n",
    );
    const plist = renderYoutubeExtractionWorkerPlist({
      configPath,
      manifestPath: inputs.manifestPath,
      credentialPath: inputs.credentialPath,
      appDescriptorPath: inputs.appPath,
      currentPolicyPath: inputs.policyPath,
      expectedSchemaPath: inputs.expectedSchemaPath,
      homeDir,
      nodeBin: "/opt/homebrew/bin/node",
      rootDir: inputs.artifactDir,
    });

    expect(plist).toContain(`<string>${YOUTUBE_EXTRACTION_WORKER_LABEL}</string>`);
    expect(plist).toContain("<string>/usr/bin/env</string>");
    expect(plist).toContain("<string>-i</string>");
    expect(plist).toContain(`<string>HOME=${homeDir}</string>`);
    expect(plist).toContain("<string>/opt/homebrew/bin/node</string>");
    expect(plist).toContain("<string>run</string>");
    expect(plist).toContain(`<string>${configPath}</string>`);
    expect(plist).toContain(`<string>${inputs.manifestPath}</string>`);
    expect(plist).toContain(`<string>${inputs.credentialPath}</string>`);
    expect(plist).not.toContain("worker-token");
    expect(plist).not.toContain("HOMECOOK_YOUTUBE_WORKER_DATA_API_URL");
    expect(plist).not.toContain("<key>EnvironmentVariables</key>");
  });

  it("builds install and lifecycle plans only in dry-run mode", () => {
    const privateDir = createTempDir("yta-worker-lifecycle-");
    const configPath = join(privateDir, ".env.production.local");
    const inputs = createReleaseInputs(privateDir);
    writeModeFile(
      configPath,
      "HOMECOOK_YOUTUBE_WORKER_DATA_API_URL=http://127.0.0.1:54321/rest/v1\n",
    );
    const installPlan = buildYoutubeExtractionWorkerInstallPlan({
      configPath,
      manifestPath: inputs.manifestPath,
      credentialPath: inputs.credentialPath,
      appDescriptorPath: inputs.appPath,
      currentPolicyPath: inputs.policyPath,
      expectedSchemaPath: inputs.expectedSchemaPath,
      homeDir: "/Users/tester",
      rootDir: inputs.artifactDir,
      nodeBin: "/usr/bin/node",
      userId: 501,
      dryRun: true,
    });
    expect(installPlan.commands).toHaveLength(2);
    expect(installPlan.preflight.ready).toBe(true);
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

  it("rejects a launchd root outside the attested artifact directory", () => {
    const privateDir = createTempDir("yta-worker-root-drift-");
    const configPath = join(privateDir, ".env.production.local");
    const inputs = createReleaseInputs(privateDir);
    writeModeFile(
      configPath,
      "HOMECOOK_YOUTUBE_WORKER_DATA_API_URL=http://127.0.0.1:54321/rest/v1\n",
    );

    expect(() => buildYoutubeExtractionWorkerInstallPlan({
      configPath,
      manifestPath: inputs.manifestPath,
      credentialPath: inputs.credentialPath,
      appDescriptorPath: inputs.appPath,
      currentPolicyPath: inputs.policyPath,
      expectedSchemaPath: inputs.expectedSchemaPath,
      homeDir: "/Users/tester",
      rootDir: process.cwd(),
      nodeBin: "/usr/bin/node",
      userId: 501,
      dryRun: true,
    })).toThrow(/artifact root mismatch/iu);
  });

  it("refuses to emit launchctl commands when release preflight does not match", () => {
    const privateDir = createTempDir("yta-worker-install-blocked-");
    const configPath = join(privateDir, ".env.production.local");
    const inputs = createReleaseInputs(privateDir, { enabled: false });
    writeModeFile(inputs.appPath, JSON.stringify(buildYoutubeExtractionAppDescriptor({
      releaseSha: inputs.releaseSha,
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      expectedPolicyVersion: 1,
      expectedPolicySnapshotDigest: "f".repeat(64),
    })));
    writeModeFile(
      configPath,
      "HOMECOOK_YOUTUBE_WORKER_DATA_API_URL=http://127.0.0.1:54321/rest/v1\n",
    );

    expect(() => buildYoutubeExtractionWorkerInstallPlan({
      configPath,
      manifestPath: inputs.manifestPath,
      credentialPath: inputs.credentialPath,
      appDescriptorPath: inputs.appPath,
      currentPolicyPath: inputs.policyPath,
      expectedSchemaPath: inputs.expectedSchemaPath,
      homeDir: "/Users/tester",
      rootDir: inputs.artifactDir,
      nodeBin: "/usr/bin/node",
      userId: 501,
      dryRun: true,
    })).toThrow(/preflight failed: allowed_snapshot_digest_mismatch/u);
  });

  it("rejects service-role and secret-bearing worker config keys", () => {
    const privateDir = createTempDir("yta-worker-forbidden-config-");
    const configPath = join(privateDir, ".env.production.local");
    writeModeFile(configPath, "SUPABASE_SERVICE_ROLE_KEY=must-never-reach-worker\n");

    expect(() => renderYoutubeExtractionWorkerPlist({
      configPath,
      manifestPath: configPath,
      credentialPath: configPath,
      appDescriptorPath: configPath,
      currentPolicyPath: configPath,
      expectedSchemaPath: configPath,
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
    const inputs = createReleaseInputs(privateDir);
    const configPath = join(privateDir, ".env.production.local");
    writeModeFile(
      configPath,
      "HOMECOOK_YOUTUBE_WORKER_DATA_API_URL=http://127.0.0.1:54321/rest/v1\n",
    );

    const runner = spawnSync(
      process.execPath,
      [
        join(
          inputs.artifactDir,
          "scripts/youtube-extraction-worker-runner.mjs",
        ),
        "run",
        "--dry-run",
        "--config",
        configPath,
        "--manifest",
        inputs.manifestPath,
        "--credential",
        inputs.credentialPath,
        "--app-descriptor",
        inputs.appPath,
        "--policy",
        inputs.policyPath,
        "--expected-schema",
        inputs.expectedSchemaPath,
      ],
      {
        cwd: privateDir,
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
        inputs.tokenPath,
        "--generation",
        "1",
        "--jti-hash",
        "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        "--expires-at",
        "2026-08-19T00:00:00.000Z",
        "--release-sha",
        inputs.releaseSha,
        "--schema-identity",
        YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
        "--allowed-snapshot-digest",
        inputs.digest,
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

  it("runs the immutable artifact outside the repository and drains on SIGTERM", async () => {
    const privateDir = createTempDir("yta-worker-non-dry-run-");
    const inputs = createReleaseInputs(privateDir);
    const providerPath = join(privateDir, "provider.env");
    const configPath = join(privateDir, ".env.production.local");
    writeModeFile(providerPath, "YOUTUBE_API_KEY=fake-test-key\n");

    let observedAuthorization: string | undefined;
    let resolveClaim!: () => void;
    const claimed = new Promise<void>((resolve) => { resolveClaim = resolve; });
    const server = createServer((request, response) => {
      observedAuthorization = request.headers.authorization;
      request.resume();
      request.once("end", () => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ status: "empty", applied: false }));
        resolveClaim();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test address");
    writeModeFile(configPath, [
      `HOMECOOK_YOUTUBE_WORKER_DATA_API_URL=http://127.0.0.1:${address.port}/rest/v1`,
      `HOMECOOK_YOUTUBE_WORKER_PROVIDER_SECRET_FILE=${providerPath}`,
      "HOMECOOK_YOUTUBE_WORKER_ID=test-worker",
      "HOMECOOK_YOUTUBE_WORKER_POLL_INTERVAL_MS=10",
      "",
    ].join("\n"));

    const child = spawn(process.execPath, [
      join(inputs.artifactDir, "scripts/youtube-extraction-worker-runner.mjs"),
      "run",
      "--config", configPath,
      "--manifest", inputs.manifestPath,
      "--credential", inputs.credentialPath,
      "--app-descriptor", inputs.appPath,
      "--policy", inputs.policyPath,
      "--expected-schema", inputs.expectedSchemaPath,
    ], { cwd: privateDir, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    try {
      await claimed;
      child.kill("SIGTERM");
      const exitCode = await new Promise<number | null>((resolve) => child.once("exit", resolve));
      expect(exitCode, stderr).toBe(0);
      expect(observedAuthorization).toBe("Bearer worker-token");
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
