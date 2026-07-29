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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALGORITHMS = new Set(["ES256", "RS256"]);
const MAX_JWKS_BYTES = 1_048_576;
const INTERNAL_CONTROL_PLANE_RPC_PATHS = new Set([
  "/rest/v1/rpc/record_hybrid_remote_session_authority",
  "/rest/v1/rpc/revoke_hybrid_remote_session_authority",
]);

class AuthorityError extends Error {}
class UpstreamError extends Error {}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const config = {
  authUrl: requiredEnv("AUTH_SUPABASE_URL").replace(/\/+$/, ""),
  issuer: requiredEnv("AUTH_SUPABASE_EXPECTED_ISSUER"),
  jwksUrl: requiredEnv("AUTH_SUPABASE_JWKS_URL"),
  authPublishableKey: requiredEnv("AUTH_SUPABASE_PUBLISHABLE_KEY"),
  dataSecretKey: requiredEnv("DATA_SUPABASE_SECRET_KEY"),
  postgrestUrl: requiredEnv("POSTGREST_UPSTREAM_URL").replace(/\/+$/, ""),
  storageUrl: requiredEnv("STORAGE_UPSTREAM_URL").replace(/\/+$/, ""),
  attestationSecret: requiredEnv(
    "HOMECOOK_SESSION_ATTESTATION_HMAC_KEY_V1",
  ),
  bindingSecret: requiredEnv("HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1"),
};

function validateConfig() {
  const authUrl = new URL(config.authUrl);
  const issuer = new URL(config.issuer);
  const jwks = new URL(config.jwksUrl);
  if (
    authUrl.protocol !== "https:"
    || issuer.origin !== authUrl.origin
    || issuer.pathname !== "/auth/v1"
    || jwks.origin !== authUrl.origin
    || jwks.pathname !== "/auth/v1/.well-known/jwks.json"
    || jwks.search
    || jwks.hash
    || Buffer.byteLength(config.attestationSecret) < 32
    || Buffer.byteLength(config.bindingSecret) < 32
  ) {
    throw new Error("Hybrid gateway authority configuration is invalid");
  }
}

validateConfig();

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

async function loadJwks() {
  let response;
  try {
    response = await fetch(config.jwksUrl, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    failAuthority();
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

async function verifyAccessToken(accessToken) {
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
  const keys = await loadJwks();
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

async function readRemoteUser(accessToken, ownerUuid) {
  let response;
  try {
    response = await fetch(`${config.authUrl}/auth/v1/user`, {
      cache: "no-store",
      headers: {
        apikey: config.authPublishableKey,
        authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    failAuthority();
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

function createAuthority({ claims, identityCreatedAt, now }) {
  const remoteVerifiedAt = new Date(now * 1_000).toISOString();
  const bindingExpiresAt = new Date((now + 120) * 1_000).toISOString();
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

async function persistAuthority({
  claims,
  identityCreatedAt,
  now,
  authority,
}) {
  let response;
  try {
    response = await fetch(
      `${config.postgrestUrl}/rpc/record_hybrid_remote_session_authority`,
      {
        method: "POST",
        headers: {
          apikey: config.dataSecretKey,
          authorization: `Bearer ${config.dataSecretKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          p_issuer: claims.iss,
          p_owner_uuid: claims.sub,
          p_identity_created_at: identityCreatedAt,
          p_remote_revision: now,
          p_remote_identity_digest: authority.remoteIdentityDigest,
          p_verified_at: authority.remoteVerifiedAt,
          p_evidence_revision: now,
          p_session_key_hash: authority.sessionKeyHash,
          p_hmac_key_version: 1,
          p_binding_expires_at: authority.bindingExpiresAt,
        }),
        signal: AbortSignal.timeout(3_000),
      },
    );
  } catch {
    failAuthority();
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

function bearerToken(request) {
  const value = request.headers.authorization;
  if (typeof value !== "string" || !value.startsWith("Bearer ")) {
    failAuthority();
  }
  return value.slice("Bearer ".length).trim();
}

function hasExactDataSecret(value) {
  const actual = Buffer.from(value, "utf8");
  const expected = Buffer.from(config.dataSecretKey, "utf8");
  return actual.length === expected.length
    && timingSafeEqual(actual, expected);
}

function isInternalControlPlaneRequest(request, requestUrl, accessToken) {
  return request.method === "POST"
    && requestUrl.search === ""
    && INTERNAL_CONTROL_PLANE_RPC_PATHS.has(requestUrl.pathname)
    && hasExactDataSecret(accessToken);
}

async function proxyInternalControlPlaneRequest(
  request,
  response,
  requestUrl,
) {
  const upstreamPath = requestUrl.pathname.slice("/rest/v1".length);
  let upstreamResponse;
  try {
    upstreamResponse = await fetch(`${config.postgrestUrl}${upstreamPath}`, {
      method: "POST",
      headers: {
        apikey: config.dataSecretKey,
        authorization: `Bearer ${config.dataSecretKey}`,
        "content-type":
          request.headers["content-type"] ?? "application/json",
      },
      body: Readable.toWeb(request),
      duplex: "half",
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    throw new UpstreamError("local control plane unavailable");
  }

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

function upstreamFor(pathname) {
  if (pathname === "/rest/v1" || pathname.startsWith("/rest/v1/")) {
    const authorityPath = pathname.slice("/rest/v1".length) || "/";
    return {
      authorityPath,
      url: `${config.postgrestUrl}${authorityPath}`,
    };
  }
  if (pathname === "/storage/v1" || pathname.startsWith("/storage/v1/")) {
    return {
      authorityPath: pathname,
      url: `${config.storageUrl}${pathname.slice("/storage/v1".length) || "/"}`,
    };
  }
  return null;
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", "http://gateway.internal");
    const upstream = upstreamFor(requestUrl.pathname);
    if (!upstream) {
      response.writeHead(404);
      response.end();
      return;
    }
    const accessToken = bearerToken(request);
    if (isInternalControlPlaneRequest(request, requestUrl, accessToken)) {
      await proxyInternalControlPlaneRequest(request, response, requestUrl);
      return;
    }
    const { claims, now } = await verifyAccessToken(accessToken);
    const identityCreatedAt = await readRemoteUser(accessToken, claims.sub);
    const authority = createAuthority({
      claims,
      identityCreatedAt,
      now,
    });
    await persistAuthority({
      claims,
      identityCreatedAt,
      now,
      authority,
    });
    const proof = attestation({
      method: (request.method ?? "GET").toUpperCase(),
      path: upstream.authorityPath,
      claims,
      identityCreatedAt,
      now,
      sessionKeyHash: authority.sessionKeyHash,
    });

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
    headers.set("authorization", `Bearer ${accessToken}`);
    headers.set("x-homecook-session-attestation", proof.payload);
    headers.set(
      "x-homecook-session-attestation-signature",
      proof.signature,
    );

    let upstreamResponse;
    try {
      upstreamResponse = await fetch(`${upstream.url}${requestUrl.search}`, {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method ?? "")
          ? undefined
          : Readable.toWeb(request),
        duplex: "half",
      });
    } catch {
      throw new UpstreamError("local upstream unavailable");
    }
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
});

server.listen(Number(process.env.GATEWAY_PORT ?? "8080"), "0.0.0.0");
