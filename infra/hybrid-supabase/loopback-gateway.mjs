#!/usr/bin/env node

import {
  createHash,
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify,
} from "node:crypto";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import {
  isAnonymousHybridPublicReadRequest,
} from "../../lib/server/hybrid-auth/public-read-policy-runtime.mjs";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALGORITHMS = new Set(["ES256", "RS256"]);
const MAX_JWKS_BYTES = 1_048_576;
const INTERNAL_SCOPE_RULES = Object.freeze({
  "auth-callback": {
    methods: new Set(["POST"]),
    paths: new Set([
      "/rest/v1/rpc/record_hybrid_remote_session_authority",
      "/rest/v1/rpc/get_account_generation_capability",
      "/rest/v1/rpc/bootstrap_account_generation_identity",
    ]),
  },
  "auth-refresh": {
    methods: new Set(["POST"]),
    paths: new Set([
      "/rest/v1/rpc/record_hybrid_remote_session_authority",
    ]),
  },
  "session-logout": {
    methods: new Set(["POST"]),
    paths: new Set([
      "/rest/v1/rpc/revoke_hybrid_remote_session_authority",
    ]),
  },
  "account-lifecycle": {
    methods: new Set(["POST"]),
    paths: new Set([
      "/rest/v1/rpc/get_account_generation_capability",
      "/rest/v1/rpc/bootstrap_account_generation_identity",
      "/rest/v1/rpc/initiate_account_generation_delete",
      "/rest/v1/rpc/replay_account_generation_delete",
      "/rest/v1/rpc/resolve_account_cutover_quarantine",
      "/rest/v1/rpc/delete_user_private_data_with_generation_receipt",
      "/rest/v1/rpc/start_legacy_external_write_attempt",
      "/rest/v1/rpc/finalize_legacy_external_write_attempt",
      "/rest/v1/operational_events",
    ]),
  },
  "recipe-image": {
    methods: new Set(["GET", "POST", "PUT", "DELETE"]),
    paths: new Set([
      "/rest/v1/rpc/cancel_recipe_image_upload",
      "/rest/v1/rpc/compensate_recipe_image_upload",
      "/rest/v1/rpc/finalize_recipe_image_upload",
      "/rest/v1/rpc/read_recipe_image_projections",
      "/rest/v1/rpc/reserve_recipe_image_upload",
      "/rest/v1/operational_events",
      "/storage/v1/object/recipe-images",
      "/storage/v1/object/recipe-images-private",
    ]),
    storagePrefixes: [
      "/storage/v1/object/recipe-images/",
      "/storage/v1/object/recipe-images-private/",
      "/storage/v1/object/info/recipe-images/",
      "/storage/v1/object/info/recipe-images-private/",
      "/storage/v1/object/sign/recipe-images/",
      "/storage/v1/object/sign/recipe-images-private/",
    ],
  },
  "request-authority": {
    methods: new Set(["POST"]),
    paths: new Set([
      "/rest/v1/rpc/assert_hybrid_remote_session_authority",
    ]),
  },
  "youtube-ingredient-registration": {
    methods: new Set(["POST"]),
    paths: new Set([
      "/rest/v1/rpc/register_youtube_ingredient",
    ]),
  },
});
const MAX_INTERNAL_BODY_BYTES = 1_048_576;

class AuthorityError extends Error {}
class UpstreamError extends Error {}

