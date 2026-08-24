import { createClient } from "@supabase/supabase-js";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { describe, expect, it, vi } from "vitest";

import { createHybridRequestAttestation } from "../lib/server/hybrid-auth/session-authority";
import {
  classifyStage4DataUpstreamFailure,
  closeStage4GuardedDataProxy,
  resolveStage4GuardedDataProxyTarget,
  startStage4GuardedDataProxy,
} from "../scripts/lib/cooking-meal-log-stage4-isolated.mjs";

const proxyUrl = "http://127.0.0.1:4313";
const rawDataUrl = "http://127.0.0.1:4314";
const storageUrl = "http://127.0.0.1:58101";
const attestationSecret = "stage4-test-attestation-secret-0123456789";

async function listenLoopbackServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
) {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("test server address unavailable");
  }
  return {
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    },
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

describe("cooking meal-log Stage 4 guarded Data prefix proxy", () => {
  it("classifies upstream failures without retaining provider payload", () => {
    const sentinel = "owner@example.invalid 00000000-0000-4000-8000-000000000001 secret-token";
    expect(classifyStage4DataUpstreamFailure({
      body: JSON.stringify({
        code: "55000",
        message: `ACCOUNT_SESSION_STALE ${sentinel}`,
      }),
      status: 500,
    })).toEqual({
      category: "ACCOUNT_SESSION_STALE",
      provider_code: "55000",
      status: 500,
    });
    expect(classifyStage4DataUpstreamFailure({
      body: JSON.stringify({
        code: "42501",
        message: `new row violates row-level security policy ${sentinel}`,
      }),
      status: 403,
    })).toEqual({
      category: "row_level_security",
      provider_code: "42501",
      status: 403,
    });
    expect(classifyStage4DataUpstreamFailure({
      body: JSON.stringify({
        code: "42501",
        message: `permission denied for table users ${sentinel}`,
      }),
      status: 403,
    })).toEqual({
      category: "permission_denied_users",
      provider_code: "42501",
      status: 403,
    });
    expect(JSON.stringify(classifyStage4DataUpstreamFailure({
      body: sentinel,
      status: 500,
    }))).not.toContain(sentinel);
  });

  it("routes an actual Supabase from URL to raw PostgREST without /rest/v1", async () => {
    const observed: string[] = [];
    const client = createClient(proxyUrl, "local-anon-key", {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: async (input) => {
          const requestUrl = input instanceof Request ? input.url : String(input);
          observed.push(resolveStage4GuardedDataProxyTarget({
            dataUpstreamUrl: rawDataUrl,
            proxyUrl,
            requestUrl,
            storageUpstreamUrl: storageUrl,
          }));
          return new Response('[{"id":"owned-row"}]', {
            headers: { "content-type": "application/json" },
            status: 200,
          });
        },
      },
    });

    const result = await client.from("users").select("id").limit(1);

    expect(result.error).toBeNull();
    expect(result.data).toEqual([{ id: "owned-row" }]);
    expect(observed).toEqual([
      "http://127.0.0.1:4314/users?select=id&limit=1",
    ]);
  });

  it("routes an actual Supabase storage URL only to the isolated CLI gateway", async () => {
    const observed: string[] = [];
    const client = createClient(proxyUrl, "local-anon-key", {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        fetch: async (input) => {
          const requestUrl = input instanceof Request ? input.url : String(input);
          observed.push(resolveStage4GuardedDataProxyTarget({
            dataUpstreamUrl: rawDataUrl,
            proxyUrl,
            requestUrl,
            storageUpstreamUrl: storageUrl,
          }));
          return new Response(Buffer.from([137, 80, 78, 71]), {
            headers: { "content-type": "image/png" },
            status: 200,
          });
        },
      },
    });

    const result = await client.storage
      .from("recipe-images")
      .download("owner/image.png");

    expect(result.error).toBeNull();
    expect(observed).toEqual([
      "http://127.0.0.1:58101/storage/v1/object/recipe-images/owner/image.png",
    ]);
  });

  it("rejects requests outside the exact proxy origin or allowlisted prefixes", () => {
    for (const requestUrl of [
      "http://127.0.0.1:4313/auth/v1/health",
      "http://127.0.0.1:4313/rest/v10/users",
      "http://127.0.0.1:4312/rest/v1/users",
    ]) {
      expect(() => resolveStage4GuardedDataProxyTarget({
        dataUpstreamUrl: rawDataUrl,
        proxyUrl,
        requestUrl,
        storageUpstreamUrl: storageUrl,
      })).toThrow(/proxy.*route|origin/iu);
    }
  });

  it("closes the proxy after success and treats repeated cleanup as complete", async () => {
    const close = vi.fn((callback: (error?: Error) => void) => callback());
    const server = { close, listening: true };

    await closeStage4GuardedDataProxy(server);
    server.listening = false;
    await closeStage4GuardedDataProxy(server);

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("verifies raw attestation headers, removes them, and forwards only the verified payload", async () => {
    let observedHeaders = null;
    const dataUpstream = await listenLoopbackServer((request, response) => {
      observedHeaders = request.headers;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    });
    const storageUpstream = await listenLoopbackServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    });
    const proxy = await startStage4GuardedDataProxy({
      attestationSecret,
      dataUpstreamUrl: dataUpstream.url,
      port: 0,
      storageUpstreamUrl: storageUpstream.url,
    });
    const nowSeconds = Math.floor(Date.now() / 1_000);
    const attestation = createHybridRequestAttestation({
      identityCreatedAt: "2026-08-24T00:00:00.123456Z",
      issuedAtSeconds: nowSeconds,
      issuer: "https://auth.stage4.homecook.invalid/auth/v1",
      keyVersion: 1,
      method: "GET",
      ownerUuid: "123e4567-e89b-12d3-a456-426614174000",
      path: "/users",
      secret: attestationSecret,
      sessionKeyHash: "a".repeat(64),
      ttlSeconds: 30,
    });

    try {
      const response = await fetch(`${proxy.url}/rest/v1/users?select=id`, {
        headers: {
          "x-homecook-session-attestation": attestation.payload,
          "x-homecook-session-attestation-signature": attestation.signature,
        },
      });

      expect(response.status).toBe(200);
      expect(observedHeaders?.["x-homecook-attestation-verified"])
        .toBe(attestation.payload);
      expect(observedHeaders?.["x-homecook-session-attestation"]).toBeUndefined();
      expect(
        observedHeaders?.["x-homecook-session-attestation-signature"],
      ).toBeUndefined();
    } finally {
      await closeStage4GuardedDataProxy(proxy.server);
      await Promise.all([dataUpstream.close(), storageUpstream.close()]);
    }
  });

  it("rejects invalid or mismatched raw attestation headers before contacting upstream", async () => {
    let upstreamHits = 0;
    const failures: Array<Record<string, unknown>> = [];
    const dataUpstream = await listenLoopbackServer((_request, response) => {
      upstreamHits += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    });
    const storageUpstream = await listenLoopbackServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    });
    const proxy = await startStage4GuardedDataProxy({
      attestationSecret,
      dataUpstreamUrl: dataUpstream.url,
      onSafeFailure: (failure) => failures.push(failure),
      port: 0,
      storageUpstreamUrl: storageUpstream.url,
    });
    const nowSeconds = Math.floor(Date.now() / 1_000);
    const attestation = createHybridRequestAttestation({
      identityCreatedAt: "2026-08-24T00:00:00.000Z",
      issuedAtSeconds: nowSeconds,
      issuer: "https://auth.stage4.homecook.invalid/auth/v1",
      keyVersion: 1,
      method: "GET",
      ownerUuid: "123e4567-e89b-12d3-a456-426614174000",
      path: "/recipes",
      secret: attestationSecret,
      sessionKeyHash: "b".repeat(64),
      ttlSeconds: 30,
    });

    try {
      const invalidSignature = await fetch(`${proxy.url}/rest/v1/users`, {
        headers: {
          "x-homecook-session-attestation": attestation.payload,
          "x-homecook-session-attestation-signature": "0".repeat(64),
        },
      });
      const mismatchedPath = await fetch(`${proxy.url}/rest/v1/users`, {
        headers: {
          "x-homecook-session-attestation": attestation.payload,
          "x-homecook-session-attestation-signature": attestation.signature,
        },
      });
      const missingPair = await fetch(`${proxy.url}/rest/v1/users`, {
        headers: {
          "x-homecook-session-attestation": attestation.payload,
        },
      });

      expect(invalidSignature.status).toBe(401);
      expect(mismatchedPath.status).toBe(401);
      expect(missingPair.status).toBe(401);
      expect(upstreamHits).toBe(0);
      expect(failures).toEqual(expect.arrayContaining([
        expect.objectContaining({ category: "invalid_attestation_signature" }),
        expect.objectContaining({ category: "invalid_attestation_claims_shape" }),
        expect.objectContaining({ category: "invalid_attestation_header_shape" }),
      ]));
    } finally {
      await closeStage4GuardedDataProxy(proxy.server);
      await Promise.all([dataUpstream.close(), storageUpstream.close()]);
    }
  });

  it("passes through anonymous requests without adding a verified attestation header", async () => {
    let observedHeaders = null;
    const dataUpstream = await listenLoopbackServer((request, response) => {
      observedHeaders = request.headers;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    });
    const storageUpstream = await listenLoopbackServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    });
    const proxy = await startStage4GuardedDataProxy({
      attestationSecret,
      dataUpstreamUrl: dataUpstream.url,
      port: 0,
      storageUpstreamUrl: storageUpstream.url,
    });

    try {
      const response = await fetch(`${proxy.url}/rest/v1/users`);

      expect(response.status).toBe(200);
      expect(observedHeaders?.["x-homecook-attestation-verified"]).toBeUndefined();
      expect(observedHeaders?.["x-homecook-session-attestation"]).toBeUndefined();
      expect(
        observedHeaders?.["x-homecook-session-attestation-signature"],
      ).toBeUndefined();
    } finally {
      await closeStage4GuardedDataProxy(proxy.server);
      await Promise.all([dataUpstream.close(), storageUpstream.close()]);
    }
  });

  it("allows anonymous passthrough even before an attestation secret is configured", async () => {
    const dataUpstream = await listenLoopbackServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    });
    const storageUpstream = await listenLoopbackServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true }));
    });
    const proxy = await startStage4GuardedDataProxy({
      dataUpstreamUrl: dataUpstream.url,
      port: 0,
      storageUpstreamUrl: storageUpstream.url,
    });

    try {
      const response = await fetch(`${proxy.url}/rest/v1/users`);

      expect(response.status).toBe(200);
    } finally {
      await closeStage4GuardedDataProxy(proxy.server);
      await Promise.all([dataUpstream.close(), storageUpstream.close()]);
    }
  });
});
