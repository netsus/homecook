import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPublicKey,
  randomBytes,
  scryptSync,
  sign,
  verify,
} from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

const FORMAT = "homecook-full-local-backup-key-escrow-v1";
const SHA256 = /^[0-9a-f]{64}$/u;
const KEYCHAIN_ADAPTER_FORMAT = "isolated-filesystem-keychain-adapter-v1";

function fail(message) {
  throw new Error(`Full-local backup key recovery failed: ${message}`);
}

function strongSecret(value, label) {
  if (typeof value !== "string" || value.length < 24) {
    fail(`${label} must contain at least 24 characters`);
  }
  return value;
}

/**
 * Authenticate the archive before atomically creating the recovered direct
 * Keychain item. `createItem` must use create-only platform semantics.
 *
 * @param {{
 *   createItem: (recoveredKey: string, ownershipToken: string) => unknown | Promise<unknown>,
 *   deleteOwnedItem: (ownershipToken: string) => unknown | Promise<unknown>,
 *   directItemExists: () => boolean,
 *   execute: () => unknown | Promise<unknown>,
 *   ownershipToken?: () => string,
 *   readOwnedItem: (ownershipToken: string) => string,
 *   recoveredKey: string,
 *   verifyArchive: (recoveredKey: string) => unknown | Promise<unknown>,
 * }} input
 */
export async function withRecoveredBackupKeyCreateOnlyRegistration({
  createItem,
  deleteOwnedItem,
  directItemExists,
  execute,
  ownershipToken = () => randomBytes(32).toString("hex"),
  readOwnedItem,
  recoveredKey,
  verifyArchive,
}) {
  const verifiedKey = strongSecret(recoveredKey, "recovered backup key");
  if (directItemExists()) {
    fail("source backup Keychain direct item already exists");
  }
  await verifyArchive(verifiedKey);
  const attemptToken = ownershipToken();
  if (!/^[a-zA-Z0-9_-]{12,128}$/u.test(attemptToken)) {
    fail("Keychain registration ownership token is invalid");
  }
  let createdThisAttempt = false;
  try {
    await createItem(verifiedKey, attemptToken);
    createdThisAttempt = true;
    if (readOwnedItem(attemptToken) !== verifiedKey) {
      fail("create-only Keychain registration does not match the recovered backup key");
    }
    return await execute();
  } catch (error) {
    if (!createdThisAttempt) throw error;
    try {
      if (readOwnedItem(attemptToken) !== verifiedKey) {
        throw new Error("attempt ownership or recovered value changed");
      }
      await deleteOwnedItem(attemptToken);
    } catch {
      fail("attempt-owned Keychain cleanup failed; manual recovery required before retry");
    }
    throw error;
  }
}

/** @param {{backupKey: string, recoveryCredential: string, recoveryIssuerPublicKey?: import("node:crypto").KeyLike | import("node:crypto").KeyObject | null}} input */
export function sealFullLocalBackupKeyEscrow({
  backupKey,
  recoveryCredential,
  recoveryIssuerPublicKey = null,
}) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(strongSecret(recoveryCredential, "recovery credential"), salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(strongSecret(backupKey, "backup key"), "utf8"),
    cipher.final(),
  ]);
  const issuerPublicKey = recoveryIssuerPublicKey
    ? (recoveryIssuerPublicKey.type === "public"
        ? recoveryIssuerPublicKey
        : createPublicKey(recoveryIssuerPublicKey))
      .export({ format: "der", type: "spki" })
    : null;
  return Object.freeze({
    authentication_tag: cipher.getAuthTag().toString("base64url"),
    cipher: "AES-256-GCM",
    ciphertext: ciphertext.toString("base64url"),
    format: FORMAT,
    iv: iv.toString("base64url"),
    kdf: "scrypt",
    recovery_issuer_public_key: issuerPublicKey?.toString("base64url"),
    recovery_issuer_public_key_sha256: issuerPublicKey
      ? createHash("sha256").update(issuerPublicKey).digest("hex")
      : undefined,
    salt: salt.toString("base64url"),
  });
}

