import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { homedir } from "node:os";

import { canonicalizeJcs, sha256Jcs } from "./rfc8785-jcs.mjs";

const DOCKER_ENDPOINT_SCHEMA = "homecook.release-rehearsal-local-docker-endpoint.v1";
const DOCKER_DAEMON_SCHEMA = "homecook.release-rehearsal-local-docker-daemon.v1";
const CREATION_KINDS = new Set(["container", "network", "volume"]);
const MIGRATION_MAX_BYTES = 512 * 1024 * 1024;

/** @returns {never} */
function fail(message) {
  throw new Error(`Release rehearsal safety rejected: ${message}`);
}

function modeBits(stat) {
  return Number(stat.mode) & 0o7777;
}

function sameIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.uid === right.uid
    && left.gid === right.gid
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.ctimeNs === right.ctimeNs;
}

function bigintIdentity(stat) {
  return Object.freeze({
    dev: String(stat.dev),
    ino: String(stat.ino),
    uid: Number(stat.uid),
    gid: Number(stat.gid),
    mode: modeBits(stat),
    nlink: String(stat.nlink),
    size: String(stat.size),
    ctimeNs: String(stat.ctimeNs),
  });
}

function assertSafeSocket(path, { currentUid, groups }) {
  const requested = lstatSync(path, { bigint: true });
  if (requested.isSymbolicLink() || !requested.isSocket()) {
    fail("local Docker endpoint must be a non-symlink Unix socket");
  }
  const canonical = realpathSync(path);
  const ancestors = [];
  let current = dirname(canonical);
  while (current !== "/") {
    ancestors.push(current);
    current = dirname(current);
  }
  for (const ancestor of ancestors.reverse()) {
    const ancestorStat = lstatSync(ancestor, { bigint: true });
    if (
      ancestorStat.isSymbolicLink()
      || !ancestorStat.isDirectory()
      || ![0n, BigInt(currentUid)].includes(ancestorStat.uid)
      || (ancestorStat.mode & 0o022n) !== 0n
    ) fail("local Docker socket ancestor owner/type/mode/realpath contract is unsafe");
  }
  const resolved = statSync(canonical, { bigint: true });
  if (!resolved.isSocket()) fail("local Docker endpoint realpath is not a Unix socket");
  const identity = bigintIdentity(resolved);
  const ownerAllowed = identity.uid === currentUid && [0o600, 0o700, 0o755].includes(identity.mode);
  const rootGroupAllowed = identity.uid === 0
    && identity.mode === 0o660
    && groups.includes(identity.gid);
  if (!ownerAllowed && !rootGroupAllowed) {
    fail("local Docker socket owner/type/mode contract is unsafe");
  }
  if (identity.nlink !== "1" || (identity.mode & 0o002) !== 0) {
    fail("local Docker socket link count or world permissions are unsafe");
  }
  return Object.freeze({ canonical, identity });
}

/**
 * @param {{
 *   explicitSocketPath?: string | null,
 *   homeDir?: string,
 *   ambient?: Record<string, string | undefined>,
 *   currentUid?: number,
 *   groups?: number[],
 * }} [options]
 */
export function resolveTrustedLocalDockerEndpoint({
  explicitSocketPath = null,
  currentUid = process.getuid?.() ?? -1,
  groups = process.getgroups?.() ?? [],
} = {}) {
  const canonicalHome = resolve(homedir());
  const canonicalSockets = [join(canonicalHome, ".docker", "run", "docker.sock"), "/var/run/docker.sock"];
  if (explicitSocketPath !== null && (!isAbsolute(explicitSocketPath) || explicitSocketPath.includes("\0") || /^(?:tcp|ssh|https?|npipe|unix):/iu.test(explicitSocketPath))) {
    fail("approved local Docker Unix socket path is invalid");
  }
  if (explicitSocketPath !== null && !canonicalSockets.includes(explicitSocketPath)) {
    fail("arbitrary Docker socket paths are not authority");
  }
  const candidates = explicitSocketPath === null ? canonicalSockets : [explicitSocketPath];
  for (const candidate of candidates) {
    if (
      typeof candidate !== "string"
      || !isAbsolute(candidate)
      || candidate.includes("\0")
      || /^(?:tcp|ssh|https?|npipe|unix):/iu.test(candidate)
    ) {
      if (explicitSocketPath !== null) fail("approved local Docker Unix socket path is invalid");
      continue;
    }
    if (!existsSync(candidate)) {
      if (explicitSocketPath !== null) fail("approved local Docker Unix socket is missing");
      continue;
    }
    const { canonical, identity } = assertSafeSocket(candidate, { currentUid, groups });
    const unsigned = {
      schema: DOCKER_ENDPOINT_SCHEMA,
      source: "canonical-local-socket",
      requested_path: candidate,
      realpath: canonical,
      identity,
      url: `unix://${canonical}`,
    };
    return Object.freeze({
      ...unsigned,
      identity_digest: sha256Jcs({ realpath: canonical, identity, url: unsigned.url }),
      endpoint_digest: sha256Jcs(unsigned),
    });
  }
  fail("no approved local Docker Unix socket is available");
}

