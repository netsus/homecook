import { createHash } from "node:crypto";
import {
  chmodSync,
  constants as fsConstants,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  writeFileSync,
  closeSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

import { canonicalizeJcs, sha256Jcs } from "./rfc8785-jcs.mjs";
import {
  copyLocalMacProductionExecutionTree,
  sealLocalMacProductionExecutionTree,
} from "./local-mac-production-release.mjs";
import { readVerifiedMigrationInputs } from "./local-mac-production-rehearsal-runner-safety.mjs";

export const RUN_EVIDENCE_SCHEMA =
  "homecook.local-mac-production-rehearsal-run-evidence.v1";
export const RUN_OWNERSHIP_LABEL = "com.homecook.release-rehearsal.run-id";
export const RUN_PROJECT_LABEL = "com.docker.compose.project";

const CANONICALIZATION = "RFC8785-JCS+SHA256";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const DIGEST = /^[0-9a-f]{64}$/u;
const SHA = /^[0-9a-f]{40}$/u;
const PORT_KEYS = ["app", "auth", "postgres", "storage"];
const RESERVED_PORTS = new Set([3000, 3100, 5432, 54321, 54322, 54323, 54324]);
const PRODUCTION_NAME = /(?:^|[-_.])(?:prod|production)(?:$|[-_.])/iu;
const RESERVED_NAME_PREFIXES = [
  "com.homecook.production",
  "com.homecook.full-local",
  "com.homecook.youtube-extraction-worker",
  "homecook-production",
  "supabase_db_homecook",
];
const CHILD_ENV_KEYS = new Set([
  "DATABASE_URL",
  "DATA_SUPABASE_PUBLISHABLE_KEY",
  "DATA_SUPABASE_URL",
  "FULL_LOCAL_COMPOSE_PROJECT_NAME",
  "FULL_LOCAL_SECRET_DIR",
  "HOME",
  "HOMECOOK_RELEASE_BUILD_ID",
  "HOMECOOK_RELEASE_SHA",
  "HOMECOOK_RELEASE_TREE",
  "HOMECOOK_REHEARSAL_RUN_ID",
  "HOMECOOK_REHEARSAL_MODE",
  "HOMECOOK_SEALED_BUNDLE_DIGEST",
  "HOMECOOK_FULL_LOCAL_SECRET_DIR",
  "HOSTNAME",
  "LOCAL_SUPABASE_INTERNAL_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NODE_ENV",
  "PATH",
  "PORT",
  "R2_WORKER_ARGS",
  "TMPDIR",
]);
const FORBIDDEN_ENV_KEY = /(?:AWS|AZURE|CLOUD|GOOGLE|GITHUB|REMOTE|SERVICE_ROLE|SECRET|TOKEN|PRIVATE_KEY|PASSWORD|DOCKER_HOST|SUPABASE_DB_URL|DATABASE_PASSWORD)/iu;
const CHILD_SECRET_PATH_KEYS = new Set(["FULL_LOCAL_SECRET_DIR", "HOMECOOK_FULL_LOCAL_SECRET_DIR"]);
const TOP_LEVEL_EVIDENCE_KEYS = [
  "schema",
  "canonicalization",
  "status",
  "trusted_receipt",
  "candidate_identity_digest",
  "release_sha",
  "release_tree",
  "build_id",
  "sealed_bundle_digest",
  "bundle_manifest_digest",
  "run_id",
  "issued_at",
  "completed_at",
  "isolation",
  "migration",
  "fixtures",
  "runtime",
  "canaries",
  "network",
  "cleanup",
  "production_guard",
  "threat_controls",
  "evidence_digest",
];
const REQUIRED_CANARY_IDS = Object.freeze([
  "app-production-route",
  "cross-component-identity",
  "external-network-deny",
  "full-local-api-gateway-route",
  "full-local-auth-route",
  "full-local-postgrest-fixture",
  "full-local-storage-route",
  "worker-synthetic-job",
]);

/** @returns {never} */
function fail(message) {
  throw new Error(`Release rehearsal runner rejected: ${message}`);
}

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (canonicalizeJcs(actual) !== canonicalizeJcs(expected)) {
    fail(`${label} fields are not the closed schema`);
  }
  return value;
}

function requireDigest(value, label) {
  if (!DIGEST.test(value ?? "")) fail(`${label} must be a lowercase SHA-256 digest`);
  return value;
}

function requireSha(value, label) {
  if (!SHA.test(value ?? "")) fail(`${label} must be an exact lowercase 40-hex SHA`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) fail(`${label} must be nonempty`);
  return value;
}

function modeBits(stat) {
  return Number(stat.mode) & 0o7777;
}

function pathContainsProductionAuthority(path) {
  const normalized = path.replaceAll("\\", "/");
  return normalized.includes("/.homecook/releases/")
    || normalized.includes("/Library/LaunchAgents/")
    || /\/(?:current|previous)\.json$/u.test(normalized)
    || normalized.includes("production-promotion.lock");
}

