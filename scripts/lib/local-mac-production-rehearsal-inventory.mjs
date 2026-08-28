import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants as FS_CONSTANTS,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { join, resolve } from "node:path";

import { parseCanonicalJcs, sha256Jcs } from "./rfc8785-jcs.mjs";
import { readPrivateCanonicalJsonFile } from "./local-mac-production-rehearsal-receipts.mjs";
import { resolveTrustedDockerBinary } from "./full-local-session-observation-reader.mjs";

export const INVENTORY_SCHEMA = "homecook.local-mac-production-rehearsal-inventory.v1";
export const PRODUCTION_SURFACE_SNAPSHOT_SCHEMA = "homecook.local-mac-production-surface-snapshot.v1";

const HEX_40 = /^[0-9a-f]{40}$/u;
const HEX_64 = /^[0-9a-f]{64}$/u;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const ARTIFACT_KEYS = ["kind", "exists", "device", "inode", "owner_uid", "mode", "size", "mtime", "sha256"];
const WORKLOAD_KEYS = ["component", "release_sha", "release_tree", "build_id", "sealed_bundle_digest", "health", "descriptor_digest"];
const LAUNCHD_KEYS = ["label", "loaded", "state", "pid", "projection_digest"];
const CONTAINER_KEYS = ["id", "name", "project", "service", "image_digest", "state", "generation_digest"];
const NETWORK_KEYS = ["id", "name", "project", "generation_digest"];
const VOLUME_KEYS = ["name", "project", "service", "generation_digest"];
const PORT_KEYS = ["port", "pid", "process_name", "listener_digest"];
const CONFIG_KEYS = ["identity", "sha256"];
const MIGRATION_KEYS = ["approved", "marker_digest", "global_ledger_digest", "catalog_head"];
const TOOL_KEYS = ["version", "realpath", "device", "inode", "mode", "ctime", "size", "sha256"];
const NAMED_TOOL_KEYS = ["name", ...TOOL_KEYS];
const SURFACE_KEYS = ["release_artifacts", "workloads", "launchd", "docker", "port_listeners", "opaque_configs", "migration"];
const INVENTORY_UNSIGNED_KEYS = ["schema", "canonicalization", "repository", "captured_at", "surface_allowlist_version", "probe_identity", "tool_identities", "production_db_connection_count", "mutation_attempt_count", "redacted_field_count", "surfaces", "surface_digest"];

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
  for (const key of ["mode", "size"]) integer(tool[key], `probe_identity.${key}`);
  if (!TIMESTAMP.test(tool.ctime)) fail("probe_identity.ctime must be UTC RFC3339");
  if (!HEX_64.test(tool.sha256)) fail("probe_identity.sha256 has an invalid format");
}

function validateSurfaces(value) {
  const surfaces = exactObject(value, "surfaces", SURFACE_KEYS);
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
  if (migration.catalog_head !== null) nonempty(migration.catalog_head, "surfaces.migration.catalog_head");

  for (const artifact of surfaces.release_artifacts) {
    nonempty(artifact.kind, "release artifact kind");
    if (typeof artifact.exists !== "boolean") fail("release artifact exists must be boolean");
    for (const key of ["device", "inode"]) identityInteger(artifact[key], `release artifact ${key}`);
    for (const key of ["owner_uid", "mode", "size"]) integer(artifact[key], `release artifact ${key}`);
    if (!TIMESTAMP.test(artifact.mtime)) fail("release artifact mtime must be UTC RFC3339");
    if (!HEX_64.test(artifact.sha256)) fail("release artifact sha256 has an invalid format");
  }
  for (const workload of surfaces.workloads) {
    nonempty(workload.component, "workload component");
    nullablePattern(workload.release_sha, "workload release_sha", HEX_40);
    nullablePattern(workload.release_tree, "workload release_tree", HEX_40);
    nullablePattern(workload.sealed_bundle_digest, "workload sealed_bundle_digest", HEX_64);
    nullablePattern(workload.descriptor_digest, "workload descriptor_digest", HEX_64);
    if (workload.build_id !== null) nonempty(workload.build_id, "workload build_id");
    if (!["running", "partial", "stopped", "missing", "unknown"].includes(workload.health)) fail("workload health is unknown evidence");
  }
  return surfaces;
}