function requiredEnv(env, name) {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function timeoutSignal(timeoutMs) {
  return AbortSignal.timeout(timeoutMs);
}

/**
 * @param {Record<string, string | undefined>} env
 */
export function createGatewayConfig(env = process.env) {
  return {
    allowInsecureLocalAuthStub:
      String(env.ALLOW_INSECURE_LOCAL_AUTH_STUB ?? "") === "1",
    authUrl: requiredEnv(env, "AUTH_SUPABASE_URL").replace(/\/+$/, ""),
    issuer: requiredEnv(env, "AUTH_SUPABASE_EXPECTED_ISSUER"),
    jwksUrl: requiredEnv(env, "AUTH_SUPABASE_JWKS_URL"),
    authPublishableKey: requiredEnv(env, "AUTH_SUPABASE_PUBLISHABLE_KEY"),
    dataSecretKey: requiredEnv(env, "DATA_SUPABASE_SECRET_KEY"),
    postgrestUrl: requiredEnv(env, "POSTGREST_UPSTREAM_URL").replace(/\/+$/, ""),
    storageUrl: requiredEnv(env, "STORAGE_UPSTREAM_URL").replace(/\/+$/, ""),
    attestationSecret: requiredEnv(
      env,
      "HOMECOOK_SESSION_ATTESTATION_HMAC_KEY_V1",
    ),
    bindingSecret: requiredEnv(
      env,
      "HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1",
    ),
    upstreamTimeoutMs: Number(env.HYBRID_GATEWAY_TIMEOUT_MS ?? "3000"),
    port: Number(env.GATEWAY_PORT ?? "8080"),
  };
}

export function validateConfig(config) {
  const authUrl = new URL(config.authUrl);
  const issuer = new URL(config.issuer);
  const jwks = new URL(config.jwksUrl);
  const allowHttp = config.allowInsecureLocalAuthStub === true;
  if (
    (!allowHttp && authUrl.protocol !== "https:")
    || (allowHttp && !["http:", "https:"].includes(authUrl.protocol))
    || issuer.origin !== authUrl.origin
    || issuer.pathname !== "/auth/v1"
    || jwks.origin !== authUrl.origin
    || jwks.pathname !== "/auth/v1/.well-known/jwks.json"
    || jwks.search
    || jwks.hash
    || Buffer.byteLength(config.attestationSecret) < 32
    || Buffer.byteLength(config.bindingSecret) < 32
    || !Number.isFinite(config.upstreamTimeoutMs)
    || config.upstreamTimeoutMs < 100
  ) {
    throw new Error("Hybrid gateway authority configuration is invalid");
  }
}

function failAuthority() {
  throw new AuthorityError("ACCOUNT_SESSION_STALE");
}

function base64UrlJson(part) {
  try {
    const value = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      failAuthority();
    }
    return value;
  } catch {
    failAuthority();
  }
}

function validateJwks(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.keys)) {
    failAuthority();
  }
  const kids = new Set();
  for (const key of value.keys) {
    if (
      !key
      || typeof key !== "object"
      || typeof key.kid !== "string"
      || !key.kid
      || kids.has(key.kid)
      || !ALGORITHMS.has(key.alg)
      || (key.use !== undefined && key.use !== "sig")
      || key.d !== undefined
      || (key.alg === "ES256"
        && (
          key.kty !== "EC"
          || key.crv !== "P-256"
          || typeof key.x !== "string"
          || typeof key.y !== "string"
        ))
      || (key.alg === "RS256"
        && (
          key.kty !== "RSA"
          || typeof key.n !== "string"
          || typeof key.e !== "string"
        ))
    ) {
      failAuthority();
    }
    kids.add(key.kid);
  }
  if (kids.size === 0) {
    failAuthority();
  }
  return value.keys;
}

async function loadJwks({ config, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl(config.jwksUrl, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: timeoutSignal(config.upstreamTimeoutMs),
    });
  } catch {
    throw new UpstreamError("remote jwks unavailable");
  }
  if (response.status >= 500) {
    throw new UpstreamError("remote jwks unavailable");
  }
  if (!response.ok) {
    failAuthority();
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length === 0 || body.length > MAX_JWKS_BYTES) {
    failAuthority();
  }
  return validateJwks(base64UrlJson(body.toString("base64url")));
}

