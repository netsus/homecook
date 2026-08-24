import { spawn as spawnChild } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { lstat, mkdir, stat, symlink } from "node:fs/promises";
import { createServer, request as requestHttp } from "node:http";
import path from "node:path";
import { performance } from "node:perf_hooks";

import {
  normalizeLocalSeedProviderCode,
  normalizeLocalSeedReasonCode,
} from "./local-seed-diagnostics.mjs";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost"]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const GIT_SHA_PATTERN = /^[a-f0-9]{40}$/u;
const STAGE4_NEGATIVE_PROBE_MAX_BODY_BYTES = 4_096;
const STAGE4_NEGATIVE_PROBE_TRANSPORT_CODES = new Set([
  "connection_refused",
  "http_response",
  "invalid_json",
  "json_response",
  "network_error",
  "not_attempted",
  "pending",
  "timeout_aborted",
]);

export const STAGE4_SUPABASE_CLI_VERSION = "2.109.1";
export const STAGE4_SUPABASE_CLI_PACKAGE =
  `supabase@${STAGE4_SUPABASE_CLI_VERSION}`;

const STAGE4_PRE_REQUEST_GUARD =
  "pgrst.db_pre_request=public.verify_hybrid_request_authority_pre_request";

export const STAGE4_PRIMARY_GUARD_VERIFY_SQL = [
  "SELECT config",
  "FROM pg_roles",
  "CROSS JOIN LATERAL unnest(rolconfig) AS config",
  "WHERE rolname = 'authenticator'",
  `  AND config = '${STAGE4_PRE_REQUEST_GUARD}';`,
].join("\n");

export const STAGE4_RUNTIME_AUTHORITY_VERIFY_SQL = [
  "SELECT concat_ws('|',",
  "  control.authority,",
  "  capability.state,",
  "  coalesce(control.local_issuer, '')",
  ")",
  "FROM private.full_local_auth_control AS control",
  "CROSS JOIN public.account_generation_capability_state AS capability",
  "WHERE control.singleton AND capability.singleton;",
].join("\n");

export function assertStage4RuntimeAuthorityOutput(output) {
  const [authAuthority, accountGenerationCapability, localIssuer, ...rest] =
    typeof output === "string" ? output.trim().split("|") : [];
  if (
    rest.length === 0
    && authAuthority === "local"
    && accountGenerationCapability === "generation_active"
    && /^https:\/\/[^/?#]+\/auth\/v1$/u.test(localIssuer ?? "")
  ) {
    return {
      account_generation_capability: accountGenerationCapability,
      auth_authority: authAuthority,
      local_issuer_ready: true,
    };
  }

  const code = "local_session_authority_unavailable";
  const message = "Stage 4 local session authority is not active";
  const error = new Error(message);
  error.code = code;
  error.safeFailure = { code, message };
  throw error;
}

export const STAGE4_CACHED_DOCKER_IMAGES = Object.freeze({
  gotrue: "public.ecr.aws/supabase/gotrue:v2.192.0",
  imgproxy: "public.ecr.aws/supabase/imgproxy:v3.8.0",
  kong: "public.ecr.aws/supabase/kong:2.8.1",
  postgres: "public.ecr.aws/supabase/postgres:17.6.1.143",
  postgrest: "public.ecr.aws/supabase/postgrest:v14.14",
  storage: "public.ecr.aws/supabase/storage-api:v1.62.5",
});

const STAGE4_IMAGE_REQUIREMENT_ORDER = Object.freeze([
  ["postgres", null],
  ["gotrue", "gotrue"],
  ["postgrest", "postgrest"],
  ["kong", "kong"],
  ["storage", "storage-api"],
  ["imgproxy", "imgproxy"],
]);

const MISSING_IMAGE_FAILURE = Object.freeze({
  code: "missing_image",
  message: "required Stage 4 Docker image is not cached",
});

function buildStage4BrowserCaptureFailure(code) {
  const messages = {
    browser_capture_failed: "Stage 4 browser capture command failed",
    browser_capture_start_failed:
      "Stage 4 browser capture command failed to start",
    browser_capture_timeout: "Stage 4 browser capture command timed out",
  };
  const message = messages[code] ?? messages.browser_capture_failed;
  const error = new Error(message);
  error.code = code;
  error.safeFailure = { code, message };
  return error;
}

/**
 * @param {{
 *   args: string[],
 *   command: string,
 *   cwd: string,
 *   env: Record<string, string | undefined>,
 *   killGraceMs?: number,
 *   spawnImpl?: typeof spawnChild,
 *   timeoutMs: number,
 * }} options
 */
export function runStage4BrowserCaptureCommand({
  args,
  command,
  cwd,
  env,
  killGraceMs = 5_000,
  spawnImpl = spawnChild,
  timeoutMs,
}) {
  if (
    typeof command !== "string"
    || command.length === 0
    || !Array.isArray(args)
    || typeof cwd !== "string"
    || cwd.length === 0
    || !env
    || typeof env !== "object"
    || !Number.isInteger(timeoutMs)
    || timeoutMs < 1
    || !Number.isInteger(killGraceMs)
    || killGraceMs < 1
    || typeof spawnImpl !== "function"
  ) {
    throw new Error("Stage 4 browser capture command options are invalid");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    let forceKillTimer = null;
    const child = spawnImpl(command, args, {
      cwd,
      env,
      stdio: "inherit",
    });
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(forceKillTimer);
      if (error) reject(error);
      else resolve();
    };
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, killGraceMs);
    }, timeoutMs);

    child.once("error", () => {
      finish(buildStage4BrowserCaptureFailure(
        "browser_capture_start_failed",
      ));
    });
    child.once("close", (code) => {
      if (timedOut) {
        finish(buildStage4BrowserCaptureFailure("browser_capture_timeout"));
        return;
      }
      if (code !== 0) {
        finish(buildStage4BrowserCaptureFailure("browser_capture_failed"));
        return;
      }
      finish();
    });
  });
}

export function buildStage4NavigationOptions() {
  return {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  };
}

const STAGE4_QA_FIXTURE_SCOPE = Object.freeze([
  "ACCOUNT_QUARANTINE:auth-absent",
]);

export function buildStage4QaFixtureScope() {
  return [...STAGE4_QA_FIXTURE_SCOPE];
}

export function buildStage4AccountQuarantineFixtureCookie(baseUrl) {
  const origin = assertExactLoopbackHttpOrigin(
    baseUrl,
    "Stage 4 account quarantine fixture origin",
  ).origin;
  return {
    name: "homecook.qa-account-quarantine-state",
    sameSite: "Lax",
    secure: false,
    url: origin,
    value: "auth-absent",
  };
}

