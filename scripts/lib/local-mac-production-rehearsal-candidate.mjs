import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  accessSync,
  chmodSync,
  closeSync,
  copyFileSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalizeJcs, parseCanonicalJcs, sha256Jcs } from "./rfc8785-jcs.mjs";
import {
  copyLocalMacProductionExecutionTree,
  digestLocalMacProductionExecutionTree,
  sealLocalMacProductionExecutionTree,
} from "./local-mac-production-release.mjs";
import {
  normalizeGitHubProductionReleaseCheckSummary,
} from "./github-production-release-attestation.mjs";
import {
  resolveTrustedGhExecutable,
  resolveTrustedGitExecutable,
  resolveTrustedNodeExecutable,
} from "./trusted-production-release-tools.mjs";
import {
  materializeYoutubeExtractionWorkerArtifact,
} from "./youtube-extraction-worker-artifact.mjs";
import {
  collectReadOnlyProductionInventory,
  createLocalProductionInventoryAdapters,
  createProductionSurfaceSnapshot,
} from "./local-mac-production-rehearsal-inventory.mjs";

export const RELEASE_REHEARSAL_CANDIDATE_SCHEMA =
  "homecook.local-mac-production-rehearsal-candidate.v1";
export const RELEASE_REHEARSAL_BUILD_ENV_SCHEMA =
  "homecook.release-rehearsal-build-env.v1";

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const IMAGE_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const CANONICALIZATION = "RFC8785-JCS+SHA256";
const REPOSITORY = "netsus/homecook";
const SOURCE_REF = "refs/heads/master";
const GITHUB_ACTIONS_APP_INTEGRATION_ID = 15368;
const BUILD_ENV_ALLOWLIST_ID = "homecook-release-rehearsal-build-env-v1";
const BUILD_ENV_ALLOWED_KEYS = new Set([
  "FULL_LOCAL_DOCKER_PLATFORM",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
]);
const CANDIDATE_KEYS = [
  "schema", "canonicalization", "repository", "source_ref", "release_sha",
  "release_tree", "ci_check_summary_digest", "ci_snapshot_digest",
  "ci_suite_run_set_digest", "source_manifest_digest", "compose_source_digest", "sandbox_policy_digest",
  "build_id", "sealed_bundle_digest",
  "bundle_manifest_digest", "toolchain", "build_tools", "images", "migration", "artifacts",
  "file_inventory", "environment_snapshot", "production_guard", "candidate_identity_digest",
  "toolchain_lock_digest", "manifest_digest",
];
const TOOLCHAIN_KEYS = [
  "node", "pnpm", "supabase_cli", "git", "gh", "docker_client", "docker_daemon",
  "launchctl", "lsof", "audit_log", "sandbox_exec", "candidate_builder",
];
const TOOL_IDENTITY_KEYS = [
  "version", "realpath", "device", "inode", "mode", "ctime", "size", "sha256",
];
const SAFE_TOOL_MODES = new Set([0o400, 0o444, 0o500, 0o555, 0o600, 0o644, 0o700, 0o755]);

function fail(message) {
  throw new Error(`Release rehearsal candidate rejected: ${message}`);
}

function exactObject(value, label, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  const unknown = actual.filter((key) => !expected.includes(key));
  const missing = expected.filter((key) => !actual.includes(key));
  if (unknown.length > 0) fail(`${label} contains unknown fields: ${unknown.join(", ")}`);
  if (missing.length > 0) fail(`${label} is missing required fields: ${missing.join(", ")}`);
  return value;
}

function string(value, label) {
  if (typeof value !== "string" || value.length === 0) fail(`${label} must be nonempty`);
  return value;
}

function sha(value, label) {
  if (!SHA_PATTERN.test(value ?? "")) fail(`${label} must be exact lowercase 40-hex SHA`);
  return value;
}

function digest(value, label) {
  if (!DIGEST_PATTERN.test(value ?? "")) fail(`${label} must be lowercase SHA-256`);
  return value;
}

function decimalString(value, label) {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    fail(`${label} must be a canonical decimal identity string`);
  }
  return value;
}

function safeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail(`${label} must be a safe nonnegative integer`);
  return value;
}

function modeBits(mode) {
  return Number(mode) & 0o7777;
}

function sha256Bytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function decodeFatalUtf8(bytes, label = "canonical JSON") {
  if (!Buffer.isBuffer(bytes)) fail(`${label} bytes are required`);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(`${label} contains invalid UTF-8 encoding`);
  }
  if (!Buffer.from(text, "utf8").equals(bytes)) {
    fail(`${label} UTF-8 bytes are not an exact round trip`);
  }
  return text;
}

function validateToolIdentity(value, label, { requireExecutable = true } = {}) {
  exactObject(value, label, TOOL_IDENTITY_KEYS);
  string(value.version, `${label}.version`);
  if (!isAbsolute(value.realpath)) fail(`${label}.realpath must be absolute`);
  decimalString(value.device, `${label}.device`);
  decimalString(value.inode, `${label}.inode`);
  safeInteger(value.mode, `${label}.mode`);
  if (!SAFE_TOOL_MODES.has(value.mode)) fail(`${label}.mode is outside the trusted mode allowlist`);
  if ((requireExecutable && (value.mode & 0o111) === 0) || (value.mode & 0o022) !== 0) {
    fail(`${label} trusted executable mode is unsafe or writable`);
  }
  string(value.ctime, `${label}.ctime`);
  decimalString(value.size, `${label}.size`);
  digest(value.sha256, `${label}.sha256`);
  return value;
}

export function validateCandidateToolchain(value, { strictManifest = false } = {}) {
  exactObject(value, "toolchain", TOOLCHAIN_KEYS);
  for (const key of TOOLCHAIN_KEYS) {
    const identity = value[key];
    if (strictManifest) exactObject(identity, `toolchain.${key}`, TOOL_IDENTITY_KEYS);
    if (identity?.symlink === true) fail(`toolchain.${key} trusted executable is a symlink`);
    if (identity?.post_sha256 !== undefined && identity.post_sha256 !== identity.sha256) {
      fail(`toolchain.${key} executable digest drifted`);
    }
    validateToolIdentity(
      Object.fromEntries(TOOL_IDENTITY_KEYS.map((field) => [field, identity?.[field]])),
      `toolchain.${key}`,
      { requireExecutable: key !== "candidate_builder" },
    );
  }
  return value;
}

export function validateCandidateImages(value, { strictManifest = false } = {}) {
  if (!Array.isArray(value) || value.length === 0) fail("images must be a nonempty array");
  const seen = new Set();
  for (const [index, image] of value.entries()) {
    if (!image || typeof image !== "object" || Array.isArray(image)) fail(`images[${index}] is invalid`);
    if (strictManifest) exactObject(image, `images[${index}]`, [
      "service", "reference", "digest", "platform", "image_id",
      "local_cache_provenance_digest",
    ]);
    string(image.service, `images[${index}].service`);
    if (!/^([^\s@]+)@(sha256:[0-9a-f]{64})$/u.test(image.reference ?? "")) {
      fail(`images[${index}] reference must be exact digest-pinned`);
    }
    if (!IMAGE_DIGEST_PATTERN.test(image.digest ?? "")) fail(`images[${index}] requires an exact digest; tag-only images are forbidden`);
    if (!image.reference.endsWith(`@${image.digest}`)) fail(`images[${index}] reference digest mismatch`);
    string(image.platform, `images[${index}].platform`);
    if (!IMAGE_DIGEST_PATTERN.test(image.image_id ?? "")) fail(`images[${index}] image ID is invalid`);
    if (image.expected_platform !== undefined && image.expected_platform !== image.platform) {
      fail(`images[${index}] platform mismatch`);
    }
    digest(image.local_cache_provenance_digest, `images[${index}].local_cache_provenance_digest`);
    if (seen.has(image.service)) fail(`images[${index}] duplicate service`);
    seen.add(image.service);
  }
  return value;
}

export function validateCandidateSourceEvidence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("source evidence is invalid");
  sha(value.requested_sha, "requested_sha");
  sha(value.origin_master_sha, "origin_master_sha");
  sha(value.checkout_sha, "checkout_sha");
  sha(value.release_tree, "release_tree");
  sha(value.checkout_tree, "checkout_tree");
  if (value.requested_sha !== value.origin_master_sha || value.checkout_sha !== value.requested_sha) {
    fail("requested SHA is not the current fetched origin/master exact SHA");
  }
  if (value.release_tree !== value.checkout_tree) fail("checkout tree does not match release tree");
  if (value.detached !== true) fail("checkout must be detached");
  if (value.clean !== true) fail("checkout tracked source must be clean");
  if (value.tracked_symlinks_contained !== true) fail("tracked symlink path must remain contained");
  if (value.hardlink_count !== 0) fail("tracked source hardlink is forbidden");
  digest(value.source_snapshot_pre_digest, "source_snapshot_pre_digest");
  digest(value.source_snapshot_post_digest, "source_snapshot_post_digest");
  if (value.source_snapshot_pre_digest !== value.source_snapshot_post_digest) {
    fail("source drifted during candidate build");
  }
  return value;
}

export function validateCandidateBuilderAuthority({
  currentHead, releaseSha, trackedStatus, sourceManifestDigest,
  verifiedSourceManifestDigest, entries,
} = {}) {
  sha(currentHead, "candidate builder HEAD");
  sha(releaseSha, "candidate builder release SHA");
  if (currentHead !== releaseSha) fail("candidate builder HEAD is not the exact release Git authority");
  if (trackedStatus !== "") fail("candidate builder/config/toolchain lock worktree is dirty");
  digest(sourceManifestDigest, "candidate builder source manifest digest");
  digest(verifiedSourceManifestDigest, "candidate builder verified source manifest digest");
  if (sourceManifestDigest !== verifiedSourceManifestDigest) fail("candidate builder source authority drifted");
  const requiredPaths = [
    "scripts/local-mac-production-rehearsal-candidate-bootstrap.mjs",
    "scripts/local-mac-production-rehearsal.mjs",
    "scripts/lib/local-mac-production-rehearsal-candidate.mjs",
    "scripts/config/local-mac-production-rehearsal-toolchain-lock.json",
  ];
  const byPath = new Map((entries ?? []).map((entry) => [entry.path, entry]));
  const authority = requiredPaths.map((path) => {
    const entry = byPath.get(path);
    if (!entry) fail(`candidate builder Git authority is missing ${path}`);
    digest(entry.sha256, `candidate builder Git authority ${path}`);
    return { path, sha256: entry.sha256 };
  });
  return Object.freeze({ builder_input_digest: sha256Jcs(authority) });
}

export function validateCandidateCiEvidence(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("CI evidence is invalid");
  sha(value.head_sha, "ci.head_sha");
  sha(value.expected_head_sha, "ci.expected_head_sha");
  if (value.head_sha !== value.expected_head_sha) fail("CI head is not the requested current head");
  digest(value.summary_digest, "ci.summary_digest");
  const summary = value.summary;
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) fail("CI summary is invalid");
  for (const key of ["total", "success", "intended_skip", "bad", "cancelled", "failed", "pending", "queued", "rerun"]) {
    safeInteger(summary[key], `ci.summary.${key}`);
  }
  if (
    summary.total === 0 || summary.success !== summary.total || summary.intended_skip !== 0
    || ["bad", "cancelled", "failed", "pending", "queued", "rerun"].some((key) => summary[key] !== 0)
  ) {
    fail("all current-head started CI checks must be terminal success; pending, fail, and skip are forbidden");
  }
  return value;
}

function validateMigration(value) {
  exactObject(value, "migration", [
    "ordered_migration_files", "ordered_migration_files_digest", "migration_head",
  ]);
  if (!Array.isArray(value.ordered_migration_files) || value.ordered_migration_files.length === 0) {
    fail("migration.ordered_migration_files must be nonempty");
  }
  if (new Set(value.ordered_migration_files).size !== value.ordered_migration_files.length) {
    fail("migration file inventory contains duplicates");
  }
  for (const path of value.ordered_migration_files) {
    if (typeof path !== "string" || path.startsWith("/") || path.split("/").includes("..")) {
      fail("migration file path is unsafe");
    }
  }
  digest(value.ordered_migration_files_digest, "migration.ordered_migration_files_digest");
  string(value.migration_head, "migration.migration_head");
  return value;
}

function validateArtifacts(value) {
  exactObject(value, "artifacts", ["app", "full_local", "worker"]);
  for (const component of ["app", "full_local", "worker"]) {
    exactObject(value[component], `artifacts.${component}`, ["root", "digest"]);
    const root = string(value[component].root, `artifacts.${component}.root`);
    if (isAbsolute(root) || root.split("/").includes("..")) fail(`artifacts.${component}.root must be relative`);
    digest(value[component].digest, `artifacts.${component}.digest`);
  }
  return value;
}

function validateFileInventory(value) {
  if (!Array.isArray(value) || value.length === 0) fail("file_inventory must be nonempty");
  let previous = "";
  for (const [index, entry] of value.entries()) {
    exactObject(entry, `file_inventory[${index}]`, [
      "component", "source_kind", "path", "type", "mode", "sha256", "symlink_target",
      "dereferenced_sha256", "uid", "gid", "nlink", "device", "inode", "size", "ctime",
    ]);
    if (!["app", "full_local", "worker"].includes(entry.component)) fail("file inventory component is invalid");
    if (!["tracked_source", "generated_build", "worker_artifact", "fixture"].includes(entry.source_kind)) {
      fail("file inventory source kind is invalid");
    }
    const path = string(entry.path, `file_inventory[${index}].path`);
    if (isAbsolute(path) || path.split("/").includes("..")) fail("file inventory path is unsafe");
    if (!["file", "symlink"].includes(entry.type)) fail("file inventory type is invalid");
    safeInteger(entry.mode, `file_inventory[${index}].mode`);
    if (entry.mode > 0o7777) fail(`file_inventory[${index}].mode must be <= 4095`);
    decimalString(entry.uid, `file_inventory[${index}].uid`);
    decimalString(entry.gid, `file_inventory[${index}].gid`);
    decimalString(entry.nlink, `file_inventory[${index}].nlink`);
    decimalString(entry.device, `file_inventory[${index}].device`);
    decimalString(entry.inode, `file_inventory[${index}].inode`);
    decimalString(entry.size, `file_inventory[${index}].size`);
    string(entry.ctime, `file_inventory[${index}].ctime`);
    if (!/^\d{4}-\d{2}-\d{2}T/u.test(entry.ctime)) fail(`file_inventory[${index}].ctime is invalid`);
    if (entry.nlink !== "1") fail(`file_inventory[${index}].nlink must be exactly one`);
    digest(entry.sha256, `file_inventory[${index}].sha256`);
    if (entry.type === "file") {
      if (entry.symlink_target !== null || entry.dereferenced_sha256 !== null) fail("regular file symlink metadata is invalid");
    } else {
      string(entry.symlink_target, `file_inventory[${index}].symlink_target`);
      digest(entry.dereferenced_sha256, `file_inventory[${index}].dereferenced_sha256`);
    }
    const order = `${entry.component}\0${entry.path}`;
    if (order <= previous) fail("file_inventory must be strictly canonical ordered");
    previous = order;
  }
  return value;
}

function validateEnvironmentMetadata(value) {
  exactObject(value, "environment_snapshot", [
    "source_allowlist_id", "opaque_source_identity_digest", "opaque_override_digest",
    "exposed_value_count",
  ]);
  if (value.source_allowlist_id !== BUILD_ENV_ALLOWLIST_ID) fail("environment source allowlist is invalid");
  digest(value.opaque_source_identity_digest, "environment_snapshot.opaque_source_identity_digest");
  digest(value.opaque_override_digest, "environment_snapshot.opaque_override_digest");
  if (value.exposed_value_count !== 0) fail("environment values must not be exposed");
  return value;
}

function validateProductionGuard(value) {
  exactObject(value, "production_guard", [
    "snapshot_schema", "production_snapshot_pre_digest", "production_snapshot_post_digest",
    "equal", "mutation_attempt_count", "production_db_connection_count",
    "production_db_write_count",
  ]);
  if (value.snapshot_schema !== "homecook.local-mac-production-surface-snapshot.v1") {
    fail("production_guard.snapshot_schema is invalid");
  }
  digest(value.production_snapshot_pre_digest, "production_guard.production_snapshot_pre_digest");
  digest(value.production_snapshot_post_digest, "production_guard.production_snapshot_post_digest");
  if (
    value.equal !== true
    || value.production_snapshot_pre_digest !== value.production_snapshot_post_digest
  ) fail("production_guard snapshot equality is invalid");
  for (const key of ["mutation_attempt_count", "production_db_connection_count", "production_db_write_count"]) {
    if (value[key] !== 0) fail(`production_guard.${key} must be zero`);
  }
  return value;
}

