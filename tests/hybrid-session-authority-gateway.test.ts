import {
  generateKeyPairSync,
  sign,
} from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  HYBRID_AUTHORITY_ERROR_HEADER,
  HybridLifecycleMaintenanceError,
  createHybridAuthorityMarker,
  createHybridAuthorityFetch,
  isHybridAuthorityFailureResponse,
} from "@/lib/server/hybrid-auth/gateway";
import { verifyHybridRequestAttestation } from "@/lib/server/hybrid-auth/session-authority";

const OWNER_UUID = "11111111-1111-4111-8111-111111111111";
const SESSION_UUID = "22222222-2222-4222-8222-222222222222";
const ISSUER = "https://remote.example.supabase.co/auth/v1";
const SECRET = "0123456789abcdef0123456789abcdef";
const { privateKey, publicKey } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
});
const REMOTE_JWK = {
  ...publicKey.export({ format: "jwk" }),
  alg: "ES256",
  kid: "remote-key",
  use: "sig",
};

function accessToken(overrides: Record<string, unknown> = {}) {
  const header = Buffer.from(JSON.stringify({
    alg: "ES256",
    kid: "remote-key",
    typ: "JWT",
  })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iss: ISSUER,
    aud: "authenticated",
    role: "authenticated",
    sub: OWNER_UUID,
    session_id: SESSION_UUID,
    iat: 1_800_000_000,
    nbf: 1_800_000_000,
    exp: 1_800_000_600,
    ...overrides,
  })).toString("base64url");
  const signature = sign(
    "sha256",
    Buffer.from(`${header}.${payload}`, "utf8"),
    { key: privateKey, dsaEncoding: "ieee-p1363" },
  ).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

async function expectAuthorityError(
  response: Response,
  expected: "ACCOUNT_SESSION_STALE" | "ACCOUNT_LIFECYCLE_MAINTENANCE",
) {
  const marker = expected === "ACCOUNT_SESSION_STALE"
    ? "HOMECOOK_HYBRID_AUTHORITY::ACCOUNT_SESSION_STALE::409"
    : "HOMECOOK_HYBRID_AUTHORITY::ACCOUNT_LIFECYCLE_MAINTENANCE::503";
  expect(isHybridAuthorityFailureResponse(response)).toBe(true);
  expect(response.headers.get(HYBRID_AUTHORITY_ERROR_HEADER)).toBe(marker);
  expect(response.status).toBe(
    expected === "ACCOUNT_SESSION_STALE" ? 409 : 503,
  );
  await expect(response.json()).resolves.toMatchObject({
    code: expected,
    message: marker,
    details: marker,
    hint: marker,
  });
}