export function parseStage4CaptureArgs(
  argv,
  {
    defaultBaseUrl = "http://127.0.0.1:3000",
    env = process.env,
  } = {},
) {
  const result = {
    attemptId: env.HOMECOOK_CML14_CAPTURE_ATTEMPT_ID ?? null,
    baseUrl: env.BASE_URL ?? defaultBaseUrl,
    targetAttestation: env.HOMECOOK_CML14_TARGET_ATTESTATION ?? null,
  };
  const optionTargets = new Map([
    ["--attempt-id", "attemptId"],
    ["--base-url", "baseUrl"],
    ["--target-attestation", "targetAttestation"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--") continue;

    const target = optionTargets.get(value);
    const next = argv[index + 1];
    if (target) {
      if (typeof next !== "string" || next.startsWith("--")) {
        throw new Error(`Stage 4 capture option requires a value: ${value}`);
      }
      result[target] = next;
      index += 1;
      continue;
    }
    if (
      typeof value === "string"
      && value.startsWith("--")
      && typeof next === "string"
      && !next.startsWith("--")
    ) {
      index += 1;
    }
  }
  return result;
}

function isSameOrDescendant(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === ""
    || (!relative.startsWith(`..${path.sep}`)
      && relative !== ".."
      && !path.isAbsolute(relative));
}

async function assertStage4Directory(source, label) {
  let metadata;
  try {
    metadata = await stat(source);
  } catch {
    throw new Error(`Stage 4 ${label} source directory is unavailable`);
  }
  if (!metadata.isDirectory()) {
    throw new Error(`Stage 4 ${label} source directory is unavailable`);
  }
}

async function assertStage4PathAbsent(target, label) {
  try {
    await lstat(target);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw new Error(`Stage 4 ${label} target could not be verified`);
  }
  throw new Error(`Stage 4 ${label} target must be absent`);
}

export async function linkStage4SeedInputs({
  isolatedRoot,
  repositoryRoot,
}) {
  if (
    typeof isolatedRoot !== "string"
    || typeof repositoryRoot !== "string"
    || !path.isAbsolute(isolatedRoot)
    || !path.isAbsolute(repositoryRoot)
    || isSameOrDescendant(repositoryRoot, isolatedRoot)
    || isSameOrDescendant(isolatedRoot, repositoryRoot)
  ) {
    throw new Error("Stage 4 seed input roots must be separate absolute paths");
  }

  const sourceScripts = path.join(repositoryRoot, "scripts");
  const sourceFixtures = path.join(repositoryRoot, "qa", "fixtures");
  const targetScripts = path.join(isolatedRoot, "scripts");
  const targetQa = path.join(isolatedRoot, "qa");
  const targetFixtures = path.join(targetQa, "fixtures");

  await Promise.all([
    assertStage4Directory(sourceScripts, "scripts"),
    assertStage4Directory(sourceFixtures, "QA fixtures"),
    assertStage4PathAbsent(targetScripts, "scripts"),
    assertStage4PathAbsent(targetQa, "QA"),
  ]);
  await mkdir(targetQa, { mode: 0o700 });
  await symlink(sourceFixtures, targetFixtures, "dir");
  await symlink(sourceScripts, targetScripts, "dir");

  return {
    fixtures: targetFixtures,
    scripts: targetScripts,
  };
}

export function assertStage4SupabaseCliVersion(output) {
  const actual = String(output ?? "").trim().replace(/^v/u, "");
  if (actual !== STAGE4_SUPABASE_CLI_VERSION) {
    throw new Error(
      `Stage 4 Supabase CLI must be ${STAGE4_SUPABASE_CLI_VERSION}, received ${actual || "unknown"}`,
    );
  }
  return actual;
}

const TARGET_ENV_KEYS = [
  "HOMECOOK_DATA_AUTHORITY",
  "DATA_SUPABASE_URL",
  "DATA_SUPABASE_PUBLISHABLE_KEY",
  "DATA_SUPABASE_SECRET_KEY",
  "HOMECOOK_AUTH_AUTHORITY",
  "NEXT_PUBLIC_AUTH_SUPABASE_URL",
  "NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY",
  "LOCAL_SUPABASE_INTERNAL_URL",
  "LOCAL_SUPABASE_SECRET_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_APP_URL",
];
const STAGE4_SERVICE_PROFILES = Object.freeze({
  db: Object.freeze([]),
  auth: Object.freeze(["gotrue"]),
  rest: Object.freeze(["postgrest"]),
  "rest-auth": Object.freeze(["gotrue", "postgrest"]),
  gateway: Object.freeze(["kong", "postgrest"]),
  api: Object.freeze(["gotrue", "kong", "postgrest"]),
  storage: Object.freeze([
    "gotrue",
    "kong",
    "postgrest",
    "storage-api",
    "imgproxy",
  ]),
  full: Object.freeze([
    "gotrue",
    "kong",
    "postgrest",
    "storage-api",
    "imgproxy",
  ]),
});

const DOCKER_STATE_VALUES = new Set([
  "created",
  "running",
  "paused",
  "restarting",
  "removing",
  "exited",
  "dead",
]);
const DOCKER_HEALTH_VALUES = new Set([
  "starting",
  "healthy",
  "unhealthy",
  "missing",
]);

function safeDockerToken(value, allowed = null) {
  if (typeof value !== "string" || !/^[a-z0-9_-]{1,64}$/u.test(value)) {
    return "unknown";
  }
  if (allowed && !allowed.has(value)) return "unknown";
  return value;
}

export function buildStage4FailureResourceSnapshot({ projectId, resources }) {
  if (typeof projectId !== "string" || projectId.length === 0) {
    throw new Error("Stage 4 diagnostic project id is required");
  }
  if (!Array.isArray(resources)) {
    throw new Error("Stage 4 diagnostic container resources are required");
  }

  const containers = resources.map((resource) => {
    const labels = resource?.Config?.Labels ?? {};
    if (labels["com.docker.compose.project"] !== projectId) {
      throw new Error("Stage 4 diagnostic container belongs to another project");
    }
    const restartCount = Number.isInteger(resource?.RestartCount)
      && resource.RestartCount >= 0
      ? resource.RestartCount
      : 0;
    return {
      health: safeDockerToken(
        resource?.State?.Health?.Status ?? "missing",
        DOCKER_HEALTH_VALUES,
      ),
      oom_killed: resource?.State?.OOMKilled === true,
      restart_count: restartCount,
      service: safeDockerToken(
        labels["com.docker.compose.service"],
      ),
      state: safeDockerToken(
        resource?.State?.Status,
        DOCKER_STATE_VALUES,
      ),
    };
  }).sort((left, right) => left.service.localeCompare(right.service));

  return {
    collection_status: "passed",
    containers,
  };
}

export function assertStage4OwnedDatabaseContainer({ containers, projectId }) {
  const expectedName = `supabase_db_${projectId}`;
  const matches = Array.isArray(containers)
    ? containers.filter((container) =>
      container?.name === expectedName
      && container?.project === projectId
      && typeof container?.id === "string"
      && container.id.length > 0
    )
    : [];
  if (!/^hcg_[a-z0-9_]+$/u.test(projectId ?? "") || matches.length !== 1) {
    throw new Error("Stage 4 owned disposable database container is required");
  }
  return matches[0].id;
}

export function assertStage4PreRequestGuardOutput(output) {
  if (typeof output !== "string" || output.trim() !== STAGE4_PRE_REQUEST_GUARD) {
    throw new Error("Stage 4 pre-request guard verification failed");
  }
  return true;
}

export function assertStage4NegativeProbeResult({ payload, status }) {
  if (
    !Number.isInteger(status)
    || status < 400
    || payload?.code !== "55000"
    || payload?.message !== "ACCOUNT_SESSION_STALE"
  ) {
    throw new Error("Stage 4 primary guard negative probe failed");
  }
  return true;
}

function classifyStage4NegativeProbeTransportError(error, signal) {
  if (
    signal?.aborted
    || error?.name === "AbortError"
    || error?.name === "TimeoutError"
  ) {
    return "timeout_aborted";
  }
  if (error?.code === "ECONNREFUSED" || error?.cause?.code === "ECONNREFUSED") {
    return "connection_refused";
  }
  return "network_error";
}

async function readStage4NegativeProbeText(response) {
  if (response?.body === null || response?.body === undefined) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let cancelled = false;
  let completed = false;
  let size = 0;
  try {
    while (size < STAGE4_NEGATIVE_PROBE_MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      const remaining = STAGE4_NEGATIVE_PROBE_MAX_BODY_BYTES - size;
      const bounded = value.byteLength > remaining
        ? value.subarray(0, remaining)
        : value;
      chunks.push(Buffer.from(bounded));
      size += bounded.byteLength;
      if (value.byteLength > remaining) {
        await reader.cancel();
        cancelled = true;
        break;
      }
    }
    if (!completed && !cancelled && size >= STAGE4_NEGATIVE_PROBE_MAX_BODY_BYTES) {
      await reader.cancel();
    }
  } catch (error) {
    try {
      await reader.cancel();
    } catch {
      // The caller classifies the already-redacted transport failure.
    }
    throw error;
  }
  return Buffer.concat(chunks).toString("utf8");
}

function safeStage4NegativeProbePayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rawProviderCode = value.code;
  return {
    code: normalizeLocalSeedProviderCode(rawProviderCode),
    message: value.message === "ACCOUNT_SESSION_STALE"
      ? "ACCOUNT_SESSION_STALE"
      : "unknown",
    raw_code_is_exact: typeof rawProviderCode === "string"
      && rawProviderCode === "55000",
  };
}

/**
 * @param {{
 *   apiUrl: string | URL,
 *   fetchImpl?: typeof fetch,
 *   onObservation?: (observation: {status: number | null, transportCode: string}) => void,
 *   serviceRoleKey: string,
 *   signal?: AbortSignal,
 * }} options
 */
export async function requestStage4NegativeProbe({
  apiUrl,
  fetchImpl = fetch,
  onObservation = () => {},
  serviceRoleKey,
  signal = undefined,
}) {
  if (
    typeof fetchImpl !== "function"
    || typeof onObservation !== "function"
    || typeof serviceRoleKey !== "string"
    || serviceRoleKey.length === 0
  ) {
    throw new Error("Stage 4 negative probe request dependencies are invalid");
  }
  const target = new URL("/rest/v1/users?select=id&limit=1", apiUrl);
  let status = null;
  try {
    const response = await fetchImpl(target, {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
      method: "GET",
      signal,
    });
    status = Number.isInteger(response?.status) ? response.status : null;
    onObservation({ status, transportCode: "http_response" });

    const text = await readStage4NegativeProbeText(response);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      const result = { payload: null, status, transportCode: "invalid_json" };
      onObservation({ status, transportCode: result.transportCode });
      return result;
    }
    const result = {
      payload: safeStage4NegativeProbePayload(parsed),
      status,
      transportCode: "json_response",
    };
    onObservation({ status, transportCode: result.transportCode });
    return result;
  } catch (error) {
    const transportCode = classifyStage4NegativeProbeTransportError(error, signal);
    const result = { payload: null, status, transportCode };
    onObservation({ status, transportCode });
    return result;
  }
}

