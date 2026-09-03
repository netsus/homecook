import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  accessSync,
  chmodSync,
  closeSync,
  copyFileSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import { constants as osConstants } from "node:os";
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
  EXPECTED_RELEASE_CONTEXTS,
  GITHUB_ACTIONS_APP_INTEGRATION_ID,
} from "./production-release-approval-policy.mjs";
import {
  resolveTrustedGhExecutable,
  resolveTrustedGitExecutable,
  resolveTrustedNodeExecutable,
} from "./trusted-production-release-tools.mjs";
import {
  buildYoutubeExtractionWorkerPolicySnapshotDigest,
  materializeYoutubeExtractionWorkerArtifact,
} from "./youtube-extraction-worker-artifact.mjs";
import {
  collectReadOnlyProductionInventory,
  createLocalProductionInventoryAdapters,
  createProductionSurfaceSnapshot,
} from "./local-mac-production-rehearsal-inventory.mjs";
import { resolveCandidateRehearsalSourceAuthority } from "./local-mac-production-rehearsal-selection.mjs";

export const RELEASE_REHEARSAL_CANDIDATE_SCHEMA =
  "homecook.local-mac-production-rehearsal-candidate.v1";
export const RELEASE_REHEARSAL_BUILD_ENV_SCHEMA =
  "homecook.release-rehearsal-build-env.v1";
export const RELEASE_REHEARSAL_STARTUP_IDENTITY_SCHEMA =
  "homecook.local-mac-production-rehearsal-startup-identity.v1";

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
  "schema", "canonicalization", "repository", "source_ref", "selection_digest", "release_sha",
  "release_tree", "ci_check_summary_digest", "ci_snapshot_digest",
  "ci_suite_run_set_digest", "builder_input_digest", "source_manifest_digest", "compose_source_digest", "sandbox_policy_digest",
  "generated_build_inventory_digest",
  "pnpm_store_snapshot_inventory_digest",
  "pnpm_store_final_index_inventory_digest",
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
const EXECUTABLE_TOOL_MODES = new Set([0o500, 0o555, 0o700, 0o755]);
const READABLE_TOOL_MODES = new Set([0o400, 0o444, 0o500, 0o555, 0o600, 0o644, 0o700, 0o755]);
const requireNativeWitness = createRequire(import.meta.url);
const pinnedSandboxWitnessControllers = new Map();

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

export function buildCandidateStartupIdentity(manifest) {
  const unsigned = {
    schema: RELEASE_REHEARSAL_STARTUP_IDENTITY_SCHEMA,
    candidate_schema: string(manifest?.schema, "startup identity candidate schema"),
    release_sha: sha(manifest?.release_sha, "startup identity release SHA"),
    release_tree: sha(manifest?.release_tree, "startup identity release tree"),
    candidate_identity_digest: digest(manifest?.candidate_identity_digest, "startup identity candidate digest"),
    manifest_digest: digest(manifest?.manifest_digest, "startup identity manifest digest"),
    build_id: string(manifest?.build_id, "startup identity build ID"),
    build_inputs_digest: sha256Jcs({
      builder_input_digest: digest(manifest?.builder_input_digest, "startup identity builder input digest"),
      source_manifest_digest: digest(manifest?.source_manifest_digest, "startup identity source manifest digest"),
      compose_source_digest: digest(manifest?.compose_source_digest, "startup identity Compose source digest"),
      sandbox_policy_digest: digest(manifest?.sandbox_policy_digest, "startup identity sandbox policy digest"),
      generated_build_inventory_digest: digest(manifest?.generated_build_inventory_digest, "startup identity generated build inventory digest"),
      pnpm_store_snapshot_inventory_digest: digest(manifest?.pnpm_store_snapshot_inventory_digest, "startup identity pnpm store inventory digest"),
      pnpm_store_final_index_inventory_digest: digest(
        manifest?.pnpm_store_final_index_inventory_digest,
        "startup identity pnpm store final index inventory digest",
      ),
    }),
    sealed_bundle_digest: digest(manifest?.sealed_bundle_digest, "startup identity sealed bundle digest"),
    bundle_manifest_digest: digest(manifest?.bundle_manifest_digest, "startup identity bundle manifest digest"),
    artifacts_digest: sha256Jcs(manifest?.artifacts),
    toolchain_digest: sha256Jcs({
      toolchain: manifest?.toolchain,
      build_tools: manifest?.build_tools,
      toolchain_lock_digest: digest(manifest?.toolchain_lock_digest, "startup identity toolchain lock digest"),
    }),
    images_digest: sha256Jcs(manifest?.images),
    migration_head: string(manifest?.migration?.migration_head, "startup identity migration head"),
    migration_digest: sha256Jcs(manifest?.migration),
  };
  return Object.freeze({ ...unsigned, identity_digest: sha256Jcs(unsigned) });
}

export function validateCandidateStartupIdentity(value, manifest = null, label = "candidate startup identity") {
  exactObject(value, label, [
    "schema", "candidate_schema", "release_sha", "release_tree", "candidate_identity_digest",
    "manifest_digest", "build_id", "build_inputs_digest", "sealed_bundle_digest",
    "bundle_manifest_digest", "artifacts_digest", "toolchain_digest", "images_digest",
    "migration_head", "migration_digest", "identity_digest",
  ]);
  const { identity_digest: identityDigest, ...unsigned } = value;
  if (
    value.schema !== RELEASE_REHEARSAL_STARTUP_IDENTITY_SCHEMA
    || !SHA_PATTERN.test(value.release_sha ?? "")
    || !SHA_PATTERN.test(value.release_tree ?? "")
    || typeof value.candidate_schema !== "string" || value.candidate_schema.length === 0
    || typeof value.build_id !== "string" || value.build_id.length === 0
    || typeof value.migration_head !== "string" || value.migration_head.length === 0
    || ![
      "candidate_identity_digest", "manifest_digest", "build_inputs_digest", "sealed_bundle_digest",
      "bundle_manifest_digest", "artifacts_digest", "toolchain_digest", "images_digest",
      "migration_digest", "identity_digest",
    ].every((field) => DIGEST_PATTERN.test(value[field] ?? ""))
    || identityDigest !== sha256Jcs(unsigned)
  ) fail(`${label} is malformed or not self-bound`);
  if (manifest !== null) {
    const expected = buildCandidateStartupIdentity(manifest);
    if (canonicalizeJcs(value) !== canonicalizeJcs(expected)) {
      fail(`${label} differs from the completed candidate manifest`);
    }
  }
  return Object.freeze({ ...value });
}

