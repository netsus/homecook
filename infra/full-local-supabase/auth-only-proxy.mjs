import { createServer } from "node:http";
import { isIP } from "node:net";
import { pathToFileURL } from "node:url";

const host = "0.0.0.0";
const port = 8080;
const defaultUpstream = new URL("http://api-gateway:8000");

const BLOCKED_PUBLIC_REQUESTS = Object.freeze([
  { method: "GET", url: "/rest/v1/" },
  { method: "POST", url: "/rest/v1/rpc/private_operation?probe=1" },
  { method: "DELETE", url: "/storage/v1/object/private/a" },
  { method: "GET", url: "/studio/" },
  { method: "GET", url: "/health" },
  { method: "GET", url: "/auth//v1/health" },
  { method: "GET", url: "/auth/v1//health" },
  { method: "GET", url: "/auth/v1/../../rest/v1/" },
  { method: "GET", url: "/auth/v1/../storage/v1/" },
  { method: "GET", url: "/auth%2fv1/health" },
  { method: "GET", url: "/%73torage/v1/object/a" },
  { method: "GET", url: "//postgrest:3000/rest/v1/" },
  { method: "GET", url: "/rest/v1/?next=/auth/v1/health" },
  { method: "GET", url: "/auth/v1" },
]);

const REQUIRED_PUBLIC_REQUESTS = Object.freeze([
  { method: "GET", url: "/auth/v1/health" },
  { method: "POST", url: "/auth/v1/token?grant_type=refresh_token" },
  { method: "OPTIONS", url: "/auth/v1/callback/" },
]);

function exactInternalGatewayOrigin(value) {
  const upstream = new URL(value ?? "");
  if (
    upstream.protocol !== "http:"
    || upstream.hostname !== "api-gateway"
    || !upstream.port
    || upstream.pathname !== "/"
    || upstream.search
    || upstream.hash
    || upstream.username
    || upstream.password
  ) {
    throw new Error(
      "FULL_LOCAL_INTERNAL_GATEWAY_ORIGIN must be an exact api-gateway HTTP origin.",
    );
  }
  return upstream;
}

function exactPublicAuthOrigin(value) {
  const publicAuth = new URL(value ?? "");
  if (
    publicAuth.protocol !== "https:"
    || publicAuth.pathname !== "/"
    || publicAuth.search
    || publicAuth.hash
    || publicAuth.username
    || publicAuth.password
  ) {
    throw new Error("FULL_LOCAL_PUBLIC_AUTH_URL must be an exact HTTPS origin.");
  }
  return publicAuth;
}

export function authOnlyUpstreamTarget(request, upstreamBase = defaultUpstream) {
  const rawTarget = request?.url;
  if (typeof rawTarget !== "string" || !rawTarget.startsWith("/")) {
    return null;
  }
  const rawPath = rawTarget.split(/[?#]/u, 1)[0];
  if (
    rawPath.startsWith("//")
    || rawPath.includes("//")
    || rawPath.includes("\\")
    || rawPath.includes("%")
    || rawPath.split("/").some((segment) => [".", ".."].includes(segment))
    || /[\u0000-\u001f\u007f]/u.test(rawPath)
    || !rawPath.startsWith("/auth/v1/")
  ) {
    return null;
  }
  const parsed = new URL(rawTarget, "http://auth-proxy.local");
  if (parsed.origin !== "http://auth-proxy.local") {
    return null;
  }
  return new URL(`${parsed.pathname}${parsed.search}`, upstreamBase);
}

export function assertAuthOnlyPublicRouteContract(matcher) {
  if (typeof matcher !== "function") {
    throw new Error("Auth-only public route matcher is required.");
  }
  for (const request of REQUIRED_PUBLIC_REQUESTS) {
    if (!matcher(request)) {
      throw new Error("Auth-only public route rejected an Auth request.");
    }
  }
  for (const request of BLOCKED_PUBLIC_REQUESTS) {
    if (matcher(request)) {
      throw new Error("Auth-only public route exposed a private service path.");
    }
  }
  return true;
}

function responseHeaders(source) {
  const headers = new Headers(source);
  headers.delete("connection");
  headers.delete("keep-alive");
  headers.delete("proxy-authenticate");
  headers.delete("proxy-authorization");
  headers.delete("te");
  headers.delete("trailer");
  headers.delete("transfer-encoding");
  headers.delete("upgrade");
  headers.set("cache-control", "no-store, max-age=0");
  headers.set("pragma", "no-cache");
  return Object.fromEntries(headers.entries());
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1"
    || address === "::1"
    || address === "::ffff:127.0.0.1";
}

export function startAuthOnlyProxy(environment = process.env) {
  const upstream = exactInternalGatewayOrigin(
    environment.FULL_LOCAL_INTERNAL_GATEWAY_ORIGIN,
  );
  const publicAuth = exactPublicAuthOrigin(
    environment.FULL_LOCAL_PUBLIC_AUTH_URL,
  );
  assertAuthOnlyPublicRouteContract((request) =>
    authOnlyUpstreamTarget(request, upstream) !== null,
  );

  return createServer(async (request, response) => {
    const target = authOnlyUpstreamTarget(request, upstream);
    if (!target) {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    const headers = new Headers(request.headers);
    const peerAddress = request.socket.remoteAddress ?? "127.0.0.1";
    const cloudflareClientIp = headers.get("cf-connecting-ip")?.trim() ?? "";
    const verifiedClientIp = isLoopbackAddress(peerAddress)
      && isIP(cloudflareClientIp)
      ? cloudflareClientIp
      : peerAddress;
    const connectionHeaders = (headers.get("connection") ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    for (const name of [
      ...connectionHeaders,
      "cf-connecting-ip",
      "connection",
      "forwarded",
      "host",
      "keep-alive",
      "proxy-authenticate",
      "proxy-authorization",
      "te",
      "trailer",
      "transfer-encoding",
      "upgrade",
      "via",
      "x-forwarded-for",
      "x-forwarded-host",
      "x-forwarded-port",
      "x-forwarded-proto",
      "x-real-ip",
    ]) {
      headers.delete(name);
    }
    headers.set("x-forwarded-for", verifiedClientIp);
    headers.set("x-forwarded-host", publicAuth.host);
    headers.set("x-forwarded-port", publicAuth.port || "443");
    headers.set("x-forwarded-proto", publicAuth.protocol.slice(0, -1));

    try {
      const upstreamResponse = await fetch(target, {
        body: ["GET", "HEAD"].includes(request.method ?? "GET")
          ? undefined
          : request,
        duplex: "half",
        headers,
        method: request.method,
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      });
      response.writeHead(
        upstreamResponse.status,
        responseHeaders(upstreamResponse.headers),
      );
      if (upstreamResponse.body) {
        for await (const chunk of upstreamResponse.body) {
          response.write(chunk);
        }
      }
      response.end();
    } catch {
      response.writeHead(502, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "auth_upstream_unavailable" }));
    }
  }).listen(port, host);
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startAuthOnlyProxy();
}
