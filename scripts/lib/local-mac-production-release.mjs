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
import {
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
  normalizeExpectedReleaseContexts,
  validateProductionReleaseTag,
} from "./production-release-approval-policy.mjs";
import { verifyYoutubeExtractionWorkerArtifact } from "./youtube-extraction-worker-artifact.mjs";

export const LOCAL_MAC_PRODUCTION_RELEASE_SCHEMA = "homecook.local-mac-production-release.v1";

export const LOCAL_MAC_PRODUCTION_ONE_TIME_PREDECESSOR_ADOPTION = Object.freeze({
  schema: "homecook.local-mac-production-one-time-adoption.v1",
  contract: "prod-20260828.1-precanonical-split-v1",
  target: Object.freeze({
    release_tag: "prod-20260828.1",
    release_tag_object_sha: "93a7e84e3d502c8c91b5a0484bf079f59ffba456",
    release_sha: "abac967556aff325207f9adf54f4dcbd07e7a492",
    release_tree: "b31e7ddc6435d36ce1df15ce32ae68efe1aa9347",
    attestation_digest: "a090e1cdd4db337120aad9ed54eea8edaecc38f566663a1b302a42ca7a5b5fca",
  }),
  predecessor_release_sha: "3bdd814da8f9849805185d1b3be5a6ee703133a0",
  components: Object.freeze({
    app: Object.freeze({
      release_sha: "3bdd814da8f9849805185d1b3be5a6ee703133a0",
      release_tree: "255f3c23a38593aade4b1f4bc3e2941030c9fe90",
      build_id: "aKwKCpoAEwSrD6066XEwu",
    }),
    full_local: Object.freeze({
      release_sha: "36e7aecfe429875f2dc12f3effc020ab1296a818",
      release_tree: "abfc8fae339a5d1c0dfaf261171164680e9c79c3",
      build_id: "8t5KKzb2z0Q3VO4SnnLOh",
      runtime_command: "start",
    }),
    youtube_worker: Object.freeze({
      release_sha: "3bdd814da8f9849805185d1b3be5a6ee703133a0",
      artifact_sha256: "e228d46c1074ec499b709803bab4cc8dc8e2add30655fa1648dab564423e2c01",
    }),
  }),
});

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
  "promoted_at",
  "source_manifest_sha256",
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

