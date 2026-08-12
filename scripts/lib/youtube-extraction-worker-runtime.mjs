import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
const MAX_RESULT_BYTES = 2 * 1024 * 1024;
const DEFAULT_EXTRACTION_TIMEOUT_MS = 20 * 60 * 1000;

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

function successBoolean(result, operation) {
  if (result?.error) throw new Error(`${operation} failed`);
  if (result?.data === true) return true;
  if (typeof result?.data === "number") return result.data > 0;
  const row = record(result?.data);
  return row?.applied === true
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

function classifyFailure(error) {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  for (const code of [
    "NOT_RECIPE_VIDEO",
    "QUOTA_EXCEEDED",
    "RUNTIME_UNAVAILABLE",
    "NETWORK_ERROR",
    "RATE_LIMITED",
    "PROVIDER_TIMEOUT",
    "TRANSIENT_INTERNAL_ERROR",
  ]) {
    if (text.includes(code)) return code;
  }
  return "EXTRACTION_FAILED";
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

/**
 * @param {{
 *   dataApiUrl: string,
 *   token: string,
 *   fetchImpl?: typeof globalThis.fetch,
 * }} options
 */
export function createRestrictedPostgrestRpcClient({
  dataApiUrl,
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
 *   extractor: { extract(input: {videoId: string, signal: AbortSignal}): Promise<unknown> },
 *   heartbeatIntervalMs?: number,
 *   leaseSeconds?: number,
 * }} options
 */
export function createYoutubeExtractionWorkerRuntime({
  workerId,
  allowedSnapshotDigest,
  rpc,
  extractor,
  heartbeatIntervalMs = 30_000,
  leaseSeconds = 120,
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
      if (!permit || typeof permit.permit_generation !== "number") {
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
            lease_seconds: leaseSeconds,
          }).then((result) => successBoolean(result, "heartbeat job")),
          rpc("heartbeat_youtube_extractor_permit", {
            worker_id: normalizedWorkerId,
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
        const started = successBoolean(await rpc("start_youtube_extraction_attempt", {
          job_id: claim.job_id,
          worker_id: normalizedWorkerId,
          lease_generation: leaseGeneration,
          permit_generation: permitGeneration,
        }), "start attempt");
        if (!started) return "stale-fence";

        await heartbeat();
        heartbeatTimer = setInterval(() => {
          heartbeat().catch((error) => {
            controller.abort(error);
            rejectHeartbeat(error);
          });
        }, heartbeatIntervalMs);
        heartbeatTimer.unref?.();

        const runtimeResult = await Promise.race([
          extractor.extract({
            videoId: claim.youtube_video_id,
            signal: controller.signal,
          }),
          heartbeatFailed,
        ]);
        if (controller.signal.aborted) return "stale-fence";

        const resolved = resultRow(await rpc("resolve_youtube_extraction_job_draft", {
          job_id: claim.job_id,
          worker_id: normalizedWorkerId,
          lease_generation: leaseGeneration,
          youtube_video_id: claim.youtube_video_id,
          runtime_result: runtimeResult,
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
        await rpc("fail_or_retry_youtube_extraction_job", {
          job_id: claim.job_id,
          worker_id: normalizedWorkerId,
          lease_generation: leaseGeneration,
          error_code: classifyFailure(error),
        });
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

/**
 * @param {{
 *   artifactRoot: string,
 *   workerEnv?: NodeJS.ProcessEnv,
 *   timeoutMs?: number,
 * }} options
 */
export function createStandaloneYoutubeI031Extractor({
  artifactRoot,
  workerEnv = process.env,
  timeoutMs = DEFAULT_EXTRACTION_TIMEOUT_MS,
} = {}) {
  const root = path.resolve(requiredString(artifactRoot, "artifactRoot"));
  const bundleRoot = path.join(root, "lib/server/youtube-i031-runtime/bundle");
  positiveInteger(timeoutMs, "timeoutMs");
  return {
    async extract({ videoId, signal }) {
      if (!/^[A-Za-z0-9_-]{11}$/u.test(videoId ?? "")) {
        throw new Error("I031_INVALID_VIDEO_ID");
      }
      const workspace = await mkdtemp(path.join(tmpdir(), "homecook-youtube-worker-"));
      const resultPath = path.join(workspace, "result.json");
      let child;
      try {
        await cp(bundleRoot, workspace, { recursive: true, force: true });
        child = spawn(process.execPath, [
          path.join(workspace, "worker.mjs"),
          "--video-id",
          videoId,
          "--result",
          resultPath,
        ], {
          cwd: workspace,
          env: { ...workerEnv, NODE_ENV: "production" },
          detached: true,
          stdio: ["ignore", "ignore", "ignore"],
        });
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
            if (code !== 0) {
              reject(new Error("EXTRACTION_FAILED"));
              return;
            }
            try {
              const resultStat = await stat(resultPath);
              if (resultStat.size > MAX_RESULT_BYTES) throw new Error();
              resolve(JSON.parse(await readFile(resultPath, "utf8")));
            } catch {
              reject(new Error("EXTRACTION_FAILED"));
            }
          });
        });
      } finally {
        terminateProcess(child);
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
