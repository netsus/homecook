import {
  chmodSync,
  existsSync,
  lstatSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import { assertPrivateArtifactParent } from "./full-local-backup-readiness.mjs";
import {
  buildPlatformBackupAuthentication,
  PINNED_SUPABASE_CLI_VERSION,
  platformBackupAuthenticationPath,
} from "./full-local-platform-backup.mjs";
import { validateExternalSecretDirectory } from "./full-local-production-runtime.mjs";

const SAFE_SUFFIX = /^[a-z0-9][a-z0-9-]{2,7}$/u;
const ISOLATED_TARGET = /^homecook-backup-drill-[a-z0-9-]+$/u;
const PLATFORM_BACKUP_ACCOUNT = "platform-backup";
const EXTERNAL_ARCHIVE_OPTIONS = Object.freeze([
  "--external-archive",
  "--escrow-envelope",
  "--recovery-credential-file",
  "--recovery-issuer-private-key",
  "--restore-manifest",
  "--recovery-manifest",
]);

function fail(message) {
  throw new Error(message);
}

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    fail(`${name} requires an absolute path.`);
  }
  return value;
}

function requiredAbsolutePath(args, name) {
  const value = optionValue(args, name);
  if (!value || !isAbsolute(value)) {
    fail(`${name} requires an absolute path.`);
  }
  return resolve(value);
}

function existingMode600Artifact(path, label, expectedUid = process.getuid?.()) {
  if (!existsSync(path)) fail(`${label} must reference an existing file.`);
  const directStat = lstatSync(path);
  if (directStat.isSymbolicLink()) {
    fail(`${label} must not reference a symbolic link.`);
  }
  const canonicalPath = realpathSync(path);
  const stat = statSync(canonicalPath);
  if (
    !stat.isFile()
    || (stat.mode & 0o777) !== 0o600
    || !Number.isSafeInteger(expectedUid)
    || stat.uid !== expectedUid
  ) {
    fail(`${label} must reference a current-user-owned regular mode 0600 file.`);
  }
  return canonicalPath;
}

function assertExternalPrivateArtifact(path, repositoryRoot) {
  assertPrivateArtifactParent(path);
  validateExternalSecretDirectory({
    repositoryRoot,
    secretDirectory: dirname(path),
  });
}

function assertCreateOnlyOutput(path, label, repositoryRoot) {
  const canonicalPath = requiredAbsolutePath([label, path], label);
  assertExternalPrivateArtifact(canonicalPath, repositoryRoot);
  const authenticationPath = platformBackupAuthenticationPath(canonicalPath);
  assertExternalPrivateArtifact(authenticationPath, repositoryRoot);
  if (existsSync(canonicalPath)) fail(`${label} output already exists.`);
  if (existsSync(authenticationPath)) fail(`${label} authentication output already exists.`);
  return Object.freeze({
    authentication_path: authenticationPath,
    path: canonicalPath,
  });
}

