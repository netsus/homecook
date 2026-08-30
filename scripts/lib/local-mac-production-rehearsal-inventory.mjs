import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants as FS_CONSTANTS,
  existsSync,
  fstatSync,
  lstatSync,
  opendirSync,
  openSync,
  readFileSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { parseCanonicalJcs, sha256Jcs } from "./rfc8785-jcs.mjs";
import { readPrivateCanonicalJsonFile } from "./local-mac-production-rehearsal-receipts.mjs";
import { resolveTrustedDockerBinary } from "./full-local-session-observation-reader.mjs";
import { getLocalMacProductionReleasePaths } from "./local-mac-production-release.mjs";
import { resolveTrustedGitExecutable } from "./trusted-production-release-tools.mjs";

export const INVENTORY_SCHEMA = "homecook.local-mac-production-rehearsal-inventory.v1";
export const PRODUCTION_SURFACE_SNAPSHOT_SCHEMA = "homecook.local-mac-production-surface-snapshot.v1";
export const CANONICAL_FULL_LOCAL_LAUNCHD_LABEL = "com.homecook.full-local-production";
export const LEGACY_FULL_LOCAL_LAUNCHD_LABEL = "com.homecook.full-local.production";

const HEX_40 = /^[0-9a-f]{40}$/u;
const HEX_64 = /^[0-9a-f]{64}$/u;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const ARTIFACT_KEYS = ["kind", "exists", "device", "inode", "owner_uid", "mode", "size", "mtime", "sha256"];
const WORKLOAD_KEYS = ["component", "release_sha", "release_tree", "build_id", "sealed_bundle_digest", "health", "descriptor_digest"];
const LAUNCHD_KEYS = ["label", "loaded", "state", "pid", "projection_digest"];
const CONTAINER_KEYS = ["id", "name", "project", "service", "image_digest", "image_id", "labels_digest", "mounts_digest", "state", "generation_digest"];
const NETWORK_KEYS = ["id", "name", "project", "labels_digest", "generation_digest"];
const VOLUME_KEYS = ["name", "project", "service", "labels_digest", "generation_digest"];
const PORT_KEYS = ["port", "pid", "process_name", "listener_digest"];
const CONFIG_KEYS = ["identity", "exists", "sha256"];
const MIGRATION_KEYS = ["approved", "marker_digest", "global_ledger_digest", "migration_head", "catalog_head"];
const PREPARED_IDENTITY_KEYS = ["attested", "status", "release_sha", "release_tree", "build_id", "sealed_bundle_digest", "descriptor_digest"];
const PROBE_NAMES = ["release_artifacts", "active_promotion_lock", "workloads", "launchd", "docker", "port_listeners", "opaque_configs", "migration", "tool_identities"];
const PROBE_STATUS_KEYS = ["status", "reason_code", "evidence_count"];
const REQUIRED_TOOL_NAMES = ["docker", "git", "launchctl", "lsof"];
const TOOL_KEYS = ["version", "realpath", "device", "inode", "mode", "ctime", "size", "sha256"];
const NAMED_TOOL_KEYS = ["name", ...TOOL_KEYS];
const SURFACE_KEYS = ["release_artifacts", "active_promotion_lock", "workloads", "launchd", "docker", "port_listeners", "opaque_configs", "migration", "prepared_identity"];
const INVENTORY_UNSIGNED_KEYS = ["schema", "canonicalization", "repository", "captured_at", "surface_allowlist_version", "probe_identity", "tool_identities", "probe_statuses", "production_db_connection_count", "mutation_attempt_count", "redacted_field_count", "surfaces", "surface_digest"];
const DEFAULT_SURFACE_MAX_ENTRIES = 10_000;
const DEFAULT_SURFACE_MAX_BYTES = 512 * 1024 * 1024;

function fail(message) {
  throw new Error(`Production inventory rejected: ${message}`);
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  const missing = keys.find((key) => !Object.hasOwn(value, key));
  const unknown = Object.keys(value).find((key) => !keys.includes(key));
  if (missing) fail(`${label} missing required key ${missing}`);
  if (unknown) fail(`${label} contains unknown evidence ${unknown}`);
  return value;
}

function nonempty(value, label) {
  if (typeof value !== "string" || value.length === 0) fail(`${label} must be a nonempty string`);
  return value;
}

function nullablePattern(value, label, pattern) {
  if (value !== null && (typeof value !== "string" || !pattern.test(value))) fail(`${label} has an invalid format`);
}

function integer(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) fail(`${label} must be an integer >= ${minimum}`);
}

function identityInteger(value, label) {
  if ((Number.isSafeInteger(value) && value >= 0) || /^(?:0|[1-9]\d*)$/u.test(value ?? "")) return;
  fail(`${label} must be an exact nonnegative integer or decimal string`);
}

function strictTimestamp(value, label) {
  if (typeof value !== "string" || !TIMESTAMP.test(value)) fail(`${label} must be UTC millisecond RFC3339`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== value) {
    fail(`${label} must be an exact calendar instant`);
  }
}

function project(value, keys, counter) {
  const result = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("adapter evidence must be an object");
  for (const key of keys) {
    result[key] = Object.hasOwn(value, key) ? value[key] : null;
  }
  counter.count += Object.keys(value).filter((key) => !keys.includes(key)).length;
  return result;
}