function buildStage4NegativeProbeFailure(code, snapshot) {
  const safeFailure = {
    attempt_count: snapshot.attempt_count,
    code,
    last_http_status: snapshot.http_status,
    last_provider_code: snapshot.provider_code,
    last_reason_code: snapshot.reason_code,
    last_transport_code: snapshot.transport_code,
    message: code === "negative_probe_timeout"
      ? "primary guard negative probe timed out"
      : "primary guard negative probe returned an unexpected error",
  };
  const error = new Error(safeFailure.message);
  error.code = code;
  error.safeFailure = safeFailure;
  return error;
}

function toStage4NegativeProbeSnapshot(result, attemptCount) {
  const status = Number.isInteger(result?.status)
    && result.status >= 100
    && result.status <= 599
    ? result.status
    : null;
  return {
    attempt_count: attemptCount,
    http_status: status,
    provider_code: normalizeLocalSeedProviderCode(result?.payload?.code),
    reason_code: result?.payload?.message === "ACCOUNT_SESSION_STALE"
      ? "ACCOUNT_SESSION_STALE"
      : "unknown",
    transport_code: STAGE4_NEGATIVE_PROBE_TRANSPORT_CODES.has(
      result?.transportCode,
    )
      ? result.transportCode
      : status === null
        ? attemptCount === 0 ? "not_attempted" : "network_error"
        : "json_response",
  };
}

function isExactStage4NegativeProbeResult(result) {
  return Number.isInteger(result?.status)
    && result.status >= 400
    && result?.payload?.raw_code_is_exact === true
    && result?.payload?.message === "ACCOUNT_SESSION_STALE";
}

/**
 * Polls only the safe shape of the unscoped service-role guard response.
 * Successful HTTP responses mean the guarded primary PostgREST did not reject
 * the unscoped request. Gateway failures may be transient; any other wrong
 * provider response fails closed immediately.
 */
export async function pollStage4NegativeProbe({
  intervalMs = 250,
  now = () => performance.now(),
  probe,
  sleep = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs)),
  timeoutMs = 15_000,
}) {
  if (typeof probe !== "function" || typeof now !== "function" || typeof sleep !== "function") {
    throw new Error("Stage 4 negative probe polling dependencies are required");
  }
  if (
    !Number.isInteger(timeoutMs)
    || timeoutMs < 10_000
    || timeoutMs > 20_000
    || !Number.isInteger(intervalMs)
    || intervalMs < 1
    || intervalMs > timeoutMs
  ) {
    throw new Error("Stage 4 negative probe polling bounds are invalid");
  }

  const deadline = now() + timeoutMs;
  let attemptCount = 0;
  let snapshot = toStage4NegativeProbeSnapshot(null, attemptCount);

  while (true) {
    const attemptRemainingMs = deadline - now();
    if (attemptRemainingMs <= 0) {
      throw buildStage4NegativeProbeFailure(
        "negative_probe_timeout",
        snapshot,
      );
    }

    attemptCount += 1;
    snapshot = toStage4NegativeProbeSnapshot(
      { transportCode: "pending" },
      attemptCount,
    );
    const controller = new AbortController();
    let abortTimer;
    try {
      const attemptDeadline = new Promise((_, reject) => {
        abortTimer = setTimeout(() => {
          controller.abort();
          reject(new Error("Stage 4 negative probe attempt deadline reached"));
        }, attemptRemainingMs);
      });
      const result = await Promise.race([
        probe({
          observe: (observation) => {
            snapshot = toStage4NegativeProbeSnapshot(
              observation,
              attemptCount,
            );
          },
          signal: controller.signal,
        }),
        attemptDeadline,
      ]);
      snapshot = toStage4NegativeProbeSnapshot(result, attemptCount);
      if (now() >= deadline) {
        throw buildStage4NegativeProbeFailure(
          "negative_probe_timeout",
          snapshot,
        );
      }
      if (isExactStage4NegativeProbeResult(result)) {
        return snapshot;
      }

      const isSuccess = snapshot.http_status !== null
        && snapshot.http_status >= 200
        && snapshot.http_status < 300;
      const isTransientGatewayFailure = [502, 503, 504].includes(
        snapshot.http_status,
      );
      const isTransientTransportFailure = new Set([
        "connection_refused",
        "network_error",
        "timeout_aborted",
      ]).has(snapshot.transport_code);
      if (!isSuccess && !isTransientGatewayFailure && !isTransientTransportFailure) {
        throw buildStage4NegativeProbeFailure(
          "negative_probe_unexpected",
          snapshot,
        );
      }
    } catch (error) {
      if (error?.safeFailure) throw error;
      if (controller.signal.aborted || now() >= deadline) {
        throw buildStage4NegativeProbeFailure(
          "negative_probe_timeout",
          snapshot,
        );
      }
      if (snapshot.transport_code === "pending") {
        snapshot = toStage4NegativeProbeSnapshot(
          { transportCode: "network_error" },
          attemptCount,
        );
      }
    } finally {
      clearTimeout(abortTimer);
    }

    const remainingMs = deadline - now();
    if (remainingMs <= 0) {
      throw buildStage4NegativeProbeFailure(
        "negative_probe_timeout",
        snapshot,
      );
    }
    await sleep(Math.min(intervalMs, remainingMs));
  }
}

export function resolveStage4ServiceProfile(profile = "full") {
  const services = STAGE4_SERVICE_PROFILES[profile];
  if (!services) {
    throw new Error(`unknown Stage 4 diagnostic profile: ${profile}`);
  }
  return [...services];
}

export function resolveStage4RequiredImageTags(profile = "full") {
  const services = new Set(resolveStage4ServiceProfile(profile));
  return STAGE4_IMAGE_REQUIREMENT_ORDER
    .filter(([, service]) => service === null || services.has(service))
    .map(([imageKey]) => STAGE4_CACHED_DOCKER_IMAGES[imageKey]);
}

