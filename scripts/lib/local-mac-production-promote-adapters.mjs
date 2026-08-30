import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  getLocalMacProductionPaths,
  installLocalMacProductionLaunchAgent,
  readLocalMacProductionStatus,
  renderLocalMacProductionPlist,
  verifyFullLocalProductionRuntimeStatus,
  waitForLocalMacProductionReady,
} from "./local-mac-production.mjs";
import {
  getFullLocalLaunchAgentPaths,
  getFullLocalResumeConfigPath,
  installFullLocalLaunchAgent,
  renderFullLocalLaunchAgentPlist,
} from "./full-local-launch-agent.mjs";
import { parseFullLocalProductionConfig } from "./full-local-production-resources.mjs";
import { FULL_LOCAL_SECRET_NAMES } from "./full-local-production-runtime.mjs";
import { FULL_LOCAL_OAUTH_SECRET_NAMES } from "./full-local-oauth-providers.mjs";
import {
  buildMigrationHeadSql,
  parseMigrationHeadSqlOutput,
} from "../capture-full-local-session-lifecycle-evidence.mjs";
import {
  FIRST_CANONICAL_ADOPTION_BRIDGE_MODE,
  FIRST_CANONICAL_ADOPTION_FULL_LOCAL_SOURCE_SHA,
  FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA,
  FULL_LOCAL_RESUME_CURRENT_CAPABILITY,
  getFirstCanonicalAdoptionPathAuthority,
  getLocalMacProductionReleasePaths,
  readLocalMacProductionPreparedReleaseIdentity,
  readLocalMacProductionRuntimeIdentity,
  readLocalMacProductionRuntimeRehearsalAuthority,
} from "./local-mac-production-release.mjs";
import {
  buildYoutubeExtractionWorkerServiceTarget,
  evaluateYoutubeExtractionWorkerPreflight,
  getYoutubeExtractionWorkerPaths,
  installYoutubeExtractionWorkerLaunchAgent,
  loadYoutubeExtractionWorkerRuntimeInputs,
  parseLaunchctlPrintStatus,
  renderYoutubeExtractionWorkerPlist,
  validateYoutubeExtractionWorkerConfigPath,
  validateYoutubeExtractionWorkerSecretFile,
  validateYoutubeExtractionWorkerSecretRoot,
  YOUTUBE_EXTRACTION_WORKER_INSTALL_CONFIRMATION,
} from "./youtube-extraction-worker-ops.mjs";
import {
  sha256File,
  verifyYoutubeExtractionWorkerArtifact,
} from "./youtube-extraction-worker-artifact.mjs";
import {
  readWorkerEnvironment,
  readWorkerProviderEnvironment,
  sanitizeYoutubeExtractionChildEnvironment,
  verifyStandaloneYoutubeI031Preflight,
} from "./youtube-extraction-worker-runtime.mjs";

function sha256Text(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

const FROZEN_RUNTIME_INPUT_SCHEMA = "homecook.local-mac-production-frozen-runtime-inputs.v1";
const RUNTIME_INPUT_SOURCE_CHANGED_PUBLIC_ERROR =
  "runtime_input_source_changed: frozen runtime input source authority changed.";

function readPrivateRuntimeInput(path, label, expectedUid = process.getuid?.()) {
  const absolute = resolve(path);
  const before = lstatSync(absolute);
  if (before.isSymbolicLink() || !before.isFile() || before.uid !== expectedUid
    || ![0o400, 0o600].includes(before.mode & 0o777) || before.nlink !== 1
    || realpathSync(absolute) !== absolute) {
    throw new Error(`${label} must be a private current-user single-link regular file.`);
  }
  let descriptor;
  try {
    descriptor = openSync(absolute, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const opened = fstatSync(descriptor);
    const bytes = readFileSync(descriptor);
    const openedAfter = fstatSync(descriptor);
    const after = lstatSync(absolute);
    if ([opened, openedAfter, after].some((current) => !current.isFile()
      || current.dev !== before.dev || current.ino !== before.ino
      || current.uid !== before.uid || current.mode !== before.mode || current.nlink !== before.nlink
      || current.size !== before.size || current.ctimeMs !== before.ctimeMs || current.mtimeMs !== before.mtimeMs)) {
      throw new Error(`${label} identity changed while being frozen.`);
    }
    return Object.freeze({
      path: absolute,
      bytes,
      identity: Object.freeze({ dev: opened.dev, ino: opened.ino, uid: opened.uid, mode: opened.mode & 0o777, nlink: opened.nlink, size: opened.size, ctime_ms: opened.ctimeMs, mtime_ms: opened.mtimeMs, sha256: sha256Bytes(bytes) }),
    });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function assertPrivateRuntimeDirectory(path, label, expectedUid = process.getuid?.()) {
  const absolute = resolve(path);
  const stat = lstatSync(absolute);
  if (stat.isSymbolicLink() || !stat.isDirectory() || stat.uid !== expectedUid
    || (stat.mode & 0o777) !== 0o700 || realpathSync(absolute) !== absolute) {
    throw new Error(`${label} must be an exact private current-user directory.`);
  }
  return absolute;
}

function snapshotPrivateRuntimeDirectoryIdentity(path, label, expectedUid = process.getuid?.()) {
  const reservation = openPrivateRuntimeDirectoryReservation(path, label, expectedUid);
  try {
    assertPrivateRuntimeDirectoryReservation(reservation);
    return Object.freeze({ path: reservation.path, identity: reservation.identity });
  } finally {
    closeSync(reservation.descriptor);
  }
}

function privateRuntimeDirectoryIdentity(stat, path) {
  return Object.freeze({
    dev: stat.dev,
    ino: stat.ino,
    uid: stat.uid,
    mode: stat.mode & 0o777,
    nlink: stat.nlink,
    ctime_ms: stat.ctimeMs,
    mtime_ms: stat.mtimeMs,
    realpath_sha256: sha256Text(realpathSync(path)),
  });
}

function openPrivateRuntimeDirectoryReservation(path, label, expectedUid = process.getuid?.()) {
  const absolute = resolve(path);
  const before = lstatSync(absolute);
  if (before.isSymbolicLink() || !before.isDirectory()
    || before.uid !== expectedUid || (before.mode & 0o022) !== 0
    || realpathSync(absolute) !== absolute) {
    throw new Error(`${label} must be an exact current-user safe directory.`);
  }
  let descriptor;
  try {
    descriptor = openSync(
      absolute,
      fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
    );
    const opened = fstatSync(descriptor);
    const identity = privateRuntimeDirectoryIdentity(opened, absolute);
    const after = lstatSync(absolute);
    if (!opened.isDirectory()
      || opened.dev !== before.dev || opened.ino !== before.ino
      || opened.uid !== before.uid || opened.mode !== before.mode
      || opened.nlink !== before.nlink || opened.ctimeMs !== before.ctimeMs
      || opened.mtimeMs !== before.mtimeMs
      || privateRuntimeDirectoryIdentity(after, absolute).realpath_sha256
        !== identity.realpath_sha256) {
      throw new Error("Private source directory identity changed while being reserved.");
    }
    return Object.freeze({ descriptor, identity, path: absolute });
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    throw error;
  }
}

function assertPrivateRuntimeDirectoryReservation(reservation) {
  const opened = fstatSync(reservation.descriptor);
  const current = lstatSync(reservation.path);
  const openedIdentity = privateRuntimeDirectoryIdentity(opened, reservation.path);
  const currentIdentity = privateRuntimeDirectoryIdentity(current, reservation.path);
  if (!opened.isDirectory() || !current.isDirectory()
    || !sameRuntimeInputIdentity(openedIdentity, reservation.identity)
    || !sameRuntimeInputIdentity(currentIdentity, reservation.identity)) {
    throw new Error("Private source directory identity changed after reservation.");
  }
  return reservation;
}

function createPrivateSourceDirectoryRegistry(sourceRootsByPath, expectedUid) {
  const reservations = new Map();
  try {
    for (const [sourcePath, trustedRoot] of [...sourceRootsByPath.entries()]
      .sort(([left], [right]) => left.localeCompare(right))) {
      const root = resolve(trustedRoot);
      const parent = dirname(resolve(sourcePath));
      const relativeParent = relative(root, parent);
      if (relativeParent.startsWith("..") || isAbsolute(relativeParent)) {
        throw new Error("Private runtime input source escapes its approved authority root.");
      }
      const chain = [root];
      let cursor = root;
      for (const segment of relativeParent.split(sep).filter(Boolean)) {
        cursor = join(cursor, segment);
        chain.push(cursor);
      }
      for (const directory of chain) {
        if (!reservations.has(directory)) {
          reservations.set(directory, openPrivateRuntimeDirectoryReservation(
            directory,
            "Approved runtime input ancestor",
            expectedUid,
          ));
        }
      }
    }
    return Object.freeze({
      assertStable() {
        for (const reservation of reservations.values()) {
          assertPrivateRuntimeDirectoryReservation(reservation);
        }
      },
      close() {
        for (const reservation of reservations.values()) closeSync(reservation.descriptor);
      },
      records() {
        return [...reservations.values()]
          .sort((left, right) => left.path.localeCompare(right.path))
          .map((reservation, index) => Object.freeze({
            label: `source_ancestor_${String(index).padStart(3, "0")}`,
            path: reservation.path,
            identity: reservation.identity,
          }));
      },
    });
  } catch (error) {
    for (const reservation of reservations.values()) closeSync(reservation.descriptor);
    throw error;
  }
}

function writeFrozenRuntimeFile(path, bytes, mode = 0o600) {
  const descriptor = openSync(path, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, mode);
  try {
    writeFileSync(descriptor, bytes);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || (stat.mode & 0o777) !== mode || stat.nlink !== 1) throw new Error("Frozen runtime input write identity is unsafe.");
  } finally {
    closeSync(descriptor);
  }
  return path;
}

function collectPrivateRuntimeFiles(rootPath, expectedUid) {
  const root = assertPrivateRuntimeDirectory(rootPath, "Worker secret root", expectedUid);
  const records = [];
  const visit = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Worker secret root contains a symlink.");
      if (entry.isDirectory()) {
        assertPrivateRuntimeDirectory(child, "Worker secret directory", expectedUid);
        visit(child);
      } else if (entry.isFile()) {
        records.push(readPrivateRuntimeInput(child, "Worker secret input", expectedUid));
      } else {
        throw new Error("Worker secret root contains an unsupported entry.");
      }
    }
  };
  visit(root);
  return { root, records };
}

function collectExactFullLocalSecretFiles(rootPath, expectedUid, expectedNames) {
  const root = assertPrivateRuntimeDirectory(rootPath, "Full-local secret root", expectedUid);
  const entries = readdirSync(root, { withFileTypes: true });
  if (entries.some((entry) => !entry.isFile())
    || JSON.stringify(entries.map((entry) => entry.name).sort()) !== JSON.stringify([...expectedNames].sort())) {
    throw new Error("Full-local secret root has missing, unknown, or non-file entries.");
  }
  return {
    root,
    records: entries.map((entry) => readPrivateRuntimeInput(join(root, entry.name), `Full-local secret ${entry.name}`, expectedUid)),
  };
}

function sameRuntimeInputIdentity(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function buildFrozenRuntimeInventory(rootPath) {
  const records = [];
  const visit = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) {
        const snapshot = readPrivateRuntimeInput(child, "Frozen runtime input");
        records.push({ relative_path: relative(rootPath, child), ...snapshot.identity });
      } else throw new Error("Frozen runtime input tree contains an unsupported entry.");
    }
  };
  visit(rootPath);
  return records;
}

/** @param {Record<string, unknown>} status */
export function buildFullLocalWorkloadStableDigest(status) {
  return sha256Text(JSON.stringify({
    healthy: status.healthy,
    authorization_contract_status: status.authorization_contract_status,
    authorization_contract_missing_requirements:
      status.authorization_contract_missing_requirements,
    product_catalog_status: status.product_catalog_status,
    product_catalog_missing_columns: status.product_catalog_missing_columns,
    product_catalog_missing_functions: status.product_catalog_missing_functions,
    product_catalog_missing_relations: status.product_catalog_missing_relations,
    container_count: status.container_count,
    exited: status.exited,
    status: status.status,
  }));
}

/**
 * @template T
 * @param {{
 *   read: () => Promise<T> | T,
 *   attempts?: number,
 *   intervalMs?: number,
 *   sleep?: (ms: number) => Promise<void>,
 * }} options
 * @returns {Promise<T>}
 */
export async function waitForFullLocalCandidateIdentity({
  read,
  attempts = 30,
  intervalMs = 1_000,
  sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms)),
} = {}) {
  if (typeof read !== "function" || !Number.isInteger(attempts) || attempts < 1) {
    throw new Error("Candidate identity wait options are invalid.");
  }
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await read();
    } catch (error) {
      if (
        !(error instanceof Error)
        || error.message !== "Full-local Docker workload release identity mismatch."
        || attempt === attempts
      ) {
        throw error;
      }
      await sleep(intervalMs);
    }
  }
  throw new Error("Full-local candidate identity wait exhausted.");
}

const FIRST_CANONICAL_ADOPTION_WORKER_PLIST_SHA256 =
  "69393712e063e6e0f84c869c330ff4f58f718b73184a20250395d8c9cfd39da8";

/**
 * @param {{
 *   currentRuntimeBridge?: Record<string, unknown> | null,
 *   actualDigest?: string,
 * }} options
 */
export function allowFirstCanonicalAdoptionWorkerPlist({
  currentRuntimeBridge = null,
  actualDigest = "",
} = {}) {
  return Boolean(
    currentRuntimeBridge
    && actualDigest === FIRST_CANONICAL_ADOPTION_WORKER_PLIST_SHA256
  );
}

