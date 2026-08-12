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
import { createYoutubeAsyncExtractionHandlers } from
  "@/lib/server/youtube-async-extraction-routes";
import { createYoutubeExtractionService } from
  "@/lib/server/youtube-extraction-service";

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
  it("keeps provider execution request-independent and delegates draft resolution", async () => {
    const extractor = {
      extract: vi.fn(async () => ({
        identity: { provider: "i031" },
        recipe: { title: "김치찌개", ingredients: [], steps: [] },
        meta: { safe: true },
      })),
    };
    const resolveDraft = vi.fn(async () => ({
      extraction_id: "22222222-2222-4222-8222-222222222222",
      title: "김치찌개",
    }));
    const service = createYoutubeExtractionService({ extractor, resolveDraft });
    const result = await service.extract({
      jobId: "11111111-1111-4111-8111-111111111111",
      workerId: "worker-1",
      leaseGeneration: 7,
      videoId: "abc123DEF45",
      options: YOUTUBE_ASYNC_POLICY.resultAffectingOptions,
      signal: new AbortController().signal,
    });
    expect(extractor.extract).toHaveBeenCalledWith(expect.objectContaining({
      videoId: "abc123DEF45",
    }));
    expect(resolveDraft).toHaveBeenCalledWith(expect.objectContaining({
      jobId: "11111111-1111-4111-8111-111111111111",
      workerId: "worker-1",
      leaseGeneration: 7,
    }));
    expect(result).toEqual({ draft: {
      extraction_id: "22222222-2222-4222-8222-222222222222",
      title: "김치찌개",
    } });
  });

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

describe("YTASYNC-API route handlers", () => {
  function buildHandlers(overrides: Record<string, unknown> = {}) {
    const rpc = vi.fn(async () => ({
      data: {
        job_id: "11111111-1111-4111-8111-111111111111",
        status: "queued",
        deduplicated: false,
        submitted_at: "2026-08-12T00:00:00.000Z",
      },
      error: null,
    }));
    const dependencies = {
      authenticate: vi.fn(async () => ({
        userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        rpc,
      })),
      readJob: vi.fn(async () => null),
      readSession: vi.fn(async () => null),
      listJobs: vi.fn(async () => []),
      markDelivered: vi.fn(async () => 0),
      markSeen: vi.fn(async () => 0),
      fingerprintKeys: vi.fn(() => ({ current: "k".repeat(32), previous: null })),
      cursorSecret: vi.fn(() => "cursor-secret".repeat(4)),
      asyncEnabled: vi.fn(() => true),
      now: vi.fn(() => new Date("2026-08-12T01:00:00.000Z")),
      ...overrides,
    };
    return { handlers: createYoutubeAsyncExtractionHandlers(dependencies), dependencies, rpc };
  }

  it("enqueues with the refreshed user-session RPC and returns exact 202 data", async () => {
    const { handlers, rpc } = buildHandlers();
    const response = await handlers.enqueue(new Request(
      "http://localhost/api/v1/recipes/youtube/extraction-jobs",
      {
        method: "POST",
        body: JSON.stringify({ youtube_url: "https://youtu.be/abc123DEF45" }),
      },
    ));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        job_id: "11111111-1111-4111-8111-111111111111",
        status: "queued",
        deduplicated: false,
        submitted_at: "2026-08-12T00:00:00.000Z",
      },
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith("enqueue_youtube_extraction_job", {
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

  it("fails malformed bodies before any DB write", async () => {
    const { handlers, dependencies, rpc } = buildHandlers();
    const response = await handlers.enqueue(new Request(
      "http://localhost/api/v1/recipes/youtube/extraction-jobs",
      { method: "POST", body: JSON.stringify({ youtube_url: "x", policy_version: 1 }) },
    ));
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    expect(dependencies.authenticate).toHaveBeenCalledOnce();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns 401 before validation when the refreshed session is absent", async () => {
    const { handlers, rpc } = buildHandlers({ authenticate: vi.fn(async () => null) });
    const response = await handlers.enqueue(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ unexpected: true }),
    }));
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("uses indistinguishable 404 responses for missing or cross-owner jobs", async () => {
    const { handlers } = buildHandlers();
    const response = await handlers.status(
      new Request("http://localhost"),
      "11111111-1111-4111-8111-111111111111",
    );
    expect(response.status).toBe(404);
    expect((await response.json()).error).toMatchObject({
      code: "JOB_NOT_FOUND",
      fields: [],
    });
  });

  it("keeps the legacy sync success body while executing through sync_wait", async () => {
    const draft = { extraction_id: "22222222-2222-4222-8222-222222222222", title: "김치찌개" };
    const { handlers, rpc } = buildHandlers({
      readJob: vi.fn(async () => ({
        id: "11111111-1111-4111-8111-111111111111",
        youtube_video_id: "abc123DEF45",
        status: "succeeded",
        created_at: "2026-08-12T00:00:00.000Z",
        started_at: "2026-08-12T00:00:01.000Z",
        completed_at: "2026-08-12T00:00:02.000Z",
        error_code: null,
        extraction_session: {
          id: draft.extraction_id,
          status: "draft",
          recipe_id: null,
          expires_at: "2026-08-13T00:00:00.000Z",
        },
      })),
      readSession: vi.fn(async () => ({
        id: draft.extraction_id,
        status: "draft",
        recipe_id: null,
        expires_at: "2026-08-13T00:00:00.000Z",
        draft_json: draft,
      })),
      sleep: vi.fn(async () => undefined),
    });
    const response = await handlers.syncWait(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ youtube_url: "https://youtu.be/abc123DEF45" }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: draft, error: null });
    expect(rpc).toHaveBeenCalledWith("enqueue_youtube_extraction_job", expect.objectContaining({
      submission_mode: "sync_wait",
    }));
  });

  it("returns consumed sessions after TTL and expires only unconsumed drafts", async () => {
    const consumed = {
      id: "22222222-2222-4222-8222-222222222222",
      status: "consumed",
      draft_json: { must: "not-return" },
      recipe_id: "33333333-3333-4333-8333-333333333333",
      expires_at: "2026-08-11T00:00:00.000Z",
    };
    const { handlers } = buildHandlers({ readSession: vi.fn(async () => consumed) });
    const response = await handlers.session(
      new Request("http://localhost"),
      consumed.id,
    );
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
      status: "consumed",
      draft: null,
      recipe_id: consumed.recipe_id,
      recipe_path: `/recipes/${consumed.recipe_id}`,
    });
  });

  it("keeps delivered and seen as separate idempotent owner mutations", async () => {
    const markDelivered = vi.fn(async () => 1);
    const markSeen = vi.fn(async () => 1);
    const { handlers } = buildHandlers({ markDelivered, markSeen });
    const delivered = await handlers.delivered(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ delivery_keys: ["delivery-1"] }),
    }));
    const seen = await handlers.seen(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        job_ids: ["11111111-1111-4111-8111-111111111111"],
      }),
    }));
    expect(await delivered.json()).toMatchObject({ data: { delivered_count: 1 } });
    expect(await seen.json()).toMatchObject({ data: { seen_count: 1 } });
    expect(markDelivered).toHaveBeenCalledOnce();
    expect(markSeen).toHaveBeenCalledOnce();
  });
});
