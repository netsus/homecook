import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  constants as fsConstants,
  existsSync,
  fstatSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import {
  CANONICAL_GITHUB_PRODUCTION_RELEASE_REPOSITORY,
  CANONICAL_GITHUB_PRODUCTION_RELEASE_SIGNER_WORKFLOW,
  CANONICAL_GITHUB_PRODUCTION_RELEASE_SOURCE_REF,
  GITHUB_ACTIONS_APP_INTEGRATION_ID,
  buildProductionReleaseAnnotatedTagMessage,
  normalizeExpectedReleaseContexts,
  validateProductionReleaseTag,
} from "./production-release-approval-policy.mjs";
import { verifyYoutubeExtractionWorkerArtifact } from "./youtube-extraction-worker-artifact.mjs";

export const LOCAL_MAC_PRODUCTION_RELEASE_SCHEMA = "homecook.local-mac-production-release.v2";
const LOCAL_MAC_REHEARSAL_REPEATABILITY_SCHEMA =
  "homecook.local-mac-production-rehearsal-repeatability-receipt.v1";

const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/u;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const MUTATION_COMMANDS = new Set(["prepare-env", "install", "restart", "uninstall"]);
const LOCAL_MAC_PRODUCTION_MUTATION_AUTHORITY_BRAND = Symbol(
  "homecook.local-mac-production.mutation-authority",
);
const LOCK_DIRECTORY_MODE = 0o700;
const LOCK_METADATA_MODE = 0o600;
const EXECUTION_SNAPSHOT_SCHEMA = "homecook.local-mac-production-execution-snapshot.v1";
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
  "rehearsal_receipt_schema",
  "sealed_bundle_digest",
  "repeatability_receipt_digest",
  "rehearsal_receipt_valid_until",
  "backup_readiness_evidence",
  "previous_release_sha",
  "expected_release_contexts",
  "required_check_summary",
  "attestation_digest",
  "app_launch_agent_enabled",
  "full_local_launch_agent_enabled",
  "youtube_worker_launch_agent_enabled",
]);
const PREPARE_DESCRIPTOR_ALLOWED_FIELDS = new Set([
  "schema",
  "status",
  "prepared_at",
  "promotion_id",
  "release_tag",
  "release_sha",
  "release_tree",
  "build_id",
  "source_manifest_path",
  "source_manifest_sha256",
  "attestation_source",
  "validation_commands",
]);
const RUNNING_DESCRIPTOR_ALLOWED_FIELDS = new Set([
  "schema",
  "release_tag",
  "release_sha",
  "release_tree",
  "build_id",
  "promotion_id",
  "restart_capability",
  "full_local_config_sha256",
  "promoted_at",
  "source_manifest_sha256",
  "sealed_bundle_digest",
  "repeatability_receipt_digest",
  "execution_app_root",
  "execution_snapshot_digest",
  "worker_artifact_root",
  "worker_manifest_path",
  "worker_artifact_sha256",
  "worker_app_descriptor_sha256",
  "worker_config_sha256",
  "worker_credential_sha256",
  "worker_expected_schema_sha256",
  "worker_policy_sha256",
]);
const RUNNING_DESCRIPTOR_SCHEMA = "homecook.local-mac-production-running-release.v1";
export const FULL_LOCAL_RESUME_CURRENT_CAPABILITY = "full-local-resume-current-v1";
const LEGACY_BOOTSTRAP_RELEASE_SHA = "e02f02a87d1d955dc598728e7029a745a650a5c3";
export const FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA =
  "3bdd814da8f9849805185d1b3be5a6ee703133a0";
export const FIRST_CANONICAL_ADOPTION_FULL_LOCAL_SOURCE_SHA =
  "36e7aecfe429875f2dc12f3effc020ab1296a818";
export const FIRST_CANONICAL_ADOPTION_BRIDGE_MODE = "first-canonical-adoption-v1";
const FIRST_CANONICAL_ADOPTION_APP_ROOT_SUFFIX =
  "01_vibe_coding/homecook-production-current";
const FIRST_CANONICAL_ADOPTION_FULL_LOCAL_ROOT_SUFFIX =
  "01_vibe_coding/homecook-session-refresh-storm-deploy-v9";
const FIRST_CANONICAL_ADOPTION_WORKER_RELEASE_ROOT_SUFFIX =
  `.homecook/youtube-extraction-releases/${FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA}-admin-acl-v1`;
const FIRST_CANONICAL_ADOPTION_WORKER_MANIFEST_BASENAME = "artifact.json";
const RUNNING_DESCRIPTOR_WORKER_PATH_FIELDS = Object.freeze([
  "execution_app_root",
  "execution_snapshot_digest",
  "worker_artifact_root",
  "worker_manifest_path",
  "worker_artifact_sha256",
  "worker_app_descriptor_sha256",
  "worker_config_sha256",
  "worker_credential_sha256",
  "worker_expected_schema_sha256",
  "worker_policy_sha256",
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

function requireExactUtcTimestamp(value, label) {
  const normalized = requireNonEmptyString(value, label);
  const milliseconds = Date.parse(normalized);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== normalized) {
    throw new Error(`${label} must be an exact UTC millisecond RFC3339 instant.`);
  }
  return normalized;
}

function requireExactValue(value, expected, label) {
  if (value !== expected) throw new Error(`${label} must be ${expected}.`);
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

function digestExecutionTree(rootPath) {
  const root = realpathSync(rootPath);
  const hash = createHash("sha256");
  const digestDereferencedTarget = (path, seen = new Set()) => {
    const realPath = realpathSync(path);
    if (seen.has(realPath)) throw new Error("Execution symlink cycle is not allowed.");
    const nextSeen = new Set(seen).add(realPath);
    const stat = lstatSync(realPath);
    if (stat.isDirectory()) {
      hash.update("target-dir\0");
      for (const name of readdirSync(realPath).sort()) {
        hash.update(`target-name\0${name}\0`);
        digestDereferencedTarget(join(realPath, name), nextSeen);
      }
      return;
    }
    if (!stat.isFile()) throw new Error("Execution symlink target must be regular.");
    hash.update(`target-file\0${(stat.mode & 0o111) === 0 ? "data" : "exec"}\0`);
    hash.update(readFileSync(realPath));
    hash.update("\0");
  };
  const visit = (path, relativePath) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      const target = realpathSync(path);
      assertPathInside(root, target, "Execution symlink target");
      const targetRelative = relative(root, target);
      if (targetRelative === ".git" || targetRelative.startsWith(`.git${sep}`)) {
        throw new Error("Execution symlink target must not enter Git metadata.");
      }
      hash.update(`link\0${relativePath}\0${targetRelative}\0`);
      digestDereferencedTarget(target);
      return;
    }
    if (stat.isDirectory()) {
      hash.update(`dir\0${relativePath}\0`);
      for (const name of readdirSync(path).sort()) {
        if (relativePath === "" && name === ".git") continue;
        visit(join(path, name), relativePath ? `${relativePath}/${name}` : name);
      }
      return;
    }
    if (!stat.isFile()) throw new Error("Execution snapshot contains an unsupported entry.");
    hash.update(`file\0${relativePath}\0${(stat.mode & 0o111) === 0 ? "data" : "exec"}\0`);
    hash.update(readFileSync(path));
    hash.update("\0");
  };
  visit(root, "");
  return hash.digest("hex");
}

function assertExecutionSymlinksContained(rootPath) {
  const root = realpathSync(rootPath);
  const visit = (path) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      assertPathInside(root, realpathSync(path), "Sealed execution symlink target");
      return;
    }
    if (stat.isDirectory()) {
      for (const name of readdirSync(path)) visit(join(path, name));
    }
  };
  visit(root);
}

function copyExecutionTree(
  sourcePath,
  destinationPath,
  { copyEntryHook = () => undefined, excludeRelativePaths = [] } = {},
) {
  const sourceRoot = realpathSync(sourcePath);
  const destinationRoot = resolve(destinationPath);
  const excluded = new Set(excludeRelativePaths);
  const copyEntry = (source, destination, relativePath = "") => {
    if (
      relativePath
      && [...excluded].some((entry) =>
        relativePath === entry || relativePath.startsWith(`${entry}/`))
    ) {
      return;
    }
    const stat = lstatSync(source);
    if (stat.isSymbolicLink()) {
      const target = realpathSync(source);
      assertPathInside(sourceRoot, target, "Execution snapshot symlink target");
      const targetRelative = relative(sourceRoot, target);
      if (targetRelative === ".git" || targetRelative.startsWith(`.git${sep}`)) {
        throw new Error("Execution snapshot symlink target must not enter Git metadata.");
      }
      const destinationTarget = resolve(destinationRoot, targetRelative);
      symlinkSync(relative(dirname(destination), destinationTarget) || ".", destination);
      copyEntryHook({ destination, phase: "after_symlink_copy", source });
      return;
    }
    if (stat.isDirectory()) {
      mkdirSync(destination, { mode: 0o700 });
      for (const name of readdirSync(source).sort()) {
        copyEntry(
          join(source, name),
          join(destination, name),
          relativePath ? `${relativePath}/${name}` : name,
        );
      }
      return;
    }
    if (!stat.isFile()) throw new Error("Execution source contains an unsupported entry.");
    copyFileSync(source, destination, fsConstants.COPYFILE_EXCL);
    chmodSync(destination, (stat.mode & 0o111) === 0 ? 0o400 : 0o500);
    copyEntryHook({ destination, phase: "after_file_copy", source });
  };
  copyEntry(sourceRoot, destinationPath);
  assertExecutionSymlinksContained(destinationPath);
}

function digestComposedAppDestination(appSourceRoot, fullLocalSourceRoot) {
  const calculationRoot = mkdtempSync(join(tmpdir(), "homecook-execution-app-digest-"));
  const appRoot = join(calculationRoot, "app");
  try {
    copyExecutionTree(appSourceRoot, appRoot);
    if (fullLocalSourceRoot) {
      const sealedInfraRoot = join(fullLocalSourceRoot, "infra");
      if (existsSync(sealedInfraRoot)) {
        copyExecutionTree(sealedInfraRoot, join(appRoot, "infra"));
      }
    }
    sealExecutionTree(appRoot);
    return digestExecutionTree(appRoot);
  } finally {
    removePrivateScratchTree(calculationRoot);
  }
}

function removePrivateScratchTree(rootPath) {
  if (!existsSync(rootPath)) return;
  const makeDirectoriesWritable = (path) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isDirectory()) return;
    chmodSync(path, 0o700);
    for (const name of readdirSync(path)) makeDirectoriesWritable(join(path, name));
  };
  makeDirectoriesWritable(rootPath);
  rmSync(rootPath, { recursive: true, force: true });
}

function copySnapshotAuthorityFile(
  sourcePath,
  destinationPath,
  expectedDigest,
  copyEntryHook,
) {
  const source = realpathSync(sourcePath);
  const sourceStat = lstatSync(sourcePath);
  if (sourceStat.isSymbolicLink() || !sourceStat.isFile()) {
    throw new Error("Snapshot authority source must be a regular non-symlink file.");
  }
  copyEntryHook({
    destination: destinationPath,
    phase: "after_authority_precheck",
    source,
  });
  if (existsSync(destinationPath)) {
    if (sha256Bytes(readFileSync(destinationPath)) !== expectedDigest) {
      throw new Error("Execution snapshot authority file collision.");
    }
    copyEntryHook({ destination: destinationPath, phase: "after_authority_copy", source });
    return destinationPath;
  }
  copyFileSync(source, destinationPath, fsConstants.COPYFILE_EXCL);
  chmodSync(destinationPath, 0o400);
  copyEntryHook({ destination: destinationPath, phase: "after_authority_copy", source });
  if (sha256Bytes(readFileSync(destinationPath)) !== expectedDigest) {
    throw new Error("Copied snapshot authority file digest drifted.");
  }
  return destinationPath;
}

function writeSnapshotAuthorityBytes(destinationPath, bytes) {
  writeFileSync(destinationPath, bytes, { flag: "wx", mode: 0o400 });
  chmodSync(destinationPath, 0o400);
  return destinationPath;
}

function sealExecutionTree(rootPath) {
  const visit = (path) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const name of readdirSync(path)) visit(join(path, name));
      chmodSync(path, 0o500);
      return;
    }
    if (!stat.isFile()) throw new Error("Execution snapshot contains an unsupported entry.");
    chmodSync(path, (stat.mode & 0o111) === 0 ? 0o400 : 0o500);
  };
  visit(rootPath);
}

function assertSealedExecutionTree(rootPath, expectedUid) {
  const visit = (path) => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return;
    if (stat.uid !== expectedUid || (modeBits(stat.mode) & 0o222) !== 0) {
      throw new Error("Sealed execution snapshot owner or mode drifted.");
    }
    if (stat.isDirectory()) {
      for (const name of readdirSync(path)) visit(join(path, name));
    } else if (!stat.isFile()) {
      throw new Error("Sealed execution snapshot contains an unsupported entry.");
    }
  };
  visit(rootPath);
}

// Candidate sealing reuses the production execution-tree copier and mode
// normalizer so the rehearsal path cannot drift into a weaker parallel seal.
export {
  assertSealedExecutionTree as assertLocalMacProductionSealedExecutionTree,
  copyExecutionTree as copyLocalMacProductionExecutionTree,
  digestExecutionTree as digestLocalMacProductionExecutionTree,
  sealExecutionTree as sealLocalMacProductionExecutionTree,
};