async function verifyAccessToken({ accessToken, config, fetchImpl }) {
  const parts = accessToken.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) {
    failAuthority();
  }
  const header = base64UrlJson(parts[0]);
  const claims = base64UrlJson(parts[1]);
  if (
    !ALGORITHMS.has(header.alg)
    || typeof header.kid !== "string"
    || !header.kid
  ) {
    failAuthority();
  }
  const keys = await loadJwks({ config, fetchImpl });
  const candidates = keys.filter(
    (key) => key.kid === header.kid && key.alg === header.alg,
  );
  if (candidates.length !== 1) {
    failAuthority();
  }
  let valid = false;
  try {
    const key = createPublicKey({ format: "jwk", key: candidates[0] });
    valid = verify(
      "sha256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      header.alg === "ES256"
        ? { key, dsaEncoding: "ieee-p1363" }
        : key,
      Buffer.from(parts[2], "base64url"),
    );
  } catch {
    failAuthority();
  }
  if (!valid) {
    failAuthority();
  }

  const now = Math.floor(Date.now() / 1_000);
  if (
    claims.iss !== config.issuer
    || claims.aud !== "authenticated"
    || claims.role !== "authenticated"
    || typeof claims.sub !== "string"
    || !UUID_PATTERN.test(claims.sub)
    || typeof claims.session_id !== "string"
    || !UUID_PATTERN.test(claims.session_id)
    || !Number.isSafeInteger(claims.iat)
    || !Number.isSafeInteger(claims.nbf)
    || !Number.isSafeInteger(claims.exp)
    || claims.iat > now + 60
    || claims.nbf > now + 60
    || claims.exp <= now
    || claims.iat >= claims.exp
    || claims.nbf >= claims.exp
  ) {
    failAuthority();
  }
  return { claims, now };
}

async function readRemoteUser({ accessToken, ownerUuid, config, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl(`${config.authUrl}/auth/v1/user`, {
      cache: "no-store",
      headers: {
        apikey: config.authPublishableKey,
        authorization: `Bearer ${accessToken}`,
      },
      signal: timeoutSignal(config.upstreamTimeoutMs),
    });
  } catch {
    throw new UpstreamError("remote auth unavailable");
  }
  if (response.status >= 500) {
    throw new UpstreamError("remote auth unavailable");
  }
  if (!response.ok) {
    failAuthority();
  }
  const user = await response.json().catch(failAuthority);
  if (
    user.id !== ownerUuid
    || typeof user.created_at !== "string"
    || !Number.isFinite(Date.parse(user.created_at))
  ) {
    failAuthority();
  }
  return new Date(user.created_at).toISOString();
}

function hmacHex(secret, value) {
  return createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

export function createAuthority({ claims, identityCreatedAt, now, config }) {
  const remoteVerifiedAt = new Date(now * 1_000).toISOString();
  const bindingExpiresAt = new Date(claims.exp * 1_000).toISOString();
  const sessionKeyHash = hmacHex(
    config.bindingSecret,
    [
      "v1",
      claims.iss,
      claims.sub,
      identityCreatedAt,
      claims.session_id,
    ].join("\n"),
  );
  const remoteIdentityDigest = createHash("sha256")
    .update([
      "v1",
      claims.iss,
      claims.sub,
      identityCreatedAt,
    ].join("\n"))
    .digest("hex");
  return {
    bindingExpiresAt,
    remoteIdentityDigest,
    remoteVerifiedAt,
    sessionKeyHash,
  };
}

export function buildBootstrapAuthorityRecord({
  claims,
  identityCreatedAt,
  now,
  config,
}) {
  const authority = createAuthority({
    claims,
    identityCreatedAt,
    now,
    config,
  });
  return {
    p_issuer: claims.iss,
    p_owner_uuid: claims.sub,
    p_identity_created_at: identityCreatedAt,
    p_remote_revision: now,
    p_remote_identity_digest: authority.remoteIdentityDigest,
    p_verified_at: authority.remoteVerifiedAt,
    p_evidence_revision: now,
    p_session_key_hash: authority.sessionKeyHash,
    p_hmac_key_version: 1,
    p_access_token_expires_at: new Date(claims.exp * 1_000).toISOString(),
    p_binding_expires_at: authority.bindingExpiresAt,
  };
}

function buildAssertAuthorityRecord({
  claims,
  identityCreatedAt,
  config,
}) {
  const authority = createAuthority({
    claims,
    identityCreatedAt,
    now: Math.floor(Date.now() / 1_000),
    config,
  });
  return {
    p_issuer: claims.iss,
    p_owner_uuid: claims.sub,
    p_identity_created_at: identityCreatedAt,
    p_session_key_hash: authority.sessionKeyHash,
    p_hmac_key_version: 1,
  };
}

async function assertAuthority({
  claims,
  identityCreatedAt,
  config,
  fetchImpl,
}) {
  const proof = systemAttestation({
    kind: "internal",
    scope: "request-authority",
    method: "POST",
    path: "/rpc/assert_hybrid_remote_session_authority",
    now: Math.floor(Date.now() / 1_000),
    config,
  });
  let response;
  try {
    response = await fetchImpl(
      `${config.postgrestUrl}/rpc/assert_hybrid_remote_session_authority`,
      {
        method: "POST",
        headers: {
          apikey: config.dataSecretKey,
          authorization: `Bearer ${config.dataSecretKey}`,
          "content-type": "application/json",
          "x-homecook-session-attestation": proof.payload,
          "x-homecook-session-attestation-signature": proof.signature,
        },
        body: JSON.stringify(
          buildAssertAuthorityRecord({
            claims,
            identityCreatedAt,
            config,
          }),
        ),
        signal: timeoutSignal(config.upstreamTimeoutMs),
      },
    );
  } catch {
    throw new UpstreamError("local authority unavailable");
  }
  if (!response.ok) {
    failAuthority();
  }
}

function attestation({
  method,
  path,
  claims,
  identityCreatedAt,
  now,
  sessionKeyHash,
  config,
}) {
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    method,
    path,
    issuer: claims.iss,
    owner_uuid: claims.sub,
    identity_created_at: identityCreatedAt,
    session_key_hash: sessionKeyHash,
    issued_at: now,
    expires_at: now + 30,
  })).toString("base64url");
  return {
    payload,
    signature: hmacHex(config.attestationSecret, payload),
  };
}

