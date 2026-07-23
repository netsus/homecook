import {
  createPublicKey,
  verify,
  type JsonWebKeyInput,
} from "node:crypto";

const ALLOWED_ALGORITHMS = new Set(["ES256", "RS256"] as const);
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_JWKS_BYTES = 1_048_576;
const MAX_TOKEN_BYTES = 16_384;
const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AllowedAlgorithm = "ES256" | "RS256";

interface JwtHeader {
  alg: AllowedAlgorithm;
  kid: string;
  typ: "JWT";
}

interface ReplayClaims {
  expiresAt: number;
  issuedAt: number;
  ownerUuid: string;
  sessionId: string;
}

export type AccountDeleteReplayJwtVerification =
  | {
      ok: true;
      claims: ReplayClaims;
    }
  | {
      ok: false;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function decodeJsonPart(part: string) {
  if (!BASE64URL_PATTERN.test(part)) {
    return null;
  }

  try {
    const value = JSON.parse(
      Buffer.from(part, "base64url").toString("utf8"),
    ) as unknown;
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function readHeader(value: Record<string, unknown>): JwtHeader | null {
  const algorithm = value.alg;
  if (
    typeof algorithm !== "string"
    || !ALLOWED_ALGORITHMS.has(algorithm as AllowedAlgorithm)
    || typeof value.kid !== "string"
    || value.kid.length === 0
    || value.typ !== "JWT"
  ) {
    return null;
  }

  return {
    alg: algorithm as AllowedAlgorithm,
    kid: value.kid,
    typ: "JWT",
  };
}

function readProjectOrigin() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!configuredUrl) {
    return null;
  }

  try {
    const url = new URL(configuredUrl);
    const isLoopbackHttp = url.protocol === "http:"
      && (url.hostname === "127.0.0.1"
        || url.hostname === "localhost"
        || url.hostname === "::1");
    if (url.protocol !== "https:" && !isLoopbackHttp) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function readClaims(
  value: Record<string, unknown>,
  projectOrigin: string,
  nowSeconds: number,
): ReplayClaims | null {
  if (
    value.iss !== `${projectOrigin}/auth/v1`
    || value.aud !== "authenticated"
    || typeof value.sub !== "string"
    || !UUID_PATTERN.test(value.sub)
    || typeof value.session_id !== "string"
    || !UUID_PATTERN.test(value.session_id)
    || !Number.isSafeInteger(value.iat)
    || Number(value.iat) <= 0
    || Number(value.iat) > nowSeconds + 60
    || !Number.isSafeInteger(value.exp)
    || Number(value.exp) <= nowSeconds
    || Number(value.iat) >= Number(value.exp)
  ) {
    return null;
  }

  return {
    expiresAt: Number(value.exp),
    issuedAt: Number(value.iat),
    ownerUuid: value.sub,
    sessionId: value.session_id,
  };
}

function isCompatibleJwk(
  value: Record<string, unknown>,
  header: JwtHeader,
) {
  if (
    value.kid !== header.kid
    || (value.alg !== undefined && value.alg !== header.alg)
    || (value.use !== undefined && value.use !== "sig")
    || (
      value.key_ops !== undefined
      && (
        !Array.isArray(value.key_ops)
        || !value.key_ops.every((operation) => typeof operation === "string")
        || !value.key_ops.includes("verify")
      )
    )
  ) {
    return false;
  }

  if (header.alg === "RS256") {
    return value.kty === "RSA"
      && typeof value.n === "string"
      && typeof value.e === "string";
  }

  return value.kty === "EC"
    && value.crv === "P-256"
    && typeof value.x === "string"
    && typeof value.y === "string";
}

async function fetchVerificationJwk(
  projectOrigin: string,
  header: JwtHeader,
) {
  const response = await fetch(
    `${projectOrigin}/auth/v1/.well-known/jwks.json`,
    {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    },
  );
  if (!response.ok) {
    return null;
  }

  const contentLength = response.headers.get("content-length");
  if (
    contentLength
    && (
      !/^\d+$/.test(contentLength)
      || Number(contentLength) > MAX_JWKS_BYTES
    )
  ) {
    return null;
  }

  const rawBody = await response.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_JWKS_BYTES) {
    return null;
  }

  const body = JSON.parse(rawBody) as unknown;
  if (!isRecord(body) || !Array.isArray(body.keys)) {
    return null;
  }

  const matchingKeys = body.keys.filter((key) => {
    return isRecord(key) && isCompatibleJwk(key, header);
  });
  return matchingKeys.length === 1
    ? matchingKeys[0] as JsonWebKeyInput["key"]
    : null;
}

export async function verifyAccountDeleteReplayJwt(
  accessToken: string,
  {
    nowSeconds = Math.floor(Date.now() / 1_000),
  }: {
    nowSeconds?: number;
  } = {},
): Promise<AccountDeleteReplayJwtVerification> {
  if (
    typeof accessToken !== "string"
    || Buffer.byteLength(accessToken, "utf8") > MAX_TOKEN_BYTES
    || !Number.isSafeInteger(nowSeconds)
    || nowSeconds <= 0
  ) {
    return { ok: false };
  }

  const parts = accessToken.split(".");
  if (
    parts.length !== 3
    || parts.some((part) => !part || !BASE64URL_PATTERN.test(part))
  ) {
    return { ok: false };
  }

  const headerValue = decodeJsonPart(parts[0]);
  const claimsValue = decodeJsonPart(parts[1]);
  const header = headerValue ? readHeader(headerValue) : null;
  const projectOrigin = readProjectOrigin();
  if (!header || !claimsValue || !projectOrigin) {
    return { ok: false };
  }

  const claims = readClaims(claimsValue, projectOrigin, nowSeconds);
  if (!claims) {
    return { ok: false };
  }

  try {
    const jwk = await fetchVerificationJwk(projectOrigin, header);
    if (!jwk) {
      return { ok: false };
    }

    const publicKey = createPublicKey({
      format: "jwk",
      key: jwk,
    });
    const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`, "utf8");
    const signature = Buffer.from(parts[2], "base64url");
    const isValid = header.alg === "RS256"
      ? verify("RSA-SHA256", signingInput, publicKey, signature)
      : verify(
          "sha256",
          signingInput,
          {
            key: publicKey,
            dsaEncoding: "ieee-p1363",
          },
          signature,
        );

    return isValid ? { ok: true, claims } : { ok: false };
  } catch {
    return { ok: false };
  }
}
