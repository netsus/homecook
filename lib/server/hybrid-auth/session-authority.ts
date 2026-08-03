import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function requireSecret(secret: string) {
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("HMAC secret은 32 bytes 이상이어야 해요.");
  }
}

function requireUuid(value: string, label: string) {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${label} 값은 UUID여야 해요.`);
  }
}

function requireIsoTimestamp(value: string, label: string) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new Error(`${label} 값은 ISO timestamp여야 해요.`);
  }

  return new Date(milliseconds).toISOString();
}

function signPayload(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function createSessionKeyHash({
  secret,
  keyVersion,
  issuer,
  ownerUuid,
  sessionId,
  identityCreatedAt,
}: {
  secret: string;
  keyVersion: number;
  issuer: string;
  ownerUuid: string;
  sessionId: string;
  identityCreatedAt: string;
}) {
  requireSecret(secret);
  requireUuid(ownerUuid, "ownerUuid");
  requireUuid(sessionId, "sessionId");
  if (!Number.isSafeInteger(keyVersion) || keyVersion <= 0) {
    throw new Error("keyVersion은 양의 정수여야 해요.");
  }
  return signPayload(
    [
      `v${keyVersion}`,
      issuer,
      ownerUuid,
      requireIsoTimestamp(identityCreatedAt, "identityCreatedAt"),
      sessionId,
    ].join("\n"),
    secret,
  );
}

export function createRemoteIdentityDigest({
  issuer,
  ownerUuid,
  identityCreatedAt,
}: {
  issuer: string;
  ownerUuid: string;
  identityCreatedAt: string;
}) {
  requireUuid(ownerUuid, "ownerUuid");
  return createHash("sha256")
    .update([
      "v1",
      issuer,
      ownerUuid,
      requireIsoTimestamp(identityCreatedAt, "identityCreatedAt"),
    ].join("\n"), "utf8")
    .digest("hex");
}

export function sanitizeRemoteIdentityEpochEvidence(
  input: Record<string, unknown>,
) {
  if (input.active_epoch !== true && input.active_epoch !== false) {
    throw new Error("active_epoch boolean 값이 필요해요.");
  }
  if (typeof input.issuer !== "string" || !input.issuer.endsWith("/auth/v1")) {
    throw new Error("remote issuer 값이 필요해요.");
  }
  if (typeof input.owner_uuid !== "string") {
    throw new Error("owner_uuid 값이 필요해요.");
  }
  requireUuid(input.owner_uuid, "owner_uuid");
  if (
    !Number.isSafeInteger(input.remote_revision)
    || Number(input.remote_revision) <= 0
    || !Number.isSafeInteger(input.evidence_revision)
    || Number(input.evidence_revision) <= 0
  ) {
    throw new Error("remote/evidence revision은 양의 정수여야 해요.");
  }
  if (
    typeof input.remote_identity_digest !== "string"
    || !SHA256_PATTERN.test(input.remote_identity_digest)
  ) {
    throw new Error("remote_identity_digest는 SHA-256 hex여야 해요.");
  }

  const deletedTerminalAt =
    input.deleted_terminal_at === null
    || typeof input.deleted_terminal_at === "undefined"
    ? null
    : requireIsoTimestamp(String(input.deleted_terminal_at), "deleted_terminal_at");
  const deletedTerminalReason =
    input.deleted_terminal_reason === null
    || typeof input.deleted_terminal_reason === "undefined"
    ? null
    : String(input.deleted_terminal_reason);

  return {
    active_epoch: input.active_epoch,
    issuer: input.issuer,
    owner_uuid: input.owner_uuid,
    identity_created_at: requireIsoTimestamp(
      String(input.identity_created_at),
      "identity_created_at",
    ),
    remote_revision: Number(input.remote_revision),
    remote_identity_digest: input.remote_identity_digest,
    verified_at: requireIsoTimestamp(String(input.verified_at), "verified_at"),
    deleted_terminal_at: deletedTerminalAt,
    deleted_terminal_reason: deletedTerminalReason,
    evidence_revision: Number(input.evidence_revision),
  };
}

export function createSessionLivenessBinding({
  secret,
  keyVersion,
  issuer,
  ownerUuid,
  sessionId,
  identityCreatedAt,
  remoteVerifiedAt,
  ttlSeconds,
}: {
  secret: string;
  keyVersion: number;
  issuer: string;
  ownerUuid: string;
  sessionId: string;
  identityCreatedAt: string;
  remoteVerifiedAt: string;
  ttlSeconds: number;
}) {
  requireSecret(secret);
  requireUuid(ownerUuid, "ownerUuid");
  requireUuid(sessionId, "sessionId");
  if (!Number.isSafeInteger(keyVersion) || keyVersion <= 0) {
    throw new Error("keyVersion은 양의 정수여야 해요.");
  }
  if (
    !Number.isSafeInteger(ttlSeconds)
    || ttlSeconds <= 0
    || ttlSeconds > 86_400
  ) {
    throw new Error("binding TTL은 1~86400초여야 해요.");
  }

  const normalizedIdentityCreatedAt = requireIsoTimestamp(
    identityCreatedAt,
    "identityCreatedAt",
  );
  const normalizedVerifiedAt = requireIsoTimestamp(
    remoteVerifiedAt,
    "remoteVerifiedAt",
  );
  const expiresAt = new Date(
    Date.parse(normalizedVerifiedAt) + ttlSeconds * 1_000,
  ).toISOString();
  const sessionKeyHash = createSessionKeyHash({
    secret,
    keyVersion,
    issuer,
    ownerUuid,
    sessionId,
    identityCreatedAt: normalizedIdentityCreatedAt,
  });

  return {
    session_key_hash: sessionKeyHash,
    hmac_key_version: keyVersion,
    issuer,
    owner_uuid: ownerUuid,
    // Keep the exact provider/DB epoch. JavaScript Date canonicalization loses
    // PostgreSQL microseconds, while the HMAC above intentionally canonicalizes
    // the same instant for stable cross-runtime hashing.
    identity_created_at: identityCreatedAt,
    remote_verified_at: normalizedVerifiedAt,
    binding_expires_at: expiresAt,
    binding_state: "active" as const,
  };
}

interface HybridAttestationPayload {
  version: number;
  method: string;
  path: string;
  issuer: string;
  owner_uuid: string;
  identity_created_at: string;
  session_key_hash: string;
  issued_at: number;
  expires_at: number;
}

function encodeAttestationPayload(payload: HybridAttestationPayload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function createHybridRequestAttestation({
  secret,
  keyVersion,
  method,
  path,
  issuer,
  ownerUuid,
  identityCreatedAt,
  sessionKeyHash,
  issuedAtSeconds,
  ttlSeconds,
}: {
  secret: string;
  keyVersion: number;
  method: string;
  path: string;
  issuer: string;
  ownerUuid: string;
  identityCreatedAt: string;
  sessionKeyHash: string;
  issuedAtSeconds: number;
  ttlSeconds: number;
}) {
  requireSecret(secret);
  requireUuid(ownerUuid, "ownerUuid");
  if (!SHA256_PATTERN.test(sessionKeyHash)) {
    throw new Error("sessionKeyHash는 SHA-256 hex여야 해요.");
  }
  if (
    !Number.isSafeInteger(issuedAtSeconds)
    || !Number.isSafeInteger(ttlSeconds)
    || ttlSeconds <= 0
    || ttlSeconds > 60
  ) {
    throw new Error("attestation TTL은 1~60초여야 해요.");
  }

  const payload: HybridAttestationPayload = {
    version: keyVersion,
    method: method.toUpperCase(),
    path,
    issuer,
    owner_uuid: ownerUuid,
    identity_created_at: requireIsoTimestamp(
      identityCreatedAt,
      "identityCreatedAt",
    ),
    session_key_hash: sessionKeyHash,
    issued_at: issuedAtSeconds,
    expires_at: issuedAtSeconds + ttlSeconds,
  };
  const encodedPayload = encodeAttestationPayload(payload);
  return {
    payload: encodedPayload,
    signature: signPayload(encodedPayload, secret),
  };
}

export function verifyHybridRequestAttestation({
  payload,
  signature,
  secret,
  method,
  path,
  nowSeconds = Math.floor(Date.now() / 1_000),
}: {
  payload: string;
  signature: string;
  secret: string;
  method: string;
  path: string;
  nowSeconds?: number;
}): { ok: true; claims: HybridAttestationPayload } | { ok: false } {
  try {
    requireSecret(secret);
    if (!SHA256_PATTERN.test(signature)) {
      return { ok: false };
    }
    const expected = signPayload(payload, secret);
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return { ok: false };
    }
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as HybridAttestationPayload;
    if (
      claims.method !== method.toUpperCase()
      || claims.path !== path
      || claims.issued_at > nowSeconds + 5
      || claims.expires_at < nowSeconds
      || claims.expires_at - claims.issued_at <= 0
      || claims.expires_at - claims.issued_at > 60
      || !UUID_PATTERN.test(claims.owner_uuid)
      || !SHA256_PATTERN.test(claims.session_key_hash)
    ) {
      return { ok: false };
    }

    return { ok: true, claims };
  } catch {
    return { ok: false };
  }
}
