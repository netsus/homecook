import {
  generateKeyPairSync,
  sign,
} from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  HybridSessionAuthorityError,
  createHybridAuthorityFetch,
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

describe("loopback session-authority gateway", () => {
  it("rechecks remote liveness and attests the exact local method/path", async () => {
    const token = accessToken();
    const remoteLivenessFetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        id: OWNER_UUID,
        created_at: "2026-07-30T00:00:00.000Z",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    const localUpstreamFetch = vi.fn().mockResolvedValue(
      new Response("{}", { status: 200 }),
    );
    const persistSessionAuthority = vi.fn().mockResolvedValue(undefined);
    const authorityFetch = createHybridAuthorityFetch({
      getAccessToken: async () => token,
      remoteLivenessFetch,
      localUpstreamFetch,
      loadRemoteJwks: async () => ({ keys: [REMOTE_JWK] }),
      persistSessionAuthority,
      auth: {
        issuer: ISSUER,
        url: "https://remote.example.supabase.co",
        publishableKey: "remote-publishable",
      },
      attestationSecret: SECRET,
      sessionBindingSecret: SECRET,
      nowSeconds: () => 1_800_000_100,
    });

    await authorityFetch("http://127.0.0.1:8000/rest/v1/meals", {
      method: "POST",
      body: "{}",
    });

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
    expect(persistSessionAuthority).toHaveBeenCalledWith(
      expect.objectContaining({
        binding: expect.objectContaining({
          owner_uuid: OWNER_UUID,
          binding_state: "active",
        }),
        remoteIdentityDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
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

  it.each([
    ["revoked session", new Response('{"code":"session_not_found"}', { status: 401 })],
    ["remote outage", new Error("remote unavailable")],
  ])("fails closed on %s without calling local Data/Storage", async (_label, remoteResult) => {
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
      persistSessionAuthority: vi.fn(),
      auth: {
        issuer: ISSUER,
        url: "https://remote.example.supabase.co",
        publishableKey: "remote-publishable",
      },
      attestationSecret: SECRET,
      sessionBindingSecret: SECRET,
      nowSeconds: () => 1_800_000_100,
    });

    await expect(
      authorityFetch("http://127.0.0.1:8000/storage/v1/object/recipe-images/a", {
        method: "DELETE",
      }),
    ).rejects.toBeInstanceOf(HybridSessionAuthorityError);
    expect(localUpstreamFetch).not.toHaveBeenCalled();
  });

  it("rejects a remote user/claim mismatch before local access", async () => {
    const remoteLivenessFetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        id: "33333333-3333-4333-8333-333333333333",
        created_at: "2026-07-30T00:00:00.000Z",
      }),
      { status: 200 },
    ));
    const localUpstreamFetch = vi.fn();
    const authorityFetch = createHybridAuthorityFetch({
      getAccessToken: async () => accessToken(),
      remoteLivenessFetch,
      localUpstreamFetch,
      loadRemoteJwks: async () => ({ keys: [REMOTE_JWK] }),
      persistSessionAuthority: vi.fn(),
      auth: {
        issuer: ISSUER,
        url: "https://remote.example.supabase.co",
        publishableKey: "remote-publishable",
      },
      attestationSecret: SECRET,
      sessionBindingSecret: SECRET,
      nowSeconds: () => 1_800_000_100,
    });

    await expect(
      authorityFetch("http://127.0.0.1:8000/rest/v1/users", { method: "GET" }),
    ).rejects.toMatchObject({ publicCode: "ACCOUNT_SESSION_STALE" });
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
      persistSessionAuthority: vi.fn(),
      auth: {
        issuer: ISSUER,
        url: "https://remote.example.supabase.co",
        publishableKey: "remote-publishable",
      },
      attestationSecret: SECRET,
      sessionBindingSecret: SECRET,
      nowSeconds: () => 1_800_000_100,
    });

    await expect(
      authorityFetch("http://127.0.0.1:8000/rest/v1/users"),
    ).rejects.toBeInstanceOf(HybridSessionAuthorityError);
    expect(remoteLivenessFetch).not.toHaveBeenCalled();
    expect(localUpstreamFetch).not.toHaveBeenCalled();
  });

  it("fails closed when the local authority binding cannot be refreshed", async () => {
    const remoteLivenessFetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        id: OWNER_UUID,
        created_at: "2026-07-30T00:00:00.000Z",
      }),
      { status: 200 },
    ));
    const localUpstreamFetch = vi.fn();
    const authorityFetch = createHybridAuthorityFetch({
      getAccessToken: async () => accessToken(),
      remoteLivenessFetch,
      localUpstreamFetch,
      loadRemoteJwks: async () => ({ keys: [REMOTE_JWK] }),
      persistSessionAuthority: vi.fn().mockRejectedValue(
        new Error("local authority unavailable"),
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

    await expect(
      authorityFetch("http://127.0.0.1:8000/rest/v1/meals", {
        method: "POST",
      }),
    ).rejects.toBeInstanceOf(HybridSessionAuthorityError);
    expect(localUpstreamFetch).not.toHaveBeenCalled();
  });
});
