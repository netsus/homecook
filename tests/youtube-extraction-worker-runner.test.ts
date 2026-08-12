import { createServer, type Server } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createRestrictedPostgrestRpcClient,
  createYoutubeExtractionWorkerRuntime,
  runYoutubeExtractionWorkerPollLoop,
} from "../scripts/lib/youtube-extraction-worker-runtime.mjs";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe("YTASYNC-WORKER standalone runner", () => {
  it("uses only the restricted bearer token against loopback PostgREST RPC", async () => {
    const requests: Array<{ authorization: string | undefined; url: string; body: unknown }> = [];
    const server = createServer((request, response) => {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        requests.push({
          authorization: request.headers.authorization,
          url: request.url ?? "",
          body: JSON.parse(body),
        });
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ updated: true }));
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("missing test address");

    const client = createRestrictedPostgrestRpcClient({
      dataApiUrl: `http://127.0.0.1:${address.port}/rest/v1`,
      token: "restricted-worker-token",
    });
    await client.rpc("heartbeat_youtube_extraction_job", {
      job_id: "11111111-1111-4111-8111-111111111111",
      worker_id: "worker-1",
      lease_generation: 7,
      lease_seconds: 120,
    });

    expect(requests).toEqual([{
      authorization: "Bearer restricted-worker-token",
      url: "/rest/v1/rpc/heartbeat_youtube_extraction_job",
      body: {
        job_id: "11111111-1111-4111-8111-111111111111",
        worker_id: "worker-1",
        lease_generation: 7,
        lease_seconds: 120,
      },
    }]);
  });

  it("claims, heartbeats, runs i031, resolves, and finalizes through fenced RPCs", async () => {
    const digest = "a".repeat(64);
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const rpc = vi.fn(async (name: string, args: Record<string, unknown> = {}) => {
      calls.push({ name, args });
      const dataByName: Record<string, unknown> = {
        claim_youtube_extraction_job: {
          job_id: "11111111-1111-4111-8111-111111111111",
          youtube_video_id: "abc123DEF45",
          lease_generation: 4,
          policy_snapshot_digest: digest,
          result_affecting_options: {
            singleRecipeOnly: true,
            sourceMode: "source-text",
            frameMode: "hybrid",
          },
        },
        claim_youtube_extractor_permit: { permit_generation: 9 },
        start_youtube_extraction_attempt: { applied: true },
        heartbeat_youtube_extraction_job: { updated: true },
        heartbeat_youtube_extractor_permit: { updated: true },
        resolve_youtube_extraction_job_draft: { title: "김치찌개" },
        finalize_youtube_extraction_job: { finalized: true },
        release_youtube_extractor_permit: { released: true },
      };
      return { data: dataByName[name] ?? null, error: null };
    });
    const extractor = { extract: vi.fn(async () => ({
      identity: { pipeline: "i031" },
      recipe: { title: "김치찌개" },
      meta: { modelCallCount: 2 },
    })) };
    const runtime = createYoutubeExtractionWorkerRuntime({
      workerId: "worker-1",
      allowedSnapshotDigest: digest,
      rpc,
      extractor,
      heartbeatIntervalMs: 5,
    });

    await expect(runtime.runOnce()).resolves.toBe("succeeded");
    expect(extractor.extract).toHaveBeenCalledWith(expect.objectContaining({
      videoId: "abc123DEF45",
      signal: expect.any(AbortSignal),
    }));
    expect(calls.map((call) => call.name)).toEqual([
      "claim_youtube_extraction_job",
      "claim_youtube_extractor_permit",
      "start_youtube_extraction_attempt",
      "heartbeat_youtube_extraction_job",
      "heartbeat_youtube_extractor_permit",
      "resolve_youtube_extraction_job_draft",
      "heartbeat_youtube_extraction_job",
      "heartbeat_youtube_extractor_permit",
      "finalize_youtube_extraction_job",
      "release_youtube_extractor_permit",
    ]);
    expect(calls.at(-2)?.args.finalized_draft_json).toMatchObject({
      title: "김치찌개",
      worker_permit_generation: 9,
    });
  });

  it("stops polling and aborts the active extractor on SIGTERM-equivalent shutdown", async () => {
    const shutdown = new AbortController();
    let receivedSignal: AbortSignal | null = null;
    const runOnce = vi.fn(async ({ signal }: { signal: AbortSignal }) => {
      receivedSignal = signal;
      return new Promise<"idle">((resolve) => {
        signal.addEventListener("abort", () => resolve("idle"), { once: true });
      });
    });

    const loop = runYoutubeExtractionWorkerPollLoop({
      runOnce,
      signal: shutdown.signal,
      pollIntervalMs: 1,
    });
    await vi.waitFor(() => expect(runOnce).toHaveBeenCalledTimes(1));
    shutdown.abort(new Error("SIGTERM"));

    await expect(loop).resolves.toBe("stopped");
    expect((receivedSignal as AbortSignal | null)?.aborted).toBe(true);
    expect(runOnce).toHaveBeenCalledTimes(1);
  });

  it("fenced-requeues without starting an attempt when the permit is contended", async () => {
    const digest = "b".repeat(64);
    const rpc = vi.fn(async (name: string) => ({
      data: name === "claim_youtube_extraction_job"
        ? {
            job_id: "22222222-2222-4222-8222-222222222222",
            youtube_video_id: "abc123DEF45",
            lease_generation: 3,
            policy_snapshot_digest: digest,
            result_affecting_options: {},
          }
        : name === "requeue_youtube_extraction_job_without_attempt"
          ? { requeued: true }
          : null,
      error: null,
    }));
    const runtime = createYoutubeExtractionWorkerRuntime({
      workerId: "worker-2",
      allowedSnapshotDigest: digest,
      rpc,
      extractor: { extract: vi.fn() },
    });

    await expect(runtime.runOnce()).resolves.toBe("permit-unavailable");
    expect(rpc).toHaveBeenCalledWith(
      "requeue_youtube_extraction_job_without_attempt",
      {
        job_id: "22222222-2222-4222-8222-222222222222",
        worker_id: "worker-2",
        lease_generation: 3,
        min_delay_seconds: 2,
        max_delay_seconds: 8,
      },
    );
    expect(rpc).not.toHaveBeenCalledWith(
      "start_youtube_extraction_attempt",
      expect.anything(),
    );
  });

  it("performs zero persistence after a stale lease generation loses heartbeat", async () => {
    const digest = "c".repeat(64);
    const rpc = vi.fn(async (name: string) => ({
      data: name === "claim_youtube_extraction_job"
        ? {
            job_id: "33333333-3333-4333-8333-333333333333",
            youtube_video_id: "abc123DEF45",
            lease_generation: 8,
            policy_snapshot_digest: digest,
            result_affecting_options: {},
          }
        : name === "claim_youtube_extractor_permit"
          ? { permit_generation: 11 }
          : name === "start_youtube_extraction_attempt"
            ? { applied: true }
            : name === "heartbeat_youtube_extraction_job"
              ? { updated: false }
              : name === "heartbeat_youtube_extractor_permit"
                ? { updated: true }
                : name === "release_youtube_extractor_permit"
                  ? { released: false }
                  : null,
      error: null,
    }));
    const extract = vi.fn();
    const runtime = createYoutubeExtractionWorkerRuntime({
      workerId: "worker-stale",
      allowedSnapshotDigest: digest,
      rpc,
      extractor: { extract },
    });

    await expect(runtime.runOnce()).resolves.toBe("stale-fence");
    expect(extract).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith(
      "resolve_youtube_extraction_job_draft",
      expect.anything(),
    );
    expect(rpc).not.toHaveBeenCalledWith(
      "finalize_youtube_extraction_job",
      expect.anything(),
    );
    expect(rpc).not.toHaveBeenCalledWith(
      "fail_or_retry_youtube_extraction_job",
      expect.anything(),
    );
  });
});