export function evaluateStage4ImageCache({
  availableImages,
  profile,
}) {
  if (!Array.isArray(availableImages)) {
    throw new Error("Stage 4 available Docker image list is required");
  }
  const requiredImages = resolveStage4RequiredImageTags(profile);
  const availableSet = new Set(availableImages);
  const available = requiredImages.filter((image) => availableSet.has(image));
  const missing = requiredImages.filter((image) => !availableSet.has(image));
  return {
    available_images: available,
    failure: missing.length > 0 ? { ...MISSING_IMAGE_FAILURE } : null,
    missing_images: missing,
    ready: missing.length === 0,
    required_images: requiredImages,
  };
}

export function assertStage4CachedImages({ availableImages, profile }) {
  const result = evaluateStage4ImageCache({ availableImages, profile });
  if (!result.ready) {
    const error = new Error(MISSING_IMAGE_FAILURE.message);
    error.code = MISSING_IMAGE_FAILURE.code;
    error.cacheResult = result;
    throw error;
  }
  return result;
}

export function classifyStage4StartFailure(error) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("timed out") || message.includes("timeout")) {
    return {
      code: "start_timeout",
      message: "isolated Supabase startup timed out",
    };
  }
  if (message.includes("docker") && (
    message.includes("unavailable")
    || message.includes("daemon")
    || message.includes("running")
  )) {
    return {
      code: "docker_unavailable",
      message: "Docker is unavailable for isolated startup",
    };
  }
  return {
    code: "start_failed",
    message: "isolated Supabase startup failed",
  };
}

const STAGE4_SEED_FAILURES = Object.freeze({
  seed_auth_failed: {
    code: "seed_auth_failed",
    message: "isolated Supabase demo seed authentication failed",
    phase: "demo_seed",
  },
  seed_bootstrap_missing: {
    code: "seed_bootstrap_missing",
    message: "isolated Supabase demo seed bootstrap data is unavailable",
    phase: "demo_seed",
  },
  seed_core_qa_failed: {
    code: "seed_core_qa_failed",
    message: "isolated Supabase core QA seed failed",
    phase: "demo_seed",
  },
  seed_data_operation_failed: {
    code: "seed_data_operation_failed",
    message: "isolated Supabase demo seed data operation failed",
    phase: "demo_seed",
  },
  seed_dependency_missing: {
    code: "seed_dependency_missing",
    message: "isolated Supabase demo seed dependency is unavailable",
    phase: "demo_seed",
  },
  seed_failed: {
    code: "seed_failed",
    message: "isolated Supabase demo seed failed",
    phase: "demo_seed",
  },
  seed_file_missing: {
    code: "seed_file_missing",
    message: "isolated Supabase demo seed file is unavailable",
    phase: "demo_seed",
  },
  seed_schema_missing: {
    code: "seed_schema_missing",
    message: "isolated Supabase demo seed schema is unavailable",
    phase: "demo_seed",
  },
  seed_target_unreachable: {
    code: "seed_target_unreachable",
    message: "isolated Supabase demo seed target is unreachable",
    phase: "demo_seed",
  },
});

/**
 * @param {{ stderr?: unknown, stdout?: unknown, timedOut?: boolean }} [input]
 */
const STAGE4_SEED_OPERATION_PATTERNS = Object.freeze([
  ["auth_users_list", ["auth users 조회 실패"]],
  ["auth_user_update", [
    "auth user 갱신 실패",
    "auth user 갱신 결과가 비어 있어요",
  ]],
  ["auth_user_create", [
    "auth user 생성 실패",
    "auth user 생성 결과가 비어 있어요",
  ]],
  ["public_user_read", ["public users 조회 실패"]],
  ["public_user_create", ["public users 생성 실패"]],
  ["public_user_update", ["public users 갱신 실패"]],
  ["core_qa_user_email_read", ["users 이메일 조회 실패"]],
  ["core_qa_user_read", ["users 조회 실패"]],
  ["core_qa_user_create", ["users 생성 실패"]],
  ["recipe_book_missing", ["demo dataset용 recipe book을 찾지 못했어요"]],
  ["planner_column_missing", [
    "planner column을 찾지 못했어요",
    "플래너 컬럼을 찾을 수 없습니다",
  ]],
  ["planner_columns_limit", [
    "이미 5개 컬럼이 있어 qa 플래너 컬럼을 더 만들 수 없습니다",
  ]],
  ["recipe_books_list", ["recipe_books 조회 실패"]],
  ["recipe_books_create", ["recipe_books 생성 실패"]],
  ["planner_columns_list", ["meal_plan_columns 조회 실패"]],
  ["planner_columns_create", ["meal_plan_columns 생성 실패"]],
  ["recipes_upsert", ["추가 demo recipes upsert 실패"]],
  ["core_qa_recipes_upsert", ["recipes upsert 실패"]],
  ["recipes_read", ["recipes 조회 실패"]],
  ["core_qa_recipe_sources_read", ["recipe_sources 조회 실패"]],
  ["core_qa_recipe_sources_upsert", ["recipe_sources upsert 실패"]],
  ["core_qa_recipe_ingredients_reset", ["recipe_ingredients 초기화 실패"]],
  ["core_qa_recipe_ingredients_create", ["recipe_ingredients 생성 실패"]],
  ["core_qa_recipe_steps_reset", ["recipe_steps 초기화 실패"]],
  ["core_qa_recipe_steps_create", ["recipe_steps 생성 실패"]],
  ["pantry_ingredients_read", ["demo ingredients 조회 실패"]],
  ["pantry_ingredients_update", ["demo ingredients 갱신 실패"]],
  ["pantry_ingredients_create", ["demo ingredients 생성 실패"]],
  ["core_qa_ingredients_read", ["ingredients 조회 실패"]],
  ["core_qa_ingredients_create", ["ingredients 생성 실패"]],
  ["core_qa_cooking_methods_read", ["cooking_methods 조회 실패"]],
  ["core_qa_cooking_methods_create", ["cooking_methods 생성 실패"]],
  ["core_qa_ingredient_synonyms_upsert", ["ingredient_synonyms upsert 실패"]],
  ["recipe_likes_reset", [
    "추가 demo recipe_likes 초기화 실패",
    "recipe_likes 초기화 실패",
  ]],
  ["recipe_likes_create", [
    "추가 demo recipe_likes 생성 실패",
    "recipe_likes 생성 실패",
  ]],
  ["recipe_book_items_reset", [
    "추가 demo recipe_book_items 초기화 실패",
    "main user recipe_book_items 초기화 실패",
    "other user recipe_book_items 초기화 실패",
  ]],
  ["recipe_book_items_create", [
    "추가 demo recipe_book_items 생성 실패",
    "recipe_book_items 생성 실패",
  ]],
  ["planner_meals_reset", [
    "추가 demo meals 초기화 실패",
    "meals 초기화 실패",
  ]],
  ["planner_meals_create", [
    "추가 demo meals 생성 실패",
    "meals 생성 실패",
  ]],
  ["ingredient_bundles_create", ["demo ingredient_bundles 생성 실패"]],
  ["ingredient_bundle_items_reset", ["demo ingredient_bundle_items 초기화 실패"]],
  ["ingredient_bundle_items_create", ["demo ingredient_bundle_items 생성 실패"]],
  ["pantry_items_reset", ["demo pantry_items 초기화 실패"]],
  ["pantry_items_create", ["demo pantry_items 생성 실패"]],
  ["recipe_likes_count", ["recipe_likes count 실패"]],
  ["recipe_book_items_count", ["recipe_book_items count 실패"]],
  ["planner_meals_count", ["meals count 실패"]],
  ["cook_done_count", ["cook_done count 실패"]],
  ["recipe_counters_update", ["recipes 카운트 갱신 실패"]],
]);