describe("loopback session-authority gateway", () => {
  it("rechecks remote liveness, verifies an existing active binding, and attests the exact local method/path", async () => {
    const token = accessToken();
    const remoteLivenessFetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        id: OWNER_UUID,
        created_at: "2026-07-28T00:00:00.000Z",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    const localUpstreamFetch = vi.fn().mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    const assertSessionAuthority = vi.fn().mockResolvedValue(undefined);
    const authorityFetch = createHybridAuthorityFetch({
      getAccessToken: async () => token,
      remoteLivenessFetch,
      localUpstreamFetch,
      loadRemoteJwks: async () => ({ keys: [REMOTE_JWK] }),
      assertSessionAuthority,
      auth: {
        issuer: ISSUER,
        url: "https://remote.example.supabase.co",
        publishableKey: "remote-publishable",
      },
      attestationSecret: SECRET,
      sessionBindingSecret: SECRET,
      nowSeconds: () => 1_800_000_100,
    });

    const response = await authorityFetch("http://127.0.0.1:8000/rest/v1/meals", {
      method: "POST",
      body: "{}",
    });

    expect(response.status).toBe(200);
    expect(remoteLivenessFetch).toHaveBeenCalledWith(
      "https://remote.example.supabase.co/auth/v1/user",
      expect.objectContaining({
        cache: "no-store",
        headers: expect.objectContaining({
          apikey: "remote-publishable",
          Authorization: `Bearer ${token}`,
        }),
      }),
    );
    expect(localUpstreamFetch).toHaveBeenCalledTimes(1);
    expect(assertSessionAuthority).toHaveBeenCalledWith({
      binding: expect.objectContaining({
        owner_uuid: OWNER_UUID,
        binding_state: "active",
      }),
    });
    const [, localInit] = localUpstreamFetch.mock.calls[0];
    const localHeaders = new Headers(localInit.headers);
    expect(localHeaders.get("authorization")).toBe(
      `Bearer ${token}`,
    );
    expect(localHeaders.get("x-homecook-session-attestation")).toBeTruthy();
    expect(
      localHeaders.get("x-homecook-session-attestation-signature"),
    ).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyHybridRequestAttestation({
      payload: localHeaders.get("x-homecook-session-attestation")!,
      signature: localHeaders.get(
        "x-homecook-session-attestation-signature",
      )!,
      secret: SECRET,
      method: "POST",
      path: "/meals",
      nowSeconds: 1_800_000_100,
    })).toMatchObject({ ok: true });
  });

  it("allows only the exact anonymous public recipe read allowlist without remote liveness or attestation", async () => {
    const remoteLivenessFetch = vi.fn();
    const localUpstreamFetch = vi.fn().mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    const assertSessionAuthority = vi.fn();
    const authorityFetch = createHybridAuthorityFetch({
      getAccessToken: async () => null,
      remoteLivenessFetch,
      localUpstreamFetch,
      loadRemoteJwks: async () => ({ keys: [REMOTE_JWK] }),
      assertSessionAuthority,
      auth: {
        issuer: ISSUER,
        url: "https://remote.example.supabase.co",
        publishableKey: "remote-publishable",
      },
      attestationSecret: SECRET,
      sessionBindingSecret: SECRET,
      nowSeconds: () => 1_800_000_100,
    });

    const response = await authorityFetch(
      "http://127.0.0.1:8000/rest/v1/recipes?select=id,title",
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    expect(remoteLivenessFetch).not.toHaveBeenCalled();
    expect(assertSessionAuthority).not.toHaveBeenCalled();
    expect(localUpstreamFetch).toHaveBeenCalledTimes(1);
    const [, localInit] = localUpstreamFetch.mock.calls[0];
    const localHeaders = new Headers(localInit.headers);
    expect(localHeaders.get("authorization")).toBeNull();
    expect(localHeaders.get("x-homecook-session-attestation")).toBeNull();
    expect(localHeaders.get("x-homecook-session-attestation-signature")).toBeNull();
  });

  it("rejects anonymous private reads and mutations outside the exact public allowlist", async () => {
    const localUpstreamFetch = vi.fn();
    const authorityFetch = createHybridAuthorityFetch({
      getAccessToken: async () => null,
      remoteLivenessFetch: vi.fn(),
      localUpstreamFetch,
      loadRemoteJwks: async () => ({ keys: [REMOTE_JWK] }),
      assertSessionAuthority: vi.fn(),
      auth: {
        issuer: ISSUER,
        url: "https://remote.example.supabase.co",
        publishableKey: "remote-publishable",
      },
      attestationSecret: SECRET,
      sessionBindingSecret: SECRET,
      nowSeconds: () => 1_800_000_100,
    });

    const privateGetResponse = await authorityFetch(
      "http://127.0.0.1:8000/rest/v1/users?select=id",
      { method: "GET" },
    );
    const mutationResponse = await authorityFetch(
      "http://127.0.0.1:8000/rest/v1/recipes",
      { method: "POST", body: "{}" },
    );

    await expectAuthorityError(privateGetResponse, "ACCOUNT_SESSION_STALE");
    await expectAuthorityError(mutationResponse, "ACCOUNT_SESSION_STALE");
    expect(localUpstreamFetch).not.toHaveBeenCalled();
  });

  it.each([
    ["revoked session", new Response('{"code":"session_not_found"}', { status: 401 }), "ACCOUNT_SESSION_STALE"],
    ["remote outage", new Error("remote unavailable"), "ACCOUNT_LIFECYCLE_MAINTENANCE"],
  ])("fails closed on %s without calling local Data/Storage", async (_label, remoteResult, publicCode) => {
    const remoteLivenessFetch = vi.fn().mockImplementation(async () => {
      if (remoteResult instanceof Error) {
        throw remoteResult;
      }
      return remoteResult;
    });
    const localUpstreamFetch = vi.fn();
    const authorityFetch = createHybridAuthorityFetch({
      getAccessToken: async () => accessToken(),
      remoteLivenessFetch,
      localUpstreamFetch,
      loadRemoteJwks: async () => ({ keys: [REMOTE_JWK] }),
      assertSessionAuthority: vi.fn(),
      auth: {
        issuer: ISSUER,
        url: "https://remote.example.supabase.co",
        publishableKey: "remote-publishable",
      },
      attestationSecret: SECRET,
      sessionBindingSecret: SECRET,
      nowSeconds: () => 1_800_000_100,
    });

    const response = await authorityFetch(
      "http://127.0.0.1:8000/storage/v1/object/recipe-images/a",
      {
        method: "DELETE",
      },
    );

    await expectAuthorityError(
      response,
      publicCode as "ACCOUNT_SESSION_STALE" | "ACCOUNT_LIFECYCLE_MAINTENANCE",
    );
    expect(localUpstreamFetch).not.toHaveBeenCalled();
  });

  it("rejects a remote user/claim mismatch before local access", async () => {
    const remoteLivenessFetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        id: "33333333-3333-4333-8333-333333333333",
        created_at: "2026-07-28T00:00:00.000Z",
      }),
      { status: 200 },
    ));
    const localUpstreamFetch = vi.fn();
    const authorityFetch = createHybridAuthorityFetch({
      getAccessToken: async () => accessToken(),
      remoteLivenessFetch,
      localUpstreamFetch,
      loadRemoteJwks: async () => ({ keys: [REMOTE_JWK] }),
      assertSessionAuthority: vi.fn(),
      auth: {
        issuer: ISSUER,
        url: "https://remote.example.supabase.co",
        publishableKey: "remote-publishable",
      },
      attestationSecret: SECRET,
      sessionBindingSecret: SECRET,
      nowSeconds: () => 1_800_000_100,
    });

    const response = await authorityFetch(
      "http://127.0.0.1:8000/rest/v1/users",
      { method: "GET" },
    );

    await expectAuthorityError(response, "ACCOUNT_SESSION_STALE");
    expect(localUpstreamFetch).not.toHaveBeenCalled();
  });

  it("rejects an invalid JWT signature before the remote or local upstream", async () => {
    const remoteLivenessFetch = vi.fn();
    const localUpstreamFetch = vi.fn();
    const token = accessToken();
    const [header, payload] = token.split(".");
    const authorityFetch = createHybridAuthorityFetch({
      getAccessToken: async () =>
        `${header}.${payload}.${Buffer.alloc(64).toString("base64url")}`,
      remoteLivenessFetch,
      localUpstreamFetch,
      loadRemoteJwks: async () => ({ keys: [REMOTE_JWK] }),
      assertSessionAuthority: vi.fn(),
      auth: {
        issuer: ISSUER,
        url: "https://remote.example.supabase.co",
        publishableKey: "remote-publishable",
      },
      attestationSecret: SECRET,
      sessionBindingSecret: SECRET,
      nowSeconds: () => 1_800_000_100,
    });

    const response = await authorityFetch("http://127.0.0.1:8000/rest/v1/users");

    await expectAuthorityError(response, "ACCOUNT_SESSION_STALE");
    expect(remoteLivenessFetch).not.toHaveBeenCalled();
    expect(localUpstreamFetch).not.toHaveBeenCalled();
  });

  it("fails closed when the existing local authority binding is stale or revoked", async () => {
    const remoteLivenessFetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        id: OWNER_UUID,
        created_at: "2026-07-28T00:00:00.000Z",
      }),
      { status: 200 },
    ));
    const localUpstreamFetch = vi.fn();
    const authorityFetch = createHybridAuthorityFetch({
      getAccessToken: async () => accessToken(),
      remoteLivenessFetch,
      localUpstreamFetch,
      loadRemoteJwks: async () => ({ keys: [REMOTE_JWK] }),
      assertSessionAuthority: vi.fn().mockRejectedValue(
        new Error("ACCOUNT_SESSION_STALE"),
      ),
      auth: {
        issuer: ISSUER,
        url: "https://remote.example.supabase.co",
        publishableKey: "remote-publishable",
      },
      attestationSecret: SECRET,
      sessionBindingSecret: SECRET,
      nowSeconds: () => 1_800_000_100,
    });

    const response = await authorityFetch("http://127.0.0.1:8000/rest/v1/meals", {
      method: "POST",
    });

    await expectAuthorityError(response, "ACCOUNT_SESSION_STALE");
    expect(localUpstreamFetch).not.toHaveBeenCalled();
  });

  it("returns a contracted 503 marker when the local authority verification plane is unavailable", async () => {
    const remoteLivenessFetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        id: OWNER_UUID,
        created_at: "2026-07-28T00:00:00.000Z",
      }),
      { status: 200 },
    ));
    const localUpstreamFetch = vi.fn();
    const authorityFetch = createHybridAuthorityFetch({
      getAccessToken: async () => accessToken(),
      remoteLivenessFetch,
      localUpstreamFetch,
      loadRemoteJwks: async () => ({ keys: [REMOTE_JWK] }),
      assertSessionAuthority: vi.fn().mockRejectedValue(
        new HybridLifecycleMaintenanceError(),
      ),
      auth: {
        issuer: ISSUER,
        url: "https://remote.example.supabase.co",
        publishableKey: "remote-publishable",
      },
      attestationSecret: SECRET,
      sessionBindingSecret: SECRET,
      nowSeconds: () => 1_800_000_100,
    });

    const response = await authorityFetch("http://127.0.0.1:8000/rest/v1/meals", {
      method: "POST",
    });

    await expectAuthorityError(
      response,
      "ACCOUNT_LIFECYCLE_MAINTENANCE",
    );
    expect(localUpstreamFetch).not.toHaveBeenCalled();
  });

  it("preserves the exact namespaced authority marker through supabase-js errors", async () => {
    const authorityFetch = createHybridAuthorityFetch({
      getAccessToken: async () => accessToken(),
      remoteLivenessFetch: vi.fn().mockResolvedValue(new Response(
        JSON.stringify({
          id: OWNER_UUID,
          created_at: "2026-07-28T00:00:00.000Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      )),
      localUpstreamFetch: vi.fn(),
      loadRemoteJwks: async () => ({ keys: [REMOTE_JWK] }),
      assertSessionAuthority: vi.fn().mockRejectedValue(
        new HybridLifecycleMaintenanceError(),
      ),
      auth: {
        issuer: ISSUER,
        url: "https://remote.example.supabase.co",
        publishableKey: "remote-publishable",
      },
      attestationSecret: SECRET,
      sessionBindingSecret: SECRET,
      nowSeconds: () => 1_800_000_100,
    });
    const client = createClient("http://127.0.0.1:8000", "anon-key", {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
      global: {
        fetch: authorityFetch,
      },
    });

    const result = await client.from("recipes").select("id").limit(1);

    expect(result.status).toBe(503);
    expect(result.error).toMatchObject({
      code: "ACCOUNT_LIFECYCLE_MAINTENANCE",
      message: createHybridAuthorityMarker(
        new HybridLifecycleMaintenanceError(),
      ),
      details: createHybridAuthorityMarker(
        new HybridLifecycleMaintenanceError(),
      ),
      hint: createHybridAuthorityMarker(
        new HybridLifecycleMaintenanceError(),
      ),
    });
  });

  it("maps a stalled local PostgREST or Storage upstream to the contracted 503", async () => {
    const authorityFetch = createHybridAuthorityFetch({
      getAccessToken: async () => accessToken(),
      remoteLivenessFetch: vi.fn().mockResolvedValue(new Response(
        JSON.stringify({
          id: OWNER_UUID,
          created_at: "2026-07-28T00:00:00.000Z",
        }),
        { status: 200 },
      )),
      localUpstreamFetch: vi.fn().mockRejectedValue(
        new DOMException("timed out", "TimeoutError"),
      ),
      loadRemoteJwks: async () => ({ keys: [REMOTE_JWK] }),
      assertSessionAuthority: vi.fn().mockResolvedValue(undefined),
      auth: {
        issuer: ISSUER,
        url: "https://remote.example.supabase.co",
        publishableKey: "remote-publishable",
      },
      attestationSecret: SECRET,
      sessionBindingSecret: SECRET,
      nowSeconds: () => 1_800_000_100,
    });

    const response = await authorityFetch(
      "http://127.0.0.1:8000/storage/v1/object/recipe-images/a",
      { method: "POST", body: "image" },
    );

    await expectAuthorityError(
      response,
      "ACCOUNT_LIFECYCLE_MAINTENANCE",
    );
  });

  it("attests the Storage service path that its RLS transaction receives", async () => {
    const localUpstreamFetch = vi.fn().mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    const authorityFetch = createHybridAuthorityFetch({
      getAccessToken: async () => accessToken(),
      remoteLivenessFetch: vi.fn().mockResolvedValue(new Response(
        JSON.stringify({
          id: OWNER_UUID,
          created_at: "2026-07-28T00:00:00.000Z",
        }),
        { status: 200 },
      )),
      localUpstreamFetch,
      loadRemoteJwks: async () => ({ keys: [REMOTE_JWK] }),
      assertSessionAuthority: vi.fn().mockResolvedValue(undefined),
      auth: {
        issuer: ISSUER,
        url: "https://remote.example.supabase.co",
        publishableKey: "remote-publishable",
      },
      attestationSecret: SECRET,
      sessionBindingSecret: SECRET,
      nowSeconds: () => 1_800_000_100,
    });

    const response = await authorityFetch(
      "http://127.0.0.1:8000/storage/v1/object/recipe-images/owner/file.jpg",
      { method: "POST", body: "image" },
    );

    expect(response.status).toBe(200);
    const [, localInit] = localUpstreamFetch.mock.calls[0];
    const headers = new Headers(localInit.headers);
    expect(verifyHybridRequestAttestation({
      payload: headers.get("x-homecook-session-attestation")!,
      signature: headers.get(
        "x-homecook-session-attestation-signature",
      )!,
      secret: SECRET,
      method: "POST",
      path: "/object/recipe-images/owner/file.jpg",
      nowSeconds: 1_800_000_100,
    })).toMatchObject({ ok: true });
  });
});