function projectedArray(values, keys, counter, sortKey) {
  if (!Array.isArray(values)) fail("adapter evidence must be an array");
  return values.map((value) => project(value, keys, counter)).sort((left, right) => {
    const leftKey = String(left[sortKey]);
    const rightKey = String(right[sortKey]);
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
}

function validateTool(value) {
  const tool = exactObject(value, "probe_identity", TOOL_KEYS);
  for (const key of ["version", "realpath"]) nonempty(tool[key], `probe_identity.${key}`);
  if (!tool.realpath.startsWith("/")) fail("probe_identity.realpath must be absolute");
  for (const key of ["device", "inode"]) identityInteger(tool[key], `probe_identity.${key}`);
  integer(tool.mode, "probe_identity.mode");
  identityInteger(tool.size, "probe_identity.size");
  strictTimestamp(tool.ctime, "probe_identity.ctime");
  if (!HEX_64.test(tool.sha256)) fail("probe_identity.sha256 has an invalid format");
}

function validateSurfaces(value) {
  const surfaces = exactObject(value, "surfaces", SURFACE_KEYS);
  validateArtifactEvidence(surfaces.active_promotion_lock, "surfaces.active_promotion_lock", { expectedKind: "active_promotion_lock" });
  for (const [key, keys] of [["release_artifacts", ARTIFACT_KEYS], ["workloads", WORKLOAD_KEYS], ["launchd", LAUNCHD_KEYS], ["port_listeners", PORT_KEYS], ["opaque_configs", CONFIG_KEYS]]) {
    if (!Array.isArray(surfaces[key])) fail(`surfaces.${key} must be an array`);
    surfaces[key].forEach((entry, index) => exactObject(entry, `surfaces.${key}[${index}]`, keys));
  }
  const docker = exactObject(surfaces.docker, "surfaces.docker", ["containers", "networks", "volumes"]);
  for (const [key, keys] of [["containers", CONTAINER_KEYS], ["networks", NETWORK_KEYS], ["volumes", VOLUME_KEYS]]) {
    if (!Array.isArray(docker[key])) fail(`surfaces.docker.${key} must be an array`);
    docker[key].forEach((entry, index) => exactObject(entry, `surfaces.docker.${key}[${index}]`, keys));
  }
  const migration = exactObject(surfaces.migration, "surfaces.migration", MIGRATION_KEYS);
  if (typeof migration.approved !== "boolean") fail("surfaces.migration.approved must be boolean");
  for (const key of ["marker_digest", "global_ledger_digest"]) nullablePattern(migration[key], `surfaces.migration.${key}`, HEX_64);
  if (migration.migration_head !== null) nonempty(migration.migration_head, "surfaces.migration.migration_head");
  if (migration.catalog_head !== null) nonempty(migration.catalog_head, "surfaces.migration.catalog_head");
  if (surfaces.prepared_identity !== null) {
    const prepared = exactObject(surfaces.prepared_identity, "surfaces.prepared_identity", PREPARED_IDENTITY_KEYS);
    if (prepared.attested !== true || prepared.status !== "prepared") fail("prepared identity must be attested and prepared");
    for (const key of ["release_sha", "release_tree"]) if (!HEX_40.test(prepared[key])) fail(`prepared identity ${key} is invalid`);
    nonempty(prepared.build_id, "prepared identity build_id");
    for (const key of ["sealed_bundle_digest", "descriptor_digest"]) if (!HEX_64.test(prepared[key])) fail(`prepared identity ${key} is invalid`);
  }

  for (const artifact of surfaces.release_artifacts) validateArtifactEvidence(artifact, "release artifact");
  const artifactKinds = surfaces.release_artifacts.map((artifact) => artifact.kind);
  if (new Set(artifactKinds).size !== artifactKinds.length) fail("release artifact kinds must be unique; duplicate descriptor evidence is ambiguous");
  for (const workload of surfaces.workloads) {
    nonempty(workload.component, "workload component");
    nullablePattern(workload.release_sha, "workload release_sha", HEX_40);
    nullablePattern(workload.release_tree, "workload release_tree", HEX_40);
    nullablePattern(workload.sealed_bundle_digest, "workload sealed_bundle_digest", HEX_64);
    nullablePattern(workload.descriptor_digest, "workload descriptor_digest", HEX_64);
    if (workload.build_id !== null) nonempty(workload.build_id, "workload build_id");
    if (!["running", "partial", "stopped", "missing", "unknown"].includes(workload.health)) fail("workload health is unknown evidence");
  }
  for (const [index, job] of surfaces.launchd.entries()) {
    nonempty(job.label, `launchd[${index}].label`);
    if (typeof job.loaded !== "boolean") fail(`launchd[${index}].loaded must be boolean`);
    nonempty(job.state, `launchd[${index}].state`);
    if (job.pid !== null) integer(job.pid, `launchd[${index}].pid`, 1);
    if (!HEX_64.test(job.projection_digest)) fail(`launchd[${index}].projection_digest is invalid`);
  }
  for (const [index, container] of docker.containers.entries()) {
    for (const key of ["id", "name", "project", "service", "state"]) nonempty(container[key], `docker.containers[${index}].${key}`);
    for (const key of ["image_digest", "image_id"]) if (!/^sha256:[0-9a-f]{64}$/u.test(container[key])) fail(`docker.containers[${index}].${key} is invalid`);
    for (const key of ["labels_digest", "mounts_digest", "generation_digest"]) if (!HEX_64.test(container[key])) fail(`docker.containers[${index}].${key} is invalid`);
  }
  for (const [collection, keys] of [[docker.networks, ["id", "name", "project"]], [docker.volumes, ["name", "project", "service"]]]) {
    collection.forEach((entry, index) => {
      for (const key of keys) nonempty(entry[key], `docker evidence[${index}].${key}`);
      for (const key of ["labels_digest", "generation_digest"]) if (!HEX_64.test(entry[key])) fail(`docker evidence[${index}].${key} is invalid`);
    });
  }
  for (const [index, listener] of surfaces.port_listeners.entries()) {
    integer(listener.port, `port_listeners[${index}].port`, 1);
    if (listener.port > 65_535) fail(`port_listeners[${index}].port must be <= 65535`);
    if (listener.pid !== null) integer(listener.pid, `port_listeners[${index}].pid`, 1);
    nonempty(listener.process_name, `port_listeners[${index}].process_name`);
    if (!HEX_64.test(listener.listener_digest)) fail(`port_listeners[${index}].listener_digest is invalid`);
  }
  for (const [index, config] of surfaces.opaque_configs.entries()) {
    nonempty(config.identity, `opaque_configs[${index}].identity`);
    if (typeof config.exists !== "boolean") fail(`opaque_configs[${index}].exists must be boolean`);
    if (!HEX_64.test(config.sha256)) fail(`opaque_configs[${index}].sha256 is invalid`);
  }
  return surfaces;
}

function validateArtifactEvidence(value, label, { expectedKind = null } = {}) {
  const artifact = exactObject(value, label, ARTIFACT_KEYS);
  nonempty(artifact.kind, `${label}.kind`);
  if (expectedKind !== null && artifact.kind !== expectedKind) fail(`${label}.kind must equal ${expectedKind}`);
  if (typeof artifact.exists !== "boolean") fail(`${label}.exists must be boolean`);
  for (const key of ["device", "inode"]) identityInteger(artifact[key], `${label}.${key}`);
  for (const key of ["owner_uid", "mode"]) integer(artifact[key], `${label}.${key}`);
  identityInteger(artifact.size, `${label}.size`);
  strictTimestamp(artifact.mtime, `${label}.mtime`);
  if (!HEX_64.test(artifact.sha256)) fail(`${label}.sha256 has an invalid format`);
  if (!artifact.exists) {
    const expectedDigest = sha256Jcs({ kind: artifact.kind, exists: false });
    if (artifact.device !== "0" || artifact.inode !== "0" || artifact.owner_uid !== 0
      || artifact.mode !== 0 || ![0, "0"].includes(artifact.size)
      || artifact.mtime !== "1970-01-01T00:00:00.000Z" || artifact.sha256 !== expectedDigest) {
      fail(`${label} absent sentinel fields are inconsistent`);
    }
  }
  return artifact;
}

export function validateProductionInventory(value) {
  const inventory = exactObject(value, "inventory", [...INVENTORY_UNSIGNED_KEYS, "inventory_digest"]);
  const { inventory_digest: digest, ...unsigned } = inventory;
  if (inventory.schema !== INVENTORY_SCHEMA || inventory.canonicalization !== "RFC8785-JCS+SHA256" || inventory.repository !== "netsus/homecook") fail("inventory authority identity mismatch");
  strictTimestamp(inventory.captured_at, "captured_at");
  if (inventory.surface_allowlist_version !== "homecook-production-surface-v1") fail("surface allowlist version mismatch");
  validateTool(inventory.probe_identity);
  const statuses = exactObject(inventory.probe_statuses, "probe_statuses", PROBE_NAMES);
  for (const name of PROBE_NAMES) {
    const status = exactObject(statuses[name], `probe_statuses.${name}`, PROBE_STATUS_KEYS);
    if (!['success', 'failed', 'skipped'].includes(status.status)) fail(`probe_statuses.${name}.status is invalid`);
    if (status.reason_code !== null) nonempty(status.reason_code, `probe_statuses.${name}.reason_code`);
    integer(status.evidence_count, `probe_statuses.${name}.evidence_count`);
  }
  if (statuses.active_promotion_lock.status === "success" && statuses.active_promotion_lock.evidence_count !== 1) {
    fail("active promotion lock successful probe must contain exactly one evidence object");
  }
  if (!Array.isArray(inventory.tool_identities)) fail("tool_identities must be an array");
  inventory.tool_identities.forEach((tool, index) => {
    const named = exactObject(tool, `tool_identities[${index}]`, NAMED_TOOL_KEYS);
    nonempty(named.name, `tool_identities[${index}].name`);
    const identity = Object.fromEntries(TOOL_KEYS.map((key) => [key, named[key]]));
    validateTool(identity);
  });
  if (new Set(inventory.tool_identities.map((tool) => tool.name)).size !== inventory.tool_identities.length) fail("tool identity names must be unique");
  const toolNames = inventory.tool_identities.map((tool) => tool.name).sort();
  if (inventory.probe_statuses.tool_identities.status === "success"
    && JSON.stringify(toolNames) !== JSON.stringify(REQUIRED_TOOL_NAMES)) {
    fail("successful tool identity probe requires the exact trusted tool set");
  }
  if (inventory.production_db_connection_count !== 0) fail("production DB connection count must be 0");
  if (inventory.mutation_attempt_count !== 0) fail("mutation attempt count must be 0");
  integer(inventory.redacted_field_count, "redacted_field_count");
  const surfaces = validateSurfaces(inventory.surfaces);
  if (sha256Jcs(surfaces) !== inventory.surface_digest) fail("surface digest mismatch");
  if (!HEX_64.test(digest) || sha256Jcs(unsigned) !== digest) fail("inventory digest mismatch");
  return inventory;
}

export async function collectReadOnlyProductionInventory({
  adapters,
  capturedAt = new Date().toISOString(),
  probeIdentity,
  approvedMigrationMarker = false,
}) {
  if (!adapters || typeof adapters !== "object") fail("read-only adapters are required");
  const required = ["readReleaseArtifacts", "readActivePromotionLock", "readWorkloads", "readLaunchd", "readDocker", "readPortListeners", "readOpaqueConfigIdentities"];
  for (const key of required) if (typeof adapters[key] !== "function") fail(`missing read-only adapter ${key}`);
  async function probe(name, operation, fallback, evidenceCount) {
    try {
      const value = await operation();
      return { value, status: { status: "success", reason_code: null, evidence_count: evidenceCount(value) } };
    } catch {
      return { value: fallback, status: { status: "failed", reason_code: `${name}_probe_failed`, evidence_count: 0 } };
    }
  }
  const [releaseProbe, activeLockProbe, workloadsProbe, launchdProbe, dockerProbe, portsProbe, configsProbe, toolsProbe] = await Promise.all([
    probe("release_artifacts", () => adapters.readReleaseArtifacts(), [], (value) => value.length),
    probe("active_promotion_lock", () => adapters.readActivePromotionLock(), artifactEvidence("active_promotion_lock", "/path/that/does/not/exist"), () => 1),
    probe("workloads", () => adapters.readWorkloads(), [], (value) => value.length),
    probe("launchd", () => adapters.readLaunchd(), [], (value) => value.length),
    probe("docker", () => adapters.readDocker(), { containers: [], networks: [], volumes: [] }, (value) => value.containers.length + value.networks.length + value.volumes.length),
    probe("port_listeners", () => adapters.readPortListeners(), [], (value) => value.length),
    probe("opaque_configs", () => adapters.readOpaqueConfigIdentities(), [], (value) => value.length),
    probe("tool_identities", () => adapters.readToolIdentities?.() ?? [], [], (value) => value.length),
  ]);
  const migrationProbe = approvedMigrationMarker
    ? await probe("migration", () => adapters.readMigrationMarker?.(), { approved: false, marker_digest: null, global_ledger_digest: null, migration_head: null, catalog_head: null }, (value) => value?.approved ? 1 : 0)
    : { value: { approved: false, marker_digest: null, global_ledger_digest: null, migration_head: null, catalog_head: null }, status: { status: "skipped", reason_code: "migration_probe_not_approved", evidence_count: 0 } };
  const release = releaseProbe.value;
  const workloads = workloadsProbe.value;
  const launchd = launchdProbe.value;
  const dockerRaw = dockerProbe.value;
  const ports = portsProbe.value;
  const configs = configsProbe.value;
  const tools = toolsProbe.value;
  const collectedToolNames = tools.map((tool) => tool.name).sort();
  if (toolsProbe.status.status === "success"
    && JSON.stringify(collectedToolNames) !== JSON.stringify(REQUIRED_TOOL_NAMES)) {
    toolsProbe.status = { status: "failed", reason_code: "required_tool_identity_missing", evidence_count: tools.length };
  }
  const migrationRaw = migrationProbe.value;
  const counter = { count: 0 };
  const docker = project(dockerRaw, ["containers", "networks", "volumes"], counter);
  const surfaces = {
    release_artifacts: projectedArray(release, ARTIFACT_KEYS, counter, "kind"),
    active_promotion_lock: project(activeLockProbe.value, ARTIFACT_KEYS, counter),
    workloads: projectedArray(workloads, WORKLOAD_KEYS, counter, "component"),
    launchd: projectedArray(launchd, LAUNCHD_KEYS, counter, "label"),
    docker: {
      containers: projectedArray(docker.containers, CONTAINER_KEYS, counter, "id"),
      networks: projectedArray(docker.networks, NETWORK_KEYS, counter, "id"),
      volumes: projectedArray(docker.volumes, VOLUME_KEYS, counter, "name"),
    },
    port_listeners: projectedArray(ports, PORT_KEYS, counter, "port"),
    opaque_configs: projectedArray(configs, CONFIG_KEYS, counter, "identity"),
    migration: project(migrationRaw ?? {}, MIGRATION_KEYS, counter),
    prepared_identity: null,
  };
  const unsigned = {
    schema: INVENTORY_SCHEMA,
    canonicalization: "RFC8785-JCS+SHA256",
    repository: "netsus/homecook",
    captured_at: capturedAt,
    surface_allowlist_version: "homecook-production-surface-v1",
    probe_identity: probeIdentity,
    tool_identities: projectedArray(tools, NAMED_TOOL_KEYS, counter, "name"),
    probe_statuses: {
      release_artifacts: releaseProbe.status,
      active_promotion_lock: activeLockProbe.status,
      workloads: workloadsProbe.status,
      launchd: launchdProbe.status,
      docker: dockerProbe.status,
      port_listeners: portsProbe.status,
      opaque_configs: configsProbe.status,
      migration: migrationProbe.status,
      tool_identities: toolsProbe.status,
    },
    production_db_connection_count: 0,
    mutation_attempt_count: 0,
    redacted_field_count: counter.count,
    surfaces,
    surface_digest: sha256Jcs(surfaces),
  };
  return validateProductionInventory({ ...unsigned, inventory_digest: sha256Jcs(unsigned) });
}

export function createProductionSurfaceSnapshot(inventory, { capturedAt = new Date().toISOString() } = {}) {
  validateProductionInventory(inventory);
  const surfaces = inventory.surfaces;
  const requiredInvariantPlists = [
    "launch_agent_plist:com.homecook.production",
    "launch_agent_plist:com.homecook.youtube-extraction-worker",
  ];
  const requiredFullLocalPlists = [
    `launch_agent_plist:${CANONICAL_FULL_LOCAL_LAUNCHD_LABEL}`,
    `launch_agent_plist:${LEGACY_FULL_LOCAL_LAUNCHD_LABEL}`,
  ];
  const artifactMap = new Map(surfaces.release_artifacts.map((entry) => [entry.kind, entry]));
  const presentArtifacts = new Set(surfaces.release_artifacts.filter((entry) => entry.exists).map((entry) => entry.kind));
  const componentSet = new Set(surfaces.workloads.map((entry) => entry.component));
  const launchdLabels = new Set(surfaces.launchd.map((entry) => entry.label));
  const requiredLaunchdLabels = [
    "com.homecook.production",
    CANONICAL_FULL_LOCAL_LAUNCHD_LABEL,
    LEGACY_FULL_LOCAL_LAUNCHD_LABEL,
    "com.homecook.youtube-extraction-worker",
  ];
  const configIdentities = new Set(surfaces.opaque_configs.map((entry) => entry.identity));
  const toolNames = inventory.tool_identities.map((tool) => tool.name).sort();
  const complete = PROBE_NAMES.every((name) => inventory.probe_statuses[name].status === "success")
    && JSON.stringify(toolNames) === JSON.stringify(REQUIRED_TOOL_NAMES)
    && artifactMap.has("release_root") && artifactMap.has("current_descriptor") && artifactMap.has("previous_descriptor")
    && requiredInvariantPlists.every((kind) => presentArtifacts.has(kind))
    && requiredFullLocalPlists.every((kind) => artifactMap.has(kind))
    && surfaces.launchd.length === requiredLaunchdLabels.length && launchdLabels.size === requiredLaunchdLabels.length
    && requiredLaunchdLabels.every((label) => launchdLabels.has(label))
    && surfaces.docker.containers.length > 0 && surfaces.docker.networks.length > 0 && surfaces.docker.volumes.length > 0
    && surfaces.port_listeners.length > 0 && surfaces.opaque_configs.length === 2
    && configIdentities.has("production-env") && configIdentities.has("full-local-config")
    && surfaces.migration.approved && surfaces.migration.global_ledger_digest
    && surfaces.migration.migration_head === surfaces.migration.catalog_head
    && surfaces.workloads.length === 3 && componentSet.size === 3
    && ["app", "full_local", "worker"].every((component) => componentSet.has(component));
  if (!complete) fail("production surface snapshot required evidence is incomplete");
  const unsigned = {
    schema: PRODUCTION_SURFACE_SNAPSHOT_SCHEMA,
    captured_at: capturedAt,
    surface_allowlist_version: inventory.surface_allowlist_version,
    surface_digest: inventory.surface_digest,
    production_db_connection_count: 0,
    mutation_attempt_count: 0,
  };
  return Object.freeze({ ...unsigned, snapshot_digest: sha256Jcs(unsigned) });
}

export function readCanonicalInventoryFile(path, options) {
  const source = readPrivateCanonicalJsonFile(path, options);
  let parsed;
  try {
    parsed = parseCanonicalJcs(source);
  } catch {
    throw new Error("Production inventory rejected: input is not canonical RFC8785 JCS.");
  }
  return validateProductionInventory(parsed);
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.uid === right.uid
    && left.mode === right.mode && left.size === right.size
    && left.ctimeNs === right.ctimeNs && left.mtimeNs === right.mtimeNs;
}

function readOpaqueRegularFile(path, label, { allowHardLinks = false, afterRead = () => {} } = {}) {
  const before = lstatSync(path, { bigint: true });
  const uid = BigInt(process.getuid?.());
  if (!before.isFile() || before.isSymbolicLink() || ![0n, uid].includes(before.uid)
    || (before.mode & 0o022n) !== 0n || (!allowHardLinks && before.nlink !== 1n)) {
    fail(`${label} must be a trusted non-linked regular file`);
  }
  const descriptor = openSync(path, FS_CONSTANTS.O_RDONLY | (FS_CONSTANTS.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameFileIdentity(before, opened)) fail(`${label} identity changed before read`);
    const bytes = readFileSync(descriptor);
    afterRead();
    const after = lstatSync(path, { bigint: true });
    if (!sameFileIdentity(opened, after)) fail(`${label} identity changed during read`);
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function captureTrustedAncestorChain(basePath, targetParent, label) {
  const base = resolve(basePath);
  const target = resolve(targetParent);
  const targetRelative = relative(base, target);
  if (targetRelative.startsWith("..") || isAbsolute(targetRelative)) fail(`${label} escapes its trusted base`);
  const paths = [base];
  if (targetRelative) {
    let current = base;
    for (const segment of targetRelative.split("/")) {
      current = join(current, segment);
      paths.push(current);
    }
  }
  const uid = BigInt(process.getuid?.());
  return paths.map((path) => {
    let stats;
    try {
      stats = lstatSync(path, { bigint: true });
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") return { path, absent: true };
      throw error;
    }
    if (stats.isSymbolicLink() || !stats.isDirectory() || stats.uid !== uid
      || (stats.mode & 0o022n) !== 0n || (stats.mode & 0o111n) === 0n
      || realpathSync(path) !== path) {
      fail(`${label} ancestor trust verification failed`);
    }
    return { path, absent: false, stats };
  });
}

export function withTrustedProductionAncestors(chains, operation) {
  const snapshots = chains.flatMap(({ base, target, label }) => captureTrustedAncestorChain(base, dirname(target), label));
  const value = operation();
  for (const snapshot of snapshots) {
    if (snapshot.absent) {
      try {
        lstatSync(snapshot.path, { bigint: true });
        fail("trusted production ancestor was created during probe");
      } catch (error) {
        if (error && typeof error === "object" && error.code === "ENOENT") continue;
        throw error;
      }
    }
    const after = lstatSync(snapshot.path, { bigint: true });
    if (!sameFileIdentity(snapshot.stats, after) || realpathSync(snapshot.path) !== snapshot.path) {
      fail("trusted production ancestor changed during probe");
    }
  }
  return value;
}

const withTrustedAncestorChains = withTrustedProductionAncestors;

function bigintMetadata(stats, relativePath, type) {
  return {
    path: relativePath,
    type,
    device: stats.dev.toString(),
    inode: stats.ino.toString(),
    nlink: stats.nlink.toString(),
    uid: stats.uid.toString(),
    gid: stats.gid.toString(),
    mode: Number(stats.mode & 0o7777n),
    size: stats.size.toString(),
    ctime_ns: stats.ctimeNs.toString(),
    mtime_ns: stats.mtimeNs.toString(),
  };
}

function containedRelative(root, target) {
  const candidate = relative(root, target);
  if (candidate === "" || (!candidate.startsWith("..") && !isAbsolute(candidate))) return candidate || ".";
  fail("recursive production tree symlink target escapes containment");
}

export function createProductionSurfaceBudget({
  maxEntries = DEFAULT_SURFACE_MAX_ENTRIES,
  maxBytes = DEFAULT_SURFACE_MAX_BYTES,
} = {}) {
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1
    || !Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    fail("production surface aggregate bounds are invalid");
  }
  return {
    maxEntries: BigInt(maxEntries),
    maxBytes: BigInt(maxBytes),
    entries: 0n,
    bytes: 0n,
    seenEntries: new Set(),
    fileDigests: new Map(),
    directoryNames: new Map(),
  };
}

function assertProductionSurfaceBudget(value) {
  if (!value || typeof value !== "object"
    || typeof value.maxEntries !== "bigint" || typeof value.maxBytes !== "bigint"
    || typeof value.entries !== "bigint" || typeof value.bytes !== "bigint"
    || !(value.seenEntries instanceof Set) || !(value.fileDigests instanceof Map)
    || !(value.directoryNames instanceof Map)
    || value.maxEntries < 1n || value.maxEntries > BigInt(Number.MAX_SAFE_INTEGER)
    || value.maxBytes < 0n || value.maxBytes > BigInt(Number.MAX_SAFE_INTEGER)
    || value.entries < 0n || value.entries > value.maxEntries
    || value.bytes < 0n || value.bytes > value.maxBytes) {
    fail("production surface aggregate budget is invalid");
  }
  return value;
}

function budgetIdentity(stats, type) {
  return [
    type,
    stats.dev,
    stats.ino,
    stats.nlink,
    stats.uid,
    stats.gid,
    stats.mode,
    stats.size,
    stats.ctimeNs,
    stats.mtimeNs,
  ].join(":");
}

function consumeProductionSurfaceBudget(budgetInput, stats, type, byteSize = 0n) {
  const budget = assertProductionSurfaceBudget(budgetInput);
  const identity = budgetIdentity(stats, type);
  if (budget.seenEntries.has(identity)) return { first: false, identity };
  if (budget.entries + 1n > budget.maxEntries) fail("production surface aggregate entry limit exceeded");
  if (budget.bytes + byteSize > budget.maxBytes) fail("production surface aggregate byte limit exceeded");
  budget.entries += 1n;
  budget.bytes += byteSize;
  budget.seenEntries.add(identity);
  return { first: true, identity };
}

function readBoundedDirectoryNames(path, maxEntries) {
  const names = [];
  const directory = opendirSync(path);
  try {
    let entry;
    while ((entry = directory.readSync()) !== null) {
      if (names.length >= maxEntries) fail("production surface aggregate entry limit exceeded");
      names.push(entry.name);
    }
  } finally {
    directory.closeSync();
  }
  return names.sort();
}

function readBudgetedDirectoryNames(path, budgetInput) {
  const budget = assertProductionSurfaceBudget(budgetInput);
  const before = lstatSync(path, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink()) fail("production surface directory identity is invalid");
  const consumed = consumeProductionSurfaceBudget(budget, before, "directory");
  const cached = budget.directoryNames.get(consumed.identity);
  if (cached !== undefined) return cached;
  const remaining = Number(budget.maxEntries - budget.entries);
  const names = Object.freeze(readBoundedDirectoryNames(path, remaining));
  const after = lstatSync(path, { bigint: true });
  if (!sameFileIdentity(before, after)) fail("production surface directory changed during bounded read");
  budget.directoryNames.set(consumed.identity, names);
  return names;
}

export function digestProductionTree(rootPath, {
  maxEntries = DEFAULT_SURFACE_MAX_ENTRIES,
  maxDepth = 64,
  maxBytes = DEFAULT_SURFACE_MAX_BYTES,
  surfaceBudget = null,
} = {}) {
  const canonicalRoot = realpathSync(rootPath);
  const budget = surfaceBudget ?? createProductionSurfaceBudget({ maxEntries, maxBytes });
  assertProductionSurfaceBudget(budget);
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0) {
    fail("recursive production tree bounds are invalid");
  }
  const active = new Set();

  function digestNode(path, relativePath, depth) {
    if (depth > maxDepth) fail("recursive production tree depth limit exceeded");
    const before = lstatSync(path, { bigint: true });

    if (before.isSymbolicLink()) {
      consumeProductionSurfaceBudget(budget, before, "symlink");
      const target = readlinkSync(path);
      if (isAbsolute(target)) fail("recursive production tree absolute symlink is forbidden");
      const targetRealpath = realpathSync(resolve(dirname(path), target));
      const targetRelative = containedRelative(canonicalRoot, targetRealpath);
      if (active.has(targetRealpath)) fail("recursive production tree symlink cycle detected");
      const targetDigest = digestNode(targetRealpath, targetRelative, depth + 1);
      const after = lstatSync(path, { bigint: true });
      if (!sameFileIdentity(before, after) || readlinkSync(path) !== target) fail("recursive production tree symlink drift detected");
      return sha256Jcs({
        ...bigintMetadata(before, relativePath, "symlink"),
        target,
        target_relative: targetRelative,
        target_digest: targetDigest,
      });
    }

    const canonical = realpathSync(path);
    containedRelative(canonicalRoot, canonical);
    if (active.has(canonical)) fail("recursive production tree cycle detected");
    active.add(canonical);
    try {
      if (before.isFile()) {
        if (before.nlink !== 1n) fail("recursive production tree hard-linked file is forbidden");
        const consumed = consumeProductionSurfaceBudget(budget, before, "file", before.size);
        const cachedDigest = budget.fileDigests.get(consumed.identity);
        const contentDigest = cachedDigest ?? sha256Bytes(readOpaqueRegularFile(path, "recursive production tree file"));
        if (cachedDigest === undefined) budget.fileDigests.set(consumed.identity, contentDigest);
        const after = lstatSync(path, { bigint: true });
        if (!sameFileIdentity(before, after)) fail("recursive production tree file drift detected");
        return sha256Jcs({
          ...bigintMetadata(before, relativePath, "file"),
          content_sha256: contentDigest,
        });
      }
      if (before.isDirectory()) {
        const names = readBudgetedDirectoryNames(path, budget);
        const children = names.map((name) => ({
          name,
          digest: digestNode(join(path, name), relativePath === "." ? name : `${relativePath}/${name}`, depth + 1),
        }));
        const after = lstatSync(path, { bigint: true });
        if (!sameFileIdentity(before, after)) fail("recursive production tree directory drift detected");
        return sha256Jcs({ ...bigintMetadata(before, relativePath, "directory"), children });
      }
      fail("recursive production tree contains an unsupported entry type");
    } finally {
      active.delete(canonical);
    }
  }

  return digestNode(canonicalRoot, ".", 0);
}

function directoryMetadataDigest(stats) {
  return sha256Jcs({
    authority_mode: "metadata-only",
    ...bigintMetadata(stats, ".", "directory"),
  });
}

function absentArtifactEvidence(kind) {
  return {
    kind,
    exists: false,
    device: "0",
    inode: "0",
    owner_uid: 0,
    mode: 0,
    size: 0,
    mtime: "1970-01-01T00:00:00.000Z",
    sha256: sha256Jcs({ kind, exists: false }),
  };
}

/**
 * @param {string} kind
 * @param {string} path
 * @param {{afterAbsentCheck?:Function, directoryIdentityOnly?:boolean, maxFileBytes?:number, surfaceBudget?:any, treeLimits?:{maxEntries?:number, maxDepth?:number, maxBytes?:number}}} [options]
 */
export function readProductionArtifactTarget(kind, path, {
  afterAbsentCheck = () => {},
  directoryIdentityOnly = false,
  maxFileBytes = DEFAULT_SURFACE_MAX_BYTES,
  surfaceBudget = null,
  treeLimits = undefined,
} = {}) {
  let stats;
  try {
    stats = lstatSync(path, { bigint: true });
  } catch (error) {
    if (!(error && typeof error === "object" && error.code === "ENOENT")) throw error;
    afterAbsentCheck();
    let stillAbsent = false;
    try {
      lstatSync(path, { bigint: true });
    } catch (afterError) {
      if (afterError && typeof afterError === "object" && afterError.code === "ENOENT") stillAbsent = true;
      else throw afterError;
    }
    if (!stillAbsent) fail(`production ${kind} target was created after absence check`);
    return absentArtifactEvidence(kind);
  }
  const uid = BigInt(process.getuid?.());
  if (stats.isSymbolicLink()) fail(`production ${kind} target must not be a symlink`);
  if ((!stats.isFile() && !stats.isDirectory()) || stats.uid !== uid || (stats.mode & 0o022n) !== 0n) {
    fail(`production ${kind} target has unsafe type, owner, or mode`);
  }
  if (stats.isDirectory() && (stats.mode & 0o100n) === 0n) fail(`production ${kind} directory target is not traversable`);
  const budget = surfaceBudget ?? createProductionSurfaceBudget({
    maxEntries: treeLimits?.maxEntries ?? DEFAULT_SURFACE_MAX_ENTRIES,
    maxBytes: treeLimits?.maxBytes ?? DEFAULT_SURFACE_MAX_BYTES,
  });
  let digest;
  if (stats.isFile()) {
    if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 0 || stats.size > BigInt(maxFileBytes)) {
      fail(`production ${kind} file byte limit exceeded`);
    }
    const consumed = consumeProductionSurfaceBudget(budget, stats, "file", stats.size);
    const cachedDigest = budget.fileDigests.get(consumed.identity);
    digest = cachedDigest ?? sha256Bytes(readOpaqueRegularFile(path, `production ${kind}`));
    if (cachedDigest === undefined) budget.fileDigests.set(consumed.identity, digest);
  } else if (stats.isDirectory()) {
    if (directoryIdentityOnly) {
      consumeProductionSurfaceBudget(budget, stats, "directory");
      digest = directoryMetadataDigest(stats);
    } else {
      digest = digestProductionTree(path, { ...treeLimits, surfaceBudget: budget });
    }
  } else {
    fail(`production ${kind} path must be a regular file or directory`);
  }
  const after = lstatSync(path, { bigint: true });
  if (!sameFileIdentity(stats, after)) fail(`production ${kind} target changed during probe`);
  return {
    kind,
    exists: true,
    device: String(stats.dev),
    inode: String(stats.ino),
    owner_uid: Number(stats.uid),
    mode: Number(stats.mode & 0o7777n),
    size: stats.size.toString(),
    mtime: new Date(Number(stats.mtimeMs)).toISOString(),
    sha256: digest,
  };
}

const artifactEvidence = readProductionArtifactTarget;

/**
 * @param {string} path
 * @param {{homeDir:string, rootDir:string, afterRead?:Function}} options
 */
export function readProductionEnvironmentAuthority(path, {
  homeDir,
  rootDir,
  afterRead = () => {},
} = {}) {
  try {
    if (!isAbsolute(path ?? "") || !isAbsolute(homeDir ?? "") || !isAbsolute(rootDir ?? "")) {
      fail("explicit production env authority paths must be absolute");
    }
    const canonicalHome = realpathSync(resolve(homeDir));
    const canonicalRoot = realpathSync(resolve(rootDir));
    const authorityPath = resolve(path);
    const sourceRelative = relative(canonicalRoot, authorityPath);
    if (sourceRelative === "" || (!sourceRelative.startsWith("..") && !isAbsolute(sourceRelative))) {
      fail("explicit production env authority must remain outside the clean source root");
    }
    return withTrustedAncestorChains([
      { base: canonicalHome, target: authorityPath, label: "explicit production env authority" },
    ], () => {
      const before = lstatSync(authorityPath, { bigint: true });
      const currentUid = BigInt(process.getuid?.());
      if (!before.isFile() || before.isSymbolicLink() || before.uid !== currentUid
        || before.nlink !== 1n || Number(before.mode & 0o7777n) !== 0o600
        || before.size > 1024n * 1024n) {
        fail("explicit production env authority identity is unsafe");
      }
      const bytes = readOpaqueRegularFile(authorityPath, "explicit production env authority", { afterRead });
      let source;
      try {
        source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        fail("explicit production env authority encoding is invalid");
      }
      const matches = source.split(/\r?\n/u)
        .map((line) => /^FULL_LOCAL_COMPOSE_PROJECT_NAME=([A-Za-z0-9][A-Za-z0-9_.-]*)$/u.exec(line))
        .filter(Boolean);
      if (matches.length !== 1) fail("explicit production env authority has ambiguous Docker project identity");
      return Object.freeze({
        identityDigest: sha256Jcs({
          device: String(before.dev),
          inode: String(before.ino),
          mode: Number(before.mode & 0o7777n),
          owner_uid: Number(before.uid),
          size: String(before.size),
          ctime_ns: String(before.ctimeNs),
          mtime_ns: String(before.mtimeNs),
        }),
        productionDockerProject: matches[0][1],
        sha256: sha256Bytes(bytes),
      });
    });
  } catch {
    fail("explicit production env authority validation failed");
  }
}

function readOptionalProductionDescriptor(path) {
  let bytes;
  try {
    bytes = readOpaqueRegularFile(path, "production descriptor");
  } catch (error) {
    if (!(error && typeof error === "object" && error.code === "ENOENT")) throw error;
    try {
      lstatSync(path, { bigint: true });
      fail("production descriptor appeared after absence check");
    } catch (afterError) {
      if (!(afterError && typeof afterError === "object" && afterError.code === "ENOENT")) throw afterError;
    }
    return { digest: null, exists: false, value: null };
  }
  let value = null;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    // Malformed descriptor bytes remain observable but cannot provide workload claims.
  }
  return { digest: sha256Bytes(bytes), exists: true, value };
}

