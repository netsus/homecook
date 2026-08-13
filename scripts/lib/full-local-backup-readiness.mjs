import { isAbsolute, resolve } from "node:path";

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

export function buildFullLocalBackupReadinessEvidence({
  archivePath,
  archiveSha256,
  backupMetadata,
  now,
  offMacCopyPath,
  offMacCopySha256,
  restoreManifest,
}) {
  const provenance = backupMetadata?.database?.provenance;
  const storageSourcePrefix = `docker-compose-volume:${provenance?.compose_project}:`;
  const storageSourceIdentity = backupMetadata?.storage_payload?.source_identity;
  const productionStorageVolume = typeof storageSourceIdentity === "string"
    && storageSourceIdentity.startsWith(storageSourcePrefix)
    ? storageSourceIdentity.slice(storageSourcePrefix.length)
    : null;
  if (
    !SHA256.test(archiveSha256)
    || offMacCopySha256 !== archiveSha256
    || backupMetadata?.storage_payload_included !== true
    || restoreManifest?.format !== "homecook-full-local-restore-v1"
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
    },
    format: FULL_LOCAL_BACKUP_READINESS_FORMAT,
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
      database_reference_count: restoreManifest.storage_reference_count,
      object_count: restoreManifest.storage_payload_object_count,
      payload_catalog_sha256: restoreManifest.storage_payload_catalog_sha256,
      source_archive_sha256: restoreManifest.source_archive_sha256,
      storage_payload_included: true,
      target_compose_project: restoreManifest.compose_project,
      target_storage_volume: restoreManifest.storage_volume,
      total_bytes: restoreManifest.storage_payload_total_bytes,
      verified_at: restoreManifest.created_at,
    },
  });
}

export function verifyFullLocalBackupReadiness({
  evidence,
  evidenceFileMode,
  nowMs = Date.now(),
  observedFiles,
  production,
}) {
  if (evidenceFileMode !== 0o600) fail("evidence file mode must be 0600");
  if (evidence?.format !== FULL_LOCAL_BACKUP_READINESS_FORMAT) {
    fail("evidence format is invalid");
  }
  const archiveSha = evidence?.backup?.archive_sha256;
  if (!SHA256.test(archiveSha)) fail("backup archive digest is invalid");
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
  ageHours(evidence?.off_mac_copy?.verified_at, nowMs, "off-Mac copy");
  const restoreAge = ageHours(evidence?.restore?.verified_at, nowMs, "restore");
  if (
    evidence?.restore?.source_archive_sha256 !== archiveSha
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
