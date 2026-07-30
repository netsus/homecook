import { beforeEach, describe, expect, it, vi } from "vitest";

const createSessionLogoutInternalDataClient = vi.fn();
const getAuthSupabaseEnv = vi.fn();
const getDataAuthority = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSessionLogoutInternalDataClient,
}));

vi.mock("@/lib/supabase/auth-env", () => ({
  getAuthSupabaseEnv,
}));

vi.mock("@/lib/supabase/data-env", () => ({
  getDataAuthority,
}));

const ISSUER = "https://remote.example.supabase.co/auth/v1";
const OWNER_UUID = "11111111-1111-4111-8111-111111111111";
const SESSION_UUID = "22222222-2222-4222-8222-222222222222";

function accessToken() {
  const now = Math.floor(Date.now() / 1_000);
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
      iat: now - 30,
      nbf: now - 30,
      exp: now + 600,
    })).toString("base64url"),
    "verified-by-remote-auth-user",
  ].join(".");
}

function authClient() {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: accessToken() } },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: OWNER_UUID,
            created_at: "2026-07-28T00:00:00.000Z",
          },
        },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
  };
}

describe("hybrid logout authority", () => {
  beforeEach(() => {
    createSessionLogoutInternalDataClient.mockReset();
    getAuthSupabaseEnv.mockReset();
    getDataAuthority.mockReset();
    getDataAuthority.mockReturnValue("local");
    getAuthSupabaseEnv.mockReturnValue({ issuer: ISSUER });
    process.env.HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1 =
      "0123456789abcdef0123456789abcdef";
  });

  it("fails closed and never signs out remotely when local revoke affects no active binding", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { revoked: false },
      error: null,
    });
    createSessionLogoutInternalDataClient.mockReturnValue({ rpc });
    const client = authClient();
    const { executeHybridLogout } =
      await import("@/lib/server/hybrid-auth/logout");

    const result = await executeHybridLogout(client);

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "ACCOUNT_SESSION_STALE",
        status: 409,
      }),
    });
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  it("fails closed before the RPC when the binding HMAC secret is unavailable", async () => {
    process.env.HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1 = "short";
    const rpc = vi.fn();
    createSessionLogoutInternalDataClient.mockReturnValue({ rpc });
    const client = authClient();
    const { executeHybridLogout } =
      await import("@/lib/server/hybrid-auth/logout");

    const result = await executeHybridLogout(client);

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: "ACCOUNT_SESSION_STALE",
        status: 409,
      }),
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(client.auth.signOut).not.toHaveBeenCalled();
  });

  it("signs out remotely only after the exact local binding is revoked", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { revoked: true },
      error: null,
    });
    createSessionLogoutInternalDataClient.mockReturnValue({ rpc });
    const client = authClient();
    const { executeHybridLogout } =
      await import("@/lib/server/hybrid-auth/logout");

    const result = await executeHybridLogout(client);

    expect(result).toEqual({ ok: true });
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