async function readOnlyCommandResult(commandRunner, command, args) {
  const result = await commandRunner(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" },
    maxBuffer: 4 * 1024 * 1024,
    timeout: 10_000,
  });
  const stdout = String(result.stdout ?? "");
  const stderr = String(result.stderr ?? "");
  if (result.error || result.signal || !Number.isInteger(result.status)) {
    throw new Error("read-only inventory command did not terminate normally");
  }
  return { status: result.status, stdout, stderr };
}

async function commandOutput(commandRunner, command, args, { absentExit = null } = {}) {
  const { status, stdout, stderr } = await readOnlyCommandResult(commandRunner, command, args);
  if (status !== 0) {
    if (absentExit === "lsof-no-listener" && status === 1 && stdout === "" && stderr === "") return "";
    throw new Error("read-only inventory command failed");
  }
  return stdout;
}

async function readLaunchdJob(commandRunner, launchctlBin, uid, label) {
  const { status, stdout, stderr } = await readOnlyCommandResult(
    commandRunner,
    launchctlBin,
    ["print", `gui/${uid}/${label}`],
  );
  if (status === 113 && stdout === "") {
    const missingMessage = `Could not find service \"${label}\" in domain for user gui: ${uid}`;
    const allowed = new Set([
      missingMessage,
      `${missingMessage}\n`,
      `Bad request.\n${missingMessage}`,
      `Bad request.\n${missingMessage}\n`,
    ]);
    if (allowed.has(stderr)) {
      const projection = { label, loaded: false, state: "missing", pid: null };
      return { ...projection, projection_digest: sha256Jcs(projection) };
    }
  }
  if (status !== 0 || stdout === "" || stderr !== "") {
    throw new Error("read-only launchd inventory command failed");
  }
  const state = /^\s*state = (.+)$/mu.exec(stdout)?.[1]?.trim() ?? "unknown";
  const pidText = /^\s*pid = (\d+)$/mu.exec(stdout)?.[1];
  const projection = { label, loaded: true, state, pid: pidText ? Number(pidText) : null };
  return { ...projection, projection_digest: sha256Jcs(projection) };
}

