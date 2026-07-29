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
  };
}

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
    const { error } = await authorityClient.rpc(
      "revoke_hybrid_remote_session_authority",
      {
        p_session_key_hash: binding.session_key_hash,
        p_hmac_key_version: binding.hmac_key_version,
      },
    );
    return error
      ? { ok: false as const }
      : { ok: true as const, skipped: false as const };
  } catch {
    return { ok: false as const };
  }
}
