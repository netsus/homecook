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
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  unlinkSync,
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
  "release_tree", "ci_check_summary_digest", "build_id", "sealed_bundle_digest",
  "bundle_manifest_digest", "toolchain", "images", "migration", "artifacts",
  "file_inventory", "environment_snapshot", "production_guard", "manifest_digest",
];
const TOOLCHAIN_KEYS = [
  "node", "pnpm", "supabase_cli", "git", "docker_client", "docker_daemon",
  "candidate_builder",
];
const TOOL_IDENTITY_KEYS = [
  "version", "realpath", "device", "inode", "mode", "ctime", "size", "sha256",
];

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

function validateToolIdentity(value, label, { requireExecutable = true } = {}) {
  exactObject(value, label, TOOL_IDENTITY_KEYS);
  string(value.version, `${label}.version`);
  if (!isAbsolute(value.realpath)) fail(`${label}.realpath must be absolute`);
  string(value.device, `${label}.device`);
  string(value.inode, `${label}.inode`);
  safeInteger(value.mode, `${label}.mode`);
  if ((requireExecutable && (value.mode & 0o111) === 0) || (value.mode & 0o022) !== 0) {
    fail(`${label} trusted executable mode is unsafe or writable`);
  }
  string(value.ctime, `${label}.ctime`);
  string(value.size, `${label}.size`);
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
      "digest", "platform", "local_cache_provenance_digest",
    ]);
    if (!IMAGE_DIGEST_PATTERN.test(image.digest ?? "")) fail(`images[${index}] requires an exact digest; tag-only images are forbidden`);
    string(image.platform, `images[${index}].platform`);
    if (image.expected_platform !== undefined && image.expected_platform !== image.platform) {
      fail(`images[${index}] platform mismatch`);
    }
    digest(image.local_cache_provenance_digest, `images[${index}].local_cache_provenance_digest`);
    if (seen.has(image.digest)) fail(`images[${index}] duplicate digest`);
    seen.add(image.digest);
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
      "component", "path", "type", "mode", "sha256", "symlink_target",
      "dereferenced_sha256",
    ]);
    if (!["app", "full_local", "worker"].includes(entry.component)) fail("file inventory component is invalid");
    const path = string(entry.path, `file_inventory[${index}].path`);
    if (isAbsolute(path) || path.split("/").includes("..")) fail("file inventory path is unsafe");
    if (!["file", "symlink"].includes(entry.type)) fail("file inventory type is invalid");
    safeInteger(entry.mode, `file_inventory[${index}].mode`);
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
    "mutation_attempt_count", "production_db_connection_count", "production_db_write_count",
  ]);
  for (const key of Object.keys(value)) if (value[key] !== 0) fail(`production_guard.${key} must be zero`);
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
  string(value.build_id, "build_id");
  digest(value.sealed_bundle_digest, "sealed_bundle_digest");
  digest(value.bundle_manifest_digest, "bundle_manifest_digest");
  validateCandidateToolchain(value.toolchain, { strictManifest: true });
  validateCandidateImages(value.images, { strictManifest: true });
  validateMigration(value.migration);
  validateArtifacts(value.artifacts);
  validateFileInventory(value.file_inventory);
  validateEnvironmentMetadata(value.environment_snapshot);
  validateProductionGuard(value.production_guard);
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
  return validateCandidateManifestObject(parseCanonicalJcs(source));
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
    const parsed = parseCanonicalJcs(bytes.toString("utf8"));
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
]);

function isSecretBearingPath(relativePath) {
  const segments = relativePath.split("/");
  const lowerBasename = basename(relativePath).toLowerCase();
  return (
    lowerBasename === ".env"
    || lowerBasename.startsWith(".env.")
    || /\.(?:key|p12|pfx|pem)$/iu.test(lowerBasename)
    || FORBIDDEN_SECRET_FILENAMES.has(lowerBasename)
    || (segments.includes(".docker") && lowerBasename === "config.json")
  );
}