export function verifyLocalMacProductionExecutionSnapshot(snapshot) {
  if (!snapshot || snapshot.schema !== EXECUTION_SNAPSHOT_SCHEMA) {
    throw new Error("Sealed execution snapshot evidence is missing.");
  }
  const stat = lstatSync(snapshot.root);
  if (
    stat.isSymbolicLink()
    || !stat.isDirectory()
    || stat.dev !== snapshot.dev
    || stat.ino !== snapshot.ino
    || stat.uid !== snapshot.uid
    || (modeBits(stat.mode) & 0o222) !== 0
  ) {
    throw new Error("Sealed execution snapshot inode or mode drifted.");
  }
  const appStat = lstatSync(snapshot.appRoot);
  const fullLocalStat = snapshot.fullLocalRoot ? lstatSync(snapshot.fullLocalRoot) : null;
  const workerStat = lstatSync(snapshot.workerRoot);
  const authorityStat = lstatSync(snapshot.authorityRoot);
  if (
    appStat.dev !== snapshot.appDev
    || appStat.ino !== snapshot.appIno
    || (fullLocalStat && (fullLocalStat.dev !== snapshot.fullLocalDev || fullLocalStat.ino !== snapshot.fullLocalIno))
    || workerStat.dev !== snapshot.workerDev
    || workerStat.ino !== snapshot.workerIno
    || authorityStat.dev !== snapshot.authorityDev
    || authorityStat.ino !== snapshot.authorityIno
  ) {
    throw new Error("Sealed execution snapshot component inode drifted.");
  }
  assertSealedExecutionTree(snapshot.appRoot, snapshot.uid);
  if (snapshot.fullLocalRoot) assertSealedExecutionTree(snapshot.fullLocalRoot, snapshot.uid);
  assertSealedExecutionTree(snapshot.workerRoot, snapshot.uid);
  assertSealedExecutionTree(snapshot.authorityRoot, snapshot.uid);
  assertExecutionSymlinksContained(snapshot.appRoot);
  if (snapshot.fullLocalRoot) assertExecutionSymlinksContained(snapshot.fullLocalRoot);
  assertExecutionSymlinksContained(snapshot.workerRoot);
  assertExecutionSymlinksContained(snapshot.authorityRoot);
  const metadataStat = lstatSync(snapshot.metadataPath);
  if (
    !metadataStat.isFile()
    || metadataStat.isSymbolicLink()
    || metadataStat.uid !== snapshot.uid
    || modeBits(metadataStat.mode) !== 0o400
    || sha256Bytes(readFileSync(snapshot.metadataPath)) !== snapshot.metadataDigest
  ) {
    throw new Error("Sealed execution snapshot evidence drifted.");
  }
  let metadata;
  try {
    metadata = JSON.parse(readFileSync(snapshot.metadataPath, "utf8"));
  } catch {
    throw new Error("Sealed execution snapshot evidence is invalid JSON.");
  }
  if (
    metadata.prelock_scratch_authority_digest !== snapshot.prelockScratchAuthorityDigest
    && (metadata.prelock_scratch_authority_digest !== undefined
      || snapshot.prelockScratchAuthorityDigest !== undefined)
  ) {
    throw new Error("Pre-lock scratch authority drifted from sealed snapshot metadata.");
  }
  const appDigest = digestExecutionTree(snapshot.appRoot);
  const fullLocalDigest = snapshot.fullLocalRoot ? digestExecutionTree(snapshot.fullLocalRoot) : null;
  const workerDigest = digestExecutionTree(snapshot.workerRoot);
  const authorityDigest = digestExecutionTree(snapshot.authorityRoot);
  if (
    appDigest !== snapshot.appDigest
    || (snapshot.fullLocalRoot && fullLocalDigest !== snapshot.fullLocalDigest)
    || workerDigest !== snapshot.workerDigest
    || authorityDigest !== snapshot.authorityDigest
  ) {
    throw new Error("Sealed execution snapshot content digest drifted.");
  }
  if (snapshot.sealedBundleDigest !== undefined) {
    if (
      snapshot.sealedBundleDigest !== snapshot.manifestSealedBundleDigest
      || !DIGEST_PATTERN.test(snapshot.candidateIdentityDigest ?? "")
      || !DIGEST_PATTERN.test(snapshot.bundleManifestDigest ?? "")
      || !DIGEST_PATTERN.test(snapshot.repeatabilityReceiptDigest ?? "")
      || (snapshot.prelockScratchAuthorityDigest !== undefined
        && !DIGEST_PATTERN.test(snapshot.prelockScratchAuthorityDigest))
    ) throw new Error("Sealed execution snapshot rehearsal authority drifted.");
  }
  return snapshot;
}

