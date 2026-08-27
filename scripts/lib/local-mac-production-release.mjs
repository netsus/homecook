import { createHash, randomUUID } from "node:crypto";
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
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import {
  CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
  CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW,
  CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF,
  GITHUB_ACTIONS_APP_INTEGRATION_ID,
  normalizeExpectedReleaseContexts,
  validateProductionReleaseTag,
} from "./production-release-approval-policy.mjs";

export const LOCAL_MAC_PRODUCTION_RELEASE_SCHEMA = "homecook.local-mac-production-release.v1";

const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const MUTATION_COMMANDS = new Set(["prepare-env", "install", "restart", "uninstall"]);
const LOCAL_MAC_PRODUCTION_MUTATION_AUTHORITY_BRAND = Symbol(
  "homecook.local-mac-production.mutation-authority",
);
const LOCK_DIRECTORY_MODE = 0o700;
const LOCK_METADATA_MODE = 0o600;
const ZERO_ONLY_CHECK_FIELDS = [
  "bad",
  "cancelled",
  "failed",
  "pending",
  "queued",
  "rerun",
];
const REQUIRED_CHECK_SUMMARY_ALLOWED_FIELDS = new Set([
  "total",
  "success",
  "intended_skip",
  ...ZERO_ONLY_CHECK_FIELDS,
]);
const RELEASE_MANIFEST_ALLOWED_FIELDS = new Set([
  "schema",
  "repository",
  "source_ref",
  "signer_workflow",
  "signer_digest",
  "expected_release_integration_id",
  "promotion_id",
  "release_tag",
  "release_tag_object_sha",
  "release_manifest_path",
  "release_sha",
  "release_tree",
  "master_sha_at_approval",
  "approved_at",
  "approved_by_task_id",
  "migration_head",
  "build_id",
  "backup_readiness_evidence",
  "previous_release_sha",
  "expected_release_contexts",
  "required_check_summary",
  "attestation_digest",
  "app_launch_agent_enabled",
  "full_local_launch_agent_enabled",
  "youtube_worker_launch_agent_enabled",
]);

function requireExactAllowedKeys(value, allowedKeys, label) {
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new Error(`${label} contains unknown fields: ${unknownKeys.sort().join(", ")}.`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value.trim();
}

function requireAbsolutePath(value, label) {
  return resolve(requireNonEmptyString(value, label));
}

function requireReleaseSha(value, label) {
  const normalized = requireNonEmptyString(value, label);
  if (!RELEASE_SHA_PATTERN.test(normalized)) {
    throw new Error(`${label} must be an exact 40-character lowercase SHA.`);
  }
  return normalized;
}

function requireDigest(value, label) {
  const normalized = requireNonEmptyString(value, label);
  if (!DIGEST_PATTERN.test(normalized)) {
    throw new Error(`${label} must be a 64-character lowercase digest.`);
  }
  return normalized;
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }

  return value;
}

function requireInteger(value, label, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}.`);
  }
  return value;
}

function modeBits(mode) {
  return Number(mode) & 0o777;
}

function sanitizeLockHolder(lockRecord) {
  if (!lockRecord) {
    return null;
  }

  const holder = { ...lockRecord };
  delete holder.lock_token;
  return holder;
}

function readJsonFile(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${label} is unreadable or invalid: ${path}`);
  }
}

function sha256File(path) {
  return createHash("sha256")
    .update(readFileSync(path))
    .digest("hex");
}

function sha256Bytes(bytes) {
  return createHash("sha256")
    .update(bytes)
    .digest("hex");
}

function lstatIfExists(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function assertPathInside(parentPath, childPath, label) {
  const relativePath = relative(parentPath, childPath);
  if (relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))) {
    return;
  }
  throw new Error(`${label} escapes its approved parent directory.`);
}

function assertSafeDirectory(path, label) {
  const stat = lstatIfExists(path);
  if (!stat) {
    throw new Error(`${label} does not exist: ${path}`);
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symlink: ${path}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`${label} must be a directory: ${path}`);
  }
  return realpathSync(path);
}

