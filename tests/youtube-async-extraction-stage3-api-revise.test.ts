import { createHash, createHmac } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  YOUTUBE_ASYNC_POLICY,
  decodeYoutubeExtractionCursor,
  encodeYoutubeExtractionCursor,
  parseYoutubeExtractionJobRequest,
} from "@/lib/server/youtube-async-extraction";
import {
  createYoutubeAsyncExtractionHandlers,
  loadYoutubeExtractionEnqueueReadiness,
  parseYoutubeExtractionMutationCount,
} from "@/lib/server/youtube-async-extraction-routes";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const JOB_ID = "11111111-1111-4111-8111-111111111111";

function buildHandlers(overrides: Record<string, unknown> = {}) {
  const rpc = vi.fn(async (
    name: string,
    rpcArgs?: Record<string, unknown>,
  ) => {
    void rpcArgs;
    return {
      data: name === "enqueue_youtube_extraction_job"
        ? {
            job_id: JOB_ID,
            status: "queued",
            deduplicated: false,
            submitted_at: "2026-08-12T00:00:00.000Z",
          }
        : null,
      error: null,
    };
  });
  const readiness = {
    expectedPolicyVersion: 1,
    expectedPolicySnapshotDigest: YOUTUBE_ASYNC_POLICY.snapshotDigest,
    currentFingerprintKeyVersion: "2",
    previousFingerprintKeyVersion: "1",
    previousFingerprintValidUntil: "2026-08-14T00:00:00.000Z",
  };
  const deps = {
    authenticate: vi.fn(async () => ({ userId: USER_ID, rpc })),
    readJob: vi.fn(async () => null),
    readSession: vi.fn(async () => null),
    listJobs: vi.fn(async () => []),
    markDelivered: vi.fn(async () => 0),
    markSeen: vi.fn(async () => 0),
    enqueueReadiness: vi.fn(async () => readiness),
    fingerprintKeys: vi.fn(() => ({
      current: { version: "2", secret: "c".repeat(32) },
      previous: { version: "1", secret: "p".repeat(32) },
    })),
    cursorSecret: vi.fn(() => "cursor-secret".repeat(4)),
    asyncEnabled: vi.fn(() => true),
    now: vi.fn(() => new Date("2026-08-13T00:00:00.000Z")),
    ...overrides,
  };
  return { handlers: createYoutubeAsyncExtractionHandlers(deps), deps, rpc };
}