/**
 * @param {{
 *   currentRuntimeBridge?: Record<string, unknown> | null,
 *   workerStatus?: { pid?: number | null, state?: string } | null,
 * }} options
 */
export function buildWorkerRuntimeStableProjection({
  currentRuntimeBridge = null,
  workerStatus = null,
} = {}) {
  return currentRuntimeBridge
    ? { worker_pid: null, worker_state: "first-canonical-adoption-verified" }
    : {
      worker_pid: workerStatus?.pid ?? null,
      worker_state: workerStatus?.state ?? "unknown",
    };
}

function modeBits(mode) {
  return Number(mode) & 0o777;
}

function decodeXml(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function assertSafeAncestors(trustedRoot, targetPath, currentUid, label) {
  const root = resolve(trustedRoot);
  const parent = dirname(resolve(targetPath));
  const relativeParent = relative(root, parent);
  if (relativeParent.startsWith("..") || relativeParent.startsWith(sep)) {
    throw new Error(`${label} escapes the trusted home root.`);
  }
  let cursor = root;
  for (const segment of relativeParent.split(sep).filter(Boolean)) {
    cursor = resolve(cursor, segment);
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`${label} ancestor must be a regular directory.`);
    }
    if (stat.uid !== currentUid || (modeBits(stat.mode) & 0o022) !== 0) {
      throw new Error(`${label} ancestor owner or mode is unsafe.`);
    }
  }
}

function readCanonicalFullLocalConfigEvidence({ currentUid, options }) {
  if (options.frozenRuntimeInputRoot) {
    const frozenRoot = assertPrivateRuntimeDirectory(options.frozenRuntimeInputRoot, "Frozen runtime input root", currentUid);
    const snapshot = readPrivateRuntimeInput(options.fullLocalConfigPath, "Frozen full-local config", currentUid);
    const relativePath = relative(frozenRoot, snapshot.path);
    if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new Error("Frozen full-local config escapes its authority root.");
    }
    return Object.freeze({
      ctimeMs: snapshot.identity.ctime_ms,
      dev: snapshot.identity.dev,
      digest: snapshot.identity.sha256,
      ino: snapshot.identity.ino,
      mtimeMs: snapshot.identity.mtime_ms,
      path: snapshot.path,
      size: snapshot.identity.size,
    });
  }
  const canonicalPath = getFullLocalResumeConfigPath(options.homeDir);
  if (resolve(options.fullLocalConfigPath) !== canonicalPath) {
    throw new Error("Full-local config must use the fixed canonical resume path.");
  }
  assertSafeAncestors(options.homeDir, canonicalPath, currentUid, "Full-local config");
  const stat = lstatSync(canonicalPath);
  if (
    stat.isSymbolicLink()
    || !stat.isFile()
    || stat.uid !== currentUid
    || modeBits(stat.mode) !== 0o600
    || realpathSync(canonicalPath) !== canonicalPath
  ) {
    throw new Error("Full-local config owner, mode, or path is unsafe.");
  }
  let descriptor;
  try {
    descriptor = openSync(canonicalPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const opened = fstatSync(descriptor);
    const bytes = readFileSync(descriptor);
    const after = lstatSync(canonicalPath);
    if (
      !opened.isFile()
      || opened.uid !== currentUid
      || modeBits(opened.mode) !== 0o600
      || opened.dev !== after.dev
      || opened.ino !== after.ino
      || opened.size !== after.size
      || opened.ctimeMs !== after.ctimeMs
      || opened.mtimeMs !== after.mtimeMs
    ) {
      throw new Error("Full-local config changed while being read.");
    }
    return Object.freeze({
      ctimeMs: opened.ctimeMs,
      dev: opened.dev,
      digest: sha256Bytes(bytes),
      ino: opened.ino,
      mtimeMs: opened.mtimeMs,
      path: canonicalPath,
      size: opened.size,
    });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function sameFullLocalConfigEvidence(left, right) {
  return ["path", "digest", "dev", "ino", "size", "ctimeMs", "mtimeMs"]
    .every((field) => left?.[field] === right?.[field]);
}

function readPlistSnapshot(path, { currentUid, expectedMode, label, trustedRoot }) {
  if (trustedRoot) assertSafeAncestors(trustedRoot, path, currentUid, label);
  if (!existsSync(path)) {
    throw new Error(`${label} is missing: ${path}`);
  }
  const stat = lstatSync(path);
  const parent = lstatSync(dirname(path));
  if (parent.isSymbolicLink() || !parent.isDirectory()) {
    throw new Error(`${label} parent must be a regular directory.`);
  }
  if (parent.uid !== currentUid || (modeBits(parent.mode) & 0o022) !== 0) {
    throw new Error(`${label} parent owner or mode is unsafe.`);
  }
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symlink.`);
  if (!stat.isFile()) throw new Error(`${label} must be a regular file.`);
  if (stat.uid !== currentUid) throw new Error(`${label} owner mismatch.`);
  if (modeBits(stat.mode) !== expectedMode) {
    throw new Error(`${label} must use mode 0${expectedMode.toString(8)}.`);
  }
  const bytes = readFileSync(path);
  const text = bytes.toString("utf8");
  const workingDirectory = decodeXml(
    text.match(/<key>WorkingDirectory<\/key>\s*<string>([^<]+)<\/string>/u)?.[1] ?? "",
  );
  const argumentsMatch = text.match(/<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/u);
  const args = argumentsMatch
    ? [...argumentsMatch[1].matchAll(/<string>([^<]*)<\/string>/gu)].map((match) =>
      decodeXml(match[1]))
    : [];
  return {
    args,
    digest: sha256Text(bytes),
    path,
    text,
    workingDirectory,
  };
}

export function assertCanonicalLocalMacProductionPlist({
  actualPath,
  currentUid,
  expectedContent,
  expectedMode,
  label,
  trustedRoot = "",
}) {
  const snapshot = readPlistSnapshot(actualPath, {
    currentUid,
    expectedMode,
    label,
    trustedRoot,
  });
  if (snapshot.text !== expectedContent) {
    throw new Error(`${label} content drifted from the canonical renderer.`);
  }
  return snapshot;
}

export function buildCanonicalCurrentYoutubeWorkerPlist({
  currentDescriptor,
  digestFile = sha256File,
  options,
  renderWorkerPlist = renderYoutubeExtractionWorkerPlist,
  verifyWorkerArtifact = verifyYoutubeExtractionWorkerArtifact,
}) {
  const artifactRoot = currentDescriptor?.worker_artifact_root;
  const manifestPath = currentDescriptor?.worker_manifest_path;
  if (typeof artifactRoot !== "string" || typeof manifestPath !== "string") {
    throw new Error("Current descriptor is missing worker artifact path authority.");
  }
  const authorityRoot = resolve(dirname(artifactRoot), "authority");
  const appDescriptorPath = resolve(authorityRoot, "app-descriptor.json");
  const expectedSchemaPath = resolve(authorityRoot, "expected-schema.json");
  const policyPath = resolve(authorityRoot, "policy.json");
  if (
    verifyWorkerArtifact(manifestPath).artifact_sha256
    !== currentDescriptor.worker_artifact_sha256
  ) {
    throw new Error("Current worker artifact digest drifted.");
  }
  for (const [path, expectedDigest, label] of [
    [appDescriptorPath, currentDescriptor.worker_app_descriptor_sha256, "app descriptor"],
    [options.workerConfigPath, currentDescriptor.worker_config_sha256, "config"],
    [options.workerCredentialPath, currentDescriptor.worker_credential_sha256, "credential"],
    [expectedSchemaPath, currentDescriptor.worker_expected_schema_sha256, "schema"],
    [policyPath, currentDescriptor.worker_policy_sha256, "policy"],
  ]) {
    if (typeof expectedDigest !== "string" || digestFile(path) !== expectedDigest) {
      throw new Error(`Current worker ${label} digest drifted.`);
    }
  }
  return renderWorkerPlist({
    appDescriptorPath,
    configPath: options.workerConfigPath,
    credentialPath: options.workerCredentialPath,
    currentPolicyPath: policyPath,
    expectedSchemaPath,
    homeDir: options.homeDir,
    manifestPath,
    nodeBin: options.nodeBin,
    rootDir: artifactRoot,
    secretRoot: options.workerSecretRoot,
  });
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function readProcessCwd({ pid, spawn = spawnSync }) {
  if (!Number.isInteger(pid) || pid < 1) throw new Error("Runtime pid is unavailable.");
  const result = spawn(
    "/usr/sbin/lsof",
    ["-a", "-p", String(pid), "-d", "cwd", "-Fn"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.status !== 0) throw new Error("Runtime cwd could not be resolved.");
  const claims = String(result.stdout ?? "").split(/\r?\n/u)
    .filter((line) => line.startsWith("n") && line.length > 1)
    .map((line) => realpathSync(line.slice(1)));
  if (claims.length !== 1) throw new Error("Runtime cwd evidence is ambiguous.");
  return claims[0];
}

/**
 * @param {{
 *   currentRuntimeBridge?: ({ previous_release_sha?: string } & Record<string, unknown>) | null,
 *   workerStatus?: { loaded?: boolean, state?: string, pid?: number | null } | null,
 *   currentWorkerPreflight?: { ready?: boolean, release_sha?: string } | null,
 * }} [options]
 */
export function allowFirstCanonicalAdoptionWorkerStandby({
  currentRuntimeBridge = null,
  workerStatus = null,
  currentWorkerPreflight = null,
} = {}) {
  return Boolean(
    currentRuntimeBridge
    && workerStatus?.loaded === true
    && ["spawn scheduled", "waiting"].includes(workerStatus?.state)
    && workerStatus?.pid === null
    && currentWorkerPreflight?.ready === true
    && currentWorkerPreflight?.release_sha === currentRuntimeBridge.previous_release_sha,
  );
}

function readFirstCanonicalPredecessorAppIdentity({
  appRoot,
  commandRunner,
  currentUid,
  pid,
}) {
  const runtimeCwd = readProcessCwd({ pid, spawn: commandRunner });
  if (runtimeCwd !== appRoot) {
    throw new Error("First canonical predecessor app runtime cwd drifted.");
  }
  const releaseSha = readGitRuntimeValue(
    commandRunner,
    appRoot,
    ["rev-parse", "HEAD"],
    "First canonical predecessor app SHA",
  );
  if (releaseSha !== FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA) {
    throw new Error("First canonical predecessor app SHA drifted.");
  }
  const releaseTree = readGitRuntimeValue(
    commandRunner,
    appRoot,
    ["rev-parse", "HEAD^{tree}"],
    "First canonical predecessor app tree",
  );
  const buildIdPath = resolve(appRoot, ".next", "BUILD_ID");
  assertSafeAncestors(appRoot, buildIdPath, currentUid, "First canonical predecessor build ID");
  const buildIdStat = lstatSync(buildIdPath);
  if (
    buildIdStat.isSymbolicLink()
    || !buildIdStat.isFile()
    || buildIdStat.uid !== currentUid
    || (modeBits(buildIdStat.mode) & 0o022) !== 0
    || realpathSync(buildIdPath) !== buildIdPath
  ) {
    throw new Error("First canonical predecessor build ID owner, mode, or path is unsafe.");
  }
  const buildId = readFileSync(buildIdPath, "utf8").trim();
  if (buildId.length === 0 || buildId.length > 256) {
    throw new Error("First canonical predecessor build ID is invalid.");
  }
  return Object.freeze({
    component: "app",
    ready: true,
    release_sha: releaseSha,
    release_tree: releaseTree,
    build_id: buildId,
    promotion_id: "first-canonical-predecessor-observed-v1",
    pid,
  });
}

function assertReadOnlyArtifactRoot(rootPath) {
  const root = realpathSync(rootPath);
  const visit = (path) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error("Worker artifact root contains a symlink.");
    if ((modeBits(stat.mode) & 0o222) !== 0) {
      throw new Error("Worker artifact root must be read-only.");
    }
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path)) visit(resolve(path, entry));
    } else if (!stat.isFile()) {
      throw new Error("Worker artifact root contains an unsupported entry.");
    }
  };
  visit(root);
  return root;
}

function sanitizedPath(nodeBin, dockerBin = null) {
  const paths = dockerBin
    ? [
        dirname(resolve(dockerBin)),
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
        dirname(resolve(nodeBin)),
      ]
    : [
        dirname(resolve(nodeBin)),
        "/opt/homebrew/bin",
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
        "/usr/sbin",
        "/sbin",
      ];
  return [...new Set(paths)].join(":");
}

function readGitRuntimeValue(commandRunner, cwd, args, label) {
  const result = commandRunner("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${label} could not be resolved.`);
  }
  const value = String(result.stdout ?? "").trim();
  if (!/^[0-9a-f]{40}$/u.test(value)) {
    throw new Error(`${label} must be an exact SHA.`);
  }
  return value;
}

function resolveFirstCanonicalAdoptionBridge(bridge, homeDir) {
  if (!bridge) return null;
  const expected = getFirstCanonicalAdoptionPathAuthority(homeDir);
  if (
    bridge.mode !== FIRST_CANONICAL_ADOPTION_BRIDGE_MODE
    || bridge.previous_release_sha !== FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA
    || bridge.full_local_source_sha !== FIRST_CANONICAL_ADOPTION_FULL_LOCAL_SOURCE_SHA
    || bridge.app_release_dir !== expected.app_release_dir
    || bridge.full_local_root !== expected.full_local_root
    || bridge.worker_artifact_root !== expected.worker_artifact_root
    || bridge.worker_manifest_path !== expected.worker_manifest_path
  ) {
    throw new Error("First canonical adoption bridge metadata is invalid.");
  }
  return Object.freeze({ ...expected });
}

