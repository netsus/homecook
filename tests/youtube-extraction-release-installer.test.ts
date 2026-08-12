import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
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
  readYoutubeExtractionExpectedSchema,
  sha256File,
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
const GREEN_I031_PREFLIGHT = Object.freeze({
  ready: true,
  codexCliVersion: "0.144.0-alpha.4",
  chatGptLogin: true,
  toolsReady: true,
});

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
  rootDir = process.cwd(),
} = {}) {
  const tokenPath = join(privateDir, "worker.jwt");
  const credentialPath = join(privateDir, "credential.json");
  const appPath = join(privateDir, "app.json");
  const policyPath = join(privateDir, "policy.json");
  const artifactDir = join(privateDir, "worker-release");
  writeModeFile(tokenPath, "worker-token\n");
  const materialized = materializeYoutubeExtractionWorkerArtifact({
    rootDir,
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
    artifactSha256: materialized.manifest.artifact_sha256,
    expectedSchemaSha256: materialized.manifest.expected_schema_sha256,
  })));
  writeModeFile(policyPath, JSON.stringify(buildYoutubeExtractionCurrentPolicy({
    policySnapshotDigest: digest,
    enabled,
  })));
  writeCredentialMetadata(credentialPath, buildYoutubeExtractionWorkerCredentialState({
    tokenFile: tokenPath,
    generation: 1,
    jtiHash: "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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
    expect(manifestA.expected_schema_sha256).toBe(sha256File(
      join(process.cwd(), "scripts/manifests/youtube-extraction-expected-schema.json"),
    ));
    const app = buildYoutubeExtractionAppDescriptor({
      releaseSha: manifestA.release_sha,
      schemaIdentity: manifestA.schema_identity,
      expectedPolicyVersion: manifestA.policy_version,
      expectedPolicySnapshotDigest: manifestA.allowed_snapshot_digest,
      artifactSha256: manifestA.artifact_sha256,
      expectedSchemaSha256: manifestA.expected_schema_sha256,
    });
    expect(app).toMatchObject({
      artifact_sha256: manifestA.artifact_sha256,
      expected_schema_sha256: manifestA.expected_schema_sha256,
    });
  });

  it("rejects duplicate and incomplete expected-schema authority inventories", () => {
    const privateDir = createTempDir("yta-expected-schema-invalid-");
    const schemaPath = join(privateDir, "expected-schema.json");
    const canonicalPath = join(
      process.cwd(),
      "scripts/manifests/youtube-extraction-expected-schema.json",
    );
    const valid = JSON.parse(readFileSync(
      canonicalPath,
      "utf8",
    ));
    expect(readYoutubeExtractionExpectedSchema(canonicalPath)).toMatchObject({
      catalog_fingerprint_components: expect.arrayContaining([
        "table_owners",
        "sequence_owners",
        "schema_owners",
        "owner_role_attributes",
        "memberships",
      ]),
      memberships: [
        {
          member: "authenticator",
          role: "youtube_extraction_credential_manager",
          admin: false,
          inherit: false,
          set: true,
        },
        {
          member: "authenticator",
          role: "youtube_extraction_worker",
          admin: false,
          inherit: false,
          set: true,
        },
      ],
    });
    const duplicate = JSON.stringify(valid).replace(
      '"memberships":',
      '"memberships": [], "memberships":',
    );
    writeModeFile(schemaPath, duplicate);
    expect(() => readYoutubeExtractionExpectedSchema(schemaPath))
      .toThrow(/duplicate json key/i);

    const incomplete = {
      ...valid,
      catalog_fingerprint_components: valid.catalog_fingerprint_components.filter(
        (component: string) => component !== "owner_role_attributes",
      ),
      memberships: [{
        member: "authenticator",
        role: "youtube_extraction_worker",
        admin: false,
      }],
    };
    writeModeFile(schemaPath, JSON.stringify(incomplete));
    expect(() => readYoutubeExtractionExpectedSchema(schemaPath))
      .toThrow(/expected schema manifest is invalid/i);
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
      i031Preflight: GREEN_I031_PREFLIGHT,
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
      i031Preflight: GREEN_I031_PREFLIGHT,
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
      i031Preflight: GREEN_I031_PREFLIGHT,
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
      artifactSha256: JSON.parse(readFileSync(inputs.manifestPath, "utf8")).artifact_sha256,
      expectedSchemaSha256: sha256File(inputs.expectedSchemaPath),
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

  it("refuses install when the exact i031 startup preflight is not attested", () => {
    const privateDir = createTempDir("yta-worker-i031-preflight-");
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
      rootDir: inputs.artifactDir,
      nodeBin: "/usr/bin/node",
      userId: 501,
      dryRun: true,
      i031Preflight: {
        ready: true,
        codexCliVersion: "0.145.0",
        chatGptLogin: true,
        toolsReady: true,
      },
    })).toThrow(/i031 preflight/i);
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
  it("fails closed when descriptor artifact or expected-schema byte digests drift", () => {
    const privateDir = createTempDir("yta-worker-digest-drift-");
    const inputs = createReleaseInputs(privateDir);
    const artifact = JSON.parse(readFileSync(inputs.manifestPath, "utf8"));
    const app = buildYoutubeExtractionAppDescriptor({
      releaseSha: inputs.releaseSha,
      schemaIdentity: artifact.schema_identity,
      expectedPolicyVersion: artifact.policy_version,
      expectedPolicySnapshotDigest: inputs.digest,
      artifactSha256: "a".repeat(64),
      expectedSchemaSha256: "b".repeat(64),
    });
    const preflight = evaluateYoutubeExtractionWorkerPreflight({
      appDescriptor: app,
      workerArtifact: artifact,
      currentPolicy: buildYoutubeExtractionCurrentPolicy({
        policySnapshotDigest: inputs.digest,
        enabled: true,
      }),
      credentialState: JSON.parse(readFileSync(inputs.credentialPath, "utf8")),
      expectedSchema: JSON.parse(readFileSync(inputs.expectedSchemaPath, "utf8")),
      expectedSchemaSha256: sha256File(inputs.expectedSchemaPath),
      requirePolicyEnabled: true,
    });

    expect(preflight.ready).toBe(false);
    expect(preflight.blockers).toEqual(expect.arrayContaining([
      "artifact_digest_mismatch",
      "expected_schema_digest_mismatch",
    ]));
  });

  it("passes expected schema bytes into the mac-production preflight loader", () => {
    const privateDir = createTempDir("yta-worker-cli-schema-drift-");
    const inputs = createReleaseInputs(privateDir);
    chmodSync(inputs.expectedSchemaPath, 0o600);
    writeFileSync(inputs.expectedSchemaPath, `${readFileSync(inputs.expectedSchemaPath, "utf8")} `);
    const result = spawnSync(process.execPath, [
      "scripts/youtube-extraction-worker-mac-production.mjs",
      "preflight",
      "--manifest", inputs.manifestPath,
      "--credential", inputs.credentialPath,
      "--app-descriptor", inputs.appPath,
      "--policy", inputs.policyPath,
      "--expected-schema", inputs.expectedSchemaPath,
    ], { cwd: process.cwd(), encoding: "utf8" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/artifact file drift|expected schema/i);
  });

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
      artifactSha256: artifact.artifact_sha256,
      expectedSchemaSha256: artifact.expected_schema_sha256,
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
        artifactSha256: artifact.artifact_sha256,
        expectedSchemaSha256: artifact.expected_schema_sha256,
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

  it("runs an immutable i031 artifact through claim, persistence, finalize, and SIGTERM", async () => {
    const privateDir = createTempDir("yta-worker-non-dry-run-");
    const fixtureRoot = join(privateDir, "fixture-root");
    for (const relativePath of [
      "scripts/youtube-extraction-worker-runner.mjs",
      "scripts/lib/youtube-extraction-worker-artifact.mjs",
      "scripts/lib/youtube-extraction-worker-ops.mjs",
      "scripts/lib/youtube-extraction-worker-runtime.mjs",
      "scripts/manifests/youtube-extraction-expected-schema.json",
      "scripts/templates/com.homecook.youtube-extraction-worker.plist.template",
    ]) {
      const destination = join(fixtureRoot, relativePath);
      mkdirSync(join(destination, ".."), { recursive: true });
      cpSync(join(process.cwd(), relativePath), destination);
    }
    const fixtureBundle = join(fixtureRoot, "lib/server/youtube-i031-runtime/bundle");
    mkdirSync(fixtureBundle, { recursive: true });
    writeModeFile(join(fixtureBundle, "worker.mjs"), `
      import { writeFile } from "node:fs/promises";
      const args = Object.fromEntries(process.argv.slice(2).reduce((all, value, index, list) => {
        if (value.startsWith("--")) all.push([value.slice(2), list[index + 1]]);
        return all;
      }, []));
      let sequence = 0;
      const pending = new Map();
      process.on("message", (message) => {
        if (message?.type !== "homecook-worker-rpc-response") return;
        const entry = pending.get(message.requestId);
        if (!entry) return;
        pending.delete(message.requestId);
        message.ok ? entry.resolve(message.data) : entry.reject(new Error(message.errorCode));
      });
      function request(operation, payload) {
        const requestId = String(++sequence);
        return new Promise((resolve, reject) => {
          pending.set(requestId, { resolve, reject });
          process.send({ type: "homecook-worker-rpc-request", requestId, operation, payload });
        });
      }
      await request("title", { title: "provider artifact title" });
      await writeFile(args.metadata, JSON.stringify({ videoTitle: "provider artifact title" }));
      const transcript = await request("cache", {
        operation: "transcript_read",
        payload: {},
      });
      if (!transcript.cache) {
        await request("cache", {
          operation: "transcript_upsert",
          payload: {
            language: "ko",
            source_provider: "youtube_timedtext",
            source_kind: "caption",
            transcript_text: "bounded transcript",
            segments_json: [],
            expires_at: "2099-01-01T00:00:00.000Z",
          },
        });
      }
      await request("event", {
        kind: "transcript",
        payload: { provider: "youtube_timedtext", cache_hit: false, status: "success" },
      });
      await request("methods", { methodLabels: ["boil"] });
      await writeFile(args.result, JSON.stringify({
        identity: { pipeline: "i031" },
        videoTitle: "provider artifact title",
        recipe: { title: "artifact recipe title", ingredients: [], steps: ["끓인다"] },
        meta: { modelCallCount: 2 },
        workerDataPersisted: true,
      }));
      process.disconnect();
    `, 0o700);
    const providerPath = join(privateDir, "provider.env");
    const configPath = join(privateDir, ".env.production.local");
    const fakeHome = join(privateDir, "home");
    const fakeBin = join(privateDir, "bin");
    const authDir = join(fakeHome, ".codex");
    mkdirSync(fakeBin, { recursive: true });
    mkdirSync(authDir, { recursive: true });
    writeModeFile(join(authDir, "auth.json"), "{}\n");
    const codexBin = join(fakeBin, "codex");
    writeModeFile(codexBin, [
      "#!/bin/sh",
      "if [ \"$1\" = \"--version\" ]; then echo 'codex-cli 0.144.0-alpha.4'; exit 0; fi",
      "if [ \"$1\" = \"login\" ]; then echo 'Logged in using ChatGPT'; exit 0; fi",
      "exit 1",
      "",
    ].join("\n"), 0o700);
    for (const executable of [
      "python3",
      "yt-dlp",
      "ffmpeg",
      "ffprobe",
      "sandbox-exec",
      "swiftc",
    ]) {
      writeModeFile(join(fakeBin, executable), "#!/bin/sh\necho ok\n", 0o700);
    }
    const fixtureRuntimePath = join(
      fixtureRoot,
      "scripts/lib/youtube-extraction-worker-runtime.mjs",
    );
    const fixtureRuntimeSource = readFileSync(fixtureRuntimePath, "utf8");
    expect(fixtureRuntimeSource).toContain("platform = process.platform,");
    expect(fixtureRuntimeSource).toContain('accessPath("/usr/bin/sandbox-exec")');
    expect(fixtureRuntimeSource).toContain('accessPath("/usr/bin/swiftc")');
    writeFileSync(
      fixtureRuntimePath,
      fixtureRuntimeSource
        .replace("platform = process.platform,", 'platform = "darwin",')
        .replace(
          'accessPath("/usr/bin/sandbox-exec")',
          `accessPath(${JSON.stringify(join(fakeBin, "sandbox-exec"))})`,
        )
        .replace(
          'accessPath("/usr/bin/swiftc")',
          `accessPath(${JSON.stringify(join(fakeBin, "swiftc"))})`,
        ),
      "utf8",
    );
    const inputs = createReleaseInputs(privateDir, { rootDir: fixtureRoot });
    writeModeFile(providerPath, [
      "YOUTUBE_API_KEY=fake-test-key",
      `YOUTUBE_I031_CODEX_BIN=${codexBin}`,
      "",
    ].join("\n"));

    let observedAuthorization: string | undefined;
    const rpcCalls: string[] = [];
    let resolveSucceeded!: () => void;
    const succeeded = new Promise<void>((resolve) => { resolveSucceeded = resolve; });
    const server = createServer((request, response) => {
      observedAuthorization = request.headers.authorization;
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => { body += chunk; });
      request.once("end", () => {
        const rpcName = request.url?.split("/").at(-1) ?? "";
        rpcCalls.push(rpcName);
        const payloadByRpc: Record<string, unknown> = {
          claim_youtube_extraction_job: {
            job_id: "99999999-9999-4999-8999-999999999999",
            youtube_video_id: "abc123DEF45",
            lease_generation: 2,
            policy_snapshot_digest: inputs.digest,
            result_affecting_options: {},
          },
          claim_youtube_extractor_permit: { permit_generation: 3 },
          start_youtube_extraction_attempt: { applied: true },
          heartbeat_youtube_extraction_job: { updated: true },
          heartbeat_youtube_extractor_permit: { updated: true },
          read_youtube_extraction_worker_catalog: {
            applied: true,
            ingredients: [],
            ingredient_synonyms: [],
            cooking_methods: [],
          },
          access_youtube_extraction_worker_cache: {
            applied: true,
            cache: body.includes("transcript_read") ? null : { id: "cache-row" },
          },
          record_youtube_extraction_worker_event: { applied: true, recorded: true },
          resolve_youtube_extraction_worker_methods: { applied: true, methods: [] },
          update_youtube_extraction_job_title: { applied: true, updated: true },
          resolve_youtube_extraction_job_draft: { title: "artifact recipe title" },
          finalize_youtube_extraction_job: { finalized: true },
          release_youtube_extractor_permit: { released: true },
        };
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(payloadByRpc[rpcName] ?? null));
        if (rpcName === "finalize_youtube_extraction_job") resolveSucceeded();
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
    ], {
      cwd: privateDir,
      env: {
        ...process.env,
        HOME: fakeHome,
        PATH: fakeBin,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const childExit = new Promise<number | null>((resolve) => child.once("exit", resolve));
    try {
      await Promise.race([
        succeeded,
        childExit.then((exitCode) => {
          throw new Error(`worker exited before finalize (${String(exitCode)}): ${stderr}`);
        }),
      ]);
      child.kill("SIGTERM");
      const exitCode = await childExit;
      expect(exitCode, stderr).toBe(0);
      expect(observedAuthorization).toBe("Bearer worker-token");
      expect(rpcCalls).toEqual(expect.arrayContaining([
        "claim_youtube_extraction_job",
        "read_youtube_extraction_worker_catalog",
        "access_youtube_extraction_worker_cache",
        "record_youtube_extraction_worker_event",
        "resolve_youtube_extraction_worker_methods",
        "update_youtube_extraction_job_title",
        "resolve_youtube_extraction_job_draft",
        "finalize_youtube_extraction_job",
      ]));
    } finally {
      if (child.exitCode === null) child.kill("SIGKILL");
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 30_000);
});