export function writeAuthenticatedJsonArtifact({
  backupKey,
  outputPath,
  payload,
}) {
  if (typeof backupKey !== "string" || backupKey.length < 24) {
    fail("Authenticated drill artifact requires a separate backup key.");
  }
  const contents = `${JSON.stringify(payload, null, 2)}\n`;
  writeFileSync(outputPath, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
  chmodSync(outputPath, 0o600);
  const authentication = buildPlatformBackupAuthentication({
    archive: outputPath,
    archiveBytes: Buffer.from(contents, "utf8"),
    backupKey,
  });
  const authenticationPath = platformBackupAuthenticationPath(outputPath);
  try {
    writeFileSync(
      authenticationPath,
      `${JSON.stringify(authentication, null, 2)}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
    chmodSync(authenticationPath, 0o600);
    return Object.freeze({
      authentication,
      authentication_path: authenticationPath,
      bytes: Buffer.from(contents, "utf8"),
      path: outputPath,
    });
  } catch (error) {
    rmSync(outputPath, { force: true });
    rmSync(authenticationPath, { force: true });
    throw error;
  }
}

export function validateExternalArchiveDrillOptions({
  args,
  expectedUid = process.getuid?.(),
  repositoryRoot,
}) {
  const archiveOption = optionValue(args, "--external-archive");
  if (!archiveOption) {
    const partial = EXTERNAL_ARCHIVE_OPTIONS.filter((name) => optionValue(args, name) !== null);
    if (partial.length > 0) {
      fail("--external-archive is required when isolated recovery archive options are provided.");
    }
    return null;
  }
  if (args.includes("--key-recovery")) {
    fail("--external-archive cannot be combined with --key-recovery.");
  }

  const externalArchive = existingMode600Artifact(
    requiredAbsolutePath(args, "--external-archive"),
    "--external-archive",
    expectedUid,
  );
  const archiveAuthenticationPath = existingMode600Artifact(
    platformBackupAuthenticationPath(externalArchive),
    "external archive authentication",
    expectedUid,
  );
  const escrowEnvelope = existingMode600Artifact(
    requiredAbsolutePath(args, "--escrow-envelope"),
    "--escrow-envelope",
    expectedUid,
  );
  const recoveryCredentialFile = existingMode600Artifact(
    requiredAbsolutePath(args, "--recovery-credential-file"),
    "--recovery-credential-file",
    expectedUid,
  );
  const recoveryIssuerPrivateKey = existingMode600Artifact(
    requiredAbsolutePath(args, "--recovery-issuer-private-key"),
    "--recovery-issuer-private-key",
    expectedUid,
  );
  for (const path of [
    externalArchive,
    archiveAuthenticationPath,
    escrowEnvelope,
    recoveryCredentialFile,
    recoveryIssuerPrivateKey,
  ]) {
    assertExternalPrivateArtifact(path, repositoryRoot);
  }

  const restoreManifest = assertCreateOnlyOutput(
    requiredAbsolutePath(args, "--restore-manifest"),
    "--restore-manifest",
    repositoryRoot,
  );
  const recoveryManifest = assertCreateOnlyOutput(
    requiredAbsolutePath(args, "--recovery-manifest"),
    "--recovery-manifest",
    repositoryRoot,
  );

  const archiveDevice = statSync(externalArchive).dev;
  const replacementDevice = statSync(escrowEnvelope).dev;
  if (archiveDevice === replacementDevice) {
    fail("The external archive and replacement recovery medium must stay on distinct devices.");
  }
  for (const [path, label] of [
    [recoveryCredentialFile, "--recovery-credential-file"],
    [recoveryIssuerPrivateKey, "--recovery-issuer-private-key"],
  ]) {
    if (statSync(path).dev !== replacementDevice) {
      fail(`${label} must stay on the same replacement medium as --escrow-envelope.`);
    }
  }
  for (const [path, label] of [
    [restoreManifest.path, "--restore-manifest"],
    [recoveryManifest.path, "--recovery-manifest"],
  ]) {
    if (statSync(dirname(path)).dev !== replacementDevice) {
      fail(`${label} output must stay on the replacement recovery medium.`);
    }
  }

  const collisions = new Set();
  for (const path of [
    externalArchive,
    archiveAuthenticationPath,
    escrowEnvelope,
    recoveryCredentialFile,
    recoveryIssuerPrivateKey,
    restoreManifest.path,
    restoreManifest.authentication_path,
    recoveryManifest.path,
    recoveryManifest.authentication_path,
  ]) {
    if (collisions.has(path)) {
      fail("Isolated external archive drill paths must not collide.");
    }
    collisions.add(path);
  }

  return Object.freeze({
    archive_authentication_path: archiveAuthenticationPath,
    archive_device_id: String(archiveDevice),
    external_archive: externalArchive,
    keychain_account: PLATFORM_BACKUP_ACCOUNT,
    recovery_credential_file: recoveryCredentialFile,
    recovery_issuer_private_key: recoveryIssuerPrivateKey,
    recovery_manifest,
    replacement_device_id: String(replacementDevice),
    restore_manifest: restoreManifest,
    escrow_envelope: escrowEnvelope,
  });
}

export function assertIsolatedDrillTarget(target) {
  if (typeof target !== "string" || !ISOLATED_TARGET.test(target)) {
    throw new Error("Backup restore drill may target isolated drill resources only");
  }
  return target;
}

export function buildIsolatedDrillPlan({ suffix }) {
  if (!SAFE_SUFFIX.test(suffix)) {
    throw new Error("Backup restore drill suffix is invalid");
  }
  const projectId = assertIsolatedDrillTarget(`homecook-backup-drill-${suffix}`);
  const restoreProjectId = assertIsolatedDrillTarget(`${projectId}-restore`);
  return Object.freeze({
    cli_version: PINNED_SUPABASE_CLI_VERSION,
    destructive_scope: "isolated-fixture-only",
    project_id: projectId,
    restore_database_container: assertIsolatedDrillTarget(`${restoreProjectId}-postgres-1`),
    restore_postgres_volume: assertIsolatedDrillTarget(`${restoreProjectId}-postgres`),
    restore_project_id: restoreProjectId,
    restore_storage_volume: assertIsolatedDrillTarget(`${restoreProjectId}-storage`),
    source_database_container: assertIsolatedDrillTarget(`${projectId}-postgres-1`),
    source_postgres_volume: assertIsolatedDrillTarget(`${projectId}-postgres`),
    source_storage_volume: assertIsolatedDrillTarget(`${projectId}-storage`),
  });
}

function safeStorageSegment(value, label) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.includes("\0")
    || value.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Storage ${label} is invalid`);
  }
  return value;
}

export function mapStorageRowsToPayloadReferences(rows, physicalPaths) {
  if (!Array.isArray(physicalPaths)) {
    throw new Error("Exact Storage payload paths are required");
  }
  return rows
    .map((row) => {
      const bucket = safeStorageSegment(row?.bucket_id, "bucket");
      const name = safeStorageSegment(row?.name, "name");
      const version = safeStorageSegment(row?.version, "version");
      const base = `${bucket}/${name}`;
      const candidates = [
        `${base}/${version}`,
        `stub/${base}/${version}`,
        `stub/stub/${base}/${version}`,
        `${base}-$v-${version}`,
        `stub/${base}-$v-${version}`,
        `stub/stub/${base}-$v-${version}`,
      ];
      const matchingPaths = physicalPaths.filter((path) =>
        candidates.includes(path)
        || candidates.some((candidate) => {
          const suffix = `/${candidate}`;
          if (!path.endsWith(suffix)) return false;
          const prefix = path.slice(0, -suffix.length).split("/");
          return prefix.length === 2
            && prefix.every((segment) => {
              try {
                safeStorageSegment(segment, "tenant/project prefix");
                return true;
              } catch {
                return false;
              }
            });
        }));
      if (matchingPaths.length !== 1) {
        throw new Error("Database reference must resolve one exact Storage payload");
      }
      return Object.freeze({
        path: matchingPaths[0],
        reference: `${bucket}/${name}`,
      });
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function filterRunningIsolatedContainers(states) {
  return states
    .filter((state) => {
      assertIsolatedDrillTarget(state?.name);
      return state.running === true;
    })
    .map((state) => state.name);
}
