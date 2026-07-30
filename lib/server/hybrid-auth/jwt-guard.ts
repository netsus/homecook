import {
  createPublicKey,
  verify,
} from "node:crypto";

const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_ALGORITHMS = new Set(["ES256", "RS256"]);

type JsonObject = Record<string, unknown>;

export interface ValidatedRemoteJwtClaims {
  issuer: string;
  ownerUuid: string;
  sessionId: string;
  issuedAt: number;
  notBefore: number;
  expiresAt: number;
}

function isSafePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

export function validateRemoteJwtClaims({
  claims,
  expectedIssuer,
  nowSeconds = Math.floor(Date.now() / 1_000),
  clockSkewSeconds = 60,
}: {
  claims: JsonObject;
  expectedIssuer: string;
  nowSeconds?: number;
  clockSkewSeconds?: number;
}):
  | { ok: true; claims: ValidatedRemoteJwtClaims }
  | { ok: false; reason: string } {
  const sessionId = claims.session_id;
  if (claims.iss !== expectedIssuer) {
    return { ok: false, reason: "issuer" };
  }
  if (claims.aud !== "authenticated") {
    return { ok: false, reason: "audience" };
  }
  if (claims.role !== "authenticated") {
    return { ok: false, reason: "role" };
  }
  if (typeof claims.sub !== "string" || !UUID_PATTERN.test(claims.sub)) {
    return { ok: false, reason: "owner" };
  }
  if (typeof sessionId !== "string" || !UUID_PATTERN.test(sessionId)) {
    return { ok: false, reason: "session" };
  }
  if (
    !isSafePositiveInteger(claims.iat)
    || claims.iat > nowSeconds + clockSkewSeconds
  ) {
    return { ok: false, reason: "issued_at" };
  }
  if (
    !isSafePositiveInteger(claims.nbf)
    || claims.nbf > nowSeconds + clockSkewSeconds
  ) {
    return { ok: false, reason: "not_before" };
  }
  if (
    !isSafePositiveInteger(claims.exp)
    || claims.exp <= nowSeconds
    || claims.iat >= claims.exp
    || claims.nbf >= claims.exp
  ) {
    return { ok: false, reason: "expiry" };
  }

  return {
    ok: true,
    claims: {
      issuer: expectedIssuer,
      ownerUuid: claims.sub,
      sessionId,
      issuedAt: claims.iat,
      notBefore: claims.nbf,
      expiresAt: claims.exp,
    },
  };
}

function isPublicVerifyKey(key: JsonObject) {
  if (
    typeof key.kid !== "string"
    || !key.kid
    || typeof key.alg !== "string"
    || !ALLOWED_ALGORITHMS.has(key.alg)
  ) {
    return false;
  }
  if (key.use !== undefined && key.use !== "sig") {
    return false;
  }
  if (
    key.key_ops !== undefined
    && (
      !Array.isArray(key.key_ops)
      || !key.key_ops.includes("verify")
      || key.key_ops.some((operation) => operation !== "verify")
    )
  ) {
    return false;
  }

  if (key.alg === "ES256") {
    return key.kty === "EC"
      && key.crv === "P-256"
      && typeof key.x === "string"
      && Boolean(key.x)
      && typeof key.y === "string"
      && Boolean(key.y)
      && key.d === undefined;
  }

  return key.kty === "RSA"
    && typeof key.n === "string"
    && Boolean(key.n)
    && typeof key.e === "string"
    && Boolean(key.e)
    && key.d === undefined;
}

export function validateRemoteJwks(jwks: unknown):
  | { ok: true; keys: JsonObject[] }
  | { ok: false; reason: string } {
  if (
    !jwks
    || typeof jwks !== "object"
    || !Array.isArray(Reflect.get(jwks, "keys"))
    || Reflect.get(jwks, "keys").length === 0
  ) {
    return { ok: false, reason: "keys" };
  }

  const keys = Reflect.get(jwks, "keys") as unknown[];
  if (
    keys.some(
      (key) => !key || typeof key !== "object" || !isPublicVerifyKey(key as JsonObject),
    )
  ) {
    return { ok: false, reason: "unsafe_key" };
  }

  const normalizedKeys = keys as JsonObject[];
  const kids = normalizedKeys.map((key) => key.kid as string);
  if (new Set(kids).size !== kids.length) {
    return { ok: false, reason: "duplicate_kid" };
  }

  return { ok: true, keys: normalizedKeys };
}

export function decodeRemoteJwt(accessToken: string):
  | {
      ok: true;
      header: JsonObject;
      claims: JsonObject;
    }
  | { ok: false; reason: string } {
  const parts = accessToken.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    return { ok: false, reason: "format" };
  }

  try {
    const header = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8"),
    ) as unknown;
    const claims = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as unknown;
    if (
      !header
      || typeof header !== "object"
      || Array.isArray(header)
      || !claims
      || typeof claims !== "object"
      || Array.isArray(claims)
    ) {
      return { ok: false, reason: "json" };
    }

    if (
      typeof Reflect.get(header, "alg") !== "string"
      || !ALLOWED_ALGORITHMS.has(Reflect.get(header, "alg"))
      || typeof Reflect.get(header, "kid") !== "string"
      || !Reflect.get(header, "kid")
      || Reflect.get(header, "typ") !== undefined
        && Reflect.get(header, "typ") !== "JWT"
    ) {
      return { ok: false, reason: "header" };
    }

    return {
      ok: true,
      header: header as JsonObject,
      claims: claims as JsonObject,
    };
  } catch {
    return { ok: false, reason: "decode" };
  }
}

export function verifyRemoteJwtSignature({
  accessToken,
  jwks,
}: {
  accessToken: string;
  jwks: unknown;
}):
  | { ok: true; header: JsonObject; claims: JsonObject }
  | { ok: false; reason: string } {
  const decoded = decodeRemoteJwt(accessToken);
  if (!decoded.ok) {
    return decoded;
  }
  const validatedJwks = validateRemoteJwks(jwks);
  if (!validatedJwks.ok) {
    return { ok: false, reason: `jwks_${validatedJwks.reason}` };
  }

  const algorithm = decoded.header.alg;
  const keyId = decoded.header.kid;
  const candidates = validatedJwks.keys.filter(
    (key) => key.alg === algorithm && key.kid === keyId,
  );
  if (candidates.length !== 1) {
    return { ok: false, reason: "key" };
  }

  const parts = accessToken.split(".");
  try {
    const publicKey = createPublicKey({
      format: "jwk",
      key: candidates[0],
    });
    const verified = verify(
      "sha256",
      Buffer.from(`${parts[0]}.${parts[1]}`, "utf8"),
      algorithm === "ES256"
        ? { key: publicKey, dsaEncoding: "ieee-p1363" }
        : publicKey,
      Buffer.from(parts[2], "base64url"),
    );
    return verified
      ? { ok: true, header: decoded.header, claims: decoded.claims }
      : { ok: false, reason: "signature" };
  } catch {
    return { ok: false, reason: "signature" };
  }
}
