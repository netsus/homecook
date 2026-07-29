import {
  validateRemoteJwtClaims,
  verifyRemoteJwtSignature,
} from "./jwt-guard";
import { isAnonymousHybridPublicReadRequest } from "./public-read-policy";
import {
  createHybridRequestAttestation,
  createSessionLivenessBinding,
} from "./session-authority";

interface RemoteAuthGatewayEnv {
  issuer: string;
  url: string;
  publishableKey: string;
}

interface RemoteAuthUser {
  id?: unknown;
  created_at?: unknown;
}

export class HybridSessionAuthorityError extends Error {
  readonly publicCode = "ACCOUNT_SESSION_STALE";
  readonly publicStatus = 409;

  constructor() {
    super("Remote session authority verification failed");
    this.name = "HybridSessionAuthorityError";
  }
}

export class HybridLifecycleMaintenanceError extends Error {
  readonly publicCode = "ACCOUNT_LIFECYCLE_MAINTENANCE";
  readonly publicStatus = 503;

  constructor() {
    super("Hybrid local authority maintenance is required");
    this.name = "HybridLifecycleMaintenanceError";
  }
}

export const HYBRID_AUTHORITY_ERROR_HEADER
  = "x-homecook-hybrid-authority-error";

export function createHybridAuthorityMarker(
  error: HybridSessionAuthorityError | HybridLifecycleMaintenanceError,
) {
  return `HOMECOOK_HYBRID_AUTHORITY::${error.publicCode}::${error.publicStatus}`;
}

export function createHybridAuthorityErrorResponse(
  error: HybridSessionAuthorityError | HybridLifecycleMaintenanceError,
) {
  const marker = createHybridAuthorityMarker(error);
  return new Response(JSON.stringify({
    code: error.publicCode,
    message: marker,
    details: marker,
    hint: marker,
  }), {
    status: error.publicStatus,
    headers: {
      "content-type": "application/json",
      [HYBRID_AUTHORITY_ERROR_HEADER]: marker,
    },
  });
}

export function isHybridAuthorityFailureResponse(response: Response) {
  const marker = response.headers.get(HYBRID_AUTHORITY_ERROR_HEADER);
  return marker === "HOMECOOK_HYBRID_AUTHORITY::ACCOUNT_SESSION_STALE::409"
    || marker === "HOMECOOK_HYBRID_AUTHORITY::ACCOUNT_LIFECYCLE_MAINTENANCE::503";
}

function failClosed(): never {
  throw new HybridSessionAuthorityError();
}

function failMaintenance(): never {
  throw new HybridLifecycleMaintenanceError();
}

function toPublicAuthorityError(
  error: unknown,
): HybridSessionAuthorityError | HybridLifecycleMaintenanceError {
  return error instanceof HybridLifecycleMaintenanceError
    ? error
    : new HybridSessionAuthorityError();
}

function downstreamAuthorityPath(pathname: string) {
  if (pathname === "/rest/v1") {
    return "/";
  }
  if (pathname.startsWith("/rest/v1/")) {
    return pathname.slice("/rest/v1".length);
  }
  if (pathname === "/storage/v1") {
    return "/";
  }
  if (pathname.startsWith("/storage/v1/")) {
    return pathname.slice("/storage/v1".length);
  }
  return pathname;
}