function writePublicError(response, status, code, message) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify({
    success: false,
    data: null,
    error: { code, message, fields: [] },
  }));
}

function readBearerToken(request) {
  const value = request.headers.authorization;
  if (typeof value !== "string" || !value.startsWith("Bearer ")) {
    return null;
  }
  return value.slice("Bearer ".length).trim();
}

function requireBearerToken(request) {
  const token = readBearerToken(request);
  if (!token) {
    failAuthority();
  }
  return token;
}

function hasExactDataSecret(value, config) {
  const actual = Buffer.from(value, "utf8");
  const expected = Buffer.from(config.dataSecretKey, "utf8");
  return actual.length === expected.length
    && timingSafeEqual(actual, expected);
}

function internalScope(request) {
  const value = request.headers["x-homecook-internal-scope"];
  return typeof value === "string" ? value : "";
}

function isExactInternalScopeRequest(scope, rule, method, pathname) {
  if (scope !== "recipe-image") {
    return rule.methods.has(method) && rule.paths.has(pathname);
  }
  if (pathname.startsWith("/rest/v1/")) {
    return method === "POST" && rule.paths.has(pathname);
  }
  if (
    pathname === "/storage/v1/object/recipe-images"
    || pathname === "/storage/v1/object/recipe-images-private"
  ) {
    return method === "DELETE";
  }
  if (
    pathname.startsWith("/storage/v1/object/recipe-images/")
    || pathname.startsWith("/storage/v1/object/recipe-images-private/")
  ) {
    return method === "POST" || method === "PUT";
  }
  if (
    pathname.startsWith("/storage/v1/object/info/recipe-images/")
    || pathname.startsWith("/storage/v1/object/info/recipe-images-private/")
  ) {
    return method === "GET";
  }
  if (
    pathname.startsWith("/storage/v1/object/sign/recipe-images/")
    || pathname.startsWith("/storage/v1/object/sign/recipe-images-private/")
  ) {
    return method === "POST";
  }
  return false;
}

function isInternalControlPlaneRequest(request, requestUrl, accessToken, config) {
  const scope = internalScope(request);
  const rule = INTERNAL_SCOPE_RULES[scope];
  const method = (request.method ?? "GET").toUpperCase();
  return Boolean(
    rule
    && requestUrl.search === ""
    && isExactInternalScopeRequest(
      scope,
      rule,
      method,
      requestUrl.pathname,
    )
    && hasExactDataSecret(accessToken, config),
  );
}

