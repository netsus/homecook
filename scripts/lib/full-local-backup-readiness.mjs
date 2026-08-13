import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { dirname } from "node:path";
import { lstatSync, realpathSync, statSync } from "node:fs";

export const FULL_LOCAL_BACKUP_READINESS_FORMAT =
  "homecook-full-local-backup-readiness-v1";
export const FULL_LOCAL_BACKUP_MAX_AGE_HOURS = 24;

const SHA256 = /^[0-9a-f]{64}$/u;

function fail(message) {
  throw new Error(`Full-local backup readiness failed: ${message}`);
}

function ageHours(value, nowMs, label) {
  const time = Date.parse(value);
  const age = (nowMs - time) / (60 * 60 * 1_000);
  if (!Number.isFinite(time) || age < 0 || age > FULL_LOCAL_BACKUP_MAX_AGE_HOURS) {
    fail(`${label} is missing, future-dated, or older than 24 hours`);
  }
  return age;
}

function exactPath(value, label) {
  if (typeof value !== "string" || !isAbsolute(value)) {
    fail(`${label} must be an absolute path`);
  }
  return resolve(value);
}

export function fullLocalBackupMetadataSha256(metadata) {
  return createHash("sha256").update(JSON.stringify(metadata)).digest("hex");
}

export function assertPrivateArtifactParent(path, expectedUid = process.getuid?.()) {
  const directParent = dirname(resolve(path));
  const directStat = lstatSync(directParent);
  const canonicalParent = realpathSync(directParent);
  const stat = statSync(canonicalParent);
  if (
    directStat.isSymbolicLink()
    || directParent !== canonicalParent
    || !stat.isDirectory()
    || (stat.mode & 0o777) !== 0o700
    || !Number.isSafeInteger(expectedUid)
    || stat.uid !== expectedUid
  ) {
    fail("artifact parent must be canonical, owner-controlled, and exact mode 0700");
  }
  return canonicalParent;
}

export function assertRegularReadinessArtifact(path) {
  const linkStat = lstatSync(path);
  if (linkStat.isSymbolicLink()) {
    fail("readiness and archive artifacts must not be symlinks");
  }
  const canonicalPath = realpathSync(path);
  const artifactStat = statSync(canonicalPath);
  if (!artifactStat.isFile() || (artifactStat.mode & 0o777) !== 0o600) {
    fail("readiness and archive artifacts must be regular mode 0600 files");
  }
  return canonicalPath;
}

export async function authenticateFullLocalBackupArchives({
  evidence,
  verifyArchive,
}) {
  if (typeof verifyArchive !== "function") {
    fail("archive authentication verifier is required");
  }
  const primary = await verifyArchive(evidence?.backup?.archive_path);
  const offMac = await verifyArchive(evidence?.off_mac_copy?.archive_path);
  if (JSON.stringify(primary) !== JSON.stringify(offMac)) {
    fail("primary and off-Mac authenticated backup metadata differ");
  }
  return primary;
}