async function readRemoteLiveUser({
  accessToken,
  auth,
  fetch,
}: {
  accessToken: string;
  auth: RemoteAuthGatewayEnv;
  fetch: typeof globalThis.fetch;
}) {
  let response: Response;
  try {
    response = await fetch(`${auth.url}/auth/v1/user`, {
      cache: "no-store",
      headers: {
        apikey: auth.publishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
      method: "GET",
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    failMaintenance();
  }

  if (!response.ok) {
    if (response.status >= 500) {
      failMaintenance();
    }
    failClosed();
  }

  let user: RemoteAuthUser;
  try {
    user = await response.json() as RemoteAuthUser;
  } catch {
    failClosed();
  }

  if (
    typeof user.id !== "string"
    || typeof user.created_at !== "string"
    || !Number.isFinite(Date.parse(user.created_at))
  ) {
    failClosed();
  }

  return {
    id: user.id,
    createdAt: new Date(user.created_at).toISOString(),
  };
}

async function readRemoteJwks({
  auth,
  fetch,
}: {
  auth: RemoteAuthGatewayEnv;
  fetch: typeof globalThis.fetch;
}) {
  let response: Response;
  try {
    response = await fetch(
      `${auth.issuer}/.well-known/jwks.json`,
      {
        cache: "no-store",
        headers: { accept: "application/json" },
        method: "GET",
        signal: AbortSignal.timeout(3_000),
      },
    );
  } catch {
    failMaintenance();
  }

  if (!response.ok) {
    if (response.status >= 500) {
      failMaintenance();
    }
    failClosed();
  }
  const body = await response.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > 1_048_576) {
    failClosed();
  }

  try {
    return JSON.parse(Buffer.from(body).toString("utf8")) as unknown;
  } catch {
    failClosed();
  }
}

export function createHybridAuthorityFetch({
  getAccessToken,
  remoteLivenessFetch = globalThis.fetch,
  localUpstreamFetch = globalThis.fetch,
  loadRemoteJwks,
  assertSessionAuthority,
  auth,
  attestationSecret,
  sessionBindingSecret,
  nowSeconds = () => Math.floor(Date.now() / 1_000),
}: {
  getAccessToken: () => Promise<string | null>;
  remoteLivenessFetch?: typeof globalThis.fetch;
  localUpstreamFetch?: typeof globalThis.fetch;
  loadRemoteJwks?: () => Promise<unknown>;
  assertSessionAuthority: (input: {
    binding: ReturnType<typeof createSessionLivenessBinding>;
  }) => Promise<void>;
  auth: RemoteAuthGatewayEnv;
  attestationSecret: string;
  sessionBindingSecret: string;
  nowSeconds?: () => number;
}): typeof globalThis.fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const authorityPath = downstreamAuthorityPath(new URL(request.url).pathname);
    const accessToken = (await getAccessToken())?.trim();

    if (!accessToken) {
      if (isAnonymousHybridPublicReadRequest({
        method: request.method,
        path: authorityPath,
      })) {
        const headers = new Headers(request.headers);
        headers.delete("authorization");
        headers.delete("x-homecook-session-attestation");
        headers.delete("x-homecook-session-attestation-signature");

        try {
          return await localUpstreamFetch(input, {
            ...init,
            headers,
            method: request.method,
          });
        } catch {
          return createHybridAuthorityErrorResponse(
            new HybridLifecycleMaintenanceError(),
          );
        }
      }

      return createHybridAuthorityErrorResponse(
        new HybridSessionAuthorityError(),
      );
    }

    try {
      let jwks: unknown;
      try {
        jwks = loadRemoteJwks
          ? await loadRemoteJwks()
          : await readRemoteJwks({
              auth,
              fetch: remoteLivenessFetch,
            });
      } catch (error) {
        throw toPublicAuthorityError(error);
      }
      const decoded = verifyRemoteJwtSignature({ accessToken, jwks });
      if (!decoded.ok) {
        failClosed();
      }
      const now = nowSeconds();
      const validated = validateRemoteJwtClaims({
        claims: decoded.claims,
        expectedIssuer: auth.issuer,
        nowSeconds: now,
      });
      if (!validated.ok) {
        failClosed();
      }

      const remoteUser = await readRemoteLiveUser({
        accessToken,
        auth,
        fetch: remoteLivenessFetch,
      });
      if (remoteUser.id !== validated.claims.ownerUuid) {
        failClosed();
      }

      const binding = createSessionLivenessBinding({
        secret: sessionBindingSecret,
        keyVersion: 1,
        issuer: validated.claims.issuer,
        ownerUuid: validated.claims.ownerUuid,
        sessionId: validated.claims.sessionId,
        identityCreatedAt: remoteUser.createdAt,
        remoteVerifiedAt: new Date(now * 1_000).toISOString(),
        ttlSeconds: 120,
      });

      await assertSessionAuthority({
        binding,
      });

      const attestation = createHybridRequestAttestation({
        secret: attestationSecret,
        keyVersion: 1,
        method: request.method,
        path: authorityPath,
        issuer: validated.claims.issuer,
        ownerUuid: validated.claims.ownerUuid,
        identityCreatedAt: remoteUser.createdAt,
        sessionKeyHash: binding.session_key_hash,
        issuedAtSeconds: now,
        ttlSeconds: 30,
      });
      const headers = new Headers(request.headers);
      headers.set("Authorization", `Bearer ${accessToken}`);
      headers.set(
        "x-homecook-session-attestation",
        attestation.payload,
      );
      headers.set(
        "x-homecook-session-attestation-signature",
        attestation.signature,
      );

      try {
        return await localUpstreamFetch(input, {
          ...init,
          headers,
          method: request.method,
        });
      } catch {
        failMaintenance();
      }
    } catch (error) {
      return createHybridAuthorityErrorResponse(
        toPublicAuthorityError(error),
      );
    }
  };
}
