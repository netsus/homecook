import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  createRemoteRefreshAuthorityFetch,
  recordHybridSessionAuthorityBootstrap,
} from "@/lib/server/hybrid-auth/bootstrap";

const ISSUER = "https://remote.example.supabase.co/auth/v1";
const OWNER_UUID = "11111111-1111-4111-8111-111111111111";
const SESSION_UUID = "22222222-2222-4222-8222-222222222222";
const SECRET = "0123456789abcdef0123456789abcdef";

function accessToken(overrides: Record<string, unknown> = {}) {
  const now = 1_800_000_100;
  return [
    Buffer.from(JSON.stringify({
      alg: "ES256",
      kid: "remote-key",
      typ: "JWT",
    })).toString("base64url"),
    Buffer.from(JSON.stringify({
      iss: ISSUER,
      aud: "authenticated",
      role: "authenticated",
      sub: OWNER_UUID,
      session_id: SESSION_UUID,
      iat: now - 60,
      nbf: now - 60,
      exp: now + 600,
      ...overrides,
    })).toString("base64url"),
    "remote-signature-verified-by-auth-user",
  ].join(".");
}

describe("hybrid callback/refresh authority bootstrap", () => {
  it("records the exact remote identity epoch and HMAC session binding after remote callback verification", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { binding_state: "active" },
      error: null,
    });

    const result = await recordHybridSessionAuthorityBootstrap({
      accessToken: accessToken(),
      dbClient: { rpc },
      expectedIssuer: ISSUER,
      nowSeconds: () => 1_800_000_100,
      sessionBindingSecret: SECRET,
      user: {
        id: OWNER_UUID,
        created_at: "2026-07-28T00:00:00.000Z",
      },
    });

    expect(result).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith(
      "record_hybrid_remote_session_authority",
      expect.objectContaining({
        p_issuer: ISSUER,
        p_owner_uuid: OWNER_UUID,
        p_identity_created_at: "2026-07-28T00:00:00.000Z",
        p_remote_revision: 1_800_000_100,
        p_evidence_revision: 1_800_000_100,
        p_hmac_key_version: 1,
        p_access_token_expires_at: new Date(
          1_800_000_700 * 1_000,
        ).toISOString(),
        p_binding_expires_at: new Date(
          1_800_000_700 * 1_000,
        ).toISOString(),
        p_session_key_hash: createHmac("sha256", SECRET)
          .update([
            "v1",
            ISSUER,
            OWNER_UUID,
            "2026-07-28T00:00:00.000Z",
            SESSION_UUID,
          ].join("\n"))
          .digest("hex"),
      }),
    );
  });

  it("keeps a valid token bound after 120 seconds but never beyond JWT exp", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { binding_state: "active" },
      error: null,
    });

    const result = await recordHybridSessionAuthorityBootstrap({
      accessToken: accessToken({ exp: 1_800_000_700 }),
      dbClient: { rpc },
      expectedIssuer: ISSUER,
      nowSeconds: () => 1_800_000_221,
      sessionBindingSecret: SECRET,
      user: {
        id: OWNER_UUID,
        created_at: "2026-07-28T00:00:00.000Z",
      },
    });

    expect(result).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith(
      "record_hybrid_remote_session_authority",
      expect.objectContaining({
        p_access_token_expires_at: new Date(
          1_800_000_700 * 1_000,
        ).toISOString(),
        p_binding_expires_at: new Date(
          1_800_000_700 * 1_000,
        ).toISOString(),
      }),
    );
  });

  it("preserves maintenance separately from stale RPC bootstrap failures", async () => {
    const maintenanceRpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "55000",
        message: "ACCOUNT_LIFECYCLE_MAINTENANCE",
      },
    });
    const staleRpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "55000",
        details: "ACCOUNT_SESSION_STALE",
      },
    });

    await expect(recordHybridSessionAuthorityBootstrap({
      accessToken: accessToken(),
      dbClient: { rpc: maintenanceRpc },
      expectedIssuer: ISSUER,
      nowSeconds: () => 1_800_000_100,
      sessionBindingSecret: SECRET,
      user: {
        id: OWNER_UUID,
        created_at: "2026-07-28T00:00:00.000Z",
      },
    })).resolves.toEqual({ ok: false, reason: "maintenance" });

    await expect(recordHybridSessionAuthorityBootstrap({
      accessToken: accessToken(),
      dbClient: { rpc: staleRpc },
      expectedIssuer: ISSUER,
      nowSeconds: () => 1_800_000_100,
      sessionBindingSecret: SECRET,
      user: {
        id: OWNER_UUID,
        created_at: "2026-07-28T00:00:00.000Z",
      },
    })).resolves.toEqual({ ok: false, reason: "stale" });
  });

  it("fails closed without calling local authority for a mismatched or stale callback token", async () => {
    const rpc = vi.fn();

    const result = await recordHybridSessionAuthorityBootstrap({
      accessToken: accessToken({ sub: "33333333-3333-4333-8333-333333333333" }),
      dbClient: { rpc },
      expectedIssuer: ISSUER,
      nowSeconds: () => 1_800_000_100,
      sessionBindingSecret: SECRET,
      user: {
        id: OWNER_UUID,
        created_at: "2026-07-28T00:00:00.000Z",
      },
    });

    expect(result).toEqual({ ok: false, reason: "stale" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("bootstraps only an exact successful remote refresh after bounded remote user liveness", async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true });
    const remoteFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: accessToken(),
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: OWNER_UUID,
        created_at: "2026-07-28T00:00:00.000Z",
      }), { status: 200 }));
    const refreshFetch = createRemoteRefreshAuthorityFetch({
      auth: {
        publishableKey: "remote-publishable",
        url: "https://remote.example.supabase.co",
      },
      bootstrap,
      remoteFetch,
    });

    const response = await refreshFetch(
      "https://remote.example.supabase.co/auth/v1/token?grant_type=refresh_token",
      { method: "POST", body: "refresh_token=opaque" },
    );

    expect(response.status).toBe(200);
    expect(remoteFetch).toHaveBeenNthCalledWith(
      2,
      "https://remote.example.supabase.co/auth/v1/user",
      expect.objectContaining({
        method: "GET",
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          apikey: "remote-publishable",
          Authorization: `Bearer ${accessToken()}`,
        }),
      }),
    );
    expect(bootstrap).toHaveBeenCalledWith({
      accessToken: accessToken(),
      user: {
        id: OWNER_UUID,
        created_at: "2026-07-28T00:00:00.000Z",
      },
    });
  });

  it("never bootstraps ordinary auth requests or a failed refresh", async () => {
    const bootstrap = vi.fn();
    const remoteFetch = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      .mockResolvedValueOnce(new Response("revoked", { status: 401 }));
    const refreshFetch = createRemoteRefreshAuthorityFetch({
      auth: {
        publishableKey: "remote-publishable",
        url: "https://remote.example.supabase.co",
      },
      bootstrap,
      remoteFetch,
    });

    const ordinary = await refreshFetch(
      "https://remote.example.supabase.co/auth/v1/user",
      { method: "GET" },
    );
    const revoked = await refreshFetch(
      "https://remote.example.supabase.co/auth/v1/token?grant_type=refresh_token",
      { method: "POST" },
    );

    expect(ordinary.status).toBe(200);
    expect(revoked.status).toBe(409);
    expect(bootstrap).not.toHaveBeenCalled();
  });

  it("maps stalled refresh liveness to the existing 503 maintenance contract", async () => {
    const bootstrap = vi.fn();
    const remoteFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: accessToken(),
      }), { status: 200 }))
      .mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    const refreshFetch = createRemoteRefreshAuthorityFetch({
      auth: {
        publishableKey: "remote-publishable",
        url: "https://remote.example.supabase.co",
      },
      bootstrap,
      remoteFetch,
    });

    const response = await refreshFetch(
      "https://remote.example.supabase.co/auth/v1/token?grant_type=refresh_token",
      { method: "POST" },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "ACCOUNT_LIFECYCLE_MAINTENANCE",
    });
    expect(bootstrap).not.toHaveBeenCalled();
  });

  it("maps a maintenance bootstrap result to 503 instead of stale 409", async () => {
    const bootstrap = vi.fn().mockResolvedValue({
      ok: false,
      reason: "maintenance",
    });
    const remoteFetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: accessToken(),
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: OWNER_UUID,
        created_at: "2026-07-28T00:00:00.000Z",
      }), { status: 200 }));
    const refreshFetch = createRemoteRefreshAuthorityFetch({
      auth: {
        publishableKey: "remote-publishable",
        url: "https://remote.example.supabase.co",
      },
      bootstrap,
      remoteFetch,
    });

    const response = await refreshFetch(
      "https://remote.example.supabase.co/auth/v1/token?grant_type=refresh_token",
      { method: "POST" },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "ACCOUNT_LIFECYCLE_MAINTENANCE",
    });
  });

  it("bounds ordinary remote Auth fetches while composing the caller signal", async () => {
    const callerController = new AbortController();
    const remoteFetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        }, { once: true });
      }));
    const refreshFetch = createRemoteRefreshAuthorityFetch({
      auth: {
        publishableKey: "remote-publishable",
        url: "https://remote.example.supabase.co",
      },
      bootstrap: vi.fn(),
      remoteFetch,
      timeoutMs: 20,
    } as never);

    const response = await refreshFetch(
      "https://remote.example.supabase.co/auth/v1/user",
      { method: "GET", signal: callerController.signal },
    );

    expect(response.status).toBe(503);
    const forwardedSignal = remoteFetch.mock.calls[0]?.[1]?.signal;
    expect(forwardedSignal).toBeInstanceOf(AbortSignal);
    expect(forwardedSignal).not.toBe(callerController.signal);
  });
});
