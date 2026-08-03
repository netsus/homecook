import { createServer } from "node:net";
import { isAbsolute, resolve } from "node:path";

export const LOCAL_REHEARSAL_COMPOSE_FILE =
  "infra/full-local-supabase/docker-compose.production.yml";
export const LOCAL_REHEARSAL_RUNTIME_HELPER =
  "scripts/lib/full-local-production-runtime.mjs";
export const LOCAL_REHEARSAL_HELPER_ID =
  "recipe-content-snapshot-future-propagation-local-runner";

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SAFE_RESOURCE_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/u;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function assertExactSha(value, label) {
  if (!SHA_PATTERN.test(value ?? "")) {
    throw new Error(`${label} must be an exact 40-character lowercase SHA`);
  }
  return value;
}

function assertSafeResourceName(value, label) {
  if (!SAFE_RESOURCE_PATTERN.test(value ?? "")) {
    throw new Error(`${label} must be a bounded lowercase Docker resource name`);
  }
  return value;
}

function assertPort(value, label) {
  if (!Number.isSafeInteger(value) || value < 1024 || value > 65535) {
    throw new Error(`${label} must be an unprivileged TCP port`);
  }
  return value;
}

export function assertLoopbackUrl(value, {
  allowHttps = true,
  label = "local rehearsal URL",
} = {}) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be a valid loopback URL`);
  }
  const allowedProtocols = allowHttps ? new Set(["http:", "https:"]) : new Set(["http:"]);
  if (
    !allowedProtocols.has(parsed.protocol)
    || !LOOPBACK_HOSTS.has(parsed.hostname)
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
  ) {
    throw new Error(`${label} must stay on an credential-free loopback origin`);
  }
  return parsed.origin;
}

export function assertLocalRehearsalRunnerInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("local rehearsal runner input must be an object");
  }
  if (input.local_rehearsal_opt_in !== true) {
    throw new Error("HOMECOOK_LOCAL_REHEARSAL_OPT_IN=1 is required");
  }
  const currentHeadSha = assertExactSha(input.current_head_sha, "current head SHA");
  const immediatePreviousSha = assertExactSha(
    input.immediate_previous_sha,
    "immediate previous SHA",
  );
  if (currentHeadSha === immediatePreviousSha) {
    throw new Error("current and immediate-previous SHAs must differ");
  }
  if (typeof input.report_path !== "string" || input.report_path.trim() === "") {
    throw new Error("an explicit sanitized collector report path is required");
  }
  if (!isAbsolute(input.report_path)) {
    throw new Error("collector report path must be an explicit absolute path");
  }
  return {
    current_head_sha: currentHeadSha,
    immediate_previous_sha: immediatePreviousSha,
    local_rehearsal_opt_in: true,
    report_path: resolve(input.report_path),
  };
}

function listenOnce() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("failed to allocate a loopback port"));
        return;
      }
      const port = address.port;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

export async function allocateDistinctLoopbackPorts(count = 5) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 8) {
    throw new Error("loopback port count must be between 1 and 8");
  }
  const ports = new Set();
  while (ports.size < count) {
    ports.add(await listenOnce());
  }
  return [...ports];
}

export function buildLocalRehearsalResourcePlan(input) {
  const currentHeadSha = assertExactSha(input.current_head_sha, "current head SHA");
  const immediatePreviousSha = assertExactSha(
    input.immediate_previous_sha,
    "immediate previous SHA",
  );
  if (currentHeadSha === immediatePreviousSha) {
    throw new Error("current and immediate-previous SHAs must differ");
  }
  const runId = assertSafeResourceName(input.run_id, "run ID");
  if (!isAbsolute(input.temp_root ?? "")) {
    throw new Error("temporary root must be an explicit absolute path");
  }
  const ports = input.ports ?? {};
  const portNames = ["gateway", "auth_proxy", "https", "postgres", "app"];
  const values = portNames.map((name) => assertPort(ports[name], `${name} port`));
  if (new Set(values).size !== values.length) {
    throw new Error("local rehearsal loopback ports must be distinct");
  }
  const composeProject = assertSafeResourceName(
    `homecook-rehearsal-${runId}`.slice(0, 63),
    "compose project",
  );
  const postgresVolume = assertSafeResourceName(
    `${composeProject}-postgres`.slice(0, 63),
    "PostgreSQL volume",
  );
  const storageVolume = assertSafeResourceName(
    `${composeProject}-storage`.slice(0, 63),
    "Storage volume",
  );
  const publicAuthUrl = `https://127.0.0.1:${ports.https}`;
  const issuer = `${publicAuthUrl}/auth/v1`;
  assertLoopbackUrl(publicAuthUrl, { label: "public Auth test URL" });
  if (!/^https:\/\/127\.0\.0\.1:\d+\/auth\/v1$/u.test(issuer)) {
    throw new Error("GOTRUE_JWT_ISSUER must be an exact HTTPS loopback /auth/v1 URL");
  }
  return {
    mode: "isolated-full-local-rehearsal-plan",
    current_head_sha: currentHeadSha,
    immediate_previous_sha: immediatePreviousSha,
    compose_file: LOCAL_REHEARSAL_COMPOSE_FILE,
    runtime_helper: LOCAL_REHEARSAL_RUNTIME_HELPER,
    compose_project: composeProject,
    postgres_volume: postgresVolume,
    storage_volume: storageVolume,
    temp_root: resolve(input.temp_root),
    secret_directory_mode: "0700",
    secret_file_mode: "0600",
    loopback: {
      gateway_url: `http://127.0.0.1:${ports.gateway}`,
      auth_proxy_url: `http://127.0.0.1:${ports.auth_proxy}`,
      public_auth_url: publicAuthUrl,
      issuer,
      postgres_port: ports.postgres,
      app_url: `http://127.0.0.1:${ports.app}`,
    },
    full_local_env: {
      FULL_LOCAL_API_EXTERNAL_URL: issuer,
      FULL_LOCAL_COMPOSE_PROJECT_NAME: composeProject,
      FULL_LOCAL_POSTGRES_VOLUME_NAME: postgresVolume,
      FULL_LOCAL_STORAGE_VOLUME_NAME: storageVolume,
    },
    cleanup: {
      strategy: "finally",
      compose_project: composeProject,
      remove_only_named_volumes: [postgresVolume, storageVolume],
      remove_temporary_worktrees: true,
      remove_temporary_root: true,
    },
    external_writes: 0,
  };
}