function firstCanonicalAdoptionRestartContract() {
  return Object.freeze({
    includeReleaseIdentity: true,
    legacyContract: "first-canonical-adoption-start-v1",
    runtimeCommand: "start",
  });
}

function firstCanonicalPredecessorRestartContract() {
  return Object.freeze({
    includeReleaseIdentity: false,
    legacyContract: "first-canonical-predecessor-start-v1",
    runtimeCommand: "start",
  });
}

function assertFirstCanonicalAdoptionCurrentBundle(current, bridge) {
  if (!current || typeof current.stable_key !== "string" || current.stable_key.length === 0) {
    throw new Error("First canonical adoption runtime bundle did not produce stable evidence.");
  }
  const metadata = current.bridge;
  if (
    !metadata
    || metadata.mode !== FIRST_CANONICAL_ADOPTION_BRIDGE_MODE
    || metadata.app_release_dir !== bridge.app_release_dir
    || metadata.full_local_root !== bridge.full_local_root
    || metadata.full_local_source_sha !== bridge.full_local_source_sha
    || metadata.worker_artifact_root !== bridge.worker_artifact_root
    || metadata.worker_manifest_path !== bridge.worker_manifest_path
    || typeof metadata.app_release_dir !== "string"
    || metadata.app_release_dir.length === 0
    || typeof metadata.full_local_root !== "string"
    || metadata.full_local_root.length === 0
  ) {
    throw new Error("First canonical adoption bridge evidence is incomplete.");
  }
  if (
    current.app?.ready !== true
    || current.full_local?.ready !== true
    || current.youtube_worker?.ready !== true
  ) {
    throw new Error("First canonical adoption runtime bundle is not ready.");
  }
  for (const component of ["app", "full_local", "youtube_worker"]) {
    if (current[component]?.release_sha !== bridge.previous_release_sha) {
      throw new Error(`First canonical adoption ${component} predecessor SHA drifted.`);
    }
  }
  if (
    current.full_local.runtime_present !== true
    || current.full_local.healthy !== true
    || current.full_local.authorization_contract_status !== "PASS"
    || current.full_local.product_catalog_status !== "PASS"
  ) {
    throw new Error("First canonical adoption full-local health evidence is incomplete.");
  }
}

export function resolveFullLocalCurrentRestartContract(currentDescriptor) {
  if (
    currentDescriptor?.release_sha
    === "e02f02a87d1d955dc598728e7029a745a650a5c3"
  ) {
    return Object.freeze({
      includeReleaseIdentity: false,
      legacyContract: "e02f-full-local-v1",
      runtimeCommand: "start",
    });
  }
  if (currentDescriptor?.restart_capability === undefined) {
    const digestFields = [
      "execution_snapshot_digest",
      "source_manifest_sha256",
      "worker_artifact_sha256",
      "worker_app_descriptor_sha256",
      "worker_config_sha256",
      "worker_credential_sha256",
      "worker_expected_schema_sha256",
      "worker_policy_sha256",
    ];
    const pathFields = [
      "execution_app_root",
      "worker_artifact_root",
      "worker_manifest_path",
    ];
    if (
      currentDescriptor?.schema !== "homecook.local-mac-production-running-release.v1"
      || typeof currentDescriptor.release_tag !== "string"
      || !currentDescriptor.release_tag.startsWith("prod-")
      || !/^[0-9a-f]{40}$/u.test(currentDescriptor.release_sha ?? "")
      || !/^[0-9a-f]{40}$/u.test(currentDescriptor.release_tree ?? "")
      || typeof currentDescriptor.build_id !== "string"
      || currentDescriptor.build_id.length === 0
      || typeof currentDescriptor.promotion_id !== "string"
      || currentDescriptor.promotion_id.length === 0
      || Number.isNaN(Date.parse(currentDescriptor.promoted_at ?? ""))
      || digestFields.some((field) =>
        !/^[0-9a-f]{64}$/u.test(currentDescriptor[field] ?? ""))
      || pathFields.some((field) =>
        typeof currentDescriptor[field] !== "string"
        || !isAbsolute(currentDescriptor[field]))
    ) {
      throw new Error("Legacy full-local sealed v1 descriptor is incomplete.");
    }
    return Object.freeze({
      includeReleaseIdentity: true,
      legacyContract: "abac967-full-local-start-v1",
      runtimeCommand: "start",
    });
  }
  if (currentDescriptor.restart_capability !== FULL_LOCAL_RESUME_CURRENT_CAPABILITY) {
    throw new Error("Current full-local restart capability is unsupported.");
  }
  return Object.freeze({
    includeReleaseIdentity: false,
    legacyContract: null,
    runtimeCommand: "resume-current",
  });
}