function recoveryEvidencePayload(evidence) {
  const payload = { ...(evidence ?? {}) };
  delete payload.issuer_attestation;
  return Buffer.from(JSON.stringify(payload), "utf8");
}

export function signFullLocalBackupKeyRecoveryEvidence({ evidence, privateKey }) {
  const publicKey = createPublicKey(privateKey).export({ format: "der", type: "spki" });
  return Object.freeze({
    ...evidence,
    issuer_attestation: {
      algorithm: "Ed25519",
      public_key_sha256: createHash("sha256").update(publicKey).digest("hex"),
      signature: sign(null, recoveryEvidencePayload(evidence), privateKey).toString("base64url"),
    },
  });
}

export function verifyFullLocalBackupKeyRecoveryIssuerAttestation({ envelope, evidence }) {
  try {
    const publicKeyBytes = Buffer.from(envelope?.recovery_issuer_public_key ?? "", "base64url");
    const fingerprint = createHash("sha256").update(publicKeyBytes).digest("hex");
    const attestation = evidence?.issuer_attestation;
    const publicKey = createPublicKey({ key: publicKeyBytes, format: "der", type: "spki" });
    if (
      envelope?.recovery_issuer_public_key_sha256 !== fingerprint
      || attestation?.algorithm !== "Ed25519"
      || attestation?.public_key_sha256 !== fingerprint
      || !verify(
        null,
        recoveryEvidencePayload(evidence),
        publicKey,
        Buffer.from(attestation.signature ?? "", "base64url"),
      )
    ) {
      fail("recovery issuer attestation signature is invalid");
    }
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Full-local backup")) throw error;
    fail("recovery issuer attestation signature is invalid");
  }
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

export function createIsolatedKeychainAdapter({ directory }) {
  if (typeof directory !== "string" || !isAbsolute(directory)) {
    fail("isolated Keychain directory must be absolute");
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const secretPath = (account) => {
    if (typeof account !== "string" || !/^[a-z0-9][a-z0-9-]{2,63}$/u.test(account)) {
      fail("isolated Keychain account is invalid");
    }
    return join(directory, `${account}.secret`);
  };
  return Object.freeze({
    format: KEYCHAIN_ADAPTER_FORMAT,
    read(account) {
      const path = secretPath(account);
      const stat = statSync(path);
      if (!stat.isFile() || (stat.mode & 0o777) !== 0o600) {
        fail("isolated Keychain item must be a mode 0600 file");
      }
      return readFileSync(path, "utf8");
    },
    register(account, secret) {
      writeFileSync(secretPath(account), strongSecret(secret, "recovered backup key"), {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
    },
  });
}

export function verifyIsolatedKeychainRegistration({ account, adapter, expectedKey }) {
  if (adapter?.format !== KEYCHAIN_ADAPTER_FORMAT || typeof adapter.read !== "function") {
    fail("isolated Keychain adapter is invalid");
  }
  const registeredKey = adapter.read(account);
  if (registeredKey !== strongSecret(expectedKey, "expected backup key")) {
    fail("isolated Keychain registration does not match the recovered backup key");
  }
  return Object.freeze({
    account,
    adapter: KEYCHAIN_ADAPTER_FORMAT,
    key_sha256: createHash("sha256").update(registeredKey).digest("hex"),
  });
}

export function verifyFullLocalBackupKeyEscrowBinding({
  archiveDeviceIds,
  manifest,
  observedDeviceId,
  observedPath,
  observedSha256,
}) {
  if (
    !Array.isArray(archiveDeviceIds)
    || archiveDeviceIds.length !== 2
    || archiveDeviceIds.some((device) => typeof device !== "string" || !device)
    || typeof observedPath !== "string"
    || !isAbsolute(observedPath)
    || resolve(observedPath) !== resolve(manifest?.escrow_envelope_path ?? "")
    || observedSha256 !== manifest?.escrow_envelope_sha256
    || !SHA256.test(observedSha256)
    || observedDeviceId !== manifest?.escrow_device_id
    || archiveDeviceIds.includes(observedDeviceId)
  ) {
    fail("escrow envelope path, digest, or independent device binding is invalid");
  }
  return true;
}
