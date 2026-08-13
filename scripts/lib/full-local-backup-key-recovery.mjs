import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

const FORMAT = "homecook-full-local-backup-key-escrow-v1";
const RECOVERY_FORMAT = "homecook-full-local-backup-key-recovery-v1";
const SHA256 = /^[0-9a-f]{64}$/u;

function fail(message) {
  throw new Error(`Full-local backup key recovery failed: ${message}`);
}

function strongSecret(value, label) {
  if (typeof value !== "string" || value.length < 24) {
    fail(`${label} must contain at least 24 characters`);
  }
  return value;
}

export function sealFullLocalBackupKeyEscrow({ backupKey, recoveryCredential }) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(strongSecret(recoveryCredential, "recovery credential"), salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(strongSecret(backupKey, "backup key"), "utf8"),
    cipher.final(),
  ]);
  return Object.freeze({
    authentication_tag: cipher.getAuthTag().toString("base64url"),
    cipher: "AES-256-GCM",
    ciphertext: ciphertext.toString("base64url"),
    format: FORMAT,
    iv: iv.toString("base64url"),
    kdf: "scrypt",
    salt: salt.toString("base64url"),
  });
}

export function openFullLocalBackupKeyEscrow({ envelope, recoveryCredential }) {
  try {
    if (
      envelope?.format !== FORMAT
      || envelope?.cipher !== "AES-256-GCM"
      || envelope?.kdf !== "scrypt"
    ) {
      fail("escrow envelope format is invalid");
    }
    const salt = Buffer.from(envelope.salt, "base64url");
    const iv = Buffer.from(envelope.iv, "base64url");
    const tag = Buffer.from(envelope.authentication_tag, "base64url");
    const ciphertext = Buffer.from(envelope.ciphertext, "base64url");
    if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
      fail("escrow envelope encoding is invalid");
    }
    const key = scryptSync(
      strongSecret(recoveryCredential, "recovery credential"),
      salt,
      32,
    );
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Full-local backup")) {
      throw error;
    }
    fail("escrow authentication or decryption failed");
  }
}

export function buildFullLocalBackupKeyRecoveryEvidence({
  archiveDeviceId,
  archiveSha256,
  cleanRestoreVerified,
  createdAt,
  escrowDeviceId,
  expectedMetadataSha256,
  keychainReregistered,
  replacementMachineId,
  restoredArchiveSha256,
  restoredMetadataSha256,
  sourceMachineId,
}) {
  if (
    typeof archiveDeviceId !== "string"
    || archiveDeviceId.length === 0
    || typeof escrowDeviceId !== "string"
    || escrowDeviceId.length === 0
    || archiveDeviceId === escrowDeviceId
    || typeof sourceMachineId !== "string"
    || sourceMachineId.length === 0
    || typeof replacementMachineId !== "string"
    || replacementMachineId.length === 0
    || sourceMachineId === replacementMachineId
    || keychainReregistered !== true
    || cleanRestoreVerified !== true
    || !SHA256.test(archiveSha256)
    || restoredArchiveSha256 !== archiveSha256
    || !SHA256.test(expectedMetadataSha256)
    || restoredMetadataSha256 !== expectedMetadataSha256
    || !Number.isFinite(Date.parse(createdAt))
  ) {
    fail("separate escrow, replacement Mac Keychain, and clean restore proof are required");
  }
  return Object.freeze({
    archive_device_id: archiveDeviceId,
    archive_sha256: archiveSha256,
    clean_restore_verified: true,
    created_at: createdAt,
    escrow_device_id: escrowDeviceId,
    format: RECOVERY_FORMAT,
    keychain_reregistered: true,
    replacement_machine_id: replacementMachineId,
    restored_metadata_sha256: restoredMetadataSha256,
    source_machine_id: sourceMachineId,
  });
}