export function classifyStage4SeedOperationDetail(output) {
  const normalized = String(output ?? "").toLowerCase();
  for (const [detailCode, patterns] of STAGE4_SEED_OPERATION_PATTERNS) {
    if (patterns.some((pattern) => normalized.includes(pattern.toLowerCase()))) {
      return detailCode;
    }
  }
  return "unknown";
}

/**
 * @param {{ stderr?: unknown, stdout?: unknown, timedOut?: boolean }} [input]
 */
export function classifyStage4SeedFailureOutput({
  stderr,
  stdout,
  timedOut = false,
} = {}) {
  const rawOutput = `${String(stdout ?? "")}\n${String(stderr ?? "")}`;
  const output = rawOutput.toLowerCase();
  let category = "seed_failed";
  if (timedOut || /econnrefused|connection refused|fetch failed|target unreachable/u.test(output)) {
    category = "seed_target_unreachable";
  } else if (/err_module_not_found|cannot find (?:package|module)|module_not_found/u.test(output)) {
    category = "seed_dependency_missing";
  } else if (/\benoent\b|no such file or directory/u.test(output)) {
    category = "seed_file_missing";
  } else if (/\b42p01\b|\b42p06\b|relation .* does not exist|schema .* does not exist/u.test(output)) {
    category = "seed_schema_missing";
  } else if (/invalid login credentials|authentication failed|unauthorized|\b401\b|\b403\b/u.test(output)) {
    category = "seed_auth_failed";
  } else if (
    /auth users?.*(?:실패|비어)|auth user.*(?:실패|비어)/u.test(output)
  ) {
    category = "seed_auth_failed";
  } else if (
    /recipe book.*(?:찾지 못|찾을 수 없)|planner column.*(?:찾지 못|찾을 수 없)|demo dataset.*찾지 못/u.test(output)
  ) {
    category = "seed_bootstrap_missing";
  } else if (
    /(?:조회|생성|갱신|저장|삭제|추가|반영) 실패/u.test(output)
  ) {
    category = "seed_data_operation_failed";
  } else if (
    /qa[_ -]?seed|core qa seed|--user-id.*필요/u.test(output)
  ) {
    category = "seed_core_qa_failed";
  }
  const detailCode = classifyStage4SeedOperationDetail(output);
  const providerCodeMatch = output.match(
    /\[provider_code=([0-9a-z]+)\]/u,
  );
  const providerCode = normalizeLocalSeedProviderCode(
    providerCodeMatch?.[1],
  );
  const reasonCodeMatch = rawOutput.match(
    /\[reason_code=([0-9A-Za-z_]+)\]/u,
  );
  const reasonCode = normalizeLocalSeedReasonCode(
    reasonCodeMatch?.[1],
  );
  if (category === "seed_failed" && detailCode !== "unknown") {
    if (detailCode.startsWith("auth_")) {
      category = "seed_auth_failed";
    } else if (
      detailCode.endsWith("_missing")
      || detailCode.endsWith("_limit")
    ) {
      category = "seed_bootstrap_missing";
    } else {
      category = "seed_data_operation_failed";
    }
  }

  return {
    ...STAGE4_SEED_FAILURES[category],
    detail_code: detailCode,
    provider_code: providerCode,
    reason_code: reasonCode,
  };
}

export function buildStage4SensitiveCommandError({
  failureClassifier = null,
  label,
  result,
  timeoutMs,
}) {
  const timedOut = result?.error?.code === "ETIMEDOUT";
  if (typeof failureClassifier === "function") {
    const safeFailure = failureClassifier({
      stderr: result?.stderr,
      stdout: result?.stdout,
      timedOut,
    });
    const classified = new Error(safeFailure.message);
    classified.code = safeFailure.code;
    classified.safeFailure = safeFailure;
    return classified;
  }
  const status = Number.isInteger(result?.status) ? result.status : "unknown";
  const error = new Error(
    timedOut
      ? `${label} timed out after ${timeoutMs}ms`
      : `${label} failed with status ${status}`,
  );
  error.code = timedOut
    ? "sensitive_command_timeout"
    : "sensitive_command_failed";
  return error;
}

const CLEANUP_FAILURE = Object.freeze({
  code: "cleanup_failed",
  message: "isolated Supabase cleanup failed",
});

export function buildStage4DiagnosticOutcome({
  cleanupError,
  diagnosticStatus,
  primaryFailure,
}) {
  const cleanupFailure = cleanupError
    ? cleanupError?.safeFailure
      ? { ...cleanupError.safeFailure }
      : { ...CLEANUP_FAILURE }
    : null;
  return {
    cleanupFailure,
    failure: primaryFailure ?? cleanupFailure,
    status: cleanupFailure ? "failed" : diagnosticStatus,
  };
}

export function assertStage4DiagnosticAttemptAvailable({
  attemptId,
  diagnosticRoot,
}) {
  if (
    typeof attemptId !== "string"
    || !/^[a-z0-9][a-z0-9._-]{2,95}$/u.test(attemptId)
    || attemptId.includes("..")
  ) {
    throw new Error("Stage 4 diagnostic attempt id is invalid");
  }
  if (existsSync(path.join(diagnosticRoot, attemptId))) {
    throw new Error(`Stage 4 diagnostic attempt already exists: ${attemptId}`);
  }
}

function assertLoopbackHttpUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid loopback URL`);
  }
  if (parsed.protocol !== "http:" || !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error(`${label} must be loopback http only`);
  }
  return parsed;
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
}

/**
 * @param {{
 *   contestedError?: (Error & { code?: string, safeFailure?: Record<string, string> }) | null,
 *   fallbackCleanup: () => unknown,
 *   stopCleanup: () => boolean,
 *   verifyCleanup: () => unknown,
 * }} options
 */
export function runStage4DockerCleanup({
  contestedError = null,
  fallbackCleanup,
  stopCleanup,
  verifyCleanup,
}) {
  if (contestedError) throw contestedError;
  if (
    typeof fallbackCleanup !== "function"
    || typeof stopCleanup !== "function"
    || typeof verifyCleanup !== "function"
  ) {
    throw new Error("Stage 4 Docker cleanup actions are required");
  }
  let succeeded = stopCleanup() === true;
  if (succeeded) {
    try {
      verifyCleanup();
    } catch {
      succeeded = false;
    }
  }
  if (!succeeded) {
    fallbackCleanup();
    verifyCleanup();
    return { succeeded: true, used_fallback: true };
  }
  return { succeeded: true, used_fallback: false };
}

export function resolveStage4GuardedDataProxyTarget({
  dataUpstreamUrl,
  proxyUrl,
  requestUrl,
  storageUpstreamUrl,
}) {
  const proxy = assertLoopbackHttpUrl(proxyUrl, "Stage 4 guarded proxy URL");
  const request = assertLoopbackHttpUrl(
    requestUrl,
    "Stage 4 guarded proxy request URL",
  );
  if (request.origin !== proxy.origin) {
    throw new Error("Stage 4 guarded proxy request origin mismatch");
  }

  let upstream;
  let pathname;
  if (request.pathname === "/rest/v1" || request.pathname.startsWith("/rest/v1/")) {
    upstream = assertLoopbackHttpUrl(
      dataUpstreamUrl,
      "Stage 4 guarded raw Data upstream URL",
    );
    pathname = request.pathname.slice("/rest/v1".length) || "/";
  } else if (
    request.pathname === "/storage/v1"
    || request.pathname.startsWith("/storage/v1/")
  ) {
    upstream = assertLoopbackHttpUrl(
      storageUpstreamUrl,
      "Stage 4 isolated Storage upstream URL",
    );
    pathname = request.pathname;
  } else {
    throw new Error("Stage 4 guarded proxy route is not allowlisted");
  }
  upstream.pathname = pathname;
  upstream.search = request.search;
  return upstream.toString();
}

function stage4ProxyHeaders(headers, targetHost = null) {
  const forwarded = { ...headers };
  if (targetHost) forwarded.host = targetHost;
  for (const name of [
    "connection",
    "keep-alive",
    "proxy-connection",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
  ]) {
    delete forwarded[name];
  }
  return forwarded;
}

export async function startStage4GuardedDataProxy({
  dataUpstreamUrl,
  port,
  storageUpstreamUrl,
}) {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("Stage 4 guarded proxy port is invalid");
  }
  const dataOrigin = assertLoopbackHttpUrl(
    dataUpstreamUrl,
    "Stage 4 guarded raw Data upstream URL",
  ).origin;
  const storageOrigin = assertLoopbackHttpUrl(
    storageUpstreamUrl,
    "Stage 4 isolated Storage upstream URL",
  ).origin;
  let proxyUrl = null;
  const server = createServer((clientRequest, clientResponse) => {
    let target;
    try {
      const host = clientRequest.headers.host ?? "";
      target = new URL(resolveStage4GuardedDataProxyTarget({
        dataUpstreamUrl: dataOrigin,
        proxyUrl,
        requestUrl: `http://${host}${clientRequest.url ?? "/"}`,
        storageUpstreamUrl: storageOrigin,
      }));
    } catch {
      clientResponse.writeHead(404, { "content-type": "text/plain" });
      clientResponse.end("not found");
      return;
    }

    const upstreamRequest = requestHttp(target, {
      headers: stage4ProxyHeaders(clientRequest.headers, target.host),
      method: clientRequest.method,
    }, (upstreamResponse) => {
      clientResponse.writeHead(
        upstreamResponse.statusCode ?? 502,
        stage4ProxyHeaders(upstreamResponse.headers),
      );
      upstreamResponse.pipe(clientResponse);
    });
    upstreamRequest.on("error", () => {
      if (!clientResponse.headersSent) clientResponse.writeHead(502);
      clientResponse.end();
    });
    clientRequest.on("error", () => upstreamRequest.destroy());
    clientRequest.pipe(upstreamRequest);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port }, resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeStage4GuardedDataProxy(server);
    throw new Error("Stage 4 guarded proxy address is unavailable");
  }
  proxyUrl = `http://127.0.0.1:${address.port}`;
  return { server, url: proxyUrl };
}