function validateCandidateManifestObject(value, { verifyDigest = true } = {}) {
  exactObject(value, "candidate manifest", CANDIDATE_KEYS);
  if (value.schema !== RELEASE_REHEARSAL_CANDIDATE_SCHEMA) fail("candidate manifest schema is invalid");
  if (value.canonicalization !== CANONICALIZATION) fail("candidate canonicalization is invalid");
  if (value.repository !== REPOSITORY) fail("candidate repository is invalid");
  if (value.source_ref !== SOURCE_REF) fail("candidate source_ref is invalid");
  sha(value.release_sha, "release_sha");
  sha(value.release_tree, "release_tree");
  digest(value.ci_check_summary_digest, "ci_check_summary_digest");
  digest(value.ci_snapshot_digest, "ci_snapshot_digest");
  digest(value.ci_suite_run_set_digest, "ci_suite_run_set_digest");
  digest(value.source_manifest_digest, "source_manifest_digest");
  digest(value.compose_source_digest, "compose_source_digest");
  digest(value.sandbox_policy_digest, "sandbox_policy_digest");
  string(value.build_id, "build_id");
  digest(value.sealed_bundle_digest, "sealed_bundle_digest");
  digest(value.bundle_manifest_digest, "bundle_manifest_digest");
  validateCandidateToolchain(value.toolchain, { strictManifest: true });
  exactObject(value.build_tools, "build_tools", ["next_cli"]);
  validateToolIdentity(value.build_tools.next_cli, "build_tools.next_cli", { requireExecutable: false });
  digest(value.toolchain_lock_digest, "toolchain_lock_digest");
  validateCandidateImages(value.images, { strictManifest: true });
  validateMigration(value.migration);
  validateArtifacts(value.artifacts);
  validateFileInventory(value.file_inventory);
  validateEnvironmentMetadata(value.environment_snapshot);
  validateProductionGuard(value.production_guard);
  digest(value.candidate_identity_digest, "candidate_identity_digest");
  digest(value.manifest_digest, "manifest_digest");
  if (verifyDigest) {
    const unsigned = { ...value };
    delete unsigned.manifest_digest;
    if (sha256Jcs(unsigned) !== value.manifest_digest) fail("candidate manifest digest mismatch");
  }
  return value;
}

export function buildCandidateManifest(input) {
  const base = {
    schema: RELEASE_REHEARSAL_CANDIDATE_SCHEMA,
    canonicalization: CANONICALIZATION,
    repository: REPOSITORY,
    source_ref: SOURCE_REF,
    ...input,
  };
  exactObject(base, "candidate manifest input", CANDIDATE_KEYS.filter((key) => key !== "manifest_digest"));
  return validateCandidateManifestObject({ ...base, manifest_digest: sha256Jcs(base) });
}

export function parseAndValidateCandidateManifest(source) {
  const text = Buffer.isBuffer(source)
    ? decodeFatalUtf8(source, "candidate manifest")
    : source;
  return validateCandidateManifestObject(parseCanonicalJcs(text));
}

function assertPrivateParent(path, currentUid) {
  const parent = dirname(resolve(path));
  const parentStat = lstatSync(parent, { bigint: true });
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) fail("build environment parent must not be a symlink");
  if (parentStat.uid !== BigInt(currentUid) || (Number(parentStat.mode) & 0o077) !== 0) {
    fail("build environment parent must be current-user owned and private");
  }
  if (realpathSync(parent) !== parent) fail("build environment parent realpath drifted or contains a symlink");
}

export function readBuildEnvironmentSnapshot(path, {
  afterOpen = /** @type {() => void} */ (() => undefined),
  currentUid = process.getuid?.(),
  maxBytes = 16 * 1024,
} = {}) {
  if (!Number.isInteger(currentUid) || currentUid < 0) fail("current uid is unavailable");
  if (!isAbsolute(path)) fail("build environment source path must be absolute");
  assertPrivateParent(path, currentUid);
  const pre = lstatSync(path, { bigint: true });
  if (pre.isSymbolicLink() || !pre.isFile()) fail("build environment target must be regular and not a symlink");
  if (pre.uid !== BigInt(currentUid) || modeBits(pre.mode) !== 0o600) fail("build environment target must be current-user owned mode 0600");
  if (pre.nlink !== 1n) fail("build environment hard-link count must be exactly one");
  if (pre.size > BigInt(maxBytes)) fail(`build environment size exceeds ${maxBytes} bytes`);
  let fd;
  try {
    fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const opened = fstatSync(fd, { bigint: true });
    if (
      opened.dev !== pre.dev || opened.ino !== pre.ino || opened.uid !== pre.uid
      || opened.mode !== pre.mode || opened.size !== pre.size || opened.ctimeNs !== pre.ctimeNs
      || opened.mtimeNs !== pre.mtimeNs
    ) fail("build environment FD identity drifted before read");
    afterOpen();
    const bytes = readFileSync(fd);
    const postFd = fstatSync(fd, { bigint: true });
    const postPath = lstatSync(path, { bigint: true });
    for (const field of ["dev", "ino", "uid", "mode", "size", "ctimeNs", "mtimeNs"]) {
      if (postFd[field] !== opened[field] || postPath[field] !== opened[field]) {
        fail("build environment changed during FD snapshot (TOCTOU race)");
      }
    }
    if (bytes.length > maxBytes) fail(`build environment size exceeds ${maxBytes} bytes`);
    const parsed = parseCanonicalJcs(decodeFatalUtf8(bytes, "build environment"));
    exactObject(parsed, "build environment", ["schema", "values"]);
    if (parsed.schema !== RELEASE_REHEARSAL_BUILD_ENV_SCHEMA) fail("build environment schema is invalid");
    if (!parsed.values || typeof parsed.values !== "object" || Array.isArray(parsed.values)) fail("build environment values are invalid");
    const unknown = Object.keys(parsed.values).filter((key) => !BUILD_ENV_ALLOWED_KEYS.has(key));
    if (unknown.length > 0) fail(`build environment contains unknown or secret keys outside allowlist: ${unknown.sort().join(", ")}`);
    for (const [key, value] of Object.entries(parsed.values)) string(value, `build environment ${key}`);
    const sourceIdentity = {
      device: String(opened.dev), inode: String(opened.ino), mode: modeBits(opened.mode),
      owner: String(opened.uid), size: String(opened.size), sha256: sha256Bytes(bytes),
    };
    return {
      values: { ...parsed.values },
      metadata: {
        source_allowlist_id: BUILD_ENV_ALLOWLIST_ID,
        opaque_source_identity_digest: sha256Jcs(sourceIdentity),
        opaque_override_digest: sha256Jcs(parsed.values),
        exposed_value_count: 0,
      },
    };
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function assertSafeRelativeGitPath(path) {
  if (
    typeof path !== "string"
    || path.length === 0
    || isAbsolute(path)
    || path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) fail("git_tree_path_rejected");
  return path;
}

function ensureMaterializedParent(root, relativePath) {
  const segments = dirname(relativePath) === "." ? [] : dirname(relativePath).split("/");
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    try {
      mkdirSync(current, { mode: 0o700 });
    } catch (error) {
      if (!(error && typeof error === "object" && error.code === "EEXIST")) throw error;
    }
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("git_tree_parent_type_rejected");
  }
}

function gitBlobOid(bytes) {
  return createHash("sha1")
    .update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes)
    .digest("hex");
}

/** @param {{gitPath:string, repositoryRoot:string, releaseSha:string, outputRoot:string, homeDir:string, runCommand?:typeof spawnSync}} options */
export function materializeExactGitTree({
  gitPath,
  repositoryRoot,
  releaseSha,
  outputRoot,
  homeDir,
  runCommand = spawnSync,
} = {}) {
  sha(releaseSha, "releaseSha");
  if (![gitPath, repositoryRoot, outputRoot, homeDir].every((path) => isAbsolute(path ?? ""))) {
    fail("git materialization requires absolute paths");
  }
  try {
    mkdirSync(outputRoot, { mode: 0o700 });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") fail("git_materialization_root_collision");
    throw error;
  }
  const env = gitEnvironment(homeDir);
  const treeResult = spawnBounded(gitPath, [
    "--no-replace-objects",
    "-C",
    repositoryRoot,
    "ls-tree",
    "-rz",
    "--full-tree",
    releaseSha,
  ], { binary: true, env, label: "exact git tree inventory", runCommand });
  if (treeResult.error || treeResult.signal || treeResult.status !== 0) fail("git_tree_inventory_failed");
  const treeBytes = Buffer.from(treeResult.stdout ?? Buffer.alloc(0));
  const treeText = decodeFatalUtf8(treeBytes, "git tree inventory");
  const entries = [];
  for (const record of treeText.split("\0").filter(Boolean)) {
    const match = /^(100644|100755|120000) blob ([0-9a-f]{40})\t(.+)$/u.exec(record);
    if (!match) fail("git_tree_entry_rejected");
    const [, gitMode, blobOid, rawPath] = match;
    const relativePath = assertSafeRelativeGitPath(rawPath);
    const blobResult = spawnBounded(gitPath, [
      "--no-replace-objects",
      "-C",
      repositoryRoot,
      "cat-file",
      "blob",
      blobOid,
    ], { binary: true, env, label: "exact git blob read", runCommand });
    if (blobResult.error || blobResult.signal || blobResult.status !== 0) fail("git_blob_read_failed");
    const bytes = Buffer.from(blobResult.stdout ?? Buffer.alloc(0));
    if (gitBlobOid(bytes) !== blobOid) fail("git_blob_digest_mismatch");
    ensureMaterializedParent(outputRoot, relativePath);
    const destination = join(outputRoot, relativePath);
    let symlinkTarget = null;
    if (gitMode === "120000") {
      symlinkTarget = decodeFatalUtf8(bytes, "git symlink target");
      if (isAbsolute(symlinkTarget)) fail("git_symlink_absolute_target_rejected");
      symlinkSync(symlinkTarget, destination);
    } else {
      writeFileSync(destination, bytes, {
        flag: "wx",
        mode: gitMode === "100755" ? 0o700 : 0o600,
      });
    }
    entries.push({
      blob_oid: blobOid,
      git_mode: gitMode,
      path: relativePath,
      sha256: sha256Bytes(bytes),
      size: String(bytes.length),
      symlink_target: symlinkTarget,
    });
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const realOutputRoot = realpathSync(outputRoot);
  for (const entry of entries.filter((value) => value.git_mode === "120000")) {
    const target = realpathSync(join(outputRoot, entry.path));
    assertPathContained(realOutputRoot, target, "git symlink target");
  }
  const sourceManifest = {
    schema: "homecook.local-mac-production-rehearsal-source-manifest.v1",
    release_sha: releaseSha,
    entries,
    source_manifest_digest: sha256Jcs({ release_sha: releaseSha, entries }),
  };
  return Object.freeze({
    output_root: outputRoot,
    source_manifest: sourceManifest,
  });
}

export function verifyExactMaterializedTree({ sourceRoot, sourceManifest } = {}) {
  const realRoot = realpathSync(sourceRoot);
  for (const entry of sourceManifest.entries) {
    const path = join(sourceRoot, entry.path);
    const stat = lstatSync(path, { bigint: true });
    if (entry.git_mode === "120000") {
      if (!stat.isSymbolicLink() || readlinkSync(path) !== entry.symlink_target) {
        fail("materialized_git_symlink_drift");
      }
      assertPathContained(realRoot, realpathSync(path), "materialized git symlink");
      continue;
    }
    if (stat.isSymbolicLink() || !stat.isFile()) fail("materialized_git_file_type_drift");
    const executable = (modeBits(stat.mode) & 0o111) !== 0;
    if (executable !== (entry.git_mode === "100755")) fail("materialized_git_mode_drift");
    const bytes = readFileSync(path);
    if (sha256Bytes(bytes) !== entry.sha256 || gitBlobOid(bytes) !== entry.blob_oid) {
      fail("materialized_git_blob_drift");
    }
  }
  return sourceManifest.source_manifest_digest;
}

function copyManifestEntry({ sourceRoot, destinationRoot, entry, destinationPath = entry.path }) {
  ensureMaterializedParent(destinationRoot, destinationPath);
  const source = join(sourceRoot, entry.path);
  const destination = join(destinationRoot, destinationPath);
  if (entry.git_mode === "120000") {
    symlinkSync(entry.symlink_target, destination);
    return;
  }
  const bytes = readFileSync(source);
  if (sha256Bytes(bytes) !== entry.sha256 || gitBlobOid(bytes) !== entry.blob_oid) {
    fail("materialized_git_blob_drift");
  }
  copyFileSync(source, destination, fsConstants.COPYFILE_EXCL);
  chmodSync(destination, entry.git_mode === "100755" ? 0o500 : 0o400);
}

function trackedForPrefix(entry, prefixes, exactPaths) {
  return exactPaths.has(entry.path)
    || prefixes.some((prefix) => entry.path.startsWith(prefix));
}

/** @param {{sourceRoot:string, generatedRoot?:string, sourceManifest:any, artifactsRoot:string}} options */
export function assembleCandidateArtifacts({ sourceRoot, generatedRoot = sourceRoot, sourceManifest, artifactsRoot } = /** @type {any} */ ({})) {
  if (![sourceRoot, generatedRoot, artifactsRoot].every((path) => isAbsolute(path ?? ""))) {
    fail("artifact assembly paths must be absolute");
  }
  try {
    mkdirSync(artifactsRoot, { mode: 0o700 });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") fail("artifact_assembly_collision");
    throw error;
  }
  const appRoot = join(artifactsRoot, "app-source");
  const fullLocalRoot = join(artifactsRoot, "full-local-source");
  const workerFixtureRoot = join(artifactsRoot, "worker-fixture");
  for (const root of [appRoot, fullLocalRoot, workerFixtureRoot]) mkdirSync(root, { mode: 0o700 });
  const appPrefixes = ["app/", "components/", "lib/", "public/", "scripts/", "supabase/"];
  const appExact = new Set(["package.json", "pnpm-lock.yaml", "next.config.ts"]);
  const fullLocalPrefixes = ["infra/full-local-supabase/", "supabase/migrations/"];
  const fullLocalExact = new Set(["supabase/config.toml"]);
  for (const entry of sourceManifest.entries) {
    if (trackedForPrefix(entry, appPrefixes, appExact)) {
      copyManifestEntry({ sourceRoot, destinationRoot: appRoot, entry });
    }
    if (trackedForPrefix(entry, fullLocalPrefixes, fullLocalExact)) {
      copyManifestEntry({ sourceRoot, destinationRoot: fullLocalRoot, entry });
    }
  }
  for (const generatedPath of [".next", "node_modules"]) {
    const source = join(generatedRoot, generatedPath);
    const stat = lstatSync(source);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("generated_build_output_missing");
    copyLocalMacProductionExecutionTree(source, join(appRoot, generatedPath));
  }
  writeFileSync(join(workerFixtureRoot, "worker.mjs"), "export {};\n", { flag: "wx", mode: 0o500 });
  return Object.freeze({
    app: appRoot,
    full_local: fullLocalRoot,
    worker_fixture: workerFixtureRoot,
  });
}

function materializeBuildWorkspace({ sourceRoot, sourceManifest, buildRoot, generatedRoot }) {
  mkdirSync(buildRoot, { mode: 0o700 });
  mkdirSync(generatedRoot, { mode: 0o700 });
  for (const entry of sourceManifest.entries) {
    copyManifestEntry({ sourceRoot, destinationRoot: buildRoot, entry });
  }
  for (const name of [".next", "node_modules"]) {
    const generatedPath = join(generatedRoot, name);
    mkdirSync(generatedPath, { mode: 0o700 });
    symlinkSync(generatedPath, join(buildRoot, name));
  }
  const sealDirectories = (path) => {
    for (const name of readdirSync(path)) {
      const child = join(path, name);
      const stat = lstatSync(child);
      if (stat.isDirectory()) sealDirectories(child);
    }
    chmodSync(path, 0o500);
  };
  sealDirectories(buildRoot);
}

export function collectSealedMigrationInventory({ bundleRoot } = {}) {
  if (!isAbsolute(bundleRoot ?? "")) fail("sealed bundle root must be absolute");
  const migrationRoot = join(bundleRoot, "full_local", "supabase", "migrations");
  const files = readdirSync(migrationRoot).filter((name) => name.endsWith(".sql")).sort();
  if (files.length === 0) fail("sealed_migration_inventory_empty");
  const inventory = files.map((name) => {
    const path = join(migrationRoot, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile()) fail("sealed_migration_type_rejected");
    return {
      path: `supabase/migrations/${name}`,
      sha256: sha256Bytes(readFileSync(path)),
    };
  });
  return Object.freeze({
    ordered_migration_files: inventory.map((entry) => entry.path),
    ordered_migration_files_digest: sha256Jcs(inventory),
    migration_head: files.at(-1).replace(/\.sql$/u, ""),
  });
}

const FORBIDDEN_BUNDLE_BASENAMES = new Set([
  ".env.production.local",
  "current.json",
  "previous.json",
  "production-promotion.lock",
  "production-pointer.json",
  "raw-env.json",
  "provider-payload.json",
]);
const RAW_SECRET_ASSIGNMENT_PATTERN = /^(?:[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE_KEY|DATABASE_URL|SERVICE_ROLE_KEY)[A-Z0-9_]*)=/mu;
const PRIVATE_KEY_MATERIAL_PATTERN = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u;
const JSON_SECRET_VALUE_PATTERN = /"(?:password|secret|token|cookie|private_key|service_role_key|database_url)"\s*:\s*"(?!<|\$\{|redacted)[^"]+"/iu;
const FORBIDDEN_SECRET_FILENAMES = new Set([
  ".npmrc",
  ".netrc",
  "credentials.json",
  "cookies.json",
  "provider-payload.json",
  "raw-env.json",
  "runtime-secret.json",
  "secrets.json",
  "token.json",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "credentials",
  "secrets",
  "tokens",
  "cookies",
  "private-key",
  "private_key",
]);
const SECRET_SCAN_MAX_BYTES = 512 * 1024 * 1024;
const SECRET_SCAN_CHUNK_BYTES = 64 * 1024;
const SECRET_SCAN_OVERLAP_BYTES = 64 * 1024;

