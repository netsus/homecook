import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
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
  const rehearsalRpcConfigSource = JSON.stringify({
    schema: "homecook.rehearsal-worker-rpc-config.v1",
    base_url: baseUrl,
    token_file: "rehearsal-worker.jwt",
    fixture_identity: runId,
    creation_nonce: "fixture-creation-nonce",
    policy_snapshot_digest: policySnapshotDigest,
    schema_identity: YOUTUBE_EXTRACTION_WORKER_RELEASE_SCHEMA_IDENTITY,
    allowed_snapshot_digest: allowedSnapshotDigest,
    lifecycle_version: "youtube-extraction-rpc-v1",
  });
  writePrivateFile(rehearsalRpcConfigPath, rehearsalRpcConfigSource, 0o400);

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
    "--rehearsal-rpc-config-digest",
    createHash("sha256").update(rehearsalRpcConfigSource).digest("hex"),
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

async function spawnRunnerAsync(command: "rehearsal-synthetic", args: string[]) {
  return await new Promise<{ code: number | null; stderr: string; stdout: string }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/youtube-extraction-worker-runner.mjs", command, ...args],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          HOMECOOK_REHEARSAL_MODE: "isolated-r2",
          HOMECOOK_REHEARSAL_RUN_ID: runId,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stderr = "";
    let stdout = "";
    let outputBytes = 0;
    const append = (target: "stderr" | "stdout", chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > 1_048_576) {
        child.kill("SIGTERM");
        reject(new Error("worker child output exceeded test bound"));
        return;
      }
      if (target === "stderr") stderr += chunk.toString("utf8");
      else stdout += chunk.toString("utf8");
    };
    child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));
    child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.once("error", reject);
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("worker child timed out"));
    }, 15_000);
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, stderr, stdout });
    });
  });
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

  it("runs the actual sealed child through the loopback fenced RPC lifecycle", async () => {
    const rpcNames = [
      "claim_youtube_extraction_job",
      "claim_youtube_extractor_permit",
      "start_youtube_extraction_attempt",
      "heartbeat_youtube_extraction_job",
      "heartbeat_youtube_extractor_permit",
      "read_youtube_extraction_worker_catalog",
      "report_youtube_extraction_progress",
      "resolve_youtube_extraction_job_draft",
      "finalize_youtube_extraction_job",
      "release_youtube_extractor_permit",
    ];
    const expectedSequence = [
      ...rpcNames.slice(0, 8),
      "heartbeat_youtube_extraction_job",
      "heartbeat_youtube_extractor_permit",
      ...rpcNames.slice(8),
    ];
    const responses: Record<string, object> = {
      claim_youtube_extraction_job: {
        job_id: "33333333-3333-4333-8333-333333333333",
        youtube_video_id: "synthetic01",
        lease_generation: 1,
        policy_snapshot_digest: allowedSnapshotDigest,
        result_affecting_options: { rehearsal: true },
      },
      claim_youtube_extractor_permit: { claimed: true, permit_generation: 1 },
      start_youtube_extraction_attempt: { started: true, attempt_count: 1 },
      heartbeat_youtube_extraction_job: { updated: true },
      heartbeat_youtube_extractor_permit: { updated: true },
      read_youtube_extraction_worker_catalog: {
        applied: true,
        cooking_methods: [],
        ingredients: [],
      },
      report_youtube_extraction_progress: { applied: true },
      resolve_youtube_extraction_job_draft: {
        synthetic: true,
        title: "Synthetic rehearsal recipe",
      },
      finalize_youtube_extraction_job: { finalized: true },
      release_youtube_extractor_permit: { released: true },
    };
    const requests: Array<{ body: Record<string, unknown>; name: string }> = [];
    const server = createServer(async (request, response) => {
      const name = request.url?.replace(/^\/rpc\//u, "") ?? "";
      let body = "";
      for await (const chunk of request) body += chunk.toString();
      if (
        request.method !== "POST"
        || !rpcNames.includes(name)
        || request.headers.authorization !== "Bearer synthetic-rehearsal-token-private"
        || request.headers.apikey !== "synthetic-rehearsal-token-private"
        || request.headers["x-homecook-rehearsal-fixture"] !== runId
      ) {
        response.statusCode = 403;
        response.end(JSON.stringify({ error: "forbidden" }));
        return;
      }
      requests.push({ body: JSON.parse(body), name });
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(responses[name]));
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("loopback server has no port");
      const fixture = materializeCliFixture(`http://127.0.0.1:${address.port}`);
      const result = await spawnRunnerAsync("rehearsal-synthetic", fixture.args);
      expect(result.code, result.stderr).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output).toMatchObject({
        provider_requests: 0,
        schema: "homecook.youtube-extraction-worker-rehearsal-result.v1",
        status: "succeeded",
        synthetic: true,
      });
      expect(output.rpc_sequence).toEqual(expectedSequence);
      const observedSequence = requests.map(({ name }) => name);
      expect(observedSequence.slice(0, 3)).toEqual(expectedSequence.slice(0, 3));
      expect(observedSequence.slice(3, 5).sort()).toEqual(
        expectedSequence.slice(3, 5).sort(),
      );
      expect(observedSequence.slice(5, 8)).toEqual(expectedSequence.slice(5, 8));
      expect(observedSequence.slice(8, 10).sort()).toEqual(
        expectedSequence.slice(8, 10).sort(),
      );
      expect(observedSequence.slice(10)).toEqual(expectedSequence.slice(10));
      expect(JSON.stringify(requests)).toContain('"lease_generation":1');
      expect(JSON.stringify(requests)).toContain('"permit_generation":1');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