export function validateProductionInventory(value) {
  const inventory = exactObject(value, "inventory", [...INVENTORY_UNSIGNED_KEYS, "inventory_digest"]);
  const { inventory_digest: digest, ...unsigned } = inventory;
  if (inventory.schema !== INVENTORY_SCHEMA || inventory.canonicalization !== "RFC8785-JCS+SHA256" || inventory.repository !== "netsus/homecook") fail("inventory authority identity mismatch");
  if (!TIMESTAMP.test(inventory.captured_at)) fail("captured_at must be UTC RFC3339");
  if (inventory.surface_allowlist_version !== "homecook-production-surface-v1") fail("surface allowlist version mismatch");
  validateTool(inventory.probe_identity);
  if (!Array.isArray(inventory.tool_identities)) fail("tool_identities must be an array");
  inventory.tool_identities.forEach((tool, index) => {
    const named = exactObject(tool, `tool_identities[${index}]`, NAMED_TOOL_KEYS);
    nonempty(named.name, `tool_identities[${index}].name`);
    const identity = Object.fromEntries(TOOL_KEYS.map((key) => [key, named[key]]));
    validateTool(identity);
  });
  if (new Set(inventory.tool_identities.map((tool) => tool.name)).size !== inventory.tool_identities.length) fail("tool identity names must be unique");
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
  const required = ["readReleaseArtifacts", "readWorkloads", "readLaunchd", "readDocker", "readPortListeners", "readOpaqueConfigIdentities"];
  for (const key of required) if (typeof adapters[key] !== "function") fail(`missing read-only adapter ${key}`);
  const [release, workloads, launchd, dockerRaw, ports, configs, tools] = await Promise.all([
    adapters.readReleaseArtifacts(),
    adapters.readWorkloads(),
    adapters.readLaunchd(),
    adapters.readDocker(),
    adapters.readPortListeners(),
    adapters.readOpaqueConfigIdentities(),
    adapters.readToolIdentities?.() ?? [],
  ]);
  const migrationRaw = approvedMigrationMarker
    ? await adapters.readMigrationMarker?.()
    : { approved: false, marker_digest: null, global_ledger_digest: null, catalog_head: null };
  const counter = { count: 0 };
  const docker = project(dockerRaw, ["containers", "networks", "volumes"], counter);
  const surfaces = {
    release_artifacts: projectedArray(release, ARTIFACT_KEYS, counter, "kind"),
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
  };
  const unsigned = {
    schema: INVENTORY_SCHEMA,
    canonicalization: "RFC8785-JCS+SHA256",
    repository: "netsus/homecook",
    captured_at: capturedAt,
    surface_allowlist_version: "homecook-production-surface-v1",
    probe_identity: probeIdentity,
    tool_identities: projectedArray(tools, NAMED_TOOL_KEYS, counter, "name"),
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
    && left.ctimeMs === right.ctimeMs && left.mtimeMs === right.mtimeMs;
}

function readOpaqueRegularFile(path, label) {
  const before = lstatSync(path);
  const uid = process.getuid?.();
  if (!before.isFile() || before.isSymbolicLink() || ![0, uid].includes(before.uid)
    || (before.mode & 0o022) !== 0 || before.nlink !== 1) {
    fail(`${label} must be a trusted non-linked regular file`);
  }
  const descriptor = openSync(path, FS_CONSTANTS.O_RDONLY | (FS_CONSTANTS.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(descriptor);
    if (!sameFileIdentity(before, opened)) fail(`${label} identity changed before read`);
    const bytes = readFileSync(descriptor);
    const after = lstatSync(path);
    if (!sameFileIdentity(opened, after)) fail(`${label} identity changed during read`);
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function artifactEvidence(kind, path) {
  if (!existsSync(path)) {
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
  const stats = lstatSync(path);
  if (stats.isSymbolicLink()) fail(`production ${kind} path must not be a symlink`);
  let digest;
  if (stats.isFile()) {
    digest = sha256Bytes(readOpaqueRegularFile(path, `production ${kind}`));
  } else if (stats.isDirectory()) {
    const entries = readdirSync(path, { withFileTypes: true })
      .map((entry) => ({ name: entry.name, type: entry.isDirectory() ? "directory" : entry.isFile() ? "file" : "other" }))
      .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    digest = sha256Jcs(entries);
  } else {
    fail(`production ${kind} path must be a regular file or directory`);
  }
  return {
    kind,
    exists: true,
    device: String(stats.dev),
    inode: String(stats.ino),
    owner_uid: stats.uid,
    mode: stats.mode & 0o7777,
    size: stats.size,
    mtime: stats.mtime.toISOString(),
    sha256: digest,
  };
}

function safeJson(path) {
  if (!existsSync(path)) return null;
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink()) fail("production descriptor must be a non-symlink regular file");
  try {
    return JSON.parse(readOpaqueRegularFile(path, "production descriptor").toString("utf8"));
  } catch {
    return null;
  }
}

function commandOutput(commandRunner, command, args) {
  const result = commandRunner(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin" },
    maxBuffer: 4 * 1024 * 1024,
    timeout: 10_000,
  });
  return result.status === 0 ? String(result.stdout ?? "") : "";
}

function parseDelimitedLines(source, fieldNames) {
  return source.split(/\r?\n/u).filter(Boolean).map((line) => {
    const fields = line.split("\t");
    return Object.fromEntries(fieldNames.map((name, index) => [name, fields[index] ?? ""]));
  });
}

function opaqueConfigIdentity(identity, path) {
  if (!existsSync(path)) return { identity, sha256: sha256Jcs({ identity, exists: false }) };
  const stats = lstatSync(path);
  if (!stats.isFile() || stats.isSymbolicLink()) fail(`opaque config ${identity} must be a regular file`);
  return { identity, sha256: sha256Bytes(readOpaqueRegularFile(path, `opaque config ${identity}`)) };
}

function executableIdentity(name, path, version = "system") {
  const canonical = realpathSync(path);
  const stats = lstatSync(canonical);
  const uid = process.getuid?.();
  if (!stats.isFile() || ![0, uid].includes(stats.uid) || (stats.mode & 0o111) === 0 || (stats.mode & 0o022) !== 0) {
    fail(`read-only tool ${name} failed trusted owner/mode verification`);
  }
  return {
    name,
    version,
    realpath: canonical,
    device: String(stats.dev),
    inode: String(stats.ino),
    mode: stats.mode & 0o7777,
    ctime: stats.ctime.toISOString(),
    size: stats.size,
    sha256: sha256Bytes(readOpaqueRegularFile(canonical, `read-only tool ${name}`)),
  };
}

/** @param {Record<string, any>} [options] */
export function createLocalProductionInventoryAdapters(options = {}) {
  const {
    homeDir = process.env.HOME ?? "",
    rootDir = process.cwd(),
    approvedMigrationMarkerPath = null,
    dockerBin: dockerBinOption = null,
    commandRunner = spawnSync,
  } = options;
  const canonicalHome = resolve(homeDir);
  const canonicalRoot = resolve(rootDir);
  const releaseRoot = join(canonicalHome, ".homecook", "releases");
  const currentPath = join(releaseRoot, "current.json");
  const previousPath = join(releaseRoot, "previous.json");
  const lockRoot = join(releaseRoot, "promotion-locks");
  const snapshotRoot = join(releaseRoot, "execution-snapshots");
  const fullLocalConfigPath = join(canonicalRoot, "infra", "full-local-supabase", ".env.production.local");
  let productionDockerProject = null;
  if (existsSync(fullLocalConfigPath)) {
    const stats = lstatSync(fullLocalConfigPath);
    if (!stats.isFile() || stats.isSymbolicLink() || (stats.mode & 0o022) !== 0) {
      fail("canonical full-local production config must be a private regular file");
    }
    const configText = readOpaqueRegularFile(fullLocalConfigPath, "canonical full-local production config").toString("utf8");
    const matches = configText.split(/\r?\n/u)
      .map((line) => /^FULL_LOCAL_COMPOSE_PROJECT_NAME=([A-Za-z0-9][A-Za-z0-9_.-]*)$/u.exec(line.trim()))
      .filter(Boolean);
    if (matches.length === 1) productionDockerProject = matches[0][1];
  }
  const dockerBin = dockerBinOption ?? (productionDockerProject ? resolveTrustedDockerBinary() : null);

  return Object.freeze({
    async readReleaseArtifacts() {
      const entries = [
        artifactEvidence("release_root", releaseRoot),
        artifactEvidence("current_descriptor", currentPath),
        artifactEvidence("previous_descriptor", previousPath),
      ];
      for (const [root, prefix] of [[lockRoot, "recovered_lock"], [snapshotRoot, "sealed_snapshot"]]) {
        if (!existsSync(root)) continue;
        for (const name of readdirSync(root).sort()) entries.push(artifactEvidence(`${prefix}:${sha256Jcs(name)}`, join(root, name)));
      }
      return entries;
    },
    async readWorkloads() {
      const descriptor = safeJson(currentPath);
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
          health: descriptor ? "unknown" : "missing",
          descriptor_digest: existsSync(currentPath) ? sha256Bytes(readOpaqueRegularFile(currentPath, "current descriptor")) : null,
        };
      });
    },
    async readLaunchd() {
      const uid = process.getuid?.();
      if (!Number.isInteger(uid)) return [];
      const labels = ["com.homecook.production", "com.homecook.full-local-production", "com.homecook.youtube-extraction-worker"];
      return labels.map((label) => {
        const raw = commandOutput(commandRunner, "/bin/launchctl", ["print", `gui/${uid}/${label}`]);
        const state = /^\s*state = (.+)$/mu.exec(raw)?.[1]?.trim() ?? (raw ? "unknown" : "missing");
        const pidText = /^\s*pid = (\d+)$/mu.exec(raw)?.[1];
        const projection = { label, loaded: Boolean(raw), state, pid: pidText ? Number(pidText) : null };
        return { ...projection, projection_digest: sha256Jcs(projection) };
      });
    },
    async readDocker() {
      if (!dockerBin || !productionDockerProject) return { containers: [], networks: [], volumes: [] };
      const containers = parseDelimitedLines(commandOutput(commandRunner, dockerBin, [
        "ps", "--no-trunc", "--format", "{{.ID}}\t{{.Names}}\t{{.Label \"com.docker.compose.project\"}}\t{{.Label \"com.docker.compose.service\"}}\t{{.Image}}\t{{.State}}",
      ]), ["id", "name", "project", "service", "image_digest", "state"])
        .filter((entry) => entry.project === productionDockerProject)
        .map((entry) => ({ ...entry, generation_digest: sha256Jcs(entry) }));
      const networks = parseDelimitedLines(commandOutput(commandRunner, dockerBin, [
        "network", "ls", "--no-trunc", "--format", "{{.ID}}\t{{.Name}}\t{{.Label \"com.docker.compose.project\"}}",
      ]), ["id", "name", "project"])
        .filter((entry) => entry.project === productionDockerProject)
        .map((entry) => ({ ...entry, generation_digest: sha256Jcs(entry) }));
      const volumes = parseDelimitedLines(commandOutput(commandRunner, dockerBin, [
        "volume", "ls", "--format", "{{.Name}}\t{{.Label \"com.docker.compose.project\"}}\t{{.Label \"com.docker.compose.volume\"}}",
      ]), ["name", "project", "service"])
        .filter((entry) => entry.project === productionDockerProject)
        .map((entry) => ({ ...entry, generation_digest: sha256Jcs(entry) }));
      return { containers, networks, volumes };
    },
    async readPortListeners() {
      const raw = commandOutput(commandRunner, "/usr/sbin/lsof", ["-nP", "-iTCP:3100", "-sTCP:LISTEN", "-Fpcn"]);
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
      return [
        opaqueConfigIdentity("production-env", join(canonicalRoot, ".env.production.local")),
        opaqueConfigIdentity("full-local-config", fullLocalConfigPath),
      ];
    },
    async readToolIdentities() {
      const tools = [
        executableIdentity("launchctl", "/bin/launchctl"),
        executableIdentity("lsof", "/usr/sbin/lsof"),
      ];
      if (dockerBin) tools.push(executableIdentity("docker", dockerBin));
      return tools;
    },
    async readMigrationMarker() {
      if (!approvedMigrationMarkerPath) return { approved: false, marker_digest: null, global_ledger_digest: null, catalog_head: null };
      const source = readPrivateCanonicalJsonFile(approvedMigrationMarkerPath, {
        repoRoot: canonicalRoot,
      });
      let parsed;
      try {
        parsed = parseCanonicalJcs(source);
      } catch {
        fail("approved migration marker must be canonical RFC8785 JCS");
      }
      exactObject(parsed, "approved migration marker", ["catalog_head", "global_ledger_digest"]);
      nonempty(parsed.catalog_head, "approved migration marker catalog_head");
      if (!HEX_64.test(parsed.global_ledger_digest)) fail("approved migration marker global ledger digest is invalid");
      return {
        approved: true,
        marker_digest: sha256Bytes(Buffer.from(source, "utf8")),
        global_ledger_digest: parsed.global_ledger_digest,
        catalog_head: parsed.catalog_head,
      };
    },
  });
}