function parseDelimitedLines(source, fieldNames) {
  return source.split(/\r?\n/u).filter(Boolean).map((line) => {
    const fields = line.split("\t");
    return Object.fromEntries(fieldNames.map((name, index) => [name, fields[index] ?? ""]));
  });
}

function opaqueConfigIdentity(identity, path) {
  if (!existsSync(path)) return { identity, exists: false, sha256: sha256Jcs({ identity, exists: false }) };
  const stats = lstatSync(path, { bigint: true });
  if (!stats.isFile() || stats.isSymbolicLink()) fail(`opaque config ${identity} must be a regular file`);
  return { identity, exists: true, sha256: sha256Bytes(readOpaqueRegularFile(path, `opaque config ${identity}`)) };
}

function executableIdentity(name, path, version = "system") {
  const canonical = realpathSync(path);
  const stats = lstatSync(canonical, { bigint: true });
  const uid = BigInt(process.getuid?.());
  if (!stats.isFile() || ![0n, uid].includes(stats.uid) || (stats.mode & 0o111n) === 0n || (stats.mode & 0o022n) !== 0n) {
    fail(`read-only tool ${name} failed trusted owner/mode verification`);
  }
  return {
    name,
    version,
    realpath: canonical,
    device: String(stats.dev),
    inode: String(stats.ino),
    mode: Number(stats.mode & 0o7777n),
    ctime: new Date(Number(stats.ctimeMs)).toISOString(),
    size: stats.size.toString(),
    sha256: sha256Bytes(readOpaqueRegularFile(canonical, `read-only tool ${name}`, { allowHardLinks: true })),
  };
}

