import {
  decodeRemoteJwt,
  validateRemoteJwtClaims,
} from "./jwt-guard";
import {
  createRemoteIdentityDigest,
  createSessionLivenessBinding,
} from "./session-authority";
import {
  HybridLifecycleMaintenanceError,
  HybridSessionAuthorityError,
  createHybridAuthorityErrorResponse,
} from "./gateway";

interface BootstrapDbClient {
  rpc(
    functionName: "record_hybrid_remote_session_authority",
    args: Record<string, unknown>,
  ): PromiseLike<{
    data?: unknown;
    error?: unknown;
  }>;
}

interface VerifiedRemoteUser {
  id: string;
  created_at: string;
}

interface RemoteRefreshAuthEnv {
  publishableKey: string;
  url: string;
}

export type HybridSessionAuthorityBootstrapResult =
  | { ok: true }
  | { ok: false; reason: "maintenance" | "stale" };

function boundedSignal(signal: AbortSignal | null | undefined, timeoutMs: number) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function bootstrapFailureReason(error: unknown): "maintenance" | "stale" {
  if (!error || typeof error !== "object") {
    return "stale";
  }
  const candidate = error as Record<string, unknown>;
  const detail = ["code", "message", "details", "hint"]
    .map((key) => candidate[key])
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  return detail.includes("ACCOUNT_LIFECYCLE_MAINTENANCE")
    ? "maintenance"
    : "stale";
}

function isExactRemoteRefreshRequest(request: Request, authUrl: string) {
  const expected = new URL("/auth/v1/token", `${authUrl.replace(/\/+$/u, "")}/`);
  const actual = new URL(request.url);

  return request.method === "POST"
    && actual.origin === expected.origin
    && actual.pathname === expected.pathname
    && actual.searchParams.get("grant_type") === "refresh_token";
}

function staleResponse() {
  return createHybridAuthorityErrorResponse(new HybridSessionAuthorityError());
}

function maintenanceResponse() {
  return createHybridAuthorityErrorResponse(
    new HybridLifecycleMaintenanceError(),
  );
}

export function createRemoteRefreshAuthorityFetch({
  auth,
  bootstrap,
  remoteFetch = globalThis.fetch,
  timeoutMs = 3_000,
}: {
  auth: RemoteRefreshAuthEnv;
  bootstrap: (input: {
    accessToken: string;
    user: VerifiedRemoteUser;
  }) => Promise<HybridSessionAuthorityBootstrapResult>;
  remoteFetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}): typeof globalThis.fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    if (!isExactRemoteRefreshRequest(request, auth.url)) {
      try {
        return await remoteFetch(input, {
          ...init,
          signal: boundedSignal(request.signal, timeoutMs),
        });
      } catch {
        return maintenanceResponse();
      }
    }

    let refreshResponse: Response;
    try {
      refreshResponse = await remoteFetch(input, {
        ...init,
        signal: boundedSignal(request.signal, timeoutMs),
      });
    } catch {
      return maintenanceResponse();
    }
    if (!refreshResponse.ok) {
      return refreshResponse.status >= 500
        ? maintenanceResponse()
        : staleResponse();
    }

    let accessToken: string;
    try {
      const refreshBody = await refreshResponse.clone().json() as {
        access_token?: unknown;
      };
      if (
        typeof refreshBody.access_token !== "string"
        || refreshBody.access_token.trim() === ""
      ) {
        return staleResponse();
      }
      accessToken = refreshBody.access_token;
    } catch {
      return staleResponse();
    }

    let userResponse: Response;
    try {
      userResponse = await remoteFetch(
        `${auth.url.replace(/\/+$/u, "")}/auth/v1/user`,
        {
          cache: "no-store",
          headers: {
            apikey: auth.publishableKey,
            Authorization: `Bearer ${accessToken}`,
          },
          method: "GET",
          signal: boundedSignal(request.signal, timeoutMs),
        },
      );
    } catch {
      return maintenanceResponse();
    }
    if (!userResponse.ok) {
      return userResponse.status >= 500
        ? maintenanceResponse()
        : staleResponse();
    }

    let user: VerifiedRemoteUser;
    try {
      const candidate = await userResponse.json() as Partial<VerifiedRemoteUser>;
      if (
        typeof candidate.id !== "string"
        || typeof candidate.created_at !== "string"
        || !Number.isFinite(Date.parse(candidate.created_at))
      ) {
        return staleResponse();
      }
      user = {
        id: candidate.id,
        created_at: new Date(candidate.created_at).toISOString(),
      };
    } catch {
      return staleResponse();
    }

    try {
      const result = await bootstrap({ accessToken, user });
      return result.ok
        ? refreshResponse
        : result.reason === "maintenance"
          ? maintenanceResponse()
          : staleResponse();
    } catch {
      return staleResponse();
    }
  };
}

export async function recordHybridSessionAuthorityBootstrap({
  accessToken,
  dbClient,
  expectedIssuer,
  nowSeconds = () => Math.floor(Date.now() / 1_000),
  sessionBindingSecret,
  user,
}: {
  accessToken: string;
  dbClient: BootstrapDbClient;
  expectedIssuer: string;
  nowSeconds?: () => number;
  sessionBindingSecret: string;
  user: VerifiedRemoteUser;
}): Promise<HybridSessionAuthorityBootstrapResult> {
  const decoded = decodeRemoteJwt(accessToken);
  if (!decoded.ok) {
    return { ok: false, reason: "stale" };
  }

  const now = nowSeconds();
  const validated = validateRemoteJwtClaims({
    claims: decoded.claims,
    expectedIssuer,
    nowSeconds: now,
  });
  if (
    !validated.ok
    || validated.claims.ownerUuid !== user.id
    || !Number.isFinite(Date.parse(user.created_at))
  ) {
    return { ok: false, reason: "stale" };
  }

  const identityCreatedAt = new Date(user.created_at).toISOString();
  const verifiedAt = new Date(now * 1_000).toISOString();
  const binding = createSessionLivenessBinding({
    secret: sessionBindingSecret,
    keyVersion: 1,
    issuer: validated.claims.issuer,
    ownerUuid: validated.claims.ownerUuid,
    sessionId: validated.claims.sessionId,
    identityCreatedAt,
    remoteVerifiedAt: verifiedAt,
    ttlSeconds: validated.claims.expiresAt - now,
  });
  const accessTokenExpiresAt =
    new Date(validated.claims.expiresAt * 1_000).toISOString();

  try {
    const result = await dbClient.rpc(
      "record_hybrid_remote_session_authority",
      {
        p_issuer: binding.issuer,
        p_owner_uuid: binding.owner_uuid,
        p_identity_created_at: binding.identity_created_at,
        p_remote_revision: now,
        p_remote_identity_digest: createRemoteIdentityDigest({
          issuer: binding.issuer,
          ownerUuid: binding.owner_uuid,
          identityCreatedAt: binding.identity_created_at,
        }),
        p_verified_at: binding.remote_verified_at,
        p_evidence_revision: now,
        p_session_key_hash: binding.session_key_hash,
        p_hmac_key_version: binding.hmac_key_version,
        p_access_token_expires_at: accessTokenExpiresAt,
        p_binding_expires_at: binding.binding_expires_at,
      },
    );
    return result.error
      ? { ok: false, reason: bootstrapFailureReason(result.error) }
      : { ok: true };
  } catch (error) {
    return { ok: false, reason: bootstrapFailureReason(error) };
  }
}
