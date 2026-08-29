import { execFile, spawn } from "node:child_process";
import {
  access,
  chmod,
  cp,
  lstat,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import workerTiming from
  "../../lib/server/youtube-extraction-worker-timing.json" with { type: "json" };

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const MAX_RESULT_BYTES = 2 * 1024 * 1024;
const DEFAULT_EXTRACTION_TIMEOUT_MS = 20 * 60 * 1000;
const DEFAULT_PROGRESS_FLUSH_TIMEOUT_MS = 2_000;
export const YOUTUBE_EXTRACTION_WORKER_LEASE_SECONDS = workerTiming.lease_seconds;
export const YOUTUBE_EXTRACTION_WORKER_HEARTBEAT_INTERVAL_MS =
  workerTiming.heartbeat_interval_seconds * 1000;
const I031_CODEX_CLI_VERSION = "0.144.0-alpha.4";
const CHILD_ENV_ALLOWLIST = new Set([
  "APIFY_TOKEN",
  "HOME",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "NODE_EXTRA_CA_CERTS",
  "NO_PROXY",
  "PATH",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
  "TMPDIR",
  "YOUTUBE_API_KEY",
  "YOUTUBE_I031_CODEX_BIN",
  "YOUTUBE_TRANSCRIPT_APIFY_ACTOR_ID",
  "YOUTUBE_TRANSCRIPT_PAID_TIMEOUT_MS",
  "HOMECOOK_I031_CODEX_CLI_VERSION",
  "NODE_ENV",
]);
const CACHE_OPERATIONS = new Set([
  "transcript_read",
  "transcript_upsert",
  "transcript_touch",
  "llm_read",
  "llm_upsert",
  "llm_touch",
  "visual_read",
  "visual_upsert",
  "visual_touch",
]);
const EVENT_KINDS = new Set(["transcript", "llm", "visual"]);
const QUOTA_PROVIDERS = new Set(["external_transcript_api", "gemini"]);
const PROGRESS_STAGES = new Set([
  "source_fetch",
  "video_download",
  "frame_extraction",
  "model_analysis",
  "finalizing",
]);
const CHILD_PROGRESS_STAGES = new Set([
  "source_fetch",
  "video_download",
  "frame_extraction",
  "model_analysis",
]);
const RETRYABLE_RUNTIME_CODES = new Set([
  "NETWORK_ERROR",
  "RATE_LIMITED",
  "PROVIDER_TIMEOUT",
  "TRANSIENT_INTERNAL_ERROR",
]);
const TERMINAL_RUNTIME_CODES = new Set([
  "NOT_RECIPE_VIDEO",
  "QUOTA_EXCEEDED",
  "RUNTIME_UNAVAILABLE",
  "EXTRACTION_FAILED",
]);

class YoutubeExtractionRuntimeError extends Error {
  constructor(code, stage = "provider") {
    super(code);
    this.name = "YoutubeExtractionRuntimeError";
    this.code = code;
    this.retryable = RETRYABLE_RUNTIME_CODES.has(code);
    this.stage = stage;
  }
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function requiredString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is unavailable`);
  }
  return value.trim();
}

function positiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

export function sanitizeYoutubeExtractionChildEnvironment(environment = {}, overrides = {}) {
  const sanitized = {};
  for (const [key, value] of Object.entries({ ...environment, ...overrides })) {
    if (CHILD_ENV_ALLOWLIST.has(key) && typeof value === "string" && value.length > 0) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * @param {{
 *   processEnvironment?: Record<string, string | undefined>;
 *   providerEnvironment?: Record<string, string | undefined>;
 *   tempRoot?: string;
 * }} [options]
 */
export function buildYoutubeExtractionRuntimeEnvironment({
  processEnvironment = {},
  providerEnvironment = {},
  tempRoot,
} = {}) {
  return sanitizeYoutubeExtractionChildEnvironment(
    { ...processEnvironment, ...providerEnvironment },
    { TMPDIR: requiredString(tempRoot, "worker temp root") },
  );
}

export async function resolveYoutubeExtractionTempRoot({
  platform = process.platform,
  runCommand = defaultRunCommand,
} = {}) {
  if (platform !== "darwin") {
    throw new YoutubeExtractionRuntimeError("RUNTIME_UNAVAILABLE", "preflight");
  }
  const result = await runCommand("/usr/bin/getconf", ["DARWIN_USER_TEMP_DIR"]);
  const tempRoot = requiredString(result.stdout, "Darwin user temp root");
  if (!/^\/var\/folders\/[^/]+\/[^/]+\/T\/$/u.test(tempRoot)) {
    throw new YoutubeExtractionRuntimeError("RUNTIME_UNAVAILABLE", "preflight");
  }
  return tempRoot;
}

async function inspectWorkerAuthFile(pathname, expectedUserId) {
  const file = await lstat(pathname);
  if (!file.isFile() || file.isSymbolicLink()) throw new Error();
  if (Number.isInteger(expectedUserId) && file.uid !== expectedUserId) throw new Error();
  if ((file.mode & 0o777) !== 0o600) throw new Error();
  if (await realpath(pathname) !== path.resolve(pathname)) throw new Error();
}

function successBoolean(result, operation) {
  if (result?.error) throw new Error(`${operation} failed`);
  if (result?.data === true) return true;
  if (typeof result?.data === "number") return result.data > 0;
  const row = record(result?.data);
  return row?.applied === true
    || row?.started === true
    || row?.updated === true
    || row?.finalized === true
    || row?.released === true
    || row?.requeued === true
    || Number(row?.affected_count ?? 0) > 0;
}

function resultRow(result, operation) {
  if (result?.error) throw new Error(`${operation} failed`);
  return record(Array.isArray(result?.data) ? result.data[0] : result?.data);
}

export function normalizeYoutubeExtractionRuntimeError(error) {
  const errorRecord = record(error);
  if (
    typeof errorRecord?.code === "string"
    && (RETRYABLE_RUNTIME_CODES.has(errorRecord.code)
      || TERMINAL_RUNTIME_CODES.has(errorRecord.code))
  ) {
    return {
      code: errorRecord.code,
      retryable: RETRYABLE_RUNTIME_CODES.has(errorRecord.code),
      stage: "provider",
    };
  }
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  for (const code of [...RETRYABLE_RUNTIME_CODES, ...TERMINAL_RUNTIME_CODES]) {
    if (text.includes(code)) {
      return { code, retryable: RETRYABLE_RUNTIME_CODES.has(code), stage: "provider" };
    }
  }
  return { code: "EXTRACTION_FAILED", retryable: false, stage: "provider" };
}

function classifyFailure(error) {
  return normalizeYoutubeExtractionRuntimeError(error).code;
}

function requireFencedWrite(result, operation) {
  if (!successBoolean(result, operation)) {
    throw new Error("YOUTUBE_EXTRACTION_FENCE_LOST");
  }
}

function boundedObjectArray(value, label, maximum = 30) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maximum) {
    throw new Error(`${label} is invalid`);
  }
  return value.map((entry) => {
    const row = record(entry);
    if (!row) throw new Error(`${label} is invalid`);
    return row;
  });
}

function providerVideoTitle(runtimeResult) {
  const result = record(runtimeResult);
  const value = result?.videoTitle;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 160 ? normalized : null;
}

function createFencedWorkerRpcClient({
  rpc,
  claim,
  workerId,
  permitGeneration,
  attempt,
}) {
  const fence = {
    job_id: claim.job_id,
    worker_id: workerId,
    lease_generation: claim.lease_generation,
  };
  const writeFence = { ...fence, permit_generation: permitGeneration };
  let progressChain = Promise.resolve();
  return {
    reportProgress(stage, videoDurationSeconds = null) {
      if (
        !PROGRESS_STAGES.has(stage)
        || (
          videoDurationSeconds !== null
          && (!Number.isInteger(videoDurationSeconds)
            || videoDurationSeconds < 1
            || videoDurationSeconds > 86_400)
        )
      ) {
        return Promise.resolve(false);
      }
      const operation = progressChain.then(async () => {
        try {
          const row = resultRow(await rpc("report_youtube_extraction_progress", {
            ...writeFence,
            attempt,
            stage,
            video_duration_seconds: videoDurationSeconds,
          }), "report extraction progress");
          return row?.applied === true;
        } catch {
          return false;
        }
      });
      progressChain = operation.then(() => undefined, () => undefined);
      return operation;
    },
    flushProgress(timeoutMs = DEFAULT_PROGRESS_FLUSH_TIMEOUT_MS) {
      return settleWithin(progressChain.then(() => true), timeoutMs);
    },
    async readCatalog() {
      const catalog = resultRow(await rpc("read_youtube_extraction_worker_catalog", fence),
        "read worker catalog");
      if (!catalog || catalog.applied !== true) {
        throw new Error("YOUTUBE_EXTRACTION_FENCE_LOST");
      }
      return catalog;
    },
    async accessCache(operation, payload) {
      if (!CACHE_OPERATIONS.has(operation) || !record(payload)) {
        throw new Error("cache operation is invalid");
      }
      const row = resultRow(await rpc("access_youtube_extraction_worker_cache", {
        ...writeFence,
        cache_operation: operation,
        payload,
      }), "access worker cache");
      if (!row || row.applied !== true) throw new Error("YOUTUBE_EXTRACTION_FENCE_LOST");
      return row;
    },
    async reserveQuota(provider, units = 1) {
      if (!QUOTA_PROVIDERS.has(provider) || units !== 1) {
        throw new Error("quota reservation is invalid");
      }
      const row = resultRow(await rpc("reserve_youtube_extraction_worker_quota", {
        ...writeFence,
        provider,
        units,
      }), "reserve worker quota");
      if (!row || row.applied !== true) throw new Error("YOUTUBE_EXTRACTION_FENCE_LOST");
      if (row.reserved !== true) throw new YoutubeExtractionRuntimeError("QUOTA_EXCEEDED");
      return row;
    },
    async recordEvent(kind, payload) {
      if (!EVENT_KINDS.has(kind) || !record(payload)) throw new Error("event is invalid");
      const row = resultRow(await rpc("record_youtube_extraction_worker_event", {
        ...writeFence,
        event_kind: kind,
        payload,
      }), "record worker event");
      if (!row || row.applied !== true || row.recorded !== true) {
        throw new Error("YOUTUBE_EXTRACTION_FENCE_LOST");
      }
      return row;
    },
    async resolveMethods(methodLabels) {
      if (
        !Array.isArray(methodLabels)
        || methodLabels.length > 100
        || methodLabels.some((label) => typeof label !== "string" || label.trim().length === 0)
      ) {
        throw new Error("method labels are invalid");
      }
      const row = resultRow(await rpc("resolve_youtube_extraction_worker_methods", {
        ...writeFence,
        method_labels: methodLabels.map((label) => label.trim()),
      }), "resolve worker methods");
      if (!row || row.applied !== true) throw new Error("YOUTUBE_EXTRACTION_FENCE_LOST");
      return row;
    },
    async updateTitle(title) {
      const normalized = providerVideoTitle({ videoTitle: title });
      if (!normalized) throw new Error("provider video title is invalid");
      requireFencedWrite(await rpc("update_youtube_extraction_job_title", {
        ...writeFence,
        title: normalized,
      }), "update job title");
    },
  };
}

function withoutPersistence(runtimeResult) {
  const result = record(runtimeResult);
  if (!result) return runtimeResult;
  const publicResult = { ...result };
  delete publicResult.persistence;
  delete publicResult.workerDataPersisted;
  return publicResult;
}

async function defaultRunCommand(command, args, { env } = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      env,
      timeout: 30_000,
      maxBuffer: 128 * 1024,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new YoutubeExtractionRuntimeError("RUNTIME_UNAVAILABLE", "preflight"));
        return;
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

/**
 * @param {{
 *   workerEnv?: Record<string, string | undefined>,
 *   accessPath?: (pathname: string) => Promise<void>,
 *   runCommand?: (command: string, args: string[], options?: {env?: Record<string, string | undefined>}) => Promise<{stdout?: string, stderr?: string}>,
 *   platform?: NodeJS.Platform,
 *   expectedUserId?: number,
 *   inspectAuthFile?: (pathname: string, expectedUserId?: number) => Promise<void>,
 * }} options
 */
export async function verifyStandaloneYoutubeI031Preflight({
  workerEnv = process.env,
  accessPath = access,
  runCommand = defaultRunCommand,
  platform = process.platform,
  expectedUserId = process.getuid?.(),
  inspectAuthFile = inspectWorkerAuthFile,
} = {}) {
  try {
    if (platform !== "darwin") throw new Error();
    requiredString(workerEnv.YOUTUBE_API_KEY, "YOUTUBE_API_KEY");
    const home = requiredString(workerEnv.HOME, "HOME");
    const codexBin = path.resolve(
      workerEnv.YOUTUBE_I031_CODEX_BIN ?? "/opt/homebrew/bin/codex",
    );
    const authPath = path.join(home, ".codex", "auth.json");
    await Promise.all([
      accessPath(codexBin),
      inspectAuthFile(authPath, expectedUserId),
      accessPath("/usr/bin/sandbox-exec"),
      accessPath("/usr/bin/swiftc"),
    ]);
    const commandEnv = sanitizeYoutubeExtractionChildEnvironment(workerEnv, { HOME: home });
    const versionResult = await runCommand(codexBin, ["--version"], { env: commandEnv });
    const versionMatch = String(versionResult.stdout ?? "")
      .match(/(?:^|\s)(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:\s|$)/u);
    if (versionMatch?.[1] !== I031_CODEX_CLI_VERSION) throw new Error();
    const loginResult = await runCommand(codexBin, ["login", "status"], { env: commandEnv });
    if (!/^Logged in using ChatGPT\b/mu.test(
      `${loginResult.stdout ?? ""}\n${loginResult.stderr ?? ""}`,
    )) {
      throw new Error();
    }
    await runCommand("python3", ["-c", "import cv2, yt_dlp"], { env: commandEnv });
    await runCommand("ffmpeg", ["-version"], { env: commandEnv });
    await runCommand("ffprobe", ["-version"], { env: commandEnv });
    return { codexBin, codexCliVersion: I031_CODEX_CLI_VERSION };
  } catch {
    throw new YoutubeExtractionRuntimeError("RUNTIME_UNAVAILABLE", "preflight");
  }
}

function abortableDelay(milliseconds, signal) {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(finish, milliseconds);
    function finish() {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    }
    signal.addEventListener("abort", finish, { once: true });
  });
}

async function settleWithin(promise, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * @param {{
 *   dataApiUrl: string,
 *   apiKey: string,
 *   token: string,
 *   fetchImpl?: typeof globalThis.fetch,
 * }} options
 */
export function createRestrictedPostgrestRpcClient({
  dataApiUrl,
  apiKey,
  token,
  fetchImpl = globalThis.fetch,
} = {}) {
  const endpoint = new URL(requiredString(dataApiUrl, "dataApiUrl"));
  if (!LOOPBACK_HOSTS.has(endpoint.hostname) || endpoint.protocol !== "http:") {
    throw new Error("worker Data API must use a loopback HTTP endpoint");
  }
  if (!endpoint.pathname.endsWith("/rest/v1")) {
    throw new Error("worker Data API must end with /rest/v1");
  }
  const bearer = requiredString(token, "restricted worker token");
  const gatewayApiKey = requiredString(apiKey, "worker Data API key");
  if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable");

  return {
    async rpc(name, args = {}) {
      const rpcName = requiredString(name, "RPC name");
      if (!/^[a-z][a-z0-9_]+$/u.test(rpcName)) {
        throw new Error("RPC name is invalid");
      }
      const response = await fetchImpl(
        new URL(`${endpoint.pathname}/rpc/${rpcName}`, endpoint),
        {
          method: "POST",
          headers: {
            apikey: gatewayApiKey,
            authorization: `Bearer ${bearer}`,
            "content-type": "application/json",
            prefer: "return=representation",
          },
          body: JSON.stringify(args),
        },
      );
      let data = null;
      try {
        data = await response.json();
      } catch {
        // Empty PostgREST responses are valid for zero-row writes.
      }
      return response.ok
        ? { data, error: null }
        : { data: null, error: { status: response.status } };
    },
  };
}

/**
 * @param {{
 *   workerId: string,
 *   allowedSnapshotDigest: string,
 *   rpc: (name: string, args?: Record<string, unknown>) => Promise<{data: unknown, error: unknown}>,
 *   extractor: { extract(input: {
 *     videoId: string,
 *     signal: AbortSignal,
 *     catalog: Record<string, unknown>,
 *     claimedJob: {jobId: string, videoId: string, workerId: string, leaseGeneration: number},
 *     workerRpcClient: Record<string, (...args: any[]) => Promise<unknown>>,
 *   }): Promise<unknown> },
 *   heartbeatIntervalMs?: number,
 *   leaseSeconds?: number,
 *   progressFlushTimeoutMs?: number,
 * }} options
 */
export function createYoutubeExtractionWorkerRuntime({
  workerId,
  allowedSnapshotDigest,
  rpc,
  extractor,
  heartbeatIntervalMs = YOUTUBE_EXTRACTION_WORKER_HEARTBEAT_INTERVAL_MS,
  leaseSeconds = YOUTUBE_EXTRACTION_WORKER_LEASE_SECONDS,
  progressFlushTimeoutMs = DEFAULT_PROGRESS_FLUSH_TIMEOUT_MS,
} = {}) {
  const normalizedWorkerId = requiredString(workerId, "workerId");
  const digest = requiredString(allowedSnapshotDigest, "allowedSnapshotDigest");
  if (!/^[a-f0-9]{64}$/u.test(digest)) {
    throw new Error("allowedSnapshotDigest must be lowercase 64-hex");
  }
  if (typeof rpc !== "function") throw new Error("restricted RPC client is required");
  if (!extractor || typeof extractor.extract !== "function") {
    throw new Error("i031 extractor is required");
  }
  positiveInteger(heartbeatIntervalMs, "heartbeatIntervalMs");
  positiveInteger(leaseSeconds, "leaseSeconds");
  positiveInteger(progressFlushTimeoutMs, "progressFlushTimeoutMs");

  return {
    async runOnce({ signal: shutdownSignal = new AbortController().signal } = {}) {
      if (shutdownSignal.aborted) return "stopped";
      const claim = resultRow(await rpc("claim_youtube_extraction_job", {
        worker_id: normalizedWorkerId,
        allowed_snapshot_digest: digest,
        lease_seconds: leaseSeconds,
      }), "claim job");
      if (!claim || claim.status === "empty" || claim.applied === false) return "idle";
      if (
        typeof claim.job_id !== "string"
        || typeof claim.youtube_video_id !== "string"
        || typeof claim.lease_generation !== "number"
        || claim.policy_snapshot_digest !== digest
        || !record(claim.result_affecting_options)
      ) {
        throw new Error("claim job returned an invalid projection");
      }

      const permit = resultRow(await rpc("claim_youtube_extractor_permit", {
        worker_id: normalizedWorkerId,
        lease_seconds: leaseSeconds,
      }), "claim permit");
      if (!permit || permit.claimed !== true || typeof permit.permit_generation !== "number") {
        const requeued = await rpc("requeue_youtube_extraction_job_without_attempt", {
          job_id: claim.job_id,
          worker_id: normalizedWorkerId,
          lease_generation: claim.lease_generation,
          min_delay_seconds: 2,
          max_delay_seconds: 8,
        });
        if (!successBoolean(requeued, "requeue without attempt")) {
          return "stale-fence";
        }
        return "permit-unavailable";
      }

      const permitGeneration = permit.permit_generation;
      const leaseGeneration = claim.lease_generation;
      const controller = new AbortController();
      const onShutdown = () => controller.abort(shutdownSignal.reason ?? new Error("shutdown"));
      shutdownSignal.addEventListener("abort", onShutdown, { once: true });
      let heartbeatTimer;
      let rejectHeartbeat;
      const heartbeatFailed = new Promise((_, reject) => {
        rejectHeartbeat = reject;
      });
      const heartbeat = async () => {
        const [jobAlive, permitAlive] = await Promise.all([
          rpc("heartbeat_youtube_extraction_job", {
            job_id: claim.job_id,
            worker_id: normalizedWorkerId,
            lease_generation: leaseGeneration,
            permit_generation: permitGeneration,
            lease_seconds: leaseSeconds,
          }).then((result) => successBoolean(result, "heartbeat job")),
          rpc("heartbeat_youtube_extractor_permit", {
            job_id: claim.job_id,
            worker_id: normalizedWorkerId,
            lease_generation: leaseGeneration,
            permit_generation: permitGeneration,
            lease_seconds: leaseSeconds,
          }).then((result) => successBoolean(result, "heartbeat permit")),
        ]);
        if (!jobAlive || !permitAlive) {
          const error = new Error("YOUTUBE_EXTRACTION_FENCE_LOST");
          controller.abort(error);
          throw error;
        }
      };

      try {
        const started = resultRow(await rpc("start_youtube_extraction_attempt", {
          job_id: claim.job_id,
          worker_id: normalizedWorkerId,
          lease_generation: leaseGeneration,
          permit_generation: permitGeneration,
        }), "start attempt");
        if (
          started?.started !== true
          || !Number.isInteger(started.attempt_count)
          || started.attempt_count < 1
        ) {
          return "stale-fence";
        }
        const attempt = started.attempt_count;

        await heartbeat();
        heartbeatTimer = setInterval(() => {
          heartbeat().catch((error) => {
            controller.abort(error);
            rejectHeartbeat(error);
          });
        }, heartbeatIntervalMs);
        heartbeatTimer.unref?.();

        const workerRpcClient = createFencedWorkerRpcClient({
          rpc,
          claim,
          workerId: normalizedWorkerId,
          permitGeneration,
          attempt,
        });
        const catalog = await workerRpcClient.readCatalog();

        const runtimeResult = await Promise.race([
          extractor.extract({
            videoId: claim.youtube_video_id,
            signal: controller.signal,
            catalog,
            claimedJob: {
              jobId: claim.job_id,
              videoId: claim.youtube_video_id,
              workerId: normalizedWorkerId,
              leaseGeneration,
            },
            workerRpcClient,
          }),
          heartbeatFailed,
        ]);
        if (controller.signal.aborted) return "stale-fence";

        const runtimeRow = record(runtimeResult);
        const persistence = record(runtimeRow?.persistence) ?? {};
        for (const operation of boundedObjectArray(
          persistence.cache_operations,
          "cache operations",
        )) {
          if (!CACHE_OPERATIONS.has(operation.operation) || !record(operation.payload)) {
            throw new Error("cache operations are invalid");
          }
          await workerRpcClient.accessCache(operation.operation, operation.payload);
        }
        for (const reservation of boundedObjectArray(
          persistence.quota_reservations,
          "quota reservations",
          4,
        )) {
          if (!QUOTA_PROVIDERS.has(reservation.provider) || reservation.units !== 1) {
            throw new Error("quota reservations are invalid");
          }
          await workerRpcClient.reserveQuota(reservation.provider, reservation.units);
        }
        for (const event of boundedObjectArray(persistence.events, "events")) {
          if (!EVENT_KINDS.has(event.kind) || !record(event.payload)) {
            throw new Error("events are invalid");
          }
          await workerRpcClient.recordEvent(event.kind, event.payload);
        }
        const methodLabels = persistence.method_labels ?? [];
        if (
          !Array.isArray(methodLabels)
          || methodLabels.length > 100
          || methodLabels.some((label) => typeof label !== "string" || label.trim().length === 0)
        ) {
          throw new Error("method labels are invalid");
        }
        if (runtimeRow?.workerDataPersisted !== true) {
          await workerRpcClient.resolveMethods(methodLabels);
        }

        const title = providerVideoTitle(runtimeResult);
        if (title && runtimeRow?.workerDataPersisted !== true) {
          await workerRpcClient.updateTitle(title);
        }

        workerRpcClient.reportProgress("finalizing");
        await workerRpcClient.flushProgress(progressFlushTimeoutMs).catch(() => false);
        const resolved = resultRow(await rpc("resolve_youtube_extraction_job_draft", {
          job_id: claim.job_id,
          worker_id: normalizedWorkerId,
          lease_generation: leaseGeneration,
          permit_generation: permitGeneration,
          youtube_video_id: claim.youtube_video_id,
          runtime_result: withoutPersistence(runtimeResult),
        }), "resolve draft");
        if (!resolved) throw new Error("resolve draft returned no result");
        await heartbeat();
        const finalized = successBoolean(await rpc("finalize_youtube_extraction_job", {
          job_id: claim.job_id,
          worker_id: normalizedWorkerId,
          lease_generation: leaseGeneration,
          finalized_draft_json: {
            ...resolved,
            worker_permit_generation: permitGeneration,
          },
        }), "finalize job");
        return finalized ? "succeeded" : "stale-fence";
      } catch (error) {
        if (shutdownSignal.aborted) return "stopped";
        if (controller.signal.aborted) return "stale-fence";
        const failureTransition = await rpc("fail_or_retry_youtube_extraction_job", {
          job_id: claim.job_id,
          worker_id: normalizedWorkerId,
          lease_generation: leaseGeneration,
          permit_generation: permitGeneration,
          error_code: classifyFailure(error),
        });
        const failureRow = record(Array.isArray(failureTransition?.data)
          ? failureTransition.data[0]
          : failureTransition?.data);
        if (failureTransition?.error || failureRow?.applied !== true || failureRow?.updated !== true) {
          throw new Error("durable failure transition was not recorded");
        }
        return "failed";
      } finally {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        shutdownSignal.removeEventListener("abort", onShutdown);
        await rpc("release_youtube_extractor_permit", {
          worker_id: normalizedWorkerId,
          permit_generation: permitGeneration,
        });
      }
    },
  };
}

/**
 * @param {{
 *   allowedSnapshotDigest: string,
 *   runId: string,
 *   rpc: Function,
 *   signal?: AbortSignal,
 * }} options
 */
export async function runSyntheticYoutubeExtractionWorkerJob({
  allowedSnapshotDigest,
  runId,
  rpc,
  signal = new AbortController().signal,
} = {}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(runId ?? "")) {
    throw new Error("synthetic rehearsal run_id must be UUID-v4");
  }
  if (!(signal instanceof AbortSignal)) throw new Error("synthetic rehearsal signal is required");
  if (typeof rpc !== "function") throw new Error("rehearsal synthetic worker requires an explicit RPC client");
  const rpcSequence = [];
  const runtime = createYoutubeExtractionWorkerRuntime({
    workerId: `rehearsal-${runId}`,
    allowedSnapshotDigest,
    rpc: async (...args) => { rpcSequence.push(args[0]); return rpc(...args); },
    heartbeatIntervalMs: 60_000,
    extractor: {
      async extract({ claimedJob, signal: extractionSignal }) {
        if (extractionSignal.aborted) throw extractionSignal.reason;
        return {
          synthetic: true,
          videoId: claimedJob.videoId,
          videoTitle: "Synthetic rehearsal recipe",
          workerDataPersisted: true,
          persistence: {
            cache_operations: [],
            quota_reservations: [],
            events: [],
            method_labels: [],
          },
        };
      },
    },
  });
  let status = null;
  const pollController = new AbortController();
  const onAbort = () => pollController.abort(signal.reason ?? new Error("rehearsal aborted"));
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    await runYoutubeExtractionWorkerPollLoop({
      signal: pollController.signal,
      pollIntervalMs: 1,
      runOnce: async ({ signal: loopSignal }) => {
        status = await runtime.runOnce({ signal: loopSignal });
        pollController.abort(new Error("synthetic job complete"));
        return status;
      },
    });
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
  if (status !== "succeeded") throw new Error(`synthetic worker job did not succeed: ${String(status)}`);
  return Object.freeze({
    schema: "homecook.youtube-extraction-worker-rehearsal-result.v1",
    status,
    synthetic: true,
    provider_requests: 0,
    rpc_sequence: Object.freeze([...rpcSequence]),
  });
}

/**
 * @param {{
 *   runOnce: (input: {signal: AbortSignal}) => Promise<unknown>,
 *   signal: AbortSignal,
 *   pollIntervalMs?: number,
 * }} options
 */
export async function runYoutubeExtractionWorkerPollLoop({
  runOnce,
  signal,
  pollIntervalMs = 1_000,
} = {}) {
  if (typeof runOnce !== "function") throw new Error("runOnce is required");
  if (!(signal instanceof AbortSignal)) throw new Error("shutdown signal is required");
  positiveInteger(pollIntervalMs, "pollIntervalMs");
  while (!signal.aborted) {
    await runOnce({ signal });
    if (!signal.aborted) await abortableDelay(pollIntervalMs, signal);
  }
  return "stopped";
}

function terminateProcess(child) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      // Child already exited.
    }
  }
}

function sendChildMessage(child, message) {
  return new Promise((resolve, reject) => {
    if (!child?.connected) {
      reject(new Error("worker child IPC is unavailable"));
      return;
    }
    child.send(message, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function validateChildRpcRequest(message) {
  const request = record(message);
  const payload = record(request?.payload);
  if (
    request?.type !== "homecook-worker-rpc-request"
    || typeof request.requestId !== "string"
    || !/^[A-Za-z0-9_-]{1,64}$/u.test(request.requestId)
    || typeof request.operation !== "string"
    || !payload
    || Buffer.byteLength(JSON.stringify(request), "utf8") > MAX_RESULT_BYTES
  ) {
    throw new YoutubeExtractionRuntimeError("RUNTIME_UNAVAILABLE");
  }
  return { ...request, payload };
}

function validateChildProgressMessage(message, previousSequence) {
  const progress = record(message);
  if (
    progress?.type !== "homecook-worker-progress"
    || !Number.isInteger(progress.sequence)
    || progress.sequence <= previousSequence
    || !CHILD_PROGRESS_STAGES.has(progress.stage)
    || (
      progress.videoDurationSeconds !== null
      && progress.videoDurationSeconds !== undefined
      && (!Number.isInteger(progress.videoDurationSeconds)
        || progress.videoDurationSeconds < 1
        || progress.videoDurationSeconds > 86_400)
    )
    || Buffer.byteLength(JSON.stringify(progress), "utf8") > 512
  ) {
    throw new Error("invalid progress message");
  }
  return progress;
}

async function dispatchChildRpcRequest(workerRpcClient, request) {
  switch (request.operation) {
    case "cache":
      return workerRpcClient.accessCache(
        request.payload.operation,
        request.payload.payload,
      );
    case "quota":
      return workerRpcClient.reserveQuota(
        request.payload.provider,
        request.payload.units,
      );
    case "event":
      return workerRpcClient.recordEvent(
        request.payload.kind,
        request.payload.payload,
      );
    case "methods":
      return workerRpcClient.resolveMethods(request.payload.methodLabels);
    case "title":
      await workerRpcClient.updateTitle(request.payload.title);
      return { applied: true, updated: true };
    default:
      throw new YoutubeExtractionRuntimeError("RUNTIME_UNAVAILABLE");
  }
}

function attachChildRpcBridge(child, workerRpcClient) {
  let bridgeFailure = null;
  let chain = Promise.resolve();
  let progressFailures = 0;
  let progressSequence = 0;
  const onMessage = (message) => {
    if (message?.type === "homecook-worker-progress") {
      let progress;
      try {
        progress = validateChildProgressMessage(message, progressSequence);
        progressSequence = progress.sequence;
      } catch {
        progressFailures += 1;
        return;
      }
      Promise.resolve(workerRpcClient.reportProgress(
        progress.stage,
        progress.videoDurationSeconds ?? null,
      ))
        .then((applied) => {
          if (applied !== true) progressFailures += 1;
        })
        .catch(() => {
          progressFailures += 1;
        });
      return;
    }
    chain = chain.then(async () => {
      let request;
      try {
        request = validateChildRpcRequest(message);
        const data = await dispatchChildRpcRequest(workerRpcClient, request);
        const response = JSON.stringify(data);
        if (Buffer.byteLength(response, "utf8") > MAX_RESULT_BYTES) {
          throw new YoutubeExtractionRuntimeError("RUNTIME_UNAVAILABLE");
        }
        await sendChildMessage(child, {
          type: "homecook-worker-rpc-response",
          requestId: request.requestId,
          ok: true,
          data,
        });
      } catch (error) {
        const normalized = normalizeYoutubeExtractionRuntimeError(error);
        bridgeFailure = new YoutubeExtractionRuntimeError(normalized.code);
        if (request) {
          await sendChildMessage(child, {
            type: "homecook-worker-rpc-response",
            requestId: request.requestId,
            ok: false,
            errorCode: normalized.code,
          }).catch(() => {});
        } else {
          terminateProcess(child);
        }
      }
    });
  };
  child.on("message", onMessage);
  return {
    async settle() {
      await chain;
      return { bridgeFailure, progressFailureCount: progressFailures };
    },
    close() {
      child.off("message", onMessage);
    },
  };
}

async function readBoundedJson(pathname, maximumBytes) {
  const fileStat = await stat(pathname);
  if (fileStat.size < 2 || fileStat.size > maximumBytes) throw new Error();
  const value = JSON.parse(await readFile(pathname, "utf8"));
  if (!record(value)) throw new Error();
  return value;
}

async function makeExtractionWorkspaceRemovable(directory) {
  await chmod(directory, 0o700).catch(() => {});
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries.map(async (entry) => {
    const pathname = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await makeExtractionWorkspaceRemovable(pathname);
      return;
    }
    await chmod(pathname, 0o600).catch(() => {});
  }));
}

/**
 * @param {{
 *   artifactRoot: string,
 *   workerEnv?: Record<string, string | undefined>,
 *   timeoutMs?: number,
 *   verifyPreflight?: (options: {workerEnv: NodeJS.ProcessEnv}) => Promise<{codexBin: string, codexCliVersion: string}>,
 * }} options
 */
export function createStandaloneYoutubeI031Extractor({
  artifactRoot,
  workerEnv = process.env,
  timeoutMs = DEFAULT_EXTRACTION_TIMEOUT_MS,
  verifyPreflight = verifyStandaloneYoutubeI031Preflight,
} = {}) {
  const root = path.resolve(requiredString(artifactRoot, "artifactRoot"));
  const childEnvironment = sanitizeYoutubeExtractionChildEnvironment(workerEnv);
  const bundleRoot = path.join(root, "lib/server/youtube-i031-runtime/bundle");
  positiveInteger(timeoutMs, "timeoutMs");
  return {
    async extract({ videoId, signal, claimedJob, workerRpcClient }) {
      if (!/^[A-Za-z0-9_-]{11}$/u.test(videoId ?? "")) {
        throw new Error("I031_INVALID_VIDEO_ID");
      }
      if (!record(claimedJob) || !workerRpcClient) {
        throw new YoutubeExtractionRuntimeError("RUNTIME_UNAVAILABLE");
      }
      const workspace = await mkdtemp(path.join(tmpdir(), "homecook-youtube-worker-"));
      const resultPath = path.join(workspace, "result.json");
      const metadataPath = path.join(workspace, "metadata.json");
      const errorPath = path.join(workspace, "error.json");
      let child;
      let childRpcBridge;
      let publishedTitle = false;
      let metadataPublishPromise = null;
      const publishMetadata = async () => {
        if (publishedTitle) return;
        if (metadataPublishPromise) return metadataPublishPromise;
        metadataPublishPromise = readBoundedJson(metadataPath, 4 * 1024)
          .then(async (metadata) => {
            const title = providerVideoTitle(metadata);
            if (!title) throw new Error();
            await workerRpcClient.updateTitle(title);
            publishedTitle = true;
          })
          .finally(() => {
            metadataPublishPromise = null;
          });
        return metadataPublishPromise;
      };
      try {
        const preflight = await verifyPreflight({ workerEnv: childEnvironment });
        await cp(bundleRoot, workspace, { recursive: true, force: true });
        child = spawn(process.execPath, [
          path.join(workspace, "worker.mjs"),
          "--video-id",
          videoId,
          "--result",
          resultPath,
          "--metadata",
          metadataPath,
          "--error",
          errorPath,
        ], {
          cwd: workspace,
          env: {
            ...childEnvironment,
            NODE_ENV: "production",
            YOUTUBE_I031_CODEX_BIN: preflight.codexBin,
            HOMECOOK_I031_CODEX_CLI_VERSION: preflight.codexCliVersion,
          },
          detached: true,
          stdio: ["ignore", "ignore", "ignore", "ipc"],
        });
        childRpcBridge = attachChildRpcBridge(child, workerRpcClient);
        return await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            terminateProcess(child);
            reject(new Error("PROVIDER_TIMEOUT"));
          }, timeoutMs);
          const onAbort = () => {
            terminateProcess(child);
            reject(signal.reason instanceof Error ? signal.reason : new Error("I031_ABORTED"));
          };
          signal.addEventListener("abort", onAbort, { once: true });
          child.once("error", reject);
          child.once("close", async (code) => {
            clearTimeout(timeout);
            signal.removeEventListener("abort", onAbort);
            const { bridgeFailure } = await childRpcBridge.settle();
            if (bridgeFailure) {
              reject(bridgeFailure);
              return;
            }
            try {
              await stat(metadataPath);
              await publishMetadata();
            } catch (metadataError) {
              if (metadataError?.code !== "ENOENT") {
                reject(metadataError);
                return;
              }
            }
            if (code !== 0) {
              try {
                const envelope = await readBoundedJson(errorPath, 4 * 1024);
                const normalized = normalizeYoutubeExtractionRuntimeError({
                  code: envelope.code,
                });
                reject(new YoutubeExtractionRuntimeError(normalized.code));
              } catch {
                reject(new YoutubeExtractionRuntimeError("EXTRACTION_FAILED"));
              }
              return;
            }
            try {
              const result = await readBoundedJson(resultPath, MAX_RESULT_BYTES);
              const title = providerVideoTitle(result);
              if (
                title
                && !publishedTitle
                && result.workerDataPersisted !== true
              ) {
                await workerRpcClient.updateTitle(title);
              }
              if (result.workerDataPersisted !== true) {
                await workerRpcClient.recordEvent("visual", {
                  provider: "codex-vision-keyframes",
                  model: "gpt-5.4",
                  cache_hit: false,
                  event_type: "recipe_extraction",
                  status: "success",
                  reason: null,
                  input_tokens: 0,
                  output_tokens: 0,
                  estimated_cost_microusd: 0,
                });
              }
              resolve({ ...result, workerDataPersisted: true });
            } catch {
              reject(new YoutubeExtractionRuntimeError("EXTRACTION_FAILED"));
            }
          });
        });
      } finally {
        childRpcBridge?.close();
        terminateProcess(child);
        await makeExtractionWorkspaceRemovable(workspace);
        await rm(workspace, { recursive: true, force: true });
      }
    },
  };
}

export async function readWorkerEnvironment(pathname) {
  const raw = await readFile(pathname, "utf8");
  const result = {};
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) throw new Error("worker config contains an invalid entry");
    result[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return result;
}

const PROVIDER_ENV_ALLOWLIST = new Set([
  "YOUTUBE_API_KEY",
  "APIFY_TOKEN",
  "YOUTUBE_TRANSCRIPT_APIFY_ACTOR_ID",
  "YOUTUBE_TRANSCRIPT_PAID_TIMEOUT_MS",
  "YOUTUBE_I031_CODEX_BIN",
]);

export async function readWorkerProviderEnvironment(pathname) {
  const result = await readWorkerEnvironment(pathname);
  for (const key of Object.keys(result)) {
    if (!PROVIDER_ENV_ALLOWLIST.has(key)) {
      throw new Error(`worker provider secret key is forbidden: ${key}`);
    }
  }
  if (!result.YOUTUBE_API_KEY) {
    throw new Error("YOUTUBE_API_KEY is unavailable");
  }
  return result;
}