function isSecretBearingPath(relativePath) {
  const segments = relativePath.split("/");
  const lowerBasename = basename(relativePath).toLowerCase();
  return (
    lowerBasename === ".env"
    || lowerBasename.startsWith(".env.")
    || /\.(?:key|p12|pfx|pem)$/iu.test(lowerBasename)
    || FORBIDDEN_SECRET_FILENAMES.has(lowerBasename)
    || segments.some((segment) => [".ssh", ".aws", "runtime-secrets", "runtime_secret"].includes(segment.toLowerCase()))
    || /(?:^|[-_.])(?:credentials|secrets|tokens|cookies|private[-_]?key)(?:[-_.])(?:json|ya?ml|txt|env)$/iu.test(lowerBasename)
    || (segments.includes(".docker") && lowerBasename === "config.json")
  );
}

function assertNoSecretBearingPath(relativePath) {
  if (isSecretBearingPath(relativePath)) {
    fail(`secret_path_forbidden path_digest=${sha256Jcs(relativePath)}`);
  }
}

function isForbiddenSecretDirectory(relativePath) {
  return relativePath.split("/").some((segment) =>
    [".ssh", ".aws", ".docker", "runtime-secrets", "runtime_secret", "secrets"]
      .includes(segment.toLowerCase()));
}

function scanFileForSecretMaterial(path, { jsonLike = false } = {}) {
  const stat = lstatSync(path, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink()) fail("secret_scan_type_rejected");
  if (stat.size > BigInt(SECRET_SCAN_MAX_BYTES)) fail("secret_scan_size_limit_exceeded");
  const buffer = Buffer.allocUnsafe(SECRET_SCAN_CHUNK_BYTES);
  let fd;
  let offset = 0;
  let tail = "";
  try {
    fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    while (offset < Number(stat.size)) {
      const bytesRead = readSync(fd, buffer, 0, buffer.length, offset);
      if (bytesRead <= 0) break;
      const text = `${tail}${buffer.subarray(0, bytesRead).toString("latin1")}`;
      if (
        RAW_SECRET_ASSIGNMENT_PATTERN.test(text)
        || PRIVATE_KEY_MATERIAL_PATTERN.test(text)
        || (jsonLike && JSON_SECRET_VALUE_PATTERN.test(text))
      ) return true;
      tail = text.slice(-SECRET_SCAN_OVERLAP_BYTES);
      offset += bytesRead;
    }
    const finalStat = fstatSync(fd, { bigint: true });
    if (
      finalStat.dev !== stat.dev
      || finalStat.ino !== stat.ino
      || finalStat.size !== stat.size
      || finalStat.ctimeNs !== stat.ctimeNs
      || finalStat.mtimeNs !== stat.mtimeNs
    ) fail("secret_scan_identity_drift");
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function scanDereferencedSecretTarget(path, seen = new Set()) {
  const real = realpathSync(path);
  if (seen.has(real)) fail("secret_scan_symlink_cycle");
  const nextSeen = new Set(seen).add(real);
  const stat = lstatSync(real);
  if (stat.isFile()) {
    return scanFileForSecretMaterial(real, { jsonLike: basename(real).toLowerCase().endsWith(".json") });
  }
  if (!stat.isDirectory()) fail("secret_scan_target_type_rejected");
  for (const name of readdirSync(real).sort()) {
    if (scanDereferencedSecretTarget(join(real, name), nextSeen)) return true;
  }
  return false;
}

function assertPathContained(root, target, label) {
  const relativePath = relative(root, target);
  if (relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))) return;
  fail(`${label} escapes its contained component root`);
}

function digestDereferencedPath(path) {
  const stat = lstatSync(path);
  if (stat.isFile()) return sha256Bytes(readFileSync(path));
  if (stat.isDirectory()) return digestLocalMacProductionExecutionTree(path);
  fail("symlink dereferenced target is unsupported");
}

function assertSourceTreeSafe(rootPath) {
  const root = realpathSync(rootPath);
  const visit = (path, relativePath) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      assertNoSecretBearingPath(relativePath);
      const target = realpathSync(path);
      assertPathContained(root, target, `symlink ${relativePath}`);
      if (scanDereferencedSecretTarget(target)) {
        fail(`secret_material_detected path_digest=${sha256Jcs(relativePath)}`);
      }
      return;
    }
    if (stat.isDirectory()) {
      if (relativePath && isForbiddenSecretDirectory(relativePath)) {
        fail(`secret_directory_forbidden path_digest=${sha256Jcs(relativePath)}`);
      }
      for (const name of readdirSync(path).sort()) {
        visit(join(path, name), relativePath ? `${relativePath}/${name}` : name);
      }
      return;
    }
    if (!stat.isFile()) fail(`candidate component contains unsupported entry: ${relativePath}`);
    if (stat.nlink !== 1) fail(`candidate component source hard-link count is unsafe: ${relativePath}`);
    assertNoSecretBearingPath(relativePath);
    const lowerBasename = basename(relativePath).toLowerCase();
    if (FORBIDDEN_BUNDLE_BASENAMES.has(basename(relativePath))) {
      fail(`forbidden_bundle_path path_digest=${sha256Jcs(relativePath)}`);
    }
    if (scanFileForSecretMaterial(path, { jsonLike: lowerBasename.endsWith(".json") })) {
      fail(`secret_material_detected path_digest=${sha256Jcs(relativePath)}`);
    }
  };
  visit(root, "");
}

function inventorySealedComponent(component, rootPath) {
  const root = realpathSync(rootPath);
  const inventory = [];
  const verifyStableIdentity = (path, before, label) => {
    const after = lstatSync(path, { bigint: true });
    for (const key of ["dev", "ino", "mode", "uid", "gid", "nlink", "size", "ctimeNs"]) {
      if (after[key] !== before[key]) fail(`sealed entry identity drifted during read: ${label}`);
    }
  };
  const visit = (path, relativePath) => {
    const stat = lstatSync(path, { bigint: true });
    if (stat.uid !== BigInt(process.getuid?.())) fail(`sealed entry owner is unsafe: ${relativePath}`);
    if (stat.isSymbolicLink()) {
      if (stat.nlink !== 1n) fail(`sealed symlink hard-link identity is unsafe: ${relativePath}`);
      const target = realpathSync(path);
      assertPathContained(root, target, `sealed symlink ${relativePath}`);
      const symlinkTarget = readlinkSync(path);
      const dereferencedDigest = digestDereferencedPath(target);
      verifyStableIdentity(path, stat, relativePath);
      inventory.push({
        component,
        source_kind: component === "worker"
          ? "worker_artifact"
          : component === "app" && (relativePath.startsWith(".next/") || relativePath.startsWith("node_modules/"))
            ? "generated_build"
            : "tracked_source",
        path: relativePath,
        type: "symlink",
        mode: modeBits(stat.mode),
        uid: String(stat.uid),
        gid: String(stat.gid),
        nlink: String(stat.nlink),
        device: String(stat.dev),
        inode: String(stat.ino),
        size: String(stat.size),
        ctime: new Date(Number(stat.ctimeMs)).toISOString(),
        sha256: sha256Bytes(Buffer.from(symlinkTarget, "utf8")),
        symlink_target: symlinkTarget,
        dereferenced_sha256: dereferencedDigest,
      });
      return;
    }
    if (stat.isDirectory()) {
      for (const name of readdirSync(path).sort()) {
        visit(join(path, name), relativePath ? `${relativePath}/${name}` : name);
      }
      return;
    }
    if (!stat.isFile()) fail(`sealed candidate component contains unsupported entry: ${relativePath}`);
    if (stat.nlink !== 1n) fail(`sealed file hard-link identity is unsafe: ${relativePath}`);
    if ((modeBits(stat.mode) & 0o222) !== 0) fail(`sealed candidate file remains writable: ${relativePath}`);
    const bytes = readFileSync(path);
    verifyStableIdentity(path, stat, relativePath);
    inventory.push({
      component,
      source_kind: component === "worker"
        ? "worker_artifact"
        : component === "app" && (relativePath.startsWith(".next/") || relativePath.startsWith("node_modules/"))
          ? "generated_build"
          : "tracked_source",
      path: relativePath,
      type: "file",
      mode: modeBits(stat.mode),
      uid: String(stat.uid),
      gid: String(stat.gid),
      nlink: String(stat.nlink),
      device: String(stat.dev),
      inode: String(stat.ino),
      size: String(stat.size),
      ctime: new Date(Number(stat.ctimeMs)).toISOString(),
      sha256: sha256Bytes(bytes),
      symlink_target: null,
      dereferenced_sha256: null,
    });
  };
  for (const name of readdirSync(root).sort()) visit(join(root, name), name);
  return inventory;
}

export function createSealedCandidateBundle({ bundleRoot, componentRoots } = {}) {
  if (!isAbsolute(bundleRoot ?? "")) fail("bundleRoot must be absolute");
  exactObject(componentRoots, "componentRoots", ["app", "full_local", "worker"]);
  for (const component of ["app", "full_local", "worker"]) assertSourceTreeSafe(componentRoots[component]);
  try {
    mkdirSync(bundleRoot, { mode: 0o700 });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      fail("candidate bundle create-only collision; existing roots are never reused");
    }
    throw error;
  }
  const artifacts = {};
  const fileInventory = [];
  const physicalFileInventory = [];
  for (const component of ["app", "full_local", "worker"]) {
    const destination = join(bundleRoot, component);
    copyLocalMacProductionExecutionTree(componentRoots[component], destination);
    sealLocalMacProductionExecutionTree(destination);
    const entries = inventorySealedComponent(component, destination);
    fileInventory.push(...entries);
    const physicalEntries = entries.map((entry) => {
      const physicalEntry = { ...entry };
      for (const field of ["source_kind", "uid", "gid", "nlink", "device", "inode", "ctime"]) {
        delete physicalEntry[field];
      }
      return physicalEntry;
    });
    physicalFileInventory.push(...physicalEntries);
    artifacts[component] = {
      root: component,
      digest: sha256Jcs(physicalEntries),
    };
  }
  fileInventory.sort((left, right) =>
    `${left.component}\0${left.path}`.localeCompare(`${right.component}\0${right.path}`));
  physicalFileInventory.sort((left, right) =>
    `${left.component}\0${left.path}`.localeCompare(`${right.component}\0${right.path}`));
  const bundleManifest = {
    schema: "homecook.local-mac-production-rehearsal-sealed-bundle.v1",
    artifacts,
    file_inventory: physicalFileInventory,
  };
  const sealedBundleDigest = sha256Jcs({ schema: bundleManifest.schema, artifacts });
  const unsignedBundleManifest = {
    ...bundleManifest,
    bundle_content_digest: sealedBundleDigest,
  };
  const bundleManifestDigest = sha256Jcs(unsignedBundleManifest);
  writeFileSync(join(bundleRoot, "physical-manifest.json"), canonicalizeJcs({
    ...unsignedBundleManifest,
    physical_manifest_digest: bundleManifestDigest,
  }), { flag: "wx", mode: 0o400 });
  chmodSync(bundleRoot, 0o500);
  return {
    artifacts,
    bundle_root: bundleRoot,
    file_inventory: fileInventory,
    physical_manifest_digest: bundleManifestDigest,
    sealed_bundle_digest: sealedBundleDigest,
  };
}

export function buildBundleAuthorityManifest(input) {
  exactObject(input, "bundle authority manifest input", [
    "artifacts", "build_id", "ci_check_summary_digest", "ci_snapshot_digest",
    "ci_suite_run_set_digest", "environment_snapshot", "file_inventory", "images",
    "migration", "production_guard", "release_sha", "release_tree",
    "sandbox_policy_digest", "sealed_bundle_digest", "source_manifest_digest",
    "source_snapshot_digest", "compose_source_digest", "toolchain", "toolchain_lock_digest",
    "build_tools",
    "repository", "source_ref",
  ]);
  if (input.repository !== REPOSITORY || input.source_ref !== SOURCE_REF) {
    fail("bundle authority repository or source_ref is invalid");
  }
  validateArtifacts(input.artifacts);
  string(input.build_id, "bundle authority build_id");
  for (const field of [
    "ci_check_summary_digest", "ci_snapshot_digest", "ci_suite_run_set_digest",
    "sandbox_policy_digest", "sealed_bundle_digest", "source_manifest_digest",
    "source_snapshot_digest", "compose_source_digest", "toolchain_lock_digest",
  ]) digest(input[field], `bundle authority ${field}`);
  validateEnvironmentMetadata(input.environment_snapshot);
  validateFileInventory(input.file_inventory);
  validateCandidateImages(input.images, { strictManifest: true });
  validateMigration(input.migration);
  validateProductionGuard(input.production_guard);
  sha(input.release_sha, "bundle authority release_sha");
  sha(input.release_tree, "bundle authority release_tree");
  validateCandidateToolchain(input.toolchain, { strictManifest: true });
  exactObject(input.build_tools, "bundle authority build_tools", ["next_cli"]);
  validateToolIdentity(input.build_tools.next_cli, "bundle authority build_tools.next_cli", {
    requireExecutable: false,
  });
  const unsigned = {
    schema: "homecook.local-mac-production-rehearsal-bundle-manifest.v1",
    contract_version: "release-rehearsal-split2-v1",
    ...input,
  };
  return Object.freeze({
    ...unsigned,
    bundle_manifest_digest: sha256Jcs(unsigned),
  });
}

function ensureNamespaceDirectory(path, currentUid, label) {
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if (!(error && typeof error === "object" && error.code === "EEXIST")) throw error;
  }
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory() || stat.uid !== currentUid || modeBits(stat.mode) !== 0o700) {
    fail(`${label} must be a current-user-owned private directory`);
  }
  return path;
}

function sandboxLiteral(path) {
  if (!isAbsolute(path)) fail("sandbox path must be absolute");
  return `\"${path.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}\"`;
}

/** @param {{readRoots?:string[], writeRoots?:string[], deniedPaths?:string[], deniedWritePaths?:string[]}} options */
export function buildCandidateSandboxProfile({
  readRoots = [], writeRoots = [], deniedPaths = [], deniedWritePaths = [],
} = {}) {
  const systemRuntimeRoots = [
    "/System",
    "/usr",
    "/bin",
    "/sbin",
    "/Library",
    "/private/etc",
    "/private/var/db",
    "/private/var/folders",
    "/private/var/select",
    "/private/var/run",
    "/dev",
  ];
  const approvedReadRoots = [...new Set([...readRoots, ...systemRuntimeRoots])];
  const ancestors = new Set(["/"]);
  for (const root of [...approvedReadRoots, ...writeRoots]) {
    let current = resolve(root);
    while (current !== "/") {
      ancestors.add(current);
      current = dirname(current);
    }
  }
  const readRules = [
    ...[...ancestors].map((path) => `(literal ${sandboxLiteral(path)})`),
    ...approvedReadRoots.map((path) => `(subpath ${sandboxLiteral(path)})`),
  ].join(" ");
  const writeRules = [...new Set(writeRoots)].map((path) => `(subpath ${sandboxLiteral(path)})`).join(" ");
  const expandedDeniedPaths = new Set(deniedPaths);
  for (const path of deniedPaths) {
    try { expandedDeniedPaths.add(realpathSync(path)); } catch { /* Missing denied targets stay lexical. */ }
  }
  const denyRules = [...expandedDeniedPaths].flatMap((path) => [
    `(deny file-read* (subpath ${sandboxLiteral(path)}))`,
    `(deny file-write* (subpath ${sandboxLiteral(path)}))`,
  ]).join("\n");
  const denyWriteRules = [...new Set(deniedWritePaths)].map((path) =>
    `(deny file-write* (subpath ${sandboxLiteral(path)}))`).join("\n");
  return [
    "(version 1)",
    "(deny default)",
    "(allow process-exec)",
    "(allow process-fork)",
    `(deny process-exec ${[
      "/bin/launchctl", "/usr/bin/launchctl", "/usr/local/bin/docker", "/opt/homebrew/bin/docker",
    ].map((path) => `(literal ${sandboxLiteral(path)})`).join(" ")})`,
    "(allow sysctl-read)",
    `(allow file-read* ${readRules})`,
    `(allow file-write* ${writeRules})`,
    "(deny network*)",
    denyRules,
    denyWriteRules,
  ].filter(Boolean).join("\n");
}

export function validateProductionGuardSnapshots(pre, post) {
  const schema = "homecook.local-mac-production-surface-snapshot.v1";
  for (const [label, value] of [["pre", pre], ["post", post]]) {
    if (!value || value.schema !== schema) fail(`production ${label} snapshot schema or completeness is invalid`);
    digest(value.surface_digest, `production ${label} surface digest`);
    digest(value.snapshot_digest, `production ${label} snapshot digest`);
    if (value.production_db_connection_count !== 0 || value.mutation_attempt_count !== 0) {
      fail(`production ${label} snapshot contains mutation or DB access`);
    }
  }
  if (pre.surface_digest !== post.surface_digest) fail("production surface drifted during candidate build");
  return Object.freeze({
    snapshot_schema: schema,
    production_snapshot_pre_digest: pre.surface_digest,
    production_snapshot_post_digest: post.surface_digest,
    equal: true,
    mutation_attempt_count: 0,
    production_db_connection_count: 0,
    production_db_write_count: 0,
  });
}