export function resolveCompletedCandidateInput(input) {
  if (!isAbsolute(input ?? "")) fail("candidate input must be an absolute path");
  const absolute = resolve(input);
  if (pathContainsProductionAuthority(absolute)) {
    fail("production authority paths are not candidate inputs");
  }
  let candidateRoot = absolute;
  let inputStat;
  try {
    inputStat = lstatSync(absolute, { bigint: true });
  } catch (error) {
    fail(`candidate root or candidate.json is unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (inputStat.isSymbolicLink()) fail("candidate input may not be a symlink");
  if (inputStat.isFile()) {
    if (basename(absolute) !== "candidate.json") {
      fail("candidate file input must be the exact candidate.json manifest");
    }
    if (inputStat.nlink !== 1n) fail("candidate manifest hardlink count must be one");
    candidateRoot = dirname(absolute);
  } else if (!inputStat.isDirectory()) {
    fail("candidate input must be a completed candidate root or candidate.json");
  }
  const rootStat = lstatSync(candidateRoot, { bigint: true });
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) fail("candidate root must be a real directory");
  // macOS exposes /var and /tmp through stable system aliases. The final candidate
  // component itself is still required to be a non-symlink and the sealed reader
  // performs the full ancestor-FD verification before bytes are consumed.
  realpathSync(candidateRoot);
  if ((rootStat.mode & 0o022n) !== 0n) fail("candidate root is group/world writable");
  return candidateRoot;
}

function validatePorts(ports) {
  exactKeys(ports, PORT_KEYS, "run ports");
  const values = [];
  for (const key of PORT_KEYS) {
    const value = ports[key];
    if (RESERVED_PORTS.has(value)) fail(`${key} port collides with a reserved production port`);
    if (!Number.isSafeInteger(value) || value < 20_000 || value > 60_999) {
      fail(`${key} port must be a high unprivileged port`);
    }
    values.push(value);
  }
  if (new Set(values).size !== values.length) fail("run ports must be unique");
  return ports;
}

function rejectReservedName(value, label) {
  if (PRODUCTION_NAME.test(value) || RESERVED_NAME_PREFIXES.some((prefix) => value.startsWith(prefix))) {
    fail(`${label} uses a production or reserved prefix`);
  }
}

export function buildRunNamespace({ runId, ports }) {
  if (!UUID_V4.test(runId ?? "")) fail("run_id must be a cryptographically random UUID-v4");
  validatePorts(ports);
  const project = `homecook-rehearsal-${runId}`;
  rejectReservedName(project, "Docker project");
  const containerNames = [
    "api-gateway", "auth", "auth-proxy", "postgres", "postgrest", "postgrest-probe", "storage",
  ].map((component) => `${project}-${component}-1`);
  containerNames.push(`${project}-app`, `${project}-worker`, `${project}-egress-sentinel`);
  const networkNames = ["auth-edge", "auth-egress", "data-internal", "egress-sentinel"]
    .map((network) => `${project}_${network}`);
  const volumeNames = [`${project}-postgres-data`, `${project}-storage-data`];
  for (const name of [...containerNames, ...networkNames, ...volumeNames]) {
    rejectReservedName(name, "run resource name");
  }
  const compact = runId.replaceAll("-", "").slice(0, 16);
  const dbName = `hc_r2_${compact}`;
  const dbUser = `hc_r2_user_${compact}`;
  rejectReservedName(dbName, "database name");
  rejectReservedName(dbUser, "database user");
  return Object.freeze({
    run_id: runId,
    project,
    container_names: containerNames,
    network_names: networkNames,
    volume_names: volumeNames,
    db_name: dbName,
    db_user: dbUser,
    ports: Object.freeze({ ...ports }),
  });
}

function includesExactPair(argv, key, value) {
  return argv.some((token, index) => token === key && argv[index + 1] === value);
}

export function validateDockerInvocation(argv, context = {}) {
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((token) => typeof token !== "string" || token.length === 0)) {
    fail("Docker argv must be a nonempty string array");
  }
  if (
    typeof context.dockerHost !== "string"
    || !context.dockerHost.startsWith("unix:///")
    || argv[0] !== "--host"
    || argv[1] !== context.dockerHost
  ) {
    fail("Docker invocation requires the exact pinned local --host endpoint");
  }
  const commandArgv = argv.slice(2);
  const joined = commandArgv.join("\0");
  if (commandArgv.some((token) => token === "--host" || token === "-H" || token === "--context" || /^tcp:|^ssh:|^https?:|^npipe:/u.test(token))) {
    fail("Docker context or endpoint indirection is forbidden");
  }
  if (commandArgv.some((token) => ["pull", "build", "push", "login", "logout", "system", "prune", "tag", "rmi"].includes(token))) {
    fail("Docker pull/build/registry/system mutation is forbidden");
  }
  if (RESERVED_NAME_PREFIXES.some((prefix) => joined.includes(prefix))) {
    fail("Docker argv references a production resource");
  }
  const readOnly = [
    ["ps"], ["version"], ["info"], ["inspect"],
    ["image", "inspect"], ["network", "ls"], ["network", "inspect"],
    ["volume", "ls"], ["volume", "inspect"],
  ].some((prefix) => prefix.every((token, index) => commandArgv[index] === token));
  if (readOnly || (commandArgv[0] === "compose" && commandArgv.includes("config") && commandArgv.includes("--format") && commandArgv.includes("json") && !commandArgv.some((token) => ["create", "start", "up"].includes(token)))) return Object.freeze({ mode: "read-only", argv: [...argv] });

  const runId = context.runId;
  const project = context.project;
  if (!UUID_V4.test(runId ?? "") || typeof project !== "string" || !project.startsWith("homecook-rehearsal-")) {
    fail("Docker mutation requires an exact rehearsal run ownership context");
  }
  const createMutation = (
    (commandArgv[0] === "network" && commandArgv[1] === "create")
    || (commandArgv[0] === "volume" && commandArgv[1] === "create")
    || commandArgv[0] === "create"
  );
  if (createMutation) {
    const ownership = `${RUN_OWNERSHIP_LABEL}=${runId}`;
    const projectLabel = `${RUN_PROJECT_LABEL}=${project}`;
    if (!includesExactPair(commandArgv, "--label", ownership) || !includesExactPair(commandArgv, "--label", projectLabel)) {
      fail("Docker create mutation is missing exact run ownership labels");
    }
    if (commandArgv[0] === "create" && !commandArgv.includes("--pull=never")) {
      fail("Docker create requires exact --pull=never");
    }
    return Object.freeze({ mode: "run-owned-mutation", argv: [...argv] });
  }
  const destructive = (commandArgv[0] === "network" && commandArgv[1] === "rm")
    || (commandArgv[0] === "volume" && commandArgv[1] === "rm")
    || (commandArgv[0] === "network" && commandArgv[1] === "connect")
    || ["start", "stop", "rm", "kill", "exec"].includes(commandArgv[0]);
  if (destructive && context.verifiedOwnership === true && context.resourceId) {
    if (!commandArgv.includes(context.resourceId)) fail("Docker owned-resource argv does not contain the verified resource ID");
    return Object.freeze({ mode: "run-owned-mutation", argv: [...argv] });
  }
  fail("Docker invocation is outside the closed rehearsal allowlist");
}

export function validateChildEnvironment(environment, { runId, runRoot }) {
  if (!environment || typeof environment !== "object" || Array.isArray(environment)) {
    fail("child environment must be an object");
  }
  if (!UUID_V4.test(runId ?? "") || !isAbsolute(runRoot ?? "")) fail("child environment run context is invalid");
  /** @type {Record<string, string>} */
  const result = {};
  for (const [key, rawValue] of Object.entries(environment)) {
    if (!CHILD_ENV_KEYS.has(key) || (FORBIDDEN_ENV_KEY.test(key) && !CHILD_SECRET_PATH_KEYS.has(key))) {
      fail(`production credential or forbidden child environment key: ${key}`);
    }
    if (typeof rawValue !== "string" || rawValue.includes("\0")) fail(`child environment ${key} is invalid`);
    result[key] = rawValue;
  }
  if (result.HOMECOOK_REHEARSAL_RUN_ID !== runId) fail("child environment run_id mismatch");
  for (const key of ["HOME", "TMPDIR", "FULL_LOCAL_SECRET_DIR"]) {
    if (result[key] !== undefined) {
      const value = resolve(result[key]);
      const relative = value === runRoot ? "" : value.startsWith(`${runRoot}/`) ? value.slice(runRoot.length + 1) : "..";
      if (relative === ".." || relative.startsWith("../")) fail(`${key} must stay inside the run root`);
    }
  }
  if (
    result.HOMECOOK_FULL_LOCAL_SECRET_DIR !== undefined
    && result.HOMECOOK_FULL_LOCAL_SECRET_DIR !== "/run/app-secrets"
  ) fail("HOMECOOK_FULL_LOCAL_SECRET_DIR must use the exact read-only container mount");
  if (result.DATABASE_URL !== undefined) {
    let databaseUrl;
    try { databaseUrl = new URL(result.DATABASE_URL); } catch { fail("DATABASE_URL is invalid"); }
    if (databaseUrl.protocol !== "postgresql:" || !["127.0.0.1", "::1", "localhost"].includes(databaseUrl.hostname)) {
      fail("DATABASE_URL must use the isolated loopback database");
    }
    if (/(?:prod|production)/iu.test(databaseUrl.username) || /(?:prod|production)/iu.test(databaseUrl.pathname)) {
      fail("DATABASE_URL references a production database identity");
    }
  }
  for (const key of [
    "NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_SUPABASE_URL",
    "DATA_SUPABASE_URL", "LOCAL_SUPABASE_INTERNAL_URL",
  ]) {
    if (result[key] === undefined) continue;
    let url;
    try { url = new URL(result[key]); } catch { fail(`${key} is invalid`); }
    if (!["127.0.0.1", "::1", "localhost"].includes(url.hostname)) fail(`${key} must be loopback-only`);
  }
  return Object.freeze(result);
}

export function validateMigrationReplay(value, expected) {
  exactKeys(value, [
    "ordered_migration_files_digest",
    "applied_global_ledger_digest",
    "global_ledger_entries",
    "ordered_global_ledger",
    "migration_head",
    "catalog_head",
    "schema_identity_digest",
  ], "migration replay");
  requireDigest(value.ordered_migration_files_digest, "migration replay input digest");
  requireDigest(value.applied_global_ledger_digest, "migration global ledger digest");
  requireDigest(value.schema_identity_digest, "migration schema identity digest");
  if (value.ordered_migration_files_digest !== expected.ordered_migration_files_digest) {
    fail("migration files digest mismatch");
  }
  const expectedLedger = expected.ordered_migration_files.map((path) =>
    basename(path).replace(/\.sql$/u, ""));
  if (canonicalizeJcs(value.ordered_global_ledger) !== canonicalizeJcs(expectedLedger)) {
    fail("migration global ledger is missing or out of order");
  }
  if (value.migration_head !== expected.migration_head || value.catalog_head !== expected.migration_head) {
    fail("migration ledger/catalog head mismatch");
  }
  if (!Array.isArray(value.global_ledger_entries) || value.global_ledger_entries.length !== expectedLedger.length) {
    fail("migration global ledger entries are incomplete");
  }
  value.global_ledger_entries.forEach((entry, index) => {
    exactKeys(entry, ["sequence", "migration_id", "migration_sha256"], `migration ledger entry ${index}`);
    if (
      entry.sequence !== index + 1
      || entry.migration_id !== expectedLedger[index]
      || !DIGEST.test(entry.migration_sha256 ?? "")
    ) fail("migration global ledger entry order or digest is invalid");
  });
  if (sha256Jcs(value.global_ledger_entries) !== value.applied_global_ledger_digest) {
    fail("migration applied global ledger digest mismatch");
  }
  return Object.freeze({ ...value, ordered_global_ledger: Object.freeze([...value.ordered_global_ledger]) });
}

function validateRuntimeIdentities(entries, manifest) {
  if (!Array.isArray(entries) || entries.length !== 3) fail("runtime must report exact app/full_local/worker identities");
  const ordered = [...entries].sort((left, right) => left.component.localeCompare(right.component));
  if (canonicalizeJcs(ordered.map((entry) => entry.component)) !== canonicalizeJcs(["app", "full_local", "worker"])) {
    fail("runtime component set is incomplete or duplicated");
  }
  for (const entry of ordered) {
    for (const [field, expected] of [
      ["release_sha", manifest.release_sha],
      ["release_tree", manifest.release_tree],
      ["build_id", manifest.build_id],
      ["sealed_bundle_digest", manifest.sealed_bundle_digest],
      ["migration_head", manifest.migration.migration_head],
    ]) {
      if (entry[field] !== expected) fail(`${entry.component} child identity mismatch at ${field}`);
    }
    if (entry.ready !== true || entry.exit_code !== null) fail(`${entry.component} crashed or was not ready`);
    if (entry.kind === "process") {
      if (!Number.isSafeInteger(entry.pid) || entry.pid <= 0 || !Number.isSafeInteger(entry.process_group_id) || entry.process_group_id <= 0) {
        fail(`${entry.component} process PID/process group identity is invalid`);
      }
    } else if (entry.kind === "container") {
      if (!Array.isArray(entry.container_ids) || entry.container_ids.length === 0) fail(`${entry.component} container identity is missing`);
    } else fail(`${entry.component} runtime kind is invalid`);
  }
  return ordered;
}

function validateCanaries(canaries) {
  if (!Array.isArray(canaries) || canaries.length === 0) fail("canary evidence is required");
  const ordered = [...canaries].sort((left, right) => left.canary_id.localeCompare(right.canary_id));
  if (new Set(ordered.map((entry) => entry.canary_id)).size !== ordered.length) fail("canary IDs are duplicated");
  for (const entry of ordered) {
    requireString(entry.canary_id, "canary_id");
    if (entry.exit_code !== 0) fail(`${entry.canary_id} canary failed`);
    requireDigest(entry.normalized_result_digest, `${entry.canary_id} normalized result`);
  }
  return ordered;
}

function expectedOwnershipLabels(runId, project) {
  return { [RUN_OWNERSHIP_LABEL]: runId, [RUN_PROJECT_LABEL]: project };
}

function isUnknownOrProductionResource(entry) {
  return !entry || typeof entry.id !== "string" || typeof entry.name !== "string"
    || PRODUCTION_NAME.test(entry.name)
    || RESERVED_NAME_PREFIXES.some((prefix) => entry.name.startsWith(prefix));
}

export async function cleanupOwnedResources({
  runId,
  project,
  ownedResources,
  inspectResource,
  removeResource,
}) {
  const removed = [];
  const errors = [];
  const labels = expectedOwnershipLabels(runId, project);
  for (const entry of [...ownedResources].reverse()) {
    try {
      if (isUnknownOrProductionResource(entry)) throw new Error("unknown or production cleanup target");
      const observed = await inspectResource(entry);
      if (
        !observed
        || observed.kind !== entry.kind
        || observed.id !== entry.id
        || observed.name !== entry.name
        || observed.labels?.[RUN_OWNERSHIP_LABEL] !== labels[RUN_OWNERSHIP_LABEL]
        || observed.labels?.[RUN_PROJECT_LABEL] !== labels[RUN_PROJECT_LABEL]
      ) throw new Error("cleanup ownership label or resource identity mismatch");
      await removeResource(entry);
      removed.push(entry.id);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return Object.freeze({ removed_resource_ids: removed, cleanup_errors: errors });
}

function assertPrivateNamespaceRoot(path) {
  if (!isAbsolute(path ?? "")) fail("run namespace root must be absolute");
  realpathSync(path);
  const canonical = path;
  const stat = lstatSync(canonical, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077n) !== 0n) {
    fail("run namespace root must be a private directory");
  }
  return canonical;
}

function reserveRunRoot(namespaceRoot, runId) {
  const runRoot = join(namespaceRoot, runId);
  mkdirSync(runRoot, { mode: 0o700 });
  const stat = lstatSync(runRoot, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink() || modeBits(stat) !== 0o700) fail("run root reservation is unsafe");
  return { runRoot, identity: directoryIdentity(stat) };
}

function directoryIdentity(stat) {
  return Object.freeze({
    device: String(stat.dev),
    inode: String(stat.ino),
    uid: Number(stat.uid),
    gid: Number(stat.gid),
    mode: Number(stat.mode & 0o7777n),
    ctime_ns: String(stat.ctimeNs),
  });
}

function assertDirectoryIdentity(path, expected, label) {
  const stat = lstatSync(path, { bigint: true });
  if (
    !stat.isDirectory()
    || stat.isSymbolicLink()
    || canonicalizeJcs(directoryIdentity(stat)) !== canonicalizeJcs(expected)
  ) fail(`${label} directory dev/inode/owner/mode/ctime identity drifted`);
}

function writeCanonicalCreateOnly(path, value, mode = 0o600) {
  const bytes = Buffer.from(canonicalizeJcs(value), "utf8");
  const fd = openSync(path, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, mode);
  try { writeFileSync(fd, bytes); } finally { closeSync(fd); }
}

function verifyCandidateStable(before, after) {
  const fields = [
    "candidate_identity_digest", "manifest_digest", "release_sha", "release_tree", "build_id",
    "sealed_bundle_digest", "bundle_manifest_digest", "migration",
  ];
  for (const field of fields) {
    if (canonicalizeJcs(before.manifest[field]) !== canonicalizeJcs(after.manifest[field])) {
      fail(`sealed candidate tamper or drift detected at ${field}`);
    }
  }
}

function stageVerifiedCandidate({ sourceRoot, runRoot, readCandidate, candidateBefore }) {
  const executionRoot = join(runRoot, "execution-candidate");
  copyLocalMacProductionExecutionTree(sourceRoot, executionRoot);
  sealLocalMacProductionExecutionTree(executionRoot);
  const stagedCandidate = readCandidate(executionRoot);
  verifyCandidateStable(candidateBefore, stagedCandidate);
  return Object.freeze({ executionRoot, stagedCandidate });
}

function validateProductionSnapshot(value, label) {
  if (value?.schema !== "homecook.local-mac-production-surface-snapshot.v1") fail(`production ${label} snapshot is incomplete`);
  requireDigest(value.surface_digest, `production ${label} surface digest`);
  requireDigest(value.snapshot_digest, `production ${label} snapshot digest`);
  if (value.mutation_attempt_count !== 0 || value.production_db_connection_count !== 0) {
    fail(`production ${label} snapshot recorded mutation or DB connection`);
  }
  return value;
}

/** Rejects telemetry unless it was independently captured for the run window. */
export function validateIndependentProductionObserver(value) {
  exactKeys(value, [
    "schema", "source_identity_digest", "started_at", "completed_at", "pre_snapshot_digest", "post_snapshot_digest",
    "process_binding_digest", "docker_daemon_identity_digest", "observation_digest", "available", "truncated",
    "production_db_connection_count", "production_db_write_count", "production_credential_access_count",
    "production_socket_access_count", "provider_remote_access_count", "production_mutation_count", "unrelated_noise_count",
    "registered_subjects",
  ], "independent production observer");
  if (value.schema !== "homecook.r2-production-observer.v1" || value.available !== true || value.truncated !== false) {
    fail("independent production observer is unavailable or truncated");
  }
  for (const field of ["source_identity_digest", "pre_snapshot_digest", "post_snapshot_digest", "process_binding_digest", "docker_daemon_identity_digest", "observation_digest"]) {
    requireDigest(value[field], `independent production observer ${field}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}T.*\.\d{3}Z$/u.test(value.started_at ?? "") || !/^\d{4}-\d{2}-\d{2}T.*\.\d{3}Z$/u.test(value.completed_at ?? "")) {
    fail("independent production observer timestamps are invalid");
  }
  if (value.pre_snapshot_digest !== value.post_snapshot_digest) fail("independent production observer detected production snapshot drift");
  for (const field of ["production_db_connection_count", "production_db_write_count", "production_credential_access_count", "production_socket_access_count", "provider_remote_access_count", "production_mutation_count"]) {
    if (!Number.isSafeInteger(value[field]) || value[field] !== 0) fail(`independent production observer ${field} must be zero`);
  }
  if (!Number.isSafeInteger(value.unrelated_noise_count) || value.unrelated_noise_count < 0) fail("independent production observer noise count is invalid");
  if (!Array.isArray(value.registered_subjects) || value.registered_subjects.length === 0) fail("independent production observer registered subjects are missing");
  const subjects = new Set();
  for (const subject of value.registered_subjects) {
    exactKeys(subject, ["container_id", "host_pid", "host_pgid", "component", "started_at", "image_digest", "config_digest", "executable_identity_digest"], "independent production observer subject");
    if (typeof subject.container_id !== "string" || !Number.isSafeInteger(subject.host_pid) || subject.host_pid <= 0 || !Number.isSafeInteger(subject.host_pgid) || subject.host_pgid <= 0 || typeof subject.component !== "string" || !/^\d{4}-\d{2}-\d{2}T/u.test(subject.started_at ?? "") || !DIGEST.test(subject.image_digest ?? "") || !DIGEST.test(subject.config_digest ?? "") || !DIGEST.test(subject.executable_identity_digest ?? "")) fail("independent production observer subject identity is invalid");
    if (subjects.has(subject.container_id)) fail("independent production observer subjects are duplicated");
    subjects.add(subject.container_id);
  }
  return Object.freeze({ ...value });
}