export async function closeStage4GuardedDataProxy(server) {
  if (!server || typeof server.close !== "function") {
    throw new Error("Stage 4 guarded proxy server is invalid");
  }
  if (server.listening === false) return;
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

export function buildStage4ServerEnvironment({
  ambient = {},
  anonKey,
  apiUrl,
  appOrigin,
  authApiUrl,
  serviceRoleKey,
}) {
  for (const [label, value] of Object.entries({
    anonKey,
    apiUrl,
    appOrigin,
    authApiUrl,
    serviceRoleKey,
  })) {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`Stage 4 server target ${label} is missing`);
    }
  }

  const normalizedApiUrl = assertLoopbackHttpUrl(
    apiUrl,
    "Stage 4 server API URL",
  ).origin;
  const normalizedAppOrigin = assertLoopbackHttpUrl(
    appOrigin,
    "Stage 4 server app origin",
  ).origin;
  const normalizedAuthApiUrl = assertLoopbackHttpUrl(
    authApiUrl,
    "Stage 4 server Auth API URL",
  ).origin;
  if (normalizedApiUrl === normalizedAuthApiUrl) {
    throw new Error("Stage 4 guarded Data and Auth API URLs must be distinct");
  }

  const serverEnvironment = {
    ...ambient,
    DATA_SUPABASE_PUBLISHABLE_KEY: anonKey,
    DATA_SUPABASE_SECRET_KEY: serviceRoleKey,
    DATA_SUPABASE_URL: normalizedApiUrl,
    HOMECOOK_AUTH_AUTHORITY: "local",
    HOMECOOK_DATA_AUTHORITY: "local",
    LOCAL_SUPABASE_INTERNAL_URL: normalizedAuthApiUrl,
    LOCAL_SUPABASE_SECRET_KEY: serviceRoleKey,
    NEXT_PUBLIC_APP_URL: normalizedAppOrigin,
    NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY: anonKey,
    NEXT_PUBLIC_AUTH_SUPABASE_URL: normalizedAuthApiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    NEXT_PUBLIC_SUPABASE_URL: normalizedAuthApiUrl,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
  };
  delete serverEnvironment.HOMECOOK_ENABLE_QA_FIXTURES;
  delete serverEnvironment.NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES;
  return serverEnvironment;
}

function normalizeStage4ServerTarget(env) {
  const target = Object.fromEntries(
    TARGET_ENV_KEYS.map((key) => {
      const value = env?.[key];
      if (typeof value !== "string" || value.length === 0) {
        throw new Error(`Stage 4 server target ${key} is missing`);
      }
      return [key, value];
    }),
  );
  if (
    target.HOMECOOK_AUTH_AUTHORITY !== "local"
    || target.HOMECOOK_DATA_AUTHORITY !== "local"
  ) {
    throw new Error("Stage 4 Auth and Data authorities must be local");
  }

  const dataOrigin = assertLoopbackHttpUrl(
    target.DATA_SUPABASE_URL,
    "Stage 4 Data URL",
  ).origin;
  const appOrigin = assertLoopbackHttpUrl(
    target.NEXT_PUBLIC_APP_URL,
    "Stage 4 app URL",
  ).origin;
  const authOrigin = assertLoopbackHttpUrl(
    target.NEXT_PUBLIC_AUTH_SUPABASE_URL,
    "Stage 4 Auth URL",
  ).origin;
  if (dataOrigin === authOrigin) {
    throw new Error("Stage 4 guarded Data URL must be distinct from Auth");
  }
  for (const key of ["LOCAL_SUPABASE_INTERNAL_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
    if (assertLoopbackHttpUrl(target[key], `Stage 4 ${key}`).origin !== authOrigin) {
      throw new Error(`Stage 4 ${key} does not match the isolated Auth URL`);
    }
  }

  return {
    ...target,
    DATA_SUPABASE_URL: dataOrigin,
    LOCAL_SUPABASE_INTERNAL_URL: authOrigin,
    NEXT_PUBLIC_APP_URL: appOrigin,
    NEXT_PUBLIC_AUTH_SUPABASE_URL: authOrigin,
    NEXT_PUBLIC_SUPABASE_URL: authOrigin,
  };
}

export function hashStage4ServerTarget(env) {
  const target = normalizeStage4ServerTarget(env);
  return createHash("sha256")
    .update(JSON.stringify(target))
    .digest("hex");
}

export function assertStage4ServerEnvironment(env, attestation) {
  const target = normalizeStage4ServerTarget(env);
  if (target.DATA_SUPABASE_URL !== new URL(attestation.api_url).origin) {
    throw new Error("Stage 4 process Data URL does not match attestation");
  }
  if (
    target.NEXT_PUBLIC_AUTH_SUPABASE_URL
    !== new URL(attestation.auth_api_url).origin
  ) {
    throw new Error("Stage 4 process Auth URL does not match attestation");
  }
  if (target.NEXT_PUBLIC_APP_URL !== new URL(attestation.app_origin).origin) {
    throw new Error("Stage 4 process app URL does not match attestation");
  }
  const digest = hashStage4ServerTarget(target);
  if (digest !== attestation.server_env_sha256) {
    throw new Error("Stage 4 server target digest does not match attestation");
  }
  return digest;
}

const STAGE4_ATTESTATION_KEYS = Object.freeze([
  "api_url",
  "app_origin",
  "auth_api_url",
  "docker",
  "generated_at",
  "guarded_data_api_url",
  "guarded_data_api_used",
  "guarded_data_proxy_used",
  "migration_sha256",
  "negative_probe_passed",
  "pinned_isolated_local",
  "ports",
  "primary_guard_unchanged",
  "project_id",
  "qa_fixture_scope",
  "remote_linked_cloud_access",
  "server_env_sha256",
  "server_env_target",
  "shadow_seed_api_removed",
  "shadow_seed_api_used",
  "source_head_sha",
  "supabase_cli_version",
]);
const STAGE4_ATTESTATION_DOCKER_KEYS = Object.freeze([
  "containers",
  "networks",
  "volumes",
]);
const STAGE4_ATTESTATION_PORT_KEYS = Object.freeze([
  "app",
  "auth",
  "base",
  "data",
  "guarded",
]);

function assertExactObjectKeys(value, expectedKeys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} schema is invalid`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} schema contains unknown or missing fields`);
  }
}

