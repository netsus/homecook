import { createServer } from "node:http";
import { isIP } from "node:net";

const host = "0.0.0.0";
const port = 8080;
const upstream = new URL(process.env.FULL_LOCAL_INTERNAL_GATEWAY_ORIGIN ?? "");
const publicAuth = new URL(process.env.FULL_LOCAL_PUBLIC_AUTH_URL ?? "");
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
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://auth-proxy.local");
  if (!url.pathname.startsWith("/auth/v1/")) {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  const target = new URL(`${url.pathname}${url.search}`, upstream);
  const headers = new Headers(request.headers);
  const peerAddress = request.socket.remoteAddress ?? "127.0.0.1";
  const cloudflareClientIp = headers.get("cf-connecting-ip")?.trim() ?? "";
  const verifiedClientIp = isLoopbackAddress(peerAddress) && isIP(cloudflareClientIp)
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
      body: ["GET", "HEAD"].includes(request.method ?? "GET") ? undefined : request,
      duplex: "half",
      headers,
      method: request.method,
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    response.writeHead(upstreamResponse.status, responseHeaders(upstreamResponse.headers));
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