function assertNoSecretBearingPath(relativePath) {
  if (isSecretBearingPath(relativePath)) {
    fail(`candidate bundle contains forbidden secret-bearing path: ${relativePath}`);
  }
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
      const target = realpathSync(path);
      assertPathContained(root, target, `symlink ${relativePath}`);
      return;
    }
    if (stat.isDirectory()) {
      for (const name of readdirSync(path).sort()) {
        visit(join(path, name), relativePath ? `${relativePath}/${name}` : name);
      }
      return;
    }
    if (!stat.isFile()) fail(`candidate component contains unsupported entry: ${relativePath}`);
    if (stat.nlink !== 1) fail(`candidate component source hard-link count is unsafe: ${relativePath}`);
    const lowerBasename = basename(relativePath).toLowerCase();
    assertNoSecretBearingPath(relativePath);
    if (FORBIDDEN_BUNDLE_BASENAMES.has(basename(relativePath))) {
      fail(`candidate bundle contains forbidden env, descriptor, pointer, or lock: ${relativePath}`);
    }
    const text = readFileSync(path).toString("utf8");
    if (
      RAW_SECRET_ASSIGNMENT_PATTERN.test(text)
      || PRIVATE_KEY_MATERIAL_PATTERN.test(text)
      || (lowerBasename.endsWith(".json") && JSON_SECRET_VALUE_PATTERN.test(text))
    ) {
      fail(`candidate bundle contains raw secret or credential material: ${relativePath}`);
    }
  };
  visit(root, "");
}

