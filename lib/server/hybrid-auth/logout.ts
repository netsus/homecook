import {
  decodeRemoteJwt,
  validateRemoteJwtClaims,
} from "@/lib/server/hybrid-auth/jwt-guard";
import { createSessionLivenessBinding } from "@/lib/server/hybrid-auth/session-authority";
import { getAuthSupabaseEnv } from "@/lib/supabase/auth-env";
import { getDataAuthority } from "@/lib/supabase/data-env";
import { createDataServiceRoleClient } from "@/lib/supabase/server";

interface RemoteAuthSessionClient {
  auth: {
    getSession(): PromiseLike<{
      data: { session: { access_token?: string } | null };
      error: unknown;
    }>;
    getUser(accessToken: string): PromiseLike<{
      data: {
        user: { id?: string; created_at?: string } | null;
      };
      error: unknown;
    }>;
    signOut(options?: { scope?: "global" | "local" | "others" }): PromiseLike<{
      error: unknown;
    }>;
  };
}

export interface HybridLogoutFailure {
  code: "ACCOUNT_SESSION_STALE" | "INTERNAL_ERROR";
  message: string;
  status: 409 | 500;
}

export type HybridLogoutResult =
  | { ok: true }
  | { ok: false; error: HybridLogoutFailure };

export async function revokeCurrentHybridSessionAuthority(
  authClient: RemoteAuthSessionClient,
) {
  if (getDataAuthority() !== "local") {
    return { ok: true as const, skipped: true as const };
  }

  try {
    const sessionResult = await authClient.auth.getSession();
    const accessToken = sessionResult.data.session?.access_token?.trim();
    if (sessionResult.error || !accessToken) {
      return { ok: false as const };
    }
    const decoded = decodeRemoteJwt(accessToken);
    if (!decoded.ok) {
      return { ok: false as const };
    }
    const authEnv = getAuthSupabaseEnv();
    const claims = validateRemoteJwtClaims({
      claims: decoded.claims,
      expectedIssuer: authEnv.issuer,
    });
    if (!claims.ok) {
      return { ok: false as const };
    }
    const userResult = await authClient.auth.getUser(accessToken);
    const user = userResult.data.user;
    if (
      userResult.error
      || !user
      || user.id !== claims.claims.ownerUuid
      || typeof user.created_at !== "string"
    ) {
      return { ok: false as const };
    }

    const binding = createSessionLivenessBinding({
      secret:
        process.env.HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1?.trim() ?? "",
      keyVersion: 1,
      issuer: claims.claims.issuer,
      ownerUuid: claims.claims.ownerUuid,
      sessionId: claims.claims.sessionId,
      identityCreatedAt: user.created_at,
      remoteVerifiedAt: new Date().toISOString(),
      ttlSeconds: 1,
    });
    const authorityClient = createDataServiceRoleClient();
    if (!authorityClient) {
      return { ok: false as const };
    }
    const { data, error } = await authorityClient.rpc(
      "revoke_hybrid_remote_session_authority",
      {
        p_session_key_hash: binding.session_key_hash,
        p_hmac_key_version: binding.hmac_key_version,
      },
    );
    return error
      || typeof data !== "object"
      || data === null
      || (data as { revoked?: unknown }).revoked !== true
      ? { ok: false as const }
      : { ok: true as const, skipped: false as const };
  } catch {
    return { ok: false as const };
  }
}

export async function executeHybridLogout(
  authClient: RemoteAuthSessionClient,
): Promise<HybridLogoutResult> {
  const revokeResult = await revokeCurrentHybridSessionAuthority(authClient);
  if (!revokeResult.ok) {
    return {
      ok: false,
      error: {
        code: "ACCOUNT_SESSION_STALE",
        message: "세션을 다시 확인해 주세요.",
        status: 409,
      },
    };
  }

  try {
    const signOutResult = await authClient.auth.signOut({ scope: "local" });
    if (signOutResult.error) {
      return {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "로그아웃하지 못했어요.",
          status: 500,
        },
      };
    }
  } catch {
    return {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "로그아웃하지 못했어요.",
        status: 500,
      },
    };
  }

  return { ok: true };
}
