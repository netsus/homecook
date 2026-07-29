import {
  validateRemoteJwtClaims,
  verifyRemoteJwtSignature,
} from "./jwt-guard";
import {
  createHybridRequestAttestation,
  createRemoteIdentityDigest,
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

function failClosed(): never {
  throw new HybridSessionAuthorityError();
}

function downstreamAuthorityPath(pathname: string) {
  if (pathname === "/rest/v1") {
    return "/";
  }
  if (pathname.startsWith("/rest/v1/")) {
    return pathname.slice("/rest/v1".length);
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
    });
  } catch {
    failClosed();
  }

  if (!response.ok) {
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
  const response = await fetch(
    `${auth.issuer}/.well-known/jwks.json`,
    {
      cache: "no-store",
      headers: { accept: "application/json" },
      method: "GET",
      signal: AbortSignal.timeout(3_000),
    },
  );
  if (!response.ok) {
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
  persistSessionAuthority,
  auth,
  attestationSecret,
  sessionBindingSecret,
  nowSeconds = () => Math.floor(Date.now() / 1_000),
}: {
  getAccessToken: () => Promise<string | null>;
  remoteLivenessFetch?: typeof globalThis.fetch;
  localUpstreamFetch?: typeof globalThis.fetch;
  loadRemoteJwks?: () => Promise<unknown>;
  persistSessionAuthority: (input: {
    binding: ReturnType<typeof createSessionLivenessBinding>;
    remoteIdentityDigest: string;
    remoteRevision: number;
    evidenceRevision: number;
  }) => Promise<void>;
  auth: RemoteAuthGatewayEnv;
  attestationSecret: string;
  sessionBindingSecret: string;
  nowSeconds?: () => number;
}): typeof globalThis.fetch {
  return async (input, init) => {
    const accessToken = (await getAccessToken())?.trim();
    if (!accessToken) {
      failClosed();
    }

    let jwks: unknown;
    try {
      jwks = loadRemoteJwks
        ? await loadRemoteJwks()
        : await readRemoteJwks({
            auth,
            fetch: remoteLivenessFetch,
          });
    } catch {
      failClosed();
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
    try {
      await persistSessionAuthority({
        binding,
        remoteIdentityDigest: createRemoteIdentityDigest({
          issuer: validated.claims.issuer,
          ownerUuid: validated.claims.ownerUuid,
          identityCreatedAt: remoteUser.createdAt,
        }),
        remoteRevision: now,
        evidenceRevision: now,
      });
    } catch {
      failClosed();
    }
    const request = new Request(input, init);
    const attestation = createHybridRequestAttestation({
      secret: attestationSecret,
      keyVersion: 1,
      method: request.method,
      path: downstreamAuthorityPath(new URL(request.url).pathname),
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

    return localUpstreamFetch(input, {
      ...init,
      headers,
      method: request.method,
    });
  };
}