function anonymousScope(request) {
  const value = request.headers["x-homecook-public-read-scope"];
  return typeof value === "string" ? value : "";
}

function isAnonymousAllowedRequest(request, requestUrl, body) {
  const method = (request.method ?? "GET").toUpperCase();
  return (
    !readBearerToken(request)
    && requestUrl.pathname.startsWith("/rest/v1/")
    && isAnonymousHybridPublicReadRequest({
      scope: anonymousScope(request),
      method,
      path: requestUrl.pathname.slice("/rest/v1".length),
      search: requestUrl.search,
      body,
    })
  );
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.length;
    if (size > MAX_INTERNAL_BODY_BYTES) {
      failAuthority();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

function systemAttestation({ kind, scope, method, path, now, config }) {
  const payload = Buffer.from(JSON.stringify({
    version: 1,
    kind,
    scope,
    method,
    path,
    issued_at: now,
    expires_at: now + 30,
  })).toString("base64url");
  return {
    payload,
    signature: hmacHex(config.attestationSecret, payload),
  };
}

function forwardedHeaders(request, proof, accessToken) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (
      typeof value === "string"
      && ![
        "connection",
        "content-length",
        "host",
        "x-homecook-session-attestation",
        "x-homecook-session-attestation-signature",
      ].includes(name)
    ) {
      headers.set(name, value);
    }
  }
  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
  } else {
    headers.delete("authorization");
  }
  headers.set("x-homecook-session-attestation", proof.payload);
  headers.set(
    "x-homecook-session-attestation-signature",
    proof.signature,
  );
  return headers;
}

async function proxyInternalControlPlaneRequest(
  request,
  requestUrl,
  config,
  fetchImpl,
  accessToken,
  body,
) {
  const upstream = upstreamFor(requestUrl.pathname, config);
  if (!upstream) {
    failAuthority();
  }
  const method = (request.method ?? "GET").toUpperCase();
  const proof = systemAttestation({
    kind: "internal",
    scope: internalScope(request),
    method,
    path: upstream.authorityPath,
    now: Math.floor(Date.now() / 1_000),
    config,
  });
  let upstreamResponse;
  try {
    upstreamResponse = await fetchImpl(upstream.url, {
      method,
      headers: forwardedHeaders(request, proof, accessToken),
      body: ["GET", "HEAD"].includes(method) ? undefined : body,
      duplex: "half",
      signal: timeoutSignal(config.upstreamTimeoutMs),
    });
  } catch {
    throw new UpstreamError("local control plane unavailable");
  }
  return upstreamResponse;
}

function upstreamFor(pathname, config) {
  if (pathname === "/rest/v1" || pathname.startsWith("/rest/v1/")) {
    const authorityPath = pathname.slice("/rest/v1".length) || "/";
    return {
      authorityPath,
      url: `${config.postgrestUrl}${authorityPath}`,
    };
  }
  if (pathname === "/storage/v1" || pathname.startsWith("/storage/v1/")) {
    const authorityPath = pathname.slice("/storage/v1".length) || "/";
    return {
      authorityPath,
      url: `${config.storageUrl}${authorityPath}`,
    };
  }
  return null;
}

function forwardResponse(response, upstreamResponse) {
  const responseHeaders = Object.fromEntries(
    [...upstreamResponse.headers].filter(
      ([name]) => !["connection", "transfer-encoding"].includes(name),
    ),
  );
  response.writeHead(upstreamResponse.status, responseHeaders);
  if (upstreamResponse.body) {
    Readable.fromWeb(upstreamResponse.body).pipe(response);
  } else {
    response.end();
  }
}

/**
 * @param {{
 *   config?: ReturnType<typeof createGatewayConfig>,
 *   fetchImpl?: typeof globalThis.fetch,
 * }} [options]
 */