export function writeCandidateTerminalMarker(root, kind, payload) {
  if (!isAbsolute(root ?? "") || !["complete", "failed"].includes(kind)) {
    fail("candidate terminal marker input is invalid");
  }
  const stat = lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory() || modeBits(stat.mode) !== 0o700) {
    fail("candidate terminal root is unsafe");
  }
  const completePath = join(root, "complete.json");
  const failedPath = join(root, "failed.json");
  if (pathExists(completePath) || pathExists(failedPath)) {
    fail("candidate terminal marker create-only collision or coexistence");
  }
  const reservationPath = join(root, ".terminal-reservation");
  try {
    mkdirSync(reservationPath, { mode: 0o700 });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      fail("candidate terminal marker create-only reservation collision");
    }
    throw error;
  }
  if (pathExists(completePath) || pathExists(failedPath)) {
    rmSync(reservationPath, { recursive: true });
    fail("candidate terminal marker appeared during reservation");
  }
  const value = kind === "complete"
    ? {
        schema: "homecook.local-mac-production-rehearsal-candidate-complete.v1",
        status: "complete",
        candidate_identity_digest: digest(payload.candidate_identity_digest, "candidate identity digest"),
        manifest_digest: digest(payload.manifest_digest, "candidate manifest digest"),
      }
    : {
        schema: "homecook.local-mac-production-rehearsal-candidate-failed.v1",
        status: "failed",
        reason_code: string(payload.reason_code, "failure reason code"),
        path_digest: digest(payload.path_digest, "failure path digest"),
      };
  const markerPath = kind === "complete" ? completePath : failedPath;
  try {
    writeFileSync(markerPath, canonicalizeJcs(value), { flag: "wx", mode: 0o400 });
  } finally {
    rmSync(reservationPath, { recursive: true });
  }
  return markerPath;
}

/** @param {string} root @param {string} path @param {string} label @param {{afterOpen?:null|(()=>void),maxBytes?:number}} options */
export function readSealedAuthorityFile(root, path, label, { afterOpen = null, maxBytes = 16 * 1024 * 1024 } = {}) {
  if (!isAbsolute(root ?? "") || !isAbsolute(path ?? "")) fail(`${label} authority path must be absolute`);
  if (resolve(root) !== root || resolve(path) !== path) fail(`${label} authority lexical path is not canonical`);
  const sameIdentity = (left, right) => [
    "dev", "ino", "mode", "uid", "gid", "nlink", "size", "ctimeNs", "mtimeNs",
  ].every((key) => left[key] === right[key]);
  const currentUid = BigInt(process.getuid?.());
  const privateDirectoryModes = new Set([0o500, 0o700]);
  const fileRelative = relative(root, path);
  if (fileRelative === "" || isAbsolute(fileRelative) || fileRelative.startsWith("..")) {
    fail(`${label} authority lexical path escapes the root`);
  }
  const parentRelative = relative(root, dirname(path));
  if (isAbsolute(parentRelative) || parentRelative.startsWith("..")) {
    fail(`${label} authority lexical parent escapes the root`);
  }
  const parentPaths = [root];
  let currentParent = root;
  for (const segment of parentRelative === "" ? [] : parentRelative.split("/")) {
    currentParent = join(currentParent, segment);
    parentPaths.push(currentParent);
  }
  const parentSnapshots = [];
  const parentFds = [];
  try {
    for (const parentPath of parentPaths) {
      const parentStat = lstatSync(parentPath, { bigint: true });
      if (
        !parentStat.isDirectory() || parentStat.isSymbolicLink() || parentStat.uid !== currentUid
        || !privateDirectoryModes.has(modeBits(parentStat.mode))
      ) fail(`${label} authority lexical parent owner, type, symlink, or private mode is unsafe`);
      if (realpathSync(parentPath) !== parentPath) fail(`${label} authority lexical parent is not canonical`);
      const parentFd = openSync(parentPath, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
      if (!sameIdentity(parentStat, fstatSync(parentFd, { bigint: true }))) {
        closeSync(parentFd);
        fail(`${label} authority lexical parent identity drifted before read`);
      }
      parentSnapshots.push([parentPath, parentStat]);
      parentFds.push(parentFd);
    }
  } catch (error) {
    for (const parentFd of parentFds) closeSync(parentFd);
    throw error;
  }
  let fd;
  try {
    const before = lstatSync(path, { bigint: true });
    if (
      !before.isFile() || before.isSymbolicLink() || before.uid !== currentUid || before.nlink !== 1n
      || modeBits(before.mode) !== 0o400 || before.size > BigInt(maxBytes)
    ) fail(`${label} authority file owner, mode, hardlink, or size is unsafe`);
    if (realpathSync(path) !== path) fail(`${label} authority lexical file is not canonical`);
    fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const opened = fstatSync(fd, { bigint: true });
    if (!sameIdentity(before, opened)) fail(`${label} authority identity drifted before read`);
    afterOpen?.();
    const bytes = readFileSync(fd);
    const fdPost = fstatSync(fd, { bigint: true });
    const pathPost = lstatSync(path, { bigint: true });
    if (!sameIdentity(opened, fdPost) || !sameIdentity(opened, pathPost)) {
      fail(`${label} authority path swap or identity drift occurred during read`);
    }
    for (let index = 0; index < parentSnapshots.length; index += 1) {
      const [parentPath, parentBefore] = parentSnapshots[index];
      const lexicalPost = lstatSync(parentPath, { bigint: true });
      const fdPost = fstatSync(parentFds[index], { bigint: true });
      if (
        !sameIdentity(parentBefore, lexicalPost) || !sameIdentity(parentBefore, fdPost)
        || lexicalPost.isSymbolicLink() || realpathSync(parentPath) !== parentPath
      ) {
        fail(`${label} authority parent identity drifted during read`);
      }
    }
    return parseCanonicalJcs(decodeFatalUtf8(bytes, label));
  } finally {
    if (fd !== undefined) closeSync(fd);
    for (const parentFd of parentFds) closeSync(parentFd);
  }
}

export function validateStoredCiProjection(value, manifest) {
  exactObject(value, "candidate CI evidence", [
    "repository", "check_runs", "commit_statuses", "head_sha", "remote_master_sha", "summary",
  ]);
  if (value.repository !== REPOSITORY) fail("candidate CI evidence repository is invalid");
  sha(value.head_sha, "candidate CI evidence head_sha");
  sha(value.remote_master_sha, "candidate CI evidence remote_master_sha");
  if (value.head_sha !== manifest.release_sha || value.remote_master_sha !== manifest.release_sha) {
    fail("candidate CI evidence head or remote master SHA does not match candidate");
  }
  if (!Array.isArray(value.check_runs) || !Array.isArray(value.commit_statuses)) {
    fail("candidate CI evidence check and status arrays are invalid");
  }
  for (const [index, entry] of value.check_runs.entries()) {
    exactObject(entry, `candidate CI check_runs[${index}]`, [
      "id", "app_id", "check_suite_id", "head_sha", "completed_at", "conclusion", "name",
      "started_at", "status",
    ]);
    for (const key of ["id", "app_id", "check_suite_id"]) safeInteger(entry[key], `candidate CI check ${key}`);
    if (
      entry.app_id !== GITHUB_ACTIONS_APP_INTEGRATION_ID
      || entry.head_sha !== manifest.release_sha || entry.status !== "completed" || entry.conclusion !== "success"
    ) {
      fail("candidate CI check identity or terminal success state is invalid");
    }
    string(entry.name, "candidate CI check name");
    string(entry.started_at, "candidate CI check started_at");
    string(entry.completed_at, "candidate CI check completed_at");
  }
  if (new Set(value.check_runs.map((entry) => entry.id)).size !== value.check_runs.length) {
    fail("candidate CI check run identities are duplicated");
  }
  if (new Set(value.commit_statuses.map((entry) => entry.id)).size !== value.commit_statuses.length) {
    fail("candidate CI status identities are duplicated");
  }
  const recomputedSummary = {
    total: new Set(value.check_runs.map((entry) => entry.name)).size,
    success: new Set(value.check_runs.map((entry) => entry.name)).size,
    intended_skip: 0,
    bad: 0,
    cancelled: 0,
    failed: 0,
    pending: 0,
    queued: 0,
    rerun: 0,
  };
  if (canonicalizeJcs(recomputedSummary) !== canonicalizeJcs(value.summary)) {
    fail("candidate CI stored summary differs from recomputed check arrays");
  }
  for (const [index, entry] of value.commit_statuses.entries()) {
    exactObject(entry, `candidate CI commit_statuses[${index}]`, [
      "id", "sha", "context", "created_at", "state", "updated_at",
    ]);
    safeInteger(entry.id, "candidate CI status id");
    if (entry.sha !== manifest.release_sha || entry.state !== "success") {
      fail("candidate CI status identity or terminal success state is invalid");
    }
    string(entry.context, "candidate CI status context");
  }
  const evidenceDigest = sha256Jcs(value);
  const summaryDigest = sha256Jcs(value.summary);
  const suiteRunSetDigest = sha256Jcs(value.check_runs.map((entry) => ({
    app_id: entry.app_id,
    check_suite_id: entry.check_suite_id,
    id: entry.id,
  })));
  validateCandidateCiEvidence({
    expected_head_sha: manifest.release_sha,
    head_sha: value.head_sha,
    summary: value.summary,
    summary_digest: summaryDigest,
  });
  if (
    evidenceDigest !== manifest.ci_snapshot_digest
    || summaryDigest !== manifest.ci_check_summary_digest
    || suiteRunSetDigest !== manifest.ci_suite_run_set_digest
  ) fail("candidate CI evidence digest binding is invalid");
}

export function validateCandidateBundleCrossBinding(candidate, bundle) {
  const pairs = [
    ["repository", candidate.repository, bundle.repository],
    ["source_ref", candidate.source_ref, bundle.source_ref],
    ["release_sha", candidate.release_sha, bundle.release_sha],
    ["release_tree", candidate.release_tree, bundle.release_tree],
    ["build_id", candidate.build_id, bundle.build_id],
    ["toolchain", candidate.toolchain, bundle.toolchain],
    ["build_tools", candidate.build_tools, bundle.build_tools],
    ["images", candidate.images, bundle.images],
    ["migration", candidate.migration, bundle.migration],
    ["artifacts", candidate.artifacts, bundle.artifacts],
    ["file_inventory", candidate.file_inventory, bundle.file_inventory],
    ["sealed_bundle_digest", candidate.sealed_bundle_digest, bundle.sealed_bundle_digest],
    ["bundle_manifest_digest", candidate.bundle_manifest_digest, bundle.bundle_manifest_digest],
    ["ci_check_summary_digest", candidate.ci_check_summary_digest, bundle.ci_check_summary_digest],
    ["ci_snapshot_digest", candidate.ci_snapshot_digest, bundle.ci_snapshot_digest],
    ["ci_suite_run_set_digest", candidate.ci_suite_run_set_digest, bundle.ci_suite_run_set_digest],
    ["source_manifest_digest", candidate.source_manifest_digest, bundle.source_manifest_digest],
    ["compose_source_digest", candidate.compose_source_digest, bundle.compose_source_digest],
    ["source_snapshot_digest", candidate.source_manifest_digest, bundle.source_snapshot_digest],
    ["sandbox_policy_digest", candidate.sandbox_policy_digest, bundle.sandbox_policy_digest],
    ["toolchain_lock_digest", candidate.toolchain_lock_digest, bundle.toolchain_lock_digest],
    ["environment_snapshot", candidate.environment_snapshot, bundle.environment_snapshot],
    ["production_guard", candidate.production_guard, bundle.production_guard],
  ];
  for (const [field, left, right] of pairs) {
    if (canonicalizeJcs(left) !== canonicalizeJcs(right)) {
      fail(`candidate and bundle cross-binding differs at ${field}`);
    }
  }
  return bundle;
}

export function readCompletedCandidateRoot(root) {
  if (!isAbsolute(root ?? "")) fail("completed candidate root must be absolute");
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory() || (modeBits(rootStat.mode) & 0o222) !== 0) {
    fail("completed candidate root is not sealed");
  }
  const completePath = join(root, "complete.json");
  const failedPath = join(root, "failed.json");
  if (!pathExists(completePath) || pathExists(failedPath)) {
    fail("candidate complete terminal marker is missing or conflicts with failed marker");
  }
  const complete = readSealedAuthorityFile(root, completePath, "candidate complete marker");
  exactObject(complete, "candidate complete marker", [
    "schema", "status", "candidate_identity_digest", "manifest_digest",
  ]);
  if (
    complete.schema !== "homecook.local-mac-production-rehearsal-candidate-complete.v1"
    || complete.status !== "complete"
  ) fail("candidate complete marker schema or status is invalid");
  const manifest = validateCandidateManifestObject(
    readSealedAuthorityFile(root, join(root, "candidate.json"), "candidate manifest"),
  );
  const candidateIdentityAuthority = readSealedAuthorityFile(
    root,
    join(root, "bundles", "candidate-identity.json"),
    "candidate identity authority",
  );
  exactObject(candidateIdentityAuthority, "candidate identity authority", [
    "schema", "candidate_identity_digest",
  ]);
  if (candidateIdentityAuthority.schema !== "homecook.local-mac-production-rehearsal-candidate-identity.v1") {
    fail("candidate identity authority schema is invalid");
  }
  digest(candidateIdentityAuthority.candidate_identity_digest, "candidate identity authority digest");
  const evidenceRoot = join(root, "evidence");
  const evidenceNames = readdirSync(evidenceRoot).sort();
  if (canonicalizeJcs(evidenceNames) !== canonicalizeJcs(["ci-evidence.json"])) {
    fail("candidate CI evidence inventory is missing or contains additional evidence");
  }
  validateStoredCiProjection(
    readSealedAuthorityFile(root, join(evidenceRoot, "ci-evidence.json"), "candidate CI evidence"),
    manifest,
  );
  const bundleManifest = readSealedAuthorityFile(
    root,
    join(root, "bundles", "bundle", "bundle-manifest.json"),
    "candidate bundle authority manifest",
  );
  const {
    bundle_manifest_digest: bundleManifestDigest,
    schema: bundleSchema,
    contract_version: contractVersion,
    ...bundleInput
  } = bundleManifest;
  if (
    bundleSchema !== "homecook.local-mac-production-rehearsal-bundle-manifest.v1"
    || contractVersion !== "release-rehearsal-split2-v1"
  ) fail("candidate bundle authority schema or contract version is invalid");
  const rebuiltBundleManifest = buildBundleAuthorityManifest(bundleInput);
  validateCandidateBundleCrossBinding(manifest, bundleManifest);
  const physicalBundleRoot = join(root, "bundles", "bundle");
  const physicalManifest = readSealedAuthorityFile(
    root,
    join(physicalBundleRoot, "physical-manifest.json"),
    "candidate physical manifest",
  );
  exactObject(physicalManifest, "candidate physical manifest", [
    "schema", "artifacts", "file_inventory", "bundle_content_digest", "physical_manifest_digest",
  ]);
  const actualInventory = [];
  const actualPhysicalInventory = [];
  const actualArtifacts = {};
  for (const component of ["app", "full_local", "worker"]) {
    const entries = inventorySealedComponent(component, join(physicalBundleRoot, component));
    actualInventory.push(...entries);
    const physicalEntries = entries.map((entry) => {
      const physicalEntry = { ...entry };
      for (const field of ["source_kind", "uid", "gid", "nlink", "device", "inode", "ctime"]) {
        delete physicalEntry[field];
      }
      return physicalEntry;
    });
    actualPhysicalInventory.push(...physicalEntries);
    actualArtifacts[component] = { root: component, digest: sha256Jcs(physicalEntries) };
  }
  actualInventory.sort((left, right) =>
    `${left.component}\0${left.path}`.localeCompare(`${right.component}\0${right.path}`));
  actualPhysicalInventory.sort((left, right) =>
    `${left.component}\0${left.path}`.localeCompare(`${right.component}\0${right.path}`));
  const actualSealedBundleDigest = sha256Jcs({
    schema: "homecook.local-mac-production-rehearsal-sealed-bundle.v1",
    artifacts: actualArtifacts,
  });
  const physicalUnsigned = {
    schema: physicalManifest.schema,
    artifacts: physicalManifest.artifacts,
    file_inventory: physicalManifest.file_inventory,
    bundle_content_digest: physicalManifest.bundle_content_digest,
  };
  if (
    !DIGEST_PATTERN.test(bundleManifestDigest ?? "")
    || rebuiltBundleManifest.bundle_manifest_digest !== bundleManifestDigest
    || manifest.bundle_manifest_digest !== bundleManifestDigest
    || manifest.sealed_bundle_digest !== bundleManifest.sealed_bundle_digest
    || canonicalizeJcs(actualArtifacts) !== canonicalizeJcs(bundleManifest.artifacts)
    || canonicalizeJcs(actualInventory) !== canonicalizeJcs(bundleManifest.file_inventory)
    || actualSealedBundleDigest !== manifest.sealed_bundle_digest
    || physicalManifest.schema !== "homecook.local-mac-production-rehearsal-sealed-bundle.v1"
    || physicalManifest.bundle_content_digest !== actualSealedBundleDigest
    || physicalManifest.physical_manifest_digest !== sha256Jcs(physicalUnsigned)
    || canonicalizeJcs(physicalManifest.artifacts) !== canonicalizeJcs(actualArtifacts)
    || canonicalizeJcs(physicalManifest.file_inventory) !== canonicalizeJcs(actualPhysicalInventory)
  ) fail("candidate bundle authority manifest digest is invalid");
  const candidateIdentityDigest = sha256Jcs({
    schema: "homecook.local-mac-production-rehearsal-candidate-identity.v1",
    bundle_manifest_digest: manifest.bundle_manifest_digest,
    sealed_bundle_digest: manifest.sealed_bundle_digest,
  });
  if (
    candidateIdentityDigest !== manifest.candidate_identity_digest
    || candidateIdentityAuthority.candidate_identity_digest !== candidateIdentityDigest
    || complete.candidate_identity_digest !== candidateIdentityDigest
    || complete.manifest_digest !== manifest.manifest_digest
  ) fail("candidate complete identity binding is invalid");
  return Object.freeze({ complete, manifest, bundle_manifest: bundleManifest });
}

