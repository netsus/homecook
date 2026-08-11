import { spawnSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";

/**
 * @typedef {{ status: number | null, stdout: string }} ObservationCommandResult
 * @typedef {(command: string, args: string[], options: Record<string, unknown>) => ObservationCommandResult} ObservationExecute
 * @typedef {{ uid: number, mode: number, isDirectory: () => boolean, isFile: () => boolean, isSymbolicLink: () => boolean }} TrustedPathStat
 */

export const EXACT_OBSERVATION_SQL = "select public.read_full_local_session_observation()::text";

const EXACT_COMPOSE_PROJECT = "homecook-full-local-isolated";
const EXACT_COMPOSE_SERVICE = "postgres";
const DOCKER_BINARY_ENTRYPOINT = "/usr/local/bin/docker";
const DOCKER_BINARY_CANONICAL = "/Applications/Docker.app/Contents/Resources/bin/docker";
const DOCKER_BINARY_ANCESTRY = Object.freeze([
  "/Applications",
  "/Applications/Docker.app",
  "/Applications/Docker.app/Contents",
  "/Applications/Docker.app/Contents/Resources",
  "/Applications/Docker.app/Contents/Resources/bin",
]);
const CONTAINER_ID_PATTERN = /^[a-f0-9]{64}$/u;
const UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/u;
const SENSITIVE_PATTERN = /(?:\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|access[_-]?token|refresh[_-]?token|authorization|(?:^|["'_])cookie|oauth(?:[_-]?code)?|client[_-]?secret)/iu;
const OBSERVATION_KEYS = Object.freeze([
  "account_session_stale_count",
  "counter_scope",
  "first_stale_at",
  "observation_started_at",
  "stale_token_mutation_count",
]);
const INSPECT_KEYS = Object.freeze([
  "health",
  "id",
  "project",
  "running",
  "service",
  "status",
]);
const INSPECT_FORMAT = `{"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}"missing"{{end}},"id":{{json .Id}},"project":{{json (index .Config.Labels "com.docker.compose.project")}},"running":{{json .State.Running}},"service":{{json (index .Config.Labels "com.docker.compose.service")}},"status":{{json .State.Status}}}`;

function fail(label) {
  throw new Error(`Full-local session ${label} failed closed.`);
}

function assertExactKeys(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(label);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    fail(label);
  }
}

function parseExactOneLineJson(stdout, label) {
  if (typeof stdout !== "string"
    || stdout.length === 0
    || stdout.length > 4_096
    || !/^[^\r\n]+(?:\r?\n)?$/u.test(stdout)
    || SENSITIVE_PATTERN.test(stdout)) {
    fail(label);
  }
  try {
    return JSON.parse(stdout.trim());
  } catch {
    fail(label);
  }
}

function assertTrustedOwnership(stats, currentUid, { directory = false } = {}) {
  if (![0, currentUid].includes(stats.uid)
    || (stats.mode & 0o002) !== 0
    || (directory ? !stats.isDirectory() : !stats.isFile())) {
    fail("observation Docker binary trust");
  }
}

/**
 * @param {{ currentUid?: number, lstat?: (candidate: string) => TrustedPathStat, realpath?: (candidate: string) => string }} [options]
 */
export function resolveTrustedDockerBinary({
  currentUid = process.getuid?.(),
  lstat = lstatSync,
  realpath = realpathSync,
} = /** @type {{ currentUid?: number, lstat?: (candidate: string) => TrustedPathStat, realpath?: (candidate: string) => string }} */ ({})) {
  if (!Number.isSafeInteger(currentUid) || currentUid < 0) {
    fail("observation Docker binary trust");
  }
  const entrypoint = lstat(DOCKER_BINARY_ENTRYPOINT);
  if (!entrypoint.isSymbolicLink() || entrypoint.uid !== 0) {
    fail("observation Docker binary trust");
  }
  if (realpath(DOCKER_BINARY_ENTRYPOINT) !== DOCKER_BINARY_CANONICAL) {
    fail("observation Docker binary trust");
  }
  for (const directory of DOCKER_BINARY_ANCESTRY) {
    assertTrustedOwnership(lstat(directory), currentUid, { directory: true });
  }
  const binary = lstat(DOCKER_BINARY_CANONICAL);
  assertTrustedOwnership(binary, currentUid);
  if ((binary.mode & 0o111) === 0) fail("observation Docker binary trust");
  return DOCKER_BINARY_CANONICAL;
}

function runDocker(execute, dockerBin, args, { input, timeout }) {
  const result = execute(dockerBin, args, {
    encoding: "utf8",
    env: { PATH: "/usr/bin:/bin" },
    input,
    maxBuffer: 8 * 1_024,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    timeout,
  });
  if (result === null
    || typeof result !== "object"
    || result.status !== 0
    || typeof result.stdout !== "string") {
    fail("observation helper");
  }
  return result.stdout;
}

function executeDocker(command, args, options) {
  return spawnSync(command, args, options);
}

function resolveHealthyPostgresContainer({ dockerBin, execute }) {
  const idsOutput = runDocker(execute, dockerBin, [
    "ps",
    "--all",
    "--no-trunc",
    "--filter",
    `label=com.docker.compose.project=${EXACT_COMPOSE_PROJECT}`,
    "--filter",
    `label=com.docker.compose.service=${EXACT_COMPOSE_SERVICE}`,
    "--format",
    "{{.ID}}",
  ], { timeout: 5_000 });
  const ids = idsOutput.trim().split(/\r?\n/u).filter(Boolean);
  if (ids.length !== 1 || !CONTAINER_ID_PATTERN.test(ids[0])) {
    fail("observation container identity");
  }
  const containerId = ids[0];
  const inspect = parseExactOneLineJson(runDocker(execute, dockerBin, [
    "inspect",
    "--format",
    INSPECT_FORMAT,
    containerId,
  ], { timeout: 5_000 }), "observation container inspection");
  assertExactKeys(inspect, INSPECT_KEYS, "observation container inspection");
  if (inspect.id !== containerId
    || inspect.project !== EXACT_COMPOSE_PROJECT
    || inspect.service !== EXACT_COMPOSE_SERVICE
    || inspect.running !== true
    || inspect.status !== "running"
    || inspect.health !== "healthy") {
    fail("observation container identity");
  }
  return containerId;
}

function assertUtcIso(value, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string"
    || !UTC_ISO_PATTERN.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) {
    fail("observation schema");
  }
}

function normalizeObservation(value) {
  assertExactKeys(value, OBSERVATION_KEYS, "observation schema");
  if (value.counter_scope !== "SINCE_DEPLOY") fail("observation schema");
  assertUtcIso(value.observation_started_at);
  assertUtcIso(value.first_stale_at, { nullable: true });
  for (const key of ["account_session_stale_count", "stale_token_mutation_count"]) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) fail("observation schema");
  }
  return {
    accountSessionStaleCount: value.account_session_stale_count,
    counterScope: value.counter_scope,
    firstStaleAt: value.first_stale_at === null
      ? null
      : new Date(value.first_stale_at).toISOString(),
    observationStartedAt: new Date(value.observation_started_at).toISOString(),
    staleTokenMutationCount: value.stale_token_mutation_count,
  };
}