export function createLocalMacProductionExecutionSnapshot({
  copyEntryHook = () => undefined,
  frozenScratch = null,
  manifest,
  prelockScratchAuthorityDigest = null,
  preparedReleaseDir,
  releaseRoot,
  sealedCandidate = null,
  worker,
}) {
  if (prelockScratchAuthorityDigest !== null
    && !DIGEST_PATTERN.test(prelockScratchAuthorityDigest)) {
    throw new Error("Pre-lock scratch authority digest is invalid.");
  }
  if (frozenScratch) verifyLocalMacProductionExecutionSnapshot(frozenScratch);
  const currentUid = process.getuid?.();
  if (!Number.isInteger(currentUid)) throw new Error("Execution snapshot current user identity is unavailable.");
  const canonicalReleaseRoot = snapshotPrivateDirectoryIdentity(
    releaseRoot,
    "Execution snapshot release root",
    currentUid,
  ).realpath;
  const appSourceRoot = frozenScratch?.appRoot ?? sealedCandidate?.appRoot ?? preparedReleaseDir;
  const workerSourceRoot = frozenScratch?.workerRoot ?? sealedCandidate?.workerRoot ?? worker.artifactRoot;
  const fullLocalSourceRoot = frozenScratch?.fullLocalRoot ?? sealedCandidate?.fullLocalRoot ?? null;
  const workerManifestSourcePath = frozenScratch?.manifestPath ?? sealedCandidate?.workerManifestPath ?? worker.manifestPath;
  const workerAuthority = frozenScratch ? {
    appDescriptorPath: frozenScratch.appDescriptorPath,
    expectedSchemaPath: frozenScratch.expectedSchemaPath,
    policyPath: frozenScratch.policyPath,
    ...(frozenScratch.attestationBundlePath ? {
      resumeAuthority: {
        bundlePath: frozenScratch.attestationBundlePath,
        subjectManifestPath: frozenScratch.attestationSubjectPath,
        trustedRootPath: frozenScratch.attestationTrustedRootPath,
      },
    } : {}),
  } : worker;
  if (sealedCandidate && (
    sealedCandidate.sealedBundleDigest !== manifest.sealed_bundle_digest
    || sealedCandidate.repeatabilityReceiptDigest !== manifest.repeatability_receipt_digest
    || !DIGEST_PATTERN.test(sealedCandidate.candidateIdentityDigest ?? "")
    || !DIGEST_PATTERN.test(sealedCandidate.bundleManifestDigest ?? "")
  )) throw new Error("Sealed candidate authority does not match the production manifest.");
  const appSourceDigest = digestExecutionTree(appSourceRoot);
  const fullLocalSourceDigest = fullLocalSourceRoot ? digestExecutionTree(fullLocalSourceRoot) : null;
  const workerSourceDigest = digestExecutionTree(workerSourceRoot);
  if (sealedCandidate && !frozenScratch && (
    sealedCandidate.appSourceDigest !== appSourceDigest
    || sealedCandidate.fullLocalSourceDigest !== fullLocalSourceDigest
    || sealedCandidate.workerSourceDigest !== workerSourceDigest
  )) throw new Error("Sealed candidate physical execution bytes differ from verified authority.");
  if (frozenScratch && (
    frozenScratch.sealedBundleDigest !== sealedCandidate?.sealedBundleDigest
    || frozenScratch.repeatabilityReceiptDigest !== sealedCandidate?.repeatabilityReceiptDigest
    || frozenScratch.candidateIdentityDigest !== sealedCandidate?.candidateIdentityDigest
    || frozenScratch.bundleManifestDigest !== sealedCandidate?.bundleManifestDigest
    || frozenScratch.appDigest !== appSourceDigest
    || frozenScratch.fullLocalDigest !== fullLocalSourceDigest
    || frozenScratch.workerDigest !== workerSourceDigest
  )) throw new Error("Frozen pre-lock scratch authority differs from the sealed candidate.");
  const expectedAppDestinationDigest = frozenScratch?.appDigest
    ?? digestComposedAppDestination(appSourceRoot, fullLocalSourceRoot);
  const appDescriptorSourceDigest = sha256Bytes(readFileSync(workerAuthority.appDescriptorPath));
  const expectedSchemaSourceDigest = sha256Bytes(readFileSync(workerAuthority.expectedSchemaPath));
  const policySourceDigest = sha256Bytes(readFileSync(workerAuthority.policyPath));
  const resumeAuthority = workerAuthority.resumeAuthority ?? null;
  const resumeAuthorityFields = resumeAuthority
    ? ["bundlePath", "subjectManifestPath", "trustedRootPath"]
    : [];
  if (
    resumeAuthority
    && resumeAuthorityFields.some((field) =>
      typeof resumeAuthority[field] !== "string" || resumeAuthority[field].length === 0)
  ) {
    throw new Error("Persistent full-local resume attestation authority is incomplete.");
  }
  const resumeAuthoritySnapshots = resumeAuthority
    ? Object.fromEntries([
        ["bundlePath", "attestation_bundle"],
        ["subjectManifestPath", "attestation_subject"],
        ["trustedRootPath", "attestation_trusted_root"],
      ].map(([field, label]) => [field, readLocalMacProductionAuthorityInputSnapshot({
        label,
        path: resumeAuthority[field],
        trustedRoot: dirname(resumeAuthority[field]),
      })]))
    : null;
  const attestationBundleSourceDigest = resumeAuthoritySnapshots?.bundlePath.sha256 ?? null;
  const attestationSubjectSourceDigest = resumeAuthoritySnapshots?.subjectManifestPath.sha256 ?? null;
  const attestationTrustedRootSourceDigest = resumeAuthoritySnapshots?.trustedRootPath.sha256 ?? null;
  const gitEvidenceBytes = resumeAuthority
    ? Buffer.from(`${JSON.stringify(manifest.git_evidence, null, 2)}\n`)
    : null;
  const gitEvidenceDigest = gitEvidenceBytes ? sha256Bytes(gitEvidenceBytes) : null;
  const identityDigest = sha256Bytes(Buffer.from(JSON.stringify({
    app: expectedAppDestinationDigest,
    ...(fullLocalSourceDigest ? { full_local: fullLocalSourceDigest } : {}),
    app_descriptor: appDescriptorSourceDigest,
    ...(resumeAuthority ? {
      attestation_bundle: attestationBundleSourceDigest,
      attestation_subject: attestationSubjectSourceDigest,
      attestation_trusted_root: attestationTrustedRootSourceDigest,
    } : {}),
    build_id: manifest.build_id,
    ...(resumeAuthority ? { git_evidence: gitEvidenceDigest } : {}),
    promotion_id: manifest.promotion_id,
    release_sha: manifest.release_sha,
    release_tree: manifest.release_tree,
    expected_schema: expectedSchemaSourceDigest,
    policy: policySourceDigest,
    worker: workerSourceDigest,
    ...(sealedCandidate ? {
      sealed_bundle_digest: sealedCandidate.sealedBundleDigest,
      repeatability_receipt_digest: sealedCandidate.repeatabilityReceiptDigest,
      candidate_identity_digest: sealedCandidate.candidateIdentityDigest,
      bundle_manifest_digest: sealedCandidate.bundleManifestDigest,
    } : {}),
    ...(prelockScratchAuthorityDigest ? {
      prelock_scratch_authority_digest: prelockScratchAuthorityDigest,
    } : {}),
  })));
  const executionRoot = join(canonicalReleaseRoot, "execution-snapshots");
  if (!existsSync(executionRoot)) {
    mkdirSync(executionRoot, { mode: 0o700 });
  } else {
    const executionRootStat = lstatSync(executionRoot);
    if (
      executionRootStat.isSymbolicLink()
      || !executionRootStat.isDirectory()
      || modeBits(executionRootStat.mode) !== 0o700
      || executionRootStat.uid !== currentUid
    ) {
      throw new Error("Execution snapshot root owner, mode, or symlink state is unsafe.");
    }
  }
  const snapshotRoot = join(executionRoot, identityDigest);
  mkdirSync(snapshotRoot, { mode: 0o700 });
  const appRoot = join(snapshotRoot, "app");
  const fullLocalRoot = fullLocalSourceRoot ? join(snapshotRoot, "full-local") : null;
  const workerRoot = join(snapshotRoot, "worker");
  try {
    copyExecutionTree(appSourceRoot, appRoot, { copyEntryHook });
    if (fullLocalSourceRoot && !frozenScratch) {
      copyExecutionTree(fullLocalSourceRoot, fullLocalRoot, { copyEntryHook });
      const sealedInfraRoot = join(fullLocalRoot, "infra");
      if (existsSync(sealedInfraRoot)) {
        copyExecutionTree(sealedInfraRoot, join(appRoot, "infra"), { copyEntryHook });
      }
    } else if (fullLocalSourceRoot) {
      copyExecutionTree(fullLocalSourceRoot, fullLocalRoot, { copyEntryHook });
    }
    copyExecutionTree(workerSourceRoot, workerRoot, { copyEntryHook });
    if (
      digestExecutionTree(appRoot) !== expectedAppDestinationDigest
      || (fullLocalSourceRoot && digestExecutionTree(fullLocalRoot) !== fullLocalSourceDigest)
      || digestExecutionTree(workerRoot) !== workerSourceDigest
    ) {
      throw new Error("Copied execution bytes do not match the pre-copy source digest.");
    }
    const authorityRoot = join(snapshotRoot, "authority");
    mkdirSync(authorityRoot, { mode: 0o700 });
    const appDescriptorPath = copySnapshotAuthorityFile(
      workerAuthority.appDescriptorPath,
      join(authorityRoot, "app-descriptor.json"),
      appDescriptorSourceDigest,
      copyEntryHook,
    );
    const expectedSchemaPath = copySnapshotAuthorityFile(
      workerAuthority.expectedSchemaPath,
      join(authorityRoot, "expected-schema.json"),
      expectedSchemaSourceDigest,
      copyEntryHook,
    );
    const policyPath = copySnapshotAuthorityFile(
      workerAuthority.policyPath,
      join(authorityRoot, "policy.json"),
      policySourceDigest,
      copyEntryHook,
    );
    const attestationBundlePath = resumeAuthority
      ? writeSnapshotAuthorityBytes(
        join(authorityRoot, "attestation-bundle.jsonl"),
        resumeAuthoritySnapshots.bundlePath.bytes,
      )
      : null;
    const attestationSubjectPath = resumeAuthority
      ? writeSnapshotAuthorityBytes(
        join(authorityRoot, "attestation-subject.json"),
        resumeAuthoritySnapshots.subjectManifestPath.bytes,
      )
      : null;
    const attestationTrustedRootPath = resumeAuthority
      ? writeSnapshotAuthorityBytes(
        join(authorityRoot, "attestation-trusted-root.jsonl"),
        resumeAuthoritySnapshots.trustedRootPath.bytes,
      )
      : null;
    const gitEvidencePath = resumeAuthority
      ? writeSnapshotAuthorityBytes(
        join(authorityRoot, "git-evidence.json"),
        gitEvidenceBytes,
      )
      : null;
    const manifestRelative = relative(
      realpathSync(workerSourceRoot),
      realpathSync(workerManifestSourcePath),
    );
    if (manifestRelative.startsWith("..") || isAbsolute(manifestRelative)) {
      throw new Error("Worker manifest escapes its artifact root.");
    }
    const manifestPath = resolve(workerRoot, manifestRelative);
    if (digestExecutionTree(appSourceRoot) !== appSourceDigest
      || (fullLocalSourceRoot && digestExecutionTree(fullLocalSourceRoot) !== fullLocalSourceDigest)
      || digestExecutionTree(workerSourceRoot) !== workerSourceDigest
      || sha256Bytes(readFileSync(workerAuthority.appDescriptorPath)) !== appDescriptorSourceDigest
      || sha256Bytes(readFileSync(workerAuthority.expectedSchemaPath)) !== expectedSchemaSourceDigest
      || sha256Bytes(readFileSync(workerAuthority.policyPath)) !== policySourceDigest
      || (resumeAuthoritySnapshots && Object.values(resumeAuthoritySnapshots).some((snapshot) => {
        try {
          verifyLocalMacProductionAuthorityInputSnapshot(snapshot);
          return false;
        } catch {
          return true;
        }
      }))) {
      throw new Error("Execution source drifted while the sealed snapshot was created.");
    }
    sealExecutionTree(appRoot);
    if (fullLocalRoot) sealExecutionTree(fullLocalRoot);
    sealExecutionTree(workerRoot);
    sealExecutionTree(authorityRoot);
    const appDigest = digestExecutionTree(appRoot);
    const fullLocalDigest = fullLocalRoot ? digestExecutionTree(fullLocalRoot) : null;
    const workerDigest = digestExecutionTree(workerRoot);
    const authorityDigest = digestExecutionTree(authorityRoot);
    const metadataPath = join(snapshotRoot, "evidence.json");
    writeFileSync(metadataPath, JSON.stringify({
      schema: EXECUTION_SNAPSHOT_SCHEMA,
      app_digest: appDigest,
      ...(fullLocalDigest ? { full_local_digest: fullLocalDigest } : {}),
      execution_snapshot_digest: identityDigest,
      promotion_id: manifest.promotion_id,
      release_sha: manifest.release_sha,
      release_tree: manifest.release_tree,
      worker_digest: workerDigest,
      authority_digest: authorityDigest,
      ...(sealedCandidate ? {
        sealed_bundle_digest: sealedCandidate.sealedBundleDigest,
        repeatability_receipt_digest: sealedCandidate.repeatabilityReceiptDigest,
        candidate_identity_digest: sealedCandidate.candidateIdentityDigest,
        bundle_manifest_digest: sealedCandidate.bundleManifestDigest,
      } : {}),
      ...(prelockScratchAuthorityDigest ? {
        prelock_scratch_authority_digest: prelockScratchAuthorityDigest,
      } : {}),
    }, null, 2), { flag: "wx", mode: 0o600 });
    chmodSync(metadataPath, 0o400);
    chmodSync(snapshotRoot, 0o500);
    const stat = lstatSync(snapshotRoot);
    const appStat = lstatSync(appRoot);
    const fullLocalStat = fullLocalRoot ? lstatSync(fullLocalRoot) : null;
    const workerStat = lstatSync(workerRoot);
    const authorityStat = lstatSync(authorityRoot);
    return verifyLocalMacProductionExecutionSnapshot({
      schema: EXECUTION_SNAPSHOT_SCHEMA,
      root: snapshotRoot,
      appRoot,
      fullLocalRoot,
      workerRoot,
      authorityRoot,
      manifestPath,
      appDescriptorPath,
      expectedSchemaPath,
      policyPath,
      attestationBundlePath,
      attestationSubjectPath,
      attestationTrustedRootPath,
      gitEvidencePath,
      appDigest,
      fullLocalDigest,
      workerDigest,
      authorityDigest,
      digest: identityDigest,
      dev: stat.dev,
      ino: stat.ino,
      uid: stat.uid,
      appDev: appStat.dev,
      appIno: appStat.ino,
      fullLocalDev: fullLocalStat?.dev ?? null,
      fullLocalIno: fullLocalStat?.ino ?? null,
      workerDev: workerStat.dev,
      workerIno: workerStat.ino,
      authorityDev: authorityStat.dev,
      authorityIno: authorityStat.ino,
      metadataPath,
      metadataDigest: sha256Bytes(readFileSync(metadataPath)),
      ...(sealedCandidate ? {
        sealedBundleDigest: sealedCandidate.sealedBundleDigest,
        manifestSealedBundleDigest: manifest.sealed_bundle_digest,
        repeatabilityReceiptDigest: sealedCandidate.repeatabilityReceiptDigest,
        candidateIdentityDigest: sealedCandidate.candidateIdentityDigest,
        bundleManifestDigest: sealedCandidate.bundleManifestDigest,
      } : {}),
      ...(prelockScratchAuthorityDigest ? {
        prelockScratchAuthorityDigest,
      } : {}),
    });
  } catch (error) {
    throw error;
  }
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

function readSafeRegularFileSnapshot(path, label) {
  assertSafeRegularFile(path, label);
  let fileDescriptor;
  try {
    fileDescriptor = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const stat = fstatSync(fileDescriptor);
    if (!stat.isFile()) {
      throw new Error(`${label} must remain a regular file while being read.`);
    }
    return {
      bytes: readFileSync(fileDescriptor),
      ctimeMs: stat.ctimeMs,
      dev: stat.dev,
      ino: stat.ino,
      mode: modeBits(stat.mode),
      mtimeMs: stat.mtimeMs,
      nlink: stat.nlink,
      size: stat.size,
      uid: stat.uid,
    };
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

function authorityAncestorIdentity(path, currentUid) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()
    || stat.uid !== currentUid || (modeBits(stat.mode) & 0o022) !== 0) {
    throw new Error("Production authority ancestor identity is unsafe.");
  }
  return Object.freeze({
    dev: stat.dev,
    ino: stat.ino,
    uid: stat.uid,
    mode: modeBits(stat.mode),
    nlink: stat.nlink,
    ctimeMs: stat.ctimeMs,
    mtimeMs: stat.mtimeMs,
  });
}

/**
 * @param {{
 *   allowedModes?: number[],
 *   getCurrentUid?: () => number | undefined,
 *   label?: string,
 *   path: string,
 *   trustedRoot: string,
 * }} options
 */
export function readLocalMacProductionAuthorityInputSnapshot({
  allowedModes = [0o400, 0o444, 0o600, 0o644],
  getCurrentUid = () => process.getuid?.(),
  label = "production_authority",
  path,
  trustedRoot,
} = {}) {
  const currentUid = requireCurrentUserUid(getCurrentUid);
  const normalizedPath = requireAbsolutePath(path, `${label} path`);
  const normalizedRoot = requireAbsolutePath(trustedRoot, `${label} trusted root`);
  const realRoot = assertSafeDirectory(normalizedRoot, `${label} trusted root`);
  assertPathInside(realRoot, normalizedPath, `${label} input`);
  const relativeParent = relative(realRoot, dirname(normalizedPath));
  const ancestorPaths = [realRoot];
  let cursor = realRoot;
  for (const segment of relativeParent.split(sep).filter(Boolean)) {
    cursor = join(cursor, segment);
    ancestorPaths.push(cursor);
  }
  const ancestors = ancestorPaths.map((ancestorPath) =>
    authorityAncestorIdentity(ancestorPath, currentUid));
  const before = lstatSync(normalizedPath);
  if (before.isSymbolicLink() || !before.isFile() || before.uid !== currentUid
    || !allowedModes.includes(modeBits(before.mode)) || before.nlink !== 1
    || realpathSync(normalizedPath) !== normalizedPath) {
    throw new Error("Production authority input identity is unsafe.");
  }
  let descriptor;
  try {
    descriptor = openSync(normalizedPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const opened = fstatSync(descriptor);
    const bytes = readFileSync(descriptor);
    const openedAfter = fstatSync(descriptor);
    const after = lstatSync(normalizedPath);
    for (const current of [opened, openedAfter, after]) {
      if (!current.isFile()
        || current.dev !== before.dev || current.ino !== before.ino
        || current.uid !== before.uid || current.mode !== before.mode
        || current.nlink !== before.nlink || current.size !== before.size
        || current.ctimeMs !== before.ctimeMs || current.mtimeMs !== before.mtimeMs) {
        throw new Error("Production authority input identity changed while being read.");
      }
    }
    const ancestorIdentityDigest = sha256Bytes(Buffer.from(JSON.stringify(ancestors)));
    const sourceIdentityDigest = sha256Bytes(Buffer.from(JSON.stringify({
      ancestors: ancestorIdentityDigest,
      dev: opened.dev,
      ino: opened.ino,
      uid: opened.uid,
      mode: modeBits(opened.mode),
      nlink: opened.nlink,
      size: opened.size,
      ctimeMs: opened.ctimeMs,
      mtimeMs: opened.mtimeMs,
      sha256: sha256Bytes(bytes),
    })));
    return Object.freeze({
      ancestorIdentityDigest,
      ancestors: Object.freeze(ancestors),
      bytes,
      ctimeMs: opened.ctimeMs,
      dev: opened.dev,
      ino: opened.ino,
      label: String(label),
      mode: modeBits(opened.mode),
      mtimeMs: opened.mtimeMs,
      nlink: opened.nlink,
      path: normalizedPath,
      sha256: sha256Bytes(bytes),
      size: opened.size,
      sourceIdentityDigest,
      trustedRoot: realRoot,
      uid: opened.uid,
      allowedModes: Object.freeze([...allowedModes]),
    });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function verifyLocalMacProductionAuthorityInputSnapshot(snapshot) {
  if (!snapshot || typeof snapshot.path !== "string"
    || !DIGEST_PATTERN.test(snapshot.sourceIdentityDigest ?? "")) {
    throw new Error("Production authority input snapshot is incomplete.");
  }
  const current = readLocalMacProductionAuthorityInputSnapshot({
    getCurrentUid: () => snapshot.uid,
    label: snapshot.label,
    path: snapshot.path,
    trustedRoot: snapshot.trustedRoot,
    allowedModes: snapshot.allowedModes,
  });
  if (current.sourceIdentityDigest !== snapshot.sourceIdentityDigest
    || current.ancestorIdentityDigest !== snapshot.ancestorIdentityDigest
    || !current.bytes.equals(snapshot.bytes)) {
    throw new Error("Production authority input identity changed after freeze.");
  }
  return snapshot;
}

function readSafeRegularFileBytes(path, label) {
  return readSafeRegularFileSnapshot(path, label).bytes;
}

function assertPrivateRegularFile(path, label, currentUid) {
  assertSafeRegularFile(path, label);
  const stat = lstatSync(path);
  if (stat.uid !== currentUid) {
    throw new Error(`${label} must be owned by the current user uid ${currentUid}.`);
  }
  if (modeBits(stat.mode) !== 0o600) {
    throw new Error(`${label} must use mode 0600.`);
  }
}

function assertOwnedSafeRegularFile(path, label, currentUid) {
  assertSafeRegularFile(path, label);
  const stat = lstatSync(path);
  if (stat.uid !== currentUid) {
    throw new Error(`${label} must be owned by the current user uid ${currentUid}.`);
  }
  if ((modeBits(stat.mode) & 0o022) !== 0) {
    throw new Error(`${label} must not be group/world writable.`);
  }
}

function assertNoUnexpectedUntrackedRuntimeFiles({ checkoutDir, runCommand }) {
  const output = runPrepareCommand({
    args: ["ls-files", "--others", "--exclude-standard", "-z"],
    command: "git",
    cwd: checkoutDir,
    label: "Runtime release untracked-file inventory",
    runCommand,
  });
  const allowedExact = new Set([
    "prepare.json",
    "release-manifest.json",
    ".env.production.local",
    "infra/full-local-supabase/.env.production.local",
  ]);
  const unexpected = output.split("\0").filter(Boolean).filter((path) =>
    !allowedExact.has(path)
    && !path.startsWith(".next/")
    && !path.startsWith("node_modules/"));
  if (unexpected.length > 0) {
    throw new Error(
      `Runtime release contains unexpected untracked source: ${unexpected.sort().join(", ")}.`,
    );
  }
}

const LOCAL_MAC_PRODUCTION_RUNTIME_ENV_PATHS = Object.freeze([
  ".env.production.local",
  "infra/full-local-supabase/.env.production.local",
]);

function materializeRuntimeEnvironmentFiles({ sourceRoot, checkoutDir, currentUid, mkdir }) {
  const sources = LOCAL_MAC_PRODUCTION_RUNTIME_ENV_PATHS.map((relativePath) => ({
    relativePath,
    sourcePath: resolve(sourceRoot, relativePath),
  }));
  const existingCount = sources.filter(({ sourcePath }) => existsSync(sourcePath)).length;
  if (existingCount === 0) return;
  if (existingCount !== sources.length) {
    throw new Error("Local Mac production runtime environment source is incomplete.");
  }
  for (const { relativePath, sourcePath } of sources) {
    const sourceLabel = `Runtime environment source ${relativePath}`;
    const sourceSnapshot = readSafeRegularFileSnapshot(sourcePath, sourceLabel);
    if (sourceSnapshot.uid !== currentUid || sourceSnapshot.mode !== 0o600) {
      throw new Error(`${sourceLabel} must be current-user owned with mode 0600.`);
    }
    const destinationPath = resolve(checkoutDir, relativePath);
    assertPathInside(checkoutDir, destinationPath, `Runtime environment destination ${relativePath}`);
    mkdir(dirname(destinationPath), { recursive: true, mode: 0o700 });
    const destinationDirectory = assertSafeDirectory(
      dirname(destinationPath),
      `Runtime environment destination directory ${relativePath}`,
    );
    assertPathInside(
      realpathSync(checkoutDir),
      destinationDirectory,
      `Runtime environment destination directory ${relativePath}`,
    );
    const finalDestinationPath = join(destinationDirectory, basename(destinationPath));
    let destinationDescriptor;
    try {
      destinationDescriptor = openSync(
        finalDestinationPath,
        fsConstants.O_WRONLY
          | fsConstants.O_CREAT
          | fsConstants.O_EXCL
          | fsConstants.O_NOFOLLOW,
        0o600,
      );
      writeFileSync(destinationDescriptor, sourceSnapshot.bytes);
      const destinationStat = fstatSync(destinationDescriptor);
      if (
        !destinationStat.isFile()
        || destinationStat.uid !== currentUid
        || modeBits(destinationStat.mode) !== 0o600
      ) {
        throw new Error(`Prepared runtime environment ${relativePath} permissions drifted.`);
      }
    } finally {
      if (destinationDescriptor !== undefined) closeSync(destinationDescriptor);
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

function snapshotPrivateDirectoryIdentity(path, label, currentUid) {
  const lexicalPath = resolve(path);
  const stat = lstatSync(lexicalPath);
  if (stat.isSymbolicLink() || !stat.isDirectory() || stat.uid !== currentUid
    || modeBits(stat.mode) !== 0o700 || stat.nlink < 2) {
    throw new Error(`${label} owner, mode, link count, or type is unsafe.`);
  }
  const canonicalPath = realpathSync(lexicalPath);
  if (canonicalPath !== lexicalPath) throw new Error(`${label} realpath is not the exact lexical directory.`);
  let descriptor;
  try {
    descriptor = openSync(lexicalPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const opened = fstatSync(descriptor);
    if (!opened.isDirectory() || opened.dev !== stat.dev || opened.ino !== stat.ino
      || opened.uid !== stat.uid || modeBits(opened.mode) !== modeBits(stat.mode)
      || opened.nlink !== stat.nlink) throw new Error(`${label} descriptor identity drifted.`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return Object.freeze({ path: lexicalPath, realpath: canonicalPath, dev: stat.dev, ino: stat.ino, uid: stat.uid, mode: modeBits(stat.mode), nlink: stat.nlink });
}

function assertPrivateDirectoryIdentity(snapshot, label, currentUid) {
  const current = snapshotPrivateDirectoryIdentity(snapshot.path, label, currentUid);
  if (current.realpath !== snapshot.realpath || current.dev !== snapshot.dev || current.ino !== snapshot.ino
    || current.uid !== snapshot.uid || current.mode !== snapshot.mode || current.nlink !== snapshot.nlink) {
    throw new Error(`${label} identity changed after reservation.`);
  }
  return current;
}

function reservePrivatePromotionScratch({ ancestorPaths, currentUid, mkdir, parentPath }) {
  const ancestorBefore = ancestorPaths.map((path, index) => snapshotPrivateDirectoryIdentity(path, `Promotion scratch ancestor ${index}`, currentUid));
  const scratchRoot = join(parentPath, randomUUID());
  if (existsSync(scratchRoot)) throw new Error("Pre-lock promotion scratch identity already exists; reuse is forbidden.");
  mkdir(scratchRoot, { mode: 0o700 });
  const rootIdentity = snapshotPrivateDirectoryIdentity(scratchRoot, "Pre-lock promotion scratch attempt", currentUid);
  assertPathInside(ancestorBefore.at(-1).realpath, rootIdentity.realpath, "Pre-lock promotion scratch attempt");
  const ancestorIdentities = ancestorPaths.map((path, index) => snapshotPrivateDirectoryIdentity(path, `Promotion scratch ancestor ${index}`, currentUid));
  for (const [index, before] of ancestorBefore.entries()) {
    const after = ancestorIdentities[index];
    const expectedNlink = index === ancestorBefore.length - 1 ? before.nlink + 1 : before.nlink;
    if (after.realpath !== before.realpath || after.dev !== before.dev || after.ino !== before.ino
      || after.uid !== before.uid || after.mode !== before.mode || after.nlink !== expectedNlink) {
      throw new Error(`Promotion scratch ancestor ${index} changed during create-only reservation.`);
    }
  }
  return Object.freeze({ ancestorIdentities: Object.freeze(ancestorIdentities), rootIdentity });
}

function assertPrivatePromotionScratchReservation(reservation, currentUid, { materialized = false, partial = false, runtimeInputs = false } = {}) {
  for (const [index, identity] of reservation.ancestorIdentities.entries()) assertPrivateDirectoryIdentity(identity, `Promotion scratch ancestor ${index}`, currentUid);
  const current = snapshotPrivateDirectoryIdentity(reservation.rootIdentity.path, "Pre-lock promotion scratch attempt", currentUid);
  const allowedNlinks = partial
    ? [reservation.rootIdentity.nlink, reservation.rootIdentity.nlink + 1, reservation.rootIdentity.nlink + 2]
    : [reservation.rootIdentity.nlink + (materialized ? 1 : 0) + (runtimeInputs ? 1 : 0)];
  if (current.realpath !== reservation.rootIdentity.realpath || current.dev !== reservation.rootIdentity.dev
    || current.ino !== reservation.rootIdentity.ino || current.uid !== reservation.rootIdentity.uid
    || current.mode !== reservation.rootIdentity.mode || !allowedNlinks.includes(current.nlink)) {
    throw new Error("Pre-lock promotion scratch attempt identity changed after reservation.");
  }
  return current;
}

function removeReservedPrivateScratchTree(reservation, currentUid) {
  assertPrivatePromotionScratchReservation(reservation, currentUid, { partial: true });
  removePrivateScratchTree(reservation.rootIdentity.path);
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
  env,
  label,
  runCommand,
}) {
  const result = runCommand(command, args, {
    cwd,
    encoding: "utf8",
    ...(env ? { env } : {}),
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

function readGitAnnotatedTagMessage({ rootDir, runCommand, releaseTag }) {
  const result = runCommand("git", ["cat-file", "tag", `refs/tags/${releaseTag}`], {
    cwd: requireAbsolutePath(rootDir, "rootDir"),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const raw = String(result.stdout ?? "");
  const separator = raw.indexOf("\n\n");
  if (result.status !== 0 || separator < 1 || !raw.endsWith("\n") || raw.includes("\r") || raw.includes("\0")) {
    throw new Error("Release annotated tag raw message could not be read canonically from git.");
  }
  const message = raw.slice(separator + 2, -1);
  if (message.length === 0 || message.endsWith("\n")) {
    throw new Error("Release annotated tag message has non-canonical trailing bytes.");
  }
  return message;
}

/**
 * @param {{
 *   component?: string,
 *   getCurrentUid?: () => number | undefined,
 *   releaseDir: string,
 *   runCommand?: typeof spawnSync,
 * }} options
 */
export function readLocalMacProductionPreparedReleaseIdentity({
  component = "prepared_release",
  getCurrentUid = () => process.getuid?.(),
  releaseDir,
  runCommand = spawnSync,
} = {}) {
  const normalizedComponent = requireNonEmptyString(component, "component");
  const runtimeDirectory = assertSafeDirectory(
    requireAbsolutePath(releaseDir, "releaseDir"),
    `${normalizedComponent} release directory`,
  );
  assertCleanTrackedPrepareCheckout({ checkoutDir: runtimeDirectory, runCommand });
  assertNoUnexpectedUntrackedRuntimeFiles({ checkoutDir: runtimeDirectory, runCommand });

  const currentUid = requireCurrentUserUid(getCurrentUid);
  const markerPath = join(runtimeDirectory, "prepare.json");
  const buildDirectory = join(runtimeDirectory, ".next");
  const buildIdPath = join(buildDirectory, "BUILD_ID");
  assertOwnedSafeRegularFile(markerPath, `${normalizedComponent} release marker`, currentUid);
  const markerMode = modeBits(lstatSync(markerPath).mode);
  if (![0o400, 0o600].includes(markerMode)) {
    throw new Error(`${normalizedComponent} release marker must use mode 0400 or 0600.`);
  }
  const realBuildDirectory = assertSafeDirectory(
    buildDirectory,
    `${normalizedComponent} build directory`,
  );
  assertPathInside(runtimeDirectory, realBuildDirectory, `${normalizedComponent} build directory`);
  assertSafeRegularFile(buildIdPath, `${normalizedComponent} build ID`);
  assertPathInside(
    runtimeDirectory,
    realpathSync(buildIdPath),
    `${normalizedComponent} build ID`,
  );

  const marker = normalizePrepareDescriptor(
    readJsonFile(markerPath, `${normalizedComponent} release marker`),
  );
  const releaseSha = readPrepareGitValue({
    args: ["rev-parse", "HEAD"],
    cwd: runtimeDirectory,
    label: `${normalizedComponent} release SHA`,
    runCommand,
  });
  const releaseTree = readPrepareGitValue({
    args: ["rev-parse", "HEAD^{tree}"],
    cwd: runtimeDirectory,
    label: `${normalizedComponent} release tree`,
    runCommand,
  });
  const buildId = readSafeRegularFileBytes(
    buildIdPath,
    `${normalizedComponent} build ID`,
  ).toString("utf8").trim();
  if (
    releaseSha !== marker.release_sha
    || releaseTree !== marker.release_tree
    || buildId !== marker.build_id
  ) {
    throw new Error(`${normalizedComponent} release identity drifted from its prepare marker.`);
  }
  return {
    component: normalizedComponent,
    ready: true,
    release_sha: releaseSha,
    release_tree: releaseTree,
    build_id: buildId,
    promotion_id: marker.promotion_id,
  };
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
    releaseTagMessage: readGitAnnotatedTagMessage({
      rootDir,
      runCommand,
      releaseTag: normalizedReleaseTag,
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
    releaseTagMessage: requireNonEmptyString(
      gitEvidence.releaseTagMessage,
      "gitEvidence.releaseTagMessage",
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
  const expectedTagMessage = buildProductionReleaseAnnotatedTagMessage({
    releaseTag,
    build_id: manifest.build_id,
    rehearsal_receipt_schema: manifest.rehearsal_receipt_schema,
    sealed_bundle_digest: manifest.sealed_bundle_digest,
    repeatability_receipt_digest: manifest.repeatability_receipt_digest,
    rehearsal_receipt_valid_until: manifest.rehearsal_receipt_valid_until,
  });
  if (normalizedGitEvidence.releaseTagMessage !== expectedTagMessage) {
    throw new Error("Release annotated tag message does not match manifest rehearsal authority exactly.");
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
    rehearsal_receipt_schema: requireExactValue(
      manifest.rehearsal_receipt_schema,
      LOCAL_MAC_REHEARSAL_REPEATABILITY_SCHEMA,
      "manifest.rehearsal_receipt_schema",
    ),
    sealed_bundle_digest: requireDigest(
      manifest.sealed_bundle_digest,
      "manifest.sealed_bundle_digest",
    ),
    repeatability_receipt_digest: requireDigest(
      manifest.repeatability_receipt_digest,
      "manifest.repeatability_receipt_digest",
    ),
    rehearsal_receipt_valid_until: requireExactUtcTimestamp(
      manifest.rehearsal_receipt_valid_until,
      "manifest.rehearsal_receipt_valid_until",
    ),
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
  const manifestFileSnapshot = readSafeRegularFileSnapshot(normalizedManifestPath, "Release manifest");
  const manifestBytes = manifestFileSnapshot.bytes;
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
    materializeRuntimeEnvironmentFiles({
      sourceRoot: realRootDir,
      checkoutDir: destinationPath,
      currentUid,
      mkdir,
    });

    for (const command of LOCAL_MAC_PRODUCTION_PREPARE_COMMANDS) {
      runPrepareCommand({
        ...command,
        cwd: destinationPath,
        ...(command.label === "pnpm mac-production:build"
          ? {
              env: {
                ...process.env,
                HOMECOOK_RELEASE_BUILD_ID: manifest.build_id,
              },
            }
          : {}),
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

function normalizeRunningReleaseDescriptor(value, label = "Current running release descriptor") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  requireExactAllowedKeys(value, RUNNING_DESCRIPTOR_ALLOWED_FIELDS, label);
  if (value.schema !== RUNNING_DESCRIPTOR_SCHEMA) {
    throw new Error(`${label} schema must be ${RUNNING_DESCRIPTOR_SCHEMA}.`);
  }
  const promotedAt = requireNonEmptyString(value.promoted_at, `${label}.promoted_at`);
  if (Number.isNaN(Date.parse(promotedAt))) {
    throw new Error(`${label}.promoted_at must be a valid ISO timestamp.`);
  }
  const releaseSha = requireReleaseSha(value.release_sha, `${label}.release_sha`);
  const workerPathFields = RUNNING_DESCRIPTOR_WORKER_PATH_FIELDS.filter(
    (field) => value[field] !== undefined,
  );
  if (
    workerPathFields.length !== RUNNING_DESCRIPTOR_WORKER_PATH_FIELDS.length
    && !(workerPathFields.length === 0 && releaseSha === LEGACY_BOOTSTRAP_RELEASE_SHA)
  ) {
    throw new Error(`${label} worker path authority must be complete.`);
  }
  const workerPathAuthority = Object.fromEntries(workerPathFields.map((field) => [
    field,
    field.endsWith("_sha256") || field === "execution_snapshot_digest"
      ? requireDigest(value[field], `${label}.${field}`)
      : requireAbsolutePath(value[field], `${label}.${field}`),
  ]));
  const restartCapability = value.restart_capability === undefined
    ? {}
    : {
        restart_capability: requireNonEmptyString(
          value.restart_capability,
          `${label}.restart_capability`,
        ),
      };
  if (
    restartCapability.restart_capability !== undefined
    && restartCapability.restart_capability !== FULL_LOCAL_RESUME_CURRENT_CAPABILITY
  ) {
    throw new Error(`${label}.restart_capability is unsupported.`);
  }
  const fullLocalConfigAuthority = value.full_local_config_sha256 === undefined
    ? {}
    : {
        full_local_config_sha256: requireDigest(
          value.full_local_config_sha256,
          `${label}.full_local_config_sha256`,
        ),
      };
  if (
    restartCapability.restart_capability === FULL_LOCAL_RESUME_CURRENT_CAPABILITY
    && fullLocalConfigAuthority.full_local_config_sha256 === undefined
  ) {
    throw new Error(`${label}.full_local_config_sha256 is required for resume-current.`);
  }
  const rehearsalAuthorityFields = ["sealed_bundle_digest", "repeatability_receipt_digest"]
    .filter((field) => value[field] !== undefined);
  if (rehearsalAuthorityFields.length !== 0 && rehearsalAuthorityFields.length !== 2) {
    throw new Error(`${label} rehearsal authority must be complete.`);
  }
  const rehearsalAuthority = Object.fromEntries(rehearsalAuthorityFields.map((field) => [
    field,
    requireDigest(value[field], `${label}.${field}`),
  ]));
  return {
    schema: RUNNING_DESCRIPTOR_SCHEMA,
    release_tag: validateProductionReleaseTag(value.release_tag, `${label}.release_tag`),
    release_sha: releaseSha,
    release_tree: requireReleaseSha(value.release_tree, `${label}.release_tree`),
    build_id: requireNonEmptyString(value.build_id, `${label}.build_id`),
    promotion_id: requireNonEmptyString(value.promotion_id, `${label}.promotion_id`),
    promoted_at: promotedAt,
    source_manifest_sha256: requireDigest(
      value.source_manifest_sha256,
      `${label}.source_manifest_sha256`,
    ),
    ...rehearsalAuthority,
    ...restartCapability,
    ...fullLocalConfigAuthority,
    ...workerPathAuthority,
  };
}

/**
 * @param {{
 *   component: string,
 *   expectedReleaseDir: string,
 *   getCurrentUid?: () => number | undefined,
 *   pid: number,
 *   requireRehearsalAuthority?: boolean,
 *   runCommand?: typeof spawnSync,
 * }} options
 */
export function readLocalMacProductionRuntimeIdentity({
  component,
  expectedReleaseDir,
  getCurrentUid = () => process.getuid?.(),
  pid,
  requireRehearsalAuthority = false,
  runCommand = spawnSync,
} = {}) {
  const normalizedComponent = requireNonEmptyString(component, "component");
  if (!Number.isInteger(pid) || pid < 1) {
    throw new Error(`${normalizedComponent} runtime pid must be a positive integer.`);
  }
  const expectedDirectory = assertSafeDirectory(
    requireAbsolutePath(expectedReleaseDir, "expectedReleaseDir"),
    `${normalizedComponent} expected release directory`,
  );
  const result = runCommand(
    "/usr/sbin/lsof",
    ["-a", "-p", String(pid), "-d", "cwd", "-Fn"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    throw new Error(`${normalizedComponent} runtime cwd could not be resolved.`);
  }
  const cwdClaims = String(result.stdout ?? "")
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("n") && line.length > 1)
    .map((line) => line.slice(1));
  if (cwdClaims.length !== 1) {
    throw new Error(`${normalizedComponent} runtime cwd evidence must contain exactly one path.`);
  }
  const runtimeDirectory = assertSafeDirectory(
    cwdClaims[0],
    `${normalizedComponent} runtime cwd`,
  );
  if (runtimeDirectory !== expectedDirectory) {
    throw new Error(`${normalizedComponent} runtime cwd does not match the exact prepared release.`);
  }
  const observedRehearsalAuthority = requireRehearsalAuthority
    ? (() => {
        const snapshotEvidencePath = resolve(runtimeDirectory, "..", "evidence.json");
        const snapshotEvidence = readJsonFile(snapshotEvidencePath, `${normalizedComponent} execution snapshot evidence`);
        return {
          sealed_bundle_digest: requireDigest(snapshotEvidence.sealed_bundle_digest, `${normalizedComponent} observed sealed bundle digest`),
          repeatability_receipt_digest: requireDigest(snapshotEvidence.repeatability_receipt_digest, `${normalizedComponent} observed repeatability receipt digest`),
        };
      })()
    : {};
  return {
    ...readLocalMacProductionPreparedReleaseIdentity({
      component: normalizedComponent,
      getCurrentUid,
      releaseDir: runtimeDirectory,
      runCommand,
    }),
    ...observedRehearsalAuthority,
    pid,
  };
}

/**
 * @param {{
 *   component: string,
 *   expectedRuntimeDir: string,
 *   pid: number,
 *   runCommand?: typeof spawnSync,
 * }} options
 */
export function readLocalMacProductionRuntimeRehearsalAuthority({
  component,
  expectedRuntimeDir,
  pid,
  runCommand = spawnSync,
} = {}) {
  const normalizedComponent = requireNonEmptyString(component, "component");
  if (!Number.isInteger(pid) || pid < 1) {
    throw new Error(`${normalizedComponent} runtime pid must be a positive integer.`);
  }
  const expectedDirectory = assertSafeDirectory(
    requireAbsolutePath(expectedRuntimeDir, "expectedRuntimeDir"),
    `${normalizedComponent} expected runtime directory`,
  );
  const result = runCommand(
    "/usr/sbin/lsof",
    ["-a", "-p", String(pid), "-d", "cwd", "-Fn"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const cwdClaims = result.status === 0
    ? String(result.stdout ?? "").split(/\r?\n/u)
      .filter((line) => line.startsWith("n") && line.length > 1)
      .map((line) => line.slice(1))
    : [];
  if (cwdClaims.length !== 1
    || assertSafeDirectory(cwdClaims[0], `${normalizedComponent} runtime cwd`)
      !== expectedDirectory) {
    throw new Error(`${normalizedComponent} runtime cwd authority mismatch.`);
  }
  const evidence = readJsonFile(
    resolve(expectedDirectory, "..", "evidence.json"),
    `${normalizedComponent} execution snapshot evidence`,
  );
  return Object.freeze({
    sealed_bundle_digest: requireDigest(
      evidence.sealed_bundle_digest,
      `${normalizedComponent} observed sealed bundle digest`,
    ),
    repeatability_receipt_digest: requireDigest(
      evidence.repeatability_receipt_digest,
      `${normalizedComponent} observed repeatability receipt digest`,
    ),
  });
}

function readRunningDescriptorSnapshot({
  currentUid,
  label = "Current running release descriptor",
  path,
}) {
  assertPrivateRegularFile(path, label, currentUid);
  const snapshot = readSafeRegularFileSnapshot(path, label);
  if (snapshot.uid !== currentUid || snapshot.mode !== 0o600) {
    throw new Error(`${label} owner or mode changed while being read.`);
  }
  const bytes = snapshot.bytes;
  let input;
  try {
    input = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} is unreadable or invalid: ${path}`);
  }
  return {
    bytes,
    digest: sha256Bytes(bytes),
    descriptor: normalizeRunningReleaseDescriptor(input, label),
    dev: snapshot.dev,
    ino: snapshot.ino,
  };
}

function readOptionalRunningDescriptorSnapshot({ currentUid, label, path }) {
  if (!lstatIfExists(path)) {
    return { exists: false };
  }
  return {
    exists: true,
    ...readRunningDescriptorSnapshot({ currentUid, label, path }),
    label,
  };
}

function sameDescriptorSnapshot(left, right) {
  if (left.exists !== right.exists) return false;
  if (!left.exists) return true;
  return left.digest === right.digest && left.dev === right.dev && left.ino === right.ino;
}

function assertDescriptorSnapshotStable({ actual, expected, label }) {
  if (!sameDescriptorSnapshot(actual, expected)) {
    throw new Error(`${label} changed concurrently during promotion.`);
  }
}

export function getFirstCanonicalAdoptionPathAuthority(homeDir) {
  const normalizedHomeDir = requireAbsolutePath(homeDir, "homeDir");
  const appReleaseDir = resolve(normalizedHomeDir, FIRST_CANONICAL_ADOPTION_APP_ROOT_SUFFIX);
  const fullLocalRoot = resolve(normalizedHomeDir, FIRST_CANONICAL_ADOPTION_FULL_LOCAL_ROOT_SUFFIX);
  const workerArtifactRoot = resolve(
    normalizedHomeDir,
    FIRST_CANONICAL_ADOPTION_WORKER_RELEASE_ROOT_SUFFIX,
  );
  const workerManifestPath = resolve(
    workerArtifactRoot,
    FIRST_CANONICAL_ADOPTION_WORKER_MANIFEST_BASENAME,
  );
  return Object.freeze({
    app_release_dir: appReleaseDir,
    full_local_root: fullLocalRoot,
    full_local_source_sha: FIRST_CANONICAL_ADOPTION_FULL_LOCAL_SOURCE_SHA,
    mode: FIRST_CANONICAL_ADOPTION_BRIDGE_MODE,
    previous_release_sha: FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA,
    worker_artifact_root: workerArtifactRoot,
    worker_manifest_path: workerManifestPath,
  });
}

function buildFirstCanonicalAdoptionBridge(manifest, currentSnapshot, previousSnapshot, homeDir) {
  if (currentSnapshot.exists || previousSnapshot.exists) {
    throw new Error(
      "First canonical adoption bridge requires both current and previous descriptors to be absent.",
    );
  }
  if (manifest.previous_release_sha !== FIRST_CANONICAL_ADOPTION_PREDECESSOR_SHA) {
    throw new Error(
      "Missing current running release descriptor is allowed only for the exact first canonical adoption predecessor SHA.",
    );
  }
  return getFirstCanonicalAdoptionPathAuthority(homeDir);
}

function normalizePrepareDescriptor(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Prepared release marker must be a JSON object.");
  }
  requireExactAllowedKeys(value, PREPARE_DESCRIPTOR_ALLOWED_FIELDS, "Prepared release marker");
  if (value.schema !== "homecook.local-mac-production-prepare.v1") {
    throw new Error("Prepared release marker schema is invalid.");
  }
  if (value.status !== "prepared") {
    throw new Error("Prepared release marker status must be prepared.");
  }
  const preparedAt = requireNonEmptyString(value.prepared_at, "prepare.prepared_at");
  if (Number.isNaN(Date.parse(preparedAt))) {
    throw new Error("prepare.prepared_at must be a valid ISO timestamp.");
  }
  if (!Array.isArray(value.validation_commands)) {
    throw new Error("prepare.validation_commands must be an array.");
  }
  return {
    schema: value.schema,
    status: value.status,
    prepared_at: preparedAt,
    promotion_id: requireNonEmptyString(value.promotion_id, "prepare.promotion_id"),
    release_tag: validateProductionReleaseTag(value.release_tag, "prepare.release_tag"),
    release_sha: requireReleaseSha(value.release_sha, "prepare.release_sha"),
    release_tree: requireReleaseSha(value.release_tree, "prepare.release_tree"),
    build_id: requireNonEmptyString(value.build_id, "prepare.build_id"),
    source_manifest_path: requireAbsolutePath(
      value.source_manifest_path,
      "prepare.source_manifest_path",
    ),
    source_manifest_sha256: requireDigest(
      value.source_manifest_sha256,
      "prepare.source_manifest_sha256",
    ),
    attestation_source: requireNonEmptyString(
      value.attestation_source,
      "prepare.attestation_source",
    ),
    validation_commands: value.validation_commands,
  };
}

export function validateLocalMacProductionCurrentResumeAuthority({
  currentDescriptorPath,
  getCurrentUid = () => process.getuid?.(),
  homeDir = process.env.HOME ?? "",
  rootDir = process.cwd(),
  verifyAttestation,
} = {}) {
  const realHomeDir = assertSafeDirectory(
    requireAbsolutePath(homeDir, "homeDir"),
    "homeDir",
  );
  const currentUid = requireCurrentUserUid(getCurrentUid);
  const paths = getLocalMacProductionReleasePaths(realHomeDir);
  assertPrivateDirectory(dirname(paths.releaseRoot), "Homecook state directory", currentUid);
  assertPrivateDirectory(paths.releaseRoot, "Local Mac production release root", currentUid);
  assertPrivateDirectory(
    resolve(paths.releaseRoot, "execution-snapshots"),
    "Local Mac production execution snapshot root",
    currentUid,
  );
  const normalizedDescriptorPath = requireAbsolutePath(
    currentDescriptorPath,
    "currentDescriptorPath",
  );
  if (normalizedDescriptorPath !== paths.currentDescriptorPath) {
    throw new Error("resume-current accepts only the canonical current descriptor path.");
  }
  const running = readRunningDescriptorSnapshot({
    currentUid,
    path: normalizedDescriptorPath,
  });
  const descriptor = running.descriptor;
  if (!descriptor.execution_app_root || !descriptor.execution_snapshot_digest) {
    throw new Error("resume-current requires a sealed v2 running descriptor.");
  }
  if (descriptor.restart_capability !== FULL_LOCAL_RESUME_CURRENT_CAPABILITY) {
    throw new Error("resume-current descriptor lacks the exact restart capability.");
  }
  const snapshotRoot = dirname(descriptor.execution_app_root);
  const expectedSnapshotRoot = resolve(
    paths.releaseRoot,
    "execution-snapshots",
    descriptor.execution_snapshot_digest,
  );
  if (
    realpathSync(snapshotRoot) !== expectedSnapshotRoot
    || realpathSync(descriptor.execution_app_root) !== resolve(expectedSnapshotRoot, "app")
    || realpathSync(rootDir) !== realpathSync(descriptor.execution_app_root)
  ) {
    throw new Error("resume-current execution root is not the exact descriptor-owned snapshot.");
  }
  const appRoot = resolve(snapshotRoot, "app");
  const possibleFullLocalRoot = resolve(snapshotRoot, "full-local");
  const workerRoot = resolve(snapshotRoot, "worker");
  const authorityRoot = resolve(snapshotRoot, "authority");
  const metadataPath = resolve(snapshotRoot, "evidence.json");
  const evidenceStat = lstatSync(metadataPath);
  if (
    evidenceStat.isSymbolicLink()
    || !evidenceStat.isFile()
    || evidenceStat.uid !== currentUid
    || modeBits(evidenceStat.mode) !== 0o400
  ) {
    throw new Error("resume-current snapshot evidence owner, mode, or type is unsafe.");
  }
  const evidenceBytes = readFileSync(metadataPath);
  let evidence;
  try {
    evidence = JSON.parse(evidenceBytes.toString("utf8"));
  } catch {
    throw new Error("resume-current snapshot evidence is invalid.");
  }
  requireExactAllowedKeys(evidence, new Set([
    "schema",
    "app_digest",
    "execution_snapshot_digest",
    "promotion_id",
    "release_sha",
    "release_tree",
    "worker_digest",
    "authority_digest",
    "full_local_digest",
    "sealed_bundle_digest",
    "repeatability_receipt_digest",
    "candidate_identity_digest",
    "bundle_manifest_digest",
    "prelock_scratch_authority_digest",
  ]), "resume-current snapshot evidence");
  for (const [field, expected] of [
    ["execution_snapshot_digest", descriptor.execution_snapshot_digest],
    ["promotion_id", descriptor.promotion_id],
    ["release_sha", descriptor.release_sha],
    ["release_tree", descriptor.release_tree],
  ]) {
    if (evidence[field] !== expected) {
      throw new Error(`resume-current snapshot ${field} drifted.`);
    }
  }
  if (descriptor.sealed_bundle_digest !== undefined && (
    evidence.sealed_bundle_digest !== descriptor.sealed_bundle_digest
    || evidence.repeatability_receipt_digest !== descriptor.repeatability_receipt_digest
    || !DIGEST_PATTERN.test(evidence.prelock_scratch_authority_digest ?? "")
  )) throw new Error("resume-current rehearsal authority drifted.");
  const fullLocalRoot = evidence.full_local_digest ? possibleFullLocalRoot : null;
  const snapshotStat = lstatSync(snapshotRoot);
  const appStat = lstatSync(appRoot);
  const fullLocalStat = fullLocalRoot ? lstatSync(fullLocalRoot) : null;
  const workerStat = lstatSync(workerRoot);
  const authorityStat = lstatSync(authorityRoot);
  const snapshot = verifyLocalMacProductionExecutionSnapshot({
    schema: EXECUTION_SNAPSHOT_SCHEMA,
    root: snapshotRoot,
    appRoot,
    fullLocalRoot,
    workerRoot,
    authorityRoot,
    metadataPath,
    metadataDigest: sha256Bytes(evidenceBytes),
    appDigest: requireDigest(evidence.app_digest, "resume-current app digest"),
    fullLocalDigest: fullLocalRoot
      ? requireDigest(evidence.full_local_digest, "resume-current full-local digest")
      : null,
    workerDigest: requireDigest(evidence.worker_digest, "resume-current worker digest"),
    authorityDigest: requireDigest(
      evidence.authority_digest,
      "resume-current authority digest",
    ),
    digest: descriptor.execution_snapshot_digest,
    dev: snapshotStat.dev,
    ino: snapshotStat.ino,
    uid: currentUid,
    appDev: appStat.dev,
    appIno: appStat.ino,
    fullLocalDev: fullLocalStat?.dev ?? null,
    fullLocalIno: fullLocalStat?.ino ?? null,
    workerDev: workerStat.dev,
    workerIno: workerStat.ino,
    authorityDev: authorityStat.dev,
    authorityIno: authorityStat.ino,
    sealedBundleDigest: evidence.sealed_bundle_digest,
    manifestSealedBundleDigest: descriptor.sealed_bundle_digest,
    repeatabilityReceiptDigest: evidence.repeatability_receipt_digest,
    candidateIdentityDigest: evidence.candidate_identity_digest,
    bundleManifestDigest: evidence.bundle_manifest_digest,
    prelockScratchAuthorityDigest: evidence.prelock_scratch_authority_digest,
  });
  const authorityFiles = {
    appDescriptorPath: resolve(authorityRoot, "app-descriptor.json"),
    expectedSchemaPath: resolve(authorityRoot, "expected-schema.json"),
    policyPath: resolve(authorityRoot, "policy.json"),
    bundlePath: resolve(authorityRoot, "attestation-bundle.jsonl"),
    subjectManifestPath: resolve(authorityRoot, "attestation-subject.json"),
    trustedRootPath: resolve(authorityRoot, "attestation-trusted-root.jsonl"),
    gitEvidencePath: resolve(authorityRoot, "git-evidence.json"),
  };
  for (const [label, path] of Object.entries(authorityFiles)) {
    const stat = lstatSync(path);
    if (
      stat.isSymbolicLink()
      || !stat.isFile()
      || stat.uid !== currentUid
      || modeBits(stat.mode) !== 0o400
    ) {
      throw new Error(`resume-current ${label} authority is unsafe.`);
    }
  }
  if (
    realpathSync(descriptor.worker_artifact_root) !== workerRoot
    || !descriptor.worker_manifest_path
  ) {
    throw new Error("resume-current worker artifact authority escapes the sealed snapshot.");
  }
  const workerManifestPath = realpathSync(descriptor.worker_manifest_path);
  assertPathInside(workerRoot, workerManifestPath, "resume-current worker manifest");
  const workerArtifact = verifyYoutubeExtractionWorkerArtifact(workerManifestPath);
  const actualAuthorityDigests = {
    appDescriptor: sha256Bytes(readFileSync(authorityFiles.appDescriptorPath)),
    expectedSchema: sha256Bytes(readFileSync(authorityFiles.expectedSchemaPath)),
    policy: sha256Bytes(readFileSync(authorityFiles.policyPath)),
  };
  for (const [actual, expected, label] of [
    [
      actualAuthorityDigests.appDescriptor,
      descriptor.worker_app_descriptor_sha256,
      "app descriptor",
    ],
    [
      actualAuthorityDigests.expectedSchema,
      descriptor.worker_expected_schema_sha256,
      "expected schema",
    ],
    [actualAuthorityDigests.policy, descriptor.worker_policy_sha256, "policy"],
    [workerArtifact.artifact_sha256, descriptor.worker_artifact_sha256, "worker artifact"],
  ]) {
    if (actual !== expected) {
      throw new Error(`resume-current sealed ${label} digest drifted.`);
    }
  }
  for (const [field, expected] of [
    ["release_sha", descriptor.release_sha],
    ["release_tree", descriptor.release_tree],
    ["build_id", descriptor.build_id],
    ["promotion_id", descriptor.promotion_id],
  ]) {
    if (workerArtifact[field] !== expected) {
      throw new Error(`resume-current worker artifact ${field} identity drifted.`);
    }
  }
  const expectedIdentityDigest = sha256Bytes(Buffer.from(JSON.stringify({
    app: snapshot.appDigest,
    ...(evidence.full_local_digest ? { full_local: evidence.full_local_digest } : {}),
    app_descriptor: actualAuthorityDigests.appDescriptor,
    attestation_bundle: sha256Bytes(readFileSync(authorityFiles.bundlePath)),
    attestation_subject: sha256Bytes(readFileSync(authorityFiles.subjectManifestPath)),
    attestation_trusted_root: sha256Bytes(readFileSync(authorityFiles.trustedRootPath)),
    build_id: descriptor.build_id,
    git_evidence: sha256Bytes(readFileSync(authorityFiles.gitEvidencePath)),
    promotion_id: descriptor.promotion_id,
    release_sha: descriptor.release_sha,
    release_tree: descriptor.release_tree,
    expected_schema: actualAuthorityDigests.expectedSchema,
    policy: actualAuthorityDigests.policy,
    worker: snapshot.workerDigest,
    ...(evidence.sealed_bundle_digest ? {
      sealed_bundle_digest: evidence.sealed_bundle_digest,
      repeatability_receipt_digest: evidence.repeatability_receipt_digest,
      candidate_identity_digest: evidence.candidate_identity_digest,
      bundle_manifest_digest: evidence.bundle_manifest_digest,
      prelock_scratch_authority_digest: evidence.prelock_scratch_authority_digest,
    } : {}),
  })));
  if (expectedIdentityDigest !== descriptor.execution_snapshot_digest) {
    throw new Error("resume-current sealed snapshot identity digest drifted.");
  }
  const manifestPath = resolve(appRoot, "release-manifest.json");
  const manifestBytes = readSafeRegularFileBytes(
    manifestPath,
    "resume-current release manifest",
  );
  const manifestDigest = sha256Bytes(manifestBytes);
  if (manifestDigest !== descriptor.source_manifest_sha256) {
    throw new Error("resume-current release manifest digest drifted.");
  }
  let manifestInput;
  let gitEvidence;
  try {
    manifestInput = JSON.parse(manifestBytes.toString("utf8"));
    gitEvidence = JSON.parse(readFileSync(authorityFiles.gitEvidencePath, "utf8"));
  } catch {
    throw new Error("resume-current release authority JSON is invalid.");
  }
  const manifest = validateLocalMacProductionReleaseManifest({
    manifest: manifestInput,
    manifestDigest,
    readGitEvidence: () => gitEvidence,
    requireAttestation: true,
    rootDir: appRoot,
    verifyAttestation,
  });
  const prepare = normalizePrepareDescriptor(
    readJsonFile(resolve(appRoot, "prepare.json"), "resume-current prepare marker"),
  );
  for (const [field, expected] of [
    ["release_tag", descriptor.release_tag],
    ["release_sha", descriptor.release_sha],
    ["release_tree", descriptor.release_tree],
    ["build_id", descriptor.build_id],
    ["promotion_id", descriptor.promotion_id],
  ]) {
    if (manifest[field] !== expected || prepare[field] !== expected) {
      throw new Error(`resume-current exact ${field} identity mismatch.`);
    }
  }
  if (prepare.source_manifest_sha256 !== descriptor.source_manifest_sha256) {
    throw new Error("resume-current exact source_manifest_sha256 identity mismatch.");
  }
  return Object.freeze({
    descriptor,
    descriptorSnapshot: Object.freeze({
      dev: running.dev,
      digest: running.digest,
      ino: running.ino,
    }),
    manifest,
    snapshot,
    ...authorityFiles,
  });
}

function validateReadyReleaseBundle(bundle, manifest) {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
    throw new Error("Production release bundle readiness result is invalid.");
  }
  for (const component of ["app", "full_local", "youtube_worker"]) {
    const state = bundle[component];
    if (!state || typeof state !== "object" || Array.isArray(state)) {
      throw new Error(`Production release bundle ${component} readiness is missing.`);
    }
    if (state.ready !== true) {
      throw new Error(`Production release bundle ${component} readiness failed.`);
    }
    if (
      state.release_sha !== manifest.release_sha
      || state.release_tree !== manifest.release_tree
      || state.build_id !== manifest.build_id
      || state.promotion_id !== manifest.promotion_id
      || state.sealed_bundle_digest !== manifest.sealed_bundle_digest
      || state.repeatability_receipt_digest !== manifest.repeatability_receipt_digest
    ) {
      throw new Error(`Production release bundle ${component} identity does not match the exact release.`);
    }
  }
  return bundle;
}

function writeDescriptorFileAtomically(path, bytes) {
  const stagingPath = `${path}.staging-${randomUUID()}`;
  try {
    writeFileSync(stagingPath, bytes, { flag: "wx", mode: 0o600 });
    chmodSync(stagingPath, 0o600);
    renameSync(stagingPath, path);
    chmodSync(path, 0o600);
  } finally {
    rmSync(stagingPath, { force: true });
  }
}

function releaseCompletedPromotionLock({ homeDir, lockToken }) {
  const paths = getLocalMacProductionReleasePaths(homeDir);
  const lockState = readLockRecord({ homeDir });
  if (
    lockState.corrupt
    || !lockState.lockRecord
    || lockState.lockRecord.lock_token !== lockToken
  ) {
    throw new Error("Completed production promotion lock cannot be safely released.");
  }
  rmSync(paths.lockPath, { recursive: true, force: false });
}

/**
 * Promotes one completed immutable candidate as the app/full-local/worker bundle.
 * Failures after lock acquisition intentionally retain the lock and partial state.
 */
export async function promoteLocalMacProductionRelease({
  afterLockedPreflight = (input) => void input,
  descriptorFault = (phase) => void phase,
  clock = () => new Date(),
  executionCopyHook = (input) => void input,
  expectedRehearsalAuthorityDigest,
  finalWorkerProbe,
  freezeRuntimeInputs,
  getCurrentUid = () => process.getuid?.(),
  homeDir = process.env.HOME ?? "",
  installBundle,
  lockToken = randomUUID(),
  manifestPath,
  mkdir = mkdirSync,
  now = new Date(),
  preflightBundle,
  readGitEvidence = readLocalMacProductionGitReleaseEvidence,
  readinessProbe,
  rootDir = process.cwd(),
  verifyAttestation,
  verifyFrozenRuntimeInputs,
  verifyRehearsalAuthority,
  writeDescriptorAtomically = writeDescriptorFileAtomically,
} = {}) {
  if (!DIGEST_PATTERN.test(expectedRehearsalAuthorityDigest ?? "")) {
    throw new Error("Pre-adapter rehearsal authority digest is required before promotion setup.");
  }
  if (typeof verifyRehearsalAuthority !== "function") {
    throw new Error("Production rehearsal repeatability pre-mutation authority is not configured.");
  }
  if (typeof installBundle !== "function") {
    throw new Error("Production release bundle installer is not configured.");
  }
  if (typeof readinessProbe !== "function") {
    throw new Error("Production release bundle readiness probe is not configured.");
  }
  if (typeof preflightBundle !== "function") {
    throw new Error("Production release bundle preflight is not configured.");
  }
  if (typeof finalWorkerProbe !== "function") {
    throw new Error("Final production worker probe is not configured.");
  }
  if (typeof freezeRuntimeInputs !== "function" || typeof verifyFrozenRuntimeInputs !== "function") {
    throw new Error("Pre-lock frozen runtime input authority is not configured.");
  }

  const normalizedHomeDir = requireAbsolutePath(homeDir, "homeDir");
  const normalizedRootDir = requireAbsolutePath(rootDir, "rootDir");
  const normalizedManifestPath = requireAbsolutePath(manifestPath, "releaseManifestPath");
  const realHomeDir = assertSafeDirectory(normalizedHomeDir, "homeDir");
  const realRootDir = assertSafeDirectory(normalizedRootDir, "rootDir");
  const currentUid = requireCurrentUserUid(getCurrentUid);
  const manifestFileSnapshot = readLocalMacProductionAuthorityInputSnapshot({
    getCurrentUid: () => currentUid,
    label: "release_manifest",
    path: normalizedManifestPath,
    trustedRoot: realRootDir,
  });
  const manifestBytes = manifestFileSnapshot.bytes;
  let manifestInput;
  try {
    manifestInput = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error(`Release manifest is unreadable or invalid: ${normalizedManifestPath}`);
  }
  const manifestDigest = sha256Bytes(manifestBytes);
  const manifest = validateLocalMacProductionReleaseManifest({
    manifest: manifestInput,
    manifestDigest,
    manifestPath: normalizedManifestPath,
    readGitEvidence,
    requireAttestation: true,
    rootDir: realRootDir,
    verifyAttestation,
  });
  if (
    !manifest.app_launch_agent_enabled
    || !manifest.full_local_launch_agent_enabled
    || !manifest.youtube_worker_launch_agent_enabled
  ) {
    throw new Error(
      "Production promotion requires app, full-local, and YouTube worker enabled as one bundle.",
    );
  }
  const readFreshAuthorityNow = (phase) => {
    const value = clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new Error(`${phase} rehearsal authority clock is invalid.`);
    }
    return value;
  };
  const initialRehearsalAuthority = await verifyRehearsalAuthority({
    manifest,
    now: readFreshAuthorityNow("initial"),
    phase: "initial",
  });
  if (!initialRehearsalAuthority || initialRehearsalAuthority.verified !== true
    || initialRehearsalAuthority.authority_digest !== expectedRehearsalAuthorityDigest) {
    throw new Error("Production rehearsal repeatability pre-mutation authority is invalid.");
  }
  const sealedCandidate = initialRehearsalAuthority.sealed_candidate;
  if (!sealedCandidate
    || sealedCandidate.sealedBundleDigest !== manifest.sealed_bundle_digest
    || sealedCandidate.repeatabilityReceiptDigest !== manifest.repeatability_receipt_digest
    || !isAbsolute(sealedCandidate.appRoot ?? "")
    || !isAbsolute(sealedCandidate.workerRoot ?? "")) {
    throw new Error("Verified sealed candidate execution source is incomplete.");
  }

  const paths = getLocalMacProductionReleasePaths(realHomeDir);
  const homecookRoot = dirname(paths.releaseRoot);
  assertPrivateDirectory(homecookRoot, "Homecook state directory", currentUid);
  assertPrivateDirectory(paths.releaseRoot, "Local Mac production release root", currentUid);
  const releaseDir = sealedCandidate.appRoot;
  const initialCandidate = {
    manifestDigest: sealedCandidate.bundleManifestDigest,
    releaseDir,
  };
  const initialRunning = readOptionalRunningDescriptorSnapshot({
    currentUid,
    path: paths.currentDescriptorPath,
  });
  const initialPrevious = readOptionalRunningDescriptorSnapshot({
    currentUid,
    label: "Previous running release descriptor",
    path: paths.previousDescriptorPath,
  });
  const currentRuntimeBridge = initialRunning.exists
    ? null
    : buildFirstCanonicalAdoptionBridge(manifest, initialRunning, initialPrevious, realHomeDir);
  if (
    initialRunning.exists
    && initialRunning.descriptor.release_sha !== manifest.previous_release_sha
  ) {
    throw new Error(
      "Current running release descriptor drift: release_sha does not equal manifest.previous_release_sha.",
    );
  }
  const currentReleaseDir = initialRunning.exists
    ? (initialRunning.descriptor.execution_app_root
      ?? join(paths.releaseRoot, initialRunning.descriptor.release_tag))
    : null;
  const preflightContext = {
    currentDescriptor: initialRunning.exists ? initialRunning.descriptor : null,
    currentRuntimeBridge,
    currentReleaseDir,
    homeDir: realHomeDir,
    manifest,
    releaseDir: initialCandidate.releaseDir,
    rootDir: realRootDir,
    sealedCandidate,
  };
  const initialRuntimePreflight = await preflightBundle(preflightContext);
  if (
    !initialRuntimePreflight
    || typeof initialRuntimePreflight.stable_key !== "string"
    || initialRuntimePreflight.stable_key.length === 0
  ) {
    throw new Error("Production release bundle preflight returned invalid stable evidence.");
  }
  const finalRehearsalAuthority = await verifyRehearsalAuthority({
    manifest,
    now: readFreshAuthorityNow("final-pre-mutation"),
    phase: "final-pre-mutation",
  });
  if (!finalRehearsalAuthority || finalRehearsalAuthority.verified !== true
    || finalRehearsalAuthority.authority_digest !== expectedRehearsalAuthorityDigest
    || finalRehearsalAuthority.authority_digest !== initialRehearsalAuthority.authority_digest) {
    throw new Error("Production rehearsal repeatability authority drifted before the first mutation.");
  }
  if (finalRehearsalAuthority.sealed_candidate?.root !== sealedCandidate.root) {
    throw new Error("Verified sealed candidate source changed before the first mutation.");
  }
  const rehearsalRoot = join(homecookRoot, "rehearsal");
  const promotionScratchRoot = join(rehearsalRoot, "promotion-scratch");
  ensureSafePrivateDirectory(
    rehearsalRoot,
    homecookRoot,
    "Non-production rehearsal root",
    { currentUid, mkdir },
  );
  ensureSafePrivateDirectory(
    promotionScratchRoot,
    rehearsalRoot,
    "Non-production promotion scratch root",
    { currentUid, mkdir },
  );
  const scratchReservation = reservePrivatePromotionScratch({
    ancestorPaths: [homecookRoot, rehearsalRoot, promotionScratchRoot],
    currentUid,
    mkdir,
    parentPath: promotionScratchRoot,
  });
  const scratchReleaseRoot = scratchReservation.rootIdentity.path;
  let frozenScratch;
  try {
    assertPrivatePromotionScratchReservation(scratchReservation, currentUid);
    frozenScratch = createLocalMacProductionExecutionSnapshot({
      copyEntryHook: executionCopyHook,
      manifest,
      preparedReleaseDir: initialCandidate.releaseDir,
      releaseRoot: scratchReleaseRoot,
      sealedCandidate,
      worker: initialRuntimePreflight.worker,
    });
    verifyLocalMacProductionExecutionSnapshot(frozenScratch);
    assertPrivatePromotionScratchReservation(scratchReservation, currentUid, { materialized: true });
  } catch (error) {
    removeReservedPrivateScratchTree(scratchReservation, currentUid);
    throw error;
  }
  const frozenRuntimeInputs = await freezeRuntimeInputs({
    preflight: initialRuntimePreflight,
    releaseManifestBytes: manifestBytes,
    releaseManifestDigest: manifestDigest,
    scratchRoot: scratchReleaseRoot,
  });
  if (!frozenRuntimeInputs || !DIGEST_PATTERN.test(frozenRuntimeInputs.authority_digest ?? "")) {
    throw new Error("Frozen runtime input authority is invalid.");
  }
  verifyFrozenRuntimeInputs(frozenRuntimeInputs, { checkSources: true });
  const preLockNow = readFreshAuthorityNow("pre-lock");
  const preLockRehearsalAuthority = await verifyRehearsalAuthority({
    frozenCandidateAuthority: sealedCandidate,
    manifest,
    now: preLockNow,
    phase: "pre-lock",
  });
  if (!preLockRehearsalAuthority || preLockRehearsalAuthority.verified !== true
    || preLockRehearsalAuthority.authority_digest !== expectedRehearsalAuthorityDigest
    || preLockRehearsalAuthority.authority_digest !== finalRehearsalAuthority.authority_digest) {
    throw new Error("Frozen scratch rehearsal authority drifted before production lock creation.");
  }
  const prelockScratchAuthorityDigest = sha256Bytes(Buffer.from(JSON.stringify({
    pre_adapter_authority_digest: expectedRehearsalAuthorityDigest,
    initial_authority_digest: initialRehearsalAuthority.authority_digest,
    final_authority_digest: finalRehearsalAuthority.authority_digest,
    pre_lock_authority_digest: preLockRehearsalAuthority.authority_digest,
    scratch_snapshot_digest: frozenScratch.digest,
    scratch_device: String(frozenScratch.dev),
    scratch_inode: String(frozenScratch.ino),
    app_digest: frozenScratch.appDigest,
    full_local_digest: frozenScratch.fullLocalDigest,
    worker_digest: frozenScratch.workerDigest,
    authority_digest: frozenScratch.authorityDigest,
    sealed_bundle_digest: sealedCandidate.sealedBundleDigest,
    repeatability_receipt_digest: sealedCandidate.repeatabilityReceiptDigest,
    frozen_runtime_input_authority_digest: frozenRuntimeInputs.authority_digest,
    release_manifest_source_identity_digest: manifestFileSnapshot.sourceIdentityDigest,
    release_manifest_ancestor_identity_digest: manifestFileSnapshot.ancestorIdentityDigest,
  })));
  verifyLocalMacProductionExecutionSnapshot(frozenScratch);
  verifyFrozenRuntimeInputs(frozenRuntimeInputs, { checkSources: true });
  assertPrivatePromotionScratchReservation(scratchReservation, currentUid, { materialized: true, runtimeInputs: true });
  verifyLocalMacProductionAuthorityInputSnapshot(manifestFileSnapshot);
  ensureSafePrivateDirectory(
    paths.lockRoot,
    homecookRoot,
    "Production promotion lock root",
    { currentUid, mkdir },
  );

  const lock = acquireLocalMacProductionPromotionLock({
    homeDir: realHomeDir,
    manifest: manifestInput,
    manifestPath: normalizedManifestPath,
    lockToken,
    mkdir,
    now: preLockNow,
    readGitEvidence,
    rootDir: realRootDir,
    verifyAttestation: () => manifest.attestation,
  });

  const stableRunning = readOptionalRunningDescriptorSnapshot({
    currentUid,
    path: paths.currentDescriptorPath,
  });
  assertDescriptorSnapshotStable({
    actual: stableRunning,
    expected: initialRunning,
    label: "Current running release descriptor",
  });
  assertDescriptorSnapshotStable({
    actual: readOptionalRunningDescriptorSnapshot({
      currentUid,
      label: "Previous running release descriptor",
      path: paths.previousDescriptorPath,
    }),
    expected: initialPrevious,
    label: "Previous running release descriptor",
  });
  verifyLocalMacProductionExecutionSnapshot(frozenScratch);
  verifyFrozenRuntimeInputs(frozenRuntimeInputs, { checkSources: false });
  const lockedRuntimePreflight = initialRuntimePreflight;

  const executionSnapshot = createLocalMacProductionExecutionSnapshot({
    frozenScratch,
    manifest,
    prelockScratchAuthorityDigest,
    preparedReleaseDir: frozenScratch.appRoot,
    releaseRoot: paths.releaseRoot,
    sealedCandidate,
    worker: lockedRuntimePreflight.worker,
  });
  const sealedRuntimePreflight = {
    ...lockedRuntimePreflight,
    full_local_config_sha256: frozenRuntimeInputs.digests.fullLocalConfigSha256,
    worker: {
      ...lockedRuntimePreflight.worker,
      artifactRoot: executionSnapshot.workerRoot,
      manifestPath: executionSnapshot.manifestPath,
      appDescriptorPath: executionSnapshot.appDescriptorPath,
      expectedSchemaPath: executionSnapshot.expectedSchemaPath,
      policyPath: executionSnapshot.policyPath,
      configPath: frozenRuntimeInputs.paths.workerConfigPath,
      credentialPath: frozenRuntimeInputs.paths.workerCredentialPath,
      secretRoot: frozenRuntimeInputs.paths.workerSecretRoot,
      appDescriptorSha256: sha256Bytes(readFileSync(executionSnapshot.appDescriptorPath)),
      configSha256: frozenRuntimeInputs.digests.workerConfigSha256,
      credentialSha256: frozenRuntimeInputs.digests.workerCredentialSha256,
      expectedSchemaSha256: sha256Bytes(readFileSync(executionSnapshot.expectedSchemaPath)),
      policySha256: sha256Bytes(readFileSync(executionSnapshot.policyPath)),
    },
  };
  afterLockedPreflight({
    executionSnapshot,
    preparedReleaseDir: frozenScratch.appRoot,
  });
  verifyLocalMacProductionExecutionSnapshot(executionSnapshot);
  verifyFrozenRuntimeInputs(frozenRuntimeInputs, { checkSources: false });

  const mutationAuthority = validateLocalMacProductionMutationAuthority({
    command: "install",
    homeDir: realHomeDir,
    releaseManifestPath: normalizedManifestPath,
    frozenReleaseManifestPath: frozenRuntimeInputs.paths.releaseManifestPath,
    lockToken: lock.lockToken,
    readGitEvidence,
    rootDir: realRootDir,
    verifyAttestation: () => manifest.attestation,
  });
  const installation = await installBundle({
    executionSnapshot,
    frozenRuntimeInputs,
    homeDir: realHomeDir,
    currentRuntimeBridge,
    lockToken: lock.lockToken,
    manifest,
    mutationAuthority,
    preflight: sealedRuntimePreflight,
    releaseDir: executionSnapshot.appRoot,
    rootDir: realRootDir,
    verifyExecutionSnapshot: verifyLocalMacProductionExecutionSnapshot,
  });
  verifyLocalMacProductionExecutionSnapshot(executionSnapshot);
  verifyFrozenRuntimeInputs(frozenRuntimeInputs, { checkSources: false });
  let readiness = validateReadyReleaseBundle(await readinessProbe({
    executionSnapshot,
    frozenRuntimeInputs,
    homeDir: realHomeDir,
    currentRuntimeBridge,
    installation,
    manifest,
    mutationAuthority,
    preflight: sealedRuntimePreflight,
    releaseDir: executionSnapshot.appRoot,
    rootDir: realRootDir,
    verifyExecutionSnapshot: verifyLocalMacProductionExecutionSnapshot,
  }), manifest);
  verifyLocalMacProductionExecutionSnapshot(executionSnapshot);
  verifyFrozenRuntimeInputs(frozenRuntimeInputs, { checkSources: false });

  const finalRunning = readOptionalRunningDescriptorSnapshot({
    currentUid,
    path: paths.currentDescriptorPath,
  });
  assertDescriptorSnapshotStable({
    actual: finalRunning,
    expected: initialRunning,
    label: "Current running release descriptor",
  });
  const finalPrevious = readOptionalRunningDescriptorSnapshot({
    currentUid,
    label: "Previous running release descriptor",
    path: paths.previousDescriptorPath,
  });
  assertDescriptorSnapshotStable({
    actual: finalPrevious,
    expected: initialPrevious,
    label: "Previous running release descriptor",
  });
  verifyLocalMacProductionExecutionSnapshot(executionSnapshot);
  const finalWorker = await finalWorkerProbe({
    executionSnapshot,
    frozenRuntimeInputs,
    homeDir: realHomeDir,
    currentRuntimeBridge,
    installation,
    manifest,
    mutationAuthority,
    preflight: sealedRuntimePreflight,
    releaseDir: executionSnapshot.appRoot,
    rootDir: realRootDir,
    verifyExecutionSnapshot: verifyLocalMacProductionExecutionSnapshot,
  });
  readiness = validateReadyReleaseBundle({
    ...readiness,
    youtube_worker: finalWorker,
  }, manifest);
  verifyLocalMacProductionExecutionSnapshot(executionSnapshot);
  const promotedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  if (Number.isNaN(Date.parse(promotedAt))) {
    throw new Error("promotion timestamp is invalid.");
  }
  const currentDescriptor = normalizeRunningReleaseDescriptor({
    schema: RUNNING_DESCRIPTOR_SCHEMA,
    release_tag: manifest.release_tag,
    release_sha: manifest.release_sha,
    release_tree: manifest.release_tree,
    build_id: manifest.build_id,
    promotion_id: manifest.promotion_id,
    ...(currentRuntimeBridge
      ? {}
      : { restart_capability: FULL_LOCAL_RESUME_CURRENT_CAPABILITY }),
    full_local_config_sha256: requireDigest(
      finalWorker.fullLocalConfigSha256,
      "Final full-local config SHA-256",
    ),
    promoted_at: promotedAt,
    source_manifest_sha256: manifestDigest,
    sealed_bundle_digest: manifest.sealed_bundle_digest,
    repeatability_receipt_digest: manifest.repeatability_receipt_digest,
    execution_app_root: executionSnapshot.appRoot,
    execution_snapshot_digest: executionSnapshot.digest,
    worker_artifact_root: sealedRuntimePreflight.worker.artifactRoot,
    worker_manifest_path: sealedRuntimePreflight.worker.manifestPath,
    worker_artifact_sha256: finalWorker.artifactSha256,
    worker_app_descriptor_sha256: finalWorker.appDescriptorSha256,
    worker_config_sha256: finalWorker.configSha256,
    worker_credential_sha256: finalWorker.credentialSha256,
    worker_expected_schema_sha256: finalWorker.expectedSchemaSha256,
    worker_policy_sha256: finalWorker.policySha256,
  });
  const previousBytes = initialRunning.exists
    ? Buffer.from(`${JSON.stringify(initialRunning.descriptor, null, 2)}\n`)
    : null;
  const currentBytes = Buffer.from(`${JSON.stringify(currentDescriptor, null, 2)}\n`);
  const transactionRoot = join(lock.lockPath, "descriptor-transaction");
  mkdir(transactionRoot, { mode: 0o700 });
  const transactionPath = join(transactionRoot, "journal.json");
  writeFileSync(transactionPath, JSON.stringify({
    schema: "homecook.local-mac-production-descriptor-transaction.v1",
    status: "prepared",
    expected_current_sha256: initialRunning.exists ? initialRunning.digest : null,
    expected_previous_sha256: initialPrevious.exists ? initialPrevious.digest : null,
    previous_sha256: previousBytes ? sha256Bytes(previousBytes) : null,
    current_sha256: sha256Bytes(currentBytes),
  }, null, 2), { encoding: "utf8", flag: "wx", mode: 0o600 });
  const stagedRoot = join(transactionRoot, "staged");
  mkdir(stagedRoot, { mode: 0o700 });
  const stagedPreviousPath = join(stagedRoot, "previous.json");
  const stagedCurrentPath = join(stagedRoot, "current.json");
  const oldPreviousPath = join(transactionRoot, "old-previous.json");
  const oldCurrentPath = join(transactionRoot, "old-current.json");
  let currentReserved = false;
  let previousReserved = false;
  let currentPublished = false;
  let previousPublished = false;

  const sameInode = (leftPath, rightPath) => {
    const left = lstatIfExists(leftPath);
    const right = lstatIfExists(rightPath);
    return Boolean(left && right && left.dev === right.dev && left.ino === right.ino);
  };
  const removePublishedLink = (path, stagedPath) => {
    if (!lstatIfExists(path)) return;
    if (!sameInode(path, stagedPath)) {
      throw new Error(`Descriptor rollback refused to remove a competing writer at ${path}.`);
    }
    unlinkSync(path);
  };
  const restoreReservedLink = (path, oldPath, wasReserved) => {
    if (!wasReserved) return;
    if (lstatIfExists(path)) {
      throw new Error(`Descriptor rollback found a competing writer at ${path}.`);
    }
    linkSync(oldPath, path);
  };

  try {
    if (previousBytes) {
      writeDescriptorAtomically(stagedPreviousPath, previousBytes);
    }
    writeDescriptorAtomically(stagedCurrentPath, currentBytes);
    const commitRunning = readOptionalRunningDescriptorSnapshot({
      currentUid,
      path: paths.currentDescriptorPath,
    });
    assertDescriptorSnapshotStable({
      actual: commitRunning,
      expected: initialRunning,
      label: "Current running release descriptor",
    });
    assertDescriptorSnapshotStable({
      actual: readOptionalRunningDescriptorSnapshot({
        currentUid,
        label: "Previous running release descriptor",
        path: paths.previousDescriptorPath,
      }),
      expected: initialPrevious,
      label: "Previous running release descriptor",
    });

    if (initialRunning.exists) {
      renameSync(paths.currentDescriptorPath, oldCurrentPath);
      currentReserved = true;
      const reservedCurrent = readRunningDescriptorSnapshot({
        currentUid,
        label: "Reserved current running release descriptor",
        path: oldCurrentPath,
      });
      if (
        reservedCurrent.digest !== initialRunning.digest
        || reservedCurrent.dev !== initialRunning.dev
        || reservedCurrent.ino !== initialRunning.ino
      ) {
        throw new Error("Current running release descriptor changed while being reserved.");
      }
    } else if (lstatIfExists(paths.currentDescriptorPath)) {
      throw new Error("Current running release descriptor appeared at commit boundary.");
    }

    if (initialPrevious.exists) {
      renameSync(paths.previousDescriptorPath, oldPreviousPath);
      previousReserved = true;
      const reservedPrevious = readRunningDescriptorSnapshot({
        currentUid,
        label: "Reserved previous running release descriptor",
        path: oldPreviousPath,
      });
      if (
        reservedPrevious.digest !== initialPrevious.digest
        || reservedPrevious.dev !== initialPrevious.dev
        || reservedPrevious.ino !== initialPrevious.ino
      ) {
        throw new Error("Previous running release descriptor changed while being reserved.");
      }
    } else if (lstatIfExists(paths.previousDescriptorPath)) {
      throw new Error("Previous running release descriptor appeared at commit boundary.");
    }

    if (previousBytes) {
      linkSync(stagedPreviousPath, paths.previousDescriptorPath);
      previousPublished = true;
      descriptorFault("after_previous_publish");
    }
    descriptorFault("before_current_publish");
    linkSync(stagedCurrentPath, paths.currentDescriptorPath);
    currentPublished = true;
    descriptorFault("after_current_publish");

    const publishedCurrent = readRunningDescriptorSnapshot({
      currentUid,
      path: paths.currentDescriptorPath,
    });
    const publishedPrevious = previousBytes
      ? readRunningDescriptorSnapshot({
        currentUid,
        label: "Previous running release descriptor",
        path: paths.previousDescriptorPath,
      })
      : null;
    if (
      publishedCurrent.digest !== sha256Bytes(currentBytes)
      || (previousBytes && publishedPrevious?.digest !== sha256Bytes(previousBytes))
    ) {
      throw new Error("Published release descriptor transaction did not match staged bytes.");
    }
  } catch (error) {
    const rollbackErrors = [];
    try {
      if (currentPublished) removePublishedLink(paths.currentDescriptorPath, stagedCurrentPath);
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    try {
      if (previousPublished) removePublishedLink(paths.previousDescriptorPath, stagedPreviousPath);
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    try {
      restoreReservedLink(paths.previousDescriptorPath, oldPreviousPath, previousReserved);
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    try {
      restoreReservedLink(paths.currentDescriptorPath, oldCurrentPath, currentReserved);
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    if (rollbackErrors.length > 0) {
      const original = error instanceof Error ? error.message : String(error);
      const rollback = rollbackErrors
        .map((failure) => failure instanceof Error ? failure.message : String(failure))
        .join("; ");
      throw new Error(`${original}. Descriptor transaction recovery failed: ${rollback}`);
    }
    throw error;
  }
  releaseCompletedPromotionLock({ homeDir: realHomeDir, lockToken: lock.lockToken });

  return {
    current_head_sha: manifest.git_evidence.originMasterSha,
    installation,
    manifest,
    promoted: true,
    readiness,
    release_dir: executionSnapshot.appRoot,
  };
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

function assertExactVerifiedRuntimeIdentity(component, state, expected) {
  if (!state || typeof state !== "object" || Array.isArray(state) || state.ready !== true) {
    throw new Error(`Verified ${component} runtime is not ready.`);
  }
  for (const field of ["release_sha", "release_tree", "build_id", "promotion_id"]) {
    if (state[field] !== expected[field]) {
      throw new Error(
        `Verified ${component} runtime ${field.replaceAll("_", " ")} drifted from the release manifest.`,
      );
    }
  }
}

function validateVerifiedLocalMacProductionRuntimeBundle(runtime, manifest) {
  if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) {
    throw new Error("Production runtime verification returned invalid evidence.");
  }
  assertExactVerifiedRuntimeIdentity("app", runtime.app, manifest);
  assertExactVerifiedRuntimeIdentity("full-local", runtime.full_local, manifest);
  assertExactVerifiedRuntimeIdentity("YouTube worker", runtime.youtube_worker, manifest);

  const fullLocal = runtime.full_local;
  for (const field of [
    "auth_ready",
    "docker_ready",
    "healthy",
    "jwks_ready",
    "local_only",
    "runtime_present",
    "volume_identity_verified",
  ]) {
    if (fullLocal[field] !== true) {
      throw new Error(`Verified full-local ${field.replaceAll("_", " ")} evidence is incomplete.`);
    }
  }
  if (
    fullLocal.authorization_contract_status !== "PASS"
    || fullLocal.product_catalog_status !== "PASS"
  ) {
    throw new Error("Verified full-local authorization or product catalog gate failed.");
  }
  if (fullLocal.migration_head !== manifest.migration_head) {
    throw new Error("Verified full-local migration head drifted from the release manifest.");
  }
  return runtime;
}

function readPromotionLockRootGeneration({ currentUid, homeDir }) {
  const lockRoot = getLocalMacProductionReleasePaths(homeDir).lockRoot;
  const stat = lstatIfExists(lockRoot);
  if (!stat) return Object.freeze({ exists: false });
  assertPrivateDirectory(lockRoot, "Production promotion lock root", currentUid);
  return Object.freeze({
    exists: true,
    dev: stat.dev,
    ino: stat.ino,
    ctimeMs: stat.ctimeMs,
    mtimeMs: stat.mtimeMs,
  });
}

function samePromotionLockRootGeneration(left, right) {
  return left.exists === right.exists
    && (!left.exists || (
      left.dev === right.dev
      && left.ino === right.ino
      && left.ctimeMs === right.ctimeMs
      && left.mtimeMs === right.mtimeMs
    ));
}

/**
 * Reconstructs the create-only execution snapshot from current.json and verifies
 * its inode, ownership, modes, metadata, symlink containment, and content digests.
 *
 * @param {{
 *   descriptor: Record<string, unknown>,
 *   getCurrentUid?: () => number | undefined,
 *   homeDir?: string,
 * }} options
 */
export function readAndVerifyLocalMacProductionExecutionSnapshot({
  descriptor,
  getCurrentUid = () => process.getuid?.(),
  homeDir = process.env.HOME ?? "",
} = {}) {
  const normalizedDescriptor = normalizeRunningReleaseDescriptor(
    descriptor,
    "Current running release descriptor",
  );
  const currentUid = requireCurrentUserUid(getCurrentUid);
  const realHomeDir = assertSafeDirectory(
    requireAbsolutePath(homeDir, "homeDir"),
    "homeDir",
  );
  const paths = getLocalMacProductionReleasePaths(realHomeDir);
  const executionRoot = join(paths.releaseRoot, "execution-snapshots");
  assertPrivateDirectory(dirname(paths.releaseRoot), "Homecook state directory", currentUid);
  assertPrivateDirectory(paths.releaseRoot, "Local Mac production release root", currentUid);
  assertPrivateDirectory(
    executionRoot,
    "Local Mac production execution snapshot root",
    currentUid,
  );
  const snapshotRoot = dirname(normalizedDescriptor.execution_app_root);
  const canonicalSnapshotRoot = join(
    executionRoot,
    normalizedDescriptor.execution_snapshot_digest,
  );
  if (
    basename(snapshotRoot) !== normalizedDescriptor.execution_snapshot_digest
    || normalizedDescriptor.execution_app_root !== join(snapshotRoot, "app")
    || normalizedDescriptor.worker_artifact_root !== join(snapshotRoot, "worker")
  ) {
    throw new Error("Current descriptor execution snapshot path authority drifted.");
  }
  let realSnapshotRoot;
  try {
    realSnapshotRoot = realpathSync(snapshotRoot);
  } catch {
    throw new Error("Current descriptor canonical execution snapshot is unavailable.");
  }
  if (
    realSnapshotRoot !== canonicalSnapshotRoot
    || realpathSync(normalizedDescriptor.execution_app_root) !== join(canonicalSnapshotRoot, "app")
    || realpathSync(normalizedDescriptor.worker_artifact_root)
      !== join(canonicalSnapshotRoot, "worker")
  ) {
    throw new Error("Current descriptor snapshot is outside the canonical release root.");
  }
  assertPrivateDirectory(snapshotRoot, "Sealed execution snapshot root", currentUid);
  if (normalizedDescriptor.worker_manifest_path === normalizedDescriptor.worker_artifact_root) {
    throw new Error("Current descriptor worker manifest path authority is invalid.");
  }
  assertPathInside(
    normalizedDescriptor.worker_artifact_root,
    normalizedDescriptor.worker_manifest_path,
    "Current descriptor worker manifest path authority",
  );
  const authorityRoot = join(snapshotRoot, "authority");
  const possibleFullLocalRoot = join(snapshotRoot, "full-local");
  const metadataPath = join(snapshotRoot, "evidence.json");
  const metadataBytes = readSafeRegularFileBytes(
    metadataPath,
    "Sealed execution snapshot evidence",
  );
  let metadata;
  try {
    metadata = JSON.parse(metadataBytes.toString("utf8"));
  } catch {
    throw new Error("Sealed execution snapshot evidence is unreadable or invalid.");
  }
  requireExactAllowedKeys(metadata, new Set([
    "schema",
    "app_digest",
    "execution_snapshot_digest",
    "promotion_id",
    "release_sha",
    "release_tree",
    "worker_digest",
    "authority_digest",
    "full_local_digest",
    "sealed_bundle_digest",
    "repeatability_receipt_digest",
    "candidate_identity_digest",
    "bundle_manifest_digest",
    "prelock_scratch_authority_digest",
  ]), "Sealed execution snapshot evidence");
  if (
    metadata.schema !== EXECUTION_SNAPSHOT_SCHEMA
    || metadata.execution_snapshot_digest !== normalizedDescriptor.execution_snapshot_digest
    || metadata.promotion_id !== normalizedDescriptor.promotion_id
    || metadata.release_sha !== normalizedDescriptor.release_sha
    || metadata.release_tree !== normalizedDescriptor.release_tree
    || (normalizedDescriptor.sealed_bundle_digest !== undefined && (
      metadata.sealed_bundle_digest !== normalizedDescriptor.sealed_bundle_digest
      || metadata.repeatability_receipt_digest !== normalizedDescriptor.repeatability_receipt_digest
      || !DIGEST_PATTERN.test(metadata.prelock_scratch_authority_digest ?? "")
    ))
  ) {
    throw new Error("Sealed execution snapshot identity drifted from current.json.");
  }

  const rootStat = lstatSync(snapshotRoot);
  const appStat = lstatSync(normalizedDescriptor.execution_app_root);
  const fullLocalRoot = metadata.full_local_digest ? possibleFullLocalRoot : null;
  const fullLocalStat = fullLocalRoot ? lstatSync(fullLocalRoot) : null;
  const workerStat = lstatSync(normalizedDescriptor.worker_artifact_root);
  const authorityStat = lstatSync(authorityRoot);
  return verifyLocalMacProductionExecutionSnapshot({
    schema: EXECUTION_SNAPSHOT_SCHEMA,
    root: snapshotRoot,
    appRoot: normalizedDescriptor.execution_app_root,
    fullLocalRoot,
    workerRoot: normalizedDescriptor.worker_artifact_root,
    authorityRoot,
    appDigest: requireDigest(metadata.app_digest, "Execution snapshot app digest"),
    fullLocalDigest: fullLocalRoot
      ? requireDigest(metadata.full_local_digest, "Execution snapshot full-local digest")
      : null,
    workerDigest: requireDigest(metadata.worker_digest, "Execution snapshot worker digest"),
    authorityDigest: requireDigest(
      metadata.authority_digest,
      "Execution snapshot authority digest",
    ),
    digest: normalizedDescriptor.execution_snapshot_digest,
    dev: rootStat.dev,
    ino: rootStat.ino,
    uid: rootStat.uid,
    appDev: appStat.dev,
    appIno: appStat.ino,
    fullLocalDev: fullLocalStat?.dev ?? null,
    fullLocalIno: fullLocalStat?.ino ?? null,
    workerDev: workerStat.dev,
    workerIno: workerStat.ino,
    authorityDev: authorityStat.dev,
    authorityIno: authorityStat.ino,
    metadataPath,
    metadataDigest: sha256Bytes(metadataBytes),
    sealedBundleDigest: metadata.sealed_bundle_digest,
    manifestSealedBundleDigest: normalizedDescriptor.sealed_bundle_digest,
    repeatabilityReceiptDigest: metadata.repeatability_receipt_digest,
    candidateIdentityDigest: metadata.candidate_identity_digest,
    bundleManifestDigest: metadata.bundle_manifest_digest,
    prelockScratchAuthorityDigest: metadata.prelock_scratch_authority_digest,
  });
}

/**
 * Performs a read-only post-deploy verification of one exact production release.
 * It never acquires a write lock, changes descriptors, or calls mutation helpers.
 *
 * @param {{
 *   getCurrentUid?: () => number | undefined,
 *   homeDir?: string,
 *   manifestPath: string,
 *   readGitEvidence?: typeof readLocalMacProductionGitReleaseEvidence,
 *   rootDir?: string,
 *   verifyAttestation?: (input: Record<string, unknown>) => { verified: boolean, source?: string },
 *   verifyExecutionSnapshot?: (input: { descriptor: Record<string, unknown> }) => Record<string, unknown>,
 *   verifyRuntimeBundle: (input: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>,
 * }} options
 */
export async function verifyLocalMacProductionRelease({
  getCurrentUid = () => process.getuid?.(),
  homeDir = process.env.HOME ?? "",
  manifestPath,
  readGitEvidence = readLocalMacProductionGitReleaseEvidence,
  rootDir = process.cwd(),
  verifyAttestation,
  verifyExecutionSnapshot = readAndVerifyLocalMacProductionExecutionSnapshot,
  verifyRuntimeBundle,
} = {}) {
  if (typeof verifyRuntimeBundle !== "function") {
    throw new Error("Production release runtime verifier is not configured.");
  }
  if (typeof verifyExecutionSnapshot !== "function") {
    throw new Error("Production release execution snapshot verifier is not configured.");
  }
  const normalizedHomeDir = requireAbsolutePath(homeDir, "homeDir");
  const normalizedRootDir = requireAbsolutePath(rootDir, "rootDir");
  const normalizedManifestPath = requireAbsolutePath(manifestPath, "releaseManifestPath");
  const realHomeDir = assertSafeDirectory(normalizedHomeDir, "homeDir");
  const realRootDir = assertSafeDirectory(normalizedRootDir, "rootDir");
  const currentUid = requireCurrentUserUid(getCurrentUid);
  assertOwnedSafeRegularFile(normalizedManifestPath, "Release manifest", currentUid);

  const initialLockRoot = readPromotionLockRootGeneration({
    currentUid,
    homeDir: realHomeDir,
  });
  const initialLock = readLockRecord({ homeDir: realHomeDir });
  if (initialLock.locked) {
    throw new Error("Production promotion lock is held; read-only verify is blocked.");
  }
  const manifestSnapshot = readSafeRegularFileSnapshot(
    normalizedManifestPath,
    "Release manifest",
  );
  const manifestBytes = manifestSnapshot.bytes;
  let manifestInput;
  try {
    manifestInput = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error(`Release manifest is unreadable or invalid: ${normalizedManifestPath}`);
  }
  const manifestDigest = sha256Bytes(manifestBytes);
  const manifest = validateLocalMacProductionReleaseManifest({
    manifest: manifestInput,
    manifestDigest,
    manifestPath: normalizedManifestPath,
    readGitEvidence,
    requireAttestation: true,
    rootDir: realRootDir,
    verifyAttestation,
  });
  if (
    !manifest.app_launch_agent_enabled
    || !manifest.full_local_launch_agent_enabled
    || !manifest.youtube_worker_launch_agent_enabled
  ) {
    throw new Error(
      "Production verify requires app, full-local, and YouTube worker enabled as one bundle.",
    );
  }
  const paths = getLocalMacProductionReleasePaths(realHomeDir);
  const initialRunning = readRunningDescriptorSnapshot({
    currentUid,
    path: paths.currentDescriptorPath,
  });
  const descriptor = initialRunning.descriptor;
  for (const field of ["release_tag", "release_sha", "release_tree", "build_id", "promotion_id"]) {
    if (descriptor[field] !== manifest[field]) {
      throw new Error(
        `Current descriptor ${field.replaceAll("_", " ")} drifted from the release manifest.`,
      );
    }
  }
  if (descriptor.source_manifest_sha256 !== manifestDigest) {
    throw new Error("Current descriptor source manifest digest drifted from the release manifest.");
  }

  const snapshotBefore = verifyExecutionSnapshot({
    descriptor,
    getCurrentUid: () => currentUid,
    homeDir: realHomeDir,
  });
  if (snapshotBefore?.digest !== descriptor.execution_snapshot_digest) {
    throw new Error("Verified execution snapshot digest drifted from current.json.");
  }
  const runtime = validateVerifiedLocalMacProductionRuntimeBundle(
    await verifyRuntimeBundle({
      currentDescriptor: descriptor,
      homeDir: realHomeDir,
      manifest,
      releaseDir: descriptor.execution_app_root,
      rootDir: realRootDir,
    }),
    manifest,
  );
  const snapshotAfter = verifyExecutionSnapshot({
    descriptor,
    getCurrentUid: () => currentUid,
    homeDir: realHomeDir,
  });
  if (snapshotAfter?.digest !== descriptor.execution_snapshot_digest) {
    throw new Error("Verified execution snapshot digest changed during runtime verification.");
  }
  assertDescriptorSnapshotStable({
    actual: readOptionalRunningDescriptorSnapshot({
      currentUid,
      path: paths.currentDescriptorPath,
    }),
    expected: { exists: true, ...initialRunning },
    label: "Current running release descriptor",
  });
  const finalManifestSnapshot = readSafeRegularFileSnapshot(
    normalizedManifestPath,
    "Release manifest",
  );
  if (
    finalManifestSnapshot.dev !== manifestSnapshot.dev
    || finalManifestSnapshot.ino !== manifestSnapshot.ino
    || finalManifestSnapshot.bytes.length !== manifestBytes.length
    || !finalManifestSnapshot.bytes.equals(manifestBytes)
  ) {
    throw new Error("Release manifest changed concurrently during read-only verify.");
  }
  const finalLockState = readLockRecord({ homeDir: realHomeDir });
  const finalLockRoot = readPromotionLockRootGeneration({
    currentUid,
    homeDir: realHomeDir,
  });
  if (finalLockState.locked) {
    throw new Error("Production promotion lock appeared during read-only verify.");
  }
  if (!samePromotionLockRootGeneration(initialLockRoot, finalLockRoot)) {
    throw new Error("Production promotion lock generation changed concurrently during verify.");
  }

  return {
    current_head_sha: manifest.git_evidence.originMasterSha,
    manifest,
    release_dir: descriptor.execution_app_root,
    runtime,
    verified: true,
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
  frozenReleaseManifestPath = null,
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
  const manifestReadPath = frozenReleaseManifestPath
    ? requireAbsolutePath(frozenReleaseManifestPath, "frozenReleaseManifestPath")
    : normalizedManifestPath;
  const manifest = validateLocalMacProductionReleaseManifest({
    manifest: readJsonFile(manifestReadPath, "Release manifest"),
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
