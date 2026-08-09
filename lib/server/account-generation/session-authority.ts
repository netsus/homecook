import { createHmac } from "node:crypto";

import {
  getAuthAuthority,
  getRemoteAuthIssuer,
} from "@/lib/supabase/auth-env";
import { createSessionAuthorityInternalRpcClient } from "@/lib/supabase/server";
import { createSessionKeyHash } from
  "@/lib/server/hybrid-auth/session-authority";
import {
  prepareFullLocalSessionAuthority,
  readFullLocalSessionControl,
} from "@/lib/server/full-local-auth/session-authority";

import { verifyAccountDeleteReplayJwt } from "./jwt-replay";

const ALLOWLISTED_SESSION_JWT_ALGS = ["ES256", "RS256"] as const;
const ROLE_AUTHENTICATED = "authenticated";

const SESSION_HMAC_SECRET_ENV = "HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1";
const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type AllowlistedJwtAlg = (typeof ALLOWLISTED_SESSION_JWT_ALGS)[number];

const NUMBER_KEYS = ["iat", "exp"] as const;

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

function readSessionGenerationHmacSecret(keyVersion: number) {
  if (!Number.isSafeInteger(keyVersion) || keyVersion <= 0) {
    return null;
  }
  const secret = process.env[
    `HOMECOOK_SESSION_GENERATION_HMAC_KEY_V${keyVersion}`
  ]?.trim() ?? "";
  return Buffer.byteLength(secret, "utf8") >= 32 ? secret : null;
}

async function readCurrentFullLocalSessionContext() {
  if (getAuthAuthority() !== "local") {
    return { mode: "non-local" as const };
  }
  const client = createSessionAuthorityInternalRpcClient();
  if (!client) {
    return { mode: "local-failed" as const };
  }
  const controlResult = await readFullLocalSessionControl(client);
  if (!controlResult.ok) {
    return { mode: "local-failed" as const };
  }
  const secret = readSessionGenerationHmacSecret(
    controlResult.control.hmac_key_version,
  );
  if (!secret) {
    return { mode: "local-failed" as const };
  }
  return {
    mode: "local-ok" as const,
    client,
    control: controlResult.control,
    secret,
  };
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
  const notBefore = claimsRecord?.nbf ?? claimsRecord?.iat;
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
    || !Number.isSafeInteger(notBefore as number | undefined)
    || Number(claimsRecord.iat) <= 0
    || Number(notBefore) - 30 > nowSeconds
    || Number(claimsRecord.exp) <= nowSeconds
    || Number(claimsRecord.iat) > nowSeconds + 60
    || Number(claimsRecord.iat) >= Number(claimsRecord.exp)
    || Number(notBefore) >= Number(claimsRecord.exp)
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
    sessionKeyHash: createSessionKeyHash({
      secret,
      keyVersion: 1,
      issuer: String(claims?.iss),
      ownerUuid: input.user.id,
      sessionId: sessionId as string,
      identityCreatedAt: input.user.created_at,
    }),
    hmacKeyVersion: 1,
  };
}

export async function readVerifiedAccountGenerationSession(
  routeClient: AccountGenerationRouteAuthClient,
  liveVerifiedUser?: VerifiedAuthUser,
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

    let user = liveVerifiedUser;
    if (!user) {
      const userResult = await routeClient.auth.getUser(accessToken);
      user = userResult.data.user ?? undefined;
      if (userResult.error || !user) {
        return { ok: false };
      }
    }

    if (getAuthAuthority() === "local") {
      const client = createSessionAuthorityInternalRpcClient();
      if (!client) {
        return { ok: false };
      }
      const prepared = await prepareFullLocalSessionAuthority({
        accessToken,
        client,
        user,
      });
      return prepared.ok
        ? {
            ok: true,
            sessionAuthority: prepared.accountBootstrap,
          }
        : { ok: false };
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

    const localContext = await readCurrentFullLocalSessionContext();
    if (localContext.mode === "local-failed") {
      return { ok: false };
    }

    const keyVersion = localContext.mode === "local-ok"
      ? localContext.control.hmac_key_version
      : 1;
    const secret = localContext.mode === "local-ok"
      ? localContext.secret
      : readSessionGenerationHmacSecret(1);
    if (!secret) {
      return { ok: false };
    }

    return {
      ok: true,
      sessionAuthority: {
        ownerUuid: verification.claims.ownerUuid,
        sessionKeyHash: createHmac("sha256", secret)
          .update(verification.claims.sessionId, "utf8")
          .digest("hex"),
        hmacKeyVersion: keyVersion,
      },
    };
  } catch {
    return { ok: false };
  }
}