/**
 * @param {{ dockerBin?: string, execute?: ObservationExecute }} [options]
 */
export function readFullLocalSessionObservation({
  dockerBin = undefined,
  execute = executeDocker,
} = /** @type {{ dockerBin?: string, execute?: ObservationExecute }} */ ({})) {
  if (typeof execute !== "function") fail("observation helper");
  const resolvedDockerBin = dockerBin ?? resolveTrustedDockerBinary();
  if (typeof resolvedDockerBin !== "string" || !resolvedDockerBin.startsWith("/")) {
    fail("observation Docker binary trust");
  }
  if (execute === executeDocker && resolvedDockerBin !== DOCKER_BINARY_CANONICAL) {
    fail("observation Docker binary trust");
  }
  const containerId = resolveHealthyPostgresContainer({
    dockerBin: resolvedDockerBin,
    execute,
  });
  const stdout = runDocker(execute, resolvedDockerBin, [
    "exec",
    "--interactive",
    containerId,
    "psql",
    "--no-psqlrc",
    "--set=ON_ERROR_STOP=1",
    "--tuples-only",
    "--no-align",
    "--quiet",
    "--username=supabase_admin",
    "--dbname=postgres",
    `--command=${EXACT_OBSERVATION_SQL}`,
  ], {
    timeout: 10_000,
  });
  return normalizeObservation(parseExactOneLineJson(stdout, "observation output"));
}