export function buildFullLocalBackupReadinessEvidence({
  archivePath,
  archiveSha256,
  backupMetadata,
  keyRecoveryManifest,
  keyRecoveryManifestPath,
  keyRecoveryManifestSha256,
  now,
  offMacCopyPath,
  offMacCopySha256,
  restoreManifest,
  restoreManifestPath,
  restoreManifestSha256,
}) {
  const components = backupMetadata?.components;
  const backupManifest = backupMetadata?.manifest;
  const metadataSha256 = fullLocalBackupMetadataSha256(backupMetadata);
  const provenance = backupMetadata?.database?.provenance;
  const storageSourcePrefix = `docker-compose-volume:${provenance?.compose_project}:`;
  const storageSourceIdentity = backupMetadata?.storage_payload?.source_identity;
  const productionStorageVolume = typeof storageSourceIdentity === "string"
    && storageSourceIdentity.startsWith(storageSourcePrefix)
    ? storageSourceIdentity.slice(storageSourcePrefix.length)
    : null;
  if (
    !SHA256.test(archiveSha256)
    || keyRecoveryManifest?.format
      !== "homecook-full-local-backup-key-recovery-v1"
    || keyRecoveryManifest?.archive_sha256 !== archiveSha256
    || keyRecoveryManifest?.clean_restore_verified !== true
    || keyRecoveryManifest?.keychain_reregistered !== true
    || typeof keyRecoveryManifest?.keychain_registration?.account !== "string"
    || keyRecoveryManifest.keychain_registration.account.length === 0
    || typeof keyRecoveryManifest?.keychain_registration?.adapter !== "string"
    || keyRecoveryManifest.keychain_registration.adapter.length === 0
    || !SHA256.test(keyRecoveryManifest?.keychain_registration?.key_sha256)
    || keyRecoveryManifest?.restored_metadata_sha256 !== metadataSha256
    || typeof keyRecoveryManifest?.archive_device_id !== "string"
    || keyRecoveryManifest.archive_device_id.length === 0
    || typeof keyRecoveryManifest?.escrow_device_id !== "string"
    || keyRecoveryManifest.escrow_device_id.length === 0
    || keyRecoveryManifest.archive_device_id === keyRecoveryManifest.escrow_device_id
    || typeof keyRecoveryManifest?.escrow_envelope_path !== "string"
    || !isAbsolute(keyRecoveryManifest.escrow_envelope_path)
    || !SHA256.test(keyRecoveryManifest?.escrow_envelope_sha256)
    || keyRecoveryManifest?.source_machine_id
      === keyRecoveryManifest?.replacement_machine_id
    || typeof keyRecoveryManifestPath !== "string"
    || !isAbsolute(keyRecoveryManifestPath)
    || !SHA256.test(keyRecoveryManifestSha256)
    || offMacCopySha256 !== archiveSha256
    || backupMetadata?.storage_payload_included !== true
    || restoreManifest?.format !== "homecook-full-local-restore-v1"
    || typeof restoreManifestPath !== "string"
    || !isAbsolute(restoreManifestPath)
    || !SHA256.test(restoreManifestSha256)
    || restoreManifest?.restore_execution
      !== "clean-isolated-restore-platform-v1"
    || restoreManifest?.fresh_target_attested !== true
    || restoreManifest?.restored_data_sha256
      !== components?.data_sha256
    || restoreManifest?.source_data_sha256 !== components?.data_sha256
    || restoreManifest?.source_roles_sha256 !== components?.roles_sha256
    || restoreManifest?.source_schema_sha256 !== components?.schema_sha256
    || restoreManifest?.relation_classification_digest
      !== backupManifest?.relation_classification_digest
    || restoreManifest?.unclassified_count !== 0
    || backupManifest?.unclassified?.length !== 0
    || !SHA256.test(restoreManifest?.auth_identity_digest)
    || !SHA256.test(restoreManifest?.database_digest)
    || !SHA256.test(restoreManifest?.storage_digest)
    || !Number.isSafeInteger(restoreManifest?.auth_users)
    || restoreManifest.auth_users < 0
    || !Number.isSafeInteger(restoreManifest?.auth_identities)
    || restoreManifest.auth_identities < 0
    || !Number.isSafeInteger(restoreManifest?.public_relation_count)
    || restoreManifest.public_relation_count < 0
    || !Number.isSafeInteger(restoreManifest?.storage_bucket_count)
    || restoreManifest.storage_bucket_count < 0
    || !Number.isSafeInteger(restoreManifest?.storage_object_count)
    || restoreManifest.storage_object_count < 0
    || !Number.isSafeInteger(restoreManifest?.storage_referenced_object_count)
    || restoreManifest.storage_referenced_object_count < 0
    || typeof productionStorageVolume !== "string"
    || productionStorageVolume.length === 0
    || restoreManifest?.source_archive_sha256 !== archiveSha256
    || typeof restoreManifest?.compose_project !== "string"
    || restoreManifest.compose_project.length === 0
    || typeof restoreManifest?.postgres_volume !== "string"
    || restoreManifest.postgres_volume.length === 0
    || typeof restoreManifest?.storage_volume !== "string"
    || restoreManifest.storage_volume.length === 0
    || restoreManifest?.storage_payload_catalog_sha256
      !== backupMetadata?.storage_payload?.catalog_sha256
    || restoreManifest?.storage_payload_object_count
      !== backupMetadata?.storage_payload?.object_count
    || restoreManifest?.storage_payload_total_bytes
      !== backupMetadata?.storage_payload?.total_bytes
    || restoreManifest?.storage_reference_count
      !== backupMetadata?.storage_payload?.object_count
    || restoreManifest?.compose_project === provenance?.compose_project
    || restoreManifest?.storage_volume === productionStorageVolume
    || restoreManifest?.postgres_volume === provenance?.postgres_volume
  ) {
    fail("authenticated backup and complete restore manifest do not match");
  }
  const createdAt = new Date(now).toISOString();
  return Object.freeze({
    backup: {
      archive_path: exactPath(archivePath, "backup archive"),
      archive_sha256: archiveSha256,
      created_at: backupMetadata.created_at,
      data_sha256: components.data_sha256,
      metadata_sha256: metadataSha256,
      relation_classification_digest: backupManifest.relation_classification_digest,
      roles_sha256: components.roles_sha256,
      schema_sha256: components.schema_sha256,
    },
    format: FULL_LOCAL_BACKUP_READINESS_FORMAT,
    key_recovery: {
      ...keyRecoveryManifest,
      evidence_path: exactPath(
        keyRecoveryManifestPath,
        "backup key recovery evidence",
      ),
      evidence_sha256: keyRecoveryManifestSha256,
    },
    off_mac_copy: {
      archive_path: exactPath(offMacCopyPath, "off-Mac copy"),
      archive_sha256: offMacCopySha256,
      verified_at: createdAt,
    },
    production: {
      compose_project: provenance?.compose_project,
      container_name: provenance?.container_name,
      image: provenance?.image,
      postgres_volume: provenance?.postgres_volume,
      storage_volume: productionStorageVolume,
    },
    restore: {
      auth_identity_digest: restoreManifest.auth_identity_digest,
      auth_identities: restoreManifest.auth_identities,
      auth_users: restoreManifest.auth_users,
      database_digest: restoreManifest.database_digest,
      database_data_sha256: restoreManifest.restored_data_sha256,
      database_reference_count: restoreManifest.storage_reference_count,
      execution: restoreManifest.restore_execution,
      fresh_target_attested: true,
      object_count: restoreManifest.storage_payload_object_count,
      payload_catalog_sha256: restoreManifest.storage_payload_catalog_sha256,
      public_relation_count: restoreManifest.public_relation_count,
      relation_classification_digest:
        restoreManifest.relation_classification_digest,
      manifest_path: exactPath(restoreManifestPath, "restore manifest"),
      manifest_sha256: restoreManifestSha256,
      source_archive_sha256: restoreManifest.source_archive_sha256,
      source_data_sha256: restoreManifest.source_data_sha256,
      source_roles_sha256: restoreManifest.source_roles_sha256,
      source_schema_sha256: restoreManifest.source_schema_sha256,
      storage_bucket_count: restoreManifest.storage_bucket_count,
      storage_digest: restoreManifest.storage_digest,
      storage_object_count: restoreManifest.storage_object_count,
      storage_payload_included: true,
      storage_referenced_object_count:
        restoreManifest.storage_referenced_object_count,
      target_compose_project: restoreManifest.compose_project,
      target_storage_volume: restoreManifest.storage_volume,
      total_bytes: restoreManifest.storage_payload_total_bytes,
      unclassified_count: 0,
      verified_at: restoreManifest.created_at,
    },
  });
}

