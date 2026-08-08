import { lstatSync, realpathSync } from "node:fs";
import path from "node:path";

export const EXACT_YOUTUBE_CANARY_URL = "https://www.youtube.com/shorts/f0E0p1R26Vk";

export const PRODUCTION_CANARY_PHASES = Object.freeze([
  "milestone-a-t65",
  "milestone-a-24h",
  "milestone-b-7d",
]);

const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const CANARY_RESULT_KEYS = Object.freeze([
  "pantry_read",
  "planner_read",
  "planner_write",
  "youtube_extract",
]);
const SAFETY_CHECK_KEYS = Object.freeze([
  "binding_expiry_monotonic",
  "logout_new_token_read",
  "logout_new_token_write",
  "logout_old_token_read",
  "logout_old_token_write",
  "planner_write_cleanup",
  "phase_time_boundary",
  "stale_counts_since_deploy",
]);
const ADAPTER_METHODS = Object.freeze([
  "openSession",
  "readBindingExpiry",
  "refreshSession",
  "plannerRead",
  "plannerWrite",
  "plannerCleanup",
  "pantryRead",
  "youtubeExtract",
  "logout",
  "plannerReadAfterLogout",
  "plannerWriteAfterLogout",
  "readObservationCounters",
  "close",
]);
const SENSITIVE_PATTERN = /(?:\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|access[_-]?token|refresh[_-]?token|authorization|cookie|oauth[_-]?code|client[_-]?secret)/iu;
const WORKER_ENV_ALLOWLIST = Object.freeze([
  "HOME",
  "LANG",
  "LC_ALL",
  "NODE_ENV",
  "PATH",
  "TMPDIR",
]);

export function validateProductionCanaryAdapterPath(
  candidate,
  { currentUid = process.getuid?.() } = {},
) {
  if (typeof candidate !== "string" || !path.isAbsolute(candidate)) {
    throw new Error("Production canary adapter path must be absolute.");
  }
  if (!Number.isSafeInteger(currentUid) || currentUid < 0) {
    throw new Error("Production canary current user is unavailable.");
  }
  const resolvedCandidate = path.resolve(candidate);
  const parent = path.dirname(resolvedCandidate);
  const parentStats = lstatSync(parent);
  if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) {
    throw new Error("Production canary adapter parent must be a real directory, not a symbolic link.");
  }
  if ((parentStats.mode & 0o777) !== 0o700) {
    throw new Error("Production canary adapter parent must have exact mode 0700.");
  }
  if (parentStats.uid !== currentUid) {
    throw new Error("Production canary adapter parent must belong to the current user.");
  }
  if (realpathSync(parent) !== parent) {
    throw new Error("Production canary adapter parent must use its canonical path.");
  }
  const adapterStats = lstatSync(resolvedCandidate);
  if (!adapterStats.isFile() || adapterStats.isSymbolicLink()) {
    throw new Error("Production canary adapter must be a regular file, not a symbolic link.");
  }
  if ((adapterStats.mode & 0o777) !== 0o600) {
    throw new Error("Production canary adapter must have exact mode 0600.");
  }
  if (adapterStats.uid !== currentUid) {
    throw new Error("Production canary adapter must belong to the current user.");
  }
  if (resolvedCandidate !== candidate || realpathSync(resolvedCandidate) !== resolvedCandidate) {
    throw new Error("Production canary adapter must use its canonical path.");
  }
  return resolvedCandidate;
}

export function buildProductionCanaryWorkerEnv(ambientEnv, adapterPath) {
  const workerEnv = {};
  for (const key of WORKER_ENV_ALLOWLIST) {
    if (typeof ambientEnv?.[key] === "string" && ambientEnv[key].length > 0) {
      workerEnv[key] = ambientEnv[key];
    }
  }
  workerEnv.FULL_LOCAL_SESSION_CANARY_ADAPTER = adapterPath;
  return workerEnv;
}

function assertExactKeys(value, expectedKeys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const actualKeys = Object.keys(value).sort();
  const wantedKeys = [...expectedKeys].sort();
  const unexpected = actualKeys.filter((key) => !wantedKeys.includes(key));
  const missing = wantedKeys.filter((key) => !actualKeys.includes(key));
  if (unexpected.length > 0) {
    throw new Error(`${label} has unexpected key ${unexpected[0]}.`);
  }
  if (missing.length > 0) {
    throw new Error(`${label} is missing key ${missing[0]}.`);
  }
}

function assertUtcIso(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string"
    || !UTC_ISO_PATTERN.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString() !== value) {
    throw new Error(`${label} must be a UTC ISO-8601 timestamp${nullable ? " or null" : ""}.`);
  }
}

function assertExactStatus(value, expected, label) {
  if (value !== expected) {
    throw new Error(`${label} must equal ${expected}.`);
  }
}