function reserveRunRoot(path, currentUid) {
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      fail("candidate run create-only collision; reuse is forbidden");
    }
    throw error;
  }
  const stat = lstatSync(path, { bigint: true });
  if (stat.uid !== BigInt(currentUid) || modeBits(stat.mode) !== 0o700) fail("candidate run root is unsafe");
  return Object.freeze({ device: stat.dev, inode: stat.ino });
}

function assertRunRootIdentity(runRoot, attemptsRoot, identity, currentUid) {
  const realAttempts = realpathSync(attemptsRoot);
  const realRun = realpathSync(runRoot);
  if (realAttempts !== attemptsRoot || dirname(realRun) !== realAttempts || realRun !== runRoot) {
    fail("candidate run root containment drifted");
  }
  const stat = lstatSync(runRoot, { bigint: true });
  if (
    stat.isSymbolicLink() || !stat.isDirectory() || stat.uid !== BigInt(currentUid)
    || stat.dev !== identity.device || stat.ino !== identity.inode
  ) fail("candidate run root identity drifted");
}

function pathExists(path) {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function sealCandidateTree(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    for (const name of readdirSync(path)) sealCandidateTree(join(path, name));
    if (modeBits(stat.mode) !== 0o500) chmodSync(path, 0o500);
    return;
  }
  if (!stat.isFile()) fail("candidate root contains an unsupported entry while sealing");
  const sealedMode = (modeBits(stat.mode) & 0o111) === 0 ? 0o400 : 0o500;
  if (modeBits(stat.mode) !== sealedMode) chmodSync(path, sealedMode);
}

function makeCandidateRootWritable(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    chmodSync(path, 0o700);
    for (const name of readdirSync(path)) makeCandidateRootWritable(join(path, name));
  } else if (stat.isFile()) {
    chmodSync(path, 0o600);
  }
}

/**
 * @param {{
 *   releaseSha: string,
 *   namespaceRoot: string,
 *   adapters?: any,
 *   runId: string,
 *   currentUid?: number,
 * }} options
 * @returns {Promise<{candidate_root:string, manifest:any}>}
 */
export async function buildReleaseRehearsalCandidate({
  releaseSha,
  namespaceRoot,
  adapters = /** @type {any} */ (createReleaseRehearsalCandidateAdapters()),
  runId,
  currentUid = process.getuid?.(),
} = {}) {
  sha(releaseSha, "releaseSha");
  if (!isAbsolute(namespaceRoot ?? "")) fail("candidate namespace root must be absolute");
  if (!Number.isInteger(currentUid) || currentUid < 0) fail("current uid is unavailable");
  string(runId, "runId");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(runId)) {
    fail("runId must be a cryptorandom UUID v4");
  }
  const root = realpathSync(namespaceRoot);
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink() || rootStat.uid !== currentUid || modeBits(rootStat.mode) !== 0o700) {
    fail("candidate namespace root must be private and must not be a symlink");
  }
  const attemptsRoot = ensureNamespaceDirectory(join(root, "attempts"), currentUid, "candidate attempts root");
  const runRoot = join(attemptsRoot, runId);
  const runIdentity = reserveRunRoot(runRoot, currentUid);
  let productionPre = null;
  let productionGuard = null;
  let result;
  let failure = null;
  try {
    const toolchainLock = await adapters.readToolchainLock();
    digest(toolchainLock.toolchain_lock_digest, "toolchain lock digest");
    const toolchain = validateCandidateToolchain(await adapters.collectToolchain({
      phase: "pre",
      releaseSha,
      runRoot,
    }));
    const source = await adapters.prepareSource({ releaseSha, runRoot });
    const sourceEvidence = validateCandidateSourceEvidence(source.evidence);
    productionPre = await adapters.captureProductionSurface({ phase: "pre", releaseSha, runRoot });
    const ciPre = validateCandidateCiEvidence(await adapters.collectCiEvidence({ phase: "pre", releaseSha }));
    const environment = await adapters.readEnvironment({ releaseSha, runRoot });
    validateEnvironmentMetadata(environment.metadata);
    const imageEvidence = await adapters.collectImages({
      buildEnvironment: environment.values,
      releaseSha,
      runRoot,
    });
    exactObject(imageEvidence, "Compose image evidence", ["images", "compose_source_digest"]);
    const images = validateCandidateImages(imageEvidence.images);
    const composeSourceDigest = digest(imageEvidence.compose_source_digest, "Compose source digest");
    const migration = validateMigration(await adapters.collectMigration({ releaseSha, runRoot, source }));
    const buildId = `candidate-${releaseSha}`;
    const childEnv = Object.freeze({
      ...environment.values,
      HOMECOOK_RELEASE_BUILD_ID: buildId,
      HOMECOOK_RELEASE_SHA: releaseSha,
      HOMECOOK_RELEASE_TREE: sourceEvidence.release_tree,
      NODE_ENV: "production",
    });
    const build = await adapters.executeBuild({
      buildId, childEnv, releaseSha, releaseTree: sourceEvidence.release_tree, runRoot, source,
    });
    const sealedMigration = validateMigration(build.migration ?? migration);
    if (sealedMigration.ordered_migration_files_digest !== migration.ordered_migration_files_digest) {
      fail("sealed migration digest differs from exact Git input");
    }
    const ciPost = validateCandidateCiEvidence(await adapters.collectCiEvidence({ phase: "post", releaseSha }));
    const ci = validateStableCiSnapshots(ciPre, ciPost, releaseSha);
    const evidenceRoot = join(runRoot, "evidence");
    mkdirSync(evidenceRoot, { mode: 0o700 });
    writeFileSync(join(evidenceRoot, "ci-evidence.json"), canonicalizeJcs(ci.safe_projection), {
      flag: "wx",
      mode: 0o400,
    });
    const productionPost = await adapters.captureProductionSurface({ phase: "post", releaseSha, runRoot });
    productionGuard = validateProductionGuardSnapshots(productionPre, productionPost);
    validateCandidateToolchain(await adapters.collectToolchain({
      phase: "post",
      releaseSha,
      runRoot,
    }));
    const sealedBundleDigest = digest(
      build.bundle_content_digest ?? build.sealed_bundle_digest,
      "sealed_bundle_digest",
    );
    const sandboxPolicyDigest = digest(build.sandbox_policy_digest, "sandbox policy digest");
    exactObject(build.build_tools, "build tools", ["next_cli"]);
    validateToolIdentity(build.build_tools.next_cli, "build tools next_cli", {
      requireExecutable: false,
    });
    const bundleAuthorityManifest = buildBundleAuthorityManifest({
      repository: REPOSITORY,
      source_ref: SOURCE_REF,
      artifacts: build.artifacts,
      build_id: buildId,
      build_tools: build.build_tools,
      ci_check_summary_digest: ci.summary_digest,
      ci_snapshot_digest: ci.safe_projection_digest,
      ci_suite_run_set_digest: ci.suite_run_set_digest,
      environment_snapshot: environment.metadata,
      file_inventory: build.file_inventory,
      images,
      migration: sealedMigration,
      release_sha: releaseSha,
      release_tree: sourceEvidence.release_tree,
      sandbox_policy_digest: sandboxPolicyDigest,
      sealed_bundle_digest: sealedBundleDigest,
      source_snapshot_digest: sourceEvidence.source_snapshot_pre_digest,
      source_manifest_digest: sourceEvidence.source_snapshot_pre_digest,
      compose_source_digest: composeSourceDigest,
      toolchain,
      toolchain_lock_digest: toolchainLock.toolchain_lock_digest,
      production_guard: productionGuard,
    });
    const candidateIdentityDigest = sha256Jcs({
      schema: "homecook.local-mac-production-rehearsal-candidate-identity.v1",
      bundle_manifest_digest: bundleAuthorityManifest.bundle_manifest_digest,
      sealed_bundle_digest: sealedBundleDigest,
    });
    if (typeof adapters.finalizeBundleAddress === "function") {
      await adapters.finalizeBundleAddress({
        build,
        bundleAuthorityManifest,
        candidateIdentityDigest,
        runRoot,
      });
    }
    const manifest = buildCandidateManifest({
      schema: RELEASE_REHEARSAL_CANDIDATE_SCHEMA,
      canonicalization: CANONICALIZATION,
      repository: REPOSITORY,
      source_ref: SOURCE_REF,
      release_sha: releaseSha,
      release_tree: sourceEvidence.release_tree,
      ci_check_summary_digest: ci.summary_digest,
      ci_snapshot_digest: ci.safe_projection_digest,
      ci_suite_run_set_digest: ci.suite_run_set_digest,
      source_manifest_digest: sourceEvidence.source_snapshot_pre_digest,
      compose_source_digest: composeSourceDigest,
      sandbox_policy_digest: sandboxPolicyDigest,
      build_id: buildId,
      build_tools: build.build_tools,
      sealed_bundle_digest: sealedBundleDigest,
      bundle_manifest_digest: bundleAuthorityManifest.bundle_manifest_digest,
      candidate_identity_digest: candidateIdentityDigest,
      toolchain,
      toolchain_lock_digest: toolchainLock.toolchain_lock_digest,
      images,
      migration: sealedMigration,
      artifacts: build.artifacts,
      file_inventory: build.file_inventory,
      environment_snapshot: environment.metadata,
      production_guard: productionGuard,
    });
    assertRunRootIdentity(runRoot, attemptsRoot, runIdentity, currentUid);
    writeFileSync(join(runRoot, "candidate.json"), canonicalizeJcs(manifest), {
      flag: "wx", mode: 0o400,
    });
    sealCandidateTree(runRoot);
    chmodSync(runRoot, 0o700);
    assertRunRootIdentity(runRoot, attemptsRoot, runIdentity, currentUid);
    writeCandidateTerminalMarker(runRoot, "complete", {
      candidate_identity_digest: manifest.candidate_identity_digest,
      manifest_digest: manifest.manifest_digest,
    });
    chmodSync(runRoot, 0o500);
    result = { candidate_root: runRoot, manifest };
  } catch (error) {
    failure = error;
  }
  if (failure && productionPre) {
    try {
      const productionPost = await adapters.captureProductionSurface({ phase: "post_failure", releaseSha, runRoot });
      validateProductionGuardSnapshots(productionPre, productionPost);
    } catch (guardError) {
      failure = guardError;
    }
  }
  if (failure) {
    assertRunRootIdentity(runRoot, attemptsRoot, runIdentity, currentUid);
    makeCandidateRootWritable(runRoot);
    for (const name of readdirSync(runRoot)) {
      rmSync(join(runRoot, name), { force: false, recursive: true });
    }
    const pathDigest = sha256Jcs(runId);
    writeCandidateTerminalMarker(runRoot, "failed", {
      reason_code: "candidate_build_failed",
      path_digest: pathDigest,
    });
    chmodSync(runRoot, 0o500);
    throw new Error(`Release rehearsal candidate failed: candidate_build_failed path_digest=${pathDigest}`);
  }
  if (!result) fail("candidate result was not produced");
  return /** @type {{candidate_root:string, manifest:any}} */ (result);
}

function spawnBounded(command, args, {
  binary = false,
  cwd,
  env,
  timeout = 30_000,
  runCommand = spawnSync,
} = {}) {
  if (!isAbsolute(command) || !Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
    fail("child commands require an absolute executable and argv string array");
  }
  return runCommand(command, args, {
    cwd,
    encoding: binary ? null : "utf8",
    env,
    maxBuffer: 8 * 1024 * 1024,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
  });
}

function runBounded(command, args, options = {}) {
  const result = spawnBounded(command, args, options);
  if (result.error || result.signal || result.status !== 0) {
    fail(`${options.label ?? basename(command)} failed in the bounded clean environment`);
  }
  return String(result.stdout ?? "");
}

export function validateSandboxedBuildResult(result, label) {
  if (result?.error || result?.signal || result?.status !== 0) {
    fail(`${label} failed in the measured sandbox`);
  }
  if (!Array.isArray(result.observed_denials)) fail(`${label} lacks independent OS denial evidence`);
  if (result.observed_denials.length !== 0) {
    fail(`${label} contained an independently observed denied sandbox attempt`);
  }
  return Object.freeze({
    audit_digest: sha256Jcs({
      schema: "homecook.sandbox-denial-audit.v1",
      enforcement: "macos-unified-log-deny-all-window",
      denial_count: 0,
    }),
  });
}

/** @param {any} options */
export function runObservedSandboxCommand({
  sandboxPath, logPath, profile, command, args, cwd, env, label,
  timeout = 30_000, runCommand = spawnSync,
} = /** @type {any} */ ({})) {
  const child = spawnBounded(sandboxPath, ["-p", profile, command, ...args], {
    cwd, env, timeout, runCommand,
  });
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_500);
  const audit = spawnBounded(logPath, [
    "show", "--last", "30s",
    "--style", "json", "--predicate",
    'process == "kernel" AND eventMessage CONTAINS "Sandbox:"',
  ], { cwd, env: { HOME: env.HOME, PATH: "/usr/bin:/bin" }, timeout: 30_000, runCommand });
  if (audit.error || audit.signal || audit.status !== 0) fail(`${label} OS denial audit query failed closed`);
  let observedDenials;
  try {
    const events = JSON.parse(String(audit.stdout ?? "[]"));
    if (!Array.isArray(events)) fail(`${label} OS denial audit response is invalid`);
    observedDenials = events.map((event) => ({
      event_digest: sha256Bytes(Buffer.from(String(event.eventMessage ?? ""), "utf8")),
    }));
  } catch {
    fail(`${label} OS denial audit response is not valid JSON`);
  }
  return validateSandboxedBuildResult({ ...child, observed_denials: observedDenials }, label);
}

export function validateCandidateDockerReadOnlyArgs(args) {
  if (!Array.isArray(args)) fail("Docker read-only argv allowlist is required");
  const version = ["version", "--format", "{{json .}}"];
  if (canonicalizeJcs(args) === canonicalizeJcs(version)) return [...args];
  if (
    args.length === 5
    && args[0] === "image"
    && args[1] === "inspect"
    && /^([^\s@]+)@sha256:[0-9a-f]{64}$/u.test(args[2])
    && args[3] === "--format"
    && args[4] === "{{json .}}"
  ) return [...args];
  fail("Docker command is outside the candidate read-only digest inspect allowlist");
}

function runCandidateDockerReadOnly(dockerPath, args, options) {
  return runBounded(dockerPath, validateCandidateDockerReadOnlyArgs(args), options);
}

function resolveSafeRealExecutable(candidates, label) {
  for (const candidate of candidates.filter(Boolean)) {
    try {
      const path = realpathSync(candidate);
      const stat = lstatSync(path);
      accessSync(path, fsConstants.X_OK);
      if (
        !stat.isFile()
        || ![0, process.getuid?.()].includes(stat.uid)
        || (modeBits(stat.mode) & 0o111) === 0
        || (modeBits(stat.mode) & 0o022) !== 0
      ) continue;
      return path;
    } catch {
      // Continue only through this fixed candidate list.
    }
  }
  fail(`${label} trusted executable is unavailable`);
}

function snapshotToolFile(path, version, { requireExecutable = true } = {}) {
  const lexical = lstatSync(path, { bigint: true });
  if (lexical.isSymbolicLink()) fail(`trusted tool executable is a symlink: ${path}`);
  if (!lexical.isFile() || (Number(lexical.mode) & 0o022) !== 0) fail(`trusted tool mode is unsafe: ${path}`);
  if (requireExecutable && (Number(lexical.mode) & 0o111) === 0) fail(`trusted tool is not executable: ${path}`);
  const bytes = readFileSync(path);
  return {
    version: string(version, `tool version ${path}`),
    realpath: path,
    device: String(lexical.dev),
    inode: String(lexical.ino),
    mode: modeBits(lexical.mode),
    ctime: new Date(Number(lexical.ctimeMs)).toISOString(),
    size: String(lexical.size),
    sha256: sha256Bytes(bytes),
  };
}

