import {
  createHash,
  createPrivateKey,
  randomUUID,
  sign,
} from "node:crypto";

import {
  ensureJtiHash,
  ensureNonEmptyString,
  ensureReleaseSha,
  ensureSnapshotDigest,
} from "./youtube-extraction-worker-artifact.mjs";

const MAX_WORKER_CREDENTIAL_TTL_SECONDS = 7 * 24 * 60 * 60;

function ensureInteger(value, label, minimum = 1) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}.`);
  }
  return value;
}

function encodedJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function selectLocalEs256SigningKey(jwtKeys) {
  if (!Array.isArray(jwtKeys)) {
    throw new Error("local Supabase jwt_keys must be an array");
  }
  const candidates = jwtKeys.filter((key) =>
    key?.alg === "ES256"
    && key?.kty === "EC"
    && key?.crv === "P-256"
    && typeof key?.d === "string"
    && typeof key?.kid === "string"
    && key.kid.length > 0);
  if (candidates.length !== 1) {
    throw new Error("local Supabase must expose exactly one ES256 private signing key");
  }
  return candidates[0];
}

/**
 * Issues the restricted worker JWT from the local Supabase ES256 signing key.
 * The raw JTI is never persisted; only its SHA-256 digest is placed in the JWT
 * and credential metadata so the database can fence generations.
 *
 * @param {{
 *   jwtKeys: Array<Record<string, unknown>>,
 *   generation: number,
 *   releaseSha: string,
 *   schemaIdentity: string,
 *   allowedSnapshotDigest: string,
 *   now?: Date,
 *   ttlSeconds?: number,
 *   jti?: string,
 * }} options
 */
export function issueYoutubeExtractionWorkerCredential({
  jwtKeys,
  generation,
  releaseSha,
  schemaIdentity,
  allowedSnapshotDigest,
  now = new Date(),
  ttlSeconds = 6 * 24 * 60 * 60,
  jti = randomUUID(),
} = {}) {
  const normalizedGeneration = ensureInteger(generation, "generation");
  const normalizedReleaseSha = ensureReleaseSha(releaseSha);
  const normalizedSchemaIdentity = ensureNonEmptyString(
    schemaIdentity,
    "schemaIdentity",
  );
  const normalizedDigest = ensureSnapshotDigest(allowedSnapshotDigest);
  const normalizedTtl = ensureInteger(ttlSeconds, "ttlSeconds");
  if (normalizedTtl > MAX_WORKER_CREDENTIAL_TTL_SECONDS) {
    throw new Error("worker credential lifetime must not exceed 7 days");
  }
  const nowMs = now instanceof Date ? now.getTime() : Number.NaN;
  if (!Number.isFinite(nowMs)) {
    throw new Error("now must be a valid Date");
  }
  const normalizedJti = ensureNonEmptyString(jti, "jti");
  const jtiHash = ensureJtiHash(
    createHash("sha256").update(normalizedJti, "utf8").digest("hex"),
  );
  const issuedAt = Math.floor(nowMs / 1_000);
  const expiresAtSeconds = issuedAt + normalizedTtl;
  const key = selectLocalEs256SigningKey(jwtKeys);
  const header = {
    alg: "ES256",
    kid: key.kid,
    typ: "JWT",
  };
  const claims = {
    role: "youtube_extraction_worker",
    scope: "youtube-extraction-worker",
    iss: "https://worker.mumeok.kr",
    aud: "youtube-extraction",
    generation: normalizedGeneration,
    jti_hash: jtiHash,
    release_sha: normalizedReleaseSha,
    schema_identity: normalizedSchemaIdentity,
    allowed_snapshot_digest: normalizedDigest,
    iat: issuedAt,
    exp: expiresAtSeconds,
  };
  const signingInput = `${encodedJson(header)}.${encodedJson(claims)}`;
  const signature = sign("SHA256", Buffer.from(signingInput, "utf8"), {
    dsaEncoding: "ieee-p1363",
    key: createPrivateKey({ format: "jwk", key }),
  }).toString("base64url");
  const token = `${signingInput}.${signature}`;

  return Object.freeze({
    token,
    jtiHash,
    metadata: Object.freeze({
      generation: normalizedGeneration,
      jti_sha256: jtiHash,
      expires_at: new Date(expiresAtSeconds * 1_000).toISOString(),
      release_sha: normalizedReleaseSha,
      schema_identity: normalizedSchemaIdentity,
      allowed_snapshot_digest: normalizedDigest,
    }),
  });
}