function assertAdapter(adapter) {
  if (adapter === null || typeof adapter !== "object" || Array.isArray(adapter)) {
    throw new Error("Production canary adapter is invalid.");
  }
  for (const method of ADAPTER_METHODS) {
    if (typeof adapter[method] !== "function") {
      throw new Error(`Production canary adapter is missing ${method}.`);
    }
  }
}

function assertPhaseAndSha({ implementationSha, phase }) {
  if (!PRODUCTION_CANARY_PHASES.includes(phase)) {
    throw new Error("Production canary phase is invalid.");
  }
  if (typeof implementationSha !== "string" || !SHA_PATTERN.test(implementationSha)) {
    throw new Error("Production canary implementation SHA is invalid.");
  }
}

function validateObservationCounters(counters) {
  if (counters === null || typeof counters !== "object") {
    throw new Error("Production canary observation counters are invalid.");
  }
  if (counters.counterScope !== "SINCE_DEPLOY") {
    throw new Error("Production canary counters must be scoped since deploy.");
  }
  assertUtcIso(counters.observationStartedAt, "observationStartedAt");
  if (counters.accountSessionStaleCount !== 0) {
    throw new Error("Production canary account session stale count must equal 0 since deploy.");
  }
  if (counters.staleTokenMutationCount !== 0) {
    throw new Error("Production canary stale token mutation count must equal 0 since deploy.");
  }
  if (counters.firstStaleAt !== null) {
    throw new Error("Production canary first stale timestamp must remain null since deploy.");
  }
  return counters;
}

export function validateProductionCanaryResult(result, { implementationSha, phase }) {
  assertPhaseAndSha({ implementationSha, phase });
  assertExactKeys(result, [
    "account_session_stale_count",
    "canary_results",
    "implementation_sha",
    "incident",
    "phase",
    "safety_checks",
    "stale_token_mutation_count",
    "status",
  ], "production canary result");
  assertExactKeys(result.canary_results, CANARY_RESULT_KEYS, "production canary results");
  assertExactKeys(result.incident, [
    "binding_created_at",
    "binding_expires_at",
    "first_stale_at",
  ], "production canary incident");
  assertExactKeys(result.safety_checks, SAFETY_CHECK_KEYS, "production canary safety checks");

  assertExactStatus(result.status, "PASS", "production canary status");
  assertExactStatus(result.phase, phase, "production canary phase");
  assertExactStatus(result.implementation_sha, implementationSha, "production canary implementation SHA");
  for (const key of CANARY_RESULT_KEYS) {
    assertExactStatus(result.canary_results[key], "PASS", `production canary ${key}`);
  }
  assertExactStatus(result.safety_checks.binding_expiry_monotonic, "PASS", "binding expiry monotonic check");
  assertExactStatus(result.safety_checks.planner_write_cleanup, "PASS", "planner write cleanup check");
  assertExactStatus(result.safety_checks.phase_time_boundary, "PASS", "phase time boundary check");
  assertExactStatus(result.safety_checks.stale_counts_since_deploy, "PASS", "stale count scope check");
  for (const key of SAFETY_CHECK_KEYS.filter((key) => key.startsWith("logout_"))) {
    assertExactStatus(result.safety_checks[key], "BLOCKED", `production canary ${key}`);
  }
  assertUtcIso(result.incident.binding_created_at, "binding_created_at");
  assertUtcIso(result.incident.binding_expires_at, "binding_expires_at");
  assertUtcIso(result.incident.first_stale_at, "first_stale_at", { nullable: true });
  if (result.account_session_stale_count !== 0) {
    throw new Error("Production canary account session stale count must equal 0 since deploy.");
  }
  if (result.stale_token_mutation_count !== 0) {
    throw new Error("Production canary stale token mutation count must equal 0 since deploy.");
  }
  const serialized = JSON.stringify(result);
  if (SENSITIVE_PATTERN.test(serialized)) {
    throw new Error("Production canary result contains sensitive data.");
  }
  return result;
}

