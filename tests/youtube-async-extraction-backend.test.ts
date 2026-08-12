import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  YOUTUBE_ASYNC_POLICY,
  buildYoutubeExtractionFingerprint,
  createYoutubeExtractionWorker,
  decodeYoutubeExtractionCursor,
  encodeYoutubeExtractionCursor,
  isYoutubeAsyncExtractionEnabled,
  parseYoutubeExtractionJobRequest,
  projectYoutubeExtractionJob,
} from "@/lib/server/youtube-async-extraction";

describe("YTASYNC-CONTRACT/API", () => {
  it("keeps the async feature disabled unless the server-only rollout flag is explicit", () => {
    expect(isYoutubeAsyncExtractionEnabled({})).toBe(false);
    expect(isYoutubeAsyncExtractionEnabled({
      NEXT_PUBLIC_HOMECOOK_ENABLE_YOUTUBE_ASYNC_EXTRACTION: "1",
    })).toBe(false);
    expect(isYoutubeAsyncExtractionEnabled({
      HOMECOOK_ENABLE_YOUTUBE_ASYNC_EXTRACTION: "1",
    })).toBe(true);
  });

  it("accepts only the exact enqueue union and distinguishes invalid URLs", () => {
    expect(parseYoutubeExtractionJobRequest({
      youtube_url: "https://youtu.be/abc123DEF45",
    })).toEqual({ kind: "url", videoId: "abc123DEF45" });
    expect(parseYoutubeExtractionJobRequest({
      retry_job_id: "11111111-1111-4111-8111-111111111111",
    })).toEqual({
      kind: "retry",
      jobId: "11111111-1111-4111-8111-111111111111",
    });

    for (const body of [
      {},
      { youtube_url: "https://youtu.be/abc123DEF45", extra: true },
      {
        youtube_url: "https://youtu.be/abc123DEF45",
        retry_job_id: "11111111-1111-4111-8111-111111111111",
      },
      { expected_policy_version: 1 },
    ]) {
      expect(parseYoutubeExtractionJobRequest(body)).toEqual({
        code: "VALIDATION_ERROR",
        field: "body",
      });
    }
    expect(parseYoutubeExtractionJobRequest({ youtube_url: "https://example.com/video" }))
      .toEqual({ code: "INVALID_URL", field: "youtube_url" });
  });

  it("materializes the exact initial policy and purpose-bound fingerprint", () => {
    expect(YOUTUBE_ASYNC_POLICY).toMatchObject({
      policyKey: "primary",
      policyVersion: 1,
      extractorMode: "i031_codex_vision",
      pipelineIdentity: "9adc7876a02c2da55a92e3a65369bf4e803c78efb9a791717201eedc242c1908",
      fingerprintKeyVersion: "1",
      enabled: false,
    });
    expect(Object.keys(YOUTUBE_ASYNC_POLICY.resultAffectingOptions).sort()).toEqual([
      "codexEffort",
      "frameMode",
      "hybridAnchorBudget",
      "interval",
      "keyframeTotalLimit",
      "keyframesPerRecipe",
      "packetPromptTextOnly",
      "publicSourceBundle",
      "recipeMode",
      "screenOcrMode",
      "selectorCandidateLimit",
      "selectorEffort",
      "singleRecipeOnly",
      "sourceMode",
      "useApifyFallback",
      "useEvidencePackets",
      "useVisual",
    ]);

    const secret = "a".repeat(32);
    const fingerprint = buildYoutubeExtractionFingerprint({
      secret,
      userId: "11111111-1111-4111-8111-111111111111",
      videoId: "abc123DEF45",
      policy: YOUTUBE_ASYNC_POLICY,
    });
    expect(fingerprint.digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(fingerprint.digest).toBe(createHmac("sha256", secret)
      .update(fingerprint.preimage)
      .digest("hex"));
    expect(fingerprint.preimage).not.toContain(secret);
  });

  it("projects consumed-after-TTL before expiry and never exposes internal fields", () => {
    const projected = projectYoutubeExtractionJob({
      id: "11111111-1111-4111-8111-111111111111",
      status: "succeeded",
      created_at: "2026-08-12T00:00:00.000Z",
      started_at: "2026-08-12T00:00:02.000Z",
      completed_at: "2026-08-12T00:01:00.000Z",
      error_code: null,
      extraction_session: {
        id: "22222222-2222-4222-8222-222222222222",
        status: "consumed",
        recipe_id: "33333333-3333-4333-8333-333333333333",
        expires_at: "2026-08-11T00:00:00.000Z",
      },
      request_fingerprint: "must-not-leak",
      lease_owner: "must-not-leak",
    }, new Date("2026-08-12T01:00:00.000Z"));

    expect(projected).toEqual({
      job_id: "11111111-1111-4111-8111-111111111111",
      status: "succeeded",
      submitted_at: "2026-08-12T00:00:00.000Z",
      started_at: "2026-08-12T00:00:02.000Z",
      completed_at: "2026-08-12T00:01:00.000Z",
      result: {
        extraction_id: "22222222-2222-4222-8222-222222222222",
        review_path: null,
        recipe_id: "33333333-3333-4333-8333-333333333333",
        recipe_path: "/recipes/33333333-3333-4333-8333-333333333333",
      },
      error: null,
      can_retry: false,
    });
  });

  it("binds opaque cursors to owner and view", () => {
    const secret = "cursor-secret".repeat(4);
    const cursor = encodeYoutubeExtractionCursor({
      secret,
      userId: "11111111-1111-4111-8111-111111111111",
      view: "archive",
      completedAt: "2026-08-12T00:01:00.000Z",
      jobId: "22222222-2222-4222-8222-222222222222",
    });
    expect(decodeYoutubeExtractionCursor({
      cursor,
      secret,
      userId: "11111111-1111-4111-8111-111111111111",
      view: "archive",
    })).toEqual({
      completedAt: "2026-08-12T00:01:00.000Z",
      jobId: "22222222-2222-4222-8222-222222222222",
    });
    expect(() => decodeYoutubeExtractionCursor({
      cursor,
      secret,
      userId: "99999999-9999-4999-8999-999999999999",
      view: "archive",
    })).toThrow("INVALID_CURSOR");
  });
});

describe("YTASYNC-WORKER", () => {
  it("claims permit before starting and finalizes with all fencing generations", async () => {
    const calls: string[] = [];
    const adapter = {
      claimJob: vi.fn(async () => ({
        id: "job-1",
        videoId: "abc123DEF45",
        leaseGeneration: 7,
        policySnapshotDigest: YOUTUBE_ASYNC_POLICY.snapshotDigest,
        resultAffectingOptions: YOUTUBE_ASYNC_POLICY.resultAffectingOptions,
      })),
      claimPermit: vi.fn(async () => {
        calls.push("permit");
        return { permitGeneration: 9 };
      }),
      startAttempt: vi.fn(async () => {
        calls.push("start");
        return true;
      }),
      finalize: vi.fn(async () => {
        calls.push("finalize");
        return true;
      }),
      failOrRetry: vi.fn(async () => true),
      releasePermit: vi.fn(async () => {
        calls.push("release");
        return true;
      }),
      heartbeatJob: vi.fn(async () => true),
      heartbeatPermit: vi.fn(async () => true),
    };
    const extract = vi.fn(async () => ({ draft: { title: "김치찌개" } }));
    const worker = createYoutubeExtractionWorker({
      adapter,
      extract,
      workerId: "worker-1",
      allowedSnapshotDigest: YOUTUBE_ASYNC_POLICY.snapshotDigest,
    });

    expect(await worker.runOnce()).toBe("succeeded");
    expect(calls).toEqual(["permit", "start", "finalize", "release"]);
    expect(adapter.startAttempt).toHaveBeenCalledWith({
      jobId: "job-1",
      workerId: "worker-1",
      leaseGeneration: 7,
      permitGeneration: 9,
    });
    expect(adapter.finalize).toHaveBeenCalledWith(expect.objectContaining({
      jobId: "job-1",
      workerId: "worker-1",
      leaseGeneration: 7,
      permitGeneration: 9,
    }));
  });

  it("does not call the provider when the permit or start fence is rejected", async () => {
    const extract = vi.fn();
    const adapter = {
      claimJob: vi.fn(async () => ({
        id: "job-1",
        videoId: "abc123DEF45",
        leaseGeneration: 7,
        policySnapshotDigest: YOUTUBE_ASYNC_POLICY.snapshotDigest,
        resultAffectingOptions: YOUTUBE_ASYNC_POLICY.resultAffectingOptions,
      })),
      claimPermit: vi.fn(async () => null),
      startAttempt: vi.fn(),
      finalize: vi.fn(),
      failOrRetry: vi.fn(),
      releasePermit: vi.fn(),
      heartbeatJob: vi.fn(),
      heartbeatPermit: vi.fn(),
    };
    const worker = createYoutubeExtractionWorker({
      adapter,
      extract,
      workerId: "worker-1",
      allowedSnapshotDigest: YOUTUBE_ASYNC_POLICY.snapshotDigest,
    });
    expect(await worker.runOnce()).toBe("permit-unavailable");
    expect(extract).not.toHaveBeenCalled();
  });
});