describe("YTASYNC Stage 3 API revise RED", () => {
  it("loads the installed app/schema/worker and DB credential gate as one readiness decision", async () => {
    const root = mkdtempSync(join(tmpdir(), "homecook-yta-app-gate-"));
    const descriptorPath = join(root, "app.json");
    const schemaPath = join(root, "schema.json");
    const workerPath = join(root, "worker.json");
    const releaseSha = "1".repeat(40);
    const digest = YOUTUBE_ASYNC_POLICY.snapshotDigest;
    const schemaIdentity = "youtube-extraction-worker-schema-v1";
    const artifactDigest = "a".repeat(64);
    const catalogFingerprint = "b".repeat(64);
    const env = {
      HOMECOOK_YOUTUBE_EXTRACTION_APP_DESCRIPTOR_PATH: descriptorPath,
      HOMECOOK_YOUTUBE_EXTRACTION_EXPECTED_SCHEMA_PATH: schemaPath,
      HOMECOOK_YOUTUBE_EXTRACTION_WORKER_MANIFEST_PATH: workerPath,
    };
    const expectedSchema = JSON.stringify({
      schema: "homecook.youtube-extraction-expected-schema",
      version: 1,
      schema_identity: schemaIdentity,
      catalog_fingerprint: catalogFingerprint,
    });
    const expectedSchemaSha256 = createHash("sha256")
      .update(expectedSchema)
      .digest("hex");
    const descriptor = {
      schema: "homecook.youtube-extraction-app-descriptor",
      version: 1,
      release_sha: releaseSha,
      schema_identity: schemaIdentity,
      expected_policy_version: 1,
      expected_policy_snapshot_digest: digest,
      artifact_sha256: artifactDigest,
      expected_schema_sha256: expectedSchemaSha256,
    };
    writeFileSync(descriptorPath, JSON.stringify(descriptor));
    writeFileSync(schemaPath, expectedSchema);
    writeFileSync(workerPath, JSON.stringify({
      schema: "homecook.youtube-extraction-worker-artifact",
      version: 1,
      deterministic: true,
      release_sha: releaseSha,
      schema_identity: schemaIdentity,
      policy_version: 1,
      allowed_snapshot_digest: digest,
      artifact_sha256: artifactDigest,
      expected_schema_sha256: expectedSchemaSha256,
    }));
    const rpc = vi.fn(async () => ({
      data: {
        ready: true,
        release_sha: releaseSha,
        schema_identity: schemaIdentity,
        policy_version: 1,
        policy_snapshot_digest: digest,
        allowed_snapshot_digest: digest,
        fingerprint_key_version: "2",
        previous_fingerprint_key_version: "1",
        previous_fingerprint_valid_until: "2026-08-14T00:00:00.000Z",
        credential_expires_at: "2026-08-14T00:00:00.000Z",
        catalog_fingerprint: catalogFingerprint,
      },
      error: null,
    }));
    try {
      expect(await loadYoutubeExtractionEnqueueReadiness(
        rpc,
        env,
        new Date("2026-08-13T00:00:00.000Z"),
      )).toEqual({
        expectedPolicyVersion: 1,
        expectedPolicySnapshotDigest: digest,
        currentFingerprintKeyVersion: "2",
        previousFingerprintKeyVersion: "1",
        previousFingerprintValidUntil: "2026-08-14T00:00:00.000Z",
      });
      writeFileSync(descriptorPath, JSON.stringify({
        ...descriptor,
        artifact_sha256: "c".repeat(64),
      }));
      expect(await loadYoutubeExtractionEnqueueReadiness(
        rpc, env, new Date("2026-08-13T00:00:00.000Z"),
      )).toBeNull();
      writeFileSync(descriptorPath, JSON.stringify(descriptor));
      writeFileSync(schemaPath, `${expectedSchema}\n`);
      expect(await loadYoutubeExtractionEnqueueReadiness(
        rpc, env, new Date("2026-08-13T00:00:00.000Z"),
      )).toBeNull();
      writeFileSync(schemaPath, expectedSchema);
      writeFileSync(workerPath, JSON.stringify({
        schema: "homecook.youtube-extraction-worker-artifact",
        version: 1,
        deterministic: true,
        release_sha: "2".repeat(40),
        schema_identity: schemaIdentity,
        policy_version: 1,
        allowed_snapshot_digest: digest,
        artifact_sha256: artifactDigest,
        expected_schema_sha256: expectedSchemaSha256,
      }));
      expect(await loadYoutubeExtractionEnqueueReadiness(
        rpc,
        env,
        new Date("2026-08-13T00:00:00.000Z"),
      )).toBeNull();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("fails readiness closed on catalog drift or credential cutoff", async () => {
    const root = mkdtempSync(join(tmpdir(), "homecook-yta-catalog-gate-"));
    const descriptorPath = join(root, "app.json");
    const schemaPath = join(root, "schema.json");
    const workerPath = join(root, "worker.json");
    const releaseSha = "1".repeat(40);
    const digest = YOUTUBE_ASYNC_POLICY.snapshotDigest;
    const artifactDigest = "a".repeat(64);
    const catalogFingerprint = "b".repeat(64);
    const schemaIdentity = "youtube-extraction-worker-schema-v1";
    const schema = JSON.stringify({
      schema: "homecook.youtube-extraction-expected-schema",
      version: 1,
      schema_identity: schemaIdentity,
      catalog_fingerprint: catalogFingerprint,
    });
    const schemaDigest = createHash("sha256").update(schema).digest("hex");
    writeFileSync(schemaPath, schema);
    for (const [path, value] of [
      [descriptorPath, {
        schema: "homecook.youtube-extraction-app-descriptor", version: 1,
        release_sha: releaseSha, schema_identity: schemaIdentity,
        expected_policy_version: 1, expected_policy_snapshot_digest: digest,
        artifact_sha256: artifactDigest, expected_schema_sha256: schemaDigest,
      }],
      [workerPath, {
        schema: "homecook.youtube-extraction-worker-artifact", version: 1,
        deterministic: true, release_sha: releaseSha,
        schema_identity: schemaIdentity, policy_version: 1,
        allowed_snapshot_digest: digest, artifact_sha256: artifactDigest,
        expected_schema_sha256: schemaDigest,
      }],
    ] as const) writeFileSync(path, JSON.stringify(value));
    const env = {
      HOMECOOK_YOUTUBE_EXTRACTION_APP_DESCRIPTOR_PATH: descriptorPath,
      HOMECOOK_YOUTUBE_EXTRACTION_EXPECTED_SCHEMA_PATH: schemaPath,
      HOMECOOK_YOUTUBE_EXTRACTION_WORKER_MANIFEST_PATH: workerPath,
    };
    const base = {
      ready: true, release_sha: releaseSha, schema_identity: schemaIdentity,
      policy_version: 1, policy_snapshot_digest: digest,
      allowed_snapshot_digest: digest, fingerprint_key_version: "2",
      previous_fingerprint_key_version: null,
      previous_fingerprint_valid_until: null,
      credential_expires_at: "2026-08-13T00:31:00.000Z",
      catalog_fingerprint: catalogFingerprint,
    };
    try {
      const cutoffRpc = vi.fn(async () => ({
        data: { ...base, credential_expires_at: "2026-08-13T00:30:00.000Z" },
        error: null,
      }));
      expect(await loadYoutubeExtractionEnqueueReadiness(
        cutoffRpc, env, new Date("2026-08-13T00:00:00.000Z"),
      )).toBeNull();
      const driftRpc = vi.fn(async () => ({
        data: { ...base, catalog_fingerprint: "c".repeat(64) }, error: null,
      }));
      expect(await loadYoutubeExtractionEnqueueReadiness(
        driftRpc, env, new Date("2026-08-13T00:00:00.000Z"),
      )).toBeNull();
      const expiredPreviousRpc = vi.fn(async () => ({
        data: {
          ...base,
          previous_fingerprint_key_version: "1",
          previous_fingerprint_valid_until: "2026-08-12T23:59:59.000Z",
        },
        error: null,
      }));
      expect(await loadYoutubeExtractionEnqueueReadiness(
        expiredPreviousRpc, env, new Date("2026-08-13T00:00:00.000Z"),
      )).toMatchObject({
        previousFingerprintKeyVersion: null,
        previousFingerprintValidUntil: null,
      });
      expect(readFileSync(schemaPath, "utf8")).toBe(schema);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("fails enqueue closed before its write when app/schema/release/credential readiness is absent", async () => {
    const { handlers, rpc } = buildHandlers({
      enqueueReadiness: vi.fn(async () => null),
    });
    const response = await handlers.enqueue(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ youtube_url: "https://youtu.be/abc123DEF45" }),
    }));

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("QUEUE_UNAVAILABLE");
    expect(rpc).not.toHaveBeenCalledWith(
      "enqueue_youtube_extraction_job",
      expect.anything(),
    );
  });

  it("passes current and previous HMAC version/digest pairs atomically", async () => {
    const { handlers, rpc } = buildHandlers();
    const response = await handlers.enqueue(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ youtube_url: "https://youtu.be/abc123DEF45" }),
    }));

    expect(response.status).toBe(202);
    const call = rpc.mock.calls.find(([name]) =>
      name === "enqueue_youtube_extraction_job")?.[1];
    expect(call).toMatchObject({
      current_key_version: "2",
      current_digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      previous_key_version: "1",
      previous_digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
    });
  });

  it("omits both previous HMAC fields after the rotation window expires", async () => {
    const { handlers, rpc } = buildHandlers({
      enqueueReadiness: vi.fn(async () => ({
        expectedPolicyVersion: 1,
        expectedPolicySnapshotDigest: YOUTUBE_ASYNC_POLICY.snapshotDigest,
        currentFingerprintKeyVersion: "2",
        previousFingerprintKeyVersion: null,
        previousFingerprintValidUntil: null,
      })),
      fingerprintKeys: vi.fn(() => ({
        current: { version: "2", secret: "c".repeat(32) },
        previous: null,
      })),
    });
    await handlers.enqueue(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ youtube_url: "https://youtu.be/abc123DEF45" }),
    }));
    expect(rpc).toHaveBeenCalledWith(
      "enqueue_youtube_extraction_job",
      expect.objectContaining({
        previous_key_version: null,
        previous_digest: null,
      }),
    );
  });

  it("accepts only the exact delivered/seen PostgREST result keys", () => {
    expect(parseYoutubeExtractionMutationCount(
      { delivered_count: 2 },
      "delivered_count",
    )).toBe(2);
    expect(parseYoutubeExtractionMutationCount(
      { seen_count: 3 },
      "seen_count",
    )).toBe(3);
    expect(() => parseYoutubeExtractionMutationCount(
      { updated: 2 },
      "delivered_count",
    )).toThrow("QUEUE_UNAVAILABLE");
  });

  it("passes the refreshed user RPC into status/session/list reads", async () => {
    const readJob = vi.fn(async () => null);
    const readSession = vi.fn(async () => null);
    const listJobs = vi.fn(async () => []);
    const { handlers, rpc } = buildHandlers({ readJob, readSession, listJobs });

    await handlers.status(new Request("http://localhost"), JOB_ID);
    await handlers.session(new Request("http://localhost"), JOB_ID);
    await handlers.list(new Request(
      "http://localhost?view=archive&limit=20",
    ));

    expect(readJob).toHaveBeenCalledWith(JOB_ID, rpc);
    expect(readSession).toHaveBeenCalledWith(JOB_ID, rpc);
    expect(listJobs).toHaveBeenCalledWith(
      "archive",
      null,
      21,
      rpc,
      new Date("2026-08-13T00:00:00.000Z"),
    );
  });

  it("issues bounded cursors with iat/exp and rejects expiry", () => {
    const secret = "cursor-secret".repeat(4);
    const issuedAt = new Date("2026-08-13T00:00:00.000Z");
    const cursor = encodeYoutubeExtractionCursor({
      secret,
      userId: USER_ID,
      view: "archive",
      completedAt: "2026-08-12T00:00:00.000Z",
      jobId: JOB_ID,
      now: issuedAt,
    });
    const [payload] = cursor.split(".");
    const decodedPayload = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );

    expect(decodedPayload).toMatchObject({
      iat: Math.floor(issuedAt.getTime() / 1000),
      exp: Math.floor(issuedAt.getTime() / 1000) + 30 * 24 * 60 * 60,
    });
    expect(() => decodeYoutubeExtractionCursor({
      cursor,
      secret,
      userId: USER_ID,
      view: "archive",
      now: new Date(decodedPayload.exp * 1000),
    })).toThrow("INVALID_CURSOR");
  });

  it("rejects a correctly signed legacy cursor without lifetime claims", () => {
    const secret = "cursor-secret".repeat(4);
    const payload = Buffer.from(JSON.stringify({
      completed_at: "2026-08-12T00:00:00.000Z",
      job_id: JOB_ID,
      user_id: USER_ID,
      version: 1,
      view: "archive",
    })).toString("base64url");
    const signature = createHmac("sha256", secret)
      .update(payload)
      .digest("base64url");
    expect(() => decodeYoutubeExtractionCursor({
      cursor: `${payload}.${signature}`,
      secret,
      userId: USER_ID,
      view: "archive",
      now: new Date("2026-08-13T00:00:00.000Z"),
    })).toThrow("INVALID_CURSOR");
  });

  it("maps an expired list cursor to INVALID_CURSOR before its owner read", async () => {
    const listJobs = vi.fn(async () => []);
    const { handlers } = buildHandlers({ listJobs });
    const cursor = encodeYoutubeExtractionCursor({
      secret: "cursor-secret".repeat(4),
      userId: USER_ID,
      view: "archive",
      completedAt: "2026-07-12T00:00:00.000Z",
      jobId: JOB_ID,
      now: new Date("2026-07-13T00:00:00.000Z"),
    });
    const response = await handlers.list(new Request(
      `http://localhost?view=archive&cursor=${encodeURIComponent(cursor)}`,
    ));

    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("INVALID_CURSOR");
    expect(listJobs).not.toHaveBeenCalled();
  });

  it("reuses the canonical URL rules for music.youtube.com", () => {
    expect(parseYoutubeExtractionJobRequest({
      youtube_url: "https://music.youtube.com/watch?v=abc123DEF45",
    })).toEqual({ kind: "url", videoId: "abc123DEF45" });
  });

  it("keeps the sync_wait enqueue compatible with canonical music URLs", async () => {
    const { handlers, rpc } = buildHandlers();
    const response = await handlers.enqueue(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        youtube_url: "https://music.youtube.com/watch?v=abc123DEF45",
      }),
    }), "sync_wait");

    expect(response.status).toBe(202);
    expect(rpc).toHaveBeenCalledWith(
      "enqueue_youtube_extraction_job",
      expect.objectContaining({
        video_id: "abc123DEF45",
        submission_mode: "sync_wait",
      }),
    );
  });
});