export function validateSealedWorkerSyntheticResult(value) {
  exactKeys(value, ["schema", "status", "synthetic", "provider_requests", "rpc_sequence"], "sealed worker synthetic result");
  const expected = [
    "claim_youtube_extraction_job", "claim_youtube_extractor_permit", "start_youtube_extraction_attempt",
    "heartbeat_youtube_extraction_job", "heartbeat_youtube_extractor_permit", "read_youtube_extraction_worker_catalog",
    "report_youtube_extraction_progress", "resolve_youtube_extraction_job_draft", "finalize_youtube_extraction_job", "release_youtube_extractor_permit",
  ];
  if (value.schema !== "homecook.youtube-extraction-worker-rehearsal-result.v1" || value.status !== "succeeded" || value.synthetic !== true) {
    fail("sealed worker synthetic result is not an actual synthetic success");
  }
  if (value.provider_requests !== 0) fail("sealed worker provider requests must be zero");
  if (!Array.isArray(value.rpc_sequence) || canonicalizeJcs(value.rpc_sequence) !== canonicalizeJcs(expected)) {
    fail("sealed worker fence lifecycle is incomplete or out of order");
  }
  return Object.freeze({ ...value, rpc_sequence: Object.freeze([...value.rpc_sequence]) });
}

function buildProductionGuard(pre, post, measurement, observer) {
  validateProductionSnapshot(pre, "pre");
  validateProductionSnapshot(post, "post");
  validateIndependentProductionObserver(observer);
  if (pre.surface_digest !== post.surface_digest) fail("production surface drifted during rehearsal");
  exactKeys(measurement, [
    "schema", "production_db_connection_count", "production_db_write_count",
    "mutation_attempt_count", "forbidden_mount_count", "forbidden_environment_count",
    "observed_container_count", "container_policy_digest", "command_policy_digest",
    "network_policy_digest", "external_attempt_count", "successful_egress_count",
    "docker_endpoint_identity_digest", "docker_daemon_identity_digest",
  ], "production isolation telemetry");
  if (
    measurement.schema !== "homecook.release-rehearsal-production-isolation-telemetry.v1"
    || measurement.production_db_connection_count !== 0
    || measurement.production_db_write_count !== 0
    || measurement.mutation_attempt_count !== 0
    || measurement.forbidden_mount_count !== 0
    || measurement.forbidden_environment_count !== 0
    || !Number.isSafeInteger(measurement.observed_container_count)
    || measurement.observed_container_count < 1
    || !DIGEST.test(measurement.container_policy_digest ?? "")
    || !DIGEST.test(measurement.command_policy_digest ?? "")
    || !DIGEST.test(measurement.network_policy_digest ?? "")
    || measurement.external_attempt_count < 1
    || measurement.successful_egress_count !== 0
    || !DIGEST.test(measurement.docker_endpoint_identity_digest ?? "")
    || !DIGEST.test(measurement.docker_daemon_identity_digest ?? "")
  ) fail("measured production isolation telemetry is not zero");
  return Object.freeze({
    surface_allowlist_version: pre.surface_allowlist_version,
    production_snapshot_pre_digest: pre.surface_digest,
    production_snapshot_post_digest: post.surface_digest,
    equal: true,
    mutation_attempt_count: measurement.mutation_attempt_count,
    production_db_connection_count: measurement.production_db_connection_count,
    production_db_write_count: measurement.production_db_write_count,
    independent_observer: observer,
    measurement,
    measurement_digest: sha256Jcs(measurement),
  });
}

