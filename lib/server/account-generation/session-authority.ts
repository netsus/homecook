import { createHmac } from "node:crypto";

import { getRemoteAuthIssuer } from "@/lib/supabase/auth-env";

import { verifyAccountDeleteReplayJwt } from "./jwt-replay";

const ALLOWLISTED_SESSION_JWT_ALGS = ["ES256", "RS256"] as const;
const ROLE_AUTHENTICATED = "authenticated";

const SESSION_HMAC_SECRET_ENV = "HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1";
const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type AllowlistedJwtAlg = (typeof ALLOWLISTED_SESSION_JWT_ALGS)[number];

const NUMBER_KEYS = ["iat", "nbf", "exp"] as const;

interface JwtClaims {
  iss?: unknown;
  aud?: unknown;
  role?: unknown;
  sub?: unknown;
  session_id?: unknown;
  iat?: unknown;
  nbf?: unknown;
  exp?: unknown;
}

interface JwtHeader {
  alg?: string;
  kid?: string;
}

interface VerifiedAuthUser {
  created_at: string;
  id: string;
}

interface AccountGenerationRouteAuthClient {
  auth: {
    getSession(): PromiseLike<{
      data: {
        session: {
          access_token: string;
        } | null;
      };
      error?: unknown;
    }>;
    getUser(accessToken: string): PromiseLike<{
      data: {
        user: VerifiedAuthUser | null;
      };
      error?: unknown;
    }>;
  };
}

export interface AccountGenerationSessionAuthority {
  ownerUuid: string;
  authIdentityCreatedAt: string;
  sessionKeyHash: string;
  hmacKeyVersion: number;
}

export interface AccountGenerationBootstrapSessionAuthority
  extends AccountGenerationSessionAuthority {
  sessionIssuedAt: string;
}

export interface AccountGenerationReplaySessionAuthority {
  ownerUuid: string;
  sessionKeyHash: string;
  hmacKeyVersion: number;
}

function decodeJwtPayload(accessToken: string) {
  const parts = accessToken.split(".");
  if (parts.length !== 3 || !parts[1]) {
    return null;
  }

  try {
    const value = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function decodeJwtHeader(accessToken: string) {
  const parts = accessToken.split(".");
  if (parts.length !== 3 || !parts[0]) {
    return null;
  }

  try {
    const value = JSON.parse(
      Buffer.from(parts[0], "base64url").toString("utf8"),
    ) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as JwtHeader
      : null;
  } catch {
    return null;
  }
}

function readProjectIssuer() {
  try {
    return getRemoteAuthIssuer();
  } catch {
    return null;
  }
}

export function hasRemoteAuthSessionClaimMatch(
  accessToken: string,
  userId: string,
): boolean {
  const claims = decodeJwtPayload(accessToken);
  const claimsRecord = claims as JwtClaims | null;
  const header = decodeJwtHeader(accessToken);
  const headerAlg = header?.alg;
  const sessionId = claimsRecord?.session_id;
  const nowSeconds = Math.floor(Date.now() / 1_000);
  if (
    !Number.isInteger(nowSeconds)
    || !claimsRecord
    || !headerAlg
    || !ALLOWLISTED_SESSION_JWT_ALGS.includes(headerAlg as AllowlistedJwtAlg)
    || typeof header?.kid !== "string"
    || header.kid.trim().length === 0
    || claimsRecord.iss !== readProjectIssuer()
    || claimsRecord.aud !== ROLE_AUTHENTICATED
    || claimsRecord.role !== ROLE_AUTHENTICATED
    || claimsRecord.sub !== userId
    || typeof sessionId !== "string"
    || !UUID_PATTERN.test(sessionId)
    || !NUMBER_KEYS.every(
      (key) => Number.isSafeInteger(claimsRecord?.[key] as number | undefined),
    )
    || Number(claimsRecord.iat) <= 0
    || Number(claimsRecord.nbf) - 30 > nowSeconds
    || Number(claimsRecord.exp) <= nowSeconds
    || Number(claimsRecord.iat) > nowSeconds + 60
    || Number(claimsRecord.iat) >= Number(claimsRecord.exp)
  ) {
    return false;
  }

  return true;
}

export function deriveVerifiedAccountGenerationSessionAuthority(input: {
  accessToken: string;
  user: VerifiedAuthUser;
}): AccountGenerationBootstrapSessionAuthority | null {
  const secret = process.env[SESSION_HMAC_SECRET_ENV]?.trim() ?? "";
  if (Buffer.byteLength(secret, "utf8") < 32) {
    return null;
  }

  if (
    !hasRemoteAuthSessionClaimMatch(input.accessToken, input.user.id)
    || !UUID_PATTERN.test(input.user.id)
    || !Number.isFinite(Date.parse(input.user.created_at))
  ) {
    return null;
  }

  const claims = decodeJwtPayload(input.accessToken) as JwtClaims | null;
  const issuedAt = claims?.iat;
  const sessionId = claims?.session_id;

  return {
    ownerUuid: input.user.id,
    authIdentityCreatedAt: input.user.created_at,
    sessionIssuedAt: new Date(Number(issuedAt) * 1_000).toISOString(),
    sessionKeyHash: createHmac("sha256", secret)
      .update(sessionId as string, "utf8")
      .digest("hex"),
    hmacKeyVersion: 1,
  };
}

export async function readVerifiedAccountGenerationSession(
  routeClient: AccountGenerationRouteAuthClient,
): Promise<
  | {
      ok: true;
      sessionAuthority: AccountGenerationBootstrapSessionAuthority;
    }
  | {
      ok: false;
    }
> {
  try {
    const sessionResult = await routeClient.auth.getSession();
    const accessToken = sessionResult.data.session?.access_token;
    if (sessionResult.error || !accessToken) {
      return { ok: false };
    }

    const userResult = await routeClient.auth.getUser(accessToken);
    const user = userResult.data.user;
    if (userResult.error || !user) {
      return { ok: false };
    }

    const sessionAuthority = deriveVerifiedAccountGenerationSessionAuthority({
      accessToken,
      user,
    });
    return sessionAuthority
      ? { ok: true, sessionAuthority }
      : { ok: false };
  } catch {
    return { ok: false };
  }
}

export async function readVerifiedAccountGenerationReplaySession(
  routeClient: AccountGenerationRouteAuthClient,
): Promise<
  | {
      ok: true;
      sessionAuthority: AccountGenerationReplaySessionAuthority;
    }
  | {
      ok: false;
    }
> {
  const secret = process.env[SESSION_HMAC_SECRET_ENV]?.trim() ?? "";
  if (Buffer.byteLength(secret, "utf8") < 32) {
    return { ok: false };
  }

  try {
    const sessionResult = await routeClient.auth.getSession();
    const accessToken = sessionResult.data.session?.access_token;
    if (sessionResult.error || !accessToken) {
      return { ok: false };
    }

    const verification = await verifyAccountDeleteReplayJwt(accessToken);
    if (!verification.ok) {
      return { ok: false };
    }

    return {
      ok: true,
      sessionAuthority: {
        ownerUuid: verification.claims.ownerUuid,
        sessionKeyHash: createHmac("sha256", secret)
          .update(verification.claims.sessionId, "utf8")
          .digest("hex"),
        hmacKeyVersion: 1,
      },
    };
  } catch {
    return { ok: false };
  }
}