export function snapshotTrustedPnpmArtifact(root, entrypoint, version) {
  const realRoot = realpathSync(root);
  if (realRoot !== root || isAbsolute(entrypoint) || entrypoint.split("/").includes("..")) {
    fail("pnpm artifact root or entrypoint is unsafe");
  }
  const currentUid = BigInt(process.getuid?.());
  const contentInventory = [];
  const identityInventory = [];
  let totalSize = 0n;
  const visit = (path, relativePath) => {
    const before = lstatSync(path, { bigint: true });
    if (before.isSymbolicLink() || ![0n, currentUid].includes(before.uid) || (before.mode & 0o022n) !== 0n) {
      fail(`pnpm artifact contains an unsafe entry: ${relativePath}`);
    }
    if (before.isDirectory()) {
      for (const name of readdirSync(path).sort()) visit(join(path, name), `${relativePath}${relativePath ? "/" : ""}${name}`);
      return;
    }
    if (!before.isFile() || before.nlink !== 1n) fail(`pnpm artifact entry type or hardlink is unsafe: ${relativePath}`);
    const bytes = readFileSync(path);
    const after = lstatSync(path, { bigint: true });
    for (const key of ["dev", "ino", "mode", "uid", "gid", "nlink", "size", "ctimeNs", "mtimeNs"]) {
      if (after[key] !== before[key]) fail(`pnpm artifact identity drifted during snapshot: ${relativePath}`);
    }
    totalSize += before.size;
    contentInventory.push({ path: relativePath, mode: modeBits(before.mode), size: String(before.size), sha256: sha256Bytes(bytes) });
    identityInventory.push({
      path: relativePath, device: String(before.dev), inode: String(before.ino), mode: modeBits(before.mode),
      uid: String(before.uid), gid: String(before.gid), nlink: String(before.nlink), size: String(before.size),
      ctime: String(before.ctimeNs), mtime: String(before.mtimeNs),
    });
  };
  visit(realRoot, "");
  const entrypointPath = join(realRoot, entrypoint);
  const entrypointStat = lstatSync(entrypointPath, { bigint: true });
  if (!entrypointStat.isFile() || entrypointStat.isSymbolicLink()) fail("pnpm artifact entrypoint is unsafe");
  return Object.freeze({
    version: string(version, "pnpm artifact version"),
    realpath: entrypointPath,
    device: String(entrypointStat.dev),
    inode: String(entrypointStat.ino),
    mode: modeBits(entrypointStat.mode),
    ctime: sha256Jcs(identityInventory),
    size: String(totalSize),
    sha256: sha256Jcs(contentInventory),
  });
}

export function validatePinnedPnpmArtifactIdentity(identity, lockEntry) {
  validateToolIdentity(identity, "pnpm");
  if (identity.version !== lockEntry.version || identity.sha256 !== lockEntry.artifact_tree_sha256) {
    fail("pnpm artifact identity does not match the repository-pinned artifact tree digest");
  }
  if (!identity.realpath.endsWith(`/${lockEntry.entrypoint}`)) fail("pnpm artifact entrypoint differs from the lock");
  return identity;
}

export function resolvePinnedPnpmArtifact(homeDir, lockEntry) {
  let root;
  try {
    root = realpathSync(join(homeDir, ".cache", "node", "corepack", "v1", "pnpm", lockEntry.version));
  } catch {
    fail("offline pnpm artifact is missing from the approved local artifact root");
  }
  const identity = snapshotTrustedPnpmArtifact(root, lockEntry.entrypoint, lockEntry.version);
  validatePinnedPnpmArtifactIdentity(identity, lockEntry);
  return Object.freeze({ root, entrypoint: identity.realpath, identity });
}

function findExactSupabaseCli(root, version = "2.110.0") {
  const marker = `@supabase+cli-darwin-arm64@${version}`;
  let visited = 0;
  const visit = (directory, depth) => {
    if (depth > 10 || visited > 60_000) return null;
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      visited += 1;
      const target = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isFile() && entry.name === "supabase" && target.includes(marker)) {
        return resolveSafeRealExecutable([target], `Supabase CLI ${version}`);
      }
      if (entry.isDirectory()) {
        const found = visit(target, depth + 1);
        if (found) return found;
      }
    }
    return null;
  };
  const result = visit(root, 0);
  if (!result) fail(`offline package store is missing pinned Supabase CLI ${version}`);
  return result;
}

function exactToolPaths({ homeDir, toolchainLock }) {
  const nodePath = realpathSync(resolveTrustedNodeExecutable());
  const gitPath = realpathSync(resolveTrustedGitExecutable());
  const ghPath = realpathSync(resolveTrustedGhExecutable());
  const pnpmArtifact = resolvePinnedPnpmArtifact(homeDir, toolchainLock.pnpm);
  const pnpmArtifactRoot = pnpmArtifact.root;
  const pnpmCliPath = pnpmArtifact.entrypoint;
  const dockerPath = resolveSafeRealExecutable([
    "/Applications/Docker.app/Contents/Resources/bin/docker",
    "/usr/local/bin/docker",
    "/opt/homebrew/bin/docker",
  ], "Docker client");
  const sandboxPath = resolveSafeRealExecutable(["/usr/bin/sandbox-exec"], "macOS network sandbox");
  const launchctlPath = resolveSafeRealExecutable(["/bin/launchctl"], "launchctl");
  const lsofPath = resolveSafeRealExecutable(["/usr/sbin/lsof"], "lsof");
  const auditLogPath = resolveSafeRealExecutable(["/usr/bin/log"], "macOS unified log reader");
  const supabasePath = findExactSupabaseCli(
    join(homeDir, "Library", "Caches", "pnpm", "dlx"),
    toolchainLock.supabase_cli.version,
  );
  return {
    auditLogPath, dockerPath, ghPath, gitPath, launchctlPath, lsofPath, nodePath, pnpmArtifactRoot, pnpmCliPath,
    sandboxPath, supabasePath,
  };
}

function gitEnvironment(homeDir) {
  return Object.freeze({
    GIT_ATTR_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    HOME: homeDir,
    PATH: "/usr/bin:/bin",
  });
}

function parseGhPages(text, field = null) {
  let pages;
  try {
    pages = JSON.parse(text);
  } catch {
    fail("trusted GitHub evidence adapter returned invalid JSON");
  }
  if (!Array.isArray(pages)) fail("trusted GitHub evidence pages must be an array");
  return pages.flatMap((page) => {
    const value = field ? page?.[field] : page;
    if (!Array.isArray(value)) fail("trusted GitHub evidence page shape is invalid");
    return value;
  });
}

export function validateStableCiSnapshots(pre, post, releaseSha) {
  validateCandidateCiEvidence(pre);
  validateCandidateCiEvidence(post);
  for (const [label, value] of [["pre", pre], ["post", post]]) {
    if (value.remote_master_sha !== releaseSha) fail(`CI ${label} remote master SHA drifted`);
    digest(value.safe_projection_digest, `CI ${label} safe projection digest`);
    digest(value.suite_run_set_digest, `CI ${label} suite/run set digest`);
    if (!value.safe_projection || value.safe_projection.head_sha !== releaseSha) {
      fail(`CI ${label} safe projection head SHA is invalid`);
    }
    for (const check of value.safe_projection.check_runs ?? []) {
      if (
        check.head_sha !== releaseSha
        || !Number.isSafeInteger(check.id)
        || check.id <= 0
        || !Number.isSafeInteger(check.check_suite_id)
        || check.check_suite_id <= 0
        || !Number.isSafeInteger(check.app_id)
        || check.app_id <= 0
      ) fail(`CI ${label} check head, suite, run, or integration identity is invalid`);
    }
    for (const status of value.safe_projection.commit_statuses ?? []) {
      if (status.sha !== releaseSha || !Number.isSafeInteger(status.id) || status.id <= 0) {
        fail(`CI ${label} commit status SHA or identity is invalid`);
      }
    }
  }
  if (
    pre.summary_digest !== post.summary_digest
    || pre.safe_projection_digest !== post.safe_projection_digest
    || pre.suite_run_set_digest !== post.suite_run_set_digest
  ) fail("CI pre/post projection, suite, or run set drifted");
  return Object.freeze(pre);
}

