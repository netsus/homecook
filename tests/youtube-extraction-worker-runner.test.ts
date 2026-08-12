import { createServer, type Server } from "node:http";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createRestrictedPostgrestRpcClient,
  createStandaloneYoutubeI031Extractor,
  createYoutubeExtractionWorkerRuntime,
  normalizeYoutubeExtractionRuntimeError,
  runYoutubeExtractionWorkerPollLoop,
  verifyStandaloneYoutubeI031Preflight,
} from "../scripts/lib/youtube-extraction-worker-runtime.mjs";

const servers: Server[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) =>
    new Promise<void>((resolve) => server.close(() => resolve()))));
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("YTASYNC-WORKER standalone runner", () => {
  it("requires the exact i031 CLI version, ChatGPT login, and tool preflight", async () => {
    const calls: Array<[string, string[]]> = [];
    const runCommand = vi.fn(async (command: string, args: string[]) => {
      calls.push([command, args]);
      if (args[0] === "--version") return { stdout: "codex-cli 0.144.0-alpha.4\n" };
      if (args[0] === "login") return { stdout: "Logged in using ChatGPT\n" };
      return { stdout: "ok\n" };
    });

    await expect(verifyStandaloneYoutubeI031Preflight({
      workerEnv: {
        HOME: "/tmp/homecook-worker",
        YOUTUBE_API_KEY: "provider-key",
        YOUTUBE_I031_CODEX_BIN: "/opt/homebrew/bin/codex",
      },
      accessPath: vi.fn(async () => undefined),
      runCommand,
      platform: "darwin",
    })).resolves.toMatchObject({
      codexBin: "/opt/homebrew/bin/codex",
      codexCliVersion: "0.144.0-alpha.4",
    });
    expect(calls).toEqual([
      ["/opt/homebrew/bin/codex", ["--version"]],
      ["/opt/homebrew/bin/codex", ["login", "status"]],
      ["python3", ["-c", "import cv2, yt_dlp"]],
      ["ffmpeg", ["-version"]],
      ["ffprobe", ["-version"]],
    ]);

    await expect(verifyStandaloneYoutubeI031Preflight({
      workerEnv: {
        HOME: "/tmp/homecook-worker",
        YOUTUBE_API_KEY: "provider-key",
        YOUTUBE_I031_CODEX_BIN: "/opt/homebrew/bin/codex",
      },
      accessPath: vi.fn(async () => undefined),
      runCommand: vi.fn(async () => ({ stdout: "codex-cli 0.145.0\n" })),
      platform: "darwin",
    })).rejects.toMatchObject({ code: "RUNTIME_UNAVAILABLE" });
  });

  it("normalizes provider failures into a bounded stable retry envelope", () => {
    expect(normalizeYoutubeExtractionRuntimeError(
      new Error(`NETWORK_ERROR ${"secret-provider-payload".repeat(100)}`),
    )).toEqual({
      code: "NETWORK_ERROR",
      retryable: true,
      stage: "provider",
    });
    expect(normalizeYoutubeExtractionRuntimeError(new Error("unknown secret"))).toEqual({
      code: "EXTRACTION_FAILED",
      retryable: false,
      stage: "provider",
    });
  });

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
        read_youtube_extraction_worker_catalog: {
          applied: true,
          ingredients: [],
          ingredient_synonyms: [],
          cooking_methods: [],
        },
        access_youtube_extraction_worker_cache: { applied: true, cache: null },
        reserve_youtube_extraction_worker_quota: { applied: true, reserved: true },
        record_youtube_extraction_worker_event: { applied: true, recorded: true },
        resolve_youtube_extraction_worker_methods: { applied: true, methods: [] },
        update_youtube_extraction_job_title: { applied: true, updated: true },
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
      videoTitle: "백종원의 원본 영상 제목",
      recipe: { title: "김치찌개" },
      meta: { modelCallCount: 2 },
      persistence: {
        cache_operations: [
          { operation: "transcript_read", payload: {} },
          { operation: "llm_read", payload: { source_hash: "a" } },
          { operation: "visual_read", payload: { source_hash: "b" } },
        ],
        quota_reservations: [{ provider: "external_transcript_api", units: 1 }],
        events: [{ kind: "visual", payload: { status: "success" } }],
        method_labels: ["끓이기"],
      },
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
      catalog: expect.objectContaining({ applied: true }),
    }));
    expect(calls.map((call) => call.name)).toEqual([
      "claim_youtube_extraction_job",
      "claim_youtube_extractor_permit",
      "start_youtube_extraction_attempt",
      "heartbeat_youtube_extraction_job",
      "heartbeat_youtube_extractor_permit",
      "read_youtube_extraction_worker_catalog",
      "access_youtube_extraction_worker_cache",
      "access_youtube_extraction_worker_cache",
      "access_youtube_extraction_worker_cache",
      "reserve_youtube_extraction_worker_quota",
      "record_youtube_extraction_worker_event",
      "resolve_youtube_extraction_worker_methods",
      "update_youtube_extraction_job_title",
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

  it("executes the immutable i031 artifact subprocess through fenced finalize", async () => {
    const root = mkdtempSync(join(tmpdir(), "yta-real-artifact-"));
    tempDirs.push(root);
    const bundle = join(root, "lib/server/youtube-i031-runtime/bundle");
    mkdirSync(bundle, { recursive: true });
    const workerPath = join(bundle, "worker.mjs");
    writeFileSync(workerPath, `
      import { writeFile } from "node:fs/promises";
      const args = Object.fromEntries(process.argv.slice(2).reduce((all, value, index, list) => {
        if (value.startsWith("--")) all.push([value.slice(2), list[index + 1]]);
        return all;
      }, []));
      await writeFile(args.result, JSON.stringify({
        identity: { pipeline: "i031" },
        videoTitle: "provider-video-title",
        recipe: { title: "artifact-success", ingredients: [], steps: [] },
        meta: { modelCallCount: 2 }
      }));
    `);
    chmodSync(workerPath, 0o555);
    const digest = "d".repeat(64);
    const rpc = vi.fn(async (name: string) => ({
      data: name === "claim_youtube_extraction_job"
        ? {
            job_id: "44444444-4444-4444-8444-444444444444",
            youtube_video_id: "abc123DEF45",
            lease_generation: 1,
            policy_snapshot_digest: digest,
            result_affecting_options: {},
          }
        : name === "claim_youtube_extractor_permit"
          ? { permit_generation: 1 }
          : name === "read_youtube_extraction_worker_catalog"
            ? { applied: true, ingredients: [], ingredient_synonyms: [], cooking_methods: [] }
            : name === "record_youtube_extraction_worker_event"
              ? { applied: true, recorded: true }
              : name === "resolve_youtube_extraction_worker_methods"
                ? { applied: true, methods: [] }
            : name === "resolve_youtube_extraction_job_draft"
              ? { applied: true, draft: { title: "artifact-success" } }
              : name === "finalize_youtube_extraction_job"
                ? { applied: true, finalized: true }
                : { applied: true, updated: true, released: true },
      error: null,
    }));
    const extractor = createStandaloneYoutubeI031Extractor({
      artifactRoot: root,
      workerEnv: { NODE_ENV: "test" },
      verifyPreflight: vi.fn(async () => ({
        codexBin: "/opt/homebrew/bin/codex",
        codexCliVersion: "0.144.0-alpha.4",
      })),
    });
    const runtime = createYoutubeExtractionWorkerRuntime({
      workerId: "worker-artifact",
      allowedSnapshotDigest: digest,
      rpc,
      extractor,
    });

    await expect(runtime.runOnce()).resolves.toBe("succeeded");
    expect(rpc).toHaveBeenCalledWith(
      "update_youtube_extraction_job_title",
      expect.objectContaining({ title: "provider-video-title" }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "finalize_youtube_extraction_job",
      expect.any(Object),
    );
  });

  it.each([
    { cache: { id: "77777777-7777-4777-8777-777777777777" }, expected: "transcript_touch" },
    { cache: null, expected: "transcript_upsert" },
  ])("bridges child cache $expected and all provider writes through fenced RPCs", async ({
    cache,
    expected,
  }) => {
    const root = mkdtempSync(join(tmpdir(), "yta-child-rpc-bridge-"));
    tempDirs.push(root);
    const bundle = join(root, "lib/server/youtube-i031-runtime/bundle");
    mkdirSync(bundle, { recursive: true });
    const workerPath = join(bundle, "worker.mjs");
    writeFileSync(workerPath, `
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
      const cached = await request("cache", { operation: "transcript_read", payload: {} });
      if (cached.cache?.id) {
        await request("cache", {
          operation: "transcript_touch",
          payload: { id: cached.cache.id },
        });
      } else {
        await request("cache", {
          operation: "transcript_upsert",
          payload: {
            language: "ko",
            source_provider: "youtube_timedtext",
            source_kind: "caption",
            transcript_text: "safe transcript",
            segments_json: [],
            expires_at: "2026-08-14T00:00:00.000Z",
          },
        });
      }
      await request("quota", { provider: "external_transcript_api", units: 1 });
      await request("event", {
        kind: "transcript",
        payload: { provider: "external_transcript_api", cache_hit: false, status: "success" },
      });
      await request("methods", { methodLabels: ["끓이기"] });
      await request("title", { title: "provider bridge title" });
      await writeFile(args.result, JSON.stringify({
        identity: { pipeline: "i031" },
        videoTitle: "provider bridge title",
        recipe: { title: "recipe title", ingredients: [], steps: [] },
        meta: { modelCallCount: 2 },
        workerDataPersisted: true
      }));
      process.disconnect();
    `);
    chmodSync(workerPath, 0o555);
    const calls: string[] = [];
    const workerRpcClient = {
      accessCache: vi.fn(async (operation: string) => {
        calls.push(operation);
        return { applied: true, cache };
      }),
      reserveQuota: vi.fn(async () => {
        calls.push("quota");
        return { applied: true, reserved: true };
      }),
      recordEvent: vi.fn(async () => {
        calls.push("event");
        return { applied: true, recorded: true };
      }),
      resolveMethods: vi.fn(async () => {
        calls.push("methods");
        return { applied: true, methods: [] };
      }),
      updateTitle: vi.fn(async () => {
        calls.push("title");
      }),
    };
    const extractor = createStandaloneYoutubeI031Extractor({
      artifactRoot: root,
      workerEnv: { NODE_ENV: "test" },
      verifyPreflight: vi.fn(async () => ({
        codexBin: "/opt/homebrew/bin/codex",
        codexCliVersion: "0.144.0-alpha.4",
      })),
    });

    await expect(extractor.extract({
      videoId: "abc123DEF45",
      signal: new AbortController().signal,
      claimedJob: {
        jobId: "77777777-7777-4777-8777-777777777777",
        videoId: "abc123DEF45",
        workerId: "worker-bridge",
        leaseGeneration: 4,
      },
      workerRpcClient,
    })).resolves.toMatchObject({
      videoTitle: "provider bridge title",
      recipe: { title: "recipe title" },
    });
    expect(calls).toEqual([
      "transcript_read",
      expected,
      "quota",
      "event",
      "methods",
      "title",
    ]);
  });

  it("stops the child before provider fallback when fenced quota is denied", async () => {
    const root = mkdtempSync(join(tmpdir(), "yta-child-quota-denied-"));
    tempDirs.push(root);
    const bundle = join(root, "lib/server/youtube-i031-runtime/bundle");
    mkdirSync(bundle, { recursive: true });
    const workerPath = join(bundle, "worker.mjs");
    const providerMarker = join(root, "provider-called");
    writeFileSync(workerPath, `
      import { writeFile } from "node:fs/promises";
      const args = Object.fromEntries(process.argv.slice(2).reduce((all, value, index, list) => {
        if (value.startsWith("--")) all.push([value.slice(2), list[index + 1]]);
        return all;
      }, []));
      process.on("message", async (message) => {
        if (message?.type !== "homecook-worker-rpc-response") return;
        if (message.ok) {
          await writeFile(process.env.PROVIDER_MARKER, "called");
          return;
        }
        await writeFile(args.error, JSON.stringify({
          code: message.errorCode,
          retryable: false,
          stage: "provider"
        }));
        process.disconnect();
        process.exitCode = 1;
      });
      process.send({
        type: "homecook-worker-rpc-request",
        requestId: "quota-1",
        operation: "quota",
        payload: { provider: "external_transcript_api", units: 1 }
      });
    `);
    chmodSync(workerPath, 0o555);
    const extractor = createStandaloneYoutubeI031Extractor({
      artifactRoot: root,
      workerEnv: { NODE_ENV: "test", PROVIDER_MARKER: providerMarker },
      verifyPreflight: vi.fn(async () => ({
        codexBin: "/opt/homebrew/bin/codex",
        codexCliVersion: "0.144.0-alpha.4",
      })),
    });

    await expect(extractor.extract({
      videoId: "abc123DEF45",
      signal: new AbortController().signal,
      claimedJob: {
        jobId: "88888888-8888-4888-8888-888888888888",
        videoId: "abc123DEF45",
        workerId: "worker-quota",
        leaseGeneration: 5,
      },
      workerRpcClient: {
        accessCache: vi.fn(async () => ({ applied: true, cache: null })),
        reserveQuota: vi.fn(async () => {
          throw Object.assign(new Error("QUOTA_EXCEEDED"), { code: "QUOTA_EXCEEDED" });
        }),
        recordEvent: vi.fn(),
        resolveMethods: vi.fn(),
        updateTitle: vi.fn(),
      },
    })).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    expect(existsSync(providerMarker)).toBe(false);
  });

  it("fenced-persists provider video title before a later extraction failure", async () => {
    const root = mkdtempSync(join(tmpdir(), "yta-title-before-failure-"));
    tempDirs.push(root);
    const bundle = join(root, "lib/server/youtube-i031-runtime/bundle");
    mkdirSync(bundle, { recursive: true });
    const workerPath = join(bundle, "worker.mjs");
    writeFileSync(workerPath, `
      import { writeFile } from "node:fs/promises";
      const args = Object.fromEntries(process.argv.slice(2).reduce((all, value, index, list) => {
        if (value.startsWith("--")) all.push([value.slice(2), list[index + 1]]);
        return all;
      }, []));
      await writeFile(args.metadata, JSON.stringify({ videoTitle: "provider-title-survives" }));
      process.exitCode = 1;
    `);
    chmodSync(workerPath, 0o555);
    const digest = "e".repeat(64);
    const calls: string[] = [];
    const rpc = vi.fn(async (name: string) => {
      calls.push(name);
      return {
        data: name === "claim_youtube_extraction_job"
          ? {
              job_id: "55555555-5555-4555-8555-555555555555",
              youtube_video_id: "abc123DEF45",
              lease_generation: 2,
              policy_snapshot_digest: digest,
              result_affecting_options: {},
            }
          : name === "claim_youtube_extractor_permit"
            ? { permit_generation: 2 }
            : name === "read_youtube_extraction_worker_catalog"
              ? { applied: true, ingredients: [], ingredient_synonyms: [], cooking_methods: [] }
              : { applied: true, updated: true, released: true },
        error: null,
      };
    });
    const extractor = createStandaloneYoutubeI031Extractor({
      artifactRoot: root,
      workerEnv: { NODE_ENV: "test" },
      verifyPreflight: vi.fn(async () => ({
        codexBin: "/opt/homebrew/bin/codex",
        codexCliVersion: "0.144.0-alpha.4",
      })),
    });
    const runtime = createYoutubeExtractionWorkerRuntime({
      workerId: "worker-title-failure",
      allowedSnapshotDigest: digest,
      rpc,
      extractor,
    });

    await expect(runtime.runOnce()).resolves.toBe("failed");
    expect(rpc).toHaveBeenCalledWith(
      "update_youtube_extraction_job_title",
      expect.objectContaining({ title: "provider-title-survives" }),
    );
    expect(calls.indexOf("update_youtube_extraction_job_title"))
      .toBeLessThan(calls.indexOf("fail_or_retry_youtube_extraction_job"));
  });

  it.each([
    "NETWORK_ERROR",
    "RATE_LIMITED",
    "PROVIDER_TIMEOUT",
    "TRANSIENT_INTERNAL_ERROR",
    "NOT_RECIPE_VIDEO",
    "QUOTA_EXCEEDED",
    "RUNTIME_UNAVAILABLE",
    "EXTRACTION_FAILED",
  ])("carries the bounded child error sidecar to fail_or_retry: %s", async (errorCode) => {
    const root = mkdtempSync(join(tmpdir(), "yta-child-error-"));
    tempDirs.push(root);
    const bundle = join(root, "lib/server/youtube-i031-runtime/bundle");
    mkdirSync(bundle, { recursive: true });
    const workerPath = join(bundle, "worker.mjs");
    writeFileSync(workerPath, `
      import { writeFile } from "node:fs/promises";
      const args = Object.fromEntries(process.argv.slice(2).reduce((all, value, index, list) => {
        if (value.startsWith("--")) all.push([value.slice(2), list[index + 1]]);
        return all;
      }, []));
      await writeFile(args.error, JSON.stringify({
        code: process.env.TEST_ERROR_CODE,
        retryable: true,
        stage: "provider",
        ignored_secret: "must-not-cross-boundary"
      }));
      process.exitCode = 1;
    `);
    chmodSync(workerPath, 0o555);
    const digest = "f".repeat(64);
    const rpc = vi.fn(async (name: string) => ({
      data: name === "claim_youtube_extraction_job"
        ? {
            job_id: "66666666-6666-4666-8666-666666666666",
            youtube_video_id: "abc123DEF45",
            lease_generation: 3,
            policy_snapshot_digest: digest,
            result_affecting_options: {},
          }
        : name === "claim_youtube_extractor_permit"
          ? { permit_generation: 3 }
          : name === "read_youtube_extraction_worker_catalog"
            ? { applied: true, ingredients: [], ingredient_synonyms: [], cooking_methods: [] }
            : name === "access_youtube_extraction_worker_cache"
              ? { applied: true, cache: null }
              : { applied: true, updated: true, released: true },
      error: null,
    }));
    const runtime = createYoutubeExtractionWorkerRuntime({
      workerId: "worker-child-error",
      allowedSnapshotDigest: digest,
      rpc,
      extractor: createStandaloneYoutubeI031Extractor({
        artifactRoot: root,
        workerEnv: { NODE_ENV: "test", TEST_ERROR_CODE: errorCode },
        verifyPreflight: vi.fn(async () => ({
          codexBin: "/opt/homebrew/bin/codex",
          codexCliVersion: "0.144.0-alpha.4",
        })),
      }),
    });

    await expect(runtime.runOnce()).resolves.toBe("failed");
    expect(rpc).toHaveBeenCalledWith("fail_or_retry_youtube_extraction_job", {
      job_id: "66666666-6666-4666-8666-666666666666",
      worker_id: "worker-child-error",
      lease_generation: 3,
      error_code: errorCode,
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