export function buildSanitizedRunnerSummary(plan, status = "planned") {
  if (!plan || typeof plan !== "object") {
    throw new Error("runner plan is required");
  }
  return {
    ok: status === "complete",
    status,
    mode: plan.mode,
    current_head_sha: plan.current_head_sha,
    immediate_previous_sha: plan.immediate_previous_sha,
    compose_project: plan.compose_project,
    isolated_resources: true,
    exact_https_issuer: true,
    cleanup_strategy: plan.cleanup?.strategy,
    external_writes: 0,
  };
}

export function buildLocalRehearsalCollectorContract() {
  return {
    collector_status: "implemented",
    authenticated_callers: ["owner_a", "owner_b"],
    route_requests: [
      { method: "POST", path: "/api/v1/recipes/:id/future-plan-impact" },
      { method: "PATCH", path: "/api/v1/recipes/:id" },
      { method: "POST", path: "/api/v1/cooking/session-attempts" },
      { method: "POST", path: "/api/v1/meals" },
      { method: "PATCH", path: "/api/v1/meals/:meal_id" },
      { method: "DELETE", path: "/api/v1/meals/:meal_id" },
      { method: "POST", path: "/api/v1/shopping/lists" },
      { method: "GET", path: "/api/v1/cooking/session-attempts/:id/cook-mode" },
      { method: "POST", path: "/api/v1/cooking/session-attempts/:id/cancel" },
    ],
    expected_denial: { status: 404, error_code: "RESOURCE_NOT_FOUND" },
    digest_invariance: [
      "recipe",
      "content",
      "meal",
      "shopping",
      "claim",
      "session",
    ],
    release_matrix: ["current", "immediate_previous"],
    production_writes: 0,
    staging_writes: 0,
    remote_writes: 0,
  };
}
