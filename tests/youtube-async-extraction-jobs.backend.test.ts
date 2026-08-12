import { describe, expect, it, vi } from "vitest";

import {
  YOUTUBE_ASYNC_POLICY,
  parseYoutubeExtractionJobRequest,
  projectYoutubeExtractionJob,
} from "@/lib/server/youtube-async-extraction";
import { createYoutubeAsyncExtractionHandlers } from
  "@/lib/server/youtube-async-extraction-routes";

function dependencies(authenticated = true) {
  const rpc = vi.fn(async () => ({
    data: {
      job_id: "11111111-1111-4111-8111-111111111111",
      status: "queued",
      deduplicated: false,
      submitted_at: "2026-08-12T00:00:00.000Z",
    },
    error: null,
  }));
  return {
    rpc,
    value: {
      authenticate: vi.fn(async () => authenticated
        ? { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", rpc }
        : null),
      readJob: vi.fn(async () => null),
      readSession: vi.fn(async () => null),
      listJobs: vi.fn(async () => []),
      markDelivered: vi.fn(async () => 0),
      markSeen: vi.fn(async () => 0),
      enqueueReadiness: vi.fn(async () => ({
        expectedPolicyVersion: YOUTUBE_ASYNC_POLICY.policyVersion,
        expectedPolicySnapshotDigest: YOUTUBE_ASYNC_POLICY.snapshotDigest,
        currentFingerprintKeyVersion: "1",
        previousFingerprintKeyVersion: null,
        previousFingerprintValidUntil: null,
      })),
      fingerprintKeys: vi.fn(() => ({
        current: { version: "1", secret: "k".repeat(32) },
        previous: null,
      })),
      cursorSecret: vi.fn(() => "cursor-secret".repeat(4)),
      asyncEnabled: vi.fn(() => true),
      now: vi.fn(() => new Date("2026-08-12T01:00:00.000Z")),
    },
  };
}

describe("YTASYNC-API exact job contract", () => {
  it("rejects empty, dual-branch and private policy fields before enqueue writes", () => {
    for (const body of [
      {},
      { youtube_url: "https://youtu.be/abc123DEF45", retry_job_id: "x" },
      { youtube_url: "https://youtu.be/abc123DEF45", expected_policy_version: 1 },
      { current_digest: "0".repeat(64) },
    ]) {
      expect(parseYoutubeExtractionJobRequest(body)).toMatchObject({
        code: "VALIDATION_ERROR",
      });
    }
  });

  it("uses refreshed user-session authority and the immutable policy snapshot", async () => {
    const deps = dependencies();
    const handlers = createYoutubeAsyncExtractionHandlers(deps.value);
    const response = await handlers.enqueue(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ youtube_url: "https://youtu.be/abc123DEF45" }),
    }));

    expect(response.status).toBe(202);
    expect(deps.rpc).toHaveBeenCalledWith("enqueue_youtube_extraction_job", {
      video_id: "abc123DEF45",
      expected_policy_version: 1,
      expected_policy_snapshot_digest: YOUTUBE_ASYNC_POLICY.snapshotDigest,
      current_key_version: "1",
      current_digest: expect.stringMatching(/^[0-9a-f]{64}$/u),
      previous_key_version: null,
      previous_digest: null,
      submission_mode: "background_notify",
    });
  });

  it("returns 401 before body validation on protected mutations", async () => {
    const deps = dependencies(false);
    const handlers = createYoutubeAsyncExtractionHandlers(deps.value);
    const delivered = await handlers.delivered(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ unexpected: true }),
    }));
    const seen = await handlers.seen(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ unexpected: true }),
    }));

    expect(delivered.status).toBe(401);
    expect(seen.status).toBe(401);
    expect(deps.value.markDelivered).not.toHaveBeenCalled();
    expect(deps.value.markSeen).not.toHaveBeenCalled();
  });

  it("keeps consumed-after-TTL succeeded and expires only an unconsumed draft", () => {
    const common = {
      id: "11111111-1111-4111-8111-111111111111",
      status: "succeeded" as const,
      created_at: "2026-08-12T00:00:00.000Z",
      started_at: "2026-08-12T00:00:01.000Z",
      completed_at: "2026-08-12T00:00:02.000Z",
      error_code: null,
    };
    const now = new Date("2026-08-13T00:00:00.000Z");
    expect(projectYoutubeExtractionJob({
      ...common,
      extraction_session: {
        id: "22222222-2222-4222-8222-222222222222",
        status: "consumed",
        recipe_id: "33333333-3333-4333-8333-333333333333",
        expires_at: "2026-08-12T12:00:00.000Z",
      },
    }, now).status).toBe("succeeded");
    expect(projectYoutubeExtractionJob({
      ...common,
      extraction_session: {
        id: "22222222-2222-4222-8222-222222222222",
        status: "draft",
        recipe_id: null,
        expires_at: "2026-08-12T12:00:00.000Z",
      },
    }, now)).toMatchObject({ status: "expired", can_retry: true });
  });
});
