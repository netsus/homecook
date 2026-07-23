import { createHmac } from "node:crypto";

import { verifyAccountDeleteReplayJwt } from "./jwt-replay";

const SESSION_HMAC_SECRET_ENV = "HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1";
const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function readProjectIssuer() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!configuredUrl) {
    return null;
  }

  try {
    return `${new URL(configuredUrl).origin}/auth/v1`;
  } catch {
    return null;
  }
}

export function deriveVerifiedAccountGenerationSessionAuthority(input: {
  accessToken: string;
  user: VerifiedAuthUser;
}): AccountGenerationBootstrapSessionAuthority | null {
  const secret = process.env[SESSION_HMAC_SECRET_ENV]?.trim() ?? "";
  if (Buffer.byteLength(secret, "utf8") < 32) {
    return null;
  }

  const claims = decodeJwtPayload(input.accessToken);
  const expectedIssuer = readProjectIssuer();
  const sessionId = claims?.session_id;
  const issuedAt = claims?.iat;
  const expiresAt = claims?.exp;
  const nowSeconds = Math.floor(Date.now() / 1_000);
  if (
    !expectedIssuer
    || claims?.iss !== expectedIssuer
    || claims?.aud !== "authenticated"
    || claims?.sub !== input.user.id
    || typeof sessionId !== "string"
    || !UUID_PATTERN.test(sessionId)
    || !Number.isSafeInteger(issuedAt)
    || Number(issuedAt) <= 0
    || Number(issuedAt) > nowSeconds + 60
    || !Number.isSafeInteger(expiresAt)
    || Number(expiresAt) <= nowSeconds
    || Number(issuedAt) >= Number(expiresAt)
    || !UUID_PATTERN.test(input.user.id)
    || !Number.isFinite(Date.parse(input.user.created_at))
  ) {
    return null;
  }

  return {
    ownerUuid: input.user.id,
    authIdentityCreatedAt: input.user.created_at,
    sessionIssuedAt: new Date(Number(issuedAt) * 1_000).toISOString(),
    sessionKeyHash: createHmac("sha256", secret)
      .update(sessionId, "utf8")
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
