import {
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto";
import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import {
  createGatewayConfig,
  createGatewayRequestHandler,
  validateConfig,
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
    DATA_SUPABASE_PUBLISHABLE_KEY:
      "local-anon-jwt-0123456789abcdef0123456789abcdef",
    DATA_SUPABASE_SECRET_KEY: "0123456789abcdef0123456789abcdef",
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
  it("limits the insecure auth fixture escape hatch to explicit local hosts", () => {
    expect(() => validateConfig(createConfig({
      AUTH_SUPABASE_URL: "http://attacker.example",
      AUTH_SUPABASE_EXPECTED_ISSUER: "http://attacker.example/auth/v1",
      AUTH_SUPABASE_JWKS_URL:
        "http://attacker.example/auth/v1/.well-known/jwks.json",
    }))).toThrow("authority configuration is invalid");
  });

  it("reports healthy only after both internal upstreams answer", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const handler = createGatewayRequestHandler({
      config: createConfig(),
      fetchImpl,
    });
    const response = createResponseRecorder();

    await handler(
      {
        headers: {},
        method: "GET",
        url: "http://gateway.internal/healthz",
      },
      response,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(response.snapshot().statusCode).toBe(200);
    expect(JSON.parse(response.snapshot().body)).toEqual({
      status: "healthy",
    });
  });

  it("keeps health and public reads fail closed before upstream readiness", async () => {
    const healthFetch = vi.fn(async (input: RequestInfo | URL) =>
      new Response(null, {
        status: String(input).endsWith("/status") ? 503 : 200,
      }));
    const healthHandler = createGatewayRequestHandler({
      config: createConfig(),
      fetchImpl: healthFetch,
    });
    const healthResponse = createResponseRecorder();

    await healthHandler(
      {
        headers: {},
        method: "GET",
        url: "http://gateway.internal/healthz",
      },
      healthResponse,
    );

    expect(healthResponse.snapshot().statusCode).toBe(503);
    expect(JSON.parse(healthResponse.snapshot().body)).toEqual({
      status: "unhealthy",
    });

    const publicHandler = createGatewayRequestHandler({
      config: createConfig({ HYBRID_GATEWAY_REQUIRE_READY: "1" }),
      fetchImpl: vi.fn(async (input: RequestInfo | URL) =>
        new Response(null, {
          status: String(input).endsWith("/status") ? 503 : 200,
        })),
    });
    const publicResponse = createResponseRecorder();

    await publicHandler(
      {
        headers: { "x-homecook-public-read-scope": "ingredients" },
        method: "GET",
        url: "http://gateway.internal/rest/v1/ingredients?select=id%2Cstandard_name%2Ccategory%2Ccategory_code&order=standard_name.asc",
      },
      publicResponse,
    );

    const body = JSON.parse(publicResponse.snapshot().body) as {
      error: { code: string };
    };
    expect(publicResponse.snapshot().statusCode).toBe(503);
    expect(body.error.code).toBe("ACCOUNT_LIFECYCLE_MAINTENANCE");

    const userResponse = createResponseRecorder();
    await publicHandler(
      {
        headers: { authorization: "Bearer user-token-before-ready" },
        method: "GET",
        url: "http://gateway.internal/rest/v1/users?select=id",
      },
      userResponse,
    );
    expect(userResponse.snapshot().statusCode).toBe(503);
    expect(JSON.parse(userResponse.snapshot().body)).toMatchObject({
      error: { code: "ACCOUNT_LIFECYCLE_MAINTENANCE" },
    });
  });

  it("requires an attested local anon read before production readiness", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const handler = createGatewayRequestHandler({
      config: createConfig({ HYBRID_GATEWAY_REQUIRE_READY: "1" }),
      fetchImpl,
    });
    const response = createResponseRecorder();

    await handler(
      {
        headers: {},
        method: "GET",
        url: "http://gateway.internal/healthz",
      },
      response,
    );

    expect(response.snapshot().statusCode).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const [url, options] = fetchImpl.mock.calls[2] as unknown as [
      string,
      { headers: Headers },
    ];
    expect(url).toBe(
      "http://postgrest:3000/ingredients?select=id&limit=0",
    );
    expect(options.headers.get("authorization")).toBe(
      "Bearer local-anon-jwt-0123456789abcdef0123456789abcdef",
    );
    expect(options.headers.get("apikey")).toBe(
      "local-anon-jwt-0123456789abcdef0123456789abcdef",
    );
    expect(
      options.headers.get("x-homecook-session-attestation"),
    ).toBeTruthy();
    expect(
      options.headers.get("x-homecook-session-attestation-signature"),
    ).toMatch(/^[0-9a-f]{64}$/u);
  });

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
        headers: { "x-homecook-public-read-scope": "recipes" },
        method: "GET",
        url: "http://gateway.internal/rest/v1/recipes?select=id%2Ctitle%2Cthumbnail_url%2Ctags%2Cbase_servings%2Cview_count%2Clike_count%2Csave_count%2Cplan_count%2Ccook_count%2Ccreated_at%2Csource_type&visibility=eq.public&deleted_at=is.null&limit=21&order=view_count.desc&order=id.asc",
      },
      response,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, anonymousOptions] = fetchImpl.mock.calls[0] as unknown as [
      string,
      { headers: Headers },
    ];
    expect(anonymousOptions.headers.get("authorization")).toBe(
      "Bearer local-anon-jwt-0123456789abcdef0123456789abcdef",
    );
    expect(anonymousOptions.headers.get("apikey")).toBe(
      "local-anon-jwt-0123456789abcdef0123456789abcdef",
    );
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

  it("verifies and forwards the remote bearer for authenticated user requests", async () => {
    const fixture = createSigningFixture();
    const token = createToken(fixture);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/.well-known/jwks.json")) {
        return new Response(JSON.stringify({ keys: [fixture.publicJwk] }), {
          status: 200,
        });
      }
      if (url.endsWith("/auth/v1/user")) {
        return new Response(JSON.stringify({
          created_at: "2026-07-29T00:00:00.000Z",
          id: OWNER_UUID,
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
        headers: { authorization: `Bearer ${token}` },
        method: "GET",
        url: "http://gateway.internal/rest/v1/users?select=id",
      },
      response,
    );

    const [upstreamUrl, upstreamOptions] =
      fetchImpl.mock.calls.at(-1) as unknown as [
        string,
        { headers: Headers },
      ];
    const headers = new Headers(upstreamOptions.headers);
    expect(upstreamUrl).toBe("http://postgrest:3000/users?select=id");
    expect(headers.get("authorization")).toBe(`Bearer ${token}`);
    expect(headers.get("apikey")).toBe(
      "local-anon-jwt-0123456789abcdef0123456789abcdef",
    );
    expect(response.snapshot().statusCode).toBe(200);
  });

  it("allows only scoped recipe-image Storage removal through the internal facade", async () => {
    const dataSecret = "0123456789abcdef0123456789abcdef";
    const fetchImpl = vi.fn(async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      expect(String(input)).toBe(
        "http://storage:5000/object/recipe-images-private",
      );
      const headers = new Headers(init?.headers);
      expect(headers.get("x-homecook-session-attestation")).toBeTruthy();
      expect(headers.get("x-homecook-session-attestation-signature"))
        .toMatch(/^[a-f0-9]{64}$/);
      return new Response(null, { status: 200 });
    });
    const handler = createGatewayRequestHandler({
      config: createConfig(),
      fetchImpl,
    });
    const request = Readable.from([
      JSON.stringify({ prefixes: ["owner/image.jpg"] }),
    ]) as Readable & {
      headers: Record<string, string>;
      method: string;
      url: string;
    };
    request.headers = {
      authorization: `Bearer ${dataSecret}`,
      "content-type": "application/json",
      "x-homecook-internal-scope": "recipe-image",
    };
    request.method = "DELETE";
    request.url =
      "http://gateway.internal/storage/v1/object/recipe-images-private";
    const response = createResponseRecorder();

    await handler(request, response);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(response.snapshot().statusCode).toBe(200);
  });

  it.each([
    {
      headers: {},
      label: "missing bearer",
      method: "POST",
      path: "/storage/v1/object/recipe-images-private/owner/missing.jpg",
    },
    {
      headers: { authorization: "Bearer local-anon-jwt" },
      label: "anon bearer",
      method: "PUT",
      path: "/storage/v1/object/recipe-images-private/owner/anon.jpg",
    },
    {
      headers: {},
      label: "remote user bearer",
      method: "PATCH",
      path: "/storage/v1/object/recipe-images-private/owner/user.jpg",
      validRemoteUser: true,
    },
    {
      headers: {
        authorization: "Bearer 0123456789abcdef0123456789abcdef",
      },
      label: "missing scope",
      method: "DELETE",
      path: "/storage/v1/object/recipe-images-private",
    },
    {
      headers: {
        authorization: "Bearer 0123456789abcdef0123456789abcdef",
        "x-homecook-internal-scope": "admin-data",
      },
      label: "wrong scope",
      method: "POST",
      path: "/storage/v1/object/sign/recipe-images-private/owner/x.jpg",
    },
    {
      headers: {
        authorization: "Bearer wrong-secret",
        "x-homecook-internal-scope": "recipe-image",
      },
      label: "wrong secret",
      method: "POST",
      path: "/storage/v1/object/recipe-images-private/owner/wrong.jpg",
    },
  ])("rejects $label Storage mutation before any upstream call", async ({
    headers,
    method,
    path,
    validRemoteUser,
  }) => {
    const fixture = validRemoteUser ? createSigningFixture() : null;
    const resolvedHeaders: Record<string, string> = fixture
      ? { authorization: `Bearer ${createToken(fixture)}` }
      : headers as Record<string, string>;
    const objectManifest = new Map([["existing.jpg", "unchanged"]]);
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      if (fixture && String(input).includes("/.well-known/jwks.json")) {
        return new Response(JSON.stringify({ keys: [fixture.publicJwk] }), {
          status: 200,
        });
      }
      objectManifest.set("unexpected.jpg", "mutated");
      return new Response(null, { status: 200 });
    });
    const handler = createGatewayRequestHandler({
      config: createConfig(),
      fetchImpl,
    });
    const request = Readable.from(["mutation-body"]) as Readable & {
      headers: Record<string, string>;
      method: string;
      url: string;
    };
    request.headers = resolvedHeaders;
    request.method = method;
    request.url = `http://gateway.internal${path}`;
    const response = createResponseRecorder();

    await handler(request, response);

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(objectManifest).toEqual(new Map([["existing.jpg", "unchanged"]]));
    expect(response.snapshot().statusCode).toBe(409);
  });

  it.each([
    {
      method: "POST",
      path: "/storage/v1/object/recipe-images-private/owner/upload.jpg",
    },
    {
      method: "DELETE",
      path: "/storage/v1/object/recipe-images-private",
    },
    {
      method: "POST",
      path: "/storage/v1/object/sign/recipe-images-private/owner/upload.jpg",
    },
  ])("keeps exact internal recipe-image $method $path allowed", async ({
    method,
    path,
  }) => {
    const dataSecret = "0123456789abcdef0123456789abcdef";
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const handler = createGatewayRequestHandler({
      config: createConfig(),
      fetchImpl,
    });
    const requestBody = path.includes("/object/recipe-images-private/")
      && !path.includes("/object/sign/")
      ? Buffer.from([0x89, 0x50, 0x4e, 0x47])
      : Buffer.from("{}");
    const request = Readable.from([requestBody]) as Readable & {
      headers: Record<string, string>;
      method: string;
      url: string;
    };
    request.headers = {
      authorization: `Bearer ${dataSecret}`,
      "content-type": "application/json",
      "x-homecook-internal-scope": "recipe-image",
    };
    request.method = method;
    request.url = `http://gateway.internal${path}`;
    const response = createResponseRecorder();

    await handler(request, response);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(response.snapshot().statusCode).toBe(200);
  });

  it("rejects general user-data PostgREST access from the callback service scope", async () => {
    const dataSecret = "0123456789abcdef0123456789abcdef";
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const handler = createGatewayRequestHandler({
      config: createConfig(),
      fetchImpl,
    });
    const response = createResponseRecorder();

    await handler(
      {
        headers: {
          authorization: `Bearer ${dataSecret}`,
          "x-homecook-internal-scope": "auth-callback",
        },
        method: "GET",
        url: "http://gateway.internal/rest/v1/users",
      },
      response,
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(response.snapshot().statusCode).toBe(409);
  });

  it("rejects HEAD when the public contract is GET-only", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const handler = createGatewayRequestHandler({
      config: createConfig(),
      fetchImpl,
    });
    const response = createResponseRecorder();

    await handler(
      {
        headers: { "x-homecook-public-read-scope": "ingredients" },
        method: "HEAD",
        url: "http://gateway.internal/rest/v1/ingredients?select=id%2Cstandard_name%2Ccategory%2Ccategory_code&order=standard_name.asc",
      },
      response,
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(response.snapshot().statusCode).toBe(409);
  });

  it("forwards an exact admin table query only under the admin-data scope", async () => {
    const dataSecret = "0123456789abcdef0123456789abcdef";
    const fetchImpl = vi.fn(async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      expect(String(input)).toBe(
        "http://postgrest:3000/admin_members?select=user_id%2Crole&user_id=eq.user-1",
      );
      const headers = new Headers(init?.headers);
      expect(headers.get("x-homecook-session-attestation")).toBeTruthy();
      expect(headers.get("x-homecook-session-attestation-signature"))
        .toMatch(/^[a-f0-9]{64}$/);
      return new Response(null, { status: 200 });
    });
    const handler = createGatewayRequestHandler({
      config: createConfig(),
      fetchImpl,
    });
    const response = createResponseRecorder();

    await handler(
      {
        headers: {
          authorization: `Bearer ${dataSecret}`,
          "x-homecook-internal-scope": "admin-data",
        },
        method: "GET",
        url: "http://gateway.internal/rest/v1/admin_members?select=user_id%2Crole&user_id=eq.user-1",
      },
      response,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(response.snapshot().statusCode).toBe(200);
  });

  it("rejects a cross-method recipe-image scope request", async () => {
    const dataSecret = "0123456789abcdef0123456789abcdef";
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }));
    const handler = createGatewayRequestHandler({
      config: createConfig(),
      fetchImpl,
    });
    const response = createResponseRecorder();

    await handler(
      {
        headers: {
          authorization: `Bearer ${dataSecret}`,
          "x-homecook-internal-scope": "recipe-image",
        },
        method: "GET",
        url: "http://gateway.internal/rest/v1/operational_events",
      },
      response,
    );

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(response.snapshot().statusCode).toBe(409);
  });
});