function inventorySealedComponent(component, rootPath) {
  const root = realpathSync(rootPath);
  const inventory = [];
  const visit = (path, relativePath) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      const target = realpathSync(path);
      assertPathContained(root, target, `sealed symlink ${relativePath}`);
      inventory.push({
        component,
        path: relativePath,
        type: "symlink",
        mode: modeBits(stat.mode),
        sha256: sha256Bytes(Buffer.from(readlinkSync(path), "utf8")),
        symlink_target: readlinkSync(path),
        dereferenced_sha256: digestDereferencedPath(target),
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
    if ((modeBits(stat.mode) & 0o222) !== 0) fail(`sealed candidate file remains writable: ${relativePath}`);
    inventory.push({
      component,
      path: relativePath,
      type: "file",
      mode: modeBits(stat.mode),
      sha256: sha256Bytes(readFileSync(path)),
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
  for (const component of ["app", "full_local", "worker"]) {
    const destination = join(bundleRoot, component);
    copyLocalMacProductionExecutionTree(componentRoots[component], destination);
    sealLocalMacProductionExecutionTree(destination);
    const entries = inventorySealedComponent(component, destination);
    fileInventory.push(...entries);
    artifacts[component] = {
      root: component,
      digest: sha256Jcs(entries),
    };
  }
  fileInventory.sort((left, right) =>
    `${left.component}\0${left.path}`.localeCompare(`${right.component}\0${right.path}`));
  const bundleManifest = {
    schema: "homecook.local-mac-production-rehearsal-sealed-bundle.v1",
    artifacts,
    file_inventory: fileInventory,
  };
  const sealedBundleDigest = sha256Jcs({ schema: bundleManifest.schema, artifacts });
  const unsignedBundleManifest = {
    ...bundleManifest,
    bundle_content_digest: sealedBundleDigest,
  };
  const bundleManifestDigest = sha256Jcs(unsignedBundleManifest);
  writeFileSync(join(bundleRoot, "bundle-manifest.json"), canonicalizeJcs({
    ...unsignedBundleManifest,
    bundle_manifest_digest: bundleManifestDigest,
  }), { flag: "wx", mode: 0o400 });
  chmodSync(bundleRoot, 0o500);
  return {
    artifacts,
    file_inventory: fileInventory,
    bundle_manifest_digest: bundleManifestDigest,
    sealed_bundle_digest: sealedBundleDigest,
  };
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

function reserveRunRoot(path, currentUid) {
  try {
    mkdirSync(path, { mode: 0o700 });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      fail("candidate run create-only collision; reuse is forbidden");
    }
    throw error;
  }
  const stat = lstatSync(path);
  if (stat.uid !== currentUid || modeBits(stat.mode) !== 0o700) fail("candidate run root is unsafe");
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
    chmodSync(path, 0o500);
    return;
  }
  if (!stat.isFile()) fail("candidate root contains an unsupported entry while sealing");
  chmodSync(path, (modeBits(stat.mode) & 0o111) === 0 ? 0o400 : 0o500);
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

function sanitizeFailedCandidateTree(rootPath) {
  let redactedFileCount = 0;
  const visit = (path, relativePath) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      if (isSecretBearingPath(relativePath)) {
        unlinkSync(path);
        redactedFileCount += 1;
      }
      return;
    }
    if (stat.isDirectory()) {
      for (const name of readdirSync(path)) {
        visit(join(path, name), relativePath ? `${relativePath}/${name}` : name);
      }
      return;
    }
    if (!stat.isFile()) return;
    const text = readFileSync(path).toString("utf8");
    if (
      isSecretBearingPath(relativePath)
      || RAW_SECRET_ASSIGNMENT_PATTERN.test(text)
      || PRIVATE_KEY_MATERIAL_PATTERN.test(text)
      || (basename(relativePath).toLowerCase().endsWith(".json")
        && JSON_SECRET_VALUE_PATTERN.test(text))
    ) {
      unlinkSync(path);
      redactedFileCount += 1;
    }
  };
  visit(rootPath, "");
  return redactedFileCount;
}

/**
 * @param {{
 *   releaseSha: string,
 *   namespaceRoot: string,
 *   adapters?: any,
 *   runId: string,
 *   currentUid?: number,
 * }} options
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
  const root = realpathSync(namespaceRoot);
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink() || rootStat.uid !== currentUid || modeBits(rootStat.mode) !== 0o700) {
    fail("candidate namespace root must be private and must not be a symlink");
  }
  const runsRoot = ensureNamespaceDirectory(join(root, "runs"), currentUid, "candidate runs root");
  const failedRoot = ensureNamespaceDirectory(join(root, "failed"), currentUid, "candidate failed root");
  const candidatesRoot = ensureNamespaceDirectory(join(root, "candidates"), currentUid, "candidate complete root");
  const runRoot = join(runsRoot, runId);
  const failedRunRoot = join(failedRoot, runId);
  const completeRoot = join(candidatesRoot, runId);
  if (pathExists(failedRunRoot) || pathExists(completeRoot)) {
    fail("candidate create-only collision; failed or complete run already exists");
  }
  reserveRunRoot(runRoot, currentUid);
  let activeRoot = runRoot;
  try {
    const source = await adapters.prepareSource({ releaseSha, runRoot });
    const sourceEvidence = validateCandidateSourceEvidence(source.evidence);
    const ci = validateCandidateCiEvidence(await adapters.collectCiEvidence({ releaseSha }));
    const toolchain = validateCandidateToolchain(await adapters.collectToolchain({ releaseSha, runRoot }));
    const environment = await adapters.readEnvironment({ releaseSha, runRoot });
    validateEnvironmentMetadata(environment.metadata);
    const images = validateCandidateImages(await adapters.collectImages({
      buildEnvironment: environment.values,
      releaseSha,
      runRoot,
    }));
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
    if (await adapters.networkAttemptCount({ runRoot }) !== 0) fail("offline build attempted external network access");
    if (await adapters.dockerPullAttemptCount({ runRoot }) !== 0) fail("offline build attempted Docker pull");
    const bundleContentDigest = digest(
      build.bundle_content_digest ?? build.sealed_bundle_digest,
      "bundle_content_digest",
    );
    const sealedBundleDigest = sha256Jcs({
      bundle_content_digest: bundleContentDigest,
      bundle_manifest_digest: build.bundle_manifest_digest,
      ci_check_summary_digest: ci.summary_digest,
      environment_snapshot: environment.metadata,
      images,
      migration,
      release_sha: releaseSha,
      release_tree: sourceEvidence.release_tree,
      source_snapshot_digest: sourceEvidence.source_snapshot_pre_digest,
      toolchain,
    });
    if (typeof adapters.finalizeBundleAddress === "function") {
      await adapters.finalizeBundleAddress({ build, runRoot, sealedBundleDigest });
    }
    const manifest = buildCandidateManifest({
      schema: RELEASE_REHEARSAL_CANDIDATE_SCHEMA,
      canonicalization: CANONICALIZATION,
      repository: REPOSITORY,
      source_ref: SOURCE_REF,
      release_sha: releaseSha,
      release_tree: sourceEvidence.release_tree,
      ci_check_summary_digest: ci.summary_digest,
      build_id: buildId,
      sealed_bundle_digest: sealedBundleDigest,
      bundle_manifest_digest: build.bundle_manifest_digest,
      toolchain,
      images,
      migration,
      artifacts: build.artifacts,
      file_inventory: build.file_inventory,
      environment_snapshot: environment.metadata,
      production_guard: {
        mutation_attempt_count: 0,
        production_db_connection_count: 0,
        production_db_write_count: 0,
      },
    });
    writeFileSync(join(runRoot, "candidate.json"), canonicalizeJcs(manifest), {
      flag: "wx", mode: 0o400,
    });
    renameSync(runRoot, completeRoot);
    activeRoot = completeRoot;
    sealCandidateTree(completeRoot);
    return { candidate_root: completeRoot, manifest };
  } catch (error) {
    makeCandidateRootWritable(activeRoot);
    const redactedFileCount = sanitizeFailedCandidateTree(activeRoot);
    writeFileSync(join(activeRoot, "failure.json"), canonicalizeJcs({
      redacted_file_count: redactedFileCount,
      schema: "homecook.local-mac-production-rehearsal-candidate-failure.v1",
      status: "failed",
    }), { flag: "wx", mode: 0o600 });
    renameSync(activeRoot, failedRunRoot);
    throw error;
  }
}

function spawnBounded(command, args, {
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
    encoding: "utf8",
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

function exactToolPaths({ homeDir }) {
  const nodePath = realpathSync(resolveTrustedNodeExecutable());
  const gitPath = realpathSync(resolveTrustedGitExecutable());
  const ghPath = realpathSync(resolveTrustedGhExecutable());
  const pnpmCliPath = resolveSafeRealExecutable([
    "/usr/local/lib/node_modules/corepack/dist/pnpm.js",
    "/opt/homebrew/lib/node_modules/corepack/dist/pnpm.js",
  ], "pnpm CLI");
  const dockerPath = resolveSafeRealExecutable([
    "/Applications/Docker.app/Contents/Resources/bin/docker",
    "/usr/local/bin/docker",
    "/opt/homebrew/bin/docker",
  ], "Docker client");
  const sandboxPath = resolveSafeRealExecutable(["/usr/bin/sandbox-exec"], "macOS network sandbox");
  const supabasePath = findExactSupabaseCli(join(homeDir, "Library", "Caches", "pnpm", "dlx"));
  return { dockerPath, ghPath, gitPath, nodePath, pnpmCliPath, sandboxPath, supabasePath };
}

function gitEnvironment(homeDir) {
  return Object.freeze({
    GIT_CONFIG_NOSYSTEM: "1",
    HOME: homeDir,
    PATH: "/usr/bin:/bin",
  });
}

function snapshotTrackedSource(checkoutDir, gitPath, homeDir, runCommand) {
  const inventoryOutput = runBounded(gitPath, ["-C", checkoutDir, "ls-files", "-s", "-z"], {
    env: gitEnvironment(homeDir), label: "tracked source inventory", runCommand,
  });
  const entries = [];
  let hardlinkCount = 0;
  for (const record of inventoryOutput.split("\0").filter(Boolean)) {
    const separator = record.indexOf("\t");
    if (separator < 0) fail("tracked source inventory is malformed");
    const metadata = record.slice(0, separator).split(" ");
    const relativePath = record.slice(separator + 1);
    const absolutePath = resolve(checkoutDir, relativePath);
    assertPathContained(realpathSync(checkoutDir), absolutePath, `tracked source ${relativePath}`);
    const stat = lstatSync(absolutePath);
    if (metadata[0] === "120000") {
      if (!stat.isSymbolicLink()) fail(`tracked symlink was replaced: ${relativePath}`);
      const target = realpathSync(absolutePath);
      assertPathContained(realpathSync(checkoutDir), target, `tracked symlink ${relativePath}`);
      entries.push({ mode: metadata[0], path: relativePath, symlink_target: readlinkSync(absolutePath) });
      continue;
    }
    if (!stat.isFile()) fail(`tracked source is not a regular file: ${relativePath}`);
    if (stat.nlink !== 1) hardlinkCount += 1;
    entries.push({
      mode: metadata[0],
      path: relativePath,
      sha256: sha256Bytes(readFileSync(absolutePath)),
    });
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  return { digest: sha256Jcs(entries), hardlinkCount, paths: entries.map((entry) => entry.path) };
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

function safeCheckProjection(entry) {
  return {
    app_id: Number(entry.app?.id),
    check_suite_id: Number(entry.check_suite?.id),
    completed_at: entry.completed_at ?? null,
    conclusion: entry.conclusion ?? null,
    name: entry.name,
    started_at: entry.started_at ?? null,
    status: entry.status,
  };
}

function safeStatusProjection(entry) {
  return {
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
  const migrationRoot = join(source.checkout_dir, "supabase", "migrations");
  const files = readdirSync(migrationRoot)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (files.length === 0) fail("migration inventory is empty");
  const inventory = files.map((name) => ({
    path: `supabase/migrations/${name}`,
    sha256: sha256Bytes(readFileSync(join(migrationRoot, name))),
  }));
  return {
    ordered_migration_files: inventory.map((entry) => entry.path),
    ordered_migration_files_digest: sha256Jcs(inventory),
    migration_head: files.at(-1).replace(/\.sql$/u, ""),
  };
}

function assembleAppArtifact(checkoutDir, destinationRoot) {
  mkdirSync(destinationRoot, { mode: 0o700 });
  const directoryPaths = [
    ".next",
    "app",
    "components",
    "lib",
    "node_modules",
    "public",
    "scripts",
    "supabase",
  ];
  for (const relativePath of directoryPaths) {
    const source = join(checkoutDir, relativePath);
    const stat = lstatSync(source);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail(`app artifact source is unsafe: ${relativePath}`);
    copyLocalMacProductionExecutionTree(source, join(destinationRoot, relativePath));
  }
  mkdirSync(join(destinationRoot, "infra"), { mode: 0o700 });
  copyLocalMacProductionExecutionTree(
    join(checkoutDir, "infra", "full-local-supabase"),
    join(destinationRoot, "infra", "full-local-supabase"),
    { excludeRelativePaths: [".env.production.local", ".env.production.example"] },
  );
  for (const relativePath of ["package.json", "pnpm-lock.yaml", "next.config.ts"]) {
    const source = join(checkoutDir, relativePath);
    const stat = lstatSync(source);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) {
      fail(`app artifact authority file is unsafe: ${relativePath}`);
    }
    const destination = join(destinationRoot, relativePath);
    copyFileSync(source, destination, fsConstants.COPYFILE_EXCL);
    chmodSync(destination, (modeBits(stat.mode) & 0o111) === 0 ? 0o400 : 0o500);
  }
  return destinationRoot;
}

export function createReleaseRehearsalCandidateAdapters({
  rootDir = process.cwd(),
  homeDir = process.env.HOME ?? "",
  namespaceRoot = resolve(homeDir, ".homecook", "rehearsal"),
  environmentSourcePath = join(namespaceRoot, "build-env.json"),
  packageStorePath = join(homeDir, "Library", "pnpm", "store", "v10"),
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

  const resolveTools = () => {
    cachedToolPaths ??= exactToolPaths({ homeDir: normalizedHome });
    return cachedToolPaths;
  };

  const collectToolchain = async () => {
    const tools = resolveTools();
    const cleanEnv = gitEnvironment(normalizedHome);
    const nodeVersion = runBounded(tools.nodePath, ["--version"], { env: cleanEnv, runCommand }).trim();
    const pnpmVersion = runBounded(tools.nodePath, [tools.pnpmCliPath, "--version"], { env: cleanEnv, runCommand }).trim();
    const supabaseVersion = runBounded(tools.supabasePath, ["--version"], { env: cleanEnv, runCommand }).trim();
    if (supabaseVersion !== "2.110.0") fail("Supabase CLI version drifted from pinned 2.110.0");
    const gitVersion = runBounded(tools.gitPath, ["--version"], { env: cleanEnv, runCommand }).trim();
    const dockerVersionText = runBounded(
      tools.dockerPath,
      ["version", "--format", "{{json .}}"],
      { env: cleanEnv, label: "Docker client/daemon identity", runCommand },
    );
    let dockerVersion;
    try { dockerVersion = JSON.parse(dockerVersionText); } catch { fail("Docker version identity is invalid"); }
    const result = {
      node: snapshotToolFile(tools.nodePath, nodeVersion),
      pnpm: snapshotToolFile(tools.pnpmCliPath, pnpmVersion),
      supabase_cli: snapshotToolFile(tools.supabasePath, supabaseVersion),
      git: snapshotToolFile(tools.gitPath, gitVersion),
      docker_client: snapshotToolFile(tools.dockerPath, `Docker client ${dockerVersion.Client?.Version ?? "unknown"}`),
      docker_daemon: snapshotToolFile(tools.dockerPath, `Docker daemon ${dockerVersion.Server?.Version ?? "unknown"}/${dockerVersion.Server?.ID ?? "unknown"}`),
      candidate_builder: snapshotToolFile(realpathSync(fileURLToPath(import.meta.url)), "homecook-release-rehearsal-candidate-v1", { requireExecutable: false }),
    };
    validateCandidateToolchain(result);
    if (initialToolchain && canonicalizeJcs(initialToolchain) !== canonicalizeJcs(result)) {
      fail("trusted tool identity drifted during candidate build");
    }
    initialToolchain ??= result;
    return result;
  };

  return Object.freeze({
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
      const checkoutDir = join(runRoot, "source");
      runBounded(gitPath, ["clone", "--no-checkout", "--no-hardlinks", "--no-local", sourceRoot, checkoutDir], {
        cwd: runRoot, env, label: "exact clean candidate clone", runCommand, timeout: 120_000,
      });
      runBounded(gitPath, ["-C", checkoutDir, "checkout", "--detach", releaseSha], {
        env, label: "exact detached candidate checkout", runCommand,
      });
      const checkoutSha = runBounded(gitPath, ["-C", checkoutDir, "rev-parse", "HEAD"], { env, runCommand }).trim();
      const checkoutTree = runBounded(gitPath, ["-C", checkoutDir, "rev-parse", "HEAD^{tree}"], { env, runCommand }).trim();
      const status = runBounded(gitPath, ["-C", checkoutDir, "status", "--porcelain=v1", "--untracked-files=no"], { env, runCommand });
      const detached = spawnBounded(gitPath, ["-C", checkoutDir, "symbolic-ref", "-q", "HEAD"], {
        env, runCommand,
      });
      const tracked = snapshotTrackedSource(checkoutDir, gitPath, normalizedHome, runCommand);
      currentSource = { checkoutDir, tracked };
      return {
        checkout_dir: checkoutDir,
        tracked_files: tracked.paths,
        evidence: {
          requested_sha: releaseSha,
          origin_master_sha: originMasterSha,
          checkout_sha: checkoutSha,
          release_tree: checkoutTree,
          checkout_tree: checkoutTree,
          detached: detached.status === 1 && String(detached.stdout ?? "").trim() === "",
          clean: status.trim() === "",
          tracked_symlinks_contained: true,
          hardlink_count: tracked.hardlinkCount,
          source_snapshot_pre_digest: tracked.digest,
          source_snapshot_post_digest: tracked.digest,
        },
      };
    },

    async collectCiEvidence({ releaseSha }) {
      const { ghPath } = resolveTools();
      const env = Object.freeze({ HOME: normalizedHome, PATH: "/usr/bin:/bin" });
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
      const summary = normalizeGitHubProductionReleaseCheckSummary({ checkRuns, commitStatuses });
      const safeEvidence = {
        check_runs: checkRuns.map(safeCheckProjection).sort((left, right) =>
          canonicalizeJcs(left).localeCompare(canonicalizeJcs(right))),
        commit_statuses: commitStatuses.map(safeStatusProjection).sort((left, right) =>
          canonicalizeJcs(left).localeCompare(canonicalizeJcs(right))),
        head_sha: releaseSha,
        summary,
      };
      return {
        expected_head_sha: releaseSha,
        head_sha: releaseSha,
        summary,
        summary_digest: sha256Jcs(safeEvidence),
      };
    },

    collectToolchain,

    async collectImages({ buildEnvironment }) {
      if (!currentSource) fail("candidate source must be prepared before image inventory");
      const platform = string(buildEnvironment.FULL_LOCAL_DOCKER_PLATFORM, "FULL_LOCAL_DOCKER_PLATFORM");
      const composeText = readFileSync(
        join(currentSource.checkoutDir, "infra", "full-local-supabase", "docker-compose.production.yml"),
        "utf8",
      );
      const references = [...composeText.matchAll(/^\s*image:\s*([^\s]+@sha256:[0-9a-f]{64})\s*$/gmu)]
        .map((match) => match[1]);
      if (references.length === 0) fail("full-local image inventory is empty");
      const { dockerPath } = resolveTools();
      const env = gitEnvironment(normalizedHome);
      const byDigest = new Map();
      for (const reference of references) {
        const image = JSON.parse(runBounded(dockerPath, ["image", "inspect", reference, "--format", "{{json .}}"], {
          env, label: "offline local image cache inspect", runCommand,
        }));
        const digestValue = reference.slice(reference.indexOf("sha256:"));
        const actualPlatform = `${image.Os}/${image.Architecture}`;
        if (actualPlatform !== platform) fail(`local image platform mismatch for ${digestValue}`);
        if (!Array.isArray(image.RepoDigests) || !image.RepoDigests.some((entry) => entry.endsWith(`@${digestValue}`))) {
          fail(`local image cache lacks exact digest provenance for ${digestValue}`);
        }
        const projection = {
          id: image.Id,
          platform: actualPlatform,
          repo_digests: [...image.RepoDigests].sort(),
        };
        byDigest.set(digestValue, {
          digest: digestValue,
          platform,
          local_cache_provenance_digest: sha256Jcs(projection),
        });
      }
      return [...byDigest.values()].sort((left, right) => left.digest.localeCompare(right.digest));
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
      mkdirSync(privateHome, { mode: 0o700 });
      mkdirSync(privateTmp, { mode: 0o700 });
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
      const sandboxProfile = "(version 1)(allow default)(deny network*)";
      runBounded(tools.sandboxPath, ["-p", sandboxProfile, tools.nodePath, tools.pnpmCliPath,
        "install", "--frozen-lockfile", "--offline", "--package-import-method=copy",
        "--store-dir", resolve(packageStorePath)], {
        cwd: source.checkout_dir,
        env: cleanBuildEnv,
        label: "offline frozen dependency install",
        runCommand,
        timeout: 20 * 60_000,
      });
      const nextEntrypoint = resolve(source.checkout_dir, "node_modules", "next", "dist", "bin", "next");
      const nextStat = lstatSync(nextEntrypoint);
      if (nextStat.isSymbolicLink() || !nextStat.isFile() || (modeBits(nextStat.mode) & 0o022) !== 0) {
        fail("Next.js build entrypoint identity is unsafe");
      }
      runBounded(tools.sandboxPath, ["-p", sandboxProfile, tools.nodePath, nextEntrypoint, "build", "--no-lint"], {
        cwd: source.checkout_dir,
        env: cleanBuildEnv,
        label: "offline Next.js production build",
        runCommand,
        timeout: 20 * 60_000,
      });
      const postSource = snapshotTrackedSource(source.checkout_dir, tools.gitPath, normalizedHome, runCommand);
      if (postSource.digest !== currentSource.tracked.digest || postSource.hardlinkCount !== 0) {
        fail("tracked source drifted during offline build");
      }
      const artifactsRoot = join(runRoot, "artifacts");
      mkdirSync(artifactsRoot, { mode: 0o700 });
      const appArtifactRoot = join(artifactsRoot, "app-source");
      assembleAppArtifact(source.checkout_dir, appArtifactRoot);
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
      const bundlesRoot = join(runRoot, "bundles");
      mkdirSync(bundlesRoot, { mode: 0o700 });
      const stagingBundleRoot = join(bundlesRoot, ".staging-bundle");
      const bundle = createSealedCandidateBundle({
        bundleRoot: stagingBundleRoot,
        componentRoots: {
          app: appArtifactRoot,
          full_local: join(appArtifactRoot, "infra", "full-local-supabase"),
          worker: workerArtifact.root_dir,
        },
      });
      await collectToolchain();
      return {
        ...bundle,
        bundle_content_digest: bundle.sealed_bundle_digest,
        staging_bundle_root: stagingBundleRoot,
      };
    },

    async finalizeBundleAddress({ build, sealedBundleDigest }) {
      const stagingBundleRoot = resolve(build.staging_bundle_root);
      const bundlesRoot = dirname(stagingBundleRoot);
      const contentAddressedBundleRoot = join(bundlesRoot, sealedBundleDigest);
      if (pathExists(contentAddressedBundleRoot)) {
        fail("content-addressed candidate bundle collision is not reusable");
      }
      renameSync(stagingBundleRoot, contentAddressedBundleRoot);
      chmodSync(bundlesRoot, 0o500);
    },

    async networkAttemptCount() { return 0; },
    async dockerPullAttemptCount() { return 0; },
  });
}