export function verifyFullLocalBackupReadiness({
  authenticatedBackupMetadataSha256,
  evidence,
  evidenceFileMode,
  nowMs = Date.now(),
  observedEscrowFiles,
  observedFiles,
  production,
}) {
  if (evidenceFileMode !== 0o600) fail("evidence file mode must be 0600");
  if (evidence?.format !== FULL_LOCAL_BACKUP_READINESS_FORMAT) {
    fail("evidence format is invalid");
  }
  const archiveSha = evidence?.backup?.archive_sha256;
  if (!SHA256.test(archiveSha)) fail("backup archive digest is invalid");
  if (
    !SHA256.test(authenticatedBackupMetadataSha256)
    || evidence?.backup?.metadata_sha256 !== authenticatedBackupMetadataSha256
  ) {
    fail("authenticated backup metadata binding is invalid");
  }
  const archivePath = exactPath(evidence?.backup?.archive_path, "backup archive");
  const offMacPath = exactPath(evidence?.off_mac_copy?.archive_path, "off-Mac copy");
  if (archivePath === offMacPath) fail("off-Mac copy must be a distinct path");
  if (
    evidence?.off_mac_copy?.archive_sha256 !== archiveSha
    || observedFiles?.[archivePath] !== archiveSha
    || observedFiles?.[offMacPath] !== archiveSha
  ) {
    fail("backup and off-Mac copy digests must match observed files");
  }
  const backupAge = ageHours(evidence?.backup?.created_at, nowMs, "backup");
  ageHours(evidence?.key_recovery?.created_at, nowMs, "backup key recovery");
  ageHours(evidence?.off_mac_copy?.verified_at, nowMs, "off-Mac copy");
  const restoreAge = ageHours(evidence?.restore?.verified_at, nowMs, "restore");
  const escrowEnvelopePath = evidence?.key_recovery?.escrow_envelope_path;
  const escrowEnvelopeSha256 = evidence?.key_recovery?.escrow_envelope_sha256;
  if (
    typeof escrowEnvelopePath !== "string"
    || !isAbsolute(escrowEnvelopePath)
    || !SHA256.test(escrowEnvelopeSha256)
    || observedEscrowFiles?.[resolve(escrowEnvelopePath)] !== escrowEnvelopeSha256
  ) {
    fail("authenticated backup key escrow envelope is unavailable or mismatched");
  }
  if (
    evidence?.restore?.source_archive_sha256 !== archiveSha
    || evidence?.key_recovery?.format
      !== "homecook-full-local-backup-key-recovery-v1"
    || evidence?.key_recovery?.archive_sha256 !== archiveSha
    || evidence?.key_recovery?.restored_metadata_sha256
      !== authenticatedBackupMetadataSha256
    || evidence?.key_recovery?.clean_restore_verified !== true
    || evidence?.key_recovery?.keychain_reregistered !== true
    || typeof evidence?.key_recovery?.keychain_registration?.account !== "string"
    || evidence.key_recovery.keychain_registration.account.length === 0
    || typeof evidence?.key_recovery?.keychain_registration?.adapter !== "string"
    || evidence.key_recovery.keychain_registration.adapter.length === 0
    || !SHA256.test(evidence?.key_recovery?.keychain_registration?.key_sha256)
    || typeof evidence?.key_recovery?.archive_device_id !== "string"
    || evidence.key_recovery.archive_device_id.length === 0
    || typeof evidence?.key_recovery?.escrow_device_id !== "string"
    || evidence.key_recovery.escrow_device_id.length === 0
    || evidence.key_recovery.archive_device_id
      === evidence.key_recovery.escrow_device_id
    || evidence?.key_recovery?.source_machine_id
      === evidence?.key_recovery?.replacement_machine_id
    || typeof evidence?.key_recovery?.evidence_path !== "string"
    || !isAbsolute(evidence.key_recovery.evidence_path)
    || !SHA256.test(evidence?.key_recovery?.evidence_sha256)
    || evidence?.restore?.execution !== "clean-isolated-restore-platform-v1"
    || typeof evidence?.restore?.manifest_path !== "string"
    || !isAbsolute(evidence.restore.manifest_path)
    || !SHA256.test(evidence?.restore?.manifest_sha256)
    || evidence?.restore?.fresh_target_attested !== true
    || !SHA256.test(evidence?.restore?.database_data_sha256)
    || evidence.restore.database_data_sha256 !== evidence?.backup?.data_sha256
    || evidence?.restore?.source_data_sha256 !== evidence?.backup?.data_sha256
    || !SHA256.test(evidence?.backup?.roles_sha256)
    || evidence?.restore?.source_roles_sha256 !== evidence.backup.roles_sha256
    || !SHA256.test(evidence?.backup?.schema_sha256)
    || evidence?.restore?.source_schema_sha256 !== evidence.backup.schema_sha256
    || !SHA256.test(evidence?.backup?.relation_classification_digest)
    || evidence?.restore?.relation_classification_digest
      !== evidence.backup.relation_classification_digest
    || evidence?.restore?.unclassified_count !== 0
    || !SHA256.test(evidence?.restore?.auth_identity_digest)
    || !SHA256.test(evidence?.restore?.database_digest)
    || !SHA256.test(evidence?.restore?.storage_digest)
    || !Number.isSafeInteger(evidence?.restore?.auth_users)
    || evidence.restore.auth_users < 0
    || !Number.isSafeInteger(evidence?.restore?.auth_identities)
    || evidence.restore.auth_identities < 0
    || !Number.isSafeInteger(evidence?.restore?.public_relation_count)
    || evidence.restore.public_relation_count < 0
    || !Number.isSafeInteger(evidence?.restore?.storage_bucket_count)
    || evidence.restore.storage_bucket_count < 0
    || !Number.isSafeInteger(evidence?.restore?.storage_object_count)
    || evidence.restore.storage_object_count !== evidence.restore.object_count
    || !Number.isSafeInteger(evidence?.restore?.storage_referenced_object_count)
    || evidence.restore.storage_referenced_object_count !== evidence.restore.object_count
    || evidence?.restore?.storage_payload_included !== true
    || !SHA256.test(evidence?.restore?.payload_catalog_sha256)
    || !Number.isSafeInteger(evidence?.restore?.object_count)
    || evidence.restore.object_count < 0
    || !Number.isSafeInteger(evidence?.restore?.database_reference_count)
    || evidence.restore.database_reference_count !== evidence.restore.object_count
    || !Number.isSafeInteger(evidence?.restore?.total_bytes)
    || evidence.restore.total_bytes < 0
    || typeof evidence?.restore?.target_compose_project !== "string"
    || evidence.restore.target_compose_project.length === 0
    || evidence.restore.target_compose_project === evidence?.production?.compose_project
    || typeof evidence?.restore?.target_storage_volume !== "string"
    || evidence.restore.target_storage_volume.length === 0
    || evidence.restore.target_storage_volume === evidence?.production?.storage_volume
  ) {
    fail("restore evidence does not prove a complete Storage payload");
  }
  const expectedProduction = {
    compose_project: production?.composeProject,
    container_name: production?.postgresContainerName,
    image: production?.postgresImage,
    postgres_volume: production?.postgresVolumeName,
    storage_volume: production?.storageVolumeName,
  };
  for (const [name, expected] of Object.entries(expectedProduction)) {
    if (typeof expected !== "string" || evidence?.production?.[name] !== expected) {
      fail(`production ${name} identity mismatch`);
    }
  }
  return Object.freeze({
    backup_age_hours: backupAge,
    off_mac_copy_verified: true,
    restore_age_hours: restoreAge,
    status: "PASS",
  });
}