function makeEvidence({ manifest, runId, issuedAt, completedAt, namespace, runRootIdentity, executionRootIdentity, migration, fixtures, runtime, canaries, network, cleanup, productionGuard }) {
  const unsigned = {
    schema: RUN_EVIDENCE_SCHEMA,
    canonicalization: CANONICALIZATION,
    status: "passed",
    trusted_receipt: false,
    candidate_identity_digest: manifest.candidate_identity_digest,
    release_sha: manifest.release_sha,
    release_tree: manifest.release_tree,
    build_id: manifest.build_id,
    sealed_bundle_digest: manifest.sealed_bundle_digest,
    bundle_manifest_digest: manifest.bundle_manifest_digest,
    run_id: runId,
    issued_at: issuedAt,
    completed_at: completedAt,
    isolation: {
      docker_project_id: namespace.project,
      container_names: namespace.container_names,
      network_names: namespace.network_names,
      volume_names: namespace.volume_names,
      db_identity: {
        name: namespace.db_name,
        user: namespace.db_user,
        identity_digest: sha256Jcs({ name: namespace.db_name, user: namespace.db_user }),
      },
      ports: namespace.ports,
      root_identity_digest: sha256Jcs(runRootIdentity),
      execution_root_identity_digest: sha256Jcs(executionRootIdentity),
      resource_identity_digest: sha256Jcs({
        project: namespace.project,
        container_names: namespace.container_names,
        network_names: namespace.network_names,
        volume_names: namespace.volume_names,
        owned_resource_ids: cleanup.owned_resource_ids,
      }),
    },
    migration,
    fixtures,
    runtime: {
      app: runtime.find((entry) => entry.component === "app"),
      full_local: runtime.find((entry) => entry.component === "full_local"),
      worker: runtime.find((entry) => entry.component === "worker"),
      foreground_supervisor: {
        component: "foreground_supervisor",
        pid: process.pid,
        process_group_id: null,
        child_process_groups_enforced: true,
        launchd_used: false,
        child_identity_digest: sha256Jcs(runtime),
        timeout_policy_digest: sha256Jcs({ readiness_ms: 120_000, shutdown_ms: 30_000, output_bytes: 1_048_576 }),
      },
    },
    canaries,
    network,
    cleanup,
    production_guard: productionGuard,
    threat_controls: {
      symlink_toctou: "pass",
      namespace_collision: "pass",
      digest_substitution: "pass",
      stale_candidate: "pass",
      cleanup_ownership: "pass",
    },
  };
  return Object.freeze({ ...unsigned, evidence_digest: sha256Jcs(unsigned) });
}