function readFullLocalWorkloadDefault({
  context,
  options,
  checkPlist = true,
  allowLegacyBootstrap = false,
  allowSplitPredecessorIdentity = false,
  expectedIdentityOverride = null,
  statusConfigPathOverride = null,
  restartContract = null,
  commandRunner = spawnSync,
}) {
  const currentUid = process.getuid?.();
  if (!Number.isInteger(currentUid)) throw new Error("Current user uid is unavailable.");
  const expectedRestartContract = restartContract ?? {
    includeReleaseIdentity: false,
    runtimeCommand: "resume-current",
  };
  const releaseIdentityPath = context.releaseIdentityPath
    ? resolve(context.releaseIdentityPath)
    : resolve(context.releaseDir, "prepare.json");
  if (checkPlist) assertCanonicalLocalMacProductionPlist({
    actualPath: getFullLocalLaunchAgentPaths(context.homeDir).plistPath,
    currentUid,
    expectedContent: renderFullLocalLaunchAgentPlist({
      configPath: options.fullLocalConfigPath,
      frozenConfigRoot: options.frozenRuntimeInputRoot ?? null,
      currentDescriptorPath: getLocalMacProductionReleasePaths(context.homeDir)
        .currentDescriptorPath,
      homeDir: context.homeDir,
      nodeBin: options.nodeBin,
      releaseIdentityPath,
      rootDir: context.releaseDir,
      runtimeCommand: expectedRestartContract.runtimeCommand,
      includeReleaseIdentity: expectedRestartContract.includeReleaseIdentity,
    }),
    expectedMode: 0o600,
    label: "Full-local plist",
    trustedRoot: context.homeDir,
  });
  const expectedIdentity = expectedIdentityOverride
    ? {
        ...expectedIdentityOverride,
        component: "full_local",
      }
    : readLocalMacProductionPreparedReleaseIdentity({
        component: "full_local",
        releaseDir: dirname(releaseIdentityPath),
        runCommand: commandRunner,
      });
  const runtimeRoot = allowLegacyBootstrap ? context.rootDir : context.releaseDir;
  const statusConfigPath = statusConfigPathOverride ?? options.fullLocalConfigPath;
  const runtimeArgs = [
      resolve(runtimeRoot, "scripts", "full-local-production-runtime.mjs"),
      "status",
      "--config",
      statusConfigPath,
  ];
  if (expectedRestartContract.includeReleaseIdentity
    || expectedRestartContract.runtimeCommand === "resume-current"
    || allowLegacyBootstrap) {
    runtimeArgs.push("--release-identity", releaseIdentityPath);
  }
  if (allowLegacyBootstrap) runtimeArgs.push("--allow-legacy-release-bootstrap");
  const result = commandRunner(
    options.nodeBin,
    runtimeArgs,
    {
      cwd: runtimeRoot,
      encoding: "utf8",
      env: {
        HOME: context.homeDir,
        PATH: sanitizedPath(options.nodeBin, options.dockerBin),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    throw new Error("Full-local Docker workload status failed.");
  }
  let status;
  try {
    status = JSON.parse(String(result.stdout ?? ""));
  } catch {
    throw new Error("Full-local Docker workload status was invalid.");
  }
  const observedIdentity = status.release_identity
    ?? (allowSplitPredecessorIdentity ? expectedIdentity : null);
  if (
    !observedIdentity
    || observedIdentity.release_sha !== expectedIdentity.release_sha
    || (!allowSplitPredecessorIdentity && (
      observedIdentity.release_tree !== expectedIdentity.release_tree
      || observedIdentity.build_id !== expectedIdentity.build_id
      || observedIdentity.promotion_id !== expectedIdentity.promotion_id
    ))
  ) {
    throw new Error("Full-local Docker workload release identity mismatch.");
  }
  return {
    ...observedIdentity,
    ready:
      status.healthy === true
      && status.authorization_contract_status === "PASS"
      && status.product_catalog_status === "PASS",
    runtime_present: status.healthy === true,
    healthy: status.healthy === true,
    authorization_contract_status: status.authorization_contract_status,
    product_catalog_status: status.product_catalog_status,
    workload_digest: buildFullLocalWorkloadStableDigest(status),
  };
}

async function readI031PreflightDefault(
  options,
  userId,
  preflightVerifier = verifyStandaloneYoutubeI031Preflight,
) {
  const configPath = validateYoutubeExtractionWorkerConfigPath(options.workerConfigPath, {
    expectedUserId: userId,
    secretRoot: options.workerSecretRoot,
  });
  const workerConfig = await readWorkerEnvironment(configPath);
  const providerSecretPath = validateYoutubeExtractionWorkerSecretFile(
    workerConfig.HOMECOOK_YOUTUBE_WORKER_PROVIDER_SECRET_FILE,
    { expectedUserId: userId, secretRoot: options.workerSecretRoot },
  );
  const providerEnvironment = await readWorkerProviderEnvironment(providerSecretPath);
  const result = await preflightVerifier({
    workerEnv: sanitizeYoutubeExtractionChildEnvironment(
      { ...process.env, ...providerEnvironment },
      { HOME: options.homeDir },
    ),
    expectedUserId: userId,
  });
  return {
    ready: true,
    codexCliVersion: result.codexCliVersion,
    chatGptLogin: true,
    toolsReady: true,
  };
}

function requireFunction(value, label) {
  if (typeof value !== "function") {
    throw new Error(`${label} dependency is not configured.`);
  }
  return value;
}

function freezeLocalMacProductionRuntimeInputsUnsafe({ options, preflight, releaseManifestBytes, releaseManifestDigest, scratchRoot }) {
  const currentUid = process.getuid?.();
  if (!Number.isInteger(currentUid)) throw new Error("Current user uid is unavailable for runtime input freeze.");
  const scratch = assertPrivateRuntimeDirectory(scratchRoot, "Promotion scratch root", currentUid);
  if (!Buffer.isBuffer(releaseManifestBytes)
    || sha256Bytes(releaseManifestBytes) !== releaseManifestDigest
    || !/^[0-9a-f]{64}$/u.test(releaseManifestDigest ?? "")) {
    throw new Error("Frozen release manifest bytes or digest are invalid.");
  }
  const worker = preflight?.worker;
  if (!worker) throw new Error("Worker preflight authority is required for runtime input freeze.");
  const attestationFields = [
    ["attestation_bundle", "bundlePath", "bundlePath"],
    ["attestation_subject", "subjectManifestPath", "subjectManifestPath"],
    ["attestation_trusted_root", "trustedRootPath", "trustedRootPath"],
  ];
  const attestationSnapshots = attestationFields.map(([label, workerField, optionField]) => {
    const sourcePath = resolve(worker.resumeAuthority?.[workerField] ?? "");
    if (!sourcePath || sourcePath !== resolve(options[optionField] ?? "")) {
      throw new Error("Attestation authority path differs from preflight authority.");
    }
    assertPrivateRuntimeDirectory(dirname(sourcePath), "Attestation authority parent", currentUid);
    return { label, snapshot: readPrivateRuntimeInput(sourcePath, "Attestation authority input", currentUid) };
  });
  const attestationAuthorityRoot = resolve(options.rootDir ?? "");
  if (!options.rootDir || attestationSnapshots.some(({ snapshot }) => {
    const relativePath = relative(attestationAuthorityRoot, snapshot.path);
    return relativePath.startsWith("..") || isAbsolute(relativePath);
  })) {
    throw new Error("Attestation authority inputs escape the approved release authority root.");
  }
  const fullLocalConfig = readPrivateRuntimeInput(options.fullLocalConfigPath, "Full-local config", currentUid);
  const fullLocalConfigText = fullLocalConfig.bytes.toString("utf8");
  if ((fullLocalConfigText.match(/^FULL_LOCAL_SECRET_DIR=/gmu) ?? []).length !== 1) {
    throw new Error("Full-local config must contain exactly one FULL_LOCAL_SECRET_DIR.");
  }
  const parsedFullLocalConfig = parseFullLocalProductionConfig(fullLocalConfigText);
  if (!isAbsolute(parsedFullLocalConfig.FULL_LOCAL_SECRET_DIR ?? "")) {
    throw new Error("Full-local secret root must be an absolute approved path.");
  }
  const fullLocalSecretSourceRoot = resolve(parsedFullLocalConfig.FULL_LOCAL_SECRET_DIR);
  assertSafeAncestors(options.homeDir, join(fullLocalSecretSourceRoot, "placeholder"), currentUid, "Full-local secret root");
  const expectedFullLocalSecretNames = parsedFullLocalConfig.FULL_LOCAL_ENABLE_SOCIAL_PROVIDERS === "true"
    ? [...FULL_LOCAL_SECRET_NAMES, ...FULL_LOCAL_OAUTH_SECRET_NAMES]
    : [...FULL_LOCAL_SECRET_NAMES];
  const fullLocalSecretTree = collectExactFullLocalSecretFiles(fullLocalSecretSourceRoot, currentUid, expectedFullLocalSecretNames);
  const workerConfig = readPrivateRuntimeInput(worker.configPath, "Worker config", currentUid);
  const workerCredential = readPrivateRuntimeInput(worker.credentialPath, "Worker credential", currentUid);
  if (fullLocalConfig.identity.sha256 !== preflight.full_local_config_sha256
    || workerConfig.identity.sha256 !== worker.configSha256
    || workerCredential.identity.sha256 !== worker.credentialSha256) {
    throw new Error("External runtime input digest differs from preflight authority.");
  }
  const secretTree = collectPrivateRuntimeFiles(worker.secretRoot, currentUid);
  const sourceRecordsByPath = new Map();
  const sourceSnapshotsByPath = new Map();
  const sourceRootsByPath = new Map();
  for (const [label, snapshot] of [["full_local_config", fullLocalConfig], ["worker_config", workerConfig], ["worker_credential", workerCredential]]) {
    sourceRecordsByPath.set(snapshot.path, { label, path: snapshot.path, identity: snapshot.identity });
    sourceSnapshotsByPath.set(snapshot.path, snapshot);
    sourceRootsByPath.set(
      snapshot.path,
      label === "full_local_config" ? options.homeDir : secretTree.root,
    );
  }
  for (const snapshot of secretTree.records) {
    sourceRecordsByPath.set(snapshot.path, { label: "worker_secret", path: snapshot.path, identity: snapshot.identity });
    sourceSnapshotsByPath.set(snapshot.path, snapshot);
    sourceRootsByPath.set(snapshot.path, secretTree.root);
  }
  for (const snapshot of fullLocalSecretTree.records) {
    sourceRecordsByPath.set(snapshot.path, { label: "full_local_secret", path: snapshot.path, identity: snapshot.identity });
    sourceSnapshotsByPath.set(snapshot.path, snapshot);
    sourceRootsByPath.set(snapshot.path, options.homeDir);
  }
  for (const { label, snapshot } of attestationSnapshots) {
    sourceRecordsByPath.set(snapshot.path, { label, path: snapshot.path, identity: snapshot.identity });
    sourceSnapshotsByPath.set(snapshot.path, snapshot);
    sourceRootsByPath.set(snapshot.path, attestationAuthorityRoot);
  }

  const sourceDirectoryRegistry = createPrivateSourceDirectoryRegistry(
    sourceRootsByPath,
    currentUid,
  );
  const sourceDirectories = sourceDirectoryRegistry.records();

  const frozenRoot = join(scratch, "runtime-inputs");
  try {
  sourceDirectoryRegistry.assertStable();
  for (const [path, snapshot] of sourceSnapshotsByPath.entries()) {
    const current = readPrivateRuntimeInput(path, "Reserved runtime input source", currentUid);
    if (!sameRuntimeInputIdentity(current.identity, snapshot.identity)) {
      throw new Error("Runtime input source identity changed after ancestor reservation.");
    }
  }
  mkdirSync(frozenRoot, { mode: 0o700 });
  const frozenSecretRoot = join(frozenRoot, "worker-secrets");
  mkdirSync(frozenSecretRoot, { mode: 0o700 });
  const frozenFullLocalSecretRoot = join(frozenRoot, "full-local-secrets");
  mkdirSync(frozenFullLocalSecretRoot, { mode: 0o700 });
  const frozenBySource = new Map();
  for (const snapshot of secretTree.records) {
    const relativePath = relative(secretTree.root, snapshot.path);
    const destination = join(frozenSecretRoot, relativePath);
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    writeFrozenRuntimeFile(destination, snapshot.bytes, snapshot.identity.mode);
    frozenBySource.set(snapshot.path, destination);
  }
  for (const snapshot of fullLocalSecretTree.records) {
    const destination = join(frozenFullLocalSecretRoot, relative(fullLocalSecretTree.root, snapshot.path));
    writeFrozenRuntimeFile(destination, snapshot.bytes, snapshot.identity.mode);
    frozenBySource.set(snapshot.path, destination);
  }
  const materializeStandalone = (snapshot, name) => {
    if (frozenBySource.has(snapshot.path)) return frozenBySource.get(snapshot.path);
    const destination = join(frozenRoot, name);
    writeFrozenRuntimeFile(destination, snapshot.bytes, snapshot.identity.mode);
    frozenBySource.set(snapshot.path, destination);
    return destination;
  };
  const fullLocalConfigPath = join(frozenRoot, "full-local-production.env");
  const frozenFullLocalConfigBytes = Buffer.from(fullLocalConfigText.replace(
    /^FULL_LOCAL_SECRET_DIR=.*$/mu,
    `FULL_LOCAL_SECRET_DIR=${frozenFullLocalSecretRoot}`,
  ));
  writeFrozenRuntimeFile(fullLocalConfigPath, frozenFullLocalConfigBytes, fullLocalConfig.identity.mode);
  frozenBySource.set(fullLocalConfig.path, fullLocalConfigPath);
  const workerConfigPath = materializeStandalone(workerConfig, "worker.env");
  const workerCredentialPath = materializeStandalone(workerCredential, "credential.json");
  const releaseManifestPath = writeFrozenRuntimeFile(
    join(frozenRoot, "release-manifest.json"),
    releaseManifestBytes,
    0o600,
  );
  const frozenAttestationPaths = Object.fromEntries(attestationSnapshots.map(({ label, snapshot }) => {
    const name = `${label.replaceAll("_", "-")}${label.endsWith("root") || label.endsWith("bundle") ? ".jsonl" : ".json"}`;
    return [label, writeFrozenRuntimeFile(join(frozenRoot, name), snapshot.bytes, snapshot.identity.mode)];
  }));
  const rewriteSecretRoot = (path) => {
    const bytes = readFileSync(path);
    const rewritten = Buffer.from(bytes.toString("utf8").replaceAll(secretTree.root, frozenSecretRoot));
    if (!bytes.equals(rewritten)) writeFileSync(path, rewritten);
  };
  rewriteSecretRoot(workerConfigPath);
  rewriteSecretRoot(workerCredentialPath);
  const sourceRecords = [...sourceRecordsByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
  const frozenInventory = buildFrozenRuntimeInventory(frozenRoot);
  const sourceIdentityDigest = sha256Text(JSON.stringify({
    directories: sourceDirectories.map(({ label, identity }) => ({ label, identity })),
    files: sourceRecords.map(({ label, identity }) => ({ label, identity })),
  }));
  const frozenInventoryDigest = sha256Text(JSON.stringify(frozenInventory));
  const authorityDigest = sha256Text(JSON.stringify({ source_identity_digest: sourceIdentityDigest, frozen_inventory_digest: frozenInventoryDigest }));
  sourceDirectoryRegistry.assertStable();
  return Object.freeze({
    schema: FROZEN_RUNTIME_INPUT_SCHEMA,
    authority_digest: authorityDigest,
    frozen_inventory_digest: frozenInventoryDigest,
    root: frozenRoot,
    source_identity_digest: sourceIdentityDigest,
    source_directories: Object.freeze(sourceDirectories.map((entry) => Object.freeze(entry))),
    source_records: Object.freeze(sourceRecords.map((entry) => Object.freeze(entry))),
    paths: Object.freeze({
      attestationBundlePath: frozenAttestationPaths.attestation_bundle,
      attestationSubjectPath: frozenAttestationPaths.attestation_subject,
      attestationTrustedRootPath: frozenAttestationPaths.attestation_trusted_root,
      fullLocalConfigPath,
      fullLocalSecretRoot: frozenFullLocalSecretRoot,
      releaseManifestPath,
      workerConfigPath,
      workerCredentialPath,
      workerSecretRoot: frozenSecretRoot,
    }),
    digests: Object.freeze({
      fullLocalConfigSha256: sha256File(fullLocalConfigPath),
      attestationBundleSha256: sha256File(frozenAttestationPaths.attestation_bundle),
      attestationSubjectSha256: sha256File(frozenAttestationPaths.attestation_subject),
      attestationTrustedRootSha256: sha256File(frozenAttestationPaths.attestation_trusted_root),
      releaseManifestSha256: sha256File(releaseManifestPath),
      workerConfigSha256: sha256File(workerConfigPath),
      workerCredentialSha256: sha256File(workerCredentialPath),
    }),
  });
  } catch (error) {
    if (existsSync(frozenRoot)) rmSync(frozenRoot, { recursive: true, force: true });
    throw error;
  } finally {
    sourceDirectoryRegistry.close();
  }
}

export function freezeLocalMacProductionRuntimeInputs(input) {
  try {
    return freezeLocalMacProductionRuntimeInputsUnsafe(input);
  } catch (error) {
    throw new Error(
      "runtime_input_freeze_failed: external runtime input authority is invalid.",
      { cause: error },
    );
  }
}

function verifyLocalMacProductionFrozenRuntimeInputsUnsafe(frozen, { checkSources = true } = {}) {
  if (!frozen || frozen.schema !== FROZEN_RUNTIME_INPUT_SCHEMA || !/^[0-9a-f]{64}$/u.test(frozen.authority_digest ?? "")) {
    throw new Error("Frozen runtime input authority is incomplete.");
  }
  assertPrivateRuntimeDirectory(frozen.root, "Frozen runtime input root");
  for (const [label, path] of Object.entries(frozen.paths ?? {})) {
    const canonical = realpathSync(path);
    const relativePath = relative(frozen.root, canonical);
    if (relativePath === "" || relativePath.startsWith("..") || isAbsolute(relativePath)) {
      throw new Error(`Frozen runtime input ${label} escapes its private root.`);
    }
  }
  const frozenInventory = buildFrozenRuntimeInventory(frozen.root);
  const frozenInventoryDigest = sha256Text(JSON.stringify(frozenInventory));
  if (frozenInventoryDigest !== frozen.frozen_inventory_digest) throw new Error("Frozen runtime input bytes drifted.");
  if (checkSources) {
    for (const source of frozen.source_directories ?? []) {
      const current = snapshotPrivateRuntimeDirectoryIdentity(source.path, `Frozen source ${source.label}`);
      if (!sameRuntimeInputIdentity(current.identity, source.identity)) throw new Error("External runtime input ancestor identity changed after freeze.");
    }
    for (const source of frozen.source_records) {
      const current = readPrivateRuntimeInput(source.path, `Frozen source ${source.label}`);
      if (!sameRuntimeInputIdentity(current.identity, source.identity)) throw new Error("External runtime input source identity changed after freeze.");
    }
  }
  const sourceIdentityDigest = sha256Text(JSON.stringify({
    directories: (frozen.source_directories ?? []).map(({ label, identity }) => ({ label, identity })),
    files: frozen.source_records.map(({ label, identity }) => ({ label, identity })),
  }));
  const authorityDigest = sha256Text(JSON.stringify({ source_identity_digest: sourceIdentityDigest, frozen_inventory_digest: frozenInventoryDigest }));
  if (sourceIdentityDigest !== frozen.source_identity_digest || authorityDigest !== frozen.authority_digest) throw new Error("Frozen runtime input authority digest drifted.");
  return frozen;
}

export function verifyLocalMacProductionFrozenRuntimeInputs(frozen, options) {
  try {
    return verifyLocalMacProductionFrozenRuntimeInputsUnsafe(frozen, options);
  } catch (error) {
    throw new Error(RUNTIME_INPUT_SOURCE_CHANGED_PUBLIC_ERROR, { cause: error });
  }
}

export function cleanupLocalMacProductionFrozenRuntimeInputs(frozen) {
  verifyLocalMacProductionFrozenRuntimeInputs(frozen, { checkSources: false });
  rmSync(frozen.root, { recursive: true, force: false });
  return Object.freeze({ cleaned: true, authority_digest: frozen.authority_digest });
}

function assertExactIdentity(component, state, expected) {
  if (!state || state.ready !== true) {
    throw new Error(`Current ${component} runtime is not ready.`);
  }
  if (
    state.release_sha !== expected.release_sha
    || state.release_tree !== expected.release_tree
    || state.build_id !== expected.build_id
    || state.promotion_id !== expected.promotion_id
  ) {
    throw new Error(`Current ${component} runtime identity drifted from the current descriptor.`);
  }
}

const WORKER_PATH_AUTHORITY_FIELDS = Object.freeze([
  "artifactRoot",
  "manifestPath",
  "appDescriptorPath",
  "configPath",
  "credentialPath",
  "expectedSchemaPath",
  "policyPath",
  "secretRoot",
  "artifactSha256",
  "appDescriptorSha256",
  "configSha256",
  "credentialSha256",
  "expectedSchemaSha256",
  "policySha256",
]);

function assertWorkerPathAuthority(worker) {
  if (!worker || WORKER_PATH_AUTHORITY_FIELDS.some(
    (field) => typeof worker[field] !== "string" || worker[field].length === 0,
  )) {
    throw new Error("Worker path authority is incomplete.");
  }
  return Object.fromEntries(WORKER_PATH_AUTHORITY_FIELDS.map((field) => [
    field,
    worker[field],
  ]));
}

function verifySealedExecutionContext(context) {
  if (
    typeof context?.verifyExecutionSnapshot !== "function"
    || !context.executionSnapshot
  ) {
    throw new Error("Sealed execution snapshot verifier is not configured.");
  }
  return context.verifyExecutionSnapshot(context.executionSnapshot);
}

function observedRehearsalRuntimeAuthority(context) {
  const snapshot = verifySealedExecutionContext(context);
  if (!/^[0-9a-f]{64}$/u.test(snapshot.sealedBundleDigest ?? "")
    || !/^[0-9a-f]{64}$/u.test(snapshot.repeatabilityReceiptDigest ?? "")) {
    throw new Error("Observed frozen runtime rehearsal authority is missing.");
  }
  return {
    sealed_bundle_digest: snapshot.sealedBundleDigest,
    repeatability_receipt_digest: snapshot.repeatabilityReceiptDigest,
  };
}

function buildDefaultDependencies(
  commandRunner = spawnSync,
  i031PreflightVerifier = verifyStandaloneYoutubeI031Preflight,
  appReadinessWaiter = waitForLocalMacProductionReady,
  platform = process.platform,
) {
  return {
    readFullLocalConfigEvidence: ({ options }) => {
      const currentUid = process.getuid?.();
      if (!Number.isInteger(currentUid)) throw new Error("Current user uid is unavailable.");
      return readCanonicalFullLocalConfigEvidence({ currentUid, options });
    },
    validateMutationTargets: ({ options }) => {
      const currentUid = process.getuid?.();
      if (!Number.isInteger(currentUid)) throw new Error("Current user uid is unavailable.");
      readCanonicalFullLocalConfigEvidence({ currentUid, options });
      readPlistSnapshot(getLocalMacProductionPaths(options.homeDir).plistPath, {
        currentUid,
        expectedMode: 0o644,
        label: "App plist target",
        trustedRoot: options.homeDir,
      });
      readPlistSnapshot(getFullLocalLaunchAgentPaths(options.homeDir).plistPath, {
        currentUid,
        expectedMode: 0o600,
        label: "Full-local plist target",
        trustedRoot: options.homeDir,
      });
      readPlistSnapshot(getYoutubeExtractionWorkerPaths(options.homeDir).plistPath, {
        currentUid,
        expectedMode: 0o600,
        label: "YouTube worker plist target",
        trustedRoot: options.homeDir,
      });
    },

    readWorkerReleasePreflight: async ({ context, options }) => {
      const userId = process.getuid?.();
      if (!Number.isInteger(userId)) throw new Error("Current user uid is unavailable.");
      const fullLocalConfig = readCanonicalFullLocalConfigEvidence({
        currentUid: userId,
        options,
      });
      validateYoutubeExtractionWorkerSecretRoot(options.workerSecretRoot, {
        expectedUserId: userId,
      });
      validateYoutubeExtractionWorkerSecretFile(options.workerCredentialPath, {
        expectedUserId: userId,
        secretRoot: options.workerSecretRoot,
      });
      const sealedWorkerRoot = context.sealedCandidate?.workerRoot ?? null;
      const workerManifestPath = sealedWorkerRoot
        ? resolve(sealedWorkerRoot, "artifact.json")
        : options.workerManifestPath;
      const expectedSchemaPath = sealedWorkerRoot
        ? resolve(sealedWorkerRoot, "scripts", "manifests", "youtube-extraction-expected-schema.json")
        : options.workerExpectedSchemaPath;
      const artifactRoot = assertReadOnlyArtifactRoot(dirname(workerManifestPath));
      if (artifactRoot === realpathSync(context.releaseDir)) {
        throw new Error("Worker artifact root must remain separate from the app release candidate.");
      }
      const inputs = loadYoutubeExtractionWorkerRuntimeInputs({
        appDescriptorPath: options.workerAppDescriptorPath,
        workerArtifactPath: workerManifestPath,
        currentPolicyPath: options.workerPolicyPath,
        credentialPath: options.workerCredentialPath,
        expectedSchemaPath,
        secretRoot: options.workerSecretRoot,
      });
      const preflight = evaluateYoutubeExtractionWorkerPreflight(inputs);
      const i031Preflight = await readI031PreflightDefault(
        options,
        userId,
        i031PreflightVerifier,
      );
      return {
        artifactRoot,
        manifestPath: realpathSync(workerManifestPath),
        appDescriptorPath: realpathSync(options.workerAppDescriptorPath),
        configPath: realpathSync(options.workerConfigPath),
        credentialPath: realpathSync(options.workerCredentialPath),
        expectedSchemaPath: realpathSync(expectedSchemaPath),
        policyPath: realpathSync(options.workerPolicyPath),
        secretRoot: realpathSync(options.workerSecretRoot),
        artifactSha256: inputs.workerArtifact.artifact_sha256,
        appDescriptorSha256: sha256File(options.workerAppDescriptorPath),
        configSha256: sha256File(options.workerConfigPath),
        credentialSha256: sha256File(options.workerCredentialPath),
        expectedSchemaSha256: sha256File(expectedSchemaPath),
        policySha256: sha256File(options.workerPolicyPath),
        fullLocalConfigSha256: fullLocalConfig.digest,
        resumeAuthority: {
          bundlePath: resolve(options.bundlePath),
          subjectManifestPath: resolve(options.subjectManifestPath),
          trustedRootPath: resolve(options.trustedRootPath),
        },
        i031Preflight,
        inputs,
        preflight,
        userId,
      };
    },

    readCurrentRuntimeBundle: async ({ context, options }) => {
      const currentUid = process.getuid?.();
      if (!Number.isInteger(currentUid)) throw new Error("Current user uid is unavailable.");
      const appPlistPath = getLocalMacProductionPaths(options.homeDir).plistPath;
      const currentRuntimeBridge = resolveFirstCanonicalAdoptionBridge(
        context.currentRuntimeBridge ?? null,
        options.homeDir,
      );
      const rawAppPlist = readPlistSnapshot(appPlistPath, {
        currentUid,
        expectedMode: 0o644,
        label: "Current app plist",
        trustedRoot: options.homeDir,
      });
      const currentReleaseDir = currentRuntimeBridge
        ? currentRuntimeBridge.app_release_dir
        : realpathSync(context.currentReleaseDir);
      if (
        currentRuntimeBridge
        && realpathSync(rawAppPlist.workingDirectory) !== currentRuntimeBridge.app_release_dir
      ) {
        throw new Error("Current app root drifted from the first canonical adoption bridge.");
      }
      const appPlist = assertCanonicalLocalMacProductionPlist({
        actualPath: appPlistPath,
        currentUid,
        expectedContent: renderLocalMacProductionPlist({
          homeDir: options.homeDir,
          nodeBin: options.nodeBin,
          rootDir: currentReleaseDir,
        }),
        expectedMode: 0o644,
        label: "Current app plist",
        trustedRoot: options.homeDir,
      });
      const fullLocalPlistPath = getFullLocalLaunchAgentPaths(options.homeDir).plistPath;
      const fullLocalRestartContract = currentRuntimeBridge
        ? firstCanonicalPredecessorRestartContract()
        : resolveFullLocalCurrentRestartContract(context.currentDescriptor);
      const rawFullLocalPlist = readPlistSnapshot(fullLocalPlistPath, {
        currentUid,
        expectedMode: 0o600,
        label: "Current full-local plist",
        trustedRoot: options.homeDir,
      });
      const fullLocalRuntimeRoot = currentRuntimeBridge
        ? currentRuntimeBridge.full_local_root
        : currentReleaseDir;
      if (
        currentRuntimeBridge
        && realpathSync(rawFullLocalPlist.workingDirectory) !== currentRuntimeBridge.full_local_root
      ) {
        throw new Error("Current full-local root drifted from the first canonical adoption bridge.");
      }
      const observedFullLocalConfigPath = argumentValue(rawFullLocalPlist.args, "--config");
      const currentFullLocalConfigPath = currentRuntimeBridge
        ? resolve(
            currentRuntimeBridge.full_local_root,
            "infra/full-local-supabase/.env.production.local",
          )
        : resolve(observedFullLocalConfigPath ?? "");
      if (!currentRuntimeBridge
        && context.currentDescriptor.restart_capability === FULL_LOCAL_RESUME_CURRENT_CAPABILITY) {
        const currentConfig = readPrivateRuntimeInput(
          currentFullLocalConfigPath,
          "Current frozen full-local config",
          currentUid,
        );
        if (currentConfig.identity.sha256 !== context.currentDescriptor.full_local_config_sha256) {
          throw new Error("Current frozen full-local config digest drifted from the descriptor.");
        }
      }
      const fullLocalPlist = assertCanonicalLocalMacProductionPlist({
        actualPath: fullLocalPlistPath,
        currentUid,
        expectedContent: renderFullLocalLaunchAgentPlist({
          configPath: currentFullLocalConfigPath,
          frozenConfigRoot: currentRuntimeBridge ? null : dirname(currentFullLocalConfigPath),
          currentDescriptorPath: getLocalMacProductionReleasePaths(options.homeDir)
            .currentDescriptorPath,
          homeDir: options.homeDir,
          includeReleaseIdentity: fullLocalRestartContract.includeReleaseIdentity,
          nodeBin: options.nodeBin,
          releaseIdentityPath: resolve(currentReleaseDir, "prepare.json"),
          rootDir: fullLocalRuntimeRoot,
          runtimeCommand: fullLocalRestartContract.runtimeCommand,
        }),
        expectedMode: 0o600,
        label: "Current full-local plist",
        trustedRoot: options.homeDir,
      });
      const workerPlist = readPlistSnapshot(
        getYoutubeExtractionWorkerPaths(options.homeDir).plistPath,
        {
          currentUid,
          expectedMode: 0o600,
          label: "Current YouTube worker plist",
          trustedRoot: options.homeDir,
        },
      );
      if (
        realpathSync(appPlist.workingDirectory) !== currentReleaseDir
        || realpathSync(fullLocalPlist.workingDirectory) !== fullLocalRuntimeRoot
      ) {
        throw new Error("Current app/full-local plist working directory drifted.");
      }
      const currentFullLocalConfig = argumentValue(fullLocalPlist.args, "--config");
      if (
        !currentFullLocalConfig
        || realpathSync(currentFullLocalConfig) !== realpathSync(currentFullLocalConfigPath)
      ) {
        throw new Error("Current full-local plist config path drifted.");
      }

      const appStatus = readLocalMacProductionStatus({ spawn: commandRunner });
      if (!appStatus.running || !Number.isInteger(appStatus.pid)) {
        throw new Error("Current app runtime is not running.");
      }
      const app = currentRuntimeBridge
        ? readFirstCanonicalPredecessorAppIdentity({
            appRoot: currentReleaseDir,
            commandRunner,
            currentUid,
            pid: appStatus.pid,
          })
        : readLocalMacProductionRuntimeIdentity({
            component: "app",
            expectedReleaseDir: currentReleaseDir,
            pid: appStatus.pid,
            runCommand: commandRunner,
          });
      const fullLocal = readFullLocalWorkloadDefault({
        context: {
          ...context,
          homeDir: options.homeDir,
          releaseDir: fullLocalRuntimeRoot,
          releaseIdentityPath: resolve(currentReleaseDir, "prepare.json"),
        },
        options: {
          ...options,
          fullLocalConfigPath: currentFullLocalConfigPath,
          frozenRuntimeInputRoot: currentRuntimeBridge
            ? null
            : dirname(currentFullLocalConfigPath),
        },
        commandRunner,
        allowSplitPredecessorIdentity: Boolean(currentRuntimeBridge),
        expectedIdentityOverride: currentRuntimeBridge ? app : null,
        statusConfigPathOverride: currentRuntimeBridge ? options.fullLocalConfigPath : null,
        allowLegacyBootstrap:
          !currentRuntimeBridge
          && context.currentDescriptor.release_sha
            === "e02f02a87d1d955dc598728e7029a745a650a5c3",
        restartContract: fullLocalRestartContract,
      });
      if (
        currentRuntimeBridge
        && readGitRuntimeValue(
          commandRunner,
          fullLocalRuntimeRoot,
          ["rev-parse", "HEAD"],
          "Current full-local source SHA",
        ) !== currentRuntimeBridge.full_local_source_sha
      ) {
        throw new Error("Current full-local source SHA drifted from the first canonical adoption bridge.");
      }

      const actualWorkerManifestPath = argumentValue(workerPlist.args, "--manifest");
      if (!actualWorkerManifestPath) {
        throw new Error("Current worker plist manifest path is missing.");
      }
      const legacyBootstrap = !currentRuntimeBridge
        && context.currentDescriptor.release_sha
          === "e02f02a87d1d955dc598728e7029a745a650a5c3";
      const workerManifestPath = legacyBootstrap
        ? actualWorkerManifestPath
        : (currentRuntimeBridge
          ? currentRuntimeBridge.worker_manifest_path
          : context.currentDescriptor.worker_manifest_path);
      const workerArtifactRoot = legacyBootstrap
        ? realpathSync(dirname(actualWorkerManifestPath))
        : (currentRuntimeBridge
          ? currentRuntimeBridge.worker_artifact_root
          : context.currentDescriptor.worker_artifact_root);
      if (typeof workerManifestPath !== "string" || typeof workerArtifactRoot !== "string") {
        throw new Error("Current descriptor is missing worker artifact path authority.");
      }
      if (
        currentRuntimeBridge
        && (
          realpathSync(actualWorkerManifestPath) !== currentRuntimeBridge.worker_manifest_path
          || realpathSync(dirname(actualWorkerManifestPath))
            !== currentRuntimeBridge.worker_artifact_root
        )
      ) {
        throw new Error("Current worker root or manifest drifted from the first canonical adoption bridge.");
      }
      assertReadOnlyArtifactRoot(workerArtifactRoot);
      if (realpathSync(workerPlist.workingDirectory) !== workerArtifactRoot) {
        throw new Error("Current worker plist artifact root drifted.");
      }
      const serviceTarget = buildYoutubeExtractionWorkerServiceTarget({ userId: currentUid });
      const workerRaw = commandRunner("/bin/launchctl", ["print", serviceTarget], {
        encoding: "utf8",
      });
      const workerStatus = parseLaunchctlPrintStatus({
        serviceTarget,
        status: workerRaw.status,
        stderr: workerRaw.stderr,
        stdout: workerRaw.stdout,
      });
      const currentWorkerPaths = legacyBootstrap || currentRuntimeBridge
        ? {
          appDescriptorPath: argumentValue(workerPlist.args, "--app-descriptor"),
          configPath: argumentValue(workerPlist.args, "--config"),
          workerArtifactPath: workerManifestPath,
          currentPolicyPath: argumentValue(workerPlist.args, "--policy"),
          credentialPath: argumentValue(workerPlist.args, "--credential"),
          expectedSchemaPath: argumentValue(workerPlist.args, "--expected-schema"),
          secretRoot: argumentValue(workerPlist.args, "--secret-root"),
        }
        : {
          appDescriptorPath: resolve(dirname(workerArtifactRoot), "authority", "app-descriptor.json"),
          configPath: argumentValue(workerPlist.args, "--config"),
          workerArtifactPath: workerManifestPath,
          currentPolicyPath: resolve(dirname(workerArtifactRoot), "authority", "policy.json"),
          credentialPath: argumentValue(workerPlist.args, "--credential"),
          expectedSchemaPath: resolve(dirname(workerArtifactRoot), "authority", "expected-schema.json"),
          secretRoot: argumentValue(workerPlist.args, "--secret-root"),
        };
      if (Object.values(currentWorkerPaths).some((value) => !value)) {
        throw new Error("Current worker plist runtime paths are incomplete.");
      }
      const currentWorkerPreflight = legacyBootstrap
        ? {
          ...evaluateYoutubeExtractionWorkerPreflight(
            loadYoutubeExtractionWorkerRuntimeInputs({
              ...currentWorkerPaths,
              expectedSchemaPath: null,
            }),
          ),
          legacy_bootstrap: true,
          legacy_bootstrap_contract: "e02f-worker-v1",
        }
        : evaluateYoutubeExtractionWorkerPreflight(
          loadYoutubeExtractionWorkerRuntimeInputs({
            ...currentWorkerPaths,
            workerArtifactVerificationOptions: currentRuntimeBridge
              ? {
                allowLegacyReleaseSha: currentRuntimeBridge.previous_release_sha,
                allowFirstCanonicalAdoptionInventory: true,
              }
              : null,
          }),
        );
      const expectedCurrentReleaseSha = currentRuntimeBridge?.previous_release_sha
        ?? context.currentDescriptor.release_sha;
      if (
        !currentWorkerPreflight.ready
        || currentWorkerPreflight.release_sha !== expectedCurrentReleaseSha
      ) {
        throw new Error("Current worker runtime preflight drifted.");
      }
      const allowBridgeWorkerStandby = allowFirstCanonicalAdoptionWorkerStandby({
        currentRuntimeBridge,
        workerStatus,
        currentWorkerPreflight,
      });
      if (
        !workerStatus.loaded
        || (
          !["running", "waiting"].includes(workerStatus.state)
          && !allowBridgeWorkerStandby
        )
        || (
          !Number.isInteger(workerStatus.pid)
          && !allowBridgeWorkerStandby
        )
      ) {
        throw new Error("Current worker runtime is not running.");
      }
      if (
        Number.isInteger(workerStatus.pid)
        && readProcessCwd({ pid: workerStatus.pid, spawn: commandRunner }) !== workerArtifactRoot
      ) {
        throw new Error("Current worker runtime artifact root drifted.");
      }
      const workerArtifact = verifyYoutubeExtractionWorkerArtifact(workerManifestPath, {
        allowLegacyReleaseSha: legacyBootstrap || currentRuntimeBridge
          ? (currentRuntimeBridge?.previous_release_sha ?? context.currentDescriptor.release_sha)
          : null,
        allowFirstCanonicalAdoptionInventory: Boolean(currentRuntimeBridge),
      });
      const canonicalWorkerPlist = legacyBootstrap || currentRuntimeBridge
        ? renderYoutubeExtractionWorkerPlist({
          appDescriptorPath: currentWorkerPaths.appDescriptorPath,
          configPath: currentWorkerPaths.configPath,
          credentialPath: currentWorkerPaths.credentialPath,
          currentPolicyPath: currentWorkerPaths.currentPolicyPath,
          expectedSchemaPath: currentWorkerPaths.expectedSchemaPath,
          homeDir: options.homeDir,
          manifestPath: workerManifestPath,
          nodeBin: options.nodeBin,
          rootDir: workerArtifactRoot,
          secretRoot: currentWorkerPaths.secretRoot,
        })
        : buildCanonicalCurrentYoutubeWorkerPlist({
          currentDescriptor: context.currentDescriptor,
          options: {
            ...options,
            workerConfigPath: currentWorkerPaths.configPath,
            workerCredentialPath: currentWorkerPaths.credentialPath,
            workerSecretRoot: currentWorkerPaths.secretRoot,
          },
        });
      if (!allowFirstCanonicalAdoptionWorkerPlist({
        currentRuntimeBridge,
        actualDigest: workerPlist.digest,
      })) {
        assertCanonicalLocalMacProductionPlist({
          actualPath: workerPlist.path,
          currentUid,
          expectedContent: canonicalWorkerPlist,
          expectedMode: 0o600,
          label: "Current YouTube worker plist",
          trustedRoot: options.homeDir,
        });
      }
      const youtubeWorker = {
        release_sha: workerArtifact.release_sha,
        release_tree: legacyBootstrap
          ? context.currentDescriptor.release_tree
          : currentWorkerPreflight.release_tree,
        build_id: legacyBootstrap
          ? context.currentDescriptor.build_id
          : currentWorkerPreflight.build_id,
        promotion_id: legacyBootstrap
          ? context.currentDescriptor.promotion_id
          : currentWorkerPreflight.promotion_id,
        pid: workerStatus.pid,
        ready: true,
        ...(legacyBootstrap ? { legacy_bootstrap: true } : {}),
        ...(legacyBootstrap
          ? { legacy_bootstrap_contract: "e02f-worker-v1" }
          : {}),
      };
      const workerRuntimeStableProjection = buildWorkerRuntimeStableProjection({
        currentRuntimeBridge,
        workerStatus,
      });
      const stableKey = sha256Text(JSON.stringify({
        app_pid: appStatus.pid,
        app_plist: appPlist.digest,
        full_local_plist: fullLocalPlist.digest,
        full_local_runtime_root: fullLocalRuntimeRoot,
        full_local_source_sha: currentRuntimeBridge?.full_local_source_sha ?? null,
        full_local_workload: fullLocal.workload_digest,
        ...workerRuntimeStableProjection,
        worker_plist: workerPlist.digest,
        worker_artifact: workerArtifact.artifact_sha256,
        worker_preflight: currentWorkerPreflight.checks,
      }));
      return {
        stable_key: stableKey,
        app,
        ...(currentRuntimeBridge ? {
          bridge: {
            app_release_dir: currentReleaseDir,
            full_local_root: fullLocalRuntimeRoot,
            full_local_source_sha: currentRuntimeBridge.full_local_source_sha,
            mode: currentRuntimeBridge.mode,
            worker_artifact_root: workerArtifactRoot,
            worker_manifest_path: workerManifestPath,
          },
        } : {}),
        full_local: fullLocal,
        youtube_worker: youtubeWorker,
      };
    },

    startFullLocal: ({ context, options }) => {
      const result = commandRunner(options.nodeBin, [
        resolve(context.releaseDir, "scripts", "full-local-production-runtime.mjs"),
        "start",
        "--config",
        options.fullLocalConfigPath,
        "--release-identity",
        resolve(context.releaseDir, "prepare.json"),
        "--release-manifest",
        context.manifest.release_manifest_path,
        "--frozen-release-manifest",
        options.releaseManifestPath,
        "--lock-token",
        context.lockToken,
        "--bundle",
        options.bundlePath,
        "--subject-manifest",
        options.subjectManifestPath,
        "--trusted-root",
        options.trustedRootPath,
        "--authority-root",
        context.rootDir,
      ], {
        cwd: context.releaseDir,
        encoding: "utf8",
        env: {
          HOME: context.homeDir,
          PATH: sanitizedPath(options.nodeBin, options.dockerBin),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (result.status !== 0) {
        throw new Error("Candidate full-local synchronous start failed.");
      }
      return { started: true };
    },
    confirmFullLocalCandidate: ({ context, options }) =>
      waitForFullLocalCandidateIdentity({
        read: () => readFullLocalWorkloadDefault({
          context,
          options,
          checkPlist: false,
          commandRunner,
          restartContract: context.currentRuntimeBridge
            ? firstCanonicalAdoptionRestartContract()
            : null,
        }),
      }),
    installFullLocal: (input) => installFullLocalLaunchAgent({
      ...input,
      platform,
      spawn: commandRunner,
    }),
    installApp: (input) => installLocalMacProductionLaunchAgent({
      ...input,
      platform,
      spawn: commandRunner,
      verifyRuntimeStatus: (statusInput) => verifyFullLocalProductionRuntimeStatus({
        ...statusInput,
        runCommand: commandRunner,
      }),
    }),
    installWorker: (input) => installYoutubeExtractionWorkerLaunchAgent({
      ...input,
      spawn: commandRunner,
    }),

    readAppRuntimeIdentity: async ({ context, options }) => {
      const currentUid = process.getuid?.();
      if (!Number.isInteger(currentUid)) throw new Error("Current user uid is unavailable.");
      assertCanonicalLocalMacProductionPlist({
        actualPath: getLocalMacProductionPaths(context.homeDir).plistPath,
        currentUid,
        expectedContent: renderLocalMacProductionPlist({
          homeDir: context.homeDir,
          nodeBin: options.nodeBin,
          rootDir: context.releaseDir,
        }),
        expectedMode: 0o644,
        label: "Promoted app plist",
        trustedRoot: context.homeDir,
      });
      const status = readLocalMacProductionStatus({ spawn: commandRunner });
      if (!status.running || !Number.isInteger(status.pid)) {
        throw new Error("Promoted app runtime is not running.");
      }
      await appReadinessWaiter();
      return readLocalMacProductionRuntimeIdentity({
        component: "app",
        expectedReleaseDir: context.releaseDir,
        pid: status.pid,
        requireRehearsalAuthority: true,
        runCommand: commandRunner,
      });
    },

    readFullLocalWorkloadIdentity: (input) => readFullLocalWorkloadDefault({
      ...input,
      commandRunner,
    }),

    readWorkerRuntimeIdentity: async ({
      context,
      options,
      preflight,
      requirePolicyEnabled = false,
    }) => {
      const userId = preflight.worker.userId;
      assertCanonicalLocalMacProductionPlist({
        actualPath: getYoutubeExtractionWorkerPaths(context.homeDir).plistPath,
        currentUid: userId,
        expectedContent: renderYoutubeExtractionWorkerPlist({
          appDescriptorPath: preflight.worker.appDescriptorPath,
          configPath: options.workerConfigPath,
          credentialPath: options.workerCredentialPath,
          currentPolicyPath: preflight.worker.policyPath,
          expectedSchemaPath: preflight.worker.expectedSchemaPath,
          homeDir: context.homeDir,
          manifestPath: preflight.worker.manifestPath,
          nodeBin: options.nodeBin,
          rootDir: preflight.worker.artifactRoot,
          secretRoot: options.workerSecretRoot,
        }),
        expectedMode: 0o600,
        label: "Promoted YouTube worker plist",
        trustedRoot: context.homeDir,
      });
      const serviceTarget = buildYoutubeExtractionWorkerServiceTarget({ userId });
      const raw = commandRunner("/bin/launchctl", ["print", serviceTarget], { encoding: "utf8" });
      const status = parseLaunchctlPrintStatus({
        serviceTarget,
        status: raw.status,
        stderr: raw.stderr,
        stdout: raw.stdout,
      });
      if (
        !status.loaded
        || !["running", "waiting"].includes(status.state)
        || !Number.isInteger(status.pid)
      ) {
        throw new Error("Promoted worker runtime is not running.");
      }
      if (readProcessCwd({ pid: status.pid, spawn: commandRunner }) !== preflight.worker.artifactRoot) {
        throw new Error("Promoted worker runtime artifact root drifted.");
      }
      const finalInputs = loadYoutubeExtractionWorkerRuntimeInputs({
        appDescriptorPath: preflight.worker.appDescriptorPath,
        workerArtifactPath: preflight.worker.manifestPath,
        currentPolicyPath: preflight.worker.policyPath,
        credentialPath: options.workerCredentialPath,
        expectedSchemaPath: preflight.worker.expectedSchemaPath,
        secretRoot: options.workerSecretRoot,
      });
      const finalPreflight = evaluateYoutubeExtractionWorkerPreflight({
        ...finalInputs,
        requirePolicyEnabled,
      });
      if (!finalPreflight.ready) {
        throw new Error("Final worker release preflight failed closed.");
      }
      const finalDigests = {
        artifactSha256: finalInputs.workerArtifact.artifact_sha256,
        appDescriptorSha256: sha256File(preflight.worker.appDescriptorPath),
        configSha256: sha256File(options.workerConfigPath),
        credentialSha256: sha256File(options.workerCredentialPath),
        expectedSchemaSha256: sha256File(preflight.worker.expectedSchemaPath),
        policySha256: sha256File(preflight.worker.policyPath),
      };
      for (const [field, digest] of Object.entries(finalDigests)) {
        if (preflight.worker[field] !== digest) {
          throw new Error(`Final worker ${field} drifted after installation.`);
        }
      }
      const finalI031Preflight = await readI031PreflightDefault(
        options,
        userId,
        i031PreflightVerifier,
      );
      if (finalI031Preflight.ready !== true) {
        throw new Error("Final worker i031 preflight failed.");
      }
      const artifact = verifyYoutubeExtractionWorkerArtifact(preflight.worker.manifestPath);
      const rehearsalAuthority = readLocalMacProductionRuntimeRehearsalAuthority({
        component: "youtube_worker",
        expectedRuntimeDir: preflight.worker.artifactRoot,
        pid: status.pid,
        runCommand: commandRunner,
      });
      return {
        release_sha: artifact.release_sha,
        release_tree: artifact.release_tree,
        build_id: artifact.build_id,
        promotion_id: artifact.promotion_id,
        pid: status.pid,
        ready: true,
        ...rehearsalAuthority,
        final_preflight: finalPreflight,
        i031_preflight: finalI031Preflight,
        ...finalDigests,
      };
    },
  };
}

export function createLocalMacProductionPromoteAdapters(options, dependencies = {}) {
  const {
    commandRunner = spawnSync,
    i031PreflightVerifier = verifyStandaloneYoutubeI031Preflight,
    appReadinessWaiter = waitForLocalMacProductionReady,
    platform = process.platform,
    ...dependencyOverrides
  } = dependencies;
  const resolvedDependencies = {
    ...buildDefaultDependencies(
      commandRunner,
      i031PreflightVerifier,
      appReadinessWaiter,
      platform,
    ),
    ...dependencyOverrides,
  };
  const validateMutationTargets = requireFunction(
    resolvedDependencies.validateMutationTargets,
    "validateMutationTargets",
  );
  const readWorkerReleasePreflight = requireFunction(
    resolvedDependencies.readWorkerReleasePreflight,
    "readWorkerReleasePreflight",
  );
  const readFullLocalConfigEvidence = requireFunction(
    resolvedDependencies.readFullLocalConfigEvidence,
    "readFullLocalConfigEvidence",
  );
  const readCurrentRuntimeBundle = requireFunction(
    resolvedDependencies.readCurrentRuntimeBundle,
    "readCurrentRuntimeBundle",
  );
  const installFullLocal = requireFunction(resolvedDependencies.installFullLocal, "installFullLocal");
  const startFullLocal = requireFunction(resolvedDependencies.startFullLocal, "startFullLocal");
  const confirmFullLocalCandidate = requireFunction(
    resolvedDependencies.confirmFullLocalCandidate,
    "confirmFullLocalCandidate",
  );
  const installApp = requireFunction(resolvedDependencies.installApp, "installApp");
  const installWorker = requireFunction(resolvedDependencies.installWorker, "installWorker");
  const readAppRuntimeIdentity = requireFunction(
    resolvedDependencies.readAppRuntimeIdentity,
    "readAppRuntimeIdentity",
  );
  const readFullLocalWorkloadIdentity = requireFunction(
    resolvedDependencies.readFullLocalWorkloadIdentity,
    "readFullLocalWorkloadIdentity",
  );
  const readWorkerRuntimeIdentity = requireFunction(
    resolvedDependencies.readWorkerRuntimeIdentity,
    "readWorkerRuntimeIdentity",
  );
  const runtimeOptionsFor = (context) => {
    const frozen = verifyLocalMacProductionFrozenRuntimeInputs(context.frozenRuntimeInputs, { checkSources: false });
    return {
      ...options,
      fullLocalConfigPath: frozen.paths.fullLocalConfigPath,
      fullLocalSecretRoot: frozen.paths.fullLocalSecretRoot,
      releaseManifestPath: frozen.paths.releaseManifestPath,
      workerConfigPath: frozen.paths.workerConfigPath,
      workerCredentialPath: frozen.paths.workerCredentialPath,
      workerSecretRoot: frozen.paths.workerSecretRoot,
      frozenRuntimeInputRoot: frozen.root,
      ...(context.executionSnapshot?.attestationBundlePath ? {
        bundlePath: context.executionSnapshot.attestationBundlePath,
        subjectManifestPath: context.executionSnapshot.attestationSubjectPath,
        trustedRootPath: context.executionSnapshot.attestationTrustedRootPath,
      } : {}),
    };
  };

  return {
    freezeRuntimeInputs: ({ preflight, releaseManifestBytes, releaseManifestDigest, scratchRoot }) => freezeLocalMacProductionRuntimeInputs({ options, preflight, releaseManifestBytes, releaseManifestDigest, scratchRoot }),
    verifyFrozenRuntimeInputs: (frozen, verifyOptions) => verifyLocalMacProductionFrozenRuntimeInputs(frozen, verifyOptions),
    cleanupFrozenRuntimeInputs: (frozen) => cleanupLocalMacProductionFrozenRuntimeInputs(frozen),
    preflightBundle: async (context) => {
      if (options.confirmation !== YOUTUBE_EXTRACTION_WORKER_INSTALL_CONFIRMATION) {
        throw new Error(
          `promote requires exact --confirm-production ${YOUTUBE_EXTRACTION_WORKER_INSTALL_CONFIRMATION}.`,
        );
      }
      validateMutationTargets({ context, options });
      const worker = await readWorkerReleasePreflight({ context, options });
      if (
        !worker
        || typeof worker.artifactRoot !== "string"
        || worker.preflight?.ready !== true
        || worker.preflight.release_sha !== context.manifest.release_sha
        || worker.preflight.release_tree !== context.manifest.release_tree
        || worker.preflight.build_id !== context.manifest.build_id
        || worker.preflight.promotion_id !== context.manifest.promotion_id
      ) {
        throw new Error("Worker release preflight does not match the exact promoted release.");
      }
      const workerPathAuthority = assertWorkerPathAuthority(worker);
      const current = await readCurrentRuntimeBundle({ context, options });
      if (!current || typeof current.stable_key !== "string" || current.stable_key.length === 0) {
        throw new Error("Current runtime bundle preflight did not produce stable evidence.");
      }
      if (context.currentRuntimeBridge) {
        assertFirstCanonicalAdoptionCurrentBundle(
          current,
          resolveFirstCanonicalAdoptionBridge(context.currentRuntimeBridge, options.homeDir),
        );
      } else {
        for (const component of ["app", "full_local", "youtube_worker"]) {
          assertExactIdentity(component, current[component], context.currentDescriptor);
        }
      }
      const stableKey = sha256Text(JSON.stringify({
        current: current.stable_key,
        full_local_config_sha256: worker.fullLocalConfigSha256,
        worker_path_authority: workerPathAuthority,
        worker_artifact_sha256: worker.inputs?.workerArtifact?.artifact_sha256 ?? null,
        worker_preflight: worker.preflight,
        i031_preflight: worker.i031Preflight,
      }));
      return {
        full_local_config_sha256: worker.fullLocalConfigSha256,
        stable_key: stableKey,
        current,
        worker,
      };
    },

    installBundle: async ({ preflight, ...context }) => {
      const runtimeOptions = runtimeOptionsFor(context);
      assertWorkerPathAuthority(preflight?.worker);
      verifySealedExecutionContext(context);
      startFullLocal({ context, options: runtimeOptions, preflight });
      verifySealedExecutionContext(context);
      const confirmedFullLocal = await confirmFullLocalCandidate({ context, options: runtimeOptions, preflight });
      assertExactIdentity("full_local", confirmedFullLocal, context.manifest);
      verifySealedExecutionContext(context);
      const useFirstCanonicalAdoptionContract = Boolean(context.currentRuntimeBridge);
      const fullLocal = installFullLocal({
        configPath: runtimeOptions.fullLocalConfigPath,
        frozenConfigRoot: runtimeOptions.frozenRuntimeInputRoot,
        currentDescriptorPath: getLocalMacProductionReleasePaths(context.homeDir)
          .currentDescriptorPath,
        homeDir: context.homeDir,
        mutationAuthority: context.mutationAuthority,
        nodeBin: runtimeOptions.nodeBin,
        releaseIdentityPath: resolve(context.releaseDir, "prepare.json"),
        runtimeCommand: useFirstCanonicalAdoptionContract ? "start" : "resume-current",
        rootDir: context.releaseDir,
        ...(useFirstCanonicalAdoptionContract ? {} : {
          releaseIdentityPath: undefined,
        }),
      });
      verifySealedExecutionContext(context);
      const app = installApp({
        homeDir: context.homeDir,
        mutationAuthority: context.mutationAuthority,
        nodeBin: runtimeOptions.nodeBin,
        rootDir: context.releaseDir,
      });
      verifySealedExecutionContext(context);
      const worker = installWorker({
        appDescriptorPath: preflight.worker.appDescriptorPath,
        configPath: runtimeOptions.workerConfigPath,
        confirmation: runtimeOptions.confirmation,
        credentialPath: runtimeOptions.workerCredentialPath,
        currentPolicyPath: preflight.worker.policyPath,
        expectedSchemaPath: preflight.worker.expectedSchemaPath,
        homeDir: context.homeDir,
        i031Preflight: preflight.worker.i031Preflight,
        manifestPath: preflight.worker.manifestPath,
        mutationAuthority: context.mutationAuthority,
        nodeBin: runtimeOptions.nodeBin,
        rootDir: preflight.worker.artifactRoot,
        secretRoot: runtimeOptions.workerSecretRoot,
        userId: preflight.worker.userId,
      });
      return { app, full_local: fullLocal, worker };
    },

    readinessProbe: async ({ preflight, ...context }) => {
      const runtimeOptions = runtimeOptionsFor(context);
      verifySealedExecutionContext(context);
      const app = await readAppRuntimeIdentity({ context, options: runtimeOptions, preflight });
      verifySealedExecutionContext(context);
      const fullLocal = await readFullLocalWorkloadIdentity({
        context,
        options: runtimeOptions,
        preflight,
        restartContract: context.currentRuntimeBridge
          ? firstCanonicalAdoptionRestartContract()
          : null,
      });
      verifySealedExecutionContext(context);
      const worker = await readWorkerRuntimeIdentity({
        context,
        options: runtimeOptions,
        preflight,
        requirePolicyEnabled: false,
      });
      if (
        fullLocal.runtime_present !== true
        || fullLocal.healthy !== true
        || fullLocal.authorization_contract_status !== "PASS"
        || fullLocal.product_catalog_status !== "PASS"
      ) {
        throw new Error("Full-local Docker workload readiness failed.");
      }
      for (const [component, state] of [
        ["app", app],
        ["full_local", fullLocal],
        ["youtube_worker", worker],
      ]) {
        assertExactIdentity(component, state, context.manifest);
        const observedAuthority = observedRehearsalRuntimeAuthority(context);
        if (state.sealed_bundle_digest !== observedAuthority.sealed_bundle_digest
          || state.repeatability_receipt_digest !== observedAuthority.repeatability_receipt_digest) {
          throw new Error(`Current ${component} runtime rehearsal authority drifted from the frozen snapshot.`);
        }
      }
      return { app, full_local: fullLocal, youtube_worker: worker };
    },

    finalWorkerProbe: async ({ preflight, ...context }) => {
      const runtimeOptions = runtimeOptionsFor(context);
      verifySealedExecutionContext(context);
      const worker = await readWorkerRuntimeIdentity({
        context,
        options: runtimeOptions,
        preflight,
        requirePolicyEnabled: true,
      });
      const fullLocalConfig = readFullLocalConfigEvidence({ context, options: runtimeOptions, preflight });
      if (fullLocalConfig.digest !== preflight.full_local_config_sha256) {
        throw new Error("Final full-local config digest drifted after installation.");
      }
      return {
        ...worker,
        fullLocalConfigSha256: fullLocalConfig.digest,
      };
    },
  };
}

const VERIFY_DOCKER_SERVICES = Object.freeze([
  "api-gateway",
  "auth",
  "auth-proxy",
  "postgres",
  "postgrest",
  "postgrest-probe",
  "storage",
]);
const DOCKER_CONTAINER_ID_PATTERN = /^[0-9a-f]{64}$/u;

function runVerifyDocker({ commandRunner, dockerBin, args, input = undefined }) {
  if (!isAbsolute(dockerBin)) {
    throw new Error("Production verify Docker executable must be absolute.");
  }
  const result = commandRunner(dockerBin, args, {
    encoding: "utf8",
    env: {
      PATH: `${dirname(dockerBin)}:/usr/bin:/bin:/usr/sbin:/sbin`,
    },
    input,
    maxBuffer: 32 * 1024 * 1024,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    timeout: 15_000,
  });
  if (result.status !== 0 || typeof result.stdout !== "string") {
    throw new Error("Production verify trusted Docker command failed.");
  }
  return result.stdout;
}

export function readCurrentFullLocalDockerGeneration({
  commandRunner = spawnSync,
  dockerBin,
  fullLocalConfigPath,
}) {
  const config = parseFullLocalProductionConfig(readFileSync(fullLocalConfigPath, "utf8"));
  const composeProject = config.FULL_LOCAL_COMPOSE_PROJECT_NAME;
  const postgresVolumeName = config.FULL_LOCAL_POSTGRES_VOLUME_NAME;
  const storageVolumeName = config.FULL_LOCAL_STORAGE_VOLUME_NAME;
  if (
    typeof composeProject !== "string"
    || typeof postgresVolumeName !== "string"
    || typeof storageVolumeName !== "string"
  ) {
    throw new Error("Docker generation verification requires exact production resource names.");
  }
  const containerIds = runVerifyDocker({
    commandRunner,
    dockerBin,
    args: [
      "ps",
      "--all",
      "--no-trunc",
      "--quiet",
      "--filter",
      `label=com.docker.compose.project=${composeProject}`,
    ],
  }).split(/\r?\n/u).map((value) => value.trim()).filter(Boolean).sort();
  if (
    containerIds.length !== VERIFY_DOCKER_SERVICES.length
    || new Set(containerIds).size !== containerIds.length
    || containerIds.some((id) => !DOCKER_CONTAINER_ID_PATTERN.test(id))
  ) {
    throw new Error("Docker generation must contain seven exact full-local containers.");
  }
  let containers;
  let volumes;
  try {
    containers = JSON.parse(runVerifyDocker({
      commandRunner,
      dockerBin,
      args: ["container", "inspect", ...containerIds],
    }));
    volumes = JSON.parse(runVerifyDocker({
      commandRunner,
      dockerBin,
      args: ["volume", "inspect", postgresVolumeName, storageVolumeName],
    }));
  } catch {
    throw new Error("Docker generation inspection output is invalid.");
  }
  if (!Array.isArray(containers) || containers.length !== containerIds.length) {
    throw new Error("Docker generation container inspection is incomplete.");
  }
  const normalizedContainers = containers.map((container) => {
    const id = container?.Id;
    const service = container?.Config?.Labels?.["com.docker.compose.service"];
    if (
      !containerIds.includes(id)
      || !VERIFY_DOCKER_SERVICES.includes(service)
      || container?.Config?.Labels?.["com.docker.compose.project"] !== composeProject
      || container?.State?.Running !== true
      || container?.State?.Status !== "running"
      || (container?.State?.Health && container.State.Health.Status !== "healthy")
      || typeof container?.Config?.Image !== "string"
    ) {
      throw new Error("Docker generation container identity or health drifted.");
    }
    return {
      health: container.State.Health?.Status ?? null,
      id,
      image: container.Config.Image,
      service,
      status: container.State.Status,
    };
  }).sort((left, right) => left.service.localeCompare(right.service));
  if (
    normalizedContainers.some((entry, index) => entry.service !== VERIFY_DOCKER_SERVICES[index])
  ) {
    throw new Error("Docker generation service set is incomplete or duplicated.");
  }
  if (!Array.isArray(volumes) || volumes.length !== 2) {
    throw new Error("Docker generation volume inspection is incomplete.");
  }
  const expectedVolumeLabels = new Map([
    [postgresVolumeName, "postgres-data"],
    [storageVolumeName, "storage-data"],
  ]);
  const normalizedVolumes = volumes.map((volume) => {
    const expectedLabel = expectedVolumeLabels.get(volume?.Name);
    if (
      !expectedLabel
      || volume?.Labels?.["com.docker.compose.project"] !== composeProject
      || volume?.Labels?.["com.docker.compose.volume"] !== expectedLabel
      || typeof volume?.Driver !== "string"
      || typeof volume?.Mountpoint !== "string"
      || typeof volume?.CreatedAt !== "string"
    ) {
      throw new Error("Docker generation volume provenance drifted.");
    }
    return {
      createdAt: volume.CreatedAt,
      driver: volume.Driver,
      mountpoint: volume.Mountpoint,
      name: volume.Name,
      volumeLabel: expectedLabel,
    };
  }).sort((left, right) => left.name.localeCompare(right.name));
  const postgresContainer = normalizedContainers.find((entry) => entry.service === "postgres");
  return Object.freeze({
    digest: sha256Bytes(Buffer.from(JSON.stringify({
      composeProject,
      containers: normalizedContainers,
      volumes: normalizedVolumes,
    }))),
    postgresContainerId: postgresContainer.id,
  });
}

export function readCurrentFullLocalMigrationHead({
  commandRunner = spawnSync,
  dockerBin,
  expectedPostgresContainerId = null,
  fullLocalConfigPath,
}) {
  const config = parseFullLocalProductionConfig(readFileSync(fullLocalConfigPath, "utf8"));
  const composeProject = config.FULL_LOCAL_COMPOSE_PROJECT_NAME;
  if (typeof composeProject !== "string" || composeProject.length === 0) {
    throw new Error("Full-local migration verification requires an exact compose project.");
  }
  let postgresContainerId = expectedPostgresContainerId;
  if (postgresContainerId === null) {
    const containerIds = runVerifyDocker({
      commandRunner,
      dockerBin,
      args: [
        "ps",
        "--all",
        "--no-trunc",
        "--quiet",
        "--filter",
        `label=com.docker.compose.project=${composeProject}`,
        "--filter",
        "label=com.docker.compose.service=postgres",
      ],
    }).split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
    if (containerIds.length !== 1) {
      throw new Error("Full-local migration verification requires one exact PostgreSQL container.");
    }
    [postgresContainerId] = containerIds;
  }
  if (!DOCKER_CONTAINER_ID_PATTERN.test(postgresContainerId)) {
    throw new Error("Full-local migration PostgreSQL container identity is invalid.");
  }
  const migrationOutput = runVerifyDocker({
    commandRunner,
    dockerBin,
    args: [
    "exec",
    "-i",
    postgresContainerId,
    "psql",
    "-X",
    "-qAt",
    "-v",
    "ON_ERROR_STOP=1",
    "-U",
    "supabase_admin",
    "-d",
    "postgres",
    ],
    input: buildMigrationHeadSql(),
  });
  return parseMigrationHeadSqlOutput(migrationOutput);
}

export async function readCurrentFullLocalJwksEvidence({
  fetchImpl = globalThis.fetch,
  fullLocalConfigPath,
}) {
  if (typeof fetchImpl !== "function") {
    throw new Error("Full-local JWKS verification fetch is unavailable.");
  }
  const config = parseFullLocalProductionConfig(readFileSync(fullLocalConfigPath, "utf8"));
  const authProxyPort = Number(config.FULL_LOCAL_AUTH_PROXY_PORT);
  if (!Number.isSafeInteger(authProxyPort) || authProxyPort < 1024 || authProxyPort > 65535) {
    throw new Error("Full-local Auth verification requires an exact loopback proxy port.");
  }
  const origin = `http://127.0.0.1:${authProxyPort}`;
  const request = (path) => fetchImpl(`${origin}${path}`, {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  const jwks = await request("/auth/v1/.well-known/jwks.json");
  if (!jwks || jwks.status !== 200) {
    throw new Error("Full-local JWKS loopback verification failed.");
  }
  let jwksPayload;
  try {
    jwksPayload = await jwks.json();
  } catch {
    throw new Error("Full-local JWKS response is invalid.");
  }
  if (
    !jwksPayload
    || typeof jwksPayload !== "object"
    || Array.isArray(jwksPayload)
    || !Array.isArray(jwksPayload.keys)
    || jwksPayload.keys.length === 0
    || jwksPayload.keys.length > 8
    || jwksPayload.keys.some((key) =>
      !key
      || typeof key !== "object"
      || Array.isArray(key)
      || typeof key.kty !== "string"
      || key.kty.length === 0)
  ) {
    throw new Error("Full-local JWKS response does not contain valid verification keys.");
  }
  return Object.freeze({
    jwksReady: true,
    localOnly: true,
  });
}

/**
 * Creates read-only post-deploy adapters. The existing current-runtime reader
 * validates canonical plists, process cwd, Docker identity, config/JWKS, Auth,
 * product catalog, and volume provenance before these booleans are projected.
 */
export function createLocalMacProductionVerifyCommandRunner({
  baseCommandRunner = spawnSync,
  dockerBin,
  gitBin,
}) {
  return (command, args, commandOptions = {}) => {
    if (command === "git" || command === "docker") {
      const trustedCommand = command === "git" ? gitBin : dockerBin;
      if (typeof trustedCommand !== "string" || !isAbsolute(trustedCommand)) {
        throw new Error(`Production verify trusted ${command} executable is unavailable.`);
      }
      return baseCommandRunner(trustedCommand, args, {
        ...commandOptions,
        env: {
          ...(commandOptions.env ?? {}),
          PATH: `${dirname(trustedCommand)}:/usr/bin:/bin:/usr/sbin:/sbin`,
        },
      });
    }
    return baseCommandRunner(command, args, commandOptions);
  };
}

export function createLocalMacProductionVerifyAdapters(options, dependencies = {}) {
  const {
    commandRunner: baseCommandRunner = spawnSync,
    i031PreflightVerifier = verifyStandaloneYoutubeI031Preflight,
    appReadinessWaiter = waitForLocalMacProductionReady,
    platform = process.platform,
    readConfigEvidence: readConfigEvidenceOverride,
    readCurrentRuntimeBundle: readCurrentRuntimeBundleOverride,
    readDockerGeneration: readDockerGenerationOverride,
    readJwksEvidence: readJwksEvidenceOverride,
    readMigrationHead: readMigrationHeadOverride,
  } = dependencies;
  const normalizedOptions = {
    ...options,
    fullLocalConfigPath:
      options.fullLocalConfigPath ?? getFullLocalResumeConfigPath(options.homeDir),
    dockerBin: options.dockerBin ?? null,
    gitBin: options.gitBin ?? null,
    nodeBin: options.nodeBin ?? process.execPath,
  };
  const commandRunner = createLocalMacProductionVerifyCommandRunner({
    baseCommandRunner,
    dockerBin: normalizedOptions.dockerBin,
    gitBin: normalizedOptions.gitBin,
  });
  const readCurrentRuntimeBundle = readCurrentRuntimeBundleOverride
    ?? buildDefaultDependencies(
      commandRunner,
      i031PreflightVerifier,
      appReadinessWaiter,
      platform,
    ).readCurrentRuntimeBundle;
  const readConfigEvidence = readConfigEvidenceOverride
    ?? (({ options: activeOptions }) => {
      const currentUid = process.getuid?.();
      if (!Number.isInteger(currentUid)) throw new Error("Current user uid is unavailable.");
      return readCanonicalFullLocalConfigEvidence({
        currentUid,
        options: activeOptions,
      });
    });
  const readDockerGeneration = readDockerGenerationOverride
    ?? ((input) => readCurrentFullLocalDockerGeneration({
      ...input,
      commandRunner,
    }));
  const readJwksEvidence = readJwksEvidenceOverride
    ?? ((input) => readCurrentFullLocalJwksEvidence(input));
  const readMigrationHead = readMigrationHeadOverride
    ?? ((input) => readCurrentFullLocalMigrationHead({
      ...input,
      commandRunner,
    }));

  return {
    verifyRuntimeBundle: async (context) => {
      const runtimeContext = {
        context: {
          ...context,
          currentReleaseDir: context.releaseDir,
          currentRuntimeBridge: null,
        },
        options: normalizedOptions,
      };
      const assertVerifiedRuntime = (runtime) => {
        if (
          !runtime
          || typeof runtime.stable_key !== "string"
          || runtime.stable_key.length === 0
          || runtime.full_local?.runtime_present !== true
          || runtime.full_local?.healthy !== true
          || runtime.full_local?.authorization_contract_status !== "PASS"
          || runtime.full_local?.product_catalog_status !== "PASS"
        ) {
          throw new Error("Current full-local runtime health or authorization evidence is incomplete.");
        }
        for (const component of ["app", "full_local", "youtube_worker"]) {
          assertExactIdentity(component, runtime[component], context.manifest);
        }
        return runtime;
      };
      const configBefore = readConfigEvidence({
        context,
        options: normalizedOptions,
      });
      if (configBefore?.digest !== context.currentDescriptor.full_local_config_sha256) {
        throw new Error("Current full-local config digest drifted from current.json.");
      }
      const runtimeBefore = assertVerifiedRuntime(
        await readCurrentRuntimeBundle(runtimeContext),
      );
      const dockerBefore = await readDockerGeneration({
        context,
        dockerBin: normalizedOptions.dockerBin,
        fullLocalConfigPath: normalizedOptions.fullLocalConfigPath,
        options: normalizedOptions,
      });
      const migration = await readMigrationHead({
        context,
        dockerBin: normalizedOptions.dockerBin,
        expectedPostgresContainerId: dockerBefore.postgresContainerId,
        fullLocalConfigPath: normalizedOptions.fullLocalConfigPath,
        options: normalizedOptions,
      });
      if (
        !migration
        || migration.migrationHeadSource !== "database_catalog_marker"
        || typeof migration.migrationHead !== "string"
      ) {
        throw new Error("Current full-local migration head evidence is invalid.");
      }
      const jwks = await readJwksEvidence({
        context,
        fullLocalConfigPath: normalizedOptions.fullLocalConfigPath,
        options: normalizedOptions,
      });
      if (
        jwks?.jwksReady !== true
        || jwks.localOnly !== true
      ) {
        throw new Error("Current full-local Auth or JWKS evidence is incomplete.");
      }
      const runtime = assertVerifiedRuntime(
        await readCurrentRuntimeBundle(runtimeContext),
      );
      const dockerAfter = await readDockerGeneration({
        context,
        dockerBin: normalizedOptions.dockerBin,
        fullLocalConfigPath: normalizedOptions.fullLocalConfigPath,
        options: normalizedOptions,
      });
      const configAfter = readConfigEvidence({
        context,
        options: normalizedOptions,
      });
      if (runtime.stable_key !== runtimeBefore.stable_key) {
        throw new Error("Current production runtime changed during read-only verification.");
      }
      if (
        dockerBefore?.digest !== dockerAfter?.digest
        || dockerBefore?.postgresContainerId !== dockerAfter?.postgresContainerId
      ) {
        throw new Error("Current Docker container or volume generation changed during verify.");
      }
      if (!sameFullLocalConfigEvidence(configBefore, configAfter)) {
        throw new Error("Current full-local config changed during read-only verify.");
      }
      return {
        ...runtime,
        full_local: {
          ...runtime.full_local,
          auth_ready: true,
          docker_ready: true,
          docker_generation_digest: dockerAfter.digest,
          jwks_ready: jwks.jwksReady,
          local_only: jwks.localOnly,
          migration_head: migration.migrationHead,
          migration_head_source: migration.migrationHeadSource,
          volume_identity_verified: true,
        },
      };
    },
  };
}
