import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

export const LOCAL_MAC_PRODUCTION_RELEASE_SCHEMA = "homecook.local-mac-production-release.v1";

const LOCAL_MAC_PRODUCTION_TAG_PATTERN = /^prod-\d{8}\.\d+$/u;
const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const MUTATION_COMMANDS = new Set(["prepare-env", "install", "restart", "uninstall"]);

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

function readLockRecord({ homeDir = process.env.HOME ?? "" } = {}) {
  const paths = getLocalMacProductionReleasePaths(homeDir);
  if (!existsSync(paths.lockMetadataPath)) {
    return null;
  }
  return readJsonFile(paths.lockMetadataPath, "Production promotion lock metadata");
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

export function validateLocalMacProductionReleaseManifest({
  manifest,
  currentHeadSha,
  manifestPath,
} = {}) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Release manifest must be a JSON object.");
  }

  const normalizedManifestPath = manifestPath
    ? requireAbsolutePath(manifestPath, "releaseManifestPath")
    : null;
  const schema = requireNonEmptyString(manifest.schema, "manifest.schema");
  if (schema !== LOCAL_MAC_PRODUCTION_RELEASE_SCHEMA) {
    throw new Error(
      `Release manifest schema must be ${LOCAL_MAC_PRODUCTION_RELEASE_SCHEMA}.`,
    );
  }

  const releaseTag = requireNonEmptyString(manifest.release_tag, "manifest.release_tag");
  if (!LOCAL_MAC_PRODUCTION_TAG_PATTERN.test(releaseTag)) {
    throw new Error("Release manifest release_tag must match prod-YYYYMMDD.N.");
  }

  const releaseManifestPath = requireAbsolutePath(
    manifest.release_manifest_path,
    "manifest.release_manifest_path",
  );
  if (normalizedManifestPath && releaseManifestPath !== normalizedManifestPath) {
    throw new Error("Release manifest path must match the provided manifest location exactly.");
  }

  const releaseSha = requireReleaseSha(manifest.release_sha, "manifest.release_sha");
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

  const normalizedCurrentHeadSha = currentHeadSha
    ? requireReleaseSha(currentHeadSha, "currentHeadSha")
    : null;
  if (normalizedCurrentHeadSha && releaseSha !== normalizedCurrentHeadSha) {
    throw new Error(
      "Release manifest exact approved master mismatch: release_sha must equal the current origin/master-approved head.",
    );
  }

  const approvedAt = requireNonEmptyString(manifest.approved_at, "manifest.approved_at");
  if (Number.isNaN(Date.parse(approvedAt))) {
    throw new Error("manifest.approved_at must be a valid ISO timestamp.");
  }

  const normalizedManifest = {
    schema,
    promotion_id: requireNonEmptyString(manifest.promotion_id, "manifest.promotion_id"),
    release_tag: releaseTag,
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
    required_check_summary: manifest.required_check_summary,
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

  if (
    !normalizedManifest.required_check_summary
    || typeof normalizedManifest.required_check_summary !== "object"
    || Array.isArray(normalizedManifest.required_check_summary)
  ) {
    throw new Error("manifest.required_check_summary must be an object.");
  }

  return normalizedManifest;
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
 *   writeFile?: typeof writeFileSync,
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
  writeFile = writeFileSync,
} = {}) {
  const normalizedManifest = validateLocalMacProductionReleaseManifest({
    manifest,
    currentHeadSha: manifest?.release_sha,
    manifestPath,
  });
  const paths = getLocalMacProductionReleasePaths(homeDir);
  mkdir(paths.lockRoot, { recursive: true, mode: 0o700 });

  try {
    mkdir(paths.lockPath, { mode: 0o700 });
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

  writeFile(
    paths.lockMetadataPath,
    JSON.stringify(lockRecord, null, 2),
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );

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
} = {}) {
  const lockRecord = readLockRecord({ homeDir });
  const holder = sanitizeLockHolder(lockRecord);
  const staleCandidate = Boolean(
    lockRecord
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
      currentHeadSha,
      manifestPath,
    })
    : null;

  return {
    current_head_sha: currentHeadSha,
    lock: {
      holder,
      locked: Boolean(lockRecord),
      lock_path: getLocalMacProductionReleasePaths(homeDir).lockPath,
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
} = {}) {
  if (!isLocalMacProductionMutationCommand(command)) {
    return {
      command,
      manifest: null,
      required: false,
    };
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

  const currentHeadSha = readCurrentHeadSha({ rootDir });
  const normalizedManifestPath = requireAbsolutePath(
    releaseManifestPath,
    "releaseManifestPath",
  );
  const manifest = validateLocalMacProductionReleaseManifest({
    manifest: readJsonFile(normalizedManifestPath, "Release manifest"),
    currentHeadSha,
    manifestPath: normalizedManifestPath,
  });
  const lockRecord = readLockRecord({ homeDir });
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

  return {
    command: commandLabel,
    ignoredAmbientAuthority,
    lock: sanitizeLockHolder(lockRecord),
    manifest,
    required: true,
  };
}