function assertExactLoopbackHttpOrigin(value, label) {
  const parsed = assertLoopbackHttpUrl(value, label);
  if (
    typeof value !== "string"
    || value !== parsed.origin
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) {
    throw new Error(`${label} must be an exact origin without credentials, path, query or hash`);
  }
  return parsed;
}

function assertStage4GeneratedAt(value) {
  if (typeof value !== "string") {
    throw new Error("Stage 4 generated_at is invalid");
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error("Stage 4 generated_at is invalid");
  }
  return value;
}

export function validateStage4TargetAttestation(attestation, expectedAppOrigin) {
  if (!attestation || typeof attestation !== "object" || Array.isArray(attestation)) {
    throw new Error("Stage 4 target attestation is required");
  }
  assertExactObjectKeys(
    attestation,
    STAGE4_ATTESTATION_KEYS,
    "Stage 4 target attestation",
  );
  assertExactObjectKeys(
    attestation.docker,
    STAGE4_ATTESTATION_DOCKER_KEYS,
    "Stage 4 Docker attestation",
  );
  assertExactObjectKeys(
    attestation.ports,
    STAGE4_ATTESTATION_PORT_KEYS,
    "Stage 4 port attestation",
  );
  if (attestation.pinned_isolated_local !== true) {
    throw new Error("Stage 4 target must be pinned isolated local");
  }
  if (attestation.remote_linked_cloud_access !== 0) {
    throw new Error("Stage 4 target must record remote linked cloud access zero");
  }
  if (
    !Array.isArray(attestation.qa_fixture_scope)
    || attestation.qa_fixture_scope.length !== STAGE4_QA_FIXTURE_SCOPE.length
    || attestation.qa_fixture_scope.some(
      (scope, index) => scope !== STAGE4_QA_FIXTURE_SCOPE[index],
    )
  ) {
    throw new Error("Stage 4 QA fixture scope is invalid");
  }
  if (!/^hcg_[a-z0-9_]+$/u.test(attestation.project_id ?? "")) {
    throw new Error("Stage 4 isolated project id is invalid");
  }
  if (!SHA256_PATTERN.test(attestation.migration_sha256 ?? "")) {
    throw new Error("Stage 4 migration digest is invalid");
  }
  if (!GIT_SHA_PATTERN.test(attestation.source_head_sha ?? "")) {
    throw new Error("Stage 4 source head is invalid");
  }
  if (!SHA256_PATTERN.test(attestation.server_env_sha256 ?? "")) {
    throw new Error("Stage 4 server environment digest is invalid");
  }
  if (attestation.server_env_target !== "isolated-supabase") {
    throw new Error("Stage 4 server environment target is not isolated Supabase");
  }
  if (attestation.supabase_cli_version !== STAGE4_SUPABASE_CLI_VERSION) {
    throw new Error("Stage 4 Supabase CLI version is invalid");
  }
  assertStage4GeneratedAt(attestation.generated_at);
  for (const field of [
    "guarded_data_api_used",
    "guarded_data_proxy_used",
    "negative_probe_passed",
    "primary_guard_unchanged",
    "shadow_seed_api_removed",
    "shadow_seed_api_used",
  ]) {
    if (attestation[field] !== true) {
      throw new Error("Stage 4 guarded Data or shadow seed closeout is incomplete");
    }
  }

  const apiUrl = assertExactLoopbackHttpOrigin(
    attestation.api_url,
    "Stage 4 API URL",
  );
  const authApiUrl = assertExactLoopbackHttpOrigin(
    attestation.auth_api_url,
    "Stage 4 Auth API URL",
  );
  const guardedDataApiUrl = assertExactLoopbackHttpOrigin(
    attestation.guarded_data_api_url,
    "Stage 4 guarded raw Data API URL",
  );
  if (apiUrl.origin === authApiUrl.origin) {
    throw new Error("Stage 4 guarded Data and Auth API URLs must be distinct");
  }
  const appOrigin = assertExactLoopbackHttpOrigin(
    attestation.app_origin,
    "Stage 4 app origin",
  );
  const expectedOrigin = assertExactLoopbackHttpOrigin(
    expectedAppOrigin,
    "Expected Stage 4 app origin",
  );
  if (appOrigin.origin !== expectedOrigin.origin) {
    throw new Error("Stage 4 attested app origin does not match capture base URL");
  }

  assertPositiveInteger(attestation.ports?.base, "Stage 4 isolated base port");
  assertPositiveInteger(attestation.ports?.app, "Stage 4 app port");
  assertPositiveInteger(attestation.ports?.auth, "Stage 4 Auth API port");
  assertPositiveInteger(attestation.ports?.data, "Stage 4 Data API port");
  assertPositiveInteger(
    attestation.ports?.guarded,
    "Stage 4 guarded raw Data API port",
  );
  if (Number(appOrigin.port) !== attestation.ports.app) {
    throw new Error("Stage 4 app origin port does not match attestation");
  }
  if (
    Number(authApiUrl.port) !== attestation.ports.auth
    || attestation.ports.auth !== attestation.ports.base + 1
  ) {
    throw new Error("Stage 4 Auth API URL is outside the isolated port range");
  }
  if (Number(apiUrl.port) !== attestation.ports.data) {
    throw new Error("Stage 4 guarded Data API port does not match attestation");
  }
  if (Number(guardedDataApiUrl.port) !== attestation.ports.guarded) {
    throw new Error("Stage 4 guarded raw Data API port does not match attestation");
  }
  const distinctPorts = new Set([
    attestation.ports.app,
    attestation.ports.auth,
    attestation.ports.data,
    attestation.ports.guarded,
  ]);
  if (distinctPorts.size !== 4) {
    throw new Error("Stage 4 app, Auth, Data and guarded ports must be distinct");
  }
  if (
    attestation.ports.data >= attestation.ports.base
    && attestation.ports.data <= attestation.ports.base + 7
  ) {
    throw new Error("Stage 4 guarded Data API overlaps the isolated port range");
  }
  if (
    attestation.ports.app >= attestation.ports.base
    && attestation.ports.app <= attestation.ports.base + 7
  ) {
    throw new Error("Stage 4 app port overlaps the isolated Supabase port range");
  }
  if (
    attestation.ports.guarded >= attestation.ports.base
    && attestation.ports.guarded <= attestation.ports.base + 7
  ) {
    throw new Error("Stage 4 guarded raw Data API overlaps the isolated range");
  }

  for (const kind of ["containers", "networks", "volumes"]) {
    assertPositiveInteger(attestation.docker?.[kind], `Stage 4 Docker ${kind}`);
  }

  return {
    api_url: apiUrl.origin,
    app_origin: appOrigin.origin,
    auth_api_url: authApiUrl.origin,
    docker: {
      containers: attestation.docker.containers,
      networks: attestation.docker.networks,
      volumes: attestation.docker.volumes,
    },
    generated_at: attestation.generated_at,
    guarded_data_api_url: guardedDataApiUrl.origin,
    guarded_data_api_used: true,
    guarded_data_proxy_used: true,
    migration_sha256: attestation.migration_sha256,
    negative_probe_passed: true,
    pinned_isolated_local: true,
    ports: {
      app: attestation.ports.app,
      auth: attestation.ports.auth,
      base: attestation.ports.base,
      data: attestation.ports.data,
      guarded: attestation.ports.guarded,
    },
    primary_guard_unchanged: true,
    project_id: attestation.project_id,
    qa_fixture_scope: buildStage4QaFixtureScope(),
    remote_linked_cloud_access: 0,
    server_env_sha256: attestation.server_env_sha256,
    server_env_target: "isolated-supabase",
    shadow_seed_api_removed: true,
    shadow_seed_api_used: true,
    source_head_sha: attestation.source_head_sha,
    supabase_cli_version: STAGE4_SUPABASE_CLI_VERSION,
  };
}