function assertSafeRegularFile(path, label) {
  const stat = lstatIfExists(path);
  if (!stat) {
    throw new Error(`${label} does not exist: ${path}`);
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symlink: ${path}`);
  }
  if (!stat.isFile()) {
    throw new Error(`${label} must be a regular file: ${path}`);
  }
}

function readSafeRegularFileBytes(path, label) {
  assertSafeRegularFile(path, label);
  let fileDescriptor;
  try {
    fileDescriptor = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const stat = fstatSync(fileDescriptor);
    if (!stat.isFile()) {
      throw new Error(`${label} must remain a regular file while being read.`);
    }
    return readFileSync(fileDescriptor);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`${label} must remain`)) {
      throw error;
    }
    throw new Error(`${label} could not be opened as a regular non-symlink file.`);
  } finally {
    if (fileDescriptor !== undefined) {
      closeSync(fileDescriptor);
    }
  }
}

function requireCurrentUserUid(getCurrentUid) {
  const currentUid = getCurrentUid();
  if (!Number.isInteger(currentUid) || currentUid < 0) {
    throw new Error("Current user uid is unavailable; release preparation is blocked.");
  }
  return currentUid;
}

function assertPrivateDirectory(path, label, currentUid) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`${label} must remain a regular directory.`);
  }
  if (stat.uid !== currentUid) {
    throw new Error(`${label} must be owned by the current user uid ${currentUid}.`);
  }
  if ((modeBits(stat.mode) & 0o022) !== 0) {
    throw new Error(`${label} must not be group/world writable.`);
  }
}

function ensureSafePrivateDirectory(path, parentPath, label, { currentUid, mkdir }) {
  const existing = lstatIfExists(path);
  if (!existing) {
    mkdir(path, { mode: 0o700 });
  }
  const realParentPath = assertSafeDirectory(parentPath, `${label} parent`);
  const realPath = assertSafeDirectory(path, label);
  assertPathInside(realParentPath, realPath, label);
  assertPrivateDirectory(path, label, currentUid);
  return realPath;
}

function reserveReleaseDestination({ destinationPath, currentUid, mkdir }) {
  try {
    mkdir(destinationPath, { mode: 0o700 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      throw new Error("Prepared release destination reservation is already held.");
    }
    throw error;
  }
  assertPrivateDirectory(destinationPath, "Prepared release destination", currentUid);
}

function runPrepareCommand({
  args,
  command,
  cwd,
  label,
  runCommand,
}) {
  const result = runCommand(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const stderr = String(result.stderr ?? "").trim();
    throw new Error(`${label} failed${stderr ? `: ${stderr}` : "."}`);
  }
  return String(result.stdout ?? "");
}

function readPrepareGitValue({ args, cwd, label, runCommand }) {
  const value = runPrepareCommand({
    args,
    command: "git",
    cwd,
    label,
    runCommand,
  }).trim();
  return requireReleaseSha(value, label);
}

function assertDetachedPrepareCheckout({ checkoutDir, runCommand }) {
  const result = runCommand("git", ["symbolic-ref", "-q", "HEAD"], {
    cwd: checkoutDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 1 || String(result.stdout ?? "").trim().length > 0) {
    throw new Error("Prepared release checkout must be detached at the exact release SHA.");
  }
}

function assertCleanTrackedPrepareCheckout({ checkoutDir, runCommand }) {
  const status = runPrepareCommand({
    args: ["status", "--porcelain=v1", "--untracked-files=no"],
    command: "git",
    cwd: checkoutDir,
    label: "Prepared release tracked-source status",
    runCommand,
  });
  if (status.trim().length > 0) {
    throw new Error("Prepared release must retain clean tracked source after install and validation.");
  }
}

function assertTrackedSymlinksStayInsideCheckout({ checkoutDir, runCommand }) {
  const output = runPrepareCommand({
    args: ["ls-files", "-s", "-z"],
    command: "git",
    cwd: checkoutDir,
    label: "Prepared release tracked-file inventory",
    runCommand,
  });
  const realCheckoutDir = realpathSync(checkoutDir);
  for (const entry of output.split("\0")) {
    if (!entry.startsWith("120000 ")) {
      continue;
    }
    const separator = entry.indexOf("\t");
    if (separator < 0) {
      throw new Error("Prepared release tracked symlink inventory is malformed.");
    }
    const trackedPath = entry.slice(separator + 1);
    const absoluteTrackedPath = resolve(checkoutDir, trackedPath);
    assertPathInside(realCheckoutDir, absoluteTrackedPath, "Prepared release tracked symlink");
    const stat = lstatIfExists(absoluteTrackedPath);
    if (!stat?.isSymbolicLink()) {
      throw new Error(`Prepared release tracked symlink is missing or replaced: ${trackedPath}`);
    }
    const realTarget = realpathSync(absoluteTrackedPath);
    assertPathInside(realCheckoutDir, realTarget, "Prepared release tracked symlink target");
  }
}

function assertReleaseDestinationAvailable({ destinationPath, releaseSha }) {
  const stat = lstatIfExists(destinationPath);
  if (!stat) {
    return;
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`Prepared release destination must not be a symlink: ${destinationPath}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Prepared release destination already exists and is not a directory: ${destinationPath}`);
  }

  const descriptorPath = join(destinationPath, "prepare.json");
  const descriptorStat = lstatIfExists(descriptorPath);
  if (!descriptorStat) {
    throw new Error("Partial prepared release directory already exists; reuse is blocked fail-closed.");
  }
  if (descriptorStat.isSymbolicLink() || !descriptorStat.isFile()) {
    throw new Error("Prepared release descriptor must be a regular non-symlink file.");
  }
  const descriptor = readJsonFile(descriptorPath, "Prepared release descriptor");
  if (descriptor.release_sha !== releaseSha) {
    throw new Error("Prepared release destination collision: the existing tag directory has a different SHA.");
  }
  throw new Error("Prepared release directory already exists; immutable releases are never reused.");
}

function readLockRecord({ homeDir = process.env.HOME ?? "" } = {}) {
  const paths = getLocalMacProductionReleasePaths(homeDir);
  if (!existsSync(paths.lockPath)) {
    return {
      corrupt: false,
      locked: false,
      lockRecord: null,
    };
  }

  try {
    const lockPathStat = lstatSync(paths.lockPath);
    if (
      lockPathStat.isSymbolicLink()
      || !lockPathStat.isDirectory()
      || modeBits(lockPathStat.mode) !== LOCK_DIRECTORY_MODE
    ) {
      return {
        corrupt: true,
        locked: true,
        lockRecord: null,
      };
    }

    if (!existsSync(paths.lockMetadataPath)) {
      return {
        corrupt: true,
        locked: true,
        lockRecord: null,
      };
    }

    const metadataStat = lstatSync(paths.lockMetadataPath);
    if (
      metadataStat.isSymbolicLink()
      || !metadataStat.isFile()
      || modeBits(metadataStat.mode) !== LOCK_METADATA_MODE
    ) {
      return {
        corrupt: true,
        locked: true,
        lockRecord: null,
      };
    }

    const lockRecord = readJsonFile(
      paths.lockMetadataPath,
      "Production promotion lock metadata",
    );
    if (
      !lockRecord
      || typeof lockRecord !== "object"
      || Array.isArray(lockRecord)
      || typeof lockRecord.lock_token !== "string"
      || typeof lockRecord.manifest_path !== "string"
      || typeof lockRecord.promotion_id !== "string"
      || typeof lockRecord.release_sha !== "string"
      || typeof lockRecord.release_tag !== "string"
    ) {
      return {
        corrupt: true,
        locked: true,
        lockRecord: null,
      };
    }

    return {
      corrupt: false,
      locked: true,
      lockRecord,
    };
  } catch {
    return {
      corrupt: true,
      locked: true,
      lockRecord: null,
    };
  }
}

export function isLocalMacProductionMutationCommand(command) {
  return MUTATION_COMMANDS.has(command);
}

export function getLocalMacProductionReleasePaths(homeDir = process.env.HOME ?? "") {
  const normalizedHomeDir = requireAbsolutePath(homeDir, "homeDir");
  const releaseRoot = resolve(normalizedHomeDir, ".homecook", "releases");
  const lockRoot = resolve(normalizedHomeDir, ".homecook", "locks");
  const lockPath = resolve(lockRoot, "production-promotion.lock");

  return {
    currentDescriptorPath: resolve(releaseRoot, "current.json"),
    lockMetadataPath: resolve(lockPath, "metadata.json"),
    lockPath,
    lockRoot,
    manifestsDir: resolve(releaseRoot, "manifests"),
    previousDescriptorPath: resolve(releaseRoot, "previous.json"),
    releaseRoot,
  };
}

export function readLocalMacProductionRepoHeadSha({
  rootDir = process.cwd(),
  runCommand = spawnSync,
} = {}) {
  const result = runCommand("git", ["rev-parse", "origin/master"], {
    cwd: requireAbsolutePath(rootDir, "rootDir"),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const releaseSha = String(result.stdout ?? "").trim();
  if (result.status !== 0 || !RELEASE_SHA_PATTERN.test(releaseSha)) {
    throw new Error("Local Mac production origin/master release SHA could not be resolved.");
  }
  return releaseSha;
}

function readGitRevParse({
  rootDir,
  runCommand,
  label,
  ref,
}) {
  const result = runCommand("git", ["rev-parse", ref], {
    cwd: requireAbsolutePath(rootDir, "rootDir"),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const value = String(result.stdout ?? "").trim();
  if (result.status !== 0 || !RELEASE_SHA_PATTERN.test(value)) {
    throw new Error(`${label} could not be resolved from git.`);
  }
  return value;
}

/**
 * @param {{
 *   releaseSha: string,
 *   releaseTag: string,
 *   rootDir?: string,
 *   runCommand?: typeof spawnSync,
 * }} [options]
 */
export function readLocalMacProductionGitReleaseEvidence({
  releaseSha,
  releaseTag,
  rootDir = process.cwd(),
  runCommand = spawnSync,
} = {}) {
  const normalizedReleaseSha = requireReleaseSha(releaseSha, "releaseSha");
  const normalizedReleaseTag = requireNonEmptyString(releaseTag, "releaseTag");

  return {
    originMasterSha: readGitRevParse({
      rootDir,
      runCommand,
      label: "origin/master release SHA",
      ref: "refs/remotes/origin/master^{commit}",
    }),
    releaseTagObjectSha: readGitRevParse({
      rootDir,
      runCommand,
      label: "Release tag object",
      ref: `refs/tags/${normalizedReleaseTag}^{tag}`,
    }),
    releaseTagCommitSha: readGitRevParse({
      rootDir,
      runCommand,
      label: "Release tag commit",
      ref: `refs/tags/${normalizedReleaseTag}^{commit}`,
    }),
    releaseTreeSha: readGitRevParse({
      rootDir,
      runCommand,
      label: "Release tree",
      ref: `${normalizedReleaseSha}^{tree}`,
    }),
  };
}

function normalizeRequiredCheckSummary(summary) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    throw new Error("manifest.required_check_summary must be an object.");
  }
  requireExactAllowedKeys(
    summary,
    REQUIRED_CHECK_SUMMARY_ALLOWED_FIELDS,
    "manifest.required_check_summary",
  );

  const normalized = {
    total: requireInteger(summary.total, "manifest.required_check_summary.total"),
    success: requireInteger(summary.success, "manifest.required_check_summary.success"),
    intended_skip: requireInteger(
      summary.intended_skip,
      "manifest.required_check_summary.intended_skip",
    ),
  };

  for (const field of ZERO_ONLY_CHECK_FIELDS) {
    if (summary[field] === undefined) {
      continue;
    }
    const count = requireInteger(
      summary[field],
      `manifest.required_check_summary.${field}`,
    );
    if (count !== 0) {
      throw new Error(
        `manifest.required_check_summary must not report ${field} checks for an approved release.`,
      );
    }
    normalized[field] = count;
  }

  if (normalized.total !== normalized.success + normalized.intended_skip) {
    throw new Error(
      "manifest.required_check_summary total must equal success + intended_skip exactly.",
    );
  }

  return normalized;
}

function requireTrustedAttestationVerification({
  gitEvidence,
  manifest,
  manifestDigest,
  manifestPath,
  rootDir,
  verifyAttestation,
}) {
  const verifier = typeof verifyAttestation === "function"
    ? verifyAttestation
    : null;
  if (!verifier) {
    throw new Error(
      "Trusted release attestation verification is not configured; production mutations are blocked.",
    );
  }

  const result = verifier({
    gitEvidence,
    manifest,
    manifestDigest,
    manifestPath,
    rootDir,
  });
  if (!result || result.verified !== true) {
    throw new Error("Trusted release attestation verification failed.");
  }

  return {
    source: typeof result.source === "string" && result.source.trim().length > 0
      ? result.source.trim()
      : "trusted-attestation-verifier",
    verified: true,
  };
}

/**
 * @param {{
 *   manifest: Record<string, unknown>,
 *   manifestDigest?: string | null,
 *   manifestPath?: string | null,
 *   readGitEvidence?: (input: {
 *     manifestPath?: string | null,
 *     releaseSha: string,
 *     releaseTag: string,
 *     rootDir: string,
 *   }) => {
 *     originMasterSha: string,
 *     releaseTagObjectSha: string,
 *     releaseTagCommitSha: string,
 *     releaseTreeSha: string,
 *   },
 *   requireAttestation?: boolean,
 *   rootDir?: string,
 *   verifyAttestation?: (input: Record<string, unknown>) => { verified: boolean, source?: string },
 * }} [options]
 */
export function validateLocalMacProductionReleaseManifest({
  manifest,
  manifestDigest = null,
  manifestPath,
  readGitEvidence = readLocalMacProductionGitReleaseEvidence,
  requireAttestation = false,
  rootDir = process.cwd(),
  verifyAttestation,
} = {}) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Release manifest must be a JSON object.");
  }
  requireExactAllowedKeys(manifest, RELEASE_MANIFEST_ALLOWED_FIELDS, "Release manifest");

  const normalizedRootDir = requireAbsolutePath(rootDir, "rootDir");
  const normalizedManifestPath = manifestPath
    ? requireAbsolutePath(manifestPath, "releaseManifestPath")
    : null;
  const schema = requireNonEmptyString(manifest.schema, "manifest.schema");
  if (schema !== LOCAL_MAC_PRODUCTION_RELEASE_SCHEMA) {
    throw new Error(
      `Release manifest schema must be ${LOCAL_MAC_PRODUCTION_RELEASE_SCHEMA}.`,
    );
  }

  const releaseTag = validateProductionReleaseTag(
    manifest.release_tag,
    "Release manifest release_tag",
  );
  const releaseTagObjectSha = requireReleaseSha(
    manifest.release_tag_object_sha,
    "manifest.release_tag_object_sha",
  );

  const releaseManifestPath = requireAbsolutePath(
    manifest.release_manifest_path,
    "manifest.release_manifest_path",
  );
  if (normalizedManifestPath && releaseManifestPath !== normalizedManifestPath) {
    throw new Error("Release manifest path must match the provided manifest location exactly.");
  }

  const releaseSha = requireReleaseSha(manifest.release_sha, "manifest.release_sha");
  const signerDigest = requireReleaseSha(
    manifest.signer_digest,
    "manifest.signer_digest",
  );
  if (signerDigest !== releaseSha) {
    throw new Error("manifest.signer_digest must equal manifest.release_sha exactly.");
  }
  if (manifest.repository !== CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY) {
    throw new Error(`manifest.repository must be ${CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY}.`);
  }
  if (manifest.source_ref !== CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF) {
    throw new Error(`manifest.source_ref must be ${CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF}.`);
  }
  if (manifest.signer_workflow !== CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW) {
    throw new Error(`manifest.signer_workflow must be ${CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW}.`);
  }
  if (manifest.expected_release_integration_id !== GITHUB_ACTIONS_APP_INTEGRATION_ID) {
    throw new Error(`manifest.expected_release_integration_id must be ${GITHUB_ACTIONS_APP_INTEGRATION_ID}.`);
  }
  const releaseTree = requireReleaseSha(manifest.release_tree, "manifest.release_tree");
  const masterShaAtApproval = requireReleaseSha(
    manifest.master_sha_at_approval,
    "manifest.master_sha_at_approval",
  );
  if (releaseSha !== masterShaAtApproval) {
    throw new Error(
      "Release manifest exact approved master mismatch: release_sha must equal origin/master at approval.",
    );
  }

  const gitEvidence = readGitEvidence({
    manifestPath: normalizedManifestPath,
    releaseSha,
    releaseTag,
    rootDir: normalizedRootDir,
  });
  if (
    !gitEvidence
    || typeof gitEvidence !== "object"
    || Array.isArray(gitEvidence)
  ) {
    throw new Error("Release manifest git evidence is invalid.");
  }

  const normalizedGitEvidence = {
    originMasterSha: requireReleaseSha(
      gitEvidence.originMasterSha,
      "gitEvidence.originMasterSha",
    ),
    releaseTagObjectSha: requireReleaseSha(
      gitEvidence.releaseTagObjectSha,
      "gitEvidence.releaseTagObjectSha",
    ),
    releaseTagCommitSha: requireReleaseSha(
      gitEvidence.releaseTagCommitSha,
      "gitEvidence.releaseTagCommitSha",
    ),
    releaseTreeSha: requireReleaseSha(
      gitEvidence.releaseTreeSha,
      "gitEvidence.releaseTreeSha",
    ),
  };

  if (normalizedGitEvidence.releaseTagCommitSha !== releaseSha) {
    throw new Error(
      "Release manifest tag commit mismatch: release_sha must equal the annotated release tag commit exactly.",
    );
  }
  if (normalizedGitEvidence.releaseTagObjectSha !== releaseTagObjectSha) {
    throw new Error(
      "Release manifest tag object mismatch: release_tag_object_sha must equal the annotated release tag object exactly.",
    );
  }
  if (normalizedGitEvidence.releaseTreeSha !== releaseTree) {
    throw new Error("Release manifest tree mismatch: release_tree must equal the tagged release tree.");
  }

  const approvedAt = requireNonEmptyString(manifest.approved_at, "manifest.approved_at");
  if (Number.isNaN(Date.parse(approvedAt))) {
    throw new Error("manifest.approved_at must be a valid ISO timestamp.");
  }

  const normalizedManifest = {
    schema,
    repository: CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
    source_ref: CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF,
    signer_workflow: CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW,
    signer_digest: signerDigest,
    expected_release_integration_id: GITHUB_ACTIONS_APP_INTEGRATION_ID,
    promotion_id: requireNonEmptyString(manifest.promotion_id, "manifest.promotion_id"),
    release_tag: releaseTag,
    release_tag_object_sha: releaseTagObjectSha,
    release_manifest_path: releaseManifestPath,
    release_sha: releaseSha,
    release_tree: releaseTree,
    master_sha_at_approval: masterShaAtApproval,
    approved_at: approvedAt,
    approved_by_task_id: requireNonEmptyString(
      manifest.approved_by_task_id,
      "manifest.approved_by_task_id",
    ),
    migration_head: requireNonEmptyString(manifest.migration_head, "manifest.migration_head"),
    build_id: requireNonEmptyString(manifest.build_id, "manifest.build_id"),
    backup_readiness_evidence: requireNonEmptyString(
      manifest.backup_readiness_evidence,
      "manifest.backup_readiness_evidence",
    ),
    previous_release_sha: requireReleaseSha(
      manifest.previous_release_sha,
      "manifest.previous_release_sha",
    ),
    expected_release_contexts: normalizeExpectedReleaseContexts(
      manifest.expected_release_contexts,
      "manifest.expected_release_contexts",
    ),
    required_check_summary: normalizeRequiredCheckSummary(manifest.required_check_summary),
    attestation_digest: requireDigest(
      manifest.attestation_digest,
      "manifest.attestation_digest",
    ),
    app_launch_agent_enabled: requireBoolean(
      manifest.app_launch_agent_enabled,
      "manifest.app_launch_agent_enabled",
    ),
    full_local_launch_agent_enabled: requireBoolean(
      manifest.full_local_launch_agent_enabled,
      "manifest.full_local_launch_agent_enabled",
    ),
    youtube_worker_launch_agent_enabled: requireBoolean(
      manifest.youtube_worker_launch_agent_enabled,
      "manifest.youtube_worker_launch_agent_enabled",
    ),
  };

  normalizedManifest.git_evidence = normalizedGitEvidence;
  const normalizedManifestDigest = requireAttestation
    ? (manifestDigest === null
      ? (normalizedManifestPath ? sha256File(normalizedManifestPath) : null)
      : requireDigest(manifestDigest, "manifestDigest"))
    : null;
  normalizedManifest.attestation = requireAttestation
    ? requireTrustedAttestationVerification({
      gitEvidence: normalizedGitEvidence,
      manifest: normalizedManifest,
      manifestDigest: normalizedManifestDigest,
      manifestPath: normalizedManifestPath,
      rootDir: normalizedRootDir,
      verifyAttestation,
    })
    : {
      source: "not-required",
      verified: false,
    };

  return normalizedManifest;
}

const LOCAL_MAC_PRODUCTION_PREPARE_COMMANDS = [
  {
    args: [
      "install",
      "--frozen-lockfile",
      "--offline",
      "--package-import-method=copy",
    ],
    command: "pnpm",
    label: "pnpm install --frozen-lockfile --offline --package-import-method=copy",
  },
  {
    args: ["mac-production:build"],
    command: "pnpm",
    label: "pnpm mac-production:build",
  },
  {
    args: ["verify:security-functions:release"],
    command: "pnpm",
    label: "pnpm verify:security-functions:release",
  },
  {
    args: ["verify:local-supabase-runtime:isolated"],
    command: "pnpm",
    label: "pnpm verify:local-supabase-runtime:isolated",
  },
];

/**
 * Creates a complete release candidate without acquiring the production lock or
 * changing current/previous descriptors, LaunchAgents, Docker, or runtime state.
 *
 * @param {{
 *   getCurrentUid?: () => number | undefined,
 *   homeDir?: string,
 *   manifestPath: string,
 *   mkdir?: typeof mkdirSync,
 *   now?: Date | string | number,
 *   readGitEvidence?: typeof readLocalMacProductionGitReleaseEvidence,
 *   rootDir?: string,
 *   runCommand?: typeof spawnSync,
 *   verifyAttestation?: (input: Record<string, unknown>) => { verified: boolean, source?: string },
 * }} [options]
 */
export function prepareLocalMacProductionRelease({
  getCurrentUid = () => process.getuid?.(),
  homeDir = process.env.HOME ?? "",
  manifestPath,
  mkdir = mkdirSync,
  now = new Date(),
  readGitEvidence = readLocalMacProductionGitReleaseEvidence,
  rootDir = process.cwd(),
  runCommand = spawnSync,
  verifyAttestation,
} = {}) {
  const normalizedHomeDir = requireAbsolutePath(homeDir, "homeDir");
  const normalizedRootDir = requireAbsolutePath(rootDir, "rootDir");
  const normalizedManifestPath = requireAbsolutePath(manifestPath, "releaseManifestPath");
  const realHomeDir = assertSafeDirectory(normalizedHomeDir, "homeDir");
  const realRootDir = assertSafeDirectory(normalizedRootDir, "rootDir");
  const manifestBytes = readSafeRegularFileBytes(normalizedManifestPath, "Release manifest");
  const manifestDigest = sha256Bytes(manifestBytes);
  let manifestInput;
  try {
    manifestInput = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error(`Release manifest is unreadable or invalid: ${normalizedManifestPath}`);
  }
  const manifest = validateLocalMacProductionReleaseManifest({
    manifest: manifestInput,
    manifestDigest,
    manifestPath: normalizedManifestPath,
    readGitEvidence,
    requireAttestation: true,
    rootDir: realRootDir,
    verifyAttestation,
  });

  const currentUid = requireCurrentUserUid(getCurrentUid);
  const paths = getLocalMacProductionReleasePaths(realHomeDir);
  const homecookRoot = dirname(paths.releaseRoot);
  ensureSafePrivateDirectory(homecookRoot, realHomeDir, "Homecook state directory", {
    currentUid,
    mkdir,
  });
  const realReleaseRoot = ensureSafePrivateDirectory(
    paths.releaseRoot,
    homecookRoot,
    "Local Mac production release root",
    { currentUid, mkdir },
  );
  const destinationPath = join(realReleaseRoot, manifest.release_tag);
  assertPathInside(realReleaseRoot, destinationPath, "Prepared release destination");
  assertReleaseDestinationAvailable({
    destinationPath,
    releaseSha: manifest.release_sha,
  });
  reserveReleaseDestination({ destinationPath, currentUid, mkdir });

  {
    runPrepareCommand({
      args: [
        "clone",
        "--no-checkout",
        "--no-hardlinks",
        "--no-local",
        realRootDir,
        destinationPath,
      ],
      command: "git",
      cwd: realReleaseRoot,
      label: "Exact release repository clone",
      runCommand,
    });
    runPrepareCommand({
      args: ["checkout", "--detach", manifest.release_sha],
      command: "git",
      cwd: destinationPath,
      label: "Exact detached release checkout",
      runCommand,
    });

    const checkedOutSha = readPrepareGitValue({
      args: ["rev-parse", "HEAD"],
      cwd: destinationPath,
      label: "Prepared release checkout SHA",
      runCommand,
    });
    if (checkedOutSha !== manifest.release_sha) {
      throw new Error("Prepared release checkout SHA does not equal the exact approved release SHA.");
    }
    const checkedOutTree = readPrepareGitValue({
      args: ["rev-parse", "HEAD^{tree}"],
      cwd: destinationPath,
      label: "Prepared release checkout tree",
      runCommand,
    });
    if (checkedOutTree !== manifest.release_tree) {
      throw new Error("Prepared release checkout tree does not equal the exact approved release tree.");
    }
    assertDetachedPrepareCheckout({ checkoutDir: destinationPath, runCommand });
    assertCleanTrackedPrepareCheckout({ checkoutDir: destinationPath, runCommand });
    assertTrackedSymlinksStayInsideCheckout({ checkoutDir: destinationPath, runCommand });

    for (const command of LOCAL_MAC_PRODUCTION_PREPARE_COMMANDS) {
      runPrepareCommand({
        ...command,
        cwd: destinationPath,
        runCommand,
      });
    }

    assertCleanTrackedPrepareCheckout({ checkoutDir: destinationPath, runCommand });
    const finalSha = readPrepareGitValue({
      args: ["rev-parse", "HEAD"],
      cwd: destinationPath,
      label: "Final prepared release checkout SHA",
      runCommand,
    });
    const finalTree = readPrepareGitValue({
      args: ["rev-parse", "HEAD^{tree}"],
      cwd: destinationPath,
      label: "Final prepared release checkout tree",
      runCommand,
    });
    if (finalSha !== manifest.release_sha || finalTree !== manifest.release_tree) {
      throw new Error("Prepared release checkout identity drifted during install or validation.");
    }

    const preparedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
    if (Number.isNaN(Date.parse(preparedAt))) {
      throw new Error("prepare timestamp is invalid.");
    }
    const descriptor = {
      schema: "homecook.local-mac-production-prepare.v1",
      status: "prepared",
      prepared_at: preparedAt,
      promotion_id: manifest.promotion_id,
      release_tag: manifest.release_tag,
      release_sha: manifest.release_sha,
      release_tree: manifest.release_tree,
      build_id: manifest.build_id,
      source_manifest_path: manifest.release_manifest_path,
      source_manifest_sha256: manifestDigest,
      attestation_source: manifest.attestation.source,
      validation_commands: LOCAL_MAC_PRODUCTION_PREPARE_COMMANDS.map(
        ({ command, args }) => ({ command, args: [...args] }),
      ),
    };
    writeFileSync(
      join(destinationPath, "release-manifest.json"),
      manifestBytes,
      { flag: "wx", mode: 0o600 },
    );
    writeFileSync(
      join(destinationPath, "prepare.json"),
      JSON.stringify(descriptor, null, 2),
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );

    return {
      current_head_sha: manifest.git_evidence.originMasterSha,
      manifest,
      prepare_descriptor_path: join(destinationPath, "prepare.json"),
      prepared: true,
      release_dir: destinationPath,
    };
  }
}

function brandLocalMacProductionMutationAuthority(payload) {
  return Object.defineProperty(payload, LOCAL_MAC_PRODUCTION_MUTATION_AUTHORITY_BRAND, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });
}

export function assertLocalMacProductionMutationAuthority({
  helperName = "Local Mac production mutation helper",
  mutationAuthority,
} = {}) {
  if (
    !mutationAuthority
    || typeof mutationAuthority !== "object"
    || mutationAuthority.required !== true
    || mutationAuthority[LOCAL_MAC_PRODUCTION_MUTATION_AUTHORITY_BRAND] !== true
  ) {
    throw new Error(
      `${helperName} requires a validated release authority. `
      + "Pass the result of validateLocalMacProductionMutationAuthority(...).",
    );
  }
  return mutationAuthority;
}

/**
 * @param {{
 *   homeDir?: string,
 *   manifest: Record<string, unknown>,
 *   manifestPath: string,
 *   lockToken?: string,
 *   pid?: number | null,
 *   bootSessionId?: string,
 *   promoterTaskId?: string,
 *   now?: Date | string | number,
 *   mkdir?: typeof mkdirSync,
 *   readCurrentHeadSha?: ((options?: { rootDir?: string }) => string),
 *   rootDir?: string,
 *   writeFile?: typeof writeFileSync,
 *   readGitEvidence?: typeof readLocalMacProductionGitReleaseEvidence,
 *   verifyAttestation?: (input: Record<string, unknown>) => { verified: boolean, source?: string },
 * }} [options]
 */
export function acquireLocalMacProductionPromotionLock({
  homeDir = process.env.HOME ?? "",
  manifest,
  manifestPath,
  lockToken = randomUUID(),
  pid = process.pid,
  bootSessionId = "unknown",
  promoterTaskId = manifest?.approved_by_task_id ?? "unknown",
  now = new Date(),
  mkdir = mkdirSync,
  readCurrentHeadSha = readLocalMacProductionRepoHeadSha,
  rootDir = process.cwd(),
  writeFile = writeFileSync,
  readGitEvidence = readLocalMacProductionGitReleaseEvidence,
  verifyAttestation,
} = {}) {
  void readCurrentHeadSha;
  const normalizedManifest = validateLocalMacProductionReleaseManifest({
    manifest,
    manifestPath,
    readGitEvidence,
    requireAttestation: true,
    rootDir,
    verifyAttestation,
  });
  const paths = getLocalMacProductionReleasePaths(homeDir);
  mkdir(paths.lockRoot, { recursive: true, mode: LOCK_DIRECTORY_MODE });

  try {
    mkdir(paths.lockPath, { mode: LOCK_DIRECTORY_MODE });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      throw new Error("Production promotion lock is already held.");
    }
    throw error;
  }

  const lockRecord = {
    acquired_at: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
    boot_session_id: requireNonEmptyString(bootSessionId, "bootSessionId"),
    lock_token: requireNonEmptyString(lockToken, "lockToken"),
    manifest_path: normalizedManifest.release_manifest_path,
    pid: Number.isInteger(pid) ? pid : null,
    promoter_task_id: requireNonEmptyString(promoterTaskId, "promoterTaskId"),
    promotion_id: normalizedManifest.promotion_id,
    release_sha: normalizedManifest.release_sha,
    release_tag: normalizedManifest.release_tag,
  };

  try {
    writeFile(
      paths.lockMetadataPath,
      JSON.stringify(lockRecord, null, 2),
      { encoding: "utf8", flag: "wx", mode: LOCK_METADATA_MODE },
    );
  } catch (error) {
    rmSync(paths.lockPath, { force: true, recursive: true });
    throw error;
  }

  return {
    holder: sanitizeLockHolder(lockRecord),
    lockMetadataPath: paths.lockMetadataPath,
    lockPath: paths.lockPath,
    lockToken: lockRecord.lock_token,
  };
}

/**
 * @param {{
 *   homeDir?: string,
 *   manifestPath?: string | null,
 *   currentHeadSha?: string | null,
 *   currentBootSessionId?: string,
 *   isProcessRunning?: (pid: number) => boolean,
 * }} [options]
 */
export function getLocalMacProductionReleaseStatus({
  homeDir = process.env.HOME ?? "",
  manifestPath = null,
  currentHeadSha = null,
  currentBootSessionId = "unknown",
  isProcessRunning = (pid) => {
    if (!Number.isInteger(pid)) {
      return false;
    }
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  },
  readGitEvidence = readLocalMacProductionGitReleaseEvidence,
  rootDir = process.cwd(),
} = {}) {
  const lockState = readLockRecord({ homeDir });
  const lockRecord = lockState.lockRecord;
  const holder = sanitizeLockHolder(lockRecord);
  const staleCandidate = Boolean(
    lockRecord
      && !lockState.corrupt
      && (
        (Number.isInteger(lockRecord.pid) && !isProcessRunning(lockRecord.pid))
        || (
          typeof currentBootSessionId === "string"
      && currentBootSessionId.length > 0
      && lockRecord.boot_session_id !== currentBootSessionId
    )
      ),
  );

  const manifest = manifestPath
    ? validateLocalMacProductionReleaseManifest({
      manifest: readJsonFile(
        requireAbsolutePath(manifestPath, "releaseManifestPath"),
        "Release manifest",
      ),
      manifestPath,
      readGitEvidence,
      rootDir,
    })
    : null;
  const normalizedCurrentHeadSha = currentHeadSha === null
    ? null
    : requireReleaseSha(currentHeadSha, "currentHeadSha");

  return {
    current_head_sha: normalizedCurrentHeadSha,
    lock: {
      corrupt: lockState.corrupt,
      holder,
      locked: lockState.locked,
      lock_path: getLocalMacProductionReleasePaths(homeDir).lockPath,
      manual_recovery_required: lockState.corrupt,
      staleCandidate,
    },
    manifest,
  };
}

/**
 * @param {{
 *   command: string,
 *   commandLabel?: string,
 *   rootDir?: string,
 *   homeDir?: string,
 *   releaseManifestPath?: string | null,
 *   lockToken?: string | null,
 *   env?: NodeJS.ProcessEnv,
 *   readCurrentHeadSha?: ((options?: { rootDir?: string }) => string),
 *   readGitEvidence?: typeof readLocalMacProductionGitReleaseEvidence,
 *   verifyAttestation?: (input: Record<string, unknown>) => { verified: boolean, source?: string },
 * }} options
 */
export function validateLocalMacProductionMutationAuthority({
  command,
  commandLabel = command,
  rootDir = process.cwd(),
  homeDir = process.env.HOME ?? "",
  releaseManifestPath = null,
  lockToken = null,
  env = process.env,
  readCurrentHeadSha = readLocalMacProductionRepoHeadSha,
  readGitEvidence = readLocalMacProductionGitReleaseEvidence,
  verifyAttestation,
} = {}) {
  if (!isLocalMacProductionMutationCommand(command)) {
    return brandLocalMacProductionMutationAuthority({
      command,
      command_key: command,
      manifest: null,
      required: false,
    });
  }

  const ignoredAmbientAuthority = Boolean(
    env?.HOMECOOK_RELEASE_MANIFEST_PATH || env?.HOMECOOK_RELEASE_LOCK_TOKEN,
  );
  if (!releaseManifestPath || !lockToken) {
    throw new Error(
      `Local Mac production command "${commandLabel}" requires --release-manifest <path> `
      + `and --lock-token <token>. Ambient environment variables are ignored.`,
    );
  }

  const normalizedManifestPath = requireAbsolutePath(
    releaseManifestPath,
    "releaseManifestPath",
  );
  const manifest = validateLocalMacProductionReleaseManifest({
    manifest: readJsonFile(normalizedManifestPath, "Release manifest"),
    manifestPath: normalizedManifestPath,
    readGitEvidence: typeof readGitEvidence === "function"
      ? readGitEvidence
      : ({ releaseSha, releaseTag, rootDir: evidenceRootDir }) => ({
        originMasterSha: readCurrentHeadSha({ rootDir: evidenceRootDir }),
        releaseTagObjectSha: readGitRevParse({
          rootDir: evidenceRootDir,
          runCommand: spawnSync,
          label: "Release tag object",
          ref: `refs/tags/${releaseTag}^{tag}`,
        }),
        releaseTagCommitSha: readGitRevParse({
          rootDir: evidenceRootDir,
          runCommand: spawnSync,
          label: "Release tag commit",
          ref: `refs/tags/${releaseTag}^{commit}`,
        }),
        releaseTreeSha: readGitRevParse({
          rootDir: evidenceRootDir,
          runCommand: spawnSync,
          label: "Release tree",
          ref: `${releaseSha}^{tree}`,
        }),
      }),
    requireAttestation: true,
    rootDir,
    verifyAttestation,
  });
  const lockState = readLockRecord({ homeDir });
  const lockRecord = lockState.lockRecord;
  if (lockState.corrupt) {
    throw new Error("Production promotion lock is corrupt and requires manual recovery.");
  }
  if (!lockRecord) {
    throw new Error("Production promotion lock is not held.");
  }

  if (lockRecord.lock_token !== requireNonEmptyString(lockToken, "lockToken")) {
    throw new Error("Release lock token does not match the active production promotion lock.");
  }
  if (
    lockRecord.release_sha !== manifest.release_sha
    || lockRecord.release_tag !== manifest.release_tag
    || lockRecord.promotion_id !== manifest.promotion_id
    || lockRecord.manifest_path !== manifest.release_manifest_path
  ) {
    throw new Error("Release manifest does not match the active production promotion lock.");
  }

  return brandLocalMacProductionMutationAuthority({
    command: commandLabel,
    command_key: command,
    ignoredAmbientAuthority,
    lock: sanitizeLockHolder(lockRecord),
    manifest,
    required: true,
  });
}