export async function runProductionCanary({
  adapter,
  implementationSha,
  now = () => new Date(),
  phase,
}) {
  assertAdapter(adapter);
  assertPhaseAndSha({ implementationSha, phase });

  let result;
  try {
    const opened = await adapter.openSession();
    if (opened === null || typeof opened !== "object" || opened.session === undefined) {
      throw new Error("Production canary session boundary is invalid.");
    }
    assertUtcIso(opened.bindingCreatedAt, "binding_created_at");
    const observedNow = now();
    if (!(observedNow instanceof Date) || Number.isNaN(observedNow.getTime())) {
      throw new Error("Production canary clock is invalid.");
    }
    if (phase === "milestone-a-t65"
      && observedNow.getTime() - Date.parse(opened.bindingCreatedAt) < 65 * 60 * 1_000) {
      throw new Error("Production canary must wait at least 65 minutes after session binding.");
    }
    const initialCounters = validateObservationCounters(
      await adapter.readObservationCounters(),
    );
    if (Date.parse(opened.bindingCreatedAt) < Date.parse(initialCounters.observationStartedAt)) {
      throw new Error("Production canary session binding must be created after deploy observation started.");
    }
    const minimumObservationMs = phase === "milestone-a-24h"
      ? 24 * 60 * 60 * 1_000
      : phase === "milestone-b-7d"
        ? 7 * 24 * 60 * 60 * 1_000
        : 0;
    if (observedNow.getTime() - Date.parse(initialCounters.observationStartedAt) < minimumObservationMs) {
      throw new Error(`Production canary must observe for at least ${phase === "milestone-a-24h" ? "24 hours" : "7 days"}.`);
    }
    const oldSession = opened.session;
    const oldBindingExpiry = await adapter.readBindingExpiry(oldSession);
    assertUtcIso(oldBindingExpiry, "old binding expiry");

    const newSession = await adapter.refreshSession(oldSession);
    if (newSession === undefined || newSession === null) {
      throw new Error("Production canary refresh did not return an opaque session handle.");
    }
    const newBindingExpiry = await adapter.readBindingExpiry(newSession);
    assertUtcIso(newBindingExpiry, "new binding expiry");
    if (Date.parse(newBindingExpiry) <= Date.parse(oldBindingExpiry)) {
      throw new Error("Production canary binding expiry did not increase monotonically.");
    }

    assertExactStatus(await adapter.plannerRead(newSession), "PASS", "planner read");
    const plannerWrite = await adapter.plannerWrite(newSession);
    if (plannerWrite === null || typeof plannerWrite !== "object") {
      throw new Error("Planner write result is invalid.");
    }
    assertExactStatus(plannerWrite.status, "PASS", "planner write");
    if (plannerWrite.cleanupHandle === undefined) {
      throw new Error("Planner write cleanup handle is missing.");
    }
    assertExactStatus(
      await adapter.plannerCleanup(newSession, plannerWrite.cleanupHandle),
      "PASS",
      "planner write cleanup",
    );
    assertExactStatus(await adapter.pantryRead(newSession), "PASS", "pantry read");
    assertExactStatus(
      await adapter.youtubeExtract(newSession, { url: EXACT_YOUTUBE_CANARY_URL }),
      "PASS",
      "YouTube extraction",
    );
    assertExactStatus(await adapter.logout(newSession), "PASS", "logout");

    const logoutChecks = {
      logout_old_token_read: await adapter.plannerReadAfterLogout(oldSession),
      logout_old_token_write: await adapter.plannerWriteAfterLogout(oldSession),
      logout_new_token_read: await adapter.plannerReadAfterLogout(newSession),
      logout_new_token_write: await adapter.plannerWriteAfterLogout(newSession),
    };
    for (const [key, value] of Object.entries(logoutChecks)) {
      assertExactStatus(value, "BLOCKED", key);
    }

    const counters = validateObservationCounters(await adapter.readObservationCounters());
    if (counters.observationStartedAt !== initialCounters.observationStartedAt) {
      throw new Error("Production canary observation window changed during the run.");
    }

    result = {
      account_session_stale_count: 0,
      canary_results: {
        pantry_read: "PASS",
        planner_read: "PASS",
        planner_write: "PASS",
        youtube_extract: "PASS",
      },
      implementation_sha: implementationSha,
      incident: {
        binding_created_at: opened.bindingCreatedAt,
        binding_expires_at: newBindingExpiry,
        first_stale_at: null,
      },
      phase,
      safety_checks: {
        binding_expiry_monotonic: "PASS",
        logout_new_token_read: logoutChecks.logout_new_token_read,
        logout_new_token_write: logoutChecks.logout_new_token_write,
        logout_old_token_read: logoutChecks.logout_old_token_read,
        logout_old_token_write: logoutChecks.logout_old_token_write,
        planner_write_cleanup: "PASS",
        phase_time_boundary: "PASS",
        stale_counts_since_deploy: "PASS",
      },
      stale_token_mutation_count: 0,
      status: "PASS",
    };
    return validateProductionCanaryResult(result, { implementationSha, phase });
  } finally {
    await adapter.close();
  }
}

export function buildRefreshLifecycleGateResult(exitStatus) {
  if (exitStatus !== 0) {
    throw new Error("The raw refresh lifecycle gate failed.");
  }
  return {
    authority_static_contracts: "PASS",
    docker_refresh_smoke: "PASS",
    postgres_integration: "PASS",
    refresh_lifecycle_gate: "PASS",
    status: "PASS",
  };
}
