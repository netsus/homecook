import {
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  createGatewayConfig,
  createGatewayRequestHandler,
} from "@/infra/hybrid-supabase/loopback-gateway.mjs";

const OWNER_UUID = "11111111-1111-4111-8111-111111111111";
const SESSION_UUID = "22222222-2222-4222-8222-222222222222";
const ISSUER = "http://auth-stub:4100/auth/v1";
interface SigningFixture {
  privateKey: KeyObject;
  publicJwk: JsonWebKey & {
    alg: "ES256";
    kid: string;
    use: "sig";
  };
}

function createSigningFixture(): SigningFixture {
  const keyPair = generateKeyPairSync("ec", { namedCurve: "P-256" });
  return {
    privateKey: keyPair.privateKey,
    publicJwk: {
      ...keyPair.publicKey.export({ format: "jwk" }),
      alg: "ES256",
      kid: "hybrid-gateway-test",
      use: "sig",
    },
  };
}

function encodeJson(value: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function createToken(fixture: SigningFixture) {
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const signingInput = [
    encodeJson({
      alg: "ES256",
      kid: fixture.publicJwk.kid,
      typ: "JWT",
    }),
    encodeJson({
      iss: ISSUER,
      aud: "authenticated",
      role: "authenticated",
      sub: OWNER_UUID,
      session_id: SESSION_UUID,
      iat: nowSeconds - 60,
      nbf: nowSeconds - 60,
      exp: nowSeconds + 300,
    }),
  ].join(".");
  const signature = sign(
    "sha256",
    Buffer.from(signingInput, "utf8"),
    { key: fixture.privateKey, dsaEncoding: "ieee-p1363" },
  ).toString("base64url");
  return `${signingInput}.${signature}`;
}

function createResponseRecorder() {
  let statusCode = 200;
  let body = "";
  return {
    writeHead(code: number) {
      statusCode = code;
    },
    end(chunk?: string) {
      body += chunk ?? "";
    },
    snapshot() {
      return { statusCode, body };
    },
  };
}

function createConfig(overrides: Record<string, string> = {}) {
  return createGatewayConfig({
    ALLOW_INSECURE_LOCAL_AUTH_STUB: "1",
    AUTH_SUPABASE_URL: "http://auth-stub:4100",
    AUTH_SUPABASE_EXPECTED_ISSUER: ISSUER,
    AUTH_SUPABASE_JWKS_URL: `${ISSUER}/.well-known/jwks.json`,
    AUTH_SUPABASE_PUBLISHABLE_KEY: "publishable",
    DATA_SUPABASE_SECRET_KEY: "0123456789abcdef0123456789abcdef",
    HYBRID_ANON_ALLOWED_PATHS: "/rest/v1/recipes",
    HOMECOOK_SESSION_ATTESTATION_HMAC_KEY_V1:
      "0123456789abcdef0123456789abcdef",
    HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1:
      "fedcba9876543210fedcba9876543210",
    HYBRID_GATEWAY_TIMEOUT_MS: "100",
    POSTGREST_UPSTREAM_URL: "http://postgrest:3000",
    STORAGE_UPSTREAM_URL: "http://storage:5000",
    ...overrides,
  });
}

describe("hybrid loopback gateway runtime", () => {
  it("allows exact anon GET paths without remote auth", async () => {
    const fixture = createSigningFixture();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/.well-known/jwks.json")) {
        return new Response(JSON.stringify({ keys: [fixture.publicJwk] }), { status: 200 });
      }
      if (url.endsWith("/auth/v1/user")) {
        return new Response(JSON.stringify({
          id: OWNER_UUID,
          created_at: "2026-07-29T00:00:00.000Z",
        }), { status: 200 });
      }
      return new Response(null, { status: 200 });
    });
    const handler = createGatewayRequestHandler({
      config: createConfig(),
      fetchImpl,
    });
    const response = createResponseRecorder();

    await handler(
      {
        headers: {},
        method: "GET",
        url: "http://gateway.internal/rest/v1/recipes?select=id",
      },
      response,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(response.snapshot().statusCode).toBe(200);
  });

  it("maps a stalled local upstream to the existing 503 contract", async () => {
    const fixture = createSigningFixture();
    const token = createToken(fixture);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/.well-known/jwks.json")) {
        return new Response(JSON.stringify({ keys: [fixture.publicJwk] }), { status: 200 });
      }
      if (url.endsWith("/auth/v1/user")) {
        return new Response(JSON.stringify({
          id: OWNER_UUID,
          created_at: "2026-07-29T00:00:00.000Z",
        }), { status: 200 });
      }
      await new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new Error("aborted"));
        }, { once: true });
      });
      return new Response("unexpected", { status: 500 });
    });
    const handler = createGatewayRequestHandler({
      config: createConfig(),
      fetchImpl,
    });
    const response = createResponseRecorder();

    await handler(
      {
        headers: { authorization: `Bearer ${token}` },
        method: "GET",
        url: "http://gateway.internal/rest/v1/hybrid_runtime_probe?select=note",
      },
      response,
    );

    const body = JSON.parse(response.snapshot().body) as {
      error: { code: string };
    };
    expect(response.snapshot().statusCode).toBe(503);
    expect(body.error.code).toBe("ACCOUNT_LIFECYCLE_MAINTENANCE");
  });
});