export function validateRunEvidence(value) {
  exactKeys(value, TOP_LEVEL_EVIDENCE_KEYS, "run evidence");
  if (value.schema !== RUN_EVIDENCE_SCHEMA || value.canonicalization !== CANONICALIZATION) fail("run evidence schema is invalid");
  if (value.status !== "passed" || value.trusted_receipt !== false) fail("run evidence must explicitly be an untrusted non-receipt pass artifact");
  requireSha(value.release_sha, "run evidence release_sha");
  requireSha(value.release_tree, "run evidence release_tree");
  for (const field of ["candidate_identity_digest", "sealed_bundle_digest", "bundle_manifest_digest", "evidence_digest"]) requireDigest(value[field], field);
  exactKeys(value.isolation, [
    "docker_project_id", "container_names", "network_names", "volume_names",
    "db_identity", "ports", "root_identity_digest", "execution_root_identity_digest", "resource_identity_digest",
  ], "run evidence isolation");
  exactKeys(value.isolation.db_identity, ["name", "user", "identity_digest"], "run evidence DB identity");
  exactKeys(value.migration, [
    "ordered_migration_files_digest", "applied_global_ledger_digest",
    "global_ledger_entries", "ordered_global_ledger", "migration_head", "catalog_head", "schema_identity_digest",
  ], "run evidence migration");
  exactKeys(value.fixtures, [
    "fixture_set_id", "fixture_set_digest", "production_derived_row_count",
  ], "run evidence fixtures");
  exactKeys(value.runtime, ["app", "full_local", "worker", "foreground_supervisor"], "run evidence runtime");
  for (const component of ["app", "full_local", "worker"]) {
    exactKeys(value.runtime[component], [
      "component", "kind", "pid", "process_group_id", "container_ids", "release_sha",
      "release_tree", "build_id", "sealed_bundle_digest", "migration_head", "ready", "exit_code",
    ], `run evidence runtime.${component}`);
  }
  exactKeys(value.runtime.foreground_supervisor, [
    "component", "pid", "process_group_id", "child_process_groups_enforced", "launchd_used", "child_identity_digest", "timeout_policy_digest",
  ], "run evidence foreground supervisor");
  if (!Array.isArray(value.canaries) || value.canaries.length === 0) fail("run evidence canaries are missing");
  for (const [index, canary] of value.canaries.entries()) {
    exactKeys(canary, ["canary_id", "exit_code", "normalized_result_digest"], `run evidence canaries[${index}]`);
    if (canary.exit_code !== 0 || !DIGEST.test(canary.normalized_result_digest ?? "")) {
      fail("run evidence canary must be an exact successful digest-bound result");
    }
  }
  const canaryIds = value.canaries.map((entry) => entry.canary_id).sort();
  if (canonicalizeJcs(canaryIds) !== canonicalizeJcs(REQUIRED_CANARY_IDS)) {
    fail("run evidence canary set is not the exact documented set");
  }
  exactKeys(value.network, [
    "default_deny_policy_digest", "allowed_endpoints", "denied_attempt_count",
    "unexpected_successful_egress_count",
  ], "run evidence network");
  exactKeys(value.cleanup, [
    "completed", "owned_resource_ids", "removed_resource_ids", "residue_resource_ids",
    "cleanup_errors", "secret_bearing_persistent_file_count",
  ], "run evidence cleanup");
  exactKeys(value.production_guard, [
    "surface_allowlist_version", "production_snapshot_pre_digest",
    "production_snapshot_post_digest", "equal", "mutation_attempt_count",
    "production_db_connection_count", "production_db_write_count", "measurement", "measurement_digest", "independent_observer",
  ], "run evidence production guard");
  exactKeys(value.threat_controls, [
    "symlink_toctou", "namespace_collision", "digest_substitution",
    "stale_candidate", "cleanup_ownership",
  ], "run evidence threat controls");
  if (
    typeof value.issued_at !== "string"
    || typeof value.completed_at !== "string"
    || new Date(value.issued_at).toISOString() !== value.issued_at
    || new Date(value.completed_at).toISOString() !== value.completed_at
    || Date.parse(value.issued_at) > Date.parse(value.completed_at)
  ) fail("run evidence issued/completed timestamp order is invalid");
  if (
    value.runtime.app.component !== "app"
    || value.runtime.full_local.component !== "full_local"
    || value.runtime.worker.component !== "worker"
    || value.runtime.foreground_supervisor.component !== "foreground_supervisor"
    || !Number.isSafeInteger(value.runtime.foreground_supervisor.pid)
    || value.runtime.foreground_supervisor.pid < 1
    || value.runtime.foreground_supervisor.process_group_id !== null
    || value.runtime.foreground_supervisor.child_process_groups_enforced !== true
    || value.runtime.foreground_supervisor.launchd_used !== false
  ) fail("run evidence runtime component set or supervisor identity is invalid");
  const componentContainerIds = [];
  for (const component of [value.runtime.app, value.runtime.full_local, value.runtime.worker]) {
    if (
      component.kind !== "container"
      || component.pid !== null
      || component.process_group_id !== null
      || !Array.isArray(component.container_ids)
      || component.container_ids.length < 1
    ) fail("run evidence component runtime must be an exact container identity");
    if (
      component.release_sha !== value.release_sha
      || component.release_tree !== value.release_tree
      || component.build_id !== value.build_id
      || component.sealed_bundle_digest !== value.sealed_bundle_digest
      || component.migration_head !== value.migration.migration_head
      || component.ready !== true
      || component.exit_code !== null
    ) fail("run evidence component identity is not bound to the run evidence authority");
    componentContainerIds.push(...component.container_ids);
  }
  if (new Set(componentContainerIds).size !== componentContainerIds.length) {
    fail("run evidence component container identities are duplicated");
  }
  const cleanupOwnedIds = new Set(value.cleanup?.owned_resource_ids ?? []);
  if (componentContainerIds.some((id) => !cleanupOwnedIds.has(id))) {
    fail("run evidence component container is absent from cleanup ownership ledger");
  }
  validateMigrationReplay(value.migration, {
    ordered_migration_files: value.migration.global_ledger_entries.map((entry) =>
      `supabase/migrations/${entry.migration_id}.sql`),
    ordered_migration_files_digest: value.migration.ordered_migration_files_digest,
    migration_head: value.migration.migration_head,
  });
  const migrationFileEntries = value.migration.global_ledger_entries.map((entry) => ({
    path: `supabase/migrations/${entry.migration_id}.sql`,
    sha256: entry.migration_sha256,
  }));
  if (sha256Jcs(migrationFileEntries) !== value.migration.ordered_migration_files_digest) {
    fail("run evidence migration file aggregate differs from ledger entries");
  }
  if (value.fixtures?.production_derived_row_count !== 0) fail("run evidence contains production-derived fixtures");
  if (
    !DIGEST.test(value.network?.default_deny_policy_digest ?? "")
    || !Array.isArray(value.network?.allowed_endpoints)
    || value.network.allowed_endpoints.length === 0
    || value.network.allowed_endpoints.some((entry) => typeof entry !== "string" || entry.length === 0)
    || value.network?.unexpected_successful_egress_count !== 0
  ) fail("run evidence network evidence is invalid");
  if (!Number.isSafeInteger(value.network?.denied_attempt_count) || value.network.denied_attempt_count < 1) {
    fail("run evidence must contain a measured denied network attempt");
  }
  if (
    value.cleanup?.completed !== true
    || value.cleanup?.residue_resource_ids?.length !== 0
    || value.cleanup?.cleanup_errors?.length !== 0
    || value.cleanup?.secret_bearing_persistent_file_count !== 0
  ) fail("run evidence cleanup is incomplete");
  const ownedIds = [...value.cleanup.owned_resource_ids].sort();
  const removedIds = [...value.cleanup.removed_resource_ids].sort();
  if (canonicalizeJcs(ownedIds) !== canonicalizeJcs(removedIds)) {
    fail("run evidence owned/removed resource identities differ");
  }
  if (value.isolation.resource_identity_digest !== sha256Jcs({
    project: value.isolation.docker_project_id,
    container_names: value.isolation.container_names,
    network_names: value.isolation.network_names,
    volume_names: value.isolation.volume_names,
    owned_resource_ids: value.cleanup.owned_resource_ids,
  })) fail("run evidence resource identity digest differs from immutable cleanup ledger");
  if (
    value.production_guard?.equal !== true
    || value.production_guard?.mutation_attempt_count !== 0
    || value.production_guard?.production_db_connection_count !== 0
    || value.production_guard?.production_db_write_count !== 0
  ) fail("run evidence production guard is invalid");
  if (value.production_guard.production_snapshot_pre_digest !== value.production_guard.production_snapshot_post_digest) {
    fail("run evidence production snapshots differ");
  }
  validateIndependentProductionObserver(value.production_guard.independent_observer);
  exactKeys(value.production_guard.measurement, [
    "schema", "production_db_connection_count", "production_db_write_count",
    "mutation_attempt_count", "forbidden_mount_count", "forbidden_environment_count",
    "observed_container_count", "container_policy_digest", "command_policy_digest",
    "network_policy_digest", "external_attempt_count", "successful_egress_count",
    "docker_endpoint_identity_digest", "docker_daemon_identity_digest",
  ], "run evidence production measurement");
  if (
    sha256Jcs(value.production_guard.measurement) !== value.production_guard.measurement_digest
    || value.production_guard.measurement.production_db_connection_count !== value.production_guard.production_db_connection_count
    || value.production_guard.measurement.production_db_write_count !== value.production_guard.production_db_write_count
    || value.production_guard.measurement.mutation_attempt_count !== value.production_guard.mutation_attempt_count
  ) fail("run evidence production measurement digest/count binding is invalid");
  if (Object.values(value.threat_controls).some((control) => control !== "pass")) {
    fail("run evidence threat controls must all pass");
  }
  const { evidence_digest: evidenceDigest, ...unsigned } = value;
  if (sha256Jcs(unsigned) !== evidenceDigest) fail("run evidence digest mismatch");
  return value;
}