export function buildPrivateDockerEnvironment({ runRoot }) {
  if (!isAbsolute(runRoot ?? "")) fail("run root must be absolute for private Docker config");
  const configRoot = join(runRoot, "docker-config");
  mkdirSync(configRoot, { mode: 0o700 });
  chmodSync(configRoot, 0o700);
  writeFileSync(join(configRoot, "config.json"), "{}\n", { flag: "wx", mode: 0o600 });
  return Object.freeze({
    DOCKER_CONFIG: configRoot,
    DOCKER_CLI_HINTS: "false",
    PATH: "/Applications/Docker.app/Contents/Resources/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
  });
}

export function buildPinnedDockerArgs(args, endpoint) {
  if (!Array.isArray(args) || args.some((value) => typeof value !== "string")) {
    fail("Docker argv must be a string array");
  }
  if (endpoint?.schema !== DOCKER_ENDPOINT_SCHEMA || !endpoint.url?.startsWith("unix:///")) {
    fail("trusted local Docker endpoint identity is required");
  }
  return Object.freeze(["--host", endpoint.url, ...args]);
}

export function validateDockerDaemonSnapshots(pre, post) {
  if (pre?.schema !== DOCKER_DAEMON_SCHEMA || post?.schema !== DOCKER_DAEMON_SCHEMA) {
    fail("Docker daemon identity snapshot schema is invalid");
  }
  if (canonicalizeJcs(pre) !== canonicalizeJcs(post)) {
    fail("Docker daemon or endpoint identity drifted during rehearsal");
  }
  for (const value of [pre, post]) {
    const { snapshot_digest: snapshotDigest, ...unsigned } = value;
    if (
      typeof value.daemon_id !== "string"
      || value.daemon_id.length === 0
      || typeof value.server_version !== "string"
      || value.server_version.length === 0
      || value.os_type !== "linux"
      || typeof value.architecture !== "string"
      || value.architecture.length === 0
      || sha256Jcs(unsigned) !== snapshotDigest
    ) fail("Docker daemon identity snapshot is incomplete or self-digest mismatched");
  }
  return pre;
}

function killProcessGroup(child, signal = "SIGTERM") {
  if (!child?.pid) return;
  try { process.kill(-child.pid, signal); }
  catch {
    try { child.kill(signal); } catch { /* already exited */ }
  }
}

/**
 * @param {{
 *   command: string,
 *   args?: string[],
 *   cwd?: string,
 *   env?: Record<string, string>,
 *   input?: Buffer | string,
 *   signal: AbortSignal,
 *   timeoutMs: number,
 *   maxOutputBytes: number,
 *   spawnImpl?: typeof spawn,
 * }} options
 */