export function parseCanonicalComposeImageInventory(source) {
  if (typeof source !== "string" || source.length === 0) fail("Compose source is required");
  for (const character of source) {
    const codePoint = character.codePointAt(0);
    const unicodeWhitespace = /\p{White_Space}/u.test(character)
      && character !== " " && character !== "\n" && character !== "\r";
    const forbiddenControl = codePoint <= 0x08
      || (codePoint >= 0x0b && codePoint <= 0x0c)
      || (codePoint >= 0x0e && codePoint <= 0x1f)
      || (codePoint >= 0x7f && codePoint <= 0x9f);
    const noncharacter = (codePoint >= 0xfdd0 && codePoint <= 0xfdef)
      || (codePoint & 0xffff) === 0xfffe || (codePoint & 0xffff) === 0xffff;
    if (codePoint === 0xfeff || unicodeWhitespace || forbiddenControl || noncharacter) {
      fail("Compose raw lexical input contains forbidden whitespace, control, BOM, or noncharacter bytes");
    }
  }
  const lines = source.split(/\r?\n/u);
  if (source.includes("\t")) fail("Compose tabs are unsupported for complete service inventory");
  const parseMapping = (line, indent, label) => {
    const prefix = " ".repeat(indent);
    if (!line.startsWith(prefix) || line[indent] === " ") fail(`Compose ${label} indentation is invalid`);
    const match = /^([A-Za-z0-9_.\/-]+):(.*)$/u.exec(line.slice(indent));
    if (!match) fail(`Compose ${label} mapping key is outside the closed plain grammar`);
    const tail = match[2];
    if (tail === "") return { key: match[1], value: null };
    if (!tail.startsWith(" ")) fail(`Compose ${label} non-empty value requires ASCII space after colon`);
    const value = tail.replace(/^ +/u, "");
    if (value === "") fail(`Compose ${label} value cannot be whitespace-only`);
    return { key: match[1], value };
  };
  const parseListItem = (line, indent, label) => {
    const prefix = `${" ".repeat(indent)}- `;
    if (!line.startsWith(prefix) || line.slice(prefix.length) === "") {
      fail(`Compose ${label} list item is outside the closed grammar`);
    }
    return line.slice(prefix.length);
  };
  const validatePlainScalar = (value, label, { approvedAlias = null } = {}) => {
    if (typeof value !== "string" || value === "" || value.trim() !== value) {
      fail(`Compose ${label} scalar is empty or padded`);
    }
    if (approvedAlias && value === approvedAlias) return value;
    if (value.startsWith('"')) {
      let parsed;
      try { parsed = JSON.parse(value); } catch { fail(`Compose ${label} quoted scalar is malformed`); }
      if (typeof parsed !== "string" || JSON.stringify(parsed) !== value) {
        fail(`Compose ${label} quoted scalar is outside the exact JSON-string grammar`);
      }
      return value;
    }
    if (/^[!&*?\[\]{}>|'"\\]/u.test(value)) fail(`Compose ${label} scalar starts with a forbidden YAML token`);
    const withoutTemplates = value.replace(/\$\{[A-Z][A-Z0-9_]*(?::[-+?][^}\r\n]*)?\}/gu, "");
    if (/[\[\]{}'"\\]/u.test(withoutTemplates) || /(?:^|\s)[!&*?]\S*/u.test(withoutTemplates)) {
      fail(`Compose ${label} scalar contains unsupported flow, quote, tag, alias, anchor, or explicit-key syntax`);
    }
    return value;
  };
  const parseInlineStringSequence = (value, label) => {
    let parsed;
    try { parsed = JSON.parse(value); } catch { fail(`Compose ${label} inline sequence is malformed`); }
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((entry) => typeof entry !== "string")) {
      fail(`Compose ${label} inline sequence must contain only strings`);
    }
    if (parsed.some((entry) => entry.length === 0)) fail(`Compose ${label} inline sequence contains an empty string`);
    const canonical = JSON.stringify(parsed);
    if (canonical !== value) fail(`Compose ${label} inline sequence is not in the exact canonical form`);
    return parsed;
  };
  const topLevelAllowed = new Set([
    "name", "version", "x-restore-attempt-labels", "services", "networks", "secrets", "volumes",
  ]);
  const serviceFieldAllowed = new Set([
    "labels", "image", "platform", "entrypoint", "command", "depends_on", "environment",
    "healthcheck", "networks", "ports", "read_only", "restart", "security_opt", "secrets",
    "tmpfs", "volumes", "build",
  ]);
  const listServiceFields = new Set(["networks", "ports", "security_opt", "secrets", "tmpfs", "volumes"]);
  const scalarServiceFields = new Set(["read_only", "restart"]);
  const extensionKeys = new Set([
    "homecook.local/restore-attempt", "homecook.release.sha", "homecook.release.tree",
    "homecook.release.build-id", "homecook.release.promotion-id",
  ]);
  const canonicalNetworkNames = new Set(["auth-edge", "auth-egress", "data-internal"]);
  const canonicalVolumeNames = new Set(["postgres-data", "storage-data"]);
  const topLevelKeys = new Set();
  const services = [];
  const serviceNames = new Set();
  let section = null;
  let current = null;
  let currentKeys = new Set();
  let nestedBlock = null;
  let nestedKeys = new Set();
  let nestedItem = null;
  const sectionItems = new Map();
  const finishService = () => {
    if (!current) return;
    services.push(current);
    current = null;
    currentKeys = new Set();
    nestedBlock = null;
    nestedKeys = new Set();
    nestedItem = null;
  };
  for (const line of lines) {
    if (line.trim() === "" || /^\s*#/u.test(line)) continue;
    const indent = /^ */u.exec(line)[0].length;
    if (indent === 0) {
      if (section === "services") finishService();
      const { key, value } = parseMapping(line, 0, "top-level");
      if (!topLevelAllowed.has(key)) fail(`Compose unknown top-level key: ${key}`);
      if (topLevelKeys.has(key)) fail(`Compose duplicate top-level key: ${key}`);
      if (key === "x-restore-attempt-labels" && (!topLevelKeys.has("name") || topLevelKeys.has("services"))) {
        fail("Compose restore extension is outside its exact pre-services position");
      }
      if (key === "services" && (section !== "x-restore-attempt-labels" || nestedKeys.size !== extensionKeys.size)) {
        fail("Compose services section must immediately follow the complete restore extension block");
      }
      topLevelKeys.add(key);
      if (["services", "networks", "secrets", "volumes"].includes(key) && value !== null) {
        fail(`Compose top-level ${key} must use a nested block`);
      }
      if (["name", "version"].includes(key) && value === null) fail(`Compose top-level ${key} requires a value`);
      if (["name", "version"].includes(key)) validatePlainScalar(value, `top-level ${key}`);
      if (key === "x-restore-attempt-labels" && value !== "&restore-attempt-labels") {
        fail("Compose known extension anchor is invalid");
      }
      section = key;
      nestedBlock = null;
      nestedKeys = new Set();
      nestedItem = null;
      continue;
    }
    if (!section) fail("Compose nested content appears before a top-level key");
    if (section === "x-restore-attempt-labels") {
      if (indent !== 2) fail("Compose known extension indentation is invalid");
      const { key, value } = parseMapping(line, 2, "known extension");
      if (!extensionKeys.has(key) || value === null || nestedKeys.has(key)) {
        fail("Compose known extension mapping is unknown, empty, or duplicated");
      }
      validatePlainScalar(value, `known extension ${key}`);
      nestedKeys.add(key);
      continue;
    }
    if (section === "services") {
      if (indent === 2) {
        finishService();
        const { key, value } = parseMapping(line, 2, "service");
        if (value !== null || !/^[A-Za-z0-9_-]+$/u.test(key)) fail("Compose service must be a plain nested mapping");
        if (serviceNames.has(key)) fail(`Compose duplicate service key: ${key}`);
        serviceNames.add(key);
        current = { service: key, image: null, platform: null, build: false };
        continue;
      }
      if (!current) fail("Compose service body appears before a service key");
      if (indent === 4) {
        const { key, value } = parseMapping(line, 4, `service ${current.service}`);
        if (!serviceFieldAllowed.has(key)) fail(`Compose unknown service key: ${key}`);
        if (currentKeys.has(key)) fail(`Compose service ${current.service} has duplicate normalized key: ${key}`);
        currentKeys.add(key);
        nestedBlock = null;
        nestedKeys = new Set();
        nestedItem = null;
        if (["image", "platform"].includes(key)) {
          if (value === null) fail(`Compose service ${current.service} ${key} requires a value`);
          validatePlainScalar(value, `service ${current.service} ${key}`);
          if (key === "image") current.image = value;
          if (key === "platform") current.platform = value;
          continue;
        }
        if (key === "build") {
          current.build = true;
          continue;
        }
        if (key === "labels") {
          if (value !== "*restore-attempt-labels") fail("Compose service labels alias is not the approved metadata alias");
          validatePlainScalar(value, "service labels", { approvedAlias: "*restore-attempt-labels" });
          continue;
        }
        if (["entrypoint", "command"].includes(key)) {
          if (value === null) fail(`Compose service ${key} must use the supported inline sequence`);
          parseInlineStringSequence(value, `service ${key}`);
          continue;
        }
        if (scalarServiceFields.has(key)) {
          if (value === null) fail(`Compose service ${key} requires a scalar value`);
          validatePlainScalar(value, `service ${key}`);
          continue;
        }
        if (value !== null) fail(`Compose service ${key} must use its supported nested block`);
        nestedBlock = key;
        continue;
      }
      if (indent === 6) {
        if (!nestedBlock) fail("Compose nested service line has no owning block");
        if (listServiceFields.has(nestedBlock)) {
          validatePlainScalar(parseListItem(line, 6, `${nestedBlock}`), `${nestedBlock} list item`);
          continue;
        }
        const { key, value } = parseMapping(line, 6, `${nestedBlock}`);
        if (nestedKeys.has(key)) fail(`Compose duplicate nested ${nestedBlock} key: ${key}`);
        nestedKeys.add(key);
        if (nestedBlock === "environment") {
          if (!/^[A-Z][A-Z0-9_]*$/u.test(key) || value === null) fail("Compose environment entry is outside the supported grammar");
          validatePlainScalar(value, `environment ${key}`);
          continue;
        }
        if (nestedBlock === "healthcheck") {
          if (!["test", "interval", "timeout", "retries", "start_period"].includes(key)) fail("Compose healthcheck key is unsupported");
          if (key === "test" && value === null) {
            nestedItem = "healthcheck-test";
          } else if (value === null) fail(`Compose healthcheck ${key} requires a value`);
          else if (key === "test") parseInlineStringSequence(value, "healthcheck test");
          else validatePlainScalar(value, `healthcheck ${key}`);
          continue;
        }
        if (nestedBlock === "depends_on") {
          if (!/^[A-Za-z0-9_-]+$/u.test(key) || value !== null) fail("Compose depends_on service entry is unsupported");
          nestedItem = key;
          continue;
        }
        fail(`Compose nested block is unsupported: ${nestedBlock}`);
      }
      if (indent === 8) {
        if (nestedBlock === "healthcheck" && nestedItem === "healthcheck-test") {
          validatePlainScalar(parseListItem(line, 8, "healthcheck test"), "healthcheck test list item");
          continue;
        }
        if (nestedBlock === "depends_on" && nestedItem) {
          const { key, value } = parseMapping(line, 8, "depends_on condition");
          if (key !== "condition" || value === null) fail("Compose depends_on condition is unsupported");
          validatePlainScalar(value, "depends_on condition");
          nestedItem = null;
          continue;
        }
        fail("Compose service nested indentation is unsupported");
      }
      fail("Compose service indentation is outside the closed grammar");
    }
    if (["networks", "secrets", "volumes"].includes(section)) {
      const items = sectionItems.get(section) ?? new Set();
      sectionItems.set(section, items);
      if (indent === 2) {
        const { key, value } = parseMapping(line, 2, `${section} item`);
        if (items.has(key)) fail(`Compose duplicate ${section} item: ${key}`);
        if (section === "networks" && !canonicalNetworkNames.has(key)) fail(`Compose unknown canonical network: ${key}`);
        if (section === "volumes" && !canonicalVolumeNames.has(key)) fail(`Compose unknown canonical volume: ${key}`);
        items.add(key);
        if (section === "networks" && ![null, "{}"].includes(value)) fail("Compose network item value is unsupported");
        if (section !== "networks" && value !== null) fail(`Compose ${section} item must use a nested block`);
        nestedItem = key;
        nestedKeys = new Set();
        continue;
      }
      if (indent === 4 && nestedItem) {
        const { key, value } = parseMapping(line, 4, `${section} metadata`);
        if (nestedKeys.has(key)) fail(`Compose duplicate ${section} metadata key: ${key}`);
        nestedKeys.add(key);
        if (section === "networks" && key === "internal" && value === "true") continue;
        if (section === "secrets" && key === "file" && value !== null) {
          validatePlainScalar(value, "secret file");
          continue;
        }
        if (section === "volumes" && key === "name" && value !== null) {
          validatePlainScalar(value, "volume name");
          continue;
        }
        if (section === "volumes" && key === "labels" && value === "*restore-attempt-labels") {
          validatePlainScalar(value, "volume labels", { approvedAlias: "*restore-attempt-labels" });
          continue;
        }
        fail(`Compose ${section} metadata is unsupported`);
      }
      fail(`Compose ${section} indentation is unsupported`);
    }
    fail(`Compose top-level ${section} does not allow nested content`);
  }
  if (section === "services") finishService();
  if (!topLevelKeys.has("services")) fail("Compose services section is missing");
  if (services.length === 0) fail("Compose service inventory is empty");
  return services.map((service) => {
    if (service.build) fail(`Compose service ${service.service} uses forbidden build authority`);
    const match = /^([^\s@]+)@(sha256:[0-9a-f]{64})$/u.exec(service.image ?? "");
    if (!match) fail(`Compose service ${service.service} image is missing or not exact digest-pinned`);
    if (!service.platform) fail(`Compose service ${service.service} platform is missing`);
    return {
      service: service.service,
      reference: service.image,
      digest: match[2],
      platform_expression: service.platform,
    };
  });
}

export function validateCanonicalComposeAuthority(source, lock) {
  const bytes = Buffer.isBuffer(source) ? source : Buffer.from(source, "utf8");
  const actualDigest = sha256Bytes(bytes);
  digest(lock?.full_local_compose_sha256, "full-local Compose pinned source digest");
  if (actualDigest !== lock.full_local_compose_sha256) {
    fail("full-local Compose source bytes differ from the repository authority lock");
  }
  return parseCanonicalComposeImageInventory(decodeFatalUtf8(bytes, "full-local Compose source"));
}

export function loadRehearsalToolchainLock(path) {
  const absolutePath = resolve(path);
  const pre = lstatSync(absolutePath, { bigint: true });
  if (
    pre.isSymbolicLink()
    || !pre.isFile()
    || pre.nlink !== 1n
    || (pre.mode & 0o022n) !== 0n
    || pre.size > 1024n * 1024n
    || realpathSync(dirname(absolutePath)) !== dirname(absolutePath)
  ) fail("rehearsal toolchain lock path, type, mode, or size is unsafe");
  let fd;
  let bytes;
  try {
    fd = openSync(absolutePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const opened = fstatSync(fd, { bigint: true });
    if (
      opened.dev !== pre.dev || opened.ino !== pre.ino || opened.mode !== pre.mode
      || opened.size !== pre.size || opened.ctimeNs !== pre.ctimeNs || opened.mtimeNs !== pre.mtimeNs
    ) fail("rehearsal toolchain lock identity drifted before read");
    bytes = readFileSync(fd);
    const post = fstatSync(fd, { bigint: true });
    if (
      post.dev !== opened.dev || post.ino !== opened.ino || post.mode !== opened.mode
      || post.size !== opened.size || post.ctimeNs !== opened.ctimeNs || post.mtimeNs !== opened.mtimeNs
    ) fail("rehearsal toolchain lock identity drifted during read");
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  const parsed = parseCanonicalJcs(decodeFatalUtf8(bytes, "rehearsal toolchain lock"));
  exactObject(parsed, "rehearsal toolchain lock", [
    "schema", "platform", "node", "pnpm", "supabase_cli", "full_local_images",
    "full_local_compose_sha256",
  ]);
  if (parsed.schema !== "homecook.local-mac-production-rehearsal-toolchain-lock.v1") {
    fail("rehearsal toolchain lock schema is invalid");
  }
  if (parsed.platform !== "darwin-arm64") fail("rehearsal toolchain lock platform is invalid");
  digest(parsed.full_local_compose_sha256, "full-local Compose source digest");
  exactObject(parsed.node, "rehearsal toolchain lock node", ["version", "binary_sha256"]);
  string(parsed.node.version, "node pinned version");
  digest(parsed.node.binary_sha256, "node pinned binary digest");
  exactObject(parsed.pnpm, "rehearsal toolchain lock pnpm", [
    "version", "entrypoint", "artifact_tree_sha256",
  ]);
  string(parsed.pnpm.version, "pnpm pinned version");
  if (isAbsolute(parsed.pnpm.entrypoint) || parsed.pnpm.entrypoint.split("/").includes("..")) {
    fail("pnpm pinned entrypoint is unsafe");
  }
  digest(parsed.pnpm.artifact_tree_sha256, "pnpm pinned artifact tree digest");
  exactObject(parsed.supabase_cli, "rehearsal toolchain lock supabase_cli", [
    "package", "version", "npm_integrity", "binary_sha256",
  ]);
  if (parsed.supabase_cli.package !== "@supabase/cli-darwin-arm64") fail("Supabase CLI package authority is invalid");
  if (parsed.supabase_cli.version !== "2.110.0") fail("Supabase CLI lock version is invalid");
  if (!/^sha512-[A-Za-z0-9+/]+=*$/u.test(parsed.supabase_cli.npm_integrity)) {
    fail("Supabase CLI npm integrity is invalid");
  }
  digest(parsed.supabase_cli.binary_sha256, "Supabase CLI pinned binary digest");
  if (!Array.isArray(parsed.full_local_images) || parsed.full_local_images.length === 0) {
    fail("rehearsal toolchain lock image inventory is empty");
  }
  const services = new Set();
  for (const entry of parsed.full_local_images) {
    exactObject(entry, "rehearsal image lock entry", [
      "service", "reference", "digest", "platform_expression",
    ]);
    string(entry.service, "rehearsal image service");
    if (services.has(entry.service)) fail("rehearsal image service is duplicated");
    services.add(entry.service);
    if (!/^([^\s@]+)@(sha256:[0-9a-f]{64})$/u.test(entry.reference)) {
      fail("rehearsal image reference is not digest-pinned");
    }
    if (!IMAGE_DIGEST_PATTERN.test(entry.digest) || !entry.reference.endsWith(`@${entry.digest}`)) {
      fail("rehearsal image digest authority is inconsistent");
    }
    string(entry.platform_expression, "rehearsal image platform expression");
  }
  return Object.freeze({ ...parsed, toolchain_lock_digest: sha256Bytes(bytes) });
}

export function validatePinnedSupabaseCliIdentity(identity, lock) {
  validateToolIdentity(identity, "supabase_cli");
  if (
    identity.version !== lock.supabase_cli.version
    || identity.sha256 !== lock.supabase_cli.binary_sha256
  ) fail("Supabase CLI identity does not match repository-pinned version and binary digest");
  return identity;
}

function validatePinnedBuildToolIdentity(identity, lockEntry, label) {
  validateToolIdentity(identity, label);
  if (identity.version !== lockEntry.version || identity.sha256 !== lockEntry.binary_sha256) {
    fail(`${label} identity does not match repository-pinned version and binary digest`);
  }
  return identity;
}

function safeCheckProjection(entry) {
  return {
    id: Number(entry.id),
    app_id: Number(entry.app?.id),
    check_suite_id: Number(entry.check_suite?.id),
    head_sha: entry.head_sha,
    completed_at: entry.completed_at ?? null,
    conclusion: entry.conclusion ?? null,
    name: entry.name,
    started_at: entry.started_at ?? null,
    status: entry.status,
  };
}

function safeStatusProjection(entry) {
  return {
    id: Number(entry.id),
    sha: entry.sha,
    context: entry.context,
    created_at: entry.created_at ?? null,
    state: entry.state,
    updated_at: entry.updated_at ?? null,
  };
}

function ensureCandidateNamespace({ homeDir, namespaceRoot }) {
  const realHome = realpathSync(homeDir);
  const currentUid = process.getuid?.();
  const homecookRoot = join(realHome, ".homecook");
  for (const [path, label] of [[homecookRoot, "Homecook state"], [namespaceRoot, "rehearsal namespace"]]) {
    try {
      mkdirSync(path, { mode: 0o700 });
    } catch (error) {
      if (!(error && typeof error === "object" && error.code === "EEXIST")) throw error;
    }
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isDirectory() || stat.uid !== currentUid || modeBits(stat.mode) !== 0o700) {
      fail(`${label} root must be current-user owned mode 0700 without symlinks`);
    }
  }
}

function collectMigrationFromSource(source) {
  const inventory = source.source_manifest.entries
    .filter((entry) => entry.path.startsWith("supabase/migrations/") && entry.path.endsWith(".sql"))
    .map((entry) => ({ path: entry.path, sha256: entry.sha256 }))
    .sort((left, right) => left.path.localeCompare(right.path));
  if (inventory.length === 0) fail("migration inventory is empty");
  return {
    ordered_migration_files: inventory.map((entry) => entry.path),
    ordered_migration_files_digest: sha256Jcs(inventory),
    migration_head: basename(inventory.at(-1).path).replace(/\.sql$/u, ""),
  };
}

export function createReleaseRehearsalCandidateAdapters({
  rootDir = process.cwd(),
  homeDir = process.env.HOME ?? "",
  namespaceRoot = resolve(homeDir, ".homecook", "rehearsal"),
  environmentSourcePath = join(namespaceRoot, "build-env.json"),
  packageStorePath = join(homeDir, "Library", "pnpm", "store", "v10"),
  approvedMigrationMarkerPath = join(namespaceRoot, "approved-production-migration-marker.json"),
  toolchainLockPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "config",
    "local-mac-production-rehearsal-toolchain-lock.json",
  ),
} = {}, dependencies = {}) {
  const runCommand = dependencies.runCommand ?? spawnSync;
  const sourceRoot = realpathSync(rootDir);
  const normalizedHome = realpathSync(homeDir);
  const normalizedNamespace = resolve(namespaceRoot);
  const namespaceFromRepository = relative(sourceRoot, normalizedNamespace);
  if (
    namespaceFromRepository === ""
    || (!namespaceFromRepository.startsWith("..") && !isAbsolute(namespaceFromRepository))
  ) {
    fail("candidate namespace must be outside the repository");
  }
  ensureCandidateNamespace({ homeDir: normalizedHome, namespaceRoot: normalizedNamespace });
  let currentSource = null;
  let initialToolchain = null;
  let cachedToolPaths = null;
  let cachedToolchainLock = null;

  const readToolchainLock = () => {
    cachedToolchainLock ??= loadRehearsalToolchainLock(toolchainLockPath);
    return cachedToolchainLock;
  };

  const resolveTools = () => {
    cachedToolPaths ??= exactToolPaths({
      homeDir: normalizedHome,
      toolchainLock: readToolchainLock(),
    });
    return cachedToolPaths;
  };

  const collectToolchain = async () => {
    const tools = resolveTools();
    const toolchainLock = readToolchainLock();
    if (`${process.platform}-${process.arch}` !== toolchainLock.platform) {
      fail("current platform does not match the rehearsal toolchain lock");
    }
    const builderPath = realpathSync(fileURLToPath(import.meta.url));
    const preUse = {
      node: snapshotToolFile(tools.nodePath, "pre-use"),
      pnpm: snapshotTrustedPnpmArtifact(
        tools.pnpmArtifactRoot, toolchainLock.pnpm.entrypoint, toolchainLock.pnpm.version,
      ),
      supabase_cli: snapshotToolFile(tools.supabasePath, "pre-use"),
      git: snapshotToolFile(tools.gitPath, "pre-use"),
      gh: snapshotToolFile(tools.ghPath, "pre-use"),
      docker_client: snapshotToolFile(tools.dockerPath, "pre-use"),
      docker_daemon: snapshotToolFile(tools.dockerPath, "pre-use"),
      launchctl: snapshotToolFile(tools.launchctlPath, "pre-use"),
      lsof: snapshotToolFile(tools.lsofPath, "pre-use"),
      audit_log: snapshotToolFile(tools.auditLogPath, "pre-use"),
      sandbox_exec: snapshotToolFile(tools.sandboxPath, "pre-use"),
      candidate_builder: snapshotToolFile(builderPath, "pre-use", { requireExecutable: false }),
    };
    const cleanEnv = gitEnvironment(normalizedHome);
    const nodeVersion = runBounded(tools.nodePath, ["--version"], { env: cleanEnv, runCommand }).trim();
    const pnpmVersion = runBounded(tools.nodePath, [tools.pnpmCliPath, "--version"], { env: cleanEnv, runCommand }).trim();
    const supabaseVersion = runBounded(tools.supabasePath, ["--version"], { env: cleanEnv, runCommand }).trim();
    if (supabaseVersion !== "2.110.0") fail("Supabase CLI version drifted from pinned 2.110.0");
    const gitVersion = runBounded(tools.gitPath, ["--version"], { env: cleanEnv, runCommand }).trim();
    const dockerVersionText = runCandidateDockerReadOnly(
      tools.dockerPath,
      ["version", "--format", "{{json .}}"],
      { env: cleanEnv, label: "Docker client/daemon identity", runCommand },
    );
    let dockerVersion;
    try { dockerVersion = JSON.parse(dockerVersionText); } catch { fail("Docker version identity is invalid"); }
    const result = {
      node: snapshotToolFile(tools.nodePath, nodeVersion),
      pnpm: snapshotTrustedPnpmArtifact(
        tools.pnpmArtifactRoot, toolchainLock.pnpm.entrypoint, pnpmVersion,
      ),
      supabase_cli: snapshotToolFile(tools.supabasePath, supabaseVersion),
      git: snapshotToolFile(tools.gitPath, gitVersion),
      gh: snapshotToolFile(tools.ghPath, runBounded(tools.ghPath, ["--version"], {
        env: cleanEnv, runCommand,
      }).split(/\r?\n/u)[0].trim()),
      docker_client: snapshotToolFile(tools.dockerPath, `Docker client ${dockerVersion.Client?.Version ?? "unknown"}`),
      docker_daemon: snapshotToolFile(tools.dockerPath, `Docker daemon ${dockerVersion.Server?.Version ?? "unknown"}/${dockerVersion.Server?.ID ?? "unknown"}`),
      launchctl: snapshotToolFile(tools.launchctlPath, "macOS launchctl"),
      lsof: snapshotToolFile(tools.lsofPath, "macOS lsof"),
      audit_log: snapshotToolFile(tools.auditLogPath, "macOS unified log reader"),
      sandbox_exec: snapshotToolFile(tools.sandboxPath, "macOS sandbox-exec"),
      candidate_builder: snapshotToolFile(builderPath, "homecook-release-rehearsal-candidate-v1", { requireExecutable: false }),
    };
    for (const key of TOOLCHAIN_KEYS) {
      const before = { ...preUse[key] };
      const after = { ...result[key] };
      delete before.version;
      delete after.version;
      if (canonicalizeJcs(before) !== canonicalizeJcs(after)) {
        fail(`trusted tool ${key} drifted during first-use identity probing`);
      }
    }
    validatePinnedBuildToolIdentity(result.node, toolchainLock.node, "node");
    validatePinnedPnpmArtifactIdentity(result.pnpm, toolchainLock.pnpm);
    validatePinnedSupabaseCliIdentity(result.supabase_cli, toolchainLock);
    validateCandidateToolchain(result);
    if (initialToolchain && canonicalizeJcs(initialToolchain) !== canonicalizeJcs(result)) {
      fail("trusted tool identity drifted during candidate build");
    }
    initialToolchain ??= result;
    return result;
  };

  return Object.freeze({
    async readToolchainLock() {
      return readToolchainLock();
    },

    async captureProductionSurface() {
      if (!initialToolchain) fail("candidate tools must be snapshotted before production inventory");
      const tools = resolveTools();
      const inventoryAdapters = createLocalProductionInventoryAdapters({
        homeDir: normalizedHome,
        rootDir: sourceRoot,
        approvedMigrationMarkerPath,
        commandRunner: runCommand,
        dockerBin: tools.dockerPath,
        trustedToolPaths: {
          docker: tools.dockerPath,
          git: tools.gitPath,
          launchctl: tools.launchctlPath,
          lsof: tools.lsofPath,
        },
      });
      const inventory = await collectReadOnlyProductionInventory({
        adapters: inventoryAdapters,
        approvedMigrationMarker: pathExists(approvedMigrationMarkerPath),
        probeIdentity: initialToolchain.candidate_builder,
      });
      return createProductionSurfaceSnapshot(inventory);
    },

    async prepareSource({ releaseSha, runRoot }) {
      const { gitPath } = resolveTools();
      const env = gitEnvironment(normalizedHome);
      runBounded(gitPath, ["-C", sourceRoot, "fetch", "--no-tags", "origin", "master"], {
        env, label: "fetch origin/master", runCommand, timeout: 120_000,
      });
      const originMasterSha = runBounded(gitPath, ["-C", sourceRoot, "rev-parse", "origin/master"], {
        env, label: "origin/master SHA", runCommand,
      }).trim();
      if (originMasterSha !== releaseSha) fail("requested SHA is not the current fetched origin/master");
      const currentHead = runBounded(gitPath, ["--no-replace-objects", "-C", sourceRoot, "rev-parse", "HEAD"], {
        env, label: "candidate builder HEAD", runCommand,
      }).trim();
      const trackedStatus = runBounded(gitPath, [
        "--no-replace-objects", "-C", sourceRoot, "status", "--porcelain=v1", "--untracked-files=no",
      ], { env, label: "candidate builder tracked cleanliness", runCommand }).trim();
      const checkoutDir = join(runRoot, "source");
      const checkoutTree = runBounded(gitPath, [
        "--no-replace-objects", "-C", sourceRoot, "rev-parse", `${releaseSha}^{tree}`,
      ], { env, label: "exact release tree", runCommand }).trim();
      const materialized = materializeExactGitTree({
        gitPath,
        repositoryRoot: sourceRoot,
        releaseSha,
        outputRoot: checkoutDir,
        homeDir: normalizedHome,
        runCommand,
      });
      const tracked = {
        digest: materialized.source_manifest.source_manifest_digest,
        hardlinkCount: 0,
        paths: materialized.source_manifest.entries.map((entry) => entry.path),
      };
      const verifiedSourceManifestDigest = verifyExactMaterializedTree({
        sourceRoot,
        sourceManifest: materialized.source_manifest,
      });
      validateCandidateBuilderAuthority({
        currentHead,
        releaseSha,
        trackedStatus,
        sourceManifestDigest: materialized.source_manifest.source_manifest_digest,
        verifiedSourceManifestDigest,
        entries: materialized.source_manifest.entries,
      });
      currentSource = {
        checkoutDir,
        sourceManifest: materialized.source_manifest,
        tracked,
      };
      return {
        checkout_dir: checkoutDir,
        source_manifest: materialized.source_manifest,
        tracked_files: tracked.paths,
        evidence: {
          requested_sha: releaseSha,
          origin_master_sha: originMasterSha,
          checkout_sha: releaseSha,
          release_tree: checkoutTree,
          checkout_tree: checkoutTree,
          detached: true,
          clean: true,
          tracked_symlinks_contained: true,
          hardlink_count: tracked.hardlinkCount,
          source_snapshot_pre_digest: tracked.digest,
          source_snapshot_post_digest: tracked.digest,
        },
      };
    },

    async collectCiEvidence({ releaseSha }) {
      const { ghPath, gitPath } = resolveTools();
      const env = Object.freeze({ HOME: normalizedHome, PATH: "/usr/bin:/bin" });
      runBounded(gitPath, ["-C", sourceRoot, "fetch", "--no-tags", "origin", "master"], {
        env: gitEnvironment(normalizedHome),
        label: "refresh remote master for CI snapshot",
        runCommand,
        timeout: 120_000,
      });
      const remoteMasterSha = runBounded(gitPath, ["-C", sourceRoot, "rev-parse", "origin/master"], {
        env: gitEnvironment(normalizedHome), label: "remote master CI snapshot", runCommand,
      }).trim();
      if (remoteMasterSha !== releaseSha) fail("remote master moved away from candidate SHA");
      const headers = ["-H", "Accept: application/vnd.github+json", "-H", "X-GitHub-Api-Version: 2026-03-10"];
      const checkRuns = parseGhPages(runBounded(ghPath, [
        "api", "--hostname", "github.com", "--paginate", "--slurp", ...headers,
        `/repos/${REPOSITORY}/commits/${releaseSha}/check-runs?filter=all&per_page=100`,
      ], { env, label: "trusted GitHub check-runs readback", runCommand, timeout: 120_000 }), "check_runs");
      const commitStatuses = parseGhPages(runBounded(ghPath, [
        "api", "--hostname", "github.com", "--paginate", "--slurp", ...headers,
        `/repos/${REPOSITORY}/commits/${releaseSha}/statuses?per_page=100`,
      ], { env, label: "trusted GitHub commit-status readback", runCommand, timeout: 120_000 }));
      if (checkRuns.some((entry) => ["skipped", "neutral"].includes(String(entry.conclusion ?? "").toLowerCase()))) {
        fail("current-head started check set contains skipped or neutral evidence");
      }
      if (checkRuns.some((entry) => entry.head_sha !== releaseSha)) {
        fail("GitHub check-run head SHA does not match candidate SHA");
      }
      if (checkRuns.some((entry) => Number(entry.app?.id) !== GITHUB_ACTIONS_APP_INTEGRATION_ID)) {
        fail("GitHub check-run does not use the trusted GitHub Actions integration");
      }
      if (commitStatuses.some((entry) => entry.sha !== releaseSha)) {
        fail("GitHub commit-status SHA does not match candidate SHA");
      }
      const summary = normalizeGitHubProductionReleaseCheckSummary({ checkRuns, commitStatuses });
      const safeEvidence = {
        repository: REPOSITORY,
        check_runs: checkRuns.map(safeCheckProjection).sort((left, right) =>
          canonicalizeJcs(left).localeCompare(canonicalizeJcs(right))),
        commit_statuses: commitStatuses.map(safeStatusProjection).sort((left, right) =>
          canonicalizeJcs(left).localeCompare(canonicalizeJcs(right))),
        head_sha: releaseSha,
        remote_master_sha: remoteMasterSha,
        summary,
      };
      const suiteRunSet = safeEvidence.check_runs.map((entry) => ({
        app_id: entry.app_id,
        check_suite_id: entry.check_suite_id,
        id: entry.id,
      }));
      return {
        expected_head_sha: releaseSha,
        head_sha: releaseSha,
        remote_master_sha: remoteMasterSha,
        summary,
        summary_digest: sha256Jcs(summary),
        safe_projection: safeEvidence,
        safe_projection_digest: sha256Jcs(safeEvidence),
        suite_run_set_digest: sha256Jcs(suiteRunSet),
      };
    },

    collectToolchain,

    async collectImages({ buildEnvironment }) {
      if (!currentSource) fail("candidate source must be prepared before image inventory");
      const platform = string(buildEnvironment.FULL_LOCAL_DOCKER_PLATFORM, "FULL_LOCAL_DOCKER_PLATFORM");
      const composeBytes = readFileSync(
        join(currentSource.checkoutDir, "infra", "full-local-supabase", "docker-compose.production.yml"),
      );
      const toolchainLock = readToolchainLock();
      const composeInventory = validateCanonicalComposeAuthority(composeBytes, toolchainLock)
        .sort((left, right) => left.service.localeCompare(right.service));
      const lockedInventory = [...toolchainLock.full_local_images]
        .sort((left, right) => left.service.localeCompare(right.service));
      if (canonicalizeJcs(composeInventory) !== canonicalizeJcs(lockedInventory)) {
        fail("full-local Compose image service set differs from repository lock");
      }
      const { dockerPath } = resolveTools();
      const env = gitEnvironment(normalizedHome);
      const results = [];
      for (const expected of composeInventory) {
        const reference = expected.reference;
        const image = JSON.parse(runCandidateDockerReadOnly(dockerPath, ["image", "inspect", reference, "--format", "{{json .}}"], {
          env, label: "offline local image cache inspect", runCommand,
        }));
        const digestValue = expected.digest;
        const actualPlatform = `${image.Os}/${image.Architecture}`;
        if (actualPlatform !== platform) fail(`local image platform mismatch for ${digestValue}`);
        if (!IMAGE_DIGEST_PATTERN.test(image.Id ?? "")) fail(`local image ID is invalid for ${expected.service}`);
        if (!Array.isArray(image.RepoDigests) || !image.RepoDigests.some((entry) => entry.endsWith(`@${digestValue}`))) {
          fail(`local image cache lacks exact digest provenance for ${digestValue}`);
        }
        const projection = {
          id: image.Id,
          platform: actualPlatform,
          repo_digests: [...image.RepoDigests].sort(),
          service: expected.service,
        };
        results.push({
          service: expected.service,
          reference,
          digest: digestValue,
          platform,
          image_id: image.Id,
          local_cache_provenance_digest: sha256Jcs(projection),
        });
      }
      return {
        images: results.sort((left, right) => left.service.localeCompare(right.service)),
        compose_source_digest: sha256Bytes(composeBytes),
      };
    },

    async collectMigration({ source }) {
      return collectMigrationFromSource(source);
    },

    async readEnvironment() {
      return readBuildEnvironmentSnapshot(resolve(environmentSourcePath));
    },

    async executeBuild({ buildId, childEnv, releaseSha, releaseTree, runRoot, source }) {
      if (!currentSource || source.checkout_dir !== currentSource.checkoutDir) fail("candidate source authority changed");
      const tools = resolveTools();
      const privateHome = join(runRoot, "build-home");
      const privateTmp = join(runRoot, "tmp");
      const buildRoot = join(runRoot, "build-work");
      const generatedRoot = join(runRoot, "generated");
      mkdirSync(privateHome, { mode: 0o700 });
      mkdirSync(privateTmp, { mode: 0o700 });
      materializeBuildWorkspace({
        sourceRoot: source.checkout_dir,
        sourceManifest: source.source_manifest,
        buildRoot,
        generatedRoot,
      });
      const storeStat = lstatSync(packageStorePath);
      if (storeStat.isSymbolicLink() || !storeStat.isDirectory() || storeStat.uid !== process.getuid?.() || (modeBits(storeStat.mode) & 0o022) !== 0) {
        fail("offline pnpm package store identity is unsafe");
      }
      const cleanBuildEnv = Object.freeze({
        ...childEnv,
        CI: "1",
        COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
        HOME: privateHome,
        NEXT_TELEMETRY_DISABLED: "1",
        PATH: `${dirname(tools.nodePath)}:/usr/bin:/bin`,
        TMPDIR: privateTmp,
        npm_config_offline: "true",
      });
      const sandboxProfile = buildCandidateSandboxProfile({
        readRoots: [
          source.checkout_dir,
          buildRoot,
          generatedRoot,
          privateHome,
          privateTmp,
          resolve(packageStorePath),
          ...Object.values(tools),
        ],
        writeRoots: [generatedRoot, privateHome, privateTmp],
        deniedWritePaths: [source.checkout_dir, buildRoot],
        deniedPaths: [
          sourceRoot,
          resolve(environmentSourcePath),
          join(normalizedHome, ".homecook", "releases"),
          join(normalizedHome, ".homecook", "locks"),
          join(normalizedHome, ".homecook", "config"),
          join(normalizedHome, ".homecook", "logs"),
          join(normalizedHome, "Library", "LaunchAgents"),
          "/var/run/docker.sock",
          join(normalizedHome, ".docker", "run", "docker.sock"),
        ],
      });
      const installAudit = runObservedSandboxCommand({
        sandboxPath: tools.sandboxPath,
        logPath: tools.auditLogPath,
        profile: sandboxProfile,
        command: tools.nodePath,
        args: [tools.pnpmCliPath,
        "install", "--frozen-lockfile", "--offline", "--package-import-method=copy",
        "--store-dir", resolve(packageStorePath)],
        cwd: buildRoot,
        env: cleanBuildEnv,
        label: "offline frozen dependency install",
        runCommand,
        timeout: 20 * 60_000,
      });
      const nextEntrypoint = resolve(buildRoot, "node_modules", "next", "dist", "bin", "next");
      const nextStat = lstatSync(nextEntrypoint);
      if (nextStat.isSymbolicLink() || !nextStat.isFile() || (modeBits(nextStat.mode) & 0o022) !== 0) {
        fail("Next.js build entrypoint identity is unsafe");
      }
      const nextCliPre = snapshotToolFile(nextEntrypoint, "next-cli@15.5.21", {
        requireExecutable: false,
      });
      const nextBuildAudit = runObservedSandboxCommand({
        sandboxPath: tools.sandboxPath,
        logPath: tools.auditLogPath,
        profile: sandboxProfile,
        command: tools.nodePath,
        args: [nextEntrypoint, "build", "--no-lint"],
        cwd: buildRoot,
        env: cleanBuildEnv,
        label: "offline Next.js production build",
        runCommand,
        timeout: 20 * 60_000,
      });
      const nextCliPost = snapshotToolFile(nextEntrypoint, "next-cli@15.5.21", {
        requireExecutable: false,
      });
      if (canonicalizeJcs(nextCliPre) !== canonicalizeJcs(nextCliPost)) {
        fail("Next.js build entrypoint drifted during execution");
      }
      const postSourceDigest = verifyExactMaterializedTree({
        sourceRoot: source.checkout_dir,
        sourceManifest: source.source_manifest,
      });
      if (postSourceDigest !== currentSource.tracked.digest) fail("tracked source drifted during offline build");
      const artifactsRoot = join(runRoot, "artifacts");
      const assembled = assembleCandidateArtifacts({
        sourceRoot: source.checkout_dir,
        generatedRoot,
        sourceManifest: source.source_manifest,
        artifactsRoot,
      });
      const migration = collectMigrationFromSource(source);
      const workerArtifact = materializeYoutubeExtractionWorkerArtifact({
        rootDir: source.checkout_dir,
        outputDir: join(artifactsRoot, "worker-source"),
        releaseSha,
        releaseTree,
        buildId,
        promotionId: buildId,
        allowedSnapshotDigest: migration.ordered_migration_files_digest,
      });
      if (verifyExactMaterializedTree({
        sourceRoot: source.checkout_dir,
        sourceManifest: source.source_manifest,
      }) !== currentSource.tracked.digest) fail("source drifted during worker artifact materialization");
      const bundlesRoot = join(runRoot, "bundles");
      mkdirSync(bundlesRoot, { mode: 0o700 });
      const stagingBundleRoot = join(bundlesRoot, "bundle");
      const bundle = createSealedCandidateBundle({
        bundleRoot: stagingBundleRoot,
        componentRoots: {
          app: assembled.app,
          full_local: assembled.full_local,
          worker: workerArtifact.root_dir,
        },
      });
      const sealedMigration = collectSealedMigrationInventory({ bundleRoot: stagingBundleRoot });
      if (sealedMigration.ordered_migration_files_digest !== migration.ordered_migration_files_digest) {
        fail("sealed migration inventory drifted from exact Git objects");
      }
      if (verifyExactMaterializedTree({
        sourceRoot: source.checkout_dir,
        sourceManifest: source.source_manifest,
      }) !== currentSource.tracked.digest) fail("source drifted during final bundle sealing");
      await collectToolchain();
      return {
        ...bundle,
        build_tools: { next_cli: nextCliPost },
        bundle_content_digest: bundle.sealed_bundle_digest,
        migration: sealedMigration,
        sandbox_policy_digest: sha256Jcs({
          profile_digest: sha256Bytes(Buffer.from(sandboxProfile, "utf8")),
          execution_audit_digests: [installAudit.audit_digest, nextBuildAudit.audit_digest],
        }),
        staging_bundle_root: stagingBundleRoot,
      };
    },

    async finalizeBundleAddress({ build, bundleAuthorityManifest, candidateIdentityDigest }) {
      const stagingBundleRoot = resolve(build.staging_bundle_root);
      const bundlesRoot = dirname(stagingBundleRoot);
      chmodSync(stagingBundleRoot, 0o700);
      writeFileSync(
        join(stagingBundleRoot, "bundle-manifest.json"),
        canonicalizeJcs(bundleAuthorityManifest),
        { flag: "wx", mode: 0o400 },
      );
      chmodSync(stagingBundleRoot, 0o500);
      writeFileSync(
        join(bundlesRoot, "candidate-identity.json"),
        canonicalizeJcs({
          schema: "homecook.local-mac-production-rehearsal-candidate-identity.v1",
          candidate_identity_digest: candidateIdentityDigest,
        }),
        { flag: "wx", mode: 0o400 },
      );
      chmodSync(bundlesRoot, 0o500);
    },

  });
}