function normalizeAdapterError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/[\r\n\t]+/gu, " ").slice(0, 512);
}

export async function runIsolatedReleaseRehearsal({
  candidateInput,
  namespaceRoot,
  runId,
  readCandidate,
  adapters,
  now = () => new Date(),
  signal = /** @type {AbortSignal | null} */ (null),
}) {
  const sourceCandidateRoot = resolveCompletedCandidateInput(candidateInput);
  const canonicalNamespaceRoot = assertPrivateNamespaceRoot(namespaceRoot);
  if (typeof readCandidate !== "function" || !adapters) fail("runner dependencies are incomplete");
  const sourceCandidate = readCandidate(sourceCandidateRoot);
  let candidateBefore = sourceCandidate;
  const manifest = candidateBefore.manifest;
  requireSha(manifest.release_sha, "candidate release_sha");
  requireSha(manifest.release_tree, "candidate release_tree");
  requireDigest(manifest.candidate_identity_digest, "candidate identity digest");
  requireDigest(manifest.sealed_bundle_digest, "candidate sealed bundle digest");
  requireDigest(manifest.bundle_manifest_digest, "candidate bundle manifest digest");
  const reservation = reserveRunRoot(canonicalNamespaceRoot, runId);
  let candidateRoot = sourceCandidateRoot;
  const issuedAt = now().toISOString();
  let preSnapshot = null;
  let namespace = null;
  let runtimeEntries = [];
  let ownedResources = [];
  let cleanupResult = null;
  let firstError = null;
  let productionMeasurement = null;
  let independentObserver = null;
  let stableRunRootIdentity = null;
  let stableExecutionRootIdentity = null;

  const checkAbort = () => {
    if (signal?.aborted) throw new Error(`rehearsal interrupted by signal: ${signal.reason ?? "aborted"}`);
  };
  const verifyStableExecution = () => {
    if (!stableRunRootIdentity || !stableExecutionRootIdentity || candidateRoot === sourceCandidateRoot) return;
    assertDirectoryIdentity(reservation.runRoot, stableRunRootIdentity, "run root");
    assertDirectoryIdentity(candidateRoot, stableExecutionRootIdentity, "execution candidate root");
    const current = readCandidate(candidateRoot);
    verifyCandidateStable(candidateBefore, current);
  };
  const cleanup = async () => {
    if (cleanupResult) return cleanupResult;
    const cleanupErrors = [];
    for (const entry of [...runtimeEntries].reverse()) {
      try { await adapters.stopRuntime(entry, { runId, namespace, runRoot: reservation.runRoot }); }
      catch (error) { cleanupErrors.push(normalizeAdapterError(error)); }
    }
    if (typeof adapters.getCreationLedger === "function") {
      try {
        const ledger = adapters.getCreationLedger();
        if (!Array.isArray(ledger)) throw new Error("creation ledger is invalid");
        ownedResources = ledger.map((entry) => ({ ...entry }));
      } catch (error) { cleanupErrors.push(normalizeAdapterError(error)); }
    }
    const resourceCleanup = await cleanupOwnedResources({
      runId,
      project: namespace?.project ?? `homecook-rehearsal-${runId}`,
      ownedResources,
      inspectResource: adapters.inspectResource
        ? (entry) => adapters.inspectResource(entry, { runId, namespace, runRoot: reservation.runRoot })
        : async (entry) => ({ ...entry, labels: expectedOwnershipLabels(runId, namespace.project) }),
      removeResource: (entry) => adapters.removeResource(entry, { runId, namespace, runRoot: reservation.runRoot }),
    });
    cleanupErrors.push(...resourceCleanup.cleanup_errors);
    let residue = [];
    let secretCount = -1;
    try { residue = await adapters.listResidue({ runId, namespace, runRoot: reservation.runRoot }); }
    catch (error) { cleanupErrors.push(normalizeAdapterError(error)); }
    try { await adapters.closeSecretHandles({ runId, namespace, runRoot: reservation.runRoot }); }
    catch (error) { cleanupErrors.push(normalizeAdapterError(error)); }
    try { secretCount = await adapters.countPersistentSecretFiles({ runId, namespace, runRoot: reservation.runRoot }); }
    catch (error) { cleanupErrors.push(normalizeAdapterError(error)); }
    cleanupResult = Object.freeze({
      completed: cleanupErrors.length === 0 && residue.length === 0 && secretCount === 0,
      owned_resource_ids: ownedResources.map((entry) => entry.id).sort(),
      removed_resource_ids: [...resourceCleanup.removed_resource_ids].sort(),
      residue_resource_ids: residue.map((entry) => entry.id).sort(),
      cleanup_errors: cleanupErrors,
      secret_bearing_persistent_file_count: secretCount,
    });
    return cleanupResult;
  };

  try {
    checkAbort();
    const staged = stageVerifiedCandidate({
      sourceRoot: sourceCandidateRoot,
      runRoot: reservation.runRoot,
      readCandidate,
      candidateBefore: sourceCandidate,
    });
    candidateRoot = staged.executionRoot;
    candidateBefore = staged.stagedCandidate;
    mkdirSync(join(reservation.runRoot, "runtime-state"), { mode: 0o700 });
    stableRunRootIdentity = directoryIdentity(lstatSync(reservation.runRoot, { bigint: true }));
    stableExecutionRootIdentity = directoryIdentity(lstatSync(candidateRoot, { bigint: true }));
    verifyStableExecution();
    preSnapshot = validateProductionSnapshot(await adapters.snapshotProduction("pre", { signal }), "pre");
    if (!adapters.independentObserver || typeof adapters.independentObserver.begin !== "function" || typeof adapters.independentObserver.end !== "function" || typeof adapters.independentObserver.registerChild !== "function") {
      fail("independent observer is unavailable");
    }
    await adapters.independentObserver.begin({ runId, preSnapshot, signal });
    verifyStableExecution();
    checkAbort();
    const ports = await adapters.reservePorts({ runId, runRoot: reservation.runRoot });
    namespace = buildRunNamespace({ runId, ports });
    const collision = await adapters.inspectCollisions({ runId, namespace, runRoot: reservation.runRoot, signal });
    if (!collision || !Array.isArray(collision.collisions) || collision.collisions.length !== 0) {
      fail("existing resource or namespace collision detected; suffix fallback is forbidden");
    }
    await adapters.assertImagesLocal({ manifest, candidateRoot, namespace, runRoot: reservation.runRoot, signal });
    verifyStableExecution();
    checkAbort();
    ownedResources = await adapters.createResources({ manifest, candidateRoot, namespace, runRoot: reservation.runRoot, signal, independentObserver: adapters.independentObserver });
    if (!Array.isArray(ownedResources)) fail("created resource inventory is invalid");
    verifyStableExecution();
    checkAbort();
    const migrationAuthority = (adapters.readVerifiedMigrationInputs ?? readVerifiedMigrationInputs)({
      candidateRoot,
      migration: manifest.migration,
    });
    const migration = validateMigrationReplay(
      await adapters.applyMigrations({
        manifest,
        candidateRoot,
        namespace,
        runRoot: reservation.runRoot,
        migrationInputs: migrationAuthority.inputs,
        signal,
      }),
      manifest.migration,
    );
    verifyStableExecution();
    checkAbort();
    const fixtures = await adapters.loadSyntheticFixtures({ manifest, candidateRoot, namespace, runRoot: reservation.runRoot, signal });
    if (fixtures?.production_derived_row_count !== 0) fail("synthetic fixture set contains production-derived rows");
    checkAbort();
    runtimeEntries = await adapters.startComponents({ manifest, candidateRoot, namespace, runRoot: reservation.runRoot, migration, signal });
    runtimeEntries = validateRuntimeIdentities(runtimeEntries, manifest);
    verifyStableExecution();
    const readiness = await adapters.waitForReadiness({ manifest, candidateRoot, namespace, runRoot: reservation.runRoot, runtime: runtimeEntries, signal });
    if (readiness?.ready !== true) fail("foreground supervisor readiness failed");
    verifyStableExecution();
    const canaries = validateCanaries(await adapters.runCanaries({ manifest, candidateRoot, namespace, runRoot: reservation.runRoot, runtime: runtimeEntries, migration, fixtures, signal }));
    const network = await adapters.readNetworkEvidence({ runId, namespace, runRoot: reservation.runRoot, signal });
    if (network?.unexpected_successful_egress_count !== 0) fail("external network unexpectedly succeeded");
    requireDigest(network?.default_deny_policy_digest, "network default deny policy digest");
    if (typeof adapters.readIsolationTelemetry !== "function") {
      fail("measured production isolation telemetry adapter is required");
    }
    productionMeasurement = await adapters.readIsolationTelemetry({
      runId,
      namespace,
      runRoot: reservation.runRoot,
      signal,
    });
    checkAbort();
    const cleanupEvidence = await cleanup();
    if (!cleanupEvidence.completed) fail("owned cleanup, residue, or secret persistence gate failed");
    verifyStableExecution();
    const postSnapshot = await adapters.snapshotProduction("post", { signal: new AbortController().signal });
    if (typeof adapters.reinspectObserverSubjects !== "function") fail("observer subject reinspection is unavailable");
    const registeredSubjects = await adapters.reinspectObserverSubjects({ signal: new AbortController().signal });
    independentObserver = await adapters.independentObserver.end({ runId, preSnapshot, postSnapshot, registeredSubjects, signal: new AbortController().signal });
    verifyStableExecution();
    const productionGuard = buildProductionGuard(preSnapshot, postSnapshot, productionMeasurement, independentObserver);
    const completedAt = now().toISOString();
    const evidence = makeEvidence({
      manifest,
      runId,
      issuedAt,
      completedAt,
      namespace,
      runRootIdentity: stableRunRootIdentity,
      executionRootIdentity: stableExecutionRootIdentity,
      migration,
      fixtures,
      runtime: runtimeEntries,
      canaries,
      network,
      cleanup: cleanupEvidence,
      productionGuard,
    });
    validateRunEvidence(evidence);
    writeCanonicalCreateOnly(join(reservation.runRoot, "run-evidence.json"), evidence);
    writeCanonicalCreateOnly(join(reservation.runRoot, "complete.json"), {
      schema: "homecook.local-mac-production-rehearsal-run-terminal.v1",
      status: "complete",
      trusted_receipt: false,
      evidence_digest: evidence.evidence_digest,
    });
    chmodSync(reservation.runRoot, 0o500);
    return evidence;
  } catch (error) {
    firstError = error;
    try { await cleanup(); } catch (cleanupError) {
      if (!firstError) firstError = cleanupError;
    }
    try { verifyStableExecution(); }
    catch (identityError) {
      firstError = new Error(`${normalizeAdapterError(firstError)}; ${normalizeAdapterError(identityError)}`);
    }
    let postSnapshot = null;
    if (preSnapshot) {
      try {
        postSnapshot = await adapters.snapshotProduction("post", { signal: new AbortController().signal });
        verifyStableExecution();
        validateProductionSnapshot(postSnapshot, "post");
        if (preSnapshot.surface_digest !== postSnapshot.surface_digest) {
          fail("production surface drifted during failed rehearsal");
        }
        if (productionMeasurement) buildProductionGuard(preSnapshot, postSnapshot, productionMeasurement);
      } catch (postError) {
        firstError = new Error(`${normalizeAdapterError(firstError)}; ${normalizeAdapterError(postError)}`);
      }
    }
    const failure = {
      schema: "homecook.local-mac-production-rehearsal-run-terminal.v1",
      status: "failed",
      trusted_receipt: false,
      run_id: runId,
      error_digest: createHash("sha256").update(normalizeAdapterError(firstError)).digest("hex"),
      cleanup_completed: cleanupResult?.completed === true,
      production_surface_equal: Boolean(preSnapshot && postSnapshot && preSnapshot.surface_digest === postSnapshot.surface_digest),
    };
    try { writeCanonicalCreateOnly(join(reservation.runRoot, "failed.json"), failure); } catch { /* Existing marker remains authoritative. */ }
    throw firstError;
  }
}