function copyExecutionTree(sourcePath, destinationPath, { copyEntryHook = () => undefined } = {}) {
  const sourceRoot = realpathSync(sourcePath);
  const destinationRoot = resolve(destinationPath);
  const copyEntry = (source, destination) => {
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
        copyEntry(join(source, name), join(destination, name));
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
  const workerStat = lstatSync(snapshot.workerRoot);
  const authorityStat = lstatSync(snapshot.authorityRoot);
  if (
    appStat.dev !== snapshot.appDev
    || appStat.ino !== snapshot.appIno
    || workerStat.dev !== snapshot.workerDev
    || workerStat.ino !== snapshot.workerIno
    || authorityStat.dev !== snapshot.authorityDev
    || authorityStat.ino !== snapshot.authorityIno
  ) {
    throw new Error("Sealed execution snapshot component inode drifted.");
  }
  assertSealedExecutionTree(snapshot.appRoot, snapshot.uid);
  assertSealedExecutionTree(snapshot.workerRoot, snapshot.uid);
  assertSealedExecutionTree(snapshot.authorityRoot, snapshot.uid);
  assertExecutionSymlinksContained(snapshot.appRoot);
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
  const appDigest = digestExecutionTree(snapshot.appRoot);
  const workerDigest = digestExecutionTree(snapshot.workerRoot);
  const authorityDigest = digestExecutionTree(snapshot.authorityRoot);
  if (
    appDigest !== snapshot.appDigest
    || workerDigest !== snapshot.workerDigest
    || authorityDigest !== snapshot.authorityDigest
  ) {
    throw new Error("Sealed execution snapshot content digest drifted.");
  }
  return snapshot;
}

export function createLocalMacProductionExecutionSnapshot({
  copyEntryHook = () => undefined,
  manifest,
  preparedReleaseDir,
  releaseRoot,
  worker,
}) {
  const appSourceDigest = digestExecutionTree(preparedReleaseDir);
  const workerSourceDigest = digestExecutionTree(worker.artifactRoot);
  const appDescriptorSourceDigest = sha256Bytes(readFileSync(worker.appDescriptorPath));
  const expectedSchemaSourceDigest = sha256Bytes(readFileSync(worker.expectedSchemaPath));
  const policySourceDigest = sha256Bytes(readFileSync(worker.policyPath));
  const resumeAuthority = worker.resumeAuthority ?? null;
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
  const attestationBundleSourceDigest = resumeAuthority
    ? sha256Bytes(readFileSync(resumeAuthority.bundlePath))
    : null;
  const attestationSubjectSourceDigest = resumeAuthority
    ? sha256Bytes(readFileSync(resumeAuthority.subjectManifestPath))
    : null;
  const attestationTrustedRootSourceDigest = resumeAuthority
    ? sha256Bytes(readFileSync(resumeAuthority.trustedRootPath))
    : null;
  const gitEvidenceBytes = resumeAuthority
    ? Buffer.from(`${JSON.stringify(manifest.git_evidence, null, 2)}\n`)
    : null;
  const gitEvidenceDigest = gitEvidenceBytes ? sha256Bytes(gitEvidenceBytes) : null;
  const identityDigest = sha256Bytes(Buffer.from(JSON.stringify({
    app: appSourceDigest,
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
  })));
  const executionRoot = join(releaseRoot, "execution-snapshots");
  if (!existsSync(executionRoot)) {
    mkdirSync(executionRoot, { mode: 0o700 });
  } else {
    const executionRootStat = lstatSync(executionRoot);
    const currentUid = process.getuid?.();
    if (
      executionRootStat.isSymbolicLink()
      || !executionRootStat.isDirectory()
      || modeBits(executionRootStat.mode) !== 0o700
      || (Number.isInteger(currentUid) && executionRootStat.uid !== currentUid)
    ) {
      throw new Error("Execution snapshot root owner, mode, or symlink state is unsafe.");
    }
  }
  const snapshotRoot = join(executionRoot, identityDigest);
  mkdirSync(snapshotRoot, { mode: 0o700 });
  const appRoot = join(snapshotRoot, "app");
  const workerRoot = join(snapshotRoot, "worker");
  try {
    copyExecutionTree(preparedReleaseDir, appRoot, { copyEntryHook });
    copyExecutionTree(worker.artifactRoot, workerRoot, { copyEntryHook });
    if (
      digestExecutionTree(appRoot) !== appSourceDigest
      || digestExecutionTree(workerRoot) !== workerSourceDigest
    ) {
      throw new Error("Copied execution bytes do not match the pre-copy source digest.");
    }
    const authorityRoot = join(snapshotRoot, "authority");
    mkdirSync(authorityRoot, { mode: 0o700 });
    const appDescriptorPath = copySnapshotAuthorityFile(
      worker.appDescriptorPath,
      join(authorityRoot, "app-descriptor.json"),
      appDescriptorSourceDigest,
      copyEntryHook,
    );
    const expectedSchemaPath = copySnapshotAuthorityFile(
      worker.expectedSchemaPath,
      join(authorityRoot, "expected-schema.json"),
      expectedSchemaSourceDigest,
      copyEntryHook,
    );
    const policyPath = copySnapshotAuthorityFile(
      worker.policyPath,
      join(authorityRoot, "policy.json"),
      policySourceDigest,
      copyEntryHook,
    );
    const attestationBundlePath = resumeAuthority
      ? copySnapshotAuthorityFile(
        resumeAuthority.bundlePath,
        join(authorityRoot, "attestation-bundle.jsonl"),
        attestationBundleSourceDigest,
        copyEntryHook,
      )
      : null;
    const attestationSubjectPath = resumeAuthority
      ? copySnapshotAuthorityFile(
        resumeAuthority.subjectManifestPath,
        join(authorityRoot, "attestation-subject.json"),
        attestationSubjectSourceDigest,
        copyEntryHook,
      )
      : null;
    const attestationTrustedRootPath = resumeAuthority
      ? copySnapshotAuthorityFile(
        resumeAuthority.trustedRootPath,
        join(authorityRoot, "attestation-trusted-root.jsonl"),
        attestationTrustedRootSourceDigest,
        copyEntryHook,
      )
      : null;
    const gitEvidencePath = resumeAuthority
      ? writeSnapshotAuthorityBytes(
        join(authorityRoot, "git-evidence.json"),
        gitEvidenceBytes,
      )
      : null;
    const manifestRelative = relative(
      realpathSync(worker.artifactRoot),
      realpathSync(worker.manifestPath),
    );
    if (manifestRelative.startsWith("..") || isAbsolute(manifestRelative)) {
      throw new Error("Worker manifest escapes its artifact root.");
    }
    const manifestPath = resolve(workerRoot, manifestRelative);
    if (digestExecutionTree(preparedReleaseDir) !== appSourceDigest
      || digestExecutionTree(worker.artifactRoot) !== workerSourceDigest
      || sha256Bytes(readFileSync(worker.appDescriptorPath)) !== appDescriptorSourceDigest
      || sha256Bytes(readFileSync(worker.expectedSchemaPath)) !== expectedSchemaSourceDigest
      || sha256Bytes(readFileSync(worker.policyPath)) !== policySourceDigest
      || (resumeAuthority && (
        sha256Bytes(readFileSync(resumeAuthority.bundlePath)) !== attestationBundleSourceDigest
        || sha256Bytes(readFileSync(resumeAuthority.subjectManifestPath))
          !== attestationSubjectSourceDigest
        || sha256Bytes(readFileSync(resumeAuthority.trustedRootPath))
          !== attestationTrustedRootSourceDigest
      ))) {
      throw new Error("Execution source drifted while the sealed snapshot was created.");
    }
    sealExecutionTree(appRoot);
    sealExecutionTree(workerRoot);
    sealExecutionTree(authorityRoot);
    const appDigest = digestExecutionTree(appRoot);
    const workerDigest = digestExecutionTree(workerRoot);
    const authorityDigest = digestExecutionTree(authorityRoot);
    const metadataPath = join(snapshotRoot, "evidence.json");
    writeFileSync(metadataPath, JSON.stringify({
      schema: EXECUTION_SNAPSHOT_SCHEMA,
      app_digest: appDigest,
      execution_snapshot_digest: identityDigest,
      promotion_id: manifest.promotion_id,
      release_sha: manifest.release_sha,
      release_tree: manifest.release_tree,
      worker_digest: workerDigest,
      authority_digest: authorityDigest,
    }, null, 2), { flag: "wx", mode: 0o600 });
    chmodSync(metadataPath, 0o400);
    chmodSync(snapshotRoot, 0o500);
    const stat = lstatSync(snapshotRoot);
    const appStat = lstatSync(appRoot);
    const workerStat = lstatSync(workerRoot);
    const authorityStat = lstatSync(authorityRoot);
    return verifyLocalMacProductionExecutionSnapshot({
      schema: EXECUTION_SNAPSHOT_SCHEMA,
      root: snapshotRoot,
      appRoot,
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
      workerDigest,
      authorityDigest,
      digest: identityDigest,
      dev: stat.dev,
      ino: stat.ino,
      uid: stat.uid,
      appDev: appStat.dev,
      appIno: appStat.ino,
      workerDev: workerStat.dev,
      workerIno: workerStat.ino,
      authorityDev: authorityStat.dev,
      authorityIno: authorityStat.ino,
      metadataPath,
      metadataDigest: sha256Bytes(readFileSync(metadataPath)),
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
      dev: stat.dev,
      ino: stat.ino,
      mode: modeBits(stat.mode),
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
    ...restartCapability,
    ...workerPathAuthority,
  };
}

/**
 * @param {{
 *   component: string,
 *   expectedReleaseDir: string,
 *   getCurrentUid?: () => number | undefined,
 *   pid: number,
 *   runCommand?: typeof spawnSync,
 * }} options
 */
export function readLocalMacProductionRuntimeIdentity({
  component,
  expectedReleaseDir,
  getCurrentUid = () => process.getuid?.(),
  pid,
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
  return {
    ...readLocalMacProductionPreparedReleaseIdentity({
      component: normalizedComponent,
      getCurrentUid,
      releaseDir: runtimeDirectory,
      runCommand,
    }),
    pid,
  };
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

function resolveOneTimePredecessorAdoption({ manifest, homeDir }) {
  const contract = LOCAL_MAC_PRODUCTION_ONE_TIME_PREDECESSOR_ADOPTION;
  for (const [field, expected] of Object.entries(contract.target)) {
    if (manifest[field] !== expected) {
      throw new Error(
        `Current descriptor is missing and one-time predecessor adoption requires exact ${field}.`,
      );
    }
  }
  if (manifest.previous_release_sha !== contract.predecessor_release_sha) {
    throw new Error(
      "Current descriptor is missing and one-time predecessor adoption requires the exact manifest.previous_release_sha.",
    );
  }
  return Object.freeze({
    schema: contract.schema,
    contract: contract.contract,
    predecessor_release_sha: contract.predecessor_release_sha,
    components: contract.components,
    runtime_paths: Object.freeze({
      app_root: resolve(homeDir, "01_vibe_coding/homecook-production-current"),
      full_local_config: resolve(
        homeDir,
        "01_vibe_coding/homecook-session-refresh-storm-deploy-v9/infra/full-local-supabase/.env.production.local",
      ),
      full_local_root: resolve(
        homeDir,
        "01_vibe_coding/homecook-session-refresh-storm-deploy-v9",
      ),
      worker_manifest: resolve(
        homeDir,
        ".homecook/youtube-extraction-releases/3bdd814da8f9849805185d1b3be5a6ee703133a0-admin-acl-v1/artifact.json",
      ),
      worker_root: resolve(
        homeDir,
        ".homecook/youtube-extraction-releases/3bdd814da8f9849805185d1b3be5a6ee703133a0-admin-acl-v1",
      ),
    }),
  });
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
  const snapshotStat = lstatSync(snapshotRoot);
  const appStat = lstatSync(appRoot);
  const workerStat = lstatSync(workerRoot);
  const authorityStat = lstatSync(authorityRoot);
  const snapshot = verifyLocalMacProductionExecutionSnapshot({
    schema: EXECUTION_SNAPSHOT_SCHEMA,
    root: snapshotRoot,
    appRoot,
    workerRoot,
    authorityRoot,
    metadataPath,
    metadataDigest: sha256Bytes(evidenceBytes),
    appDigest: requireDigest(evidence.app_digest, "resume-current app digest"),
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
    workerDev: workerStat.dev,
    workerIno: workerStat.ino,
    authorityDev: authorityStat.dev,
    authorityIno: authorityStat.ino,
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

function validatePreparedReleaseCandidate({
  currentUid,
  manifest,
  manifestBytes,
  releaseDir,
  releaseRoot,
  runCommand,
}) {
  const realReleaseRoot = assertSafeDirectory(releaseRoot, "Local Mac production release root");
  const realReleaseDir = assertSafeDirectory(releaseDir, "Prepared release candidate");
  assertPathInside(realReleaseRoot, realReleaseDir, "Prepared release candidate");
  assertPrivateDirectory(releaseDir, "Prepared release candidate", currentUid);

  const candidateManifestPath = join(realReleaseDir, "release-manifest.json");
  const prepareDescriptorPath = join(realReleaseDir, "prepare.json");
  const buildIdPath = join(realReleaseDir, ".next", "BUILD_ID");
  assertPrivateRegularFile(candidateManifestPath, "Prepared release manifest", currentUid);
  assertPrivateRegularFile(prepareDescriptorPath, "Prepared release marker", currentUid);
  const realBuildDirectory = assertSafeDirectory(
    dirname(buildIdPath),
    "Prepared release build directory",
  );
  assertPathInside(realReleaseDir, realBuildDirectory, "Prepared release build directory");
  assertSafeRegularFile(buildIdPath, "Prepared release build ID");
  assertPathInside(
    realReleaseDir,
    realpathSync(buildIdPath),
    "Prepared release build ID",
  );

  const candidateManifestBytes = readSafeRegularFileBytes(
    candidateManifestPath,
    "Prepared release manifest",
  );
  const expectedManifestDigest = sha256Bytes(manifestBytes);
  if (
    candidateManifestBytes.length !== manifestBytes.length
    || !candidateManifestBytes.equals(manifestBytes)
  ) {
    throw new Error("Prepared release manifest bytes or digest do not match the validated manifest.");
  }

  const prepareDescriptor = normalizePrepareDescriptor(
    readJsonFile(prepareDescriptorPath, "Prepared release marker"),
  );
  const exactFields = [
    ["promotion_id", manifest.promotion_id],
    ["release_tag", manifest.release_tag],
    ["release_sha", manifest.release_sha],
    ["release_tree", manifest.release_tree],
    ["build_id", manifest.build_id],
    ["source_manifest_path", manifest.release_manifest_path],
    ["source_manifest_sha256", expectedManifestDigest],
  ];
  for (const [field, expected] of exactFields) {
    if (prepareDescriptor[field] !== expected) {
      throw new Error(`Prepared release ${field} does not match the exact release identity.`);
    }
  }

  const checkedOutSha = readPrepareGitValue({
    args: ["rev-parse", "HEAD"],
    cwd: realReleaseDir,
    label: "Prepared release candidate SHA",
    runCommand,
  });
  if (checkedOutSha !== manifest.release_sha) {
    throw new Error("Prepared release candidate SHA drifted from the exact release SHA.");
  }
  const checkedOutTree = readPrepareGitValue({
    args: ["rev-parse", "HEAD^{tree}"],
    cwd: realReleaseDir,
    label: "Prepared release candidate tree",
    runCommand,
  });
  if (checkedOutTree !== manifest.release_tree) {
    throw new Error("Prepared release candidate tree drifted from the exact release tree.");
  }
  assertDetachedPrepareCheckout({ checkoutDir: realReleaseDir, runCommand });
  assertCleanTrackedPrepareCheckout({ checkoutDir: realReleaseDir, runCommand });
  assertTrackedSymlinksStayInsideCheckout({ checkoutDir: realReleaseDir, runCommand });
  const buildId = readSafeRegularFileBytes(buildIdPath, "Prepared release build ID")
    .toString("utf8")
    .trim();
  if (buildId !== manifest.build_id) {
    throw new Error("Prepared release build ID drifted from the exact release build ID.");
  }

  return {
    manifestDigest: expectedManifestDigest,
    prepareDescriptor,
    releaseDir: realReleaseDir,
  };
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
  executionCopyHook = (input) => void input,
  finalWorkerProbe,
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
  runCommand = spawnSync,
  verifyAttestation,
  writeDescriptorAtomically = writeDescriptorFileAtomically,
} = {}) {
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

  const normalizedHomeDir = requireAbsolutePath(homeDir, "homeDir");
  const normalizedRootDir = requireAbsolutePath(rootDir, "rootDir");
  const normalizedManifestPath = requireAbsolutePath(manifestPath, "releaseManifestPath");
  const realHomeDir = assertSafeDirectory(normalizedHomeDir, "homeDir");
  const realRootDir = assertSafeDirectory(normalizedRootDir, "rootDir");
  const currentUid = requireCurrentUserUid(getCurrentUid);
  assertOwnedSafeRegularFile(normalizedManifestPath, "Release manifest", currentUid);
  const manifestBytes = readSafeRegularFileBytes(normalizedManifestPath, "Release manifest");
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

  const paths = getLocalMacProductionReleasePaths(realHomeDir);
  const homecookRoot = dirname(paths.releaseRoot);
  assertPrivateDirectory(homecookRoot, "Homecook state directory", currentUid);
  assertPrivateDirectory(paths.releaseRoot, "Local Mac production release root", currentUid);
  const releaseDir = join(paths.releaseRoot, manifest.release_tag);
  const initialCandidate = validatePreparedReleaseCandidate({
    currentUid,
    manifest,
    manifestBytes,
    releaseDir,
    releaseRoot: paths.releaseRoot,
    runCommand,
  });
  const initialRunning = readOptionalRunningDescriptorSnapshot({
    currentUid,
    label: "Current running release descriptor",
    path: paths.currentDescriptorPath,
  });
  const initialPrevious = readOptionalRunningDescriptorSnapshot({
    currentUid,
    label: "Previous running release descriptor",
    path: paths.previousDescriptorPath,
  });
  let predecessorAdoption = null;
  if (!initialRunning.exists) {
    if (initialPrevious.exists) {
      throw new Error(
        "Current descriptor is missing while previous.json exists; one-time adoption is blocked.",
      );
    }
    predecessorAdoption = resolveOneTimePredecessorAdoption({
      homeDir: realHomeDir,
      manifest,
    });
  } else if (initialRunning.descriptor.release_sha !== manifest.previous_release_sha) {
    throw new Error(
      "Current running release descriptor drift: release_sha does not equal manifest.previous_release_sha.",
    );
  }
  const predecessorDescriptor = initialRunning.exists ? initialRunning.descriptor : null;
  const currentReleaseDir = predecessorAdoption
    ? predecessorAdoption.runtime_paths.app_root
    : predecessorDescriptor.execution_app_root
      ?? join(paths.releaseRoot, predecessorDescriptor.release_tag);
  const preflightContext = {
    currentDescriptor: predecessorDescriptor,
    currentReleaseDir,
    homeDir: realHomeDir,
    manifest,
    predecessorAdoption,
    releaseDir: initialCandidate.releaseDir,
    rootDir: realRootDir,
  };
  const initialRuntimePreflight = await preflightBundle(preflightContext);
  if (
    !initialRuntimePreflight
    || typeof initialRuntimePreflight.stable_key !== "string"
    || initialRuntimePreflight.stable_key.length === 0
  ) {
    throw new Error("Production release bundle preflight returned invalid stable evidence.");
  }
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
    now,
    readGitEvidence,
    rootDir: realRootDir,
    verifyAttestation,
  });

  const stableRunning = readOptionalRunningDescriptorSnapshot({
    currentUid,
    label: "Current running release descriptor",
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
  const currentManifestBytes = readSafeRegularFileBytes(
    normalizedManifestPath,
    "Release manifest",
  );
  if (
    currentManifestBytes.length !== manifestBytes.length
    || !currentManifestBytes.equals(manifestBytes)
  ) {
    throw new Error("Release manifest changed after promotion lock acquisition.");
  }
  const lockedCandidate = validatePreparedReleaseCandidate({
    currentUid,
    manifest,
    manifestBytes,
    releaseDir,
    releaseRoot: paths.releaseRoot,
    runCommand,
  });
  if (lockedCandidate.manifestDigest !== initialCandidate.manifestDigest) {
    throw new Error("Prepared release candidate digest changed after lock acquisition.");
  }
  const lockedRuntimePreflight = await preflightBundle({
    ...preflightContext,
    releaseDir: lockedCandidate.releaseDir,
  });
  if (
    !lockedRuntimePreflight
    || lockedRuntimePreflight.stable_key !== initialRuntimePreflight.stable_key
  ) {
    throw new Error("Production runtime bundle changed between initial and locked preflight.");
  }
  assertDescriptorSnapshotStable({
    actual: readOptionalRunningDescriptorSnapshot({
      currentUid,
      label: "Current running release descriptor",
      path: paths.currentDescriptorPath,
    }),
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

  const executionSnapshot = createLocalMacProductionExecutionSnapshot({
    copyEntryHook: executionCopyHook,
    manifest,
    preparedReleaseDir: lockedCandidate.releaseDir,
    releaseRoot: paths.releaseRoot,
    worker: lockedRuntimePreflight.worker,
  });
  const sealedRuntimePreflight = {
    ...lockedRuntimePreflight,
    worker: {
      ...lockedRuntimePreflight.worker,
      artifactRoot: executionSnapshot.workerRoot,
      manifestPath: executionSnapshot.manifestPath,
      appDescriptorPath: executionSnapshot.appDescriptorPath,
      expectedSchemaPath: executionSnapshot.expectedSchemaPath,
      policyPath: executionSnapshot.policyPath,
      appDescriptorSha256: sha256Bytes(readFileSync(executionSnapshot.appDescriptorPath)),
      expectedSchemaSha256: sha256Bytes(readFileSync(executionSnapshot.expectedSchemaPath)),
      policySha256: sha256Bytes(readFileSync(executionSnapshot.policyPath)),
    },
  };
  afterLockedPreflight({
    executionSnapshot,
    preparedReleaseDir: lockedCandidate.releaseDir,
  });
  verifyLocalMacProductionExecutionSnapshot(executionSnapshot);

  const mutationAuthority = validateLocalMacProductionMutationAuthority({
    command: "install",
    homeDir: realHomeDir,
    releaseManifestPath: normalizedManifestPath,
    lockToken: lock.lockToken,
    readGitEvidence,
    rootDir: realRootDir,
    verifyAttestation,
  });
  const installation = await installBundle({
    executionSnapshot,
    homeDir: realHomeDir,
    lockToken: lock.lockToken,
    manifest,
    mutationAuthority,
    preflight: sealedRuntimePreflight,
    releaseDir: executionSnapshot.appRoot,
    rootDir: realRootDir,
    verifyExecutionSnapshot: verifyLocalMacProductionExecutionSnapshot,
  });
  verifyLocalMacProductionExecutionSnapshot(executionSnapshot);
  let readiness = validateReadyReleaseBundle(await readinessProbe({
    executionSnapshot,
    homeDir: realHomeDir,
    installation,
    manifest,
    mutationAuthority,
    preflight: sealedRuntimePreflight,
    releaseDir: executionSnapshot.appRoot,
    rootDir: realRootDir,
    verifyExecutionSnapshot: verifyLocalMacProductionExecutionSnapshot,
  }), manifest);
  verifyLocalMacProductionExecutionSnapshot(executionSnapshot);

  const finalRunning = readOptionalRunningDescriptorSnapshot({
    currentUid,
    label: "Current running release descriptor",
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
    homeDir: realHomeDir,
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
    restart_capability: FULL_LOCAL_RESUME_CURRENT_CAPABILITY,
    promoted_at: promotedAt,
    source_manifest_sha256: manifestDigest,
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
    if (previousBytes) writeDescriptorAtomically(stagedPreviousPath, previousBytes);
    writeDescriptorAtomically(stagedCurrentPath, currentBytes);
    const commitRunning = readOptionalRunningDescriptorSnapshot({
      currentUid,
      label: "Current running release descriptor",
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
    const publishedPrevious = readOptionalRunningDescriptorSnapshot({
      currentUid,
      label: "Previous running release descriptor",
      path: paths.previousDescriptorPath,
    });
    if (
      publishedCurrent.digest !== sha256Bytes(currentBytes)
      || (previousBytes
        ? !publishedPrevious.exists || publishedPrevious.digest !== sha256Bytes(previousBytes)
        : publishedPrevious.exists)
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
    ...(predecessorAdoption ? {
      predecessor_adoption: {
        schema: predecessorAdoption.schema,
        contract: predecessorAdoption.contract,
        predecessor_release_sha: predecessorAdoption.predecessor_release_sha,
        components: predecessorAdoption.components,
      },
    } : {}),
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