export function buildConservativeStateMatrix({
  observedStateCandidate,
  requiredStates,
}) {
  if (!Array.isArray(requiredStates) || requiredStates.length === 0) {
    throw new Error("Stage 4 required states are missing");
  }
  return {
    observed_state_candidate: observedStateCandidate ?? null,
    pending_states: [...requiredStates],
    verified_states: [],
  };
}

export function summarizeStage4Quality(observations) {
  const totals = (Array.isArray(observations) ? observations : []).reduce(
    (summary, observation) => {
      const metrics = observation?.metrics ?? {};
      summary.axe += Array.isArray(metrics.serious_or_critical_axe)
        ? metrics.serious_or_critical_axe.length
        : 0;
      summary.overflow += Number(metrics.horizontal_overflow_px) > 0 ? 1 : 0;
      summary.targets += Array.isArray(metrics.touch_target_failures)
        ? metrics.touch_target_failures.length
        : 0;
      return summary;
    },
    { axe: 0, overflow: 0, targets: 0 },
  );
  return {
    axe_serious_or_critical: totals.axe,
    horizontal_overflow_observations: totals.overflow,
    quality_status:
      totals.axe > 0 || totals.overflow > 0 || totals.targets > 0
        ? "failed"
        : "passed",
    touch_target_failures: totals.targets,
  };
}

export function assertStableProfileIdentity(previousSha, nextSha) {
  if (!SHA256_PATTERN.test(nextSha ?? "")) {
    throw new Error("Stage 4 profile identity digest is invalid");
  }
  if (previousSha && previousSha !== nextSha) {
    throw new Error("Stage 4 main profile changed across viewports");
  }
  return nextSha;
}

function buildStage4LocalProfileFailure({
  attemptCount,
  code,
  errorCode,
  status,
}) {
  const error = new Error(
    `Stage 4 local profile verification failed (${status ?? "unknown"}, ${errorCode})`,
  );
  error.code = code;
  error.safeFailure = {
    attempt_count: attemptCount,
    code,
    last_error_code: errorCode,
    last_http_status: status ?? null,
  };
  return error;
}

function readStage4LocalProfileAttempt(response) {
  const status = Number.isInteger(response?.status) ? response.status : null;
  const payload = response?.payload ?? null;
  const errorCode = typeof payload?.error?.code === "string"
    ? payload.error.code
    : payload?.success === true
      ? "unexpected_profile"
      : "unknown";
  return {
    errorCode,
    payload,
    retryable:
      status === 409
      && payload?.success === false
      && payload?.error?.code === "ACCOUNT_SESSION_STALE",
    status,
  };
}

/**
 * @param {{
 *   expectedEmail: string,
 *   expectedId?: string | null,
 *   getDelayMs?: (context: {
 *     attemptCount: number,
 *     remainingMs: number,
 *     startedAt: number,
 *     status: number | null,
 *   }) => number,
 *   maxAttempts?: number,
 *   now?: () => number,
 *   probe: () => Promise<{ payload: unknown, status: number | null } | undefined>,
 *   sleep?: (durationMs: number) => Promise<void>,
 *   timeoutMs?: number,
 * }} options
 * @returns {Promise<{ email: string, id: string }>}
 */
export async function pollStage4LocalProfile({
  expectedEmail,
  expectedId = null,
  getDelayMs = () => 150,
  maxAttempts = 4,
  now = () => Date.now(),
  probe,
  sleep = (durationMs) => new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  }),
  timeoutMs = 1_500,
}) {
  if (
    typeof expectedEmail !== "string"
    || expectedEmail.length === 0
    || typeof probe !== "function"
    || typeof getDelayMs !== "function"
    || !Number.isInteger(maxAttempts)
    || maxAttempts < 1
    || typeof now !== "function"
    || typeof sleep !== "function"
    || !Number.isInteger(timeoutMs)
    || timeoutMs < 1
  ) {
    throw new Error("Stage 4 local profile polling options are invalid");
  }

  const startedAt = now();
  let attemptCount = 0;
  let lastStatus = null;
  let lastErrorCode = "unknown";

  while (attemptCount < maxAttempts && now() - startedAt <= timeoutMs) {
    attemptCount += 1;
    const attempt = readStage4LocalProfileAttempt(await probe());
    lastStatus = attempt.status;
    lastErrorCode = attempt.errorCode;

    if (attempt.status === 200 && attempt.payload?.success === true) {
      const profileId = attempt.payload?.data?.id;
      const profileEmail = attempt.payload?.data?.email;
      if (
        typeof profileId === "string"
        && profileEmail === expectedEmail
        && (expectedId === null || profileId === expectedId)
      ) {
        return {
          email: profileEmail,
          id: profileId,
        };
      }
      throw buildStage4LocalProfileFailure({
        attemptCount,
        code: "stage4_local_profile_unexpected",
        errorCode: "unexpected_profile",
        status: attempt.status,
      });
    }

    if (!attempt.retryable) {
      throw buildStage4LocalProfileFailure({
        attemptCount,
        code: "stage4_local_profile_unexpected",
        errorCode: attempt.errorCode,
        status: attempt.status,
      });
    }

    const remainingMs = timeoutMs - (now() - startedAt);
    if (attemptCount >= maxAttempts || remainingMs <= 0) {
      break;
    }

    const delayMs = getDelayMs({
      attemptCount,
      remainingMs,
      startedAt,
      status: attempt.status,
    });
    if (!Number.isInteger(delayMs) || delayMs < 0) {
      throw new Error("Stage 4 local profile polling delay is invalid");
    }
    if (delayMs > remainingMs) {
      break;
    }
    await sleep(delayMs);
  }

  throw buildStage4LocalProfileFailure({
    attemptCount,
    code: "stage4_local_profile_retry_exhausted",
    errorCode: lastErrorCode,
    status: lastStatus,
  });
}

/**
 * @param {{
 *   expectedEmail: string,
 *   expectedId?: string | null,
 *   fetchProfile: () => Promise<{ payload: unknown, status: number | null } | undefined>,
 *   intervalMs?: number,
 *   maxAttempts?: number,
 *   now?: () => number,
 *   sleep?: (durationMs: number) => Promise<void>,
 *   timeoutMs?: number,
 * }} options
 * @returns {Promise<{ email: string, id: string }>}
 */
export async function verifyStage4LocalProfile({
  expectedEmail,
  expectedId = null,
  fetchProfile,
  intervalMs = 150,
  maxAttempts = 4,
  now = () => Date.now(),
  sleep = (durationMs) => new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  }),
  timeoutMs = 1_500,
}) {
  if (
    typeof expectedEmail !== "string"
    || expectedEmail.length === 0
    || typeof fetchProfile !== "function"
    || !Number.isInteger(intervalMs)
    || intervalMs < 1
  ) {
    throw new Error("Stage 4 local profile verification options are invalid");
  }
  return pollStage4LocalProfile({
    expectedEmail,
    expectedId,
    getDelayMs: () => intervalMs,
    maxAttempts,
    now,
    probe: fetchProfile,
    sleep,
    timeoutMs,
  });
}

export function assertNoRemoteSupabaseViolations(violations) {
  if (Array.isArray(violations) && violations.length > 0) {
    throw new Error(
      `remote Supabase request detected: ${[...new Set(violations)].join(", ")}`,
    );
  }
}

export function canPromoteStage4Evidence({
  qualityStatus,
  stage4Complete,
}) {
  return stage4Complete === true && qualityStatus === "passed";
}
