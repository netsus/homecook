import { describe, expect, it, vi } from "vitest";

import {
  YOUTUBE_ASYNC_POLICY,
  classifyYoutubeExtractionWorkerError,
  createYoutubeExtractionWorker,
} from "@/lib/server/youtube-async-extraction";
import { createYoutubeExtractionWorkerRpcAdapter } from
  "@/lib/server/youtube-extraction-worker-rpc";

describe("YTASYNC-WORKER restricted RPC adapter", () => {
  it("maps only stable worker failure codes and keeps generic provider text out of persistence", () => {
    expect(classifyYoutubeExtractionWorkerError({ code: "QUOTA_EXCEEDED" }))
      .toBe("QUOTA_EXCEEDED");
    expect(classifyYoutubeExtractionWorkerError(new Error("NETWORK_ERROR: socket closed")))
      .toBe("NETWORK_ERROR");
    expect(classifyYoutubeExtractionWorkerError(new Error("provider leaked secret=abc")))
      .toBe("EXTRACTION_FAILED");
  });

  it("calls only the exact worker RPC and carries job/permit fences to finalize", async () => {
    const rpc = vi.fn(async (name: string) => ({
      data: name === "finalize_youtube_extraction_job"
        ? { applied: true, finalized: true }
        : null,
      error: null,
    }));
    const adapter = createYoutubeExtractionWorkerRpcAdapter({ rpc });

    expect(await adapter.finalize({
      jobId: "11111111-1111-4111-8111-111111111111",
      workerId: "worker-1",
      leaseGeneration: 7,
      permitGeneration: 9,
      finalizedDraft: { draft: { title: "김치찌개" } },
    })).toBe(true);
    expect(rpc).toHaveBeenCalledWith("finalize_youtube_extraction_job", {
      job_id: "11111111-1111-4111-8111-111111111111",
      worker_id: "worker-1",
      lease_generation: 7,
      finalized_draft_json: {
        draft: { title: "김치찌개" },
        worker_permit_generation: 9,
      },
    });
  });

  it("accepts exact idempotent SQL result keys and rejects stale zero-write results", async () => {
    const responses = [
      { updated: true },
      { released: true },
      { finalized: true },
      { applied: false, affected_count: 0 },
    ];
    const rpc = vi.fn(async () => ({ data: responses.shift(), error: null }));
    const adapter = createYoutubeExtractionWorkerRpcAdapter({ rpc });

    expect(await adapter.heartbeatJob({
      jobId: "11111111-1111-4111-8111-111111111111",
      workerId: "worker-1",
      leaseGeneration: 7,
    })).toBe(true);
    expect(await adapter.releasePermit({ workerId: "worker-1", permitGeneration: 9 }))
      .toBe(true);
    expect(await adapter.finalize({
      jobId: "11111111-1111-4111-8111-111111111111",
      workerId: "worker-1",
      leaseGeneration: 7,
      permitGeneration: 9,
      finalizedDraft: {},
    })).toBe(true);
    expect(await adapter.startAttempt({
      jobId: "11111111-1111-4111-8111-111111111111",
      workerId: "worker-1",
      leaseGeneration: 6,
      permitGeneration: 8,
    })).toBe(false);
  });

  it("requeues a permit-contended job without consuming an attempt and with the lease fence", async () => {
    const rpc = vi.fn(async () => ({
      data: { applied: true, requeued: true, attempt_consumed: false },
      error: null,
    }));
    const adapter = createYoutubeExtractionWorkerRpcAdapter({ rpc });

    expect(await adapter.requeueWithoutAttempt({
      jobId: "11111111-1111-4111-8111-111111111111",
      workerId: "worker-1",
      leaseGeneration: 7,
      minimumDelaySeconds: 1,
      maximumDelaySeconds: 4,
    })).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      "requeue_youtube_extraction_job_without_attempt",
      {
        job_id: "11111111-1111-4111-8111-111111111111",
        worker_id: "worker-1",
        lease_generation: 7,
        min_delay_seconds: 1,
        max_delay_seconds: 4,
      },
    );
  });

  it("immediately releases a claimed job when the provider permit is contended", async () => {
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
      requeueWithoutAttempt: vi.fn(async () => true),
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
    expect(adapter.requeueWithoutAttempt).toHaveBeenCalledWith({
      jobId: "job-1",
      workerId: "worker-1",
      leaseGeneration: 7,
      minimumDelaySeconds: 1,
      maximumDelaySeconds: 4,
    });
    expect(adapter.startAttempt).not.toHaveBeenCalled();
    expect(extract).not.toHaveBeenCalled();
  });

  it("never invokes the provider when the job snapshot does not match the artifact", async () => {
    const extract = vi.fn();
    const adapter = {
      claimJob: vi.fn(async () => ({
        id: "job-1",
        videoId: "abc123DEF45",
        leaseGeneration: 1,
        policySnapshotDigest: "0".repeat(64),
        resultAffectingOptions: YOUTUBE_ASYNC_POLICY.resultAffectingOptions,
      })),
      claimPermit: vi.fn(),
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

    expect(await worker.runOnce()).toBe("snapshot-mismatch");
    expect(adapter.claimPermit).not.toHaveBeenCalled();
    expect(extract).not.toHaveBeenCalled();
  });
});
