import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  decodeYoutubeExtractionCursor,
  encodeYoutubeExtractionCursor,
  parseYoutubeExtractionJobRequest,
} from "@/lib/server/youtube-async-extraction";
import {
  createYoutubeAsyncExtractionHandlers,
  parseYoutubeExtractionMutationCount,
} from "@/lib/server/youtube-async-extraction-routes";

const USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const JOB_ID = "11111111-1111-4111-8111-111111111111";

function buildHandlers(overrides: Record<string, unknown> = {}) {
  const rpc = vi.fn(async (name: string) => ({
    data: name === "enqueue_youtube_extraction_job"
      ? {
          job_id: JOB_ID,
          status: "queued",
          deduplicated: false,
          submitted_at: "2026-08-12T00:00:00.000Z",
        }
      : null,
    error: null,
  }));
  const readiness = {
    expectedPolicyVersion: 1,
    expectedPolicySnapshotDigest:
      "5a2fbc9b5dbbc567d74dfd35f709ba79f32683f95c825c0b2c27803906505c15",
    currentFingerprintKeyVersion: "2",
    previousFingerprintKeyVersion: "1",
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

  it("reuses the canonical URL rules for music.youtube.com", () => {
    expect(parseYoutubeExtractionJobRequest({
      youtube_url: "https://music.youtube.com/watch?v=abc123DEF45",
    })).toEqual({ kind: "url", videoId: "abc123DEF45" });
  });
});
