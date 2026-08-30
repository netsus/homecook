import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildYoutubeExtractionAppDescriptor,
  buildYoutubeExtractionCurrentPolicy,
  buildYoutubeExtractionWorkerQueueState,
  materializeYoutubeExtractionWorkerArtifact,
  verifyYoutubeExtractionWorkerArtifact,
  YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
} from "../scripts/lib/youtube-extraction-worker-artifact.mjs";
import {
  buildYoutubeExtractionWorkerCredentialState,
  writeCredentialMetadata,
} from "../scripts/lib/youtube-extraction-worker-ops.mjs";

const releaseSha = "a".repeat(40);
const allowedSnapshotDigest = "b".repeat(64);
const policySnapshotDigest = allowedSnapshotDigest;
const runId = "11111111-2222-4333-8444-555555555555";
const roots: string[] = [];

function writePrivateFile(path: string, contents: string, mode: number) {
  writeFileSync(path, contents, { encoding: "utf8", flag: "wx", mode });
  chmodSync(path, mode);
}

function makeRemovable(path: string) {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (stat.isDirectory()) {
    chmodSync(path, 0o700);
    for (const entry of readdirSync(path)) makeRemovable(join(path, entry));
    return;
  }
  chmodSync(path, 0o600);
}

function materializeCliFixture(baseUrl = "http://127.0.0.1:3000") {
  const root = mkdtempSync(join(
    realpathSync(tmpdir()),
    "homecook-worker-cli-rehearsal-",
  ));
  roots.push(root);
  chmodSync(root, 0o700);

  const artifactRoot = join(root, "artifact");
  const secretRoot = join(root, "secrets");
  mkdirSync(secretRoot, { mode: 0o700 });
  const materialized = materializeYoutubeExtractionWorkerArtifact({
    rootDir: process.cwd(),
    outputDir: artifactRoot,
    releaseSha,
    schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
    allowedSnapshotDigest,
  });

  const workerTokenPath = join(secretRoot, "worker.jwt");
  const rehearsalTokenPath = join(secretRoot, "rehearsal-worker.jwt");
  const configPath = join(secretRoot, "worker.env");
  const credentialPath = join(secretRoot, "credential.json");
  const appPath = join(secretRoot, "app.json");
  const policyPath = join(secretRoot, "policy.json");
  const queuePath = join(secretRoot, "queue.json");
  const rehearsalRpcConfigPath = join(secretRoot, "rehearsal-rpc-config.json");
  const expectedSchemaPath = join(
    artifactRoot,
    "scripts/manifests/youtube-extraction-expected-schema.json",
  );

  writePrivateFile(workerTokenPath, "synthetic-worker-token-private", 0o600);
  writePrivateFile(rehearsalTokenPath, "synthetic-rehearsal-token-private", 0o400);
  writePrivateFile(configPath, "# isolated rehearsal worker\n", 0o600);
  writeCredentialMetadata(
    credentialPath,
    buildYoutubeExtractionWorkerCredentialState({
      tokenFile: workerTokenPath,
      generation: 1,
      jtiHash: "d".repeat(64),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      releaseSha,
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      allowedSnapshotDigest,
      secretRoot,
    }),
    { secretRoot },
  );
  writePrivateFile(
    appPath,
    JSON.stringify(buildYoutubeExtractionAppDescriptor({
      releaseSha,
      schemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      expectedPolicyVersion: 1,
      expectedPolicySnapshotDigest: policySnapshotDigest,
      artifactSha256: materialized.manifest.artifact_sha256,
      expectedSchemaSha256: materialized.manifest.expected_schema_sha256,
    })),
    0o600,
  );
  writePrivateFile(
    policyPath,
    JSON.stringify(buildYoutubeExtractionCurrentPolicy({
      policyVersion: 1,
      policySnapshotDigest,
      enabled: true,
    })),
    0o600,
  );
  writePrivateFile(
    queuePath,
    JSON.stringify(buildYoutubeExtractionWorkerQueueState({
      maintenanceMode: true,
      activeReleaseSha: releaseSha,
      activeSchemaIdentity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      activePolicySnapshotDigest: policySnapshotDigest,
    })),
    0o600,
  );
  writePrivateFile(
    rehearsalRpcConfigPath,
    JSON.stringify({
      schema: "homecook.rehearsal-worker-rpc-config.v1",
      base_url: baseUrl,
      token_file: "rehearsal-worker.jwt",
      fixture_identity: runId,
      creation_nonce: "fixture-creation-nonce",
      policy_snapshot_digest: policySnapshotDigest,
      schema_identity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
      allowed_snapshot_digest: allowedSnapshotDigest,
      lifecycle_version: "youtube-extraction-rpc-v1",
    }),
    0o400,
  );

  const args = [
    "--secret-root", secretRoot,
    "--config", configPath,
    "--manifest", materialized.manifest_path,
    "--credential", credentialPath,
    "--app-descriptor", appPath,
    "--policy", policyPath,
    "--queue-state", queuePath,
    "--expected-schema", expectedSchemaPath,
    "--rehearsal-rpc-config", rehearsalRpcConfigPath,
  ];
  return { args, materialized, secretRoot };
}

function spawnRunner(command: "health" | "rehearsal-synthetic", args: string[]) {
  return spawnSync(
    process.execPath,
    ["scripts/youtube-extraction-worker-runner.mjs", command, ...args],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        HOMECOOK_REHEARSAL_MODE: "isolated-r2",
        HOMECOOK_REHEARSAL_RUN_ID: runId,
      },
      maxBuffer: 1_048_576,
      timeout: 15_000,
    },
  );
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    makeRemovable(root);
    rmSync(root, { force: true, recursive: true });
  }
});

describe("rehearsal worker CLI fixture", () => {
  it("passes the actual runner health preflight with exact private file modes", () => {
    const fixture = materializeCliFixture();
    expect(verifyYoutubeExtractionWorkerArtifact(fixture.materialized.manifest_path).release_sha)
      .toBe(releaseSha);
    expect(statSync(join(fixture.secretRoot, "worker.jwt")).mode & 0o777).toBe(0o600);
    expect(statSync(join(fixture.secretRoot, "rehearsal-worker.jwt")).mode & 0o777)
      .toBe(0o400);

    const result = spawnRunner("health", fixture.args);
    expect(result.status, result.stderr).toBe(0);
    const health = JSON.parse(result.stdout);
    expect(health, JSON.stringify(health, null, 2)).toMatchObject({
      loaded: true,
      ok: true,
      ready: true,
      state: "waiting",
    });
  });
});