function nullableDigest(value, label) {
  if (value === null) return value;
  return digest(value, label);
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
  const allowedModes = requireExecutable ? EXECUTABLE_TOOL_MODES : READABLE_TOOL_MODES;
  if (!allowedModes.has(value.mode)) fail(`${label}.mode is outside the trusted mode allowlist`);
  if ((value.mode & 0o022) !== 0) {
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
  if (!Object.hasOwn(value, "selection_digest")) fail("source evidence selection_digest is required");
  nullableDigest(value.selection_digest, "source evidence selection_digest");
  if ((value.selection_digest === null && value.requested_sha !== value.origin_master_sha)
    || value.checkout_sha !== value.requested_sha) {
    fail("requested SHA is not authorized by current origin/master or an approved selection");
  }
  if (value.release_tree !== value.checkout_tree) fail("checkout tree does not match release tree");
  if (value.detached !== true) fail("checkout must be detached");
  if (value.clean !== true) fail("checkout tracked source must be clean");
  if (value.tracked_symlinks_contained !== true) fail("tracked symlink path must remain contained");
  if (value.hardlink_count !== 0) fail("tracked source hardlink is forbidden");
  digest(value.source_snapshot_pre_digest, "source_snapshot_pre_digest");
  digest(value.source_snapshot_post_digest, "source_snapshot_post_digest");
  digest(value.builder_input_digest, "builder_input_digest");
  if (value.source_snapshot_pre_digest !== value.source_snapshot_post_digest) {
    fail("source drifted during candidate build");
  }
  return value;
}

/** @param {any} options */
export function validateCandidateBuilderAuthority({
  currentHead, releaseSha, builderAuthoritySha = releaseSha, trackedStatus, sourceManifestDigest,
  verifiedSourceManifestDigest, entries, expectedBuilderEntries = null,
  builderEntries = null, expectedBuilderInputDigest = null,
} = /** @type {any} */ ({})) {
  sha(currentHead, "candidate builder HEAD");
  sha(releaseSha, "candidate builder release SHA");
  sha(builderAuthoritySha, "candidate builder authority SHA");
  if (currentHead !== builderAuthoritySha) fail("candidate builder HEAD is not the exact current master Git authority");
  if (trackedStatus !== "") fail("candidate builder/config/toolchain lock worktree is dirty");
  digest(sourceManifestDigest, "candidate builder source manifest digest");
  digest(verifiedSourceManifestDigest, "candidate builder verified source manifest digest");
  if (sourceManifestDigest !== verifiedSourceManifestDigest) fail("candidate builder source authority drifted");
  if (builderEntries !== null) {
    if (!Array.isArray(builderEntries) || builderEntries.length === 0) {
      fail("candidate builder immutable module graph is empty");
    }
    digest(expectedBuilderInputDigest, "verified bootstrap builder input digest");
    const authority = builderEntries.map((entry, index) => {
      exactObject(entry, `verified bootstrap builder entry ${index}`, [
        "blob_oid", "git_mode", "path", "sha256",
      ]);
      sha(entry.blob_oid, `verified bootstrap builder entry ${index} blob_oid`);
      if (!["100644", "100755"].includes(entry.git_mode)) {
        fail(`verified bootstrap builder entry ${index} git_mode is invalid`);
      }
      assertSafeRelativeGitPath(entry.path);
      digest(entry.sha256, `verified bootstrap builder entry ${entry.path}`);
      return entry;
    });
    const paths = authority.map((entry) => entry.path);
    if (new Set(paths).size !== paths.length
      || JSON.stringify(paths) !== JSON.stringify([...paths].sort((left, right) => left.localeCompare(right)))) {
      fail("candidate builder immutable module graph paths must be unique and sorted");
    }
    const builderInputDigest = sha256Bytes(Buffer.from(JSON.stringify(authority)));
    if (builderInputDigest !== expectedBuilderInputDigest) {
      fail("candidate builder immutable module graph digest differs from verified bootstrap authority");
    }
    return Object.freeze({ builder_input_digest: builderInputDigest });
  }
  const requiredPaths = expectedBuilderEntries?.map((entry) => entry.path) ?? [
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
    if (expectedBuilderEntries) {
      const expected = expectedBuilderEntries.find((value) => value.path === path);
      exactObject(expected, `verified bootstrap builder entry ${path}`, [
        "blob_oid", "git_mode", "path", "sha256",
      ]);
      if (
        entry.blob_oid !== expected.blob_oid
        || entry.git_mode !== expected.git_mode
        || entry.sha256 !== expected.sha256
      ) fail(`candidate builder Git blob authority differs for ${path}`);
      return expected;
    }
    return { path, sha256: entry.sha256 };
  });
  const builderInputDigest = expectedBuilderEntries
    ? sha256Bytes(Buffer.from(JSON.stringify(authority)))
    : sha256Jcs(authority);
  return Object.freeze({ builder_input_digest: builderInputDigest });
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
    summary.total !== summary.success + summary.intended_skip
    || summary.success < EXPECTED_RELEASE_CONTEXTS.length
    || ["bad", "cancelled", "failed", "pending", "queued", "rerun"].some((key) => summary[key] !== 0)
  ) {
    fail("canonical current-head CI summary must preserve all required successes, allow only intended skips, and contain no pending, failed, cancelled, neutral, or rerun result");
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

function generatedBuildInventoryDigest(value) {
  const generated = value.filter((entry) => entry.source_kind === "generated_build");
  if (generated.length === 0) fail("generated build inventory must be nonempty");
  for (const prefix of [".next/", "node_modules/"]) {
    if (!generated.some((entry) => entry.component === "app" && entry.path.startsWith(prefix))) {
      fail(`generated build inventory is missing sealed ${prefix.slice(0, -1)} output`);
    }
  }
  if (generated.some((entry) => entry.component !== "app"
    || !(entry.path.startsWith(".next/") || entry.path.startsWith("node_modules/")))) {
    fail("generated build inventory contains a non-canonical writable artifact path");
  }
  return sha256Jcs(generated);
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
  nullableDigest(value.selection_digest, "selection_digest");
  sha(value.release_sha, "release_sha");
  sha(value.release_tree, "release_tree");
  digest(value.ci_check_summary_digest, "ci_check_summary_digest");
  digest(value.ci_snapshot_digest, "ci_snapshot_digest");
  digest(value.ci_suite_run_set_digest, "ci_suite_run_set_digest");
  digest(value.builder_input_digest, "builder_input_digest");
  digest(value.source_manifest_digest, "source_manifest_digest");
  digest(value.compose_source_digest, "compose_source_digest");
  digest(value.sandbox_policy_digest, "sandbox_policy_digest");
  digest(value.generated_build_inventory_digest, "generated_build_inventory_digest");
  digest(value.pnpm_store_snapshot_inventory_digest, "pnpm_store_snapshot_inventory_digest");
  digest(value.pnpm_store_final_index_inventory_digest, "pnpm_store_final_index_inventory_digest");
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
  if (generatedBuildInventoryDigest(value.file_inventory) !== value.generated_build_inventory_digest) {
    fail("generated build inventory digest mismatch");
  }
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

export function materializeCandidateBuildWorkspace({ sourceRoot, sourceManifest, buildRoot }) {
  mkdirSync(buildRoot, { mode: 0o700 });
  for (const entry of sourceManifest.entries) {
    copyManifestEntry({ sourceRoot, destinationRoot: buildRoot, entry });
  }
  for (const name of [".next", "node_modules"]) {
    mkdirSync(join(buildRoot, name), { mode: 0o700 });
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
  for (const name of [".next", "node_modules"]) chmodSync(join(buildRoot, name), 0o700);
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

function physicalDirectoryEntry(path, stat) {
  return Object.freeze({
    path,
    type: "directory",
    mode: modeBits(stat.mode),
    uid: String(stat.uid),
    gid: String(stat.gid),
    nlink: String(stat.nlink),
    device: String(stat.dev),
    inode: String(stat.ino),
    size: String(stat.size),
    ctime_ns: String(stat.ctimeNs),
  });
}

function inventorySealedComponent(component, rootPath) {
  const root = realpathSync(rootPath);
  const inventory = [];
  const directories = [];
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
      if ((modeBits(stat.mode) & 0o222) !== 0) {
        fail(`sealed candidate directory remains writable: ${relativePath}`);
      }
      const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
      try {
        if (!samePnpmStoreIdentity(stat, fstatSync(fd, { bigint: true }))) {
          fail(`sealed directory identity drifted before read: ${relativePath}`);
        }
        directories.push(physicalDirectoryEntry(relativePath, stat));
        for (const name of readdirSync(path).sort()) {
          visit(join(path, name), relativePath === "." ? name : `${relativePath}/${name}`);
        }
        if (
          !samePnpmStoreIdentity(stat, fstatSync(fd, { bigint: true }))
          || !samePnpmStoreIdentity(stat, lstatSync(path, { bigint: true }))
        ) fail(`sealed directory identity drifted during read: ${relativePath}`);
      } finally {
        closeSync(fd);
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
  visit(root, ".");
  return Object.freeze({ entries: inventory, directories });
}

function inventoryStableSealedComponent(component, rootPath, expectedInventory) {
  const root = realpathSync(rootPath);
  const expectedEntries = expectedInventory
    .filter((entry) => entry.component === component)
    .sort((left, right) => left.path.localeCompare(right.path));
  const expectedByPath = new Map(expectedEntries.map((entry) => [entry.path, entry]));
  const inventory = [];
  const directories = [];
  const sameIdentity = (left, right) => [
    "dev", "ino", "mode", "uid", "gid", "nlink", "size", "ctimeNs",
  ].every((key) => left[key] === right[key]);
  const currentEntry = (expected, stat) => ({
    ...expected,
    mode: modeBits(stat.mode),
    uid: String(stat.uid),
    gid: String(stat.gid),
    nlink: String(stat.nlink),
    device: String(stat.dev),
    inode: String(stat.ino),
    size: String(stat.size),
    ctime: new Date(Number(stat.ctimeMs)).toISOString(),
  });
  const visit = (path, relativePath) => {
    const before = lstatSync(path, { bigint: true });
    if (before.uid !== BigInt(process.getuid?.())) fail(`sealed entry owner is unsafe: ${relativePath}`);
    if (before.isDirectory()) {
      if ((modeBits(before.mode) & 0o222) !== 0) fail(`sealed candidate directory remains writable: ${relativePath}`);
      const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
      try {
        if (!sameIdentity(before, fstatSync(fd, { bigint: true }))) {
          fail(`sealed directory identity drifted before stable verification: ${relativePath}`);
        }
        directories.push(physicalDirectoryEntry(relativePath, before));
        for (const name of readdirSync(path).sort()) {
          visit(join(path, name), relativePath === "." ? name : `${relativePath}/${name}`);
        }
        if (
          !sameIdentity(before, fstatSync(fd, { bigint: true }))
          || !sameIdentity(before, lstatSync(path, { bigint: true }))
        ) fail(`sealed directory identity drifted during stable verification: ${relativePath}`);
      } finally {
        closeSync(fd);
      }
      return;
    }
    const expected = expectedByPath.get(relativePath);
    if (!expected) fail(`sealed candidate contains an unexpected entry: ${relativePath}`);
    if (before.isSymbolicLink()) {
      if (expected.type !== "symlink" || before.nlink !== 1n) {
        fail(`sealed symlink physical identity is unsafe: ${relativePath}`);
      }
      const target = realpathSync(path);
      assertPathContained(root, target, `sealed symlink ${relativePath}`);
      if (readlinkSync(path) !== expected.symlink_target) {
        fail(`sealed symlink target drifted during stable verification: ${relativePath}`);
      }
      if (!sameIdentity(before, lstatSync(path, { bigint: true }))) {
        fail(`sealed symlink identity drifted during stable verification: ${relativePath}`);
      }
      inventory.push(currentEntry(expected, before));
      return;
    }
    if (
      expected.type !== "file" || !before.isFile() || before.nlink !== 1n
      || (modeBits(before.mode) & 0o222) !== 0
    ) fail(`sealed file physical identity is unsafe: ${relativePath}`);
    const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    try {
      if (!sameIdentity(before, fstatSync(fd, { bigint: true }))) {
        fail(`sealed file identity drifted before stable verification: ${relativePath}`);
      }
      if (
        !sameIdentity(before, fstatSync(fd, { bigint: true }))
        || !sameIdentity(before, lstatSync(path, { bigint: true }))
      ) fail(`sealed file identity drifted during stable verification: ${relativePath}`);
    } finally {
      closeSync(fd);
    }
    inventory.push(currentEntry(expected, before));
  };
  visit(root, ".");
  inventory.sort((left, right) => left.path.localeCompare(right.path));
  if (
    canonicalizeJcs(inventory.map((entry) => entry.path))
    !== canonicalizeJcs(expectedEntries.map((entry) => entry.path))
  ) fail(`sealed ${component} physical inventory is incomplete`);
  return Object.freeze({ entries: inventory, directories });
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
    const { entries } = inventorySealedComponent(component, destination);
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
    "sandbox_policy_digest", "generated_build_inventory_digest", "pnpm_store_snapshot_inventory_digest",
    "pnpm_store_final_index_inventory_digest",
    "sealed_bundle_digest", "source_manifest_digest",
    "source_snapshot_digest", "compose_source_digest", "toolchain", "toolchain_lock_digest",
    "build_tools", "builder_input_digest",
    "repository", "source_ref", "selection_digest",
  ]);
  if (input.repository !== REPOSITORY || input.source_ref !== SOURCE_REF) {
    fail("bundle authority repository or source_ref is invalid");
  }
  nullableDigest(input.selection_digest, "bundle authority selection_digest");
  validateArtifacts(input.artifacts);
  string(input.build_id, "bundle authority build_id");
  for (const field of [
    "ci_check_summary_digest", "ci_snapshot_digest", "ci_suite_run_set_digest",
    "sandbox_policy_digest", "generated_build_inventory_digest", "pnpm_store_snapshot_inventory_digest",
    "pnpm_store_final_index_inventory_digest",
    "sealed_bundle_digest", "source_manifest_digest",
    "source_snapshot_digest", "compose_source_digest", "toolchain_lock_digest", "builder_input_digest",
  ]) digest(input[field], `bundle authority ${field}`);
  validateEnvironmentMetadata(input.environment_snapshot);
  validateFileInventory(input.file_inventory);
  if (generatedBuildInventoryDigest(input.file_inventory) !== input.generated_build_inventory_digest) {
    fail("bundle authority generated build inventory digest mismatch");
  }
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

/**
 * @param {{runRoot:string,buildRoot:string,nodeModulesRoot:string,nextRoot:string,privateHome:string,privateTmp:string,currentUid?:number}} options
 * @param {(authority:{writeRoots:string[]})=>unknown|Promise<unknown>} callback
 */
export async function withCandidateBuildWorkAuthority({
  runRoot, buildRoot, nodeModulesRoot, nextRoot, privateHome, privateTmp,
  currentUid = process.getuid?.(),
} = /** @type {any} */ ({}), callback) {
  if (!Number.isInteger(currentUid) || currentUid < 0) fail("current uid is unavailable");
  if (typeof callback !== "function") fail("candidate build-work authority callback is required");
  const expectedPaths = {
    runRoot: resolve(runRoot ?? ""),
    buildRoot: join(resolve(runRoot ?? ""), "build-work"),
    nodeModulesRoot: join(resolve(runRoot ?? ""), "build-work", "node_modules"),
    nextRoot: join(resolve(runRoot ?? ""), "build-work", ".next"),
    privateHome: join(resolve(runRoot ?? ""), "build-home"),
    privateTmp: join(resolve(runRoot ?? ""), "tmp"),
  };
  const suppliedPaths = { runRoot, buildRoot, nodeModulesRoot, nextRoot, privateHome, privateTmp };
  for (const [role, path] of Object.entries(suppliedPaths)) {
    if (!isAbsolute(path ?? "") || resolve(path) !== path || expectedPaths[role] !== path) {
      fail(`candidate build-work ${role} path must be exact, canonical, and run-owned`);
    }
  }

  const strictRoles = new Map([
    [dirname(runRoot), 0o700],
    [runRoot, 0o700],
    [buildRoot, 0o500],
  ]);
  const writableRoles = new Map([
    [nodeModulesRoot, 0o700],
    [nextRoot, 0o700],
    [privateHome, 0o700],
    [privateTmp, 0o700],
  ]);
  const identityKeys = ["dev", "ino", "mode", "uid", "gid", "nlink", "size", "ctimeNs", "mtimeNs"];
  const writableIdentityKeys = ["dev", "ino", "mode", "uid", "gid"];
  const sameIdentity = (left, right, keys) => keys.every((key) => left[key] === right[key]);
  const snapshots = [];
  const fds = [];
  const openDirectory = (path, expectedMode, mutable) => {
    const stat = lstatSync(path, { bigint: true });
    if (
      stat.isSymbolicLink() || !stat.isDirectory() || stat.uid !== BigInt(currentUid)
      || modeBits(stat.mode) !== expectedMode || realpathSync(path) !== path
    ) fail("candidate build-work directory owner, mode, type, or canonical path is unsafe");
    const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
    if (!sameIdentity(stat, fstatSync(fd, { bigint: true }), identityKeys)) {
      closeSync(fd);
      fail("candidate build-work directory identity drifted before execution");
    }
    snapshots.push({ fd, path, stat, mutable });
    fds.push(fd);
  };
  for (const [path, mode] of strictRoles) openDirectory(path, mode, path === runRoot);
  for (const [path, mode] of writableRoles) openDirectory(path, mode, true);

  for (const root of [nodeModulesRoot, nextRoot, privateHome, privateTmp]) {
    const children = readdirSync(root);
    for (const name of children) {
      const stat = lstatSync(join(root, name), { bigint: true });
      if (stat.isFile() && stat.nlink !== 1n) fail("candidate generated build root contains a hard-link escape");
    }
    if (children.length !== 0) fail("candidate generated build roots must begin empty");
  }

  const authorityDigest = sha256Jcs({
    schema: "homecook.release-rehearsal-build-work-authority.v1",
    directories: snapshots.map(({ path, stat, mutable }) => ({
      path_digest: sha256Jcs(path),
      mutable,
      device: String(stat.dev),
      inode: String(stat.ino),
      mode: modeBits(stat.mode),
      uid: String(stat.uid),
    })),
  });

  let value;
  let callbackError;
  try {
    value = await callback({
      writeRoots: [nodeModulesRoot, nextRoot, privateHome, privateTmp],
    });
  } catch (error) {
    callbackError = error;
  }
  let identityError;
  try {
    for (const { fd, path, stat, mutable } of snapshots) {
      const pathPost = lstatSync(path, { bigint: true });
      const fdPost = fstatSync(fd, { bigint: true });
      const keys = mutable ? writableIdentityKeys : identityKeys;
      if (
        pathPost.isSymbolicLink() || !pathPost.isDirectory() || realpathSync(path) !== path
        || !sameIdentity(stat, pathPost, keys) || !sameIdentity(stat, fdPost, keys)
      ) fail("candidate build-work directory identity or parent drifted during execution");
    }
  } catch (error) {
    identityError = error;
  } finally {
    for (const fd of fds.reverse()) closeSync(fd);
  }
  if (identityError) throw identityError;
  if (callbackError) throw callbackError;
  return Object.freeze({ authority_digest: authorityDigest, value });
}

const NEXT_ENTRYPOINT_IDENTITY_KEYS = [
  "dev", "ino", "mode", "uid", "gid", "nlink", "size", "ctimeNs", "mtimeNs",
];
const NEXT_ENTRYPOINT_MAX_BYTES = 1024 * 1024;
const NEXT_PNPM_PACKAGE_SEGMENT_PATTERN =
  /^next@15\.5\.21(?:_[A-Za-z0-9._+@-]+)?$/u;

function sameNextEntrypointIdentity(left, right) {
  return NEXT_ENTRYPOINT_IDENTITY_KEYS.every((key) => left[key] === right[key]);
}

function readExactFdBytes(fd, size, label) {
  if (size < 0n || size > BigInt(NEXT_ENTRYPOINT_MAX_BYTES)) {
    fail(`${label} size is outside the bounded authority`);
  }
  const bytes = Buffer.alloc(Number(size));
  let offset = 0;
  while (offset < bytes.length) {
    const read = readSync(fd, bytes, offset, bytes.length - offset, offset);
    if (read <= 0) fail(`${label} ended before its declared size`);
    offset += read;
  }
  return bytes;
}

/**
 * Hold the pnpm-created Next package link, its lexical target chain, and the
 * exact package/entrypoint bytes stable while the candidate builder uses them.
 *
 * @param {{buildRoot:string,currentUid?:number}} options
 * @param {(authority:{entrypointPath:string,entrypointTarget:string,packageJsonTarget:string,verifyBeforeSpawn:()=>void})=>unknown|Promise<unknown>} callback
 */
async function holdCandidateNextEntrypointAuthority({
  buildRoot,
  currentUid = process.getuid?.(),
} = /** @type {any} */ ({}), callback) {
  if (!Number.isInteger(currentUid) || currentUid < 0) fail("current uid is unavailable");
  if (typeof callback !== "function") fail("Next.js entrypoint authority callback is required");
  if (!isAbsolute(buildRoot ?? "") || resolve(buildRoot) !== buildRoot || basename(buildRoot) !== "build-work") {
    fail("Next.js entrypoint build-work path must be exact and canonical");
  }

  const uid = BigInt(currentUid);
  const nodeModulesRoot = join(buildRoot, "node_modules");
  const pnpmRoot = join(nodeModulesRoot, ".pnpm");
  const packageLink = join(nodeModulesRoot, "next");
  const linkBefore = lstatSync(packageLink, { bigint: true });
  if (!linkBefore.isSymbolicLink() || linkBefore.uid !== uid || linkBefore.nlink !== 1n) {
    fail("Next.js package authority must be the expected candidate-owned pnpm symlink");
  }
  const linkTarget = readlinkSync(packageLink);
  const targetSegments = linkTarget.split("/");
  if (
    isAbsolute(linkTarget)
    || targetSegments.length !== 4
    || targetSegments[0] !== ".pnpm"
    || !NEXT_PNPM_PACKAGE_SEGMENT_PATTERN.test(targetSegments[1])
    || targetSegments[2] !== "node_modules"
    || targetSegments[3] !== "next"
    || targetSegments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) fail("Next.js package symlink target is outside the closed pnpm lexical grammar");

  const packageRoot = join(nodeModulesRoot, ...targetSegments);
  const packageRelative = relative(pnpmRoot, packageRoot);
  if (packageRelative === "" || packageRelative.startsWith("..") || isAbsolute(packageRelative)) {
    fail("Next.js package symlink target must stay strictly inside candidate node_modules/.pnpm");
  }
  if (realpathSync(packageLink) !== packageRoot) {
    fail("Next.js package symlink realpath does not match its candidate-private pnpm target");
  }

  const directoryPaths = [
    buildRoot,
    nodeModulesRoot,
    pnpmRoot,
    ...targetSegments.slice(1).reduce((paths, segment) => {
      paths.push(join(paths.at(-1), segment));
      return paths;
    }, [pnpmRoot]),
    join(packageRoot, "dist"),
    join(packageRoot, "dist", "bin"),
  ];
  const uniqueDirectoryPaths = [...new Set(directoryPaths)];
  const directorySnapshots = [];
  const fds = [];
  const openDirectory = (path) => {
    const before = lstatSync(path, { bigint: true });
    if (
      before.isSymbolicLink() || !before.isDirectory() || before.uid !== uid
      || (modeBits(before.mode) & 0o022) !== 0 || realpathSync(path) !== path
    ) fail("Next.js package target chain contains an unsafe directory");
    const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
    if (!sameNextEntrypointIdentity(before, fstatSync(fd, { bigint: true }))) {
      closeSync(fd);
      fail("Next.js package target directory drifted before verification");
    }
    directorySnapshots.push({ fd, path, before });
    fds.push(fd);
  };

  const openRegularFile = (path, label) => {
    const before = lstatSync(path, { bigint: true });
    if (
      before.isSymbolicLink() || !before.isFile() || before.uid !== uid || before.nlink !== 1n
      || (modeBits(before.mode) & 0o022) !== 0 || realpathSync(path) !== path
    ) fail(`${label} target identity is unsafe`);
    const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    if (!sameNextEntrypointIdentity(before, fstatSync(fd, { bigint: true }))) {
      closeSync(fd);
      fail(`${label} target drifted before verification`);
    }
    const bytes = readExactFdBytes(fd, before.size, label);
    if (
      !sameNextEntrypointIdentity(before, fstatSync(fd, { bigint: true }))
      || !sameNextEntrypointIdentity(before, lstatSync(path, { bigint: true }))
    ) {
      closeSync(fd);
      fail(`${label} target drifted during verification`);
    }
    fds.push(fd);
    return { fd, path, before, bytes, sha256: sha256Bytes(bytes) };
  };

  let packageSnapshot;
  let entrypointSnapshot;
  try {
    for (const path of uniqueDirectoryPaths) openDirectory(path);
    const packageJsonTarget = join(packageRoot, "package.json");
    const entrypointTarget = join(packageRoot, "dist", "bin", "next");
    packageSnapshot = openRegularFile(packageJsonTarget, "Next.js package.json");
    entrypointSnapshot = openRegularFile(entrypointTarget, "Next.js build entrypoint");
    let packageJson;
    try {
      packageJson = JSON.parse(decodeFatalUtf8(packageSnapshot.bytes, "Next.js package.json"));
    } catch {
      fail("Next.js package.json bytes are invalid");
    }
    if (packageJson?.name !== "next" || packageJson?.version !== "15.5.21") {
      fail("Next.js package identity does not match the pinned release toolchain");
    }

    const entrypointPath = join(packageLink, "dist", "bin", "next");
    if (realpathSync(entrypointPath) !== entrypointTarget) {
      fail("Next.js build entrypoint does not resolve to the verified pnpm package target");
    }
    const verifyStable = () => {
      const linkPost = lstatSync(packageLink, { bigint: true });
      if (
        !sameNextEntrypointIdentity(linkBefore, linkPost)
        || !linkPost.isSymbolicLink()
        || readlinkSync(packageLink) !== linkTarget
        || realpathSync(packageLink) !== packageRoot
        || realpathSync(entrypointPath) !== entrypointTarget
      ) fail("Next.js package symlink changed during verification");
      for (const { fd, path, before } of directorySnapshots) {
        if (
          !sameNextEntrypointIdentity(before, fstatSync(fd, { bigint: true }))
          || !sameNextEntrypointIdentity(before, lstatSync(path, { bigint: true }))
          || realpathSync(path) !== path
        ) fail("Next.js package target directory changed during verification");
      }
      for (const snapshot of [packageSnapshot, entrypointSnapshot]) {
        if (
          !sameNextEntrypointIdentity(snapshot.before, fstatSync(snapshot.fd, { bigint: true }))
          || !sameNextEntrypointIdentity(snapshot.before, lstatSync(snapshot.path, { bigint: true }))
          || sha256Bytes(readExactFdBytes(snapshot.fd, snapshot.before.size, "Next.js authority file")) !== snapshot.sha256
        ) fail("Next.js package or entrypoint changed during verification");
      }
    };
    verifyStable();
    let preSpawnVerificationCount = 0;
    const verifyBeforeSpawn = () => {
      verifyStable();
      preSpawnVerificationCount += 1;
    };
    let value;
    let callbackError;
    let callbackFailed = false;
    try {
      value = await callback(Object.freeze({
        entrypointPath,
        entrypointTarget,
        packageJsonTarget,
        verifyBeforeSpawn,
      }));
    } catch (error) {
      callbackError = error;
      callbackFailed = true;
    }
    let postVerificationError;
    try {
      if (
        preSpawnVerificationCount > 1
        || (!callbackFailed && preSpawnVerificationCount !== 1)
      ) fail("Next.js entrypoint pre-spawn authority guard must run exactly once");
      verifyStable();
    } catch (error) {
      postVerificationError = error;
    }
    if (postVerificationError) throw postVerificationError;
    if (callbackFailed) throw callbackError;
    const inventoryBinding = Object.freeze({
      package_link_path: "node_modules/next",
      package_link_target: linkTarget,
      package_json_path: relative(buildRoot, packageJsonTarget),
      package_json_sha256: packageSnapshot.sha256,
      entrypoint_path: relative(buildRoot, entrypointTarget),
      entrypoint_sha256: entrypointSnapshot.sha256,
    });
    return Object.freeze({
      authority_digest: sha256Jcs({
        schema: "homecook.release-rehearsal-next-entrypoint-authority.v1",
        ...inventoryBinding,
      }),
      inventory_binding: inventoryBinding,
      value,
    });
  } finally {
    for (const fd of fds.reverse()) closeSync(fd);
  }
}

export async function withCandidateNextEntrypointAuthority(options, callback) {
  try {
    return await holdCandidateNextEntrypointAuthority(options, callback);
  } catch (error) {
    if (
      error instanceof Error
      && error.message.startsWith("Release rehearsal candidate rejected:")
    ) throw error;
    fail("Next.js entrypoint authority could not be verified");
  }
}

export function validateCandidateNextEntrypointInventoryBinding(binding, fileInventory) {
  exactObject(binding, "Next.js generated inventory binding", [
    "package_link_path", "package_link_target", "package_json_path", "package_json_sha256",
    "entrypoint_path", "entrypoint_sha256",
  ]);
  if (binding.package_link_path !== "node_modules/next") {
    fail("Next.js generated inventory binding has an unexpected package link path");
  }
  const targetSegments = string(
    binding.package_link_target,
    "Next.js generated inventory package link target",
  ).split("/");
  if (
    targetSegments.length !== 4
    || targetSegments[0] !== ".pnpm"
    || !NEXT_PNPM_PACKAGE_SEGMENT_PATTERN.test(targetSegments[1])
    || targetSegments[2] !== "node_modules"
    || targetSegments[3] !== "next"
    || targetSegments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) fail("Next.js generated inventory package link target is unsafe");
  const packageRootPath = `node_modules/${binding.package_link_target}`;
  if (
    binding.package_json_path !== `${packageRootPath}/package.json`
    || binding.entrypoint_path !== `${packageRootPath}/dist/bin/next`
  ) fail("Next.js generated inventory binding paths do not match the pnpm package target");
  digest(binding.package_json_sha256, "Next.js generated inventory package.json digest");
  digest(binding.entrypoint_sha256, "Next.js generated inventory entrypoint digest");
  if (!Array.isArray(fileInventory)) fail("Next.js generated file inventory is required");

  const exactEntry = (path, label) => {
    const matches = fileInventory.filter((entry) =>
      entry?.component === "app"
      && entry?.source_kind === "generated_build"
      && entry?.path === path);
    if (matches.length !== 1) fail(`Next.js ${label} inventory entry must exist exactly once`);
    return matches[0];
  };
  const linkEntry = exactEntry(binding.package_link_path, "package link");
  if (
    linkEntry.type !== "symlink"
    || linkEntry.symlink_target !== binding.package_link_target
    || linkEntry.sha256 !== sha256Bytes(Buffer.from(binding.package_link_target, "utf8"))
    || linkEntry.nlink !== "1"
  ) fail("Next.js package link inventory identity is invalid");

  const assertBoundFile = (path, expectedDigest, label) => {
    const entry = exactEntry(path, label);
    if (
      entry.type !== "file"
      || entry.symlink_target !== null
      || entry.dereferenced_sha256 !== null
      || entry.sha256 !== expectedDigest
      || entry.nlink !== "1"
      || !Number.isSafeInteger(entry.mode)
      || (entry.mode & 0o222) !== 0
      || entry.uid !== String(process.getuid?.())
    ) fail(`Next.js ${label} inventory bytes, type, owner, hard-link, or mode are invalid`);
  };
  assertBoundFile(
    binding.package_json_path,
    binding.package_json_sha256,
    "package.json",
  );
  assertBoundFile(
    binding.entrypoint_path,
    binding.entrypoint_sha256,
    "entrypoint",
  );
  return Object.freeze({ ...binding });
}

const PNPM_STORE_IDENTITY_KEYS = [
  "dev", "ino", "mode", "uid", "gid", "nlink", "size", "ctimeNs", "mtimeNs",
];

function samePnpmStoreIdentity(left, right) {
  return PNPM_STORE_IDENTITY_KEYS.every((key) => left[key] === right[key]);
}

function pnpmStoreInventory(root, currentUid, {
  requireSealed = false,
  verifyCafsContent = false,
  afterFileOpen = null,
  allowedRootChildren = ["files", "index"],
} = {}) {
  if (
    !Array.isArray(allowedRootChildren)
    || allowedRootChildren.some((name) => typeof name !== "string" || name.length === 0 || name.includes("/"))
    || new Set(allowedRootChildren).size !== allowedRootChildren.length
  ) fail("pnpm store allowed root children are invalid");
  const expectedRootChildren = [...allowedRootChildren].sort();
  const rootBefore = lstatSync(root, { bigint: true });
  const rootMode = modeBits(rootBefore.mode);
  if (
    rootBefore.isSymbolicLink() || !rootBefore.isDirectory()
    || rootBefore.uid !== BigInt(currentUid) || realpathSync(root) !== root
    || (!requireSealed && (rootMode & 0o022) !== 0)
    || (requireSealed && rootMode !== 0o500)
  ) fail("pnpm store root owner, mode, type, or canonical path is unsafe");
  const rootFd = openSync(root, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
  if (!samePnpmStoreIdentity(rootBefore, fstatSync(rootFd, { bigint: true }))) {
    closeSync(rootFd);
    fail("pnpm store root identity drifted before inventory");
  }
  const entries = [];
  const visit = (path, relativePath) => {
    const before = lstatSync(path, { bigint: true });
    const mode = modeBits(before.mode);
    if (
      before.isSymbolicLink() || before.uid !== BigInt(currentUid)
      || realpathSync(path) !== path || (!requireSealed && (mode & 0o022) !== 0)
      || (requireSealed && (mode & 0o222) !== 0)
    ) fail("pnpm store inventory owner, mode, type, or canonical path is unsafe");
    if (before.isDirectory()) {
      if (requireSealed && mode !== 0o500) fail("private pnpm store directory is not sealed");
      const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
      try {
        if (!samePnpmStoreIdentity(before, fstatSync(fd, { bigint: true }))) {
          fail("pnpm store directory identity drifted during inventory");
        }
        entries.push({
          path: relativePath,
          type: "directory",
          mode,
          uid: String(before.uid),
          gid: String(before.gid),
          nlink: String(before.nlink),
          device: String(before.dev),
          inode: String(before.ino),
          size: String(before.size),
          ctime_ns: String(before.ctimeNs),
          mtime_ns: String(before.mtimeNs),
          content_identity: null,
        });
        for (const name of readdirSync(path).sort()) {
          visit(join(path, name), relativePath ? `${relativePath}/${name}` : name);
        }
        if (!samePnpmStoreIdentity(before, lstatSync(path, { bigint: true }))) {
          fail("pnpm store directory identity drifted during inventory");
        }
      } finally {
        closeSync(fd);
      }
      return;
    }
    if (!before.isFile() || before.nlink !== 1n) {
      fail("pnpm store inventory requires regular nlink1 files");
    }
    const executable = (mode & 0o111) !== 0;
    if (requireSealed && mode !== (executable ? 0o500 : 0o400)) {
      fail("private pnpm store file is not canonically sealed");
    }
    let contentIdentity;
    const cafsMatch = /^files\/([0-9a-f]{2})\/([0-9a-f]{126})(-exec)?$/u.exec(relativePath);
    if (relativePath.startsWith("files/")) {
      if (!cafsMatch || executable !== Boolean(cafsMatch[3])) {
        fail("pnpm CAFS path or executable identity is invalid");
      }
      const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
      try {
        if (!samePnpmStoreIdentity(before, fstatSync(fd, { bigint: true }))) {
          fail("pnpm CAFS file identity drifted before verification");
        }
        afterFileOpen?.({ path, relativePath, contentVerified: verifyCafsContent });
        if (verifyCafsContent) {
          const actualIntegrity = createHash("sha512").update(readFileSync(fd)).digest("hex");
          if (actualIntegrity !== `${cafsMatch[1]}${cafsMatch[2]}`) {
            fail("pnpm CAFS content differs from its content-addressed path");
          }
        }
        if (
          !samePnpmStoreIdentity(before, fstatSync(fd, { bigint: true }))
          || !samePnpmStoreIdentity(before, lstatSync(path, { bigint: true }))
        ) fail("pnpm CAFS file identity drifted during verification");
      } finally {
        closeSync(fd);
      }
      contentIdentity = `sha512:${cafsMatch[1]}${cafsMatch[2]}${cafsMatch[3] ?? ""}`;
    } else if (relativePath.startsWith("index/")) {
      const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
      try {
        if (!samePnpmStoreIdentity(before, fstatSync(fd, { bigint: true }))) {
          fail("pnpm store index file identity drifted before read");
        }
        afterFileOpen?.({ path, relativePath, contentVerified: true });
        contentIdentity = `sha256:${sha256Bytes(readFileSync(fd))}`;
        if (
          !samePnpmStoreIdentity(before, fstatSync(fd, { bigint: true }))
          || !samePnpmStoreIdentity(before, lstatSync(path, { bigint: true }))
        ) fail("pnpm store index file identity drifted during read");
      } finally {
        closeSync(fd);
      }
    } else {
      fail("pnpm store inventory contains an unexpected root");
    }
    entries.push({
      path: relativePath,
      type: "file",
      mode,
      uid: String(before.uid),
      gid: String(before.gid),
      nlink: String(before.nlink),
      device: String(before.dev),
      inode: String(before.ino),
      size: String(before.size),
      ctime_ns: String(before.ctimeNs),
      mtime_ns: String(before.mtimeNs),
      content_identity: contentIdentity,
    });
  };
  try {
    if (canonicalizeJcs(readdirSync(root).sort()) !== canonicalizeJcs(expectedRootChildren)) {
      fail("pnpm store root contains unexpected children");
    }
    for (const name of ["files", "index"]) visit(join(root, name), name);
    if (
      canonicalizeJcs(readdirSync(root).sort()) !== canonicalizeJcs(expectedRootChildren)
      || !samePnpmStoreIdentity(rootBefore, lstatSync(root, { bigint: true }))
      || !samePnpmStoreIdentity(rootBefore, fstatSync(rootFd, { bigint: true }))
    ) fail("pnpm store root identity or children drifted during inventory");
  } finally {
    closeSync(rootFd);
  }
  const contentEntries = entries.map(({ path, type, size, content_identity: contentIdentity }) => ({
    path,
    type,
    size: type === "file" ? size : null,
    content_identity: contentIdentity,
  }));
  const portableEntries = entries.map(({ path, type, mode, size, content_identity: contentIdentity }) => ({
    path,
    type,
    mode,
    size: type === "file" ? size : null,
    content_identity: contentIdentity,
  }));
  return Object.freeze({
    entries,
    content_digest: sha256Jcs({
      schema: "homecook.release-rehearsal-pnpm-store-content-inventory.v1",
      entries: contentEntries,
    }),
    inventory_digest: sha256Jcs({
      schema: "homecook.release-rehearsal-pnpm-store-snapshot-inventory.v1",
      entries: portableEntries,
    }),
    identity_digest: sha256Jcs({
      schema: "homecook.release-rehearsal-pnpm-store-physical-identity.v2",
      root_identity: physicalDirectoryEntry(".", rootBefore),
      entries,
    }),
  });
}

function pnpmStoreSubtreeAuthority(inventory, subtree) {
  const entries = inventory.entries.filter((entry) => (
    entry.path === subtree || entry.path.startsWith(`${subtree}/`)
  ));
  if (entries.length === 0 || entries[0]?.path !== subtree || entries[0]?.type !== "directory") {
    fail(`pnpm store ${subtree} subtree authority is incomplete`);
  }
  const portableEntries = entries.map(({ path, type, mode, size, content_identity: contentIdentity }) => ({
    path,
    type,
    mode,
    size: type === "file" ? size : null,
    content_identity: contentIdentity,
  }));
  return Object.freeze({
    inventory_digest: sha256Jcs({
      schema: `homecook.release-rehearsal-pnpm-store-${subtree}-inventory.v1`,
      entries: portableEntries,
    }),
    physical_identity_digest: sha256Jcs({
      schema: `homecook.release-rehearsal-pnpm-store-${subtree}-physical-identity.v1`,
      entries,
    }),
  });
}

function clonePnpmStoreSnapshot(sourceStore, storePath, sourceInventory) {
  const sourceEntries = new Map(sourceInventory.entries.map((entry) => [entry.path, entry]));
  const cloneEntry = (source, destination, relativePath) => {
    const expected = sourceEntries.get(relativePath);
    const before = lstatSync(source, { bigint: true });
    if (
      !expected || before.isSymbolicLink() || realpathSync(source) !== source
      || String(before.dev) !== expected.device || String(before.ino) !== expected.inode
      || String(before.ctimeNs) !== expected.ctime_ns || String(before.mtimeNs) !== expected.mtime_ns
    ) fail("approved pnpm store source drifted before private snapshot copy");
    if (before.isDirectory()) {
      mkdirSync(destination, { mode: 0o700 });
      for (const name of readdirSync(source).sort()) {
        cloneEntry(join(source, name), join(destination, name), `${relativePath}/${name}`);
      }
      chmodSync(destination, 0o500);
      return;
    }
    copyFileSync(
      source,
      destination,
      fsConstants.COPYFILE_EXCL | fsConstants.COPYFILE_FICLONE,
    );
    const isIndex = relativePath.startsWith("index/");
    chmodSync(destination, relativePath.endsWith("-exec") ? (isIndex ? 0o500 : 0o700) : (isIndex ? 0o400 : 0o600));
    const copied = lstatSync(destination, { bigint: true });
    if (
      copied.isSymbolicLink() || !copied.isFile() || copied.nlink !== 1n
      || realpathSync(destination) !== destination || copied.size !== before.size
      || !samePnpmStoreIdentity(before, lstatSync(source, { bigint: true }))
    ) fail("private pnpm store clone or source identity drifted during copy");
  };
  mkdirSync(storePath, { mode: 0o700 });
  for (const name of ["files", "index"]) {
    cloneEntry(join(sourceStore, name), join(storePath, name), name);
  }
}

function setPnpmStoreTreeMode(root, { writable, label, currentUid }) {
  const visit = (path) => {
    const stat = lstatSync(path, { bigint: true });
    if (stat.isSymbolicLink()) fail(`private pnpm store ${label} contains a symlink while changing phase`);
    if (stat.uid !== BigInt(currentUid)) {
      fail(`private pnpm store ${label} owner changed while changing phase`);
    }
    if (stat.isDirectory()) {
      for (const name of readdirSync(path)) visit(join(path, name));
      chmodSync(path, writable ? 0o700 : 0o500);
      return;
    }
    if (!stat.isFile() || stat.nlink !== 1n) {
      fail(`private pnpm store ${label} contains an unsafe file while changing phase`);
    }
    const executable = (modeBits(stat.mode) & 0o111) !== 0;
    chmodSync(path, writable ? (executable ? 0o700 : 0o600) : (executable ? 0o500 : 0o400));
  };
  visit(root);
}

function sealPnpmStoreTreeFdBound(root, {
  inventory,
  subtree,
  currentUid,
  deferRootFchmod = false,
  transitionObserver = () => undefined,
}) {
  const expectedEntries = new Map(inventory.entries
    .filter((entry) => entry.path === subtree || entry.path.startsWith(`${subtree}/`))
    .map((entry) => [entry.path, entry]));
  const rootExpected = expectedEntries.get(subtree);
  if (!rootExpected || rootExpected.type !== "directory") {
    fail(`candidate pnpm ${subtree} FD-bound seal inventory is incomplete`);
  }
  const rootRelocated = !root.endsWith(`/v10/${subtree}`);
  const assertExpectedIdentity = (stat, expected, label, { allowRenameCtime = false } = {}) => {
    if (
      String(stat.dev) !== expected.device
      || String(stat.ino) !== expected.inode
      || modeBits(stat.mode) !== expected.mode
      || String(stat.uid) !== expected.uid
      || String(stat.gid) !== expected.gid
      || String(stat.nlink) !== expected.nlink
      || String(stat.size) !== expected.size
      || (!allowRenameCtime && String(stat.ctimeNs) !== expected.ctime_ns)
      || String(stat.mtimeNs) !== expected.mtime_ns
    ) fail(`candidate pnpm ${label} identity drifted before FD-bound seal`);
  };
  const expectedChildren = (relativePath) => {
    const prefix = `${relativePath}/`;
    return [...expectedEntries.keys()]
      .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
      .map((path) => path.slice(prefix.length))
      .sort();
  };
  const visit = (path, relativePath) => {
    const expected = expectedEntries.get(relativePath);
    if (!expected) fail(`candidate pnpm ${subtree} contains an unexpected seal entry`);
    const before = lstatSync(path, { bigint: true });
    if (before.isSymbolicLink() || before.uid !== BigInt(currentUid) || realpathSync(path) !== path) {
      fail(`candidate pnpm ${subtree} seal entry owner, symlink, or canonical path is unsafe`);
    }
    const allowRenameCtime = rootRelocated && relativePath === subtree;
    assertExpectedIdentity(before, expected, `${subtree} entry`, { allowRenameCtime });
    const directory = expected.type === "directory";
    if (directory !== before.isDirectory() || (!directory && (!before.isFile() || before.nlink !== 1n))) {
      fail(`candidate pnpm ${subtree} seal entry type or hard-link count is unsafe`);
    }
    const fd = openSync(
      path,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | (directory ? fsConstants.O_DIRECTORY : 0),
    );
    try {
      const opened = fstatSync(fd, { bigint: true });
      assertExpectedIdentity(opened, expected, `${subtree} opened entry`, { allowRenameCtime });
      if (directory) {
        const names = readdirSync(path).sort();
        if (canonicalizeJcs(names) !== canonicalizeJcs(expectedChildren(relativePath))) {
          fail(`candidate pnpm ${subtree} directory children drifted before FD-bound seal`);
        }
        for (const name of names) visit(join(path, name), `${relativePath}/${name}`);
        if (canonicalizeJcs(readdirSync(path).sort()) !== canonicalizeJcs(names)) {
          fail(`candidate pnpm ${subtree} directory children drifted during FD-bound seal`);
        }
      }
      transitionObserver(Object.freeze({
        phase: "before_entry_fchmod",
        path,
        relativePath,
        type: expected.type,
      }));
      if (deferRootFchmod && relativePath === subtree) return;
      const pathBeforeMode = lstatSync(path, { bigint: true });
      if (
        pathBeforeMode.isSymbolicLink()
        || pathBeforeMode.dev !== opened.dev
        || pathBeforeMode.ino !== opened.ino
        || fstatSync(fd, { bigint: true }).dev !== opened.dev
        || fstatSync(fd, { bigint: true }).ino !== opened.ino
      ) fail(`candidate pnpm ${subtree} entry path swapped before FD-bound chmod`);
      const executable = (expected.mode & 0o111) !== 0;
      const sealedMode = directory ? 0o500 : (executable ? 0o500 : 0o400);
      fchmodSync(fd, sealedMode);
      const fdPost = fstatSync(fd, { bigint: true });
      const pathPost = lstatSync(path, { bigint: true });
      if (
        pathPost.isSymbolicLink()
        || fdPost.dev !== opened.dev || fdPost.ino !== opened.ino
        || pathPost.dev !== opened.dev || pathPost.ino !== opened.ino
        || modeBits(fdPost.mode) !== sealedMode || modeBits(pathPost.mode) !== sealedMode
      ) fail(`candidate pnpm ${subtree} entry path swapped during FD-bound chmod`);
    } finally {
      closeSync(fd);
    }
  };
  visit(root, subtree);
}

function inventoryDeferredPnpmQuarantine(root, currentUid, { maxEntries = 100_000 } = {}) {
  const entries = [];
  const visit = (path, relativePath) => {
    if (entries.length >= maxEntries) fail("candidate pnpm deferred quarantine entry limit exceeded");
    const stat = lstatSync(path, { bigint: true });
    if (
      stat.uid !== BigInt(currentUid)
      || (!stat.isSymbolicLink() && realpathSync(path) !== path)
    ) fail("candidate pnpm deferred quarantine contains an unsafe entry");
    const type = stat.isSymbolicLink()
      ? "symlink"
      : (stat.isDirectory() ? "directory" : (stat.isFile() ? "file" : "unsupported"));
    if (type === "unsupported" || (["file", "symlink"].includes(type) && stat.nlink !== 1n)) {
      fail("candidate pnpm deferred quarantine type or hard-link count is unsafe");
    }
    entries.push({
      path: relativePath,
      type,
      device: String(stat.dev),
      inode: String(stat.ino),
      mode: modeBits(stat.mode),
      uid: String(stat.uid),
      gid: String(stat.gid),
      nlink: String(stat.nlink),
      size: String(stat.size),
      ctime_ns: String(stat.ctimeNs),
      mtime_ns: String(stat.mtimeNs),
      symlink_target: type === "symlink" ? readlinkSync(path) : null,
    });
    if (type === "directory") {
      for (const name of readdirSync(path).sort()) {
        visit(join(path, name), relativePath === "." ? name : `${relativePath}/${name}`);
      }
    }
  };
  visit(root, ".");
  return Object.freeze({
    entries: Object.freeze(entries),
    inventory_digest: sha256Jcs({
      schema: "homecook.release-rehearsal-pnpm-deferred-quarantine-inventory.v1",
      entries,
    }),
  });
}

const DEFERRED_QUARANTINE_CLEANUP_SCRIPT = String.raw`
import json, os, secrets, stat, sys

root_name = sys.argv[1]
expected_uid = int(sys.argv[2])
records = {entry["path"]: entry for entry in json.load(sys.stdin)["entries"]}
parent_fd = 3

def fail(message):
    raise RuntimeError(message)

def check(st, record, label):
    if (str(st.st_dev) != record["device"] or str(st.st_ino) != record["inode"] or
        stat.S_IMODE(st.st_mode) != record["mode"] or str(st.st_uid) != record["uid"] or
        str(st.st_gid) != record["gid"] or str(st.st_nlink) != record["nlink"] or
        str(st.st_size) != record["size"] or str(st.st_ctime_ns) != record["ctime_ns"] or
        str(st.st_mtime_ns) != record["mtime_ns"] or st.st_uid != expected_uid):
        fail(label + " identity mismatch")
    actual_type = "symlink" if stat.S_ISLNK(st.st_mode) else ("directory" if stat.S_ISDIR(st.st_mode) else ("file" if stat.S_ISREG(st.st_mode) else "unsupported"))
    if actual_type != record["type"]:
        fail(label + " type mismatch")

def check_claimed(st, record, label):
    if (str(st.st_dev) != record["device"] or str(st.st_ino) != record["inode"] or
        stat.S_IMODE(st.st_mode) != record["mode"] or str(st.st_uid) != record["uid"] or
        str(st.st_gid) != record["gid"] or str(st.st_nlink) != record["nlink"] or
        str(st.st_size) != record["size"] or str(st.st_mtime_ns) != record["mtime_ns"] or
        st.st_uid != expected_uid):
        fail(label + " claimed identity mismatch")
    actual_type = "symlink" if stat.S_ISLNK(st.st_mode) else ("directory" if stat.S_ISDIR(st.st_mode) else ("file" if stat.S_ISREG(st.st_mode) else "unsupported"))
    if actual_type != record["type"]:
        fail(label + " claimed type mismatch")

def expected_children(relative_path):
    prefix = "" if relative_path == "." else relative_path + "/"
    names = []
    for path in records:
        if path == "." or not path.startswith(prefix):
            continue
        tail = path[len(prefix):]
        if "/" not in tail:
            names.append(tail)
    return sorted(names)

def restore_unverified_claim(parent, claimed_name, original_name):
    try:
        os.stat(original_name, dir_fd=parent, follow_symlinks=False)
    except FileNotFoundError:
        os.rename(claimed_name, original_name, src_dir_fd=parent, dst_dir_fd=parent)

def claim_entry(parent, name, record, child_relative):
    child_stat = os.stat(name, dir_fd=parent, follow_symlinks=False)
    check(child_stat, record, child_relative)
    claimed_name = ".homecook-delete-" + secrets.token_hex(16)
    os.rename(name, claimed_name, src_dir_fd=parent, dst_dir_fd=parent)
    try:
        check_claimed(os.stat(claimed_name, dir_fd=parent, follow_symlinks=False), record, child_relative)
    except BaseException:
        restore_unverified_claim(parent, claimed_name, name)
        raise
    return claimed_name

def remove_directory(parent, name, relative_path, already_claimed=False):
    record = records.get(relative_path)
    if not record or record["type"] != "directory":
        fail("missing directory ledger entry")
    claimed_name = name if already_claimed else claim_entry(parent, name, record, relative_path)
    fd = os.open(claimed_name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent)
    try:
        check_claimed(os.fstat(fd), record, relative_path)
        names = sorted(os.listdir(fd))
        if names != expected_children(relative_path):
            fail(relative_path + " child set mismatch")
        for child in names:
            child_relative = child if relative_path == "." else relative_path + "/" + child
            child_record = records.get(child_relative)
            if not child_record:
                fail("missing child ledger entry")
            claimed_child = claim_entry(fd, child, child_record, child_relative)
            if child_record["type"] == "directory":
                remove_directory(fd, claimed_child, child_relative, already_claimed=True)
                os.rmdir(claimed_child, dir_fd=fd)
            elif child_record["type"] == "file":
                os.unlink(claimed_child, dir_fd=fd)
            elif child_record["type"] == "symlink":
                if os.readlink(claimed_child, dir_fd=fd) != child_record["symlink_target"]:
                    fail(child_relative + " symlink target mismatch")
                os.unlink(claimed_child, dir_fd=fd)
            else:
                fail("unsupported cleanup entry")
        if os.listdir(fd):
            fail(relative_path + " cleanup residue")
    finally:
        os.close(fd)
    return claimed_name

claimed_root = remove_directory(parent_fd, root_name, ".")
os.rmdir(claimed_root, dir_fd=parent_fd)
print(json.dumps({"removed": True, "entry_count": len(records)}, separators=(",", ":")))
`;

const DEFERRED_QUARANTINE_PYTHON_PATH = process.platform === "darwin"
  ? "/Library/Developer/CommandLineTools/Library/Frameworks/Python3.framework/Versions/3.9/Resources/Python.app/Contents/MacOS/Python"
  : realpathSync("/usr/bin/python3");

function cleanupDeferredPnpmQuarantine({
  parentFd,
  rootName,
  inventory,
  currentUid,
  pythonPath = DEFERRED_QUARANTINE_PYTHON_PATH,
  runCommand = spawnSync,
}) {
  if (!/^\.homecook-pnpm-quarantine-[0-9a-f-]{36}$/u.test(rootName)) {
    fail("candidate pnpm deferred quarantine name is invalid");
  }
  const toolPre = snapshotToolFile(pythonPath, "deferred-quarantine-cleanup-python");
  const result = runCommand(
    pythonPath,
    ["-I", "-c", DEFERRED_QUARANTINE_CLEANUP_SCRIPT, rootName, String(currentUid)],
    {
      encoding: "utf8",
      env: { PATH: "/usr/bin:/bin" },
      input: canonicalizeJcs({ entries: inventory.entries }),
      maxBuffer: 1024 * 1024,
      shell: false,
      stdio: ["pipe", "pipe", "pipe", parentFd],
      timeout: 30_000,
    },
  );
  if (result.error || result.signal || result.status !== 0) {
    fail("candidate pnpm deferred quarantine cleanup failed closed");
  }
  let output;
  try {
    output = JSON.parse(String(result.stdout ?? ""));
  } catch {
    fail("candidate pnpm deferred quarantine cleanup result is invalid");
  }
  if (
    output?.removed !== true
    || output.entry_count !== inventory.entries.length
  ) fail("candidate pnpm deferred quarantine cleanup result is incomplete");
  const toolPost = snapshotToolFile(pythonPath, "deferred-quarantine-cleanup-python");
  if (canonicalizeJcs(toolPre) !== canonicalizeJcs(toolPost)) {
    fail("candidate pnpm deferred quarantine cleanup tool drifted");
  }
  return Object.freeze({
    cleanup_digest: sha256Jcs({
      schema: "homecook.release-rehearsal-pnpm-deferred-quarantine-cleanup.v1",
      inventory_digest: inventory.inventory_digest,
      entry_count: inventory.entries.length,
      tool_identity_digest: sha256Jcs(toolPost),
    }),
  });
}

/**
 * @param {{
 *   sourceStore:string,
 *   storeRoot:string,
 *   currentUid?:number,
 *   cleanupPythonPath?:string,
 *   cleanupRunCommand?:Function,
 *   quarantineParent?:string,
 *   transitionObserver?:(event:Record<string,unknown>)=>void,
 * }} options
 * @param {(authority:{
 *   storePath:string,
 *   installWritableRoots:string[],
 *   snapshotInventoryDigest:string,
 *   sealInstallIndex:()=>{inventory_digest:string,physical_identity_digest:string},
 *   verifyInstallPhaseBeforeSpawn:()=>void,
 * })=>unknown|Promise<unknown>} callback
 */
export async function withCandidatePnpmStoreView({
  sourceStore,
  storeRoot,
  currentUid = process.getuid?.(),
  cleanupPythonPath = DEFERRED_QUARANTINE_PYTHON_PATH,
  cleanupRunCommand = spawnSync,
  quarantineParent = dirname(storeRoot),
  transitionObserver = () => undefined,
} = /** @type {any} */ ({}), callback) {
  if (!Number.isInteger(currentUid) || currentUid < 0) fail("current uid is unavailable");
  if (typeof callback !== "function") fail("candidate pnpm store-view callback is required");
  if (typeof transitionObserver !== "function") fail("candidate pnpm transition observer is invalid");
  if (typeof cleanupRunCommand !== "function") fail("candidate pnpm cleanup command is invalid");
  if (![sourceStore, storeRoot].every((path) => isAbsolute(path ?? "") && resolve(path) === path)) {
    fail("candidate pnpm store-view paths must be absolute and canonical");
  }
  const privateParent = dirname(storeRoot);
  const privateParentStat = lstatSync(privateParent, { bigint: true });
  if (
    privateParentStat.isSymbolicLink() || !privateParentStat.isDirectory()
    || privateParentStat.uid !== BigInt(currentUid) || modeBits(privateParentStat.mode) !== 0o700
    || realpathSync(privateParent) !== privateParent
  ) fail("candidate pnpm store-view parent is unsafe");
  if (!isAbsolute(quarantineParent ?? "") || resolve(quarantineParent) !== quarantineParent) {
    fail("candidate pnpm quarantine parent must be absolute and canonical");
  }
  const quarantineParentInitialStat = lstatSync(quarantineParent, { bigint: true });
  if (
    quarantineParentInitialStat.isSymbolicLink() || !quarantineParentInitialStat.isDirectory()
    || quarantineParentInitialStat.uid !== BigInt(currentUid) || modeBits(quarantineParentInitialStat.mode) !== 0o700
    || realpathSync(quarantineParent) !== quarantineParent
  ) fail("candidate pnpm quarantine parent is unsafe");

  const sourcePaths = [sourceStore, join(sourceStore, "files"), join(sourceStore, "index")];
  const sourceSnapshots = [];
  try {
    for (const path of sourcePaths) {
      const stat = lstatSync(path, { bigint: true });
      if (
        stat.isSymbolicLink() || !stat.isDirectory() || stat.uid !== BigInt(currentUid)
        || (modeBits(stat.mode) & 0o022) !== 0 || realpathSync(path) !== path
      ) fail("approved pnpm package store path, owner, mode, or identity is unsafe");
      const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
      if (!samePnpmStoreIdentity(stat, fstatSync(fd, { bigint: true }))) {
        closeSync(fd);
        fail("approved pnpm package store identity drifted before snapshot creation");
      }
      sourceSnapshots.push({ fd, path, stat });
    }
  } catch (error) {
    for (const { fd } of sourceSnapshots) closeSync(fd);
    throw error;
  }

  const storePath = join(storeRoot, "v10");
  const filesPath = join(storePath, "files");
  const indexPath = join(storePath, "index");
  const scratchRoots = [join(storePath, "projects"), join(storePath, "tmp")];
  const installWritableRoots = [...scratchRoots, indexPath];
  let sourceInventory;
  let snapshotInventory;
  try {
    sourceInventory = pnpmStoreInventory(sourceStore, currentUid, {
      verifyCafsContent: true,
      allowedRootChildren: ["files", "index", "projects", "tmp"],
    });
    mkdirSync(storeRoot, { mode: 0o700 });
    clonePnpmStoreSnapshot(sourceStore, storePath, sourceInventory);
    setPnpmStoreTreeMode(indexPath, {
      writable: true,
      label: "working index",
      currentUid,
    });
    for (const path of scratchRoots) mkdirSync(path, { mode: 0o700 });
    chmodSync(storePath, 0o500);
    chmodSync(storeRoot, 0o500);
    snapshotInventory = pnpmStoreInventory(storePath, currentUid, {
      allowedRootChildren: ["files", "index", "projects", "tmp"],
    });
    if (snapshotInventory.content_digest !== sourceInventory.content_digest) {
      fail("candidate pnpm store snapshot inventory digest differs from its approved source");
    }
    const sourceAfterCopy = pnpmStoreInventory(sourceStore, currentUid, {
      allowedRootChildren: ["files", "index", "projects", "tmp"],
    });
    if (
      sourceAfterCopy.inventory_digest !== sourceInventory.inventory_digest
      || sourceAfterCopy.identity_digest !== sourceInventory.identity_digest
    ) fail("approved pnpm package store drifted during private snapshot creation");
  } catch (error) {
    for (const { fd } of sourceSnapshots.reverse()) closeSync(fd);
    fail(`candidate pnpm store-view create-only materialization failed: ${error?.message ?? error?.code ?? "unknown"}`);
  }

  const viewDirectoryInputs = [
    { path: storeRoot, phase: "immutable" },
    { path: storePath, phase: "immutable" },
    { path: filesPath, phase: "immutable" },
    { path: indexPath, phase: "working" },
    ...scratchRoots.map((path) => ({ path, phase: "scratch" })),
  ];
  const viewDirectories = [];
  try {
    for (const { path, phase } of viewDirectoryInputs) {
      const stat = lstatSync(path, { bigint: true });
      const expectedMode = ["working", "scratch"].includes(phase) ? 0o700 : 0o500;
      if (
        stat.isSymbolicLink() || !stat.isDirectory() || stat.uid !== BigInt(currentUid)
        || modeBits(stat.mode) !== expectedMode || realpathSync(path) !== path
      ) fail("candidate pnpm store-view directory identity is unsafe");
      const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
      if (!samePnpmStoreIdentity(stat, fstatSync(fd, { bigint: true }))) {
        closeSync(fd);
        fail("candidate pnpm store-view directory identity drifted before execution");
      }
      viewDirectories.push({ fd, path, phase, stat, sealedStat: null });
    }
  } catch (error) {
    for (const { fd } of viewDirectories.reverse()) closeSync(fd);
    for (const { fd } of sourceSnapshots.reverse()) closeSync(fd);
    throw error;
  }

  const transitionParentStat = lstatSync(privateParent, { bigint: true });
  const transitionParentFd = openSync(
    privateParent,
    fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
  );
  if (!samePnpmStoreIdentity(transitionParentStat, fstatSync(transitionParentFd, { bigint: true }))) {
    closeSync(transitionParentFd);
    for (const { fd } of viewDirectories.reverse()) closeSync(fd);
    for (const { fd } of sourceSnapshots.reverse()) closeSync(fd);
    fail("candidate pnpm transition parent identity drifted before execution");
  }
  const quarantineParentStat = lstatSync(quarantineParent, { bigint: true });
  const quarantineParentFd = openSync(
    quarantineParent,
    fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
  );
  if (!samePnpmStoreIdentity(quarantineParentStat, fstatSync(quarantineParentFd, { bigint: true }))) {
    closeSync(quarantineParentFd);
    closeSync(transitionParentFd);
    for (const { fd } of viewDirectories.reverse()) closeSync(fd);
    for (const { fd } of sourceSnapshots.reverse()) closeSync(fd);
    fail("candidate pnpm quarantine parent identity drifted before execution");
  }

  const initialFilesAuthority = pnpmStoreSubtreeAuthority(snapshotInventory, "files");
  let storePhase = "install";
  let sealedSnapshotInventory;
  let finalIndexAuthority;
  let installTransitionDigest;
  let deferredCleanupDigest;
  let deferredQuarantine;
  const viewByPath = new Map(viewDirectories.map((entry) => [entry.path, entry]));
  const assertHeldDirectory = (entry, keys, label) => {
    const pathPost = lstatSync(entry.path, { bigint: true });
    const fdPost = fstatSync(entry.fd, { bigint: true });
    if (
      pathPost.isSymbolicLink() || !pathPost.isDirectory() || realpathSync(entry.path) !== entry.path
      || !keys.every((key) => entry.stat[key] === pathPost[key] && entry.stat[key] === fdPost[key])
    ) fail(`candidate pnpm store-view ${label} identity drifted`);
  };
  const assertTransitionParent = () => {
    const pathPost = lstatSync(privateParent, { bigint: true });
    const fdPost = fstatSync(transitionParentFd, { bigint: true });
    if (
      pathPost.isSymbolicLink() || !pathPost.isDirectory() || realpathSync(privateParent) !== privateParent
      || !samePnpmStoreIdentity(transitionParentStat, pathPost)
      || !samePnpmStoreIdentity(transitionParentStat, fdPost)
    ) fail("candidate pnpm transition parent identity drifted");
  };
  const assertTransitionParentStable = () => {
    const pathPost = lstatSync(privateParent, { bigint: true });
    const fdPost = fstatSync(transitionParentFd, { bigint: true });
    for (const key of ["dev", "ino", "mode", "uid", "gid"]) {
      if (transitionParentStat[key] !== pathPost[key] || transitionParentStat[key] !== fdPost[key]) {
        fail("candidate pnpm transition parent stable identity drifted");
      }
    }
    if (pathPost.isSymbolicLink() || realpathSync(privateParent) !== privateParent) {
      fail("candidate pnpm transition parent became unsafe");
    }
  };
  const assertAbsent = (path, label) => {
    try {
      lstatSync(path);
      fail(`candidate pnpm ${label} unexpectedly exists`);
    } catch (error) {
      if (!(error && typeof error === "object" && error.code === "ENOENT")) throw error;
    }
  };
  const verifyInstallPhaseBeforeSpawn = () => {
    if (storePhase !== "install") fail("candidate pnpm install profile cannot be reused after seal");
    assertTransitionParent();
    for (const entry of viewDirectories) {
      const keys = ["working", "scratch"].includes(entry.phase)
        ? ["dev", "ino", "mode", "uid", "gid"]
        : PNPM_STORE_IDENTITY_KEYS;
      assertHeldDirectory(entry, keys, `${entry.phase} install phase`);
    }
  };
  const sealInstallIndex = () => {
    if (storePhase !== "install") fail("candidate pnpm install index seal transition may run exactly once");
    transitionObserver(Object.freeze({ phase: "before_transition", storePath, storeRoot }));
    verifyInstallPhaseBeforeSpawn();
    if (
      canonicalizeJcs(readdirSync(storePath).sort())
      !== canonicalizeJcs(["files", "index", "projects", "tmp"])
    ) fail("candidate pnpm store contains an unexpected child before install index seal");
    for (const entry of viewDirectories) {
      const keys = ["working", "scratch"].includes(entry.phase)
        ? ["dev", "ino", "mode", "uid", "gid"]
        : PNPM_STORE_IDENTITY_KEYS;
      assertHeldDirectory(entry, keys, `${entry.phase} phase`);
    }
    const workingInventory = pnpmStoreInventory(storePath, currentUid, {
      allowedRootChildren: ["files", "index", "projects", "tmp"],
    });
    const workingFilesAuthority = pnpmStoreSubtreeAuthority(workingInventory, "files");
    if (
      workingFilesAuthority.inventory_digest !== initialFilesAuthority.inventory_digest
      || workingFilesAuthority.physical_identity_digest !== initialFilesAuthority.physical_identity_digest
    ) fail("candidate pnpm store files inventory drifted during install");
    const storeRootEntry = viewByPath.get(storeRoot);
    const storePathEntry = viewByPath.get(storePath);
    const indexEntry = viewByPath.get(indexPath);
    if (!storeRootEntry || !storePathEntry || !indexEntry) {
      fail("candidate pnpm transition directory registry is incomplete");
    }
    const quarantineName = `.homecook-pnpm-quarantine-${randomUUID()}`;
    const quarantineRoot = join(quarantineParent, quarantineName);
    let quarantineFd;
    let retainQuarantineFd = false;
    try {
      const quarantineParentBefore = lstatSync(quarantineParent, { bigint: true });
      const quarantineParentOpened = fstatSync(quarantineParentFd, { bigint: true });
      if (
        quarantineParentBefore.isSymbolicLink()
        || !samePnpmStoreIdentity(quarantineParentStat, quarantineParentBefore)
        || !samePnpmStoreIdentity(quarantineParentStat, quarantineParentOpened)
      ) fail("candidate pnpm quarantine parent swapped before quarantine creation");
      mkdirSync(quarantineRoot, { mode: 0o700 });
      const quarantineStat = lstatSync(quarantineRoot, { bigint: true });
      if (
        quarantineStat.isSymbolicLink() || !quarantineStat.isDirectory()
        || quarantineStat.uid !== BigInt(currentUid) || modeBits(quarantineStat.mode) !== 0o700
        || realpathSync(quarantineRoot) !== quarantineRoot
      ) fail("candidate pnpm transition quarantine is unsafe");
      quarantineFd = openSync(
        quarantineRoot,
        fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
      );
      if (!samePnpmStoreIdentity(quarantineStat, fstatSync(quarantineFd, { bigint: true }))) {
        fail("candidate pnpm transition quarantine identity drifted before move");
      }
      fchmodSync(storePathEntry.fd, 0o700);
      const storePathWritable = lstatSync(storePath, { bigint: true });
      if (
        storePathWritable.isSymbolicLink() || storePathWritable.dev !== fstatSync(storePathEntry.fd, { bigint: true }).dev
        || storePathWritable.ino !== fstatSync(storePathEntry.fd, { bigint: true }).ino
        || modeBits(storePathWritable.mode) !== 0o700
      ) fail("candidate pnpm store path swapped before quarantine move");

      for (const [kind, sourcePath] of [["index", indexPath], ["projects", scratchRoots[0]], ["tmp", scratchRoots[1]]]) {
        const entry = viewByPath.get(sourcePath);
        if (!entry) fail("candidate pnpm transition child registry is incomplete");
        const targetPath = join(quarantineRoot, kind);
        const sourceBefore = lstatSync(sourcePath, { bigint: true });
        const sourceFd = fstatSync(entry.fd, { bigint: true });
        if (
          sourceBefore.isSymbolicLink() || !sourceBefore.isDirectory()
          || sourceBefore.dev !== sourceFd.dev || sourceBefore.ino !== sourceFd.ino
          || realpathSync(sourcePath) !== sourcePath
        ) fail(`candidate pnpm ${kind} path swapped before quarantine move`);
        renameSync(sourcePath, targetPath);
        const moved = lstatSync(targetPath, { bigint: true });
        const movedFd = fstatSync(entry.fd, { bigint: true });
        if (
          moved.isSymbolicLink() || !moved.isDirectory() || realpathSync(targetPath) !== targetPath
          || moved.dev !== sourceFd.dev || moved.ino !== sourceFd.ino
          || movedFd.dev !== sourceFd.dev || movedFd.ino !== sourceFd.ino
          || moved.uid !== BigInt(currentUid)
        ) fail(`candidate pnpm ${kind} quarantine identity differs from held authority`);
        assertAbsent(sourcePath, `${kind} original path after quarantine move`);
        entry.quarantinePath = targetPath;
        entry.quarantineStat = moved;
      }
      if (
        canonicalizeJcs(readdirSync(storePath).sort()) !== canonicalizeJcs(["files"])
        || canonicalizeJcs(readdirSync(quarantineRoot).sort()) !== canonicalizeJcs(["index", "projects", "tmp"])
      ) fail("candidate pnpm transition quarantine child set is invalid");

      sealPnpmStoreTreeFdBound(filesPath, {
        inventory: workingInventory,
        subtree: "files",
        currentUid,
        transitionObserver,
      });
      sealPnpmStoreTreeFdBound(indexEntry.quarantinePath, {
        inventory: workingInventory,
        subtree: "index",
        currentUid,
        deferRootFchmod: true,
        transitionObserver,
      });

      const sealedIndexQuarantine = lstatSync(indexEntry.quarantinePath, { bigint: true });
      const sealedIndexFd = fstatSync(indexEntry.fd, { bigint: true });
      if (
        sealedIndexQuarantine.isSymbolicLink() || !sealedIndexQuarantine.isDirectory()
        || sealedIndexQuarantine.dev !== sealedIndexFd.dev || sealedIndexQuarantine.ino !== sealedIndexFd.ino
        || modeBits(sealedIndexQuarantine.mode) !== 0o700
      ) fail("candidate pnpm sealed index quarantine identity is invalid");
      assertAbsent(indexPath, "index destination before restore");
      renameSync(indexEntry.quarantinePath, indexPath);
      const restoredIndex = lstatSync(indexPath, { bigint: true });
      const restoredIndexFd = fstatSync(indexEntry.fd, { bigint: true });
      if (
        restoredIndex.isSymbolicLink() || !restoredIndex.isDirectory()
        || restoredIndex.dev !== restoredIndexFd.dev || restoredIndex.ino !== restoredIndexFd.ino
        || modeBits(restoredIndex.mode) !== 0o700 || realpathSync(indexPath) !== indexPath
      ) fail("candidate pnpm sealed index identity drifted during restore");
      assertAbsent(indexEntry.quarantinePath, "index quarantine after restore");
      transitionObserver(Object.freeze({
        phase: "before_entry_fchmod",
        path: indexPath,
        relativePath: "index",
        type: "directory",
      }));
      const indexBeforeFinalMode = lstatSync(indexPath, { bigint: true });
      if (
        indexBeforeFinalMode.isSymbolicLink()
        || indexBeforeFinalMode.dev !== restoredIndexFd.dev
        || indexBeforeFinalMode.ino !== restoredIndexFd.ino
      ) fail("candidate pnpm index root swapped before final FD-bound chmod");
      fchmodSync(indexEntry.fd, 0o500);
      const sealedIndexFinal = lstatSync(indexPath, { bigint: true });
      if (
        sealedIndexFinal.isSymbolicLink()
        || sealedIndexFinal.dev !== fstatSync(indexEntry.fd, { bigint: true }).dev
        || sealedIndexFinal.ino !== fstatSync(indexEntry.fd, { bigint: true }).ino
        || modeBits(sealedIndexFinal.mode) !== 0o500
      ) fail("candidate pnpm index root swapped during final FD-bound chmod");

      if (canonicalizeJcs(readdirSync(quarantineRoot).sort()) !== canonicalizeJcs(["projects", "tmp"])) {
        fail("candidate pnpm deferred quarantine child set is invalid");
      }
      const deferredStat = lstatSync(quarantineRoot, { bigint: true });
      if (!samePnpmStoreIdentity(deferredStat, fstatSync(quarantineFd, { bigint: true }))) {
        fail("candidate pnpm deferred quarantine identity drifted after transition");
      }
      deferredQuarantine = Object.freeze({
        fd: quarantineFd,
        name: quarantineName,
        path: quarantineRoot,
        stat: deferredStat,
      });
      retainQuarantineFd = true;
      fchmodSync(storePathEntry.fd, 0o500);
    } finally {
      if (quarantineFd !== undefined && !retainQuarantineFd) closeSync(quarantineFd);
    }
    assertTransitionParentStable();
    if (
      canonicalizeJcs(readdirSync(storeRoot).sort()) !== canonicalizeJcs(["v10"])
      || canonicalizeJcs(readdirSync(storePath).sort()) !== canonicalizeJcs(["files", "index"])
    ) fail("candidate pnpm store contains unexpected children after FD-bound transition");
    sealedSnapshotInventory = pnpmStoreInventory(storePath, currentUid, { requireSealed: true });
    finalIndexAuthority = pnpmStoreSubtreeAuthority(sealedSnapshotInventory, "index");
    for (const entry of viewDirectories.filter(({ phase }) => phase !== "scratch")) {
      const sealedStat = lstatSync(entry.path, { bigint: true });
      const fdPost = fstatSync(entry.fd, { bigint: true });
      if (
        sealedStat.isSymbolicLink() || !sealedStat.isDirectory()
        || realpathSync(entry.path) !== entry.path
        || !samePnpmStoreIdentity(sealedStat, fdPost)
      ) fail("candidate pnpm store sealed directory identity drifted during transition");
      entry.sealedStat = sealedStat;
    }
    installTransitionDigest = sha256Jcs({
      schema: "homecook.release-rehearsal-pnpm-install-index-transition.v1",
      initial_snapshot_inventory_digest: snapshotInventory.inventory_digest,
      sealed_snapshot_inventory_digest: sealedSnapshotInventory.inventory_digest,
      final_index_inventory_digest: finalIndexAuthority.inventory_digest,
      final_index_physical_identity_digest: finalIndexAuthority.physical_identity_digest,
      install_writable_path_digests: installWritableRoots.map((path) => sha256Jcs(path)),
      quarantine_path_digest: sha256Jcs(quarantineRoot),
    });
    storePhase = "sealed";
    return Object.freeze({ ...finalIndexAuthority });
  };

  let value;
  let callbackError;
  try {
    value = await callback({
      storePath,
      installWritableRoots: Object.freeze([...installWritableRoots]),
      snapshotInventoryDigest: snapshotInventory.inventory_digest,
      sealInstallIndex,
      verifyInstallPhaseBeforeSpawn,
    });
  } catch (error) {
    callbackError = error;
  }
  let identityError;
  try {
    if (storePhase !== "sealed" || !sealedSnapshotInventory || !finalIndexAuthority) {
      if (callbackError) throw callbackError;
      fail("candidate pnpm install index seal transition did not complete");
    }
    for (const { fd, path, stat } of sourceSnapshots) {
      const pathPost = lstatSync(path, { bigint: true });
      const fdPost = fstatSync(fd, { bigint: true });
      if (
        pathPost.isSymbolicLink() || !pathPost.isDirectory() || realpathSync(path) !== path
        || !samePnpmStoreIdentity(stat, pathPost) || !samePnpmStoreIdentity(stat, fdPost)
      ) fail("approved pnpm package store identity drifted during candidate build");
    }
    const sourcePost = pnpmStoreInventory(sourceStore, currentUid, {
      allowedRootChildren: ["files", "index", "projects", "tmp"],
    });
    if (
      sourcePost.inventory_digest !== sourceInventory.inventory_digest
      || sourcePost.identity_digest !== sourceInventory.identity_digest
    ) fail("approved pnpm package store inventory drifted during candidate build");
    const sealedPost = pnpmStoreInventory(storePath, currentUid, { requireSealed: true });
    const finalIndexPost = pnpmStoreSubtreeAuthority(sealedPost, "index");
    if (
      sealedPost.inventory_digest !== sealedSnapshotInventory.inventory_digest
      || sealedPost.identity_digest !== sealedSnapshotInventory.identity_digest
      || finalIndexPost.inventory_digest !== finalIndexAuthority.inventory_digest
      || finalIndexPost.physical_identity_digest !== finalIndexAuthority.physical_identity_digest
    ) fail("candidate pnpm sealed index or store inventory drifted during build");
    for (const entry of viewDirectories.filter(({ phase }) => phase !== "scratch")) {
      const pathPost = lstatSync(entry.path, { bigint: true });
      const fdPost = fstatSync(entry.fd, { bigint: true });
      if (
        !entry.sealedStat || pathPost.isSymbolicLink() || !pathPost.isDirectory()
        || realpathSync(entry.path) !== entry.path
        || !samePnpmStoreIdentity(entry.sealedStat, pathPost)
        || !samePnpmStoreIdentity(entry.sealedStat, fdPost)
      ) fail("candidate pnpm sealed directory identity drifted during build");
    }
    for (const scratchRoot of scratchRoots) {
      try {
        lstatSync(scratchRoot);
        fail("candidate pnpm scratch path returned after install seal");
      } catch (error) {
        if (!(error && typeof error === "object" && error.code === "ENOENT")) throw error;
      }
    }
    if (!deferredQuarantine) {
      fail("candidate pnpm deferred quarantine authority is missing");
    }
    const assertDeferredQuarantineIdentity = (phase) => {
      const pathStat = lstatSync(deferredQuarantine.path, { bigint: true });
      const fdStat = fstatSync(deferredQuarantine.fd, { bigint: true });
      if (
        pathStat.isSymbolicLink() || !pathStat.isDirectory()
        || realpathSync(deferredQuarantine.path) !== deferredQuarantine.path
        || !samePnpmStoreIdentity(deferredQuarantine.stat, pathStat)
        || !samePnpmStoreIdentity(deferredQuarantine.stat, fdStat)
      ) fail(`candidate pnpm deferred quarantine identity drifted ${phase}`);
    };
    assertDeferredQuarantineIdentity("before cleanup inventory");
    const deferredInventory = inventoryDeferredPnpmQuarantine(
      deferredQuarantine.path,
      currentUid,
    );
    assertDeferredQuarantineIdentity("during cleanup inventory");
    transitionObserver(Object.freeze({
      phase: "before_deferred_cleanup",
      path: deferredQuarantine.path,
      inventory_digest: deferredInventory.inventory_digest,
    }));
    const cleanup = cleanupDeferredPnpmQuarantine({
      parentFd: quarantineParentFd,
      rootName: deferredQuarantine.name,
      inventory: deferredInventory,
      currentUid,
      pythonPath: cleanupPythonPath,
      runCommand: cleanupRunCommand,
    });
    assertAbsent(deferredQuarantine.path, "deferred quarantine after cleanup");
    deferredCleanupDigest = cleanup.cleanup_digest;
  } catch (error) {
    identityError = error;
  } finally {
    if (deferredQuarantine?.fd !== undefined) closeSync(deferredQuarantine.fd);
    closeSync(quarantineParentFd);
    closeSync(transitionParentFd);
    for (const { fd } of viewDirectories.reverse()) closeSync(fd);
    for (const { fd } of sourceSnapshots.reverse()) closeSync(fd);
  }
  if (identityError) throw identityError;
  if (callbackError) throw callbackError;

  const authorityDigest = sha256Jcs({
    schema: "homecook.release-rehearsal-pnpm-store-view-authority.v3",
    source_inventory_digest: sourceInventory.inventory_digest,
    source_identity_digest: sourceInventory.identity_digest,
    initial_snapshot_inventory_digest: snapshotInventory.inventory_digest,
    snapshot_inventory_digest: sealedSnapshotInventory.inventory_digest,
    snapshot_identity_digest: sealedSnapshotInventory.identity_digest,
    final_index_inventory_digest: finalIndexAuthority.inventory_digest,
    final_index_physical_identity_digest: finalIndexAuthority.physical_identity_digest,
    install_transition_digest: installTransitionDigest,
    deferred_cleanup_digest: deferredCleanupDigest,
    view_path_digest: sha256Jcs(storePath),
    install_writable_path_digests: installWritableRoots.map((path) => sha256Jcs(path)),
  });
  return Object.freeze({
    authority_digest: authorityDigest,
    snapshot_inventory_digest: sealedSnapshotInventory.inventory_digest,
    snapshot_identity_digest: sealedSnapshotInventory.identity_digest,
    final_index_inventory_digest: finalIndexAuthority.inventory_digest,
    final_index_identity_digest: finalIndexAuthority.physical_identity_digest,
    value,
  });
}

/** @param {{readRoots?:string[], writeRoots?:string[], deniedPaths?:string[], deniedWritePaths?:string[], executablePaths?:string[]|null}} options */
export function buildCandidateSandboxProfile({
  readRoots = [], writeRoots = [], deniedPaths = [], deniedWritePaths = [], executablePaths = null,
} = {}) {
  let processExecRule = "(allow process-exec)";
  let executionAuditMessage = null;
  if (executablePaths !== null) {
    if (
      !Array.isArray(executablePaths) || executablePaths.length === 0
      || executablePaths.some((path) => typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path)
    ) fail("candidate sandbox exact executable paths are invalid");
    const exactExecutables = [...new Set(executablePaths)].sort();
    for (const path of exactExecutables) {
      let stat;
      try {
        stat = lstatSync(path);
      } catch {
        fail("candidate sandbox exact executable is unavailable");
      }
      if (
        stat.isSymbolicLink() || !stat.isFile() || realpathSync(path) !== path
        || ![0, process.getuid?.()].includes(stat.uid)
        || (modeBits(stat.mode) & 0o111) === 0
        || (modeBits(stat.mode) & 0o022) !== 0
      ) fail("candidate sandbox exact executable mode, owner, or identity is unsafe");
    }
    processExecRule = `(allow process-exec ${exactExecutables
      .map((path) => `(literal ${sandboxLiteral(path)})`).join(" ")})`;
    if (exactExecutables.length === 1 && /^hcnode[0-9a-f]{8}[a-z]$/u.test(basename(exactExecutables[0]))) {
      executionAuditMessage = `homecook-sandbox-${basename(exactExecutables[0])}`;
    }
  }
  const auditMessageRule = executionAuditMessage === null
    ? ""
    : ` (with message ${JSON.stringify(executionAuditMessage)})`;
  const systemRuntimeRoots = [
    "/System",
    "/usr",
    "/bin",
    "/sbin",
    "/Library",
    "/private/var/folders",
    "/private/var/select",
    "/private/var/run",
    "/dev",
  ];
  const systemRuntimeFiles = new Set([
    "/private/var/db/timezone/zoneinfo/posixrules",
  ]);
  for (const path of [...systemRuntimeFiles]) {
    try { systemRuntimeFiles.add(realpathSync(path)); } catch { /* Missing system aliases stay lexical. */ }
  }
  const systemMetadataPathSet = new Set([
    "/etc",
    "/var",
    "/private/etc",
    "/private/var",
    "/private/var/db",
    "/private/var/db/timezone",
    "/private/var/db/timezone/zoneinfo",
  ]);
  for (const file of systemRuntimeFiles) {
    let current = dirname(file);
    while (current !== "/") {
      systemMetadataPathSet.add(current);
      if (current === "/private/var") break;
      current = dirname(current);
    }
  }
  const systemMetadataPaths = [...systemMetadataPathSet].sort();
  const approvedReadRoots = [...new Set([...readRoots, ...systemRuntimeRoots])];
  const ancestors = new Set(["/"]);
  for (const root of [...approvedReadRoots, ...writeRoots, ...systemMetadataPaths]) {
    let current = resolve(root);
    while (current !== "/") {
      ancestors.add(current);
      current = dirname(current);
    }
  }
  const aliasParentMetadataRules = systemMetadataPaths
    .map((path) => `(literal ${sandboxLiteral(path)})`).join(" ");
  const readRules = [
    ...[...ancestors]
      .filter((path) => !systemMetadataPaths.includes(path))
      .map((path) => `(literal ${sandboxLiteral(path)})`),
    ...approvedReadRoots.map((path) => `(subpath ${sandboxLiteral(path)})`),
    ...[...systemRuntimeFiles].sort().map((path) => `(literal ${sandboxLiteral(path)})`),
  ].join(" ");
  const writeRules = [...new Set(writeRoots)].map((path) => `(subpath ${sandboxLiteral(path)})`).join(" ");
  const expandedDeniedPaths = new Set(deniedPaths);
  for (const path of deniedPaths) {
    try { expandedDeniedPaths.add(realpathSync(path)); } catch { /* Missing denied targets stay lexical. */ }
  }
  const denyRules = [...expandedDeniedPaths].flatMap((path) => [
    `(deny file-read* (literal ${sandboxLiteral(path)}) (subpath ${sandboxLiteral(path)})${auditMessageRule})`,
    `(deny file-write* (literal ${sandboxLiteral(path)}) (subpath ${sandboxLiteral(path)})${auditMessageRule})`,
  ]).join("\n");
  const denyWriteRules = [...new Set(deniedWritePaths)].map((path) =>
    `(deny file-write* (literal ${sandboxLiteral(path)}) (subpath ${sandboxLiteral(path)})${auditMessageRule})`).join("\n");
  return [
    "(version 1)",
    `(deny default${auditMessageRule})`,
    processExecRule,
    `(deny process-fork${auditMessageRule})`,
    "(allow signal (target children))",
    `(deny process-exec ${[
      "/bin/launchctl", "/usr/bin/launchctl", "/usr/local/bin/docker", "/opt/homebrew/bin/docker",
    ].map((path) => `(literal ${sandboxLiteral(path)})`).join(" ")}${auditMessageRule})`,
    '(deny mach-lookup (global-name "com.apple.diagnosticd") (with no-log))',
    "(allow sysctl-read)",
    '(allow file-read-metadata (literal "/etc") (literal "/var"))',
    `(allow file-read-metadata ${aliasParentMetadataRules})`,
    `(allow file-read* ${readRules})`,
    `(deny file-read-data (literal "/etc") (literal "/var") (literal "/private/etc") (literal "/private/var")${auditMessageRule})`,
    `(allow file-write* ${writeRules})`,
    `(deny network*${auditMessageRule})`,
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
  if (value.head_sha !== manifest.release_sha
    || (manifest.selection_digest === null && value.remote_master_sha !== manifest.release_sha)) {
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
      || entry.head_sha !== manifest.release_sha
    ) {
      fail("candidate CI check identity is invalid");
    }
    string(entry.name, "candidate CI check name");
    string(entry.status, "candidate CI check status");
    if (entry.conclusion !== null) string(entry.conclusion, "candidate CI check conclusion");
    if (entry.started_at !== null) string(entry.started_at, "candidate CI check started_at");
    if (entry.completed_at !== null) string(entry.completed_at, "candidate CI check completed_at");
  }
  if (new Set(value.check_runs.map((entry) => entry.id)).size !== value.check_runs.length) {
    fail("candidate CI check run identities are duplicated");
  }
  if (new Set(value.commit_statuses.map((entry) => entry.id)).size !== value.commit_statuses.length) {
    fail("candidate CI status identities are duplicated");
  }
  for (const [index, entry] of value.commit_statuses.entries()) {
    exactObject(entry, `candidate CI commit_statuses[${index}]`, [
      "id", "sha", "context", "created_at", "state", "updated_at",
    ]);
    safeInteger(entry.id, "candidate CI status id");
    if (entry.sha !== manifest.release_sha) {
      fail("candidate CI status identity is invalid");
    }
    string(entry.context, "candidate CI status context");
    string(entry.state, "candidate CI status state");
    if (entry.created_at !== null) string(entry.created_at, "candidate CI status created_at");
    if (entry.updated_at !== null) string(entry.updated_at, "candidate CI status updated_at");
  }
  let recomputedSummary;
  try {
    recomputedSummary = normalizeGitHubProductionReleaseCheckSummary({
      checkRuns: value.check_runs.map((entry) => ({
        id: entry.id,
        app: { id: entry.app_id },
        check_suite: { id: entry.check_suite_id },
        head_sha: entry.head_sha,
        completed_at: entry.completed_at,
        conclusion: entry.conclusion,
        name: entry.name,
        started_at: entry.started_at,
        status: entry.status,
      })),
      commitStatuses: value.commit_statuses,
      expectedContexts: EXPECTED_RELEASE_CONTEXTS,
    });
  } catch (error) {
    fail(`candidate CI canonical policy rejected stored arrays: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  if (canonicalizeJcs(recomputedSummary) !== canonicalizeJcs(value.summary)) {
    fail("candidate CI stored summary differs from canonical recomputation of check/status arrays");
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
    ["selection_digest", candidate.selection_digest, bundle.selection_digest],
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
    ["builder_input_digest", candidate.builder_input_digest, bundle.builder_input_digest],
    ["compose_source_digest", candidate.compose_source_digest, bundle.compose_source_digest],
    ["source_snapshot_digest", candidate.source_manifest_digest, bundle.source_snapshot_digest],
    ["sandbox_policy_digest", candidate.sandbox_policy_digest, bundle.sandbox_policy_digest],
    ["generated_build_inventory_digest", candidate.generated_build_inventory_digest, bundle.generated_build_inventory_digest],
    ["pnpm_store_snapshot_inventory_digest", candidate.pnpm_store_snapshot_inventory_digest, bundle.pnpm_store_snapshot_inventory_digest],
    ["pnpm_store_final_index_inventory_digest", candidate.pnpm_store_final_index_inventory_digest, bundle.pnpm_store_final_index_inventory_digest],
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

function portableCandidateFileInventory(entries) {
  return entries.map((entry) => {
    const portable = { ...entry };
    for (const field of ["uid", "gid", "nlink", "device", "inode", "ctime"]) delete portable[field];
    return portable;
  });
}

function candidatePhysicalIdentityDigest(bundleInventory, directoryInventory, storeIdentityDigest) {
  return sha256Jcs({
    schema: "homecook.local-mac-production-rehearsal-candidate-physical-identity.v2",
    bundle_file_inventory_digest: sha256Jcs(bundleInventory),
    directory_inventory_digest: sha256Jcs(directoryInventory),
    pnpm_store_physical_identity_digest: storeIdentityDigest,
  });
}

function readSealedDirectoryPhysicalIdentity(path, relativePath, currentUid) {
  const before = lstatSync(path, { bigint: true });
  if (
    !before.isDirectory() || before.isSymbolicLink()
    || before.uid !== BigInt(currentUid) || modeBits(before.mode) !== 0o500
    || realpathSync(path) !== path
  ) fail(`completed candidate directory authority is unsafe: ${relativePath}`);
  const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
  try {
    if (!samePnpmStoreIdentity(before, fstatSync(fd, { bigint: true }))) {
      fail(`completed candidate directory identity drifted before read: ${relativePath}`);
    }
    const entry = physicalDirectoryEntry(relativePath, before);
    if (
      !samePnpmStoreIdentity(before, fstatSync(fd, { bigint: true }))
      || !samePnpmStoreIdentity(before, lstatSync(path, { bigint: true }))
    ) fail(`completed candidate directory identity drifted during read: ${relativePath}`);
    return entry;
  } finally {
    closeSync(fd);
  }
}

function completedCandidatePhysicalAuthorityPath(root) {
  return `${root}.physical-authority.json`;
}

function readCompletedCandidatePortableRootWithIdentity(root, {
  afterPnpmStoreFileOpen = /** @type {null|((entry:{path:string,relativePath:string})=>void)} */ (null),
  verifyPortableContent = true,
} = {}) {
  if (!isAbsolute(root ?? "")) fail("completed candidate root must be absolute");
  if (resolve(root) !== root || realpathSync(root) !== root) {
    fail("completed candidate root path is not canonical");
  }
  const rootStat = lstatSync(root, { bigint: true });
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory() || (modeBits(rootStat.mode) & 0o222) !== 0) {
    fail("completed candidate root is not sealed");
  }
  const rootFd = openSync(root, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
  if (!samePnpmStoreIdentity(rootStat, fstatSync(rootFd, { bigint: true }))) {
    closeSync(rootFd);
    fail("completed candidate root identity drifted before read");
  }
  try {
  const candidateDirectories = [
    [root, "."],
    [join(root, "bundles"), "bundles"],
    [join(root, "bundles", "bundle"), "bundles/bundle"],
    [join(root, "evidence"), "evidence"],
    [join(root, "pnpm-store"), "pnpm-store"],
  ].map(([path, relativePath]) => readSealedDirectoryPhysicalIdentity(
    path,
    relativePath,
    Number(rootStat.uid),
  ));
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
  const storeSnapshot = pnpmStoreInventory(
    join(root, "pnpm-store", "v10"),
    Number(rootStat.uid),
    {
      requireSealed: true,
      verifyCafsContent: verifyPortableContent,
      afterFileOpen: afterPnpmStoreFileOpen,
    },
  );
  if (storeSnapshot.inventory_digest !== manifest.pnpm_store_snapshot_inventory_digest) {
    fail("completed candidate pnpm store portable inventory digest is invalid");
  }
  const finalIndexAuthority = pnpmStoreSubtreeAuthority(storeSnapshot, "index");
  if (finalIndexAuthority.inventory_digest !== manifest.pnpm_store_final_index_inventory_digest) {
    fail("completed candidate pnpm store final index inventory digest is invalid");
  }
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
  const bundleDirectories = [];
  const actualArtifacts = {};
  for (const component of ["app", "full_local", "worker"]) {
    const componentInventory = verifyPortableContent
      ? inventorySealedComponent(component, join(physicalBundleRoot, component))
      : inventoryStableSealedComponent(
        component,
        join(physicalBundleRoot, component),
        bundleManifest.file_inventory,
      );
    const entries = componentInventory.entries;
    actualInventory.push(...entries);
    bundleDirectories.push(...componentInventory.directories.map((entry) => ({
      ...entry,
      path: `bundles/bundle/${component}${entry.path === "." ? "" : `/${entry.path}`}`,
    })));
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
  const directoryInventory = [...candidateDirectories, ...bundleDirectories]
    .sort((left, right) => left.path.localeCompare(right.path));
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
    || canonicalizeJcs(portableCandidateFileInventory(actualInventory))
      !== canonicalizeJcs(portableCandidateFileInventory(bundleManifest.file_inventory))
    || actualSealedBundleDigest !== manifest.sealed_bundle_digest
    || physicalManifest.schema !== "homecook.local-mac-production-rehearsal-sealed-bundle.v1"
    || physicalManifest.bundle_content_digest !== actualSealedBundleDigest
    || physicalManifest.physical_manifest_digest !== sha256Jcs(physicalUnsigned)
    || canonicalizeJcs(physicalManifest.artifacts) !== canonicalizeJcs(actualArtifacts)
    || canonicalizeJcs(physicalManifest.file_inventory) !== canonicalizeJcs(actualPhysicalInventory)
  ) fail("candidate bundle authority manifest digest is invalid");
  const candidateIdentityDigest = sha256Jcs({
    schema: "homecook.local-mac-production-rehearsal-candidate-identity.v1",
    selection_digest: manifest.selection_digest,
    bundle_manifest_digest: manifest.bundle_manifest_digest,
    sealed_bundle_digest: manifest.sealed_bundle_digest,
  });
  if (
    candidateIdentityDigest !== manifest.candidate_identity_digest
    || candidateIdentityAuthority.candidate_identity_digest !== candidateIdentityDigest
    || complete.candidate_identity_digest !== candidateIdentityDigest
    || complete.manifest_digest !== manifest.manifest_digest
  ) fail("candidate complete identity binding is invalid");
  const rootAfter = lstatSync(root, { bigint: true });
  const fdAfter = fstatSync(rootFd, { bigint: true });
  if (
    !samePnpmStoreIdentity(rootStat, rootAfter)
    || !samePnpmStoreIdentity(rootStat, fdAfter)
    || rootAfter.isSymbolicLink()
    || realpathSync(root) !== root
  ) fail("completed candidate root identity drifted during read");
  return Object.freeze({
    complete,
    manifest,
    bundle_manifest: bundleManifest,
    physical_identity_digest: candidatePhysicalIdentityDigest(
      actualInventory,
      directoryInventory,
      storeSnapshot.identity_digest,
    ),
    pnpm_store_final_index_identity_digest: finalIndexAuthority.physical_identity_digest,
  });
  } finally {
    closeSync(rootFd);
  }
}

function readCompletedCandidatePhysicalAuthority(root, physicalAuthorityPath) {
  const canonicalAuthorityPath = completedCandidatePhysicalAuthorityPath(root);
  if (
    !isAbsolute(physicalAuthorityPath ?? "")
    || resolve(physicalAuthorityPath) !== physicalAuthorityPath
    || physicalAuthorityPath !== canonicalAuthorityPath
  ) fail("completed candidate physical authority must use the exact canonical sibling path");
  const authority = readSealedAuthorityFile(
    dirname(physicalAuthorityPath),
    physicalAuthorityPath,
    "completed candidate physical authority",
  );
  exactObject(authority, "completed candidate physical authority", [
    "schema", "authority_path_digest", "candidate_root_path_digest", "candidate_identity_digest",
    "manifest_digest", "pnpm_store_snapshot_inventory_digest",
    "pnpm_store_final_index_inventory_digest", "pnpm_store_final_index_identity_digest",
    "physical_identity_digest",
    "authority_digest",
  ]);
  const { authority_digest: authorityDigest, ...unsigned } = authority;
  if (
    authority.schema !== "homecook.local-mac-production-rehearsal-candidate-physical-authority.v2"
    || authority.authority_path_digest !== sha256Jcs(physicalAuthorityPath)
    || authorityDigest !== sha256Jcs(unsigned)
  ) fail("completed candidate root-local physical authority is stale or invalid");
  return authority;
}

function readCompletedCandidateWithPhysicalAuthority(root, {
  physicalAuthorityPath = completedCandidatePhysicalAuthorityPath(root),
  afterPnpmStoreFileOpen = /** @type {null|((entry:{path:string,relativePath:string,contentVerified?:boolean})=>void)} */ (null),
  verifyPortableContent = true,
} = {}) {
  const authority = readCompletedCandidatePhysicalAuthority(root, physicalAuthorityPath);
  const portable = readCompletedCandidatePortableRootWithIdentity(root, {
    afterPnpmStoreFileOpen,
    verifyPortableContent,
  });
  if (
    authority.candidate_root_path_digest !== sha256Jcs(root)
    || authority.candidate_identity_digest !== portable.manifest.candidate_identity_digest
    || authority.manifest_digest !== portable.manifest.manifest_digest
    || authority.pnpm_store_snapshot_inventory_digest
      !== portable.manifest.pnpm_store_snapshot_inventory_digest
    || authority.pnpm_store_final_index_inventory_digest
      !== portable.manifest.pnpm_store_final_index_inventory_digest
    || authority.pnpm_store_final_index_identity_digest
      !== portable.pnpm_store_final_index_identity_digest
    || authority.physical_identity_digest !== portable.physical_identity_digest
  ) fail("completed candidate root-local physical authority is stale or invalid");
  return Object.freeze({
    complete: portable.complete,
    manifest: portable.manifest,
    bundle_manifest: portable.bundle_manifest,
  });
}

/**
 * @param {{candidateRoot:string,authorityPath:string,afterPnpmStoreFileOpen?:null|((entry:{path:string,relativePath:string,contentVerified?:boolean})=>void)}} options
 */
export function issueCompletedCandidatePhysicalAuthority({
  candidateRoot,
  authorityPath,
  afterPnpmStoreFileOpen = /** @type {null|((entry:{path:string,relativePath:string,contentVerified?:boolean})=>void)} */ (null),
} = {}) {
  const canonicalAuthorityPath = completedCandidatePhysicalAuthorityPath(candidateRoot);
  if (
    !isAbsolute(authorityPath ?? "") || resolve(authorityPath) !== authorityPath
    || authorityPath !== canonicalAuthorityPath
  ) {
    fail("completed candidate physical authority must use the exact canonical sibling path");
  }
  const currentUid = process.getuid?.();
  if (!Number.isInteger(currentUid) || currentUid < 0) fail("current uid is unavailable");
  assertPrivateParent(authorityPath, currentUid);
  const portable = readCompletedCandidatePortableRootWithIdentity(candidateRoot, {
    afterPnpmStoreFileOpen,
    verifyPortableContent: true,
  });
  const unsigned = {
    schema: "homecook.local-mac-production-rehearsal-candidate-physical-authority.v2",
    authority_path_digest: sha256Jcs(authorityPath),
    candidate_root_path_digest: sha256Jcs(candidateRoot),
    candidate_identity_digest: portable.manifest.candidate_identity_digest,
    manifest_digest: portable.manifest.manifest_digest,
    pnpm_store_snapshot_inventory_digest: portable.manifest.pnpm_store_snapshot_inventory_digest,
    pnpm_store_final_index_inventory_digest: portable.manifest.pnpm_store_final_index_inventory_digest,
    pnpm_store_final_index_identity_digest: portable.pnpm_store_final_index_identity_digest,
    physical_identity_digest: portable.physical_identity_digest,
  };
  const authority = Object.freeze({ ...unsigned, authority_digest: sha256Jcs(unsigned) });
  try {
    writeFileSync(authorityPath, canonicalizeJcs(authority), { flag: "wx", mode: 0o400 });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      fail("completed candidate physical authority create-only collision");
    }
    throw error;
  }
  return Object.freeze({ authority, authority_path: authorityPath });
}

export function readCompletedCandidateRoot(root, {
  physicalAuthorityPath = completedCandidatePhysicalAuthorityPath(root),
  afterPnpmStoreFileOpen = /** @type {null|((entry:{path:string,relativePath:string,contentVerified?:boolean})=>void)} */ (null),
} = {}) {
  return readCompletedCandidateWithPhysicalAuthority(root, {
    physicalAuthorityPath,
    afterPnpmStoreFileOpen,
    verifyPortableContent: true,
  });
}

export function verifyCompletedCandidatePhysicalStability(root, {
  physicalAuthorityPath = completedCandidatePhysicalAuthorityPath(root),
  afterPnpmStoreFileOpen = /** @type {null|((entry:{path:string,relativePath:string,contentVerified?:boolean})=>void)} */ (null),
} = {}) {
  return readCompletedCandidateWithPhysicalAuthority(root, {
    physicalAuthorityPath,
    afterPnpmStoreFileOpen,
    verifyPortableContent: false,
  });
}

export function completedCandidateContainerAuthorityRoot(root) {
  if (!isAbsolute(root ?? "") || resolve(root) !== root) {
    fail("completed candidate container authority requires an absolute canonical candidate root");
  }
  return `${root}.container-authority`;
}

function completedCandidateContainerAuthoritySourcePath(root) {
  return join(completedCandidateContainerAuthorityRoot(root), "authority.json");
}

function validateCompletedCandidateContainerAuthority(authority) {
  exactObject(authority, "completed candidate container authority", [
    "schema", "authority_source_path_digest", "container_candidate_root_path_digest",
    "container_authority_path_digest", "candidate_identity_digest", "manifest_digest",
    "bundle_manifest_digest", "sealed_bundle_digest", "pnpm_store_snapshot_inventory_digest",
    "pnpm_store_final_index_inventory_digest",
    "authority_digest",
  ]);
  const { authority_digest: authorityDigest, ...unsigned } = authority;
  if (
    authority.schema !== "homecook.local-mac-production-rehearsal-candidate-container-authority.v1"
    || !DIGEST_PATTERN.test(authority.authority_source_path_digest ?? "")
    || authorityDigest !== sha256Jcs(unsigned)
  ) fail("completed candidate container authority is stale or invalid");
  return authority;
}

function assertContainerAuthorityBindings(authority, {
  candidateRoot,
  authoritySourcePath = null,
  containerCandidateRoot,
  containerAuthorityPath,
  manifest,
}) {
  if (
    authority.container_candidate_root_path_digest !== sha256Jcs(containerCandidateRoot)
    || authority.container_authority_path_digest !== sha256Jcs(containerAuthorityPath)
    || (authoritySourcePath !== null
      && authority.authority_source_path_digest !== sha256Jcs(authoritySourcePath))
    || authority.candidate_identity_digest !== manifest.candidate_identity_digest
    || authority.manifest_digest !== manifest.manifest_digest
    || authority.bundle_manifest_digest !== manifest.bundle_manifest_digest
    || authority.sealed_bundle_digest !== manifest.sealed_bundle_digest
    || authority.pnpm_store_snapshot_inventory_digest
      !== manifest.pnpm_store_snapshot_inventory_digest
    || authority.pnpm_store_final_index_inventory_digest
      !== manifest.pnpm_store_final_index_inventory_digest
    || !isAbsolute(candidateRoot ?? "")
  ) fail("completed candidate container authority binding is stale or invalid");
}

export function verifyCompletedCandidateContainerAuthoritySource({
  candidateRoot,
  containerCandidateRoot,
  containerAuthorityPath,
  manifest,
} = {}) {
  if (
    !isAbsolute(containerCandidateRoot ?? "") || resolve(containerCandidateRoot) !== containerCandidateRoot
    || !isAbsolute(containerAuthorityPath ?? "") || resolve(containerAuthorityPath) !== containerAuthorityPath
  ) fail("completed candidate container authority paths must be absolute and canonical");
  const authoritySourcePath = completedCandidateContainerAuthoritySourcePath(candidateRoot);
  const authority = validateCompletedCandidateContainerAuthority(readSealedAuthorityFile(
    dirname(authoritySourcePath),
    authoritySourcePath,
    "completed candidate container authority source",
  ));
  assertContainerAuthorityBindings(authority, {
    candidateRoot,
    authoritySourcePath,
    containerCandidateRoot,
    containerAuthorityPath,
    manifest,
  });
  return Object.freeze({ authority, authority_path: authoritySourcePath });
}

export function issueCompletedCandidateContainerAuthority({
  candidateRoot,
  containerCandidateRoot,
  containerAuthorityPath,
  afterPnpmStoreFileOpen = /** @type {null|((entry:{path:string,relativePath:string,contentVerified?:boolean})=>void)} */ (null),
} = {}) {
  if (
    !isAbsolute(containerCandidateRoot ?? "") || resolve(containerCandidateRoot) !== containerCandidateRoot
    || !isAbsolute(containerAuthorityPath ?? "") || resolve(containerAuthorityPath) !== containerAuthorityPath
  ) fail("completed candidate container authority paths must be absolute and canonical");
  const currentUid = process.getuid?.();
  if (!Number.isInteger(currentUid) || currentUid < 0) fail("current uid is unavailable");
  const authorityRoot = completedCandidateContainerAuthorityRoot(candidateRoot);
  const authoritySourcePath = completedCandidateContainerAuthoritySourcePath(candidateRoot);
  try {
    mkdirSync(authorityRoot, { mode: 0o700 });
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EEXIST") {
      fail("completed candidate container authority create-only collision");
    }
    throw error;
  }
  const stable = verifyCompletedCandidatePhysicalStability(candidateRoot, {
    afterPnpmStoreFileOpen,
  });
  const unsigned = {
    schema: "homecook.local-mac-production-rehearsal-candidate-container-authority.v1",
    authority_source_path_digest: sha256Jcs(authoritySourcePath),
    container_candidate_root_path_digest: sha256Jcs(containerCandidateRoot),
    container_authority_path_digest: sha256Jcs(containerAuthorityPath),
    candidate_identity_digest: stable.manifest.candidate_identity_digest,
    manifest_digest: stable.manifest.manifest_digest,
    bundle_manifest_digest: stable.manifest.bundle_manifest_digest,
    sealed_bundle_digest: stable.manifest.sealed_bundle_digest,
    pnpm_store_snapshot_inventory_digest: stable.manifest.pnpm_store_snapshot_inventory_digest,
    pnpm_store_final_index_inventory_digest: stable.manifest.pnpm_store_final_index_inventory_digest,
  };
  const authority = Object.freeze({ ...unsigned, authority_digest: sha256Jcs(unsigned) });
  try {
    writeFileSync(authoritySourcePath, canonicalizeJcs(authority), { flag: "wx", mode: 0o400 });
    chmodSync(authorityRoot, 0o500);
  } catch (error) {
    fail(`completed candidate container authority issuance failed: ${error?.message ?? error?.code ?? "unknown"}`);
  }
  verifyCompletedCandidateContainerAuthoritySource({
    candidateRoot,
    containerCandidateRoot,
    containerAuthorityPath,
    manifest: stable.manifest,
  });
  return Object.freeze({
    authority,
    authority_path: authoritySourcePath,
    candidate: stable,
  });
}

export function readCompletedCandidateContainerRoot(root, {
  containerAuthorityPath,
  afterPnpmStoreFileOpen = /** @type {null|((entry:{path:string,relativePath:string,contentVerified?:boolean})=>void)} */ (null),
} = {}) {
  if (
    !isAbsolute(containerAuthorityPath ?? "")
    || resolve(containerAuthorityPath) !== containerAuthorityPath
  ) fail("completed candidate container authority path must be absolute and canonical");
  const authority = validateCompletedCandidateContainerAuthority(readSealedAuthorityFile(
    dirname(containerAuthorityPath),
    containerAuthorityPath,
    "completed candidate container authority",
  ));
  const portable = readCompletedCandidatePortableRootWithIdentity(root, {
    afterPnpmStoreFileOpen,
    verifyPortableContent: true,
  });
  assertContainerAuthorityBindings(authority, {
    candidateRoot: root,
    containerCandidateRoot: root,
    containerAuthorityPath,
    manifest: portable.manifest,
  });
  return Object.freeze({
    complete: portable.complete,
    manifest: portable.manifest,
    bundle_manifest: portable.bundle_manifest,
  });
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
 *   selectionDigest?: string | null,
 *   sourceAuthority?: any,
 *   beforeComplete: (authority: any) => Promise<any> | any,
 * }} options
 * @returns {Promise<{candidate_root:string, manifest:any}>}
 */
export async function buildReleaseRehearsalCandidate({
  releaseSha,
  namespaceRoot,
  adapters = /** @type {any} */ (createReleaseRehearsalCandidateAdapters()),
  runId,
  currentUid = process.getuid?.(),
  selectionDigest = null,
  sourceAuthority = null,
  beforeComplete,
} = {}) {
  sha(releaseSha, "releaseSha");
  nullableDigest(selectionDigest, "selectionDigest");
  if (selectionDigest !== null) {
    exactObject(sourceAuthority, "selected source authority", [
      "mode", "release_sha", "release_tree", "selection_digest",
      "observed_master_sha", "observed_master_tree", "current_master_sha", "current_master_tree",
    ]);
    if (sourceAuthority.mode !== "approved_ancestor" || sourceAuthority.release_sha !== releaseSha
      || sourceAuthority.selection_digest !== selectionDigest) {
      fail("selected source authority does not match the approved selection");
    }
    sha(sourceAuthority.release_tree, "selected source authority release_tree");
    for (const key of ["observed_master_sha", "observed_master_tree", "current_master_sha", "current_master_tree"]) {
      sha(sourceAuthority[key], `selected source authority ${key}`);
    }
  }
  if (!isAbsolute(namespaceRoot ?? "")) fail("candidate namespace root must be absolute");
  if (!Number.isInteger(currentUid) || currentUid < 0) fail("current uid is unavailable");
  string(runId, "runId");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(runId)) {
    fail("runId must be a cryptorandom UUID v4");
  }
  if (typeof beforeComplete !== "function") fail("immutable beforeComplete guard is required");
  const root = realpathSync(namespaceRoot);
  const rootStat = lstatSync(root);
  if (rootStat.isSymbolicLink() || rootStat.uid !== currentUid || modeBits(rootStat.mode) !== 0o700) {
    fail("candidate namespace root must be private and must not be a symlink");
  }
  const attemptsRoot = ensureNamespaceDirectory(join(root, "attempts"), currentUid, "candidate attempts root");
  const runRoot = join(attemptsRoot, runId);
  const physicalAuthorityPath = completedCandidatePhysicalAuthorityPath(runRoot);
  const runIdentity = reserveRunRoot(runRoot, currentUid);
  let productionPre = null;
  let productionGuard = null;
  let result;
  let failure = null;
  let physicalAuthorityCreated = false;
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
    const ci = validateStableCiSnapshots(ciPre, ciPost, releaseSha, { selectionDigest });
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
    const generatedInventoryDigest = generatedBuildInventoryDigest(build.file_inventory);
    const pnpmStoreSnapshotInventoryDigest = digest(
      build.pnpm_store_snapshot_inventory_digest,
      "pnpm store snapshot inventory digest",
    );
    const pnpmStoreFinalIndexInventoryDigest = digest(
      build.pnpm_store_final_index_inventory_digest,
      "pnpm store final index inventory digest",
    );
    exactObject(build.build_tools, "build tools", ["next_cli"]);
    validateToolIdentity(build.build_tools.next_cli, "build tools next_cli", {
      requireExecutable: false,
    });
    const bundleAuthorityManifest = buildBundleAuthorityManifest({
      repository: REPOSITORY,
      source_ref: SOURCE_REF,
      selection_digest: selectionDigest,
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
      generated_build_inventory_digest: generatedInventoryDigest,
      pnpm_store_snapshot_inventory_digest: pnpmStoreSnapshotInventoryDigest,
      pnpm_store_final_index_inventory_digest: pnpmStoreFinalIndexInventoryDigest,
      sealed_bundle_digest: sealedBundleDigest,
      source_snapshot_digest: sourceEvidence.source_snapshot_pre_digest,
      source_manifest_digest: sourceEvidence.source_snapshot_pre_digest,
      builder_input_digest: sourceEvidence.builder_input_digest,
      compose_source_digest: composeSourceDigest,
      toolchain,
      toolchain_lock_digest: toolchainLock.toolchain_lock_digest,
      production_guard: productionGuard,
    });
    const candidateIdentityDigest = sha256Jcs({
      schema: "homecook.local-mac-production-rehearsal-candidate-identity.v1",
      selection_digest: selectionDigest,
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
      selection_digest: selectionDigest,
      release_sha: releaseSha,
      release_tree: sourceEvidence.release_tree,
      ci_check_summary_digest: ci.summary_digest,
      ci_snapshot_digest: ci.safe_projection_digest,
      ci_suite_run_set_digest: ci.suite_run_set_digest,
      source_manifest_digest: sourceEvidence.source_snapshot_pre_digest,
      builder_input_digest: sourceEvidence.builder_input_digest,
      compose_source_digest: composeSourceDigest,
      sandbox_policy_digest: sandboxPolicyDigest,
      generated_build_inventory_digest: generatedInventoryDigest,
      pnpm_store_snapshot_inventory_digest: pnpmStoreSnapshotInventoryDigest,
      pnpm_store_final_index_inventory_digest: pnpmStoreFinalIndexInventoryDigest,
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
    const completionAuthority = await beforeComplete({
      builder_input_digest: manifest.builder_input_digest,
      candidate_identity_digest: manifest.candidate_identity_digest,
      manifest_digest: manifest.manifest_digest,
      run_root: runRoot,
    });
    exactObject(completionAuthority, "immutable completion authority", [
      "builder_input_digest", "verified",
    ]);
    digest(completionAuthority.builder_input_digest, "immutable completion builder input digest");
    if (
      completionAuthority.verified !== true
      || completionAuthority.builder_input_digest !== manifest.builder_input_digest
    ) fail("immutable completion authority does not match the candidate builder graph");
    assertRunRootIdentity(runRoot, attemptsRoot, runIdentity, currentUid);
    writeCandidateTerminalMarker(runRoot, "complete", {
      candidate_identity_digest: manifest.candidate_identity_digest,
      manifest_digest: manifest.manifest_digest,
    });
    chmodSync(runRoot, 0o500);
    if (typeof adapters.finalizeBundleAddress === "function") {
      issueCompletedCandidatePhysicalAuthority({
        candidateRoot: runRoot,
        authorityPath: physicalAuthorityPath,
      });
      physicalAuthorityCreated = true;
    }
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
    if (physicalAuthorityCreated) rmSync(physicalAuthorityPath, { force: false });
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

export function materializeSandboxProcessWitness({
  clangPath = "/usr/bin/clang",
  nodePath = process.execPath,
  outputPath,
  sourcePath: requestedSourcePath = null,
  preloadSourcePath: requestedPreloadSourcePath = null,
  runCommand = spawnSync,
} = /** @type {any} */ ({})) {
  if (process.platform !== "darwin") fail("sandbox process witness requires macOS");
  if (!isAbsolute(outputPath ?? "") || pathExists(outputPath)) {
    fail("sandbox process witness output must be a fresh absolute path");
  }
  const sourcePath = requestedSourcePath === null
    ? resolve(dirname(fileURLToPath(import.meta.url)), "../native/local-mac-sandbox-process-witness.c")
    : resolve(requestedSourcePath);
  const preloadSourcePath = requestedPreloadSourcePath === null
    ? resolve(dirname(fileURLToPath(import.meta.url)), "../native/local-mac-sandbox-process-witness-preload.cjs")
    : resolve(requestedPreloadSourcePath);
  if (!isAbsolute(sourcePath) || !isAbsolute(preloadSourcePath)) {
    fail("sandbox process witness sources must be absolute");
  }
  const preloadPath = `${outputPath}.cjs`;
  const realClang = resolveSafeRealExecutable([clangPath], "sandbox process witness clang");
  const realNode = realpathSync(nodePath);
  const nodeInclude = resolve(dirname(realNode), "../include/node");
  const headerPath = join(nodeInclude, "node_api.h");
  const sourcePre = snapshotToolFile(sourcePath, "sandbox-process-witness-source", { requireExecutable: false });
  const preloadSourcePre = snapshotToolFile(
    preloadSourcePath,
    "sandbox-process-witness-preload-source",
    { requireExecutable: false },
  );
  const clangPre = snapshotToolFile(realClang, "sandbox-process-witness-clang");
  const nodePre = snapshotToolFile(realNode, "sandbox-process-witness-node");
  const headerPre = snapshotToolFile(
    headerPath,
    "sandbox-process-witness-node-api-header",
    { requireExecutable: false },
  );
  const built = spawnBounded(realClang, [
    "-bundle", "-undefined", "dynamic_lookup", "-O2", "-std=c11",
    "-Wno-deprecated-declarations", "-I", nodeInclude,
    sourcePath, "-o", outputPath, "-lsandbox",
  ], {
    cwd: dirname(outputPath),
    env: { HOME: dirname(outputPath), PATH: "/usr/bin:/bin" },
    runCommand,
    timeout: 60_000,
  });
  if (built.error || built.signal || built.status !== 0) {
    fail("sandbox process witness compilation failed closed");
  }
  chmodSync(outputPath, 0o400);
  writeFileSync(preloadPath, readFileSync(preloadSourcePath), { flag: "wx", mode: 0o400 });
  const output = snapshotToolFile(realpathSync(outputPath), "sandbox-process-witness-v1", { requireExecutable: false });
  const preload = snapshotToolFile(
    realpathSync(preloadPath),
    "sandbox-process-witness-preload-v1",
    { requireExecutable: false },
  );
  const controller = requireNativeWitness(output.realpath);
  if (
    typeof controller?.captureStoppedProcessInstance !== "function"
    || typeof controller?.signalOwnedProcessInstance !== "function"
    || typeof controller?.abortStoppedDirectChild !== "function"
    || typeof controller?.releaseOwnedProcessInstance !== "function"
  ) fail("sandbox process witness controller exports are unavailable");
  pinnedSandboxWitnessControllers.set(output.realpath, Object.freeze(controller));
  if (
    canonicalizeJcs(sourcePre) !== canonicalizeJcs(
      snapshotToolFile(sourcePath, "sandbox-process-witness-source", { requireExecutable: false }),
    )
    || canonicalizeJcs(preloadSourcePre) !== canonicalizeJcs(
      snapshotToolFile(
        preloadSourcePath,
        "sandbox-process-witness-preload-source",
        { requireExecutable: false },
      ),
    )
    || canonicalizeJcs(clangPre) !== canonicalizeJcs(
      snapshotToolFile(realClang, "sandbox-process-witness-clang"),
    )
    || canonicalizeJcs(nodePre) !== canonicalizeJcs(
      snapshotToolFile(realNode, "sandbox-process-witness-node"),
    )
    || canonicalizeJcs(headerPre) !== canonicalizeJcs(
      snapshotToolFile(
        headerPath,
        "sandbox-process-witness-node-api-header",
        { requireExecutable: false },
      ),
    )
  ) fail("sandbox process witness build inputs drifted");
  return Object.freeze({
    path: output.realpath,
    preload_path: preload.realpath,
    identity: output,
    identity_digest: sha256Jcs({ output, preload }),
    authority_digest: sha256Jcs({
      source: sourcePre,
      preload_source: preloadSourcePre,
      clang: clangPre,
      node: nodePre,
      node_api_header: headerPre,
      output,
      preload,
    }),
  });
}

function parseProcessTable(source, label) {
  const rows = [];
  for (const line of String(source ?? "").split("\n")) {
    if (line.trim().length === 0) continue;
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+([A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.+?)\s*$/u.exec(line);
    if (!match) fail(`${label} process discovery output is truncated or malformed`);
    const [, pidSource, ppidSource, pgidSource, state, startedAt, command] = match;
    const pid = Number(pidSource);
    const ppid = Number(ppidSource);
    const pgid = Number(pgidSource);
    if (![pid, ppid, pgid].every((value) => Number.isSafeInteger(value) && value >= 0)) {
      fail(`${label} process discovery identity is invalid`);
    }
    const normalizedCommand = command.trim();
    if (normalizedCommand.length === 0 || normalizedCommand.includes("\0")) {
      fail(`${label} process executable path is unavailable`);
    }
    rows.push({ pid, ppid, pgid, state, startedAt, command: normalizedCommand });
  }
  return rows;
}

export async function observeSandboxProcessTree({
  sandboxPath,
  profile,
  command,
  args,
  cwd,
  env,
  label,
  timeout,
  lsofPath = "/usr/sbin/lsof",
  psPath = "/bin/ps",
  pollCommand = spawnSync,
  spawnProcess = spawn,
  killProcess = process.kill.bind(process),
  pollIntervalMs = 20,
  maxOutputBytes = 8 * 1024 * 1024,
} = /** @type {any} */ ({})) {
  const observerToolsPre = Object.freeze({
    lsof: snapshotToolFile(lsofPath, "sandbox-process-observer-lsof"),
    ps: snapshotToolFile(psPath, "sandbox-process-observer-ps"),
  });
  const child = spawnProcess(sandboxPath, ["-p", profile, command, ...args], {
    cwd,
    detached: true,
    env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolveSpawn, rejectSpawn) => {
    child.once("spawn", resolveSpawn);
    child.once("error", rejectSpawn);
  }).catch(() => fail(`${label} sandbox root spawn failed closed`));
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0) {
    fail(`${label} sandbox root PID is unavailable`);
  }
  const rootPid = child.pid;
  const rootPgid = rootPid;
  const startedAt = Date.now();
  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);
  let outputOverflow = false;
  const appendOutput = (kind, chunk) => {
    const bytes = Buffer.from(chunk);
    if (kind === "stdout") stdout = Buffer.concat([stdout, bytes]);
    else stderr = Buffer.concat([stderr, bytes]);
    if (stdout.length > maxOutputBytes || stderr.length > maxOutputBytes) outputOverflow = true;
  };
  child.stdout?.on("data", (chunk) => appendOutput("stdout", chunk));
  child.stderr?.on("data", (chunk) => appendOutput("stderr", chunk));
  let exitResult = null;
  const exitPromise = new Promise((resolveExit) => {
    child.once("exit", (code, signal) => {
      exitResult = { code, signal, error: null };
      resolveExit(exitResult);
    });
    child.once("error", (error) => {
      exitResult = { code: null, signal: null, error };
      resolveExit(exitResult);
    });
  });
  const registeredPids = new Set([rootPid]);
  const registeredStarts = new Map();
  const registeredCommands = new Map();
  const processIdentities = new Map();
  const executableCache = new Map();
  let rootObserved = false;
  let escapedProcessCount = 0;
  const processRows = () => {
    const result = spawnBounded(psPath, [
      "-axo", "pid=,ppid=,pgid=,state=,lstart=,ucomm=",
    ], {
      cwd,
      env: {
        HOME: env.HOME,
        LANG: "C",
        LC_ALL: "C",
        PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      },
      timeout: 5_000,
      runCommand: pollCommand,
    });
    if (result.error || result.signal || result.status !== 0 || String(result.stdout ?? "").length === 0) {
      fail(`${label} process discovery failed closed`);
    }
    return parseProcessTable(result.stdout, label);
  };
  const targetedProcessRows = () => {
    const targets = [...registeredPids].sort((left, right) => left - right);
    if (targets.length === 0) return [];
    const result = spawnBounded(psPath, [
      "-p", targets.join(","),
      "-o", "pid=,ppid=,pgid=,state=,lstart=,ucomm=",
    ], {
      cwd,
      env: {
        HOME: env.HOME,
        LANG: "C",
        LC_ALL: "C",
        PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      },
      timeout: 5_000,
      runCommand: pollCommand,
    });
    if (result.status === 1 && !result.error && !result.signal && String(result.stdout ?? "").trim() === "") {
      return [];
    }
    if (result.error || result.signal || result.status !== 0) {
      fail(`${label} targeted process discovery failed closed`);
    }
    return parseProcessTable(result.stdout, label);
  };
  const executableDigest = (pid, observedCommand) => {
    const observedBasename = basename(observedCommand).replace(/^\((.+)\)$/u, "$1");
    let executablePath = observedCommand;
    if (pid === rootPid && observedBasename === basename(sandboxPath)) {
      executablePath = sandboxPath;
    } else if (pid === rootPid && observedBasename === basename(command)) {
      executablePath = command;
    }
    if (!isAbsolute(executablePath) || !pathExists(executablePath)) {
      const lsof = spawnBounded(lsofPath, ["-a", "-p", String(pid), "-d", "txt", "-Fn"], {
        cwd,
        env: { HOME: env.HOME, PATH: "/usr/bin:/bin:/usr/sbin:/sbin" },
        timeout: 5_000,
        runCommand: pollCommand,
      });
      if (lsof.error || lsof.signal) {
        fail(`${label} process executable discovery failed closed`);
      }
      if (lsof.status !== 0) return null;
      const candidates = String(lsof.stdout ?? "").split("\n")
        .filter((line) => line.startsWith("n/"))
        .map((line) => line.slice(1));
      if (lsof.status === 0) {
        if (candidates.length < 1) return null;
        else {
          executablePath = candidates.find((candidate) => basename(candidate) === observedBasename)
            ?? candidates[0];
        }
      }
    }
    const realpath = realpathSync(executablePath);
    const cached = executableCache.get(realpath);
    if (cached) return cached;
    const identity = snapshotToolFile(realpath, `sandbox-process:${basename(realpath)}`);
    const value = sha256Jcs(identity);
    executableCache.set(realpath, value);
    return value;
  };
  const registerRows = (rows) => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of rows) {
        if (
          row.pid === rootPid
          || row.pgid === rootPgid
          || registeredPids.has(row.ppid)
        ) {
          if (!registeredPids.has(row.pid)) {
            registeredPids.add(row.pid);
            registeredStarts.set(row.pid, row.startedAt);
            registeredCommands.set(row.pid, row.command);
            changed = true;
          }
        }
      }
    }
    for (const row of rows) {
      if (!registeredPids.has(row.pid)) continue;
      const registeredStart = registeredStarts.get(row.pid);
      if (registeredStart && registeredStart !== row.startedAt) {
        fail(`${label} registered process PID was reused`);
      }
      registeredStarts.set(row.pid, row.startedAt);
      registeredCommands.set(row.pid, row.command);
      if (row.pid === rootPid) rootObserved = true;
      if (row.pid !== rootPid && row.pgid !== rootPgid) escapedProcessCount += 1;
      const identityDigest = executableDigest(row.pid, row.command);
      if (!identityDigest) continue;
      processIdentities.set(`${row.pid}:${identityDigest}`, {
        pid: row.pid,
        ppid: row.ppid,
        pgid: row.pgid,
        started_at: row.startedAt,
        executable_identity_digest: identityDigest,
      });
    }
  };
  const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
  let cleanupPidReuseDetected = false;
  const currentRegisteredRows = () => {
    let rows;
    try {
      rows = processRows();
    } catch {
      rows = targetedProcessRows();
      return rows.filter((row) => {
        if (!registeredPids.has(row.pid)) return false;
        if (registeredStarts.get(row.pid) !== row.startedAt) {
          cleanupPidReuseDetected = true;
          return false;
        }
        return true;
      });
    }
    registerRows(rows);
    return rows.filter((row) => {
      if (!registeredPids.has(row.pid)) return false;
      if (registeredStarts.get(row.pid) !== row.startedAt) {
        cleanupPidReuseDetected = true;
        return false;
      }
      return true;
    });
  };
  const signalRegistered = (signal) => {
    const current = currentRegisteredRows();
    if (current.some((row) => row.pgid === rootPgid)) {
      try { killProcess(-rootPgid, signal); } catch (error) {
        if (!(error && typeof error === "object" && error.code === "ESRCH")) throw error;
      }
    }
    for (const row of current.filter((entry) => entry.pgid !== rootPgid)) {
      try { killProcess(row.pid, signal); } catch (error) {
        if (!(error && typeof error === "object" && error.code === "ESRCH")) throw error;
      }
    }
  };
  const terminateRegistered = async () => {
    signalRegistered("SIGTERM");
    await delay(100);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      signalRegistered("SIGKILL");
      await delay(100);
      const residues = currentRegisteredRows();
      if (residues.length === 0) {
        if (cleanupPidReuseDetected) fail(`${label} registered process PID was reused during cleanup`);
        return;
      }
    }
    fail(`${label} process group cleanup was incomplete`);
  };
  let timedOut = false;
  try {
    while (!exitResult) {
      registerRows(processRows());
      if (outputOverflow || Date.now() - startedAt > timeout) {
        timedOut = true;
        await terminateRegistered();
        break;
      }
      await Promise.race([exitPromise, delay(pollIntervalMs)]);
    }
    await exitPromise;
    const finalRows = processRows();
    registerRows(finalRows);
    const survivors = finalRows.filter((row) => (
      row.pid !== rootPid
      && registeredPids.has(row.pid)
      && !row.state.startsWith("Z")
    ));
    if (survivors.length > 0 || escapedProcessCount > 0) {
      await terminateRegistered();
    }
    if (!rootObserved) fail(`${label} sandbox root was never observed by process discovery`);
    const identifiedPids = new Set([...processIdentities.values()].map((identity) => identity.pid));
    const unidentifiedPids = [...registeredPids].filter((pid) => !identifiedPids.has(pid));
    if (unidentifiedPids.length > 0) {
      const projection = unidentifiedPids
        .map((pid) => `${pid}:${registeredCommands.get(pid) ?? "unknown"}`)
        .join(",");
      fail(`${label} process executable identity remained unavailable (${projection})`);
    }
    const observerToolsPost = Object.freeze({
      lsof: snapshotToolFile(lsofPath, "sandbox-process-observer-lsof"),
      ps: snapshotToolFile(psPath, "sandbox-process-observer-ps"),
    });
    if (canonicalizeJcs(observerToolsPost) !== canonicalizeJcs(observerToolsPre)) {
      fail(`${label} process observer tool identity drifted`);
    }
    return Object.freeze({
      error: timedOut || outputOverflow ? new Error("sandbox process tree failed closed") : exitResult?.error,
      signal: exitResult?.signal ?? null,
      status: timedOut || outputOverflow ? null : exitResult?.code,
      stdout: stdout.toString("utf8"),
      stderr: stderr.toString("utf8"),
      pid: rootPid,
      root_pgid: rootPgid,
      observer_tool_identity_digest: sha256Jcs(observerToolsPost),
      process_tree_complete: true,
      process_identities: [...processIdentities.values()].sort((left, right) => (
        left.pid - right.pid
        || left.executable_identity_digest.localeCompare(right.executable_identity_digest)
      )),
      escaped_process_count: escapedProcessCount,
      surviving_process_count: survivors.length,
    });
  } catch (error) {
    await terminateRegistered().catch(() => {
      if (!exitResult) {
        try { killProcess(-rootPgid, "SIGKILL"); } catch { /* Discovery already failed closed. */ }
      }
    });
    throw error;
  }
}

export async function signalWitnessedProcessInstance({
  pid,
  signal,
  witness,
  verifyProcessInstance,
  signalProcess,
}) {
  if (typeof verifyProcessInstance !== "function" || typeof signalProcess !== "function") {
    fail("witnessed process instance signal boundary is invalid");
  }
  if (!await verifyProcessInstance({ pid, signal, witness })) {
    fail("witnessed process instance changed before signal; PID reuse is preserved");
  }
  signalProcess(pid, signal);
}

function signalLiveProcessInstance(controller, witness, signal, label) {
  const signalNumber = signal === "SIGTERM" ? 15 : signal === "SIGKILL" ? 9 : null;
  if (signalNumber === null) fail(`${label} process termination signal is invalid`);
  if (controller.signalOwnedProcessInstance(witness.pid, signalNumber) !== true) return;
}

export async function observeWitnessedSandboxRoot({
  profile,
  command,
  args,
  cwd,
  env,
  label,
  timeout,
  sandboxWitnessPath,
  spawnProcess = spawn,
  afterExecutableSnapshot = () => undefined,
  afterTrustedProcessStart = () => undefined,
  transformInitialWitnessChunk = (chunk) => chunk,
  initialWitnessTimeout = 5_000,
  maxOutputBytes = 8 * 1024 * 1024,
  offlineDnsProjection = false,
}) {
  if (
    typeof profile !== "string" || profile.length === 0
    || !isAbsolute(command ?? "") || !isAbsolute(sandboxWitnessPath ?? "")
    || !Array.isArray(args) || args.some((arg) => typeof arg !== "string")
  ) fail(`${label} witnessed sandbox input is invalid`);
  if (!profile.split("\n").some((line) => line.startsWith("(deny process-fork"))) {
    fail(`${label} sandbox profile does not deny every child creation`);
  }
  const executablePre = snapshotToolFile(command, `sandbox-root-executable:${label}`);
  const witnessPre = snapshotToolFile(
    sandboxWitnessPath,
    `sandbox-process-witness:${label}`,
    { requireExecutable: false },
  );
  const witnessPreloadPath = `${sandboxWitnessPath}.cjs`;
  const witnessPreloadPre = snapshotToolFile(
    witnessPreloadPath,
    `sandbox-process-witness-preload:${label}`,
    { requireExecutable: false },
  );
  const controller = pinnedSandboxWitnessControllers.get(sandboxWitnessPath);
  if (!controller) fail(`${label} sandbox process witness controller is not pinned`);
  if (
    typeof afterExecutableSnapshot !== "function"
    || typeof afterTrustedProcessStart !== "function"
    || typeof transformInitialWitnessChunk !== "function"
    || !Number.isSafeInteger(initialWitnessTimeout) || initialWitnessTimeout < 1 || initialWitnessTimeout > 5_000
  ) {
    fail(`${label} executable snapshot continuation is invalid`);
  }
  afterExecutableSnapshot();
  const existingNodeOptions = String(env.NODE_OPTIONS ?? "").trim();
  if (existingNodeOptions.includes("--require") || /\s/u.test(sandboxWitnessPath)) {
    fail(`${label} sandbox witness preload authority is ambiguous`);
  }
  const childEnv = { ...env };
  delete childEnv.HOMECOOK_OFFLINE_DNS_PROJECTION;
  if (offlineDnsProjection) childEnv.HOMECOOK_OFFLINE_DNS_PROJECTION = "1";
  const child = spawnProcess(command, args, {
    cwd,
    detached: true,
    env: {
      ...childEnv,
      HOMECOOK_SANDBOX_PROFILE_FD: "3",
      HOMECOOK_SANDBOX_WITNESS_FD: "4",
      HOMECOOK_SANDBOX_WITNESS_MODULE: sandboxWitnessPath,
      NODE_OPTIONS: [existingNodeOptions, `--require=${witnessPreloadPath}`].filter(Boolean).join(" "),
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe", "pipe", "pipe"],
  });
  await new Promise((resolveSpawn, rejectSpawn) => {
    child.once("spawn", resolveSpawn);
    child.once("error", rejectSpawn);
  }).catch(() => fail(`${label} witnessed sandbox root spawn failed closed`));
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0) {
    fail(`${label} witnessed sandbox root PID is unavailable`);
  }
  const rootPid = child.pid;
  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);
  let witnessBytes = Buffer.alloc(0);
  let outputOverflow = false;
  const append = (kind, chunk) => {
    const bytes = Buffer.from(chunk);
    if (kind === "stdout") stdout = Buffer.concat([stdout, bytes]);
    else if (kind === "stderr") stderr = Buffer.concat([stderr, bytes]);
    else witnessBytes = Buffer.concat([witnessBytes, bytes]);
    if (
      stdout.length > maxOutputBytes || stderr.length > maxOutputBytes
      || witnessBytes.length > 64 * 1024
    ) outputOverflow = true;
  };
  child.stdout?.on("data", (chunk) => append("stdout", chunk));
  child.stderr?.on("data", (chunk) => append("stderr", chunk));
  let resolveInitialWitness;
  const initialWitness = new Promise((resolveWitness) => {
    resolveInitialWitness = resolveWitness;
  });
  let pendingInitialWitness = Buffer.alloc(0);
  let initialWitnessTransformed = false;
  child.stdio?.[4]?.on("data", (chunk) => {
    if (!initialWitnessTransformed) {
      pendingInitialWitness = Buffer.concat([pendingInitialWitness, Buffer.from(chunk)]);
      if (!pendingInitialWitness.includes(0x0a)) return;
      initialWitnessTransformed = true;
      append("witness", transformInitialWitnessChunk(pendingInitialWitness));
      pendingInitialWitness = Buffer.alloc(0);
    } else {
      append("witness", chunk);
    }
    if (witnessBytes.includes(0x0a)) resolveInitialWitness(true);
  });
  child.stdio?.[3]?.end(profile, "utf8");
  let exitResult = null;
  const exitPromise = new Promise((resolveExit) => {
    child.once("exit", (code, signal) => {
      exitResult = { code, signal, error: null };
      resolveExit(exitResult);
    });
    child.once("error", (error) => {
      exitResult = { code: null, signal: null, error };
      resolveExit(exitResult);
    });
  });
  const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
  let trustedWitness = null;
  const trustedStartDeadline = Date.now() + 5_000;
  while (!exitResult && trustedWitness === null && Date.now() <= trustedStartDeadline) {
    trustedWitness = controller.captureStoppedProcessInstance(rootPid);
    if (trustedWitness === null) await Promise.race([exitPromise, delay(5)]);
  }
  if (trustedWitness === null) {
    if (!exitResult && controller.abortStoppedDirectChild(rootPid) !== true) {
      fail(`${label} trusted stopped process instance was unavailable`);
    }
    await exitPromise;
    fail(`${label} witnessed sandbox root exited before trusted startup handshake`);
  }
  if (
    trustedWitness.pid !== rootPid
    || trustedWitness.pgid !== rootPid
    || trustedWitness.executable_path !== command
    || trustedWitness.device !== executablePre.device
    || trustedWitness.inode !== executablePre.inode
    || String(trustedWitness.size) !== executablePre.size
    || trustedWitness.executable_sha256 !== executablePre.sha256
  ) {
    signalLiveProcessInstance(controller, trustedWitness, "SIGKILL", label);
    await exitPromise;
    controller.releaseOwnedProcessInstance(rootPid);
    fail(`${label} trusted stopped process did not match the exact executable instance`);
  }
  afterTrustedProcessStart(rootPid);
  if (controller.signalOwnedProcessInstance(rootPid, osConstants.signals.SIGCONT) !== true) {
    await exitPromise;
    controller.releaseOwnedProcessInstance(rootPid);
    fail(`${label} trusted stopped process could not be resumed`);
  }
  const rejectInitialWitness = async (message) => {
    if (!exitResult) signalLiveProcessInstance(controller, trustedWitness, "SIGKILL", label);
    await exitPromise;
    controller.releaseOwnedProcessInstance(rootPid);
    fail(message);
  };
  const witnessReady = await Promise.race([
    initialWitness,
    exitPromise.then(() => false),
    delay(initialWitnessTimeout).then(() => false),
  ]);
  if (!witnessReady || outputOverflow) {
    await rejectInitialWitness(`${label} process execution witness was unavailable or overflowed`);
  }
  let witness;
  try {
    witness = JSON.parse(witnessBytes.toString("utf8").split("\n")[0]);
  } catch {
    await rejectInitialWitness(`${label} process execution witness was malformed`);
  }
  exactObject(witness, `${label} process execution witness`, [
    "pid", "ppid", "pgid", "pidversion", "started_at_sec", "started_at_usec",
    "process_name", "execution_audit_token", "executable_path", "device", "inode",
    "size", "ctime_sec", "ctime_nsec", "executable_sha256",
  ]);
  const witnessNumbers = [
    witness.pid, witness.ppid, witness.pgid, witness.pidversion,
    witness.started_at_sec, witness.started_at_usec, witness.ctime_sec, witness.ctime_nsec,
  ];
  if (
    witness.pid !== rootPid
    || !witnessNumbers.every((value) => Number.isSafeInteger(value) && value >= 0)
    || witness.pidversion <= 0 || witness.pgid !== rootPid
    || witness.started_at_usec > 999_999 || witness.ctime_nsec > 999_999_999
    || !/^[0-9a-f]{64}$/u.test(witness.execution_audit_token ?? "")
    || !/^[0-9a-f]{64}$/u.test(witness.executable_sha256 ?? "")
    || witness.executable_path !== command
    || witness.process_name !== basename(command)
    || witness.device !== executablePre.device
    || witness.inode !== executablePre.inode
    || witness.size !== executablePre.size
    || witness.executable_sha256 !== executablePre.sha256
  ) {
    await rejectInitialWitness(`${label} process execution witness did not match the exact executable instance`);
  }
  const executionStartedAt = Date.now();
  let timedOut = false;
  while (!exitResult) {
    if (outputOverflow || Date.now() - executionStartedAt > timeout) {
      timedOut = true;
      signalLiveProcessInstance(controller, trustedWitness, "SIGKILL", label);
      break;
    }
    await Promise.race([exitPromise, delay(20)]);
  }
  await exitPromise;
  controller.releaseOwnedProcessInstance(rootPid);
  const executablePost = snapshotToolFile(command, `sandbox-root-executable:${label}`);
  const witnessPost = snapshotToolFile(
    sandboxWitnessPath,
    `sandbox-process-witness:${label}`,
    { requireExecutable: false },
  );
  const witnessPreloadPost = snapshotToolFile(
    witnessPreloadPath,
    `sandbox-process-witness-preload:${label}`,
    { requireExecutable: false },
  );
  if (
    canonicalizeJcs(executablePost) !== canonicalizeJcs(executablePre)
    || canonicalizeJcs(witnessPost) !== canonicalizeJcs(witnessPre)
    || canonicalizeJcs(witnessPreloadPost) !== canonicalizeJcs(witnessPreloadPre)
  ) fail(`${label} process execution authority drifted`);
  let processAttempts;
  try {
    processAttempts = witnessBytes.toString("utf8").trim().split("\n").slice(1).map((line) => {
      const record = JSON.parse(line);
      exactObject(record, `${label} process attempt witness`, ["process_attempt"]);
      if (!/^[A-Za-z]+$/u.test(record.process_attempt ?? "")) {
        fail(`${label} process attempt witness is invalid`);
      }
      return record.process_attempt;
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Release rehearsal candidate rejected:")) throw error;
    fail(`${label} process attempt witness was malformed`);
  }
  const startMilliseconds = witness.started_at_sec * 1_000 + Math.floor(witness.started_at_usec / 1_000);
  const startedIso = new Date(startMilliseconds).toISOString().replace(
    /\.\d{3}Z$/u,
    `.${String(witness.started_at_usec).padStart(6, "0")}Z`,
  );
  const processInstanceId = sha256Jcs({
    execution_audit_token: witness.execution_audit_token,
    executable_identity_digest: sha256Jcs(executablePre),
    pidversion: witness.pidversion,
    started_at: startedIso,
  });
  return Object.freeze({
    error: timedOut || outputOverflow ? new Error("witnessed sandbox root failed closed") : exitResult?.error,
    signal: exitResult?.signal ?? null,
    status: timedOut || outputOverflow ? null : exitResult?.code,
    stdout: stdout.toString("utf8"),
    stderr: stderr.toString("utf8"),
    pid: rootPid,
    root_pgid: rootPid,
    observer_tool_identity_digest: sha256Jcs(witnessPost),
    process_lifecycle_enforcement: "macos-sandbox-deny-process-fork",
    process_attempt_count: processAttempts.length,
    process_attempt_kinds: processAttempts,
    process_tree_complete: true,
    process_identities: [{
      pid: rootPid,
      ppid: witness.ppid,
      pgid: witness.pgid,
      started_at: startedIso,
      process_name: witness.process_name,
      execution_audit_token: witness.execution_audit_token,
      process_instance_id: processInstanceId,
      executable_path: witness.executable_path,
      executable_identity_digest: sha256Jcs(executablePre),
    }],
    escaped_process_count: 0,
    surviving_process_count: 0,
    exited_at: new Date().toISOString(),
  });
}

export function validateSandboxedBuildResult(result, label) {
  if (
    result?.process_lifecycle_enforcement === "macos-sandbox-deny-process-fork"
    && result.process_attempt_count !== 0
  ) {
    const kinds = Array.isArray(result.process_attempt_kinds)
      ? result.process_attempt_kinds.join(",")
      : "unknown";
    fail(`${label} contained a witnessed child process or signal attempt (${kinds})`);
  }
  if (result?.error || result?.signal || result?.status !== 0) {
    fail(`${label} failed in the measured sandbox`);
  }
  if (
    result.process_tree_complete !== true
    || !Number.isSafeInteger(result.root_pid) || result.root_pid <= 0
    || !Number.isSafeInteger(result.root_pgid) || result.root_pgid <= 0
    || result.root_pid !== result.root_pgid
    || !Array.isArray(result.process_identities) || result.process_identities.length === 0
    || result.escaped_process_count !== 0
    || result.surviving_process_count !== 0
    || typeof result.stage !== "string" || result.stage.length === 0
    || !Number.isFinite(Date.parse(result.audit_started_at ?? ""))
    || !Number.isFinite(Date.parse(result.audit_ended_at ?? ""))
    || Date.parse(result.audit_ended_at) < Date.parse(result.audit_started_at)
  ) fail(`${label} process tree discovery or lifecycle is incomplete`);
  digest(result.observer_tool_identity_digest, `${label} observer tool identity digest`);
  const witnessedLifecycle = result.process_lifecycle_enforcement === "macos-sandbox-deny-process-fork";
  if (result.process_lifecycle_enforcement !== undefined && !witnessedLifecycle) {
    fail(`${label} process lifecycle enforcement is unknown`);
  }
  if (witnessedLifecycle && result.process_identities.length !== 1) {
    fail(`${label} single-process lifecycle completeness was not proven`);
  }
  for (const identity of result.process_identities) {
    exactObject(identity, `${label} process identity`, witnessedLifecycle ? [
      "pid", "ppid", "pgid", "started_at", "process_name", "execution_audit_token",
      "process_instance_id", "executable_path", "executable_identity_digest",
    ] : [
      "pid", "ppid", "pgid", "started_at", "executable_identity_digest",
    ]);
    if (
      !Number.isSafeInteger(identity.pid) || identity.pid <= 0
      || !Number.isSafeInteger(identity.ppid) || identity.ppid < 0
      || !Number.isSafeInteger(identity.pgid) || identity.pgid <= 0
      || typeof identity.started_at !== "string" || identity.started_at.length === 0
    ) fail(`${label} process identity is invalid`);
    digest(identity.executable_identity_digest, `${label} executable identity digest`);
    if (witnessedLifecycle && (
      !Number.isFinite(Date.parse(identity.started_at))
      || typeof identity.process_name !== "string" || identity.process_name.length === 0
      || !/^[0-9a-f]{64}$/u.test(identity.execution_audit_token ?? "")
      || !isAbsolute(identity.executable_path ?? "")
    )) fail(`${label} process execution audit token or instance identity is invalid`);
    if (witnessedLifecycle) digest(identity.process_instance_id, `${label} process instance ID`);
  }
  const sortedProcessIdentities = [...result.process_identities].sort((left, right) => (
    left.pid - right.pid
    || left.executable_identity_digest.localeCompare(right.executable_identity_digest)
  ));
  if (
    canonicalizeJcs(sortedProcessIdentities) !== canonicalizeJcs(result.process_identities)
    || new Set(result.process_identities.map((identity) => (
      `${identity.pid}:${identity.started_at}:${identity.executable_identity_digest}`
    ))).size !== result.process_identities.length
  ) fail(`${label} process identity set is not sorted and unique`);
  if (
    !result.process_identities.some((identity) => identity.pid === result.root_pid)
    || result.process_identities.some((identity) => identity.pgid !== result.root_pgid)
  ) fail(`${label} process tree root or process-group identity is invalid`);
  if (!Array.isArray(result.observed_denials)) fail(`${label} lacks independent OS denial evidence`);
  if (result.observed_denials.length !== 0) {
    fail(`${label} contained an independently observed denied sandbox attempt`);
  }
  return Object.freeze({
    audit_digest: sha256Jcs({
      schema: witnessedLifecycle
        ? "homecook.sandbox-process-tree-audit.v3"
        : "homecook.sandbox-process-tree-audit.v2",
      enforcement: witnessedLifecycle
        ? "macos-sandbox-deny-process-fork+audit-token-witness+unified-log-deny-window"
        : "macos-unified-log-deny-process-tree-window",
      stage: result.stage,
      audit_started_at: result.audit_started_at,
      audit_ended_at: result.audit_ended_at,
      root_pid: result.root_pid,
      root_pgid: result.root_pgid,
      observer_tool_identity_digest: result.observer_tool_identity_digest,
      process_identities: result.process_identities,
      process_attempt_count: witnessedLifecycle ? result.process_attempt_count : null,
      denial_count: 0,
    }),
    process_instance_digest: witnessedLifecycle
      ? result.process_identities[0].process_instance_id
      : sha256Jcs(result.process_identities),
  });
}

function parseUnifiedLogJson(source, label, { streaming = false } = {}) {
  let payload = String(source ?? "");
  if (streaming) {
    const start = payload.indexOf("[");
    if (start < 0 && payload.includes("Filtering the log data using")) return [];
    if (start < 0) fail(`${label} unified log stream did not produce JSON`);
    payload = payload.slice(start).trim();
    if (!payload.endsWith("]")) payload = `${payload.replace(/,\s*$/u, "")}\n]`;
  }
  let events;
  try {
    events = JSON.parse(payload || "[]");
  } catch {
    fail(`${label} unified log response is not valid JSON`);
  }
  if (!Array.isArray(events)) fail(`${label} unified log response is invalid`);
  return events;
}

async function streamSandboxUnifiedLog({
  logPath,
  cwd,
  env,
  label,
  execute,
  spawnProcess = spawn,
  maxOutputBytes = 16 * 1024 * 1024,
}) {
  const stream = spawnProcess(logPath, [
    "stream", "--style", "json", "--predicate",
    'process == "kernel" AND eventMessage CONTAINS "Sandbox:"',
  ], {
    cwd,
    env: { HOME: env.HOME, PATH: "/usr/bin:/bin" },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  await new Promise((resolveSpawn, rejectSpawn) => {
    stream.once("spawn", resolveSpawn);
    stream.once("error", rejectSpawn);
  }).catch(() => fail(`${label} unified log stream failed to start`));
  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);
  let overflow = false;
  stream.stdout?.on("data", (chunk) => {
    stdout = Buffer.concat([stdout, Buffer.from(chunk)]);
    if (stdout.length > maxOutputBytes) overflow = true;
  });
  stream.stderr?.on("data", (chunk) => {
    stderr = Buffer.concat([stderr, Buffer.from(chunk)]);
    if (stderr.length > maxOutputBytes) overflow = true;
  });
  let streamExited = false;
  const streamExit = new Promise((resolveExit) => {
    stream.once("exit", (code, signal) => {
      streamExited = true;
      resolveExit({ code, signal });
    });
    stream.once("error", () => {
      streamExited = true;
      resolveExit({ code: null, signal: null });
    });
  });
  const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
  await delay(500);
  if (streamExited) fail(`${label} unified log stream exited before sandbox spawn`);
  let child;
  try {
    child = await execute();
    await delay(1_500);
  } finally {
    if (!streamExited) stream.kill("SIGTERM");
    await Promise.race([streamExit, delay(2_000)]);
    if (!streamExited) {
      stream.kill("SIGKILL");
      await streamExit;
    }
  }
  if (overflow) fail(`${label} unified log stream overflowed`);
  const events = parseUnifiedLogJson(stdout, label, { streaming: true });
  return Object.freeze({ child, events });
}

/** @param {any} options */
export async function runObservedSandboxCommand({
  sandboxPath, logPath, profile, command, args, cwd, env, label,
  sandboxWitnessPath = null,
  stage = label,
  processExecutablePaths = null,
  timeout = 30_000, runCommand = spawnSync,
  observeProcessTree = observeSandboxProcessTree,
  beforeSpawn = () => undefined,
  now = () => Date.now(),
  waitForAuditFlush = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds)),
  streamUnifiedLog = streamSandboxUnifiedLog,
  formatAuditTime = (milliseconds) => {
    const date = new Date(milliseconds);
    const part = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())} ${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}`;
  },
} = /** @type {any} */ ({})) {
  const startedAt = now();
  if (!Number.isFinite(startedAt)) fail(`${label} OS denial audit start cursor is invalid`);
  if (typeof beforeSpawn !== "function") fail(`${label} pre-spawn authority guard is invalid`);
  const executionScopedProcessName = processExecutablePaths !== null
    && /^hcnode[0-9a-f]{8}[a-z]$/u.test(basename(command))
    ? basename(command)
    : null;
  const executionAuditMessage = executionScopedProcessName === null
    ? null
    : `homecook-sandbox-${executionScopedProcessName}`;
  if (processExecutablePaths !== null) {
    if (
      !Array.isArray(processExecutablePaths) || processExecutablePaths.length !== 1
      || processExecutablePaths[0] !== command
    ) fail(`${label} exact process executable authority is invalid`);
    const exactRule = `(allow process-exec (literal ${sandboxLiteral(command)}))`;
    if (!String(profile).split("\n").includes(exactRule)) {
      fail(`${label} sandbox profile lacks its exact process executable authority`);
    }
    if (
      executionAuditMessage !== null
      && !String(profile).includes(`(with message ${JSON.stringify(executionAuditMessage)})`)
    ) fail(`${label} sandbox profile lacks its execution-scoped audit message`);
  }
  beforeSpawn();
  if (
    processExecutablePaths !== null
    && sandboxWitnessPath === null
    && observeProcessTree === observeSandboxProcessTree
  ) fail(`${label} exact process authority requires the audit-token sandbox witness`);
  const execute = () => sandboxWitnessPath === null
    ? observeProcessTree({
      args, command, cwd, env, label, profile, sandboxPath, timeout,
      pollCommand: runCommand, processExecutablePaths,
    })
    : observeWitnessedSandboxRoot({
      args, command, cwd, env, label, profile, timeout, sandboxWitnessPath,
      offlineDnsProjection: stage === "offline-install",
    });
  const streamed = sandboxWitnessPath !== null || observeProcessTree === observeSandboxProcessTree
    ? await streamUnifiedLog({ logPath, cwd, env, label, execute })
    : { child: await execute(), events: [] };
  const child = streamed.child;
  if (!Number.isSafeInteger(child?.pid) || child.pid <= 0) {
    fail(`${label} OS denial audit child identity is unavailable`);
  }
  if (
    child.process_tree_complete !== true
    || child.escaped_process_count !== 0
    || child.surviving_process_count !== 0
  ) fail(`${label} process tree lifecycle failed closed`);
  const childEndedAt = now();
  if (!Number.isFinite(childEndedAt) || childEndedAt < startedAt) {
    fail(`${label} OS denial audit command interval is invalid`);
  }
  await waitForAuditFlush(1_500);
  const auditEndedAt = now();
  if (!Number.isFinite(auditEndedAt) || auditEndedAt < childEndedAt) {
    fail(`${label} OS denial audit flush interval is invalid`);
  }
  const queryStartedAt = Math.floor((startedAt - 1_000) / 1_000) * 1_000;
  const queryEndedAt = Math.ceil((auditEndedAt + 1_000) / 1_000) * 1_000;
  const audit = spawnBounded(logPath, [
    "show", "--start", formatAuditTime(queryStartedAt),
    "--end", formatAuditTime(queryEndedAt),
    "--style", "json", "--predicate",
    'process == "kernel" AND eventMessage CONTAINS "Sandbox:"',
  ], { cwd, env: { HOME: env.HOME, PATH: "/usr/bin:/bin" }, timeout: 30_000, runCommand });
  if (audit.error || audit.signal || audit.status !== 0) fail(`${label} OS denial audit query failed closed`);
  let observedDenials;
  try {
    const events = [
      ...streamed.events,
      ...parseUnifiedLogJson(audit.stdout, label),
    ];
    const registeredPids = new Set(child.process_identities.map((identity) => identity.pid));
    const registeredIdentities = new Map(child.process_identities.map((identity) => [identity.pid, identity]));
    observedDenials = events.flatMap((event) => {
      const message = String(event.eventMessage ?? "");
      const match = /Sandbox:\s+([^()]+)\((\d+)\)/u.exec(message);
      if (!match) return [];
      const eventProcessName = match[1].trim();
      const eventPid = Number(match[2]);
      const registeredIdentity = registeredIdentities.get(eventPid);
      const hasExecutionAuditMessage = executionAuditMessage !== null
        && message.split("\n").includes(executionAuditMessage);
      if (
        executionScopedProcessName !== null
        && eventProcessName !== executionScopedProcessName
      ) return [];
      if (
        executionScopedProcessName !== null
        && !registeredPids.has(eventPid)
        && !hasExecutionAuditMessage
      ) return [];
      if (executionScopedProcessName === null && !registeredPids.has(eventPid)) return [];
      if (
        typeof event.executionAuditToken === "string"
        && registeredIdentity?.execution_audit_token !== undefined
        && event.executionAuditToken !== registeredIdentity.execution_audit_token
      ) return [];
      const eventTime = Date.parse(event.timestamp ?? "");
      const identityStartedAt = Date.parse(registeredIdentity?.started_at ?? "");
      const childExitedAt = Date.parse(child.exited_at ?? "");
      if (
        child.process_lifecycle_enforcement === "macos-sandbox-deny-process-fork"
        && Number.isFinite(eventTime) && Number.isFinite(identityStartedAt)
        && eventTime < identityStartedAt
      ) return [];
      if (
        child.process_lifecycle_enforcement === "macos-sandbox-deny-process-fork"
        && Number.isFinite(eventTime) && Number.isFinite(childExitedAt)
        && eventTime > childExitedAt
      ) return [];
      return [{ event_digest: sha256Bytes(Buffer.from(message, "utf8")) }];
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Release rehearsal candidate rejected:")) throw error;
    fail(`${label} OS denial audit response is not valid JSON`);
  }
  return validateSandboxedBuildResult({
    ...child,
    audit_started_at: new Date(startedAt).toISOString(),
    audit_ended_at: new Date(auditEndedAt).toISOString(),
    observed_denials: observedDenials,
    root_pid: child.pid,
    stage,
  }, label);
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

export function resolveSafeRealExecutable(candidates, label) {
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

export function snapshotToolFile(path, version, { requireExecutable = true } = {}) {
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

function materializeSandboxStageNode({
  sourceNode,
  privateHome,
  stage,
  copyPath,
  currentUid,
  runCommand = spawnSync,
}) {
  if (!/^[a-z][a-z0-9-]{1,31}$/u.test(stage ?? "")) {
    fail("sandbox stage Node label is invalid");
  }
  const token = randomUUID().replaceAll("-", "").slice(0, 8);
  const path = join(privateHome, `hcnode${token}${stage[0]}`);
  if (pathExists(path)) fail("sandbox stage Node clone collided before creation");
  const sourcePre = snapshotToolFile(sourceNode, "sandbox-stage-node-source");
  const copyToolPre = snapshotToolFile(copyPath, "sandbox-stage-node-copy-tool");
  const copied = spawnBounded(copyPath, ["-c", "-p", sourceNode, path], {
    cwd: privateHome,
    env: { HOME: privateHome, PATH: "/usr/bin:/bin" },
    runCommand,
    timeout: 30_000,
  });
  if (copied.error || copied.signal || copied.status !== 0) {
    fail("sandbox stage Node metadata-preserving APFS clone failed");
  }
  chmodSync(path, 0o500);
  const stat = lstatSync(path, { bigint: true });
  if (
    stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1n
    || stat.uid !== BigInt(currentUid) || modeBits(stat.mode) !== 0o500
    || realpathSync(path) !== path
  ) fail("sandbox stage Node clone identity is unsafe");
  const cloneIdentity = snapshotToolFile(path, `sandbox-stage-node:${stage}`);
  if (
    cloneIdentity.sha256 !== sourcePre.sha256
    || cloneIdentity.size !== sourcePre.size
  ) fail("sandbox stage Node clone bytes differ from the pinned source");
  const verify = () => {
    const sourcePost = snapshotToolFile(sourceNode, "sandbox-stage-node-source");
    const copyToolPost = snapshotToolFile(copyPath, "sandbox-stage-node-copy-tool");
    const clonePost = snapshotToolFile(path, `sandbox-stage-node:${stage}`);
    if (
      canonicalizeJcs(sourcePost) !== canonicalizeJcs(sourcePre)
      || canonicalizeJcs(copyToolPost) !== canonicalizeJcs(copyToolPre)
      || canonicalizeJcs(clonePost) !== canonicalizeJcs(cloneIdentity)
    ) fail("sandbox stage Node clone authority drifted");
    return Object.freeze({ clone: clonePost, copy_tool: copyToolPost, source: sourcePost });
  };
  return Object.freeze({
    authority_digest: sha256Jcs({
      schema: "homecook.sandbox-stage-node-clone-authority.v1",
      stage,
      clone: cloneIdentity,
      copy_tool: copyToolPre,
      source: sourcePre,
    }),
    path,
    verify,
  });
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
  const copyPath = resolveSafeRealExecutable(["/bin/cp"], "macOS metadata-preserving copy tool");
  const supabasePath = findExactSupabaseCli(
    join(homeDir, "Library", "Caches", "pnpm", "dlx"),
    toolchainLock.supabase_cli.version,
  );
  return {
    auditLogPath, copyPath, dockerPath, ghPath, gitPath, launchctlPath, lsofPath, nodePath, pnpmArtifactRoot, pnpmCliPath,
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

export function validateStableCiSnapshots(pre, post, releaseSha, { selectionDigest = /** @type {string | null} */ (null) } = {}) {
  validateCandidateCiEvidence(pre);
  validateCandidateCiEvidence(post);
  nullableDigest(selectionDigest, "CI selection digest");
  for (const [label, value] of [["pre", pre], ["post", post]]) {
    sha(value.remote_master_sha, `CI ${label} remote master SHA`);
    if (selectionDigest === null && value.remote_master_sha !== releaseSha) fail(`CI ${label} remote master SHA drifted`);
    digest(value.safe_projection_digest, `CI ${label} safe projection digest`);
    digest(value.suite_run_set_digest, `CI ${label} suite/run set digest`);
    if (!value.safe_projection || value.safe_projection.head_sha !== releaseSha) {
      fail(`CI ${label} safe projection head SHA is invalid`);
    }
    if (value.safe_projection.remote_master_sha !== value.remote_master_sha) {
      fail(`CI ${label} safe projection remote master SHA is invalid`);
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
    || pre.suite_run_set_digest !== post.suite_run_set_digest
  ) fail("CI pre/post projection, suite, or run set drifted");
  if (selectionDigest === null) {
    if (pre.safe_projection_digest !== post.safe_projection_digest) {
      fail("CI pre/post projection, suite, or run set drifted");
    }
  } else {
    const normalized = (projection) => ({ ...projection, remote_master_sha: "approved-selection-descendant" });
    if (canonicalizeJcs(normalized(pre.safe_projection)) !== canonicalizeJcs(normalized(post.safe_projection))) {
      fail("selected CI pre/post projection changed beyond normal master advancement");
    }
  }
  return Object.freeze(pre);
}

export function parseCanonicalComposeImageInventory(source, { requireCanonicalSemantics = false } = {}) {
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
    "homecook.release.sealed-bundle-digest",
    "homecook.release.repeatability-receipt-digest",
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
  const networkSemantics = new Map();
  const secretSemantics = new Map();
  const volumeSemantics = new Map();
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
        current = {
          service: key,
          image: null,
          platform: null,
          build: false,
          labels: false,
          list_items: { networks: [], secrets: [], tmpfs: [], volumes: [] },
        };
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
          current.labels = true;
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
          const item = validatePlainScalar(
            parseListItem(line, 6, `${nestedBlock}`),
            `${nestedBlock} list item`,
          );
          if (Object.hasOwn(current.list_items, nestedBlock)) current.list_items[nestedBlock].push(item);
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
        if (section === "networks") networkSemantics.set(key, { empty: value === "{}", internal: null });
        if (section === "secrets") secretSemantics.set(key, new Map());
        if (section === "volumes") volumeSemantics.set(key, new Map());
        continue;
      }
      if (indent === 4 && nestedItem) {
        const { key, value } = parseMapping(line, 4, `${section} metadata`);
        if (nestedKeys.has(key)) fail(`Compose duplicate ${section} metadata key: ${key}`);
        nestedKeys.add(key);
        if (section === "networks" && key === "internal" && value === "true") {
          networkSemantics.get(nestedItem).internal = true;
          continue;
        }
        if (section === "secrets" && key === "file" && value !== null) {
          validatePlainScalar(value, "secret file");
          secretSemantics.get(nestedItem).set("file", value);
          continue;
        }
        if (section === "volumes" && key === "name" && value !== null) {
          validatePlainScalar(value, "volume name");
          volumeSemantics.get(nestedItem).set("name", value);
          continue;
        }
        if (section === "volumes" && key === "labels" && value === "*restore-attempt-labels") {
          validatePlainScalar(value, "volume labels", { approvedAlias: "*restore-attempt-labels" });
          volumeSemantics.get(nestedItem).set("labels", value);
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
  const exactSet = (actual, expected) => actual.size === expected.size
    && [...expected].every((value) => actual.has(value));
  const requiredServices = new Set([
    "postgres", "auth", "postgrest", "postgrest-probe", "storage", "api-gateway", "auth-proxy",
  ]);
  if (requireCanonicalSemantics && (!exactSet(serviceNames, requiredServices) || services.some((service) => !service.labels))) {
    fail("Compose required service set or restore labels semantic contract is incomplete");
  }
  if (requireCanonicalSemantics && !exactSet(new Set(networkSemantics.keys()), canonicalNetworkNames)) {
    fail("Compose canonical network set is incomplete");
  }
  for (const name of requireCanonicalSemantics ? ["auth-edge", "auth-egress"] : []) {
    const value = networkSemantics.get(name);
    if (!value?.empty || value.internal !== null) fail(`Compose network ${name} must be exact empty metadata`);
  }
  const dataInternal = networkSemantics.get("data-internal");
  if (requireCanonicalSemantics && (dataInternal?.empty || dataInternal?.internal !== true)) {
    fail("Compose data-internal network must require internal true");
  }
  if (requireCanonicalSemantics && !exactSet(new Set(volumeSemantics.keys()), canonicalVolumeNames)) {
    fail("Compose canonical volume set is incomplete");
  }
  const requiredVolumeNames = new Map([
    ["postgres-data", "${FULL_LOCAL_POSTGRES_VOLUME_NAME:?FULL_LOCAL_POSTGRES_VOLUME_NAME is required}"],
    ["storage-data", "${FULL_LOCAL_STORAGE_VOLUME_NAME:?FULL_LOCAL_STORAGE_VOLUME_NAME is required}"],
  ]);
  for (const [name, expectedName] of requireCanonicalSemantics ? requiredVolumeNames : []) {
    const metadata = volumeSemantics.get(name);
    if (metadata?.get("name") !== expectedName || metadata?.get("labels") !== "*restore-attempt-labels" || metadata.size !== 2) {
      fail(`Compose volume ${name} metadata semantic contract is invalid`);
    }
  }
  const requiredSecretNames = [
    ["postgres", "password"].join("_"), "jwt_secret", "jwt_keys", "jwt_jwks", "anon_key", "service_role_key",
    "publishable_key", "secret_key", "anon_key_asymmetric", "service_role_key_asymmetric",
    "storage_s3_access_key_id", "storage_s3_access_key_secret", "auth_flow_hmac_key",
    "session_attestation_hmac_key_v1", "session_generation_hmac_key_v2",
  ];
  if (requireCanonicalSemantics) {
    if (!exactSet(new Set(secretSemantics.keys()), new Set(requiredSecretNames))) {
      fail("Compose canonical top-level secret set is incomplete");
    }
    for (const name of requiredSecretNames) {
      const metadata = secretSemantics.get(name);
      const expectedPath = `\${FULL_LOCAL_SECRET_DIR:?FULL_LOCAL_SECRET_DIR is required}/${name}`;
      if (metadata?.size !== 1 || metadata.get("file") !== expectedPath) {
        fail(`Compose top-level secret ${name} source contract is invalid`);
      }
    }
  }
  const serviceListContract = {
    postgres: {
      networks: ["data-internal"],
      secrets: ["postgres_password"],
      tmpfs: [],
      volumes: [
        "postgres-data:/var/lib/postgresql/data",
        "./secret-entrypoint.sh:/homecook/secret-entrypoint.sh:ro",
        "./full-local-role-passwords.sh:/docker-entrypoint-initdb.d/zz-homecook-role-passwords.sh:ro",
      ],
    },
    auth: {
      networks: ["data-internal", "auth-egress"],
      secrets: ["postgres_password", "jwt_secret", "jwt_keys"],
      tmpfs: [],
      volumes: [
        "./secret-entrypoint.sh:/homecook/secret-entrypoint.sh:ro",
        "./start-auth.sh:/homecook/start-auth.sh:ro",
      ],
    },
    postgrest: {
      networks: ["data-internal"],
      secrets: [["postgres", "password"].join("_"), "jwt_jwks"],
      tmpfs: [],
      volumes: [
        "./secret-entrypoint.sh:/homecook/secret-entrypoint.sh:ro",
        "./start-postgrest.sh:/homecook/start-postgrest.sh:ro",
      ],
    },
    "postgrest-probe": {
      networks: ["data-internal"], secrets: [], tmpfs: [], volumes: [],
    },
    storage: {
      networks: ["data-internal"],
      secrets: [
        "postgres_password", "anon_key", "service_role_key", "jwt_jwks", "jwt_secret",
        "storage_s3_access_key_id", "storage_s3_access_key_secret",
      ],
      tmpfs: [],
      volumes: [
        "storage-data:/var/lib/storage",
        "./secret-entrypoint.sh:/homecook/secret-entrypoint.sh:ro",
        "./start-storage.sh:/homecook/start-storage.sh:ro",
      ],
    },
    "api-gateway": {
      networks: ["auth-edge", "data-internal"],
      secrets: [
        "anon_key", "service_role_key", "publishable_key", "secret_key", "anon_key_asymmetric",
        "service_role_key_asymmetric", "session_attestation_hmac_key_v1",
      ],
      tmpfs: ["/tmp:mode=1777"],
      volumes: [
        "./secret-entrypoint.sh:/homecook/secret-entrypoint.sh:ro",
        "./kong-entrypoint.sh:/homecook/kong-entrypoint.sh:ro",
        "./kong.yml:/homecook/kong.yml:ro",
        "./kong/plugins/homecook-attestation:/usr/local/share/lua/5.1/kong/plugins/homecook-attestation:ro",
      ],
    },
    "auth-proxy": {
      networks: ["auth-edge"],
      secrets: [],
      tmpfs: [],
      volumes: ["./auth-only-proxy.mjs:/homecook/auth-only-proxy.mjs:ro"],
    },
  };
  if (requireCanonicalSemantics) {
    for (const service of services) {
      const expected = serviceListContract[service.service];
      if (!expected) fail(`Compose service ${service.service} lacks a closed list semantic contract`);
      for (const field of ["networks", "secrets", "tmpfs", "volumes"]) {
        const actualItems = service.list_items[field];
        if (
          actualItems.length !== expected[field].length
          || new Set(actualItems).size !== actualItems.length
          || expected[field].some((item) => !actualItems.includes(item))
        ) fail(`Compose service ${service.service} ${field} semantic contract is invalid`);
      }
    }
  }
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
  return parseCanonicalComposeImageInventory(
    decodeFatalUtf8(bytes, "full-local Compose source"),
    { requireCanonicalSemantics: true },
  );
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
  productionEnvAuthorityPath = null,
  builderAuthoritySha = null,
  builderInputDigest = null,
  builderInputEntries = null,
  selection = null,
  toolchainLockPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "config",
    "local-mac-production-rehearsal-toolchain-lock.json",
  ),
} = {}, dependencies = {}) {
  const runCommand = dependencies.runCommand ?? spawnSync;
  const resolveToolPaths = dependencies.resolveToolPaths ?? exactToolPaths;
  const sourceRoot = realpathSync(rootDir);
  sha(builderAuthoritySha, "bootstrap-start builder authority SHA");
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
  let selectedSourceAuthority = null;

  const readToolchainLock = () => {
    cachedToolchainLock ??= loadRehearsalToolchainLock(toolchainLockPath);
    return cachedToolchainLock;
  };

  const resolveTools = () => {
    cachedToolPaths ??= resolveToolPaths({
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
        productionEnvAuthorityPath,
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

    async resolveSourceAuthority({ releaseSha, selection: requestedSelection }) {
      if (selection === null || requestedSelection?.selection_digest !== selection.selection_digest) {
        fail("candidate adapter selection authority is missing or substituted");
      }
      selectedSourceAuthority = resolveCandidateRehearsalSourceAuthority({
        releaseSha,
        rootDir: sourceRoot,
        selection,
        homeDir: normalizedHome,
      });
      return selectedSourceAuthority;
    },

    async prepareSource({ releaseSha, runRoot }) {
      const { gitPath } = resolveTools();
      const env = gitEnvironment(normalizedHome);
      runBounded(gitPath, ["-C", sourceRoot, "fetch", "--no-tags", "origin", "master"], {
        env, label: "fetch origin/master", runCommand, timeout: 120_000,
      });
      let originMasterSha = runBounded(gitPath, ["-C", sourceRoot, "rev-parse", "origin/master"], {
        env, label: "origin/master SHA", runCommand,
      }).trim();
      if (selection === null) {
        if (originMasterSha !== releaseSha) fail("requested SHA is not the current fetched origin/master");
      } else {
        if (!selectedSourceAuthority) fail("selected source authority was not validated before candidate reservation");
        const refreshed = resolveCandidateRehearsalSourceAuthority({
          releaseSha,
          rootDir: sourceRoot,
          selection,
          homeDir: normalizedHome,
        });
        if (refreshed.selection_digest !== selectedSourceAuthority.selection_digest
          || refreshed.release_tree !== selectedSourceAuthority.release_tree
          || refreshed.observed_master_sha !== selectedSourceAuthority.observed_master_sha
          || refreshed.observed_master_tree !== selectedSourceAuthority.observed_master_tree) {
          fail("selected source authority changed before materialization");
        }
        selectedSourceAuthority = refreshed;
        originMasterSha = refreshed.current_master_sha;
      }
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
        sourceRoot: checkoutDir,
        sourceManifest: materialized.source_manifest,
      });
      const builderAuthority = validateCandidateBuilderAuthority({
        currentHead,
        releaseSha,
        builderAuthoritySha,
        trackedStatus,
        sourceManifestDigest: materialized.source_manifest.source_manifest_digest,
        verifiedSourceManifestDigest,
        builderEntries: builderInputEntries,
        expectedBuilderInputDigest: builderInputDigest,
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
          selection_digest: selection?.selection_digest ?? null,
          checkout_sha: releaseSha,
          release_tree: checkoutTree,
          checkout_tree: checkoutTree,
          detached: true,
          clean: true,
          tracked_symlinks_contained: true,
          hardlink_count: tracked.hardlinkCount,
          source_snapshot_pre_digest: tracked.digest,
          source_snapshot_post_digest: tracked.digest,
          builder_input_digest: builderAuthority.builder_input_digest,
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
      if (selection === null) {
        if (remoteMasterSha !== releaseSha) fail("remote master moved away from candidate SHA");
      } else {
        const refreshed = resolveCandidateRehearsalSourceAuthority({
          releaseSha,
          rootDir: sourceRoot,
          selection,
          homeDir: normalizedHome,
        });
        if (refreshed.current_master_sha !== remoteMasterSha
          || refreshed.selection_digest !== selectedSourceAuthority?.selection_digest) {
          fail("selected remote master ancestry authority changed during CI collection");
        }
        selectedSourceAuthority = refreshed;
      }
      const headers = ["-H", "Accept: application/vnd.github+json", "-H", "X-GitHub-Api-Version: 2026-03-10"];
      const checkRuns = parseGhPages(runBounded(ghPath, [
        "api", "--hostname", "github.com", "--paginate", "--slurp", ...headers,
        `/repos/${REPOSITORY}/commits/${releaseSha}/check-runs?filter=all&per_page=100`,
      ], { env, label: "trusted GitHub check-runs readback", runCommand, timeout: 120_000 }), "check_runs");
      const commitStatuses = parseGhPages(runBounded(ghPath, [
        "api", "--hostname", "github.com", "--paginate", "--slurp", ...headers,
        `/repos/${REPOSITORY}/commits/${releaseSha}/statuses?per_page=100`,
      ], { env, label: "trusted GitHub commit-status readback", runCommand, timeout: 120_000 }));
      if (checkRuns.some((entry) => entry.head_sha !== releaseSha)) {
        fail("GitHub check-run head SHA does not match candidate SHA");
      }
      if (checkRuns.some((entry) => Number(entry.app?.id) !== GITHUB_ACTIONS_APP_INTEGRATION_ID)) {
        fail("GitHub check-run does not use the trusted GitHub Actions integration");
      }
      if (commitStatuses.some((entry) => entry.sha !== releaseSha)) {
        fail("GitHub commit-status SHA does not match candidate SHA");
      }
      const summary = normalizeGitHubProductionReleaseCheckSummary({
        checkRuns,
        commitStatuses,
        expectedContexts: EXPECTED_RELEASE_CONTEXTS,
      });
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
      mkdirSync(privateHome, { mode: 0o700 });
      mkdirSync(privateTmp, { mode: 0o700 });
      materializeCandidateBuildWorkspace({
        sourceRoot: source.checkout_dir,
        sourceManifest: source.source_manifest,
        buildRoot,
      });
      const authorizedBuild = await withCandidateBuildWorkAuthority({
        runRoot,
        buildRoot,
        nodeModulesRoot: join(buildRoot, "node_modules"),
        nextRoot: join(buildRoot, ".next"),
        privateHome,
        privateTmp,
        currentUid: process.getuid?.(),
      }, async ({ writeRoots }) => {
        const installStageNode = materializeSandboxStageNode({
          sourceNode: tools.nodePath,
          privateHome,
          stage: "install",
          copyPath: tools.copyPath,
          currentUid: process.getuid?.(),
          runCommand,
        });
        const buildStageNode = materializeSandboxStageNode({
          sourceNode: tools.nodePath,
          privateHome,
          stage: "build",
          copyPath: tools.copyPath,
          currentUid: process.getuid?.(),
          runCommand,
        });
        const sandboxWitness = materializeSandboxProcessWitness({
          clangPath: "/usr/bin/clang",
          nodePath: tools.nodePath,
          outputPath: join(privateHome, "hcsandboxwitness.node"),
          sourcePath: join(source.checkout_dir, "scripts", "native", "local-mac-sandbox-process-witness.c"),
          preloadSourcePath: join(
            source.checkout_dir,
            "scripts",
            "native",
            "local-mac-sandbox-process-witness-preload.cjs",
          ),
          runCommand,
        });
        const storeStat = lstatSync(packageStorePath);
        if (storeStat.isSymbolicLink() || !storeStat.isDirectory() || storeStat.uid !== process.getuid?.() || (modeBits(storeStat.mode) & 0o022) !== 0) {
          fail("offline pnpm package store identity is unsafe");
        }
        const storeViewBuild = await withCandidatePnpmStoreView({
          quarantineParent: dirname(runRoot),
          sourceStore: resolve(packageStorePath),
          storeRoot: join(runRoot, "pnpm-store"),
          currentUid: process.getuid?.(),
        }, async ({
          storePath,
          installWritableRoots,
          sealInstallIndex,
          verifyInstallPhaseBeforeSpawn,
        }) => {
          const cleanBuildEnv = Object.freeze({
            ...childEnv,
            __CFPREFERENCES_AVOID_DAEMON: "1",
            __CF_USER_TEXT_ENCODING: `0x${Number(process.getuid?.()).toString(16).toUpperCase()}:0:0`,
            CFPREFERENCES_AVOID_DAEMON: "1",
            CI: "1",
            CIRCLE_NODE_TOTAL: "2",
            COMMAND_MODE: "unix2003",
            COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
            HOME: privateHome,
            HOMECOOK_RELEASE_REHEARSAL_NO_CHILD_PROCESSES: "1",
            LANG: "C",
            LC_ALL: "C",
            LOGNAME: "homecook-rehearsal",
            NEXT_TELEMETRY_DISABLED: "1",
            NODE_DISABLE_COMPILE_CACHE: "1",
            NODE_OPTIONS: "--no-global-search-paths",
            PATH: `${dirname(tools.nodePath)}:/usr/bin:/bin`,
            TZ: "UTC0",
            TMPDIR: privateTmp,
            USER: "homecook-rehearsal",
            npm_config_offline: "true",
          });
          const installSandboxProfile = buildCandidateSandboxProfile({
            executablePaths: [installStageNode.path],
            readRoots: [
              buildRoot,
              privateHome,
              privateTmp,
              storePath,
              ...Object.values(tools),
            ],
            writeRoots: [...writeRoots, ...installWritableRoots],
            deniedWritePaths: [
              source.checkout_dir,
              resolve(packageStorePath),
              join(storePath, "files"),
              installStageNode.path,
              buildStageNode.path,
              sandboxWitness.path,
              sandboxWitness.preload_path,
            ],
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
          const installAudit = await runObservedSandboxCommand({
            sandboxPath: tools.sandboxPath,
            sandboxWitnessPath: sandboxWitness.path,
            logPath: tools.auditLogPath,
            profile: installSandboxProfile,
            command: installStageNode.path,
            args: [
              tools.pnpmCliPath,
              "install", "--frozen-lockfile", "--offline", "--ignore-scripts",
              "--package-import-method=copy",
              "--store-dir", storePath,
            ],
            cwd: buildRoot,
            env: cleanBuildEnv,
            label: "offline frozen dependency install",
            processExecutablePaths: [installStageNode.path],
            stage: "offline-install",
            runCommand,
            timeout: 20 * 60_000,
            beforeSpawn: verifyInstallPhaseBeforeSpawn,
          });
          const finalIndexAuthority = sealInstallIndex();
          const buildSandboxProfile = buildCandidateSandboxProfile({
            executablePaths: [buildStageNode.path],
            readRoots: [
              buildRoot,
              privateHome,
              privateTmp,
              storePath,
              ...Object.values(tools),
            ],
            writeRoots,
            deniedWritePaths: [
              source.checkout_dir,
              resolve(packageStorePath),
              storePath,
              installStageNode.path,
              buildStageNode.path,
              sandboxWitness.path,
              sandboxWitness.preload_path,
            ],
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
          const nextEntrypointAuthority = await withCandidateNextEntrypointAuthority({
            buildRoot,
            currentUid: process.getuid?.(),
          }, async ({ entrypointPath, entrypointTarget, verifyBeforeSpawn }) => {
            const nextCliPre = snapshotToolFile(entrypointTarget, "next-cli@15.5.21", {
              requireExecutable: false,
            });
            const nextBuildAudit = await runObservedSandboxCommand({
              sandboxPath: tools.sandboxPath,
              sandboxWitnessPath: sandboxWitness.path,
              logPath: tools.auditLogPath,
              profile: buildSandboxProfile,
              command: buildStageNode.path,
              args: [entrypointPath, "build", "--no-lint"],
              cwd: buildRoot,
              env: cleanBuildEnv,
              label: "offline Next.js production build",
              processExecutablePaths: [buildStageNode.path],
              stage: "next-build",
              runCommand,
              timeout: 20 * 60_000,
              beforeSpawn: verifyBeforeSpawn,
            });
            const nextCliPost = snapshotToolFile(entrypointTarget, "next-cli@15.5.21", {
              requireExecutable: false,
            });
            if (canonicalizeJcs(nextCliPre) !== canonicalizeJcs(nextCliPost)) {
              fail("Next.js build entrypoint drifted during execution");
            }
            const installStageNodePost = installStageNode.verify();
            const buildStageNodePost = buildStageNode.verify();
            const postSourceDigest = verifyExactMaterializedTree({
              sourceRoot: source.checkout_dir,
              sourceManifest: source.source_manifest,
            });
            if (postSourceDigest !== currentSource.tracked.digest) fail("tracked source drifted during offline build");
            const artifactsRoot = join(runRoot, "artifacts");
            const assembled = assembleCandidateArtifacts({
              sourceRoot: source.checkout_dir,
              generatedRoot: buildRoot,
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
              allowedSnapshotDigest: buildYoutubeExtractionWorkerPolicySnapshotDigest(),
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
              sandbox_policy_evidence: {
                install_profile_digest: sha256Bytes(Buffer.from(installSandboxProfile, "utf8")),
                build_profile_digest: sha256Bytes(Buffer.from(buildSandboxProfile, "utf8")),
                deterministic_runtime_environment_digest: sha256Jcs({
                  COMMAND_MODE: cleanBuildEnv.COMMAND_MODE,
                  CIRCLE_NODE_TOTAL: cleanBuildEnv.CIRCLE_NODE_TOTAL,
                  LANG: cleanBuildEnv.LANG,
                  LC_ALL: cleanBuildEnv.LC_ALL,
                  LOGNAME: cleanBuildEnv.LOGNAME,
                  HOMECOOK_RELEASE_REHEARSAL_NO_CHILD_PROCESSES:
                    cleanBuildEnv.HOMECOOK_RELEASE_REHEARSAL_NO_CHILD_PROCESSES,
                  NODE_DISABLE_COMPILE_CACHE: cleanBuildEnv.NODE_DISABLE_COMPILE_CACHE,
                  NODE_OPTIONS: cleanBuildEnv.NODE_OPTIONS,
                  TZ: cleanBuildEnv.TZ,
                  USER: cleanBuildEnv.USER,
                  __CFPREFERENCES_AVOID_DAEMON: cleanBuildEnv.__CFPREFERENCES_AVOID_DAEMON,
                  __CF_USER_TEXT_ENCODING: cleanBuildEnv.__CF_USER_TEXT_ENCODING,
                }),
                final_index_inventory_digest: finalIndexAuthority.inventory_digest,
                final_index_physical_identity_digest: finalIndexAuthority.physical_identity_digest,
                sandbox_witness_authority_digest: sandboxWitness.authority_digest,
                execution_audit_digests: [installAudit.audit_digest, nextBuildAudit.audit_digest],
                stage_node_clone_authority_digests: [
                  installStageNode.authority_digest,
                  buildStageNode.authority_digest,
                ],
                stage_node_clone_post_identity_digests: [
                  sha256Jcs(installStageNodePost),
                  sha256Jcs(buildStageNodePost),
                ],
              },
              staging_bundle_root: stagingBundleRoot,
            };
          });
          validateCandidateNextEntrypointInventoryBinding(
            nextEntrypointAuthority.inventory_binding,
            nextEntrypointAuthority.value.file_inventory,
          );
          return {
            ...nextEntrypointAuthority.value,
            sandbox_policy_evidence: {
              ...nextEntrypointAuthority.value.sandbox_policy_evidence,
              next_entrypoint_authority_digest: nextEntrypointAuthority.authority_digest,
            },
          };
        });
        return {
          ...storeViewBuild.value,
          pnpm_store_view_authority_digest: storeViewBuild.authority_digest,
          pnpm_store_snapshot_inventory_digest: storeViewBuild.snapshot_inventory_digest,
          pnpm_store_snapshot_identity_digest: storeViewBuild.snapshot_identity_digest,
          pnpm_store_final_index_inventory_digest: storeViewBuild.final_index_inventory_digest,
          pnpm_store_final_index_identity_digest: storeViewBuild.final_index_identity_digest,
        };
      });
      const {
        pnpm_store_view_authority_digest: pnpmStoreViewAuthorityDigest,
        pnpm_store_snapshot_inventory_digest: pnpmStoreSnapshotInventoryDigest,
        pnpm_store_snapshot_identity_digest: pnpmStoreSnapshotIdentityDigest,
        pnpm_store_final_index_inventory_digest: pnpmStoreFinalIndexInventoryDigest,
        pnpm_store_final_index_identity_digest: pnpmStoreFinalIndexIdentityDigest,
        sandbox_policy_evidence: sandboxPolicyEvidence,
        ...build
      } = authorizedBuild.value;
      if (
        sandboxPolicyEvidence.final_index_inventory_digest !== pnpmStoreFinalIndexInventoryDigest
        || sandboxPolicyEvidence.final_index_physical_identity_digest !== pnpmStoreFinalIndexIdentityDigest
      ) fail("candidate pnpm final index builder authority cross-binding is invalid");
      return {
        ...build,
        pnpm_store_snapshot_inventory_digest: pnpmStoreSnapshotInventoryDigest,
        pnpm_store_snapshot_identity_digest: pnpmStoreSnapshotIdentityDigest,
        pnpm_store_final_index_inventory_digest: pnpmStoreFinalIndexInventoryDigest,
        pnpm_store_final_index_identity_digest: pnpmStoreFinalIndexIdentityDigest,
        sandbox_policy_digest: sha256Jcs({
          ...sandboxPolicyEvidence,
          build_work_authority_digest: authorizedBuild.authority_digest,
          pnpm_store_view_authority_digest: pnpmStoreViewAuthorityDigest,
        }),
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