export function createGatewayRequestHandler({
  config,
  fetchImpl = globalThis.fetch,
} = {}) {
  const resolvedConfig = config ?? createGatewayConfig();
  validateConfig(resolvedConfig);

  return async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://gateway.internal");
      const upstream = upstreamFor(requestUrl.pathname, resolvedConfig);
      if (!upstream) {
        response.writeHead(404);
        response.end();
        return;
      }

      const method = (request.method ?? "GET").toUpperCase();
      const needsBufferedBody = !["GET", "HEAD"].includes(method)
        && (
          !readBearerToken(request)
          || hasExactDataSecret(readBearerToken(request) ?? "", resolvedConfig)
        );
      const bufferedBody = needsBufferedBody ? await readBody(request) : undefined;
      let parsedBody;
      if (bufferedBody?.length) {
        try {
          parsedBody = JSON.parse(bufferedBody.toString("utf8"));
        } catch {
          failAuthority();
        }
      }

      if (isAnonymousAllowedRequest(request, requestUrl, parsedBody)) {
        const proof = systemAttestation({
          kind: "anonymous",
          scope: anonymousScope(request),
          method,
          path: upstream.authorityPath,
          now: Math.floor(Date.now() / 1_000),
          config: resolvedConfig,
        });
        let anonymousResponse;
        try {
          anonymousResponse = await fetchImpl(`${upstream.url}${requestUrl.search}`, {
            method,
            headers: forwardedHeaders(request, proof, null),
            body: ["GET", "HEAD"].includes(method) ? undefined : bufferedBody,
            duplex: "half",
            signal: timeoutSignal(resolvedConfig.upstreamTimeoutMs),
          });
        } catch {
          throw new UpstreamError("local upstream unavailable");
        }
        forwardResponse(response, anonymousResponse);
        return;
      }

      const accessToken = requireBearerToken(request);
      if (isInternalControlPlaneRequest(request, requestUrl, accessToken, resolvedConfig)) {
        const upstreamResponse = await proxyInternalControlPlaneRequest(
          request,
          requestUrl,
          resolvedConfig,
          fetchImpl,
          accessToken,
          bufferedBody,
        );
        forwardResponse(response, upstreamResponse);
        return;
      }

      const { claims, now } = await verifyAccessToken({
        accessToken,
        config: resolvedConfig,
        fetchImpl,
      });
      const identityCreatedAt = await readRemoteUser({
        accessToken,
        ownerUuid: claims.sub,
        config: resolvedConfig,
        fetchImpl,
      });
      const authority = createAuthority({
        claims,
        identityCreatedAt,
        now,
        config: resolvedConfig,
      });
      await assertAuthority({
        claims,
        identityCreatedAt,
        config: resolvedConfig,
        fetchImpl,
      });
      const proof = attestation({
        method: (request.method ?? "GET").toUpperCase(),
        path: upstream.authorityPath,
        claims,
        identityCreatedAt,
        now,
        sessionKeyHash: authority.sessionKeyHash,
        config: resolvedConfig,
      });

      const headers = forwardedHeaders(request, proof, accessToken);

      let upstreamResponse;
      try {
        upstreamResponse = await fetchImpl(`${upstream.url}${requestUrl.search}`, {
          method: request.method,
          headers,
          body: ["GET", "HEAD"].includes(request.method ?? "")
            ? undefined
            : Readable.toWeb(request),
          duplex: "half",
          signal: timeoutSignal(resolvedConfig.upstreamTimeoutMs),
        });
      } catch {
        throw new UpstreamError("local upstream unavailable");
      }
      forwardResponse(response, upstreamResponse);
    } catch (error) {
      if (error instanceof UpstreamError) {
        writePublicError(
          response,
          503,
          "ACCOUNT_LIFECYCLE_MAINTENANCE",
          "잠시 후 다시 시도해 주세요.",
        );
        return;
      }
      writePublicError(
        response,
        409,
        "ACCOUNT_SESSION_STALE",
        "세션을 다시 확인해 주세요.",
      );
    }
  };
}

export function startGatewayServer(config = createGatewayConfig()) {
  const server = createServer(createGatewayRequestHandler({ config }));
  server.listen(config.port, "0.0.0.0");
  return server;
}

const launchedPath = process.argv[1]
  ? fileURLToPath(import.meta.url) === process.argv[1]
  : false;

if (launchedPath) {
  startGatewayServer();
}