export function runAbortableCommand({
  command,
  args = [],
  cwd,
  env,
  input,
  signal,
  timeoutMs,
  maxOutputBytes,
  spawnImpl = spawn,
}) {
  if (!isAbsolute(command ?? "") || !(signal instanceof AbortSignal)) {
    fail("abortable command requires an absolute executable and AbortSignal");
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) fail("command timeout is invalid");
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1) fail("command output bound is invalid");
  return new Promise((resolvePromise, rejectPromise) => {
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const stdout = [];
    const stderr = [];
    let failure = null;
    let settled = false;
    let forceTimer = null;
    const child = spawnImpl(command, args, {
      cwd,
      detached: true,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stop = (error) => {
      if (!failure) failure = error;
      killProcessGroup(child, "SIGTERM");
      if (!forceTimer) {
        forceTimer = setTimeout(() => killProcessGroup(child, "SIGKILL"), 500);
        forceTimer.unref?.();
      }
    };
    const timeout = setTimeout(() => stop(new Error("command timeout")), timeoutMs);
    timeout.unref?.();
    const onAbort = () => stop(signal.reason instanceof Error
      ? signal.reason
      : new Error(`command aborted by signal: ${String(signal.reason ?? "abort")}`));
    signal.addEventListener("abort", onAbort, { once: true });
    const collect = (chunks, key, value) => {
      const bytes = Buffer.from(value);
      if (key === "stdout") stdoutBytes += bytes.length;
      else stderrBytes += bytes.length;
      if (stdoutBytes > maxOutputBytes || stderrBytes > maxOutputBytes) {
        stop(new Error("command output overflow limit exceeded"));
        return;
      }
      chunks.push(bytes);
    };
    child.stdout?.on("data", (value) => collect(stdout, "stdout", value));
    child.stderr?.on("data", (value) => collect(stderr, "stderr", value));
    child.once("error", (error) => stop(error));
    child.once("close", (code, closeSignal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (forceTimer) clearTimeout(forceTimer);
      signal.removeEventListener("abort", onAbort);
      const result = Object.freeze({
        status: code,
        signal: closeSignal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
      if (failure) rejectPromise(failure);
      else resolvePromise(result);
    });
    if (input !== undefined) child.stdin?.end(input);
    else child.stdin?.end();
    if (signal.aborted) onAbort();
  });
}

export function readExactPrivateRegularFile(path, { label, maxBytes, acceptedFileModes, expectedUid = BigInt(process.getuid?.() ?? -1) } = {}) {
  if (typeof label !== "string" || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || !Array.isArray(acceptedFileModes) || acceptedFileModes.length === 0) fail("private file read policy is required");
  const pre = lstatSync(path, { bigint: true });
  if (pre.isSymbolicLink() || !pre.isFile() || pre.nlink !== 1n) {
    fail(`${label} must be a regular non-symlink file with link count one`);
  }
  if (pre.uid !== expectedUid || !acceptedFileModes.includes(modeBits(pre))) {
    fail(`${label} owner or mode is invalid`);
  }
  if (pre.size > BigInt(maxBytes)) fail(`${label} exceeds byte bound`);
  const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const fdPre = fstatSync(fd, { bigint: true });
    if (!sameIdentity(bigintIdentity(pre), bigintIdentity(fdPre))) fail(`${label} FD identity differs before read`);
    const bytes = readFileSync(fd);
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const fdPost = fstatSync(fd, { bigint: true });
    const pathPost = lstatSync(path, { bigint: true });
    if (
      !sameIdentity(bigintIdentity(fdPre), bigintIdentity(fdPost))
      || !sameIdentity(bigintIdentity(pre), bigintIdentity(pathPost))
    ) fail(`${label} FD/path identity drifted during read`);
    return Object.freeze({ bytes, identity: bigintIdentity(fdPost) });
  } finally {
    closeSync(fd);
  }
}

function readExactRegularFile(path) {
  return readExactPrivateRegularFile(path, { label: "sealed migration", maxBytes: MIGRATION_MAX_BYTES, acceptedFileModes: [0o400, 0o500] });
}

export function readVerifiedMigrationInputs({ candidateRoot, migration }) {
  if (!isAbsolute(candidateRoot ?? "") || !Array.isArray(migration?.ordered_migration_files)) {
    fail("verified migration input authority is invalid");
  }
  const base = join(candidateRoot, "bundles", "bundle", "full_local");
  const inputs = [];
  const entries = [];
  for (const relativePath of migration.ordered_migration_files) {
    if (
      typeof relativePath !== "string"
      || !/^supabase\/migrations\/[^/]+\.sql$/u.test(relativePath)
      || relativePath.includes("..")
    ) fail("migration relative path is unsafe");
    const path = resolve(base, relativePath);
    if (!path.startsWith(`${base}/`)) fail("migration path escapes staged full-local root");
    const read = readExactRegularFile(path);
    const sha256 = createHash("sha256").update(read.bytes).digest("hex");
    entries.push({ path: relativePath, sha256 });
    inputs.push(Object.freeze({ path: relativePath, bytes: read.bytes, sha256, identity: read.identity }));
  }
  const aggregate = sha256Jcs(entries);
  if (aggregate !== migration.ordered_migration_files_digest) {
    fail("migration ordered aggregate digest mismatch");
  }
  const expectedHead = migration.ordered_migration_files.at(-1)?.split("/").at(-1)?.replace(/\.sql$/u, "");
  if (expectedHead !== migration.migration_head) fail("migration head differs from sealed order");
  return Object.freeze({
    entries: Object.freeze(entries),
    inputs: Object.freeze(inputs),
    ordered_migration_files_digest: aggregate,
  });
}

export function createImmutableCreationLedger() {
  const entries = new Map();
  let closed = false;
  const keyOf = (entry) => `${entry.kind}\0${entry.id}`;
  return Object.freeze({
    record(entry) {
      if (closed) fail("creation ledger is closed and immutable");
      if (
        !CREATION_KINDS.has(entry?.kind)
        || typeof entry?.id !== "string"
        || entry.id.length === 0
        || typeof entry?.name !== "string"
        || entry.name.length === 0
      ) fail("creation ledger resource identity is invalid");
      const key = keyOf(entry);
      if (entries.has(key) || [...entries.values()].some((value) =>
        value.id === entry.id || (value.kind === entry.kind && value.name === entry.name))) {
        fail("duplicate or conflicting immutable creation identity");
      }
      entries.set(key, Object.freeze({ kind: entry.kind, id: entry.id, name: entry.name }));
      return entry;
    },
    close() { closed = true; },
    contains(entry) {
      const expected = entries.get(keyOf(entry ?? {}));
      return Boolean(expected && expected.kind === entry.kind && expected.id === entry.id && expected.name === entry.name);
    },
    snapshot() {
      return Object.freeze([...entries.values()]
        .map((entry) => Object.freeze({ ...entry })));
    },
  });
}

export function buildDockerDaemonSnapshot(input) {
  const unsigned = { schema: DOCKER_DAEMON_SCHEMA, ...input };
  return Object.freeze({ ...unsigned, snapshot_digest: sha256Jcs(unsigned) });
}