/** @param {Record<string, any>} [options] */
export function createLocalProductionInventoryAdapters(options = {}) {
  const {
    homeDir = process.env.HOME ?? "",
    rootDir = process.cwd(),
    approvedMigrationMarkerPath = null,
    productionEnvAuthorityPath = null,
    releaseArtifactSurfaceLimits = {},
    dockerBin: dockerBinOption = null,
    commandRunner = spawnSync,
    trustedToolPaths = {},
  } = options;
  const canonicalHome = realpathSync(resolve(homeDir));
  const canonicalRoot = realpathSync(resolve(rootDir));
  const releaseRoot = join(canonicalHome, ".homecook", "releases");
  const canonicalReleasePaths = getLocalMacProductionReleasePaths(canonicalHome);
  const currentPath = join(releaseRoot, "current.json");
  const previousPath = join(releaseRoot, "previous.json");
  const lockRoot = join(releaseRoot, "promotion-locks");
  const snapshotRoot = join(releaseRoot, "execution-snapshots");
  const canonicalFullLocalPlistPath = join(canonicalHome, "Library", "LaunchAgents", `${CANONICAL_FULL_LOCAL_LAUNCHD_LABEL}.plist`);
  const legacyFullLocalPlistPath = join(canonicalHome, "Library", "LaunchAgents", `${LEGACY_FULL_LOCAL_LAUNCHD_LABEL}.plist`);
  const gitBin = trustedToolPaths.git ?? resolveTrustedGitExecutable();
  const launchctlBin = trustedToolPaths.launchctl ?? "/bin/launchctl";
  const lsofBin = trustedToolPaths.lsof ?? "/usr/sbin/lsof";
  let productionDockerAuthority = null;
  function resolveProductionDockerContext() {
    if (productionEnvAuthorityPath === null) {
      return { dockerBin: null, productionDockerProject: null, configDigest: null };
    }
    const authority = readProductionEnvironmentAuthority(productionEnvAuthorityPath, {
      homeDir: canonicalHome,
      rootDir: canonicalRoot,
    });
    if (productionDockerAuthority !== null
      && productionDockerAuthority.identityDigest !== authority.identityDigest) {
      fail("explicit production env authority changed between read-only probes");
    }
    productionDockerAuthority ??= authority;
    return {
      dockerBin: dockerBinOption ?? resolveTrustedDockerBinary(),
      productionDockerProject: productionDockerAuthority.productionDockerProject,
      configDigest: productionDockerAuthority.sha256,
    };
  }
  function readAuthorityChildren(root, prefix, surfaceBudget) {
    return withTrustedAncestorChains([
      { base: canonicalHome, target: join(root, ".authority-child-probe"), label: `${prefix} root` },
    ], () => {
      try {
        const rootEvidence = artifactEvidence(`${prefix}_root`, root, {
          directoryIdentityOnly: true,
          surfaceBudget,
        });
        if (!rootEvidence.exists) return [];
      } catch (error) {
        if (error && typeof error === "object" && error.code === "ENOENT") return [];
        throw error;
      }
      const names = readBudgetedDirectoryNames(root, surfaceBudget);
      return names.map((name) => artifactEvidence(`${prefix}:${sha256Jcs(name)}`, join(root, name), {
        surfaceBudget,
      }));
    });
  }

  return Object.freeze({
    async readActivePromotionLock() {
      return withTrustedAncestorChains([
        { base: canonicalHome, target: canonicalReleasePaths.lockPath, label: "canonical promotion lock" },
      ], () => artifactEvidence("active_promotion_lock", canonicalReleasePaths.lockPath));
    },
    async readReleaseArtifacts() {
      const plistRoot = join(canonicalHome, "Library", "LaunchAgents");
      const surfaceBudget = createProductionSurfaceBudget(releaseArtifactSurfaceLimits);
      return withTrustedAncestorChains([
        { base: canonicalHome, target: join(releaseRoot, ".ancestor-probe"), label: "release root" },
        { base: canonicalHome, target: join(plistRoot, ".ancestor-probe"), label: "LaunchAgent root" },
      ], () => {
        const entries = [
          artifactEvidence("release_root", releaseRoot, { directoryIdentityOnly: true, surfaceBudget }),
          artifactEvidence("current_descriptor", currentPath, { surfaceBudget }),
          artifactEvidence("previous_descriptor", previousPath, { surfaceBudget }),
          artifactEvidence("launch_agent_plist:com.homecook.production", join(plistRoot, "com.homecook.production.plist"), { surfaceBudget }),
          artifactEvidence("launch_agent_plist:com.homecook.youtube-extraction-worker", join(plistRoot, "com.homecook.youtube-extraction-worker.plist"), { surfaceBudget }),
        ];
        const fullLocal = withTrustedAncestorChains([
          { base: canonicalHome, target: canonicalFullLocalPlistPath, label: "canonical full-local LaunchAgent" },
          { base: canonicalHome, target: legacyFullLocalPlistPath, label: "legacy full-local LaunchAgent" },
        ], () => ({
          canonical: artifactEvidence(`launch_agent_plist:${CANONICAL_FULL_LOCAL_LAUNCHD_LABEL}`, canonicalFullLocalPlistPath, { surfaceBudget }),
          legacy: artifactEvidence(`launch_agent_plist:${LEGACY_FULL_LOCAL_LAUNCHD_LABEL}`, legacyFullLocalPlistPath, { surfaceBudget }),
        }));
        entries.push(fullLocal.canonical, fullLocal.legacy);
        entries.push(...readAuthorityChildren(lockRoot, "recovered_lock", surfaceBudget));
        entries.push(...readAuthorityChildren(snapshotRoot, "sealed_snapshot", surfaceBudget));
        return entries;
      });
    },
    async readWorkloads() {
      return withTrustedAncestorChains([
        { base: canonicalHome, target: currentPath, label: "current descriptor" },
      ], () => {
        const descriptorAuthority = readOptionalProductionDescriptor(currentPath);
        const descriptor = descriptorAuthority.value;
        const componentNames = ["app", "full_local", "worker"];
        return componentNames.map((component) => {
          const componentState = descriptor?.[component] ?? descriptor?.components?.[component] ?? descriptor;
          return {
            component,
            release_sha: typeof componentState?.release_sha === "string" ? componentState.release_sha : null,
            release_tree: typeof componentState?.release_tree === "string" ? componentState.release_tree : null,
            build_id: typeof componentState?.build_id === "string" ? componentState.build_id : null,
            sealed_bundle_digest: typeof componentState?.sealed_bundle_digest === "string"
              ? componentState.sealed_bundle_digest
              : typeof componentState?.execution_tree_digest === "string" ? componentState.execution_tree_digest : null,
            health: descriptorAuthority.exists ? "unknown" : "missing",
            descriptor_digest: descriptorAuthority.digest,
          };
        });
      });
    },
    async readLaunchd() {
      const uid = process.getuid?.();
      if (!Number.isInteger(uid)) return [];
      const labels = [
        "com.homecook.production",
        CANONICAL_FULL_LOCAL_LAUNCHD_LABEL,
        LEGACY_FULL_LOCAL_LAUNCHD_LABEL,
        "com.homecook.youtube-extraction-worker",
      ];
      return Promise.all(labels.map((label) => readLaunchdJob(commandRunner, launchctlBin, uid, label)));
    },
    async readDocker() {
      const { dockerBin, productionDockerProject } = resolveProductionDockerContext();
      if (!dockerBin || !productionDockerProject) return { containers: [], networks: [], volumes: [] };
      const containersSource = parseDelimitedLines(await commandOutput(commandRunner, dockerBin, [
        "ps", "--no-trunc", "--format", "{{.ID}}\t{{.Names}}\t{{.Label \"com.docker.compose.project\"}}\t{{.Label \"com.docker.compose.service\"}}\t{{.State}}",
      ]), ["id", "name", "project", "service", "state"])
        .filter((entry) => entry.project === productionDockerProject);
      const containers = await Promise.all(containersSource.map(async (entry) => {
          const inspect = (await commandOutput(commandRunner, dockerBin, [
            "inspect", "--type", "container", "--format", "{{json .Config.Labels}}\t{{json .Mounts}}\t{{.Image}}", entry.id,
          ])).trim().split("\t");
          if (inspect.length !== 3) throw new Error("read-only Docker container evidence is incomplete");
          const labels = JSON.parse(inspect[0]);
          const mounts = JSON.parse(inspect[1]).map((mount) => ({
            type: mount.Type ?? "",
            name: mount.Name ?? "",
            source: mount.Source ?? "",
            destination: mount.Destination ?? "",
            driver: mount.Driver ?? "",
            mode: mount.Mode ?? "",
            rw: Boolean(mount.RW),
            propagation: mount.Propagation ?? "",
          })).sort((left, right) => left.destination < right.destination ? -1 : left.destination > right.destination ? 1 : 0);
          const projection = {
            ...entry,
            image_digest: inspect[2],
            image_id: inspect[2],
            labels_digest: sha256Jcs(labels),
            mounts_digest: sha256Jcs(mounts),
          };
          return { ...projection, generation_digest: sha256Jcs(projection) };
        }));
      const networksSource = parseDelimitedLines(await commandOutput(commandRunner, dockerBin, [
        "network", "ls", "--no-trunc", "--format", "{{.ID}}\t{{.Name}}\t{{.Label \"com.docker.compose.project\"}}",
      ]), ["id", "name", "project"])
        .filter((entry) => entry.project === productionDockerProject);
      const networks = await Promise.all(networksSource.map(async (entry) => {
          const labels = JSON.parse((await commandOutput(commandRunner, dockerBin, ["network", "inspect", "--format", "{{json .Labels}}", entry.id])).trim());
          const projection = { ...entry, labels_digest: sha256Jcs(labels) };
          return { ...projection, generation_digest: sha256Jcs(projection) };
        }));
      const volumesSource = parseDelimitedLines(await commandOutput(commandRunner, dockerBin, [
        "volume", "ls", "--format", "{{.Name}}\t{{.Label \"com.docker.compose.project\"}}\t{{.Label \"com.docker.compose.volume\"}}",
      ]), ["name", "project", "service"])
        .filter((entry) => entry.project === productionDockerProject);
      const volumes = await Promise.all(volumesSource.map(async (entry) => {
          const labels = JSON.parse((await commandOutput(commandRunner, dockerBin, ["volume", "inspect", "--format", "{{json .Labels}}", entry.name])).trim());
          const projection = { ...entry, labels_digest: sha256Jcs(labels) };
          return { ...projection, generation_digest: sha256Jcs(projection) };
        }));
      return { containers, networks, volumes };
    },
    async readPortListeners() {
      const raw = await commandOutput(commandRunner, lsofBin, ["-nP", "-iTCP:3100", "-sTCP:LISTEN", "-Fpcn"], { absentExit: "lsof-no-listener" });
      let pid = null;
      let processName = "unknown";
      const listeners = [];
      for (const line of raw.split(/\r?\n/u)) {
        if (line.startsWith("p")) pid = Number(line.slice(1));
        if (line.startsWith("c")) processName = line.slice(1);
        if (line.startsWith("n") && /:3100(?:\s|$)/u.test(line)) {
          const projection = { port: 3100, pid: Number.isInteger(pid) ? pid : null, process_name: processName };
          listeners.push({ ...projection, listener_digest: sha256Jcs(projection) });
        }
      }
      return listeners;
    },
    async readOpaqueConfigIdentities() {
      const productionEnvPath = join(canonicalRoot, ".env.production.local");
      const dockerContext = resolveProductionDockerContext();
      return withTrustedAncestorChains([
        { base: canonicalRoot, target: productionEnvPath, label: "production env root" },
      ], () => [
        opaqueConfigIdentity("production-env", productionEnvPath),
        dockerContext.configDigest === null
          ? { identity: "full-local-config", exists: false, sha256: sha256Jcs({ identity: "full-local-config", exists: false }) }
          : { identity: "full-local-config", exists: true, sha256: dockerContext.configDigest },
      ]);
    },
    async readToolIdentities() {
      const { dockerBin } = resolveProductionDockerContext();
      const tools = [
        executableIdentity("git", gitBin),
        executableIdentity("launchctl", launchctlBin),
        executableIdentity("lsof", lsofBin),
      ];
      if (dockerBin) tools.push(executableIdentity("docker", dockerBin));
      return tools;
    },
    async readMigrationMarker() {
      if (!approvedMigrationMarkerPath) return { approved: false, marker_digest: null, global_ledger_digest: null, migration_head: null, catalog_head: null };
      const source = readPrivateCanonicalJsonFile(approvedMigrationMarkerPath, {
        repoRoot: canonicalRoot,
      });
      let parsed;
      try {
        parsed = parseCanonicalJcs(source);
      } catch {
        fail("approved migration marker must be canonical RFC8785 JCS");
      }
      exactObject(parsed, "approved migration marker", ["catalog_head", "global_ledger_digest", "migration_head"]);
      nonempty(parsed.catalog_head, "approved migration marker catalog_head");
      nonempty(parsed.migration_head, "approved migration marker migration_head");
      if (!HEX_64.test(parsed.global_ledger_digest)) fail("approved migration marker global ledger digest is invalid");
      return {
        approved: true,
        marker_digest: sha256Bytes(Buffer.from(source, "utf8")),
        global_ledger_digest: parsed.global_ledger_digest,
        migration_head: parsed.migration_head,
        catalog_head: parsed.catalog_head,
      };
    },
  });
}
