import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeMealLogRequest } from "@/lib/server/meal-log-route";

const mocks = vi.hoisted(() => ({ route: vi.fn(), verified: vi.fn(), internal: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route, createCookedBatchInternalClient: mocks.internal }));
vi.mock("@/lib/server/account-generation/session-authority", () => ({ readVerifiedAccountGenerationSession: mocks.verified }));

const ownerId = "550e8400-e29b-41d4-a716-446655440001";
const authority = { ownerUuid: ownerId, authIdentityCreatedAt: "2026-10-01T00:00:00Z",
  sessionKeyHash: "fixture-hash", hmacKeyVersion: 1, sessionIssuedAt: "2026-10-19T00:00:00Z" };

describe("meal-log bootstrap authorization contract", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(["success", "guest", "stale", "bootstrap-error"] as const)("preserves the %s call order and failure boundary", async mode => {
    const calls: string[] = [];
    const client = createClient("http://bootstrap-meal.invalid", "public-test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        expect(init?.method ?? "GET").toBe("GET");
        expect(url.pathname).toBe("/rest/v1/users");
        expect(url.searchParams.get("id")).toBe(`eq.${ownerId}`);
        expect(url.searchParams.get("select")).toBe("id,nickname,email,profile_image_url,settings_json");
        calls.push("users");
        return new Response(JSON.stringify(mode === "bootstrap-error"
          ? { code: "XX000", message: "fixture input read failed" }
          : [{ id: ownerId, nickname: "fixture", email: null, profile_image_url: null, settings_json: { user_bootstrap_version: 3 } }]), {
          status: mode === "bootstrap-error" ? 500 : 200, headers: { "content-type": "application/json" },
        });
      } },
    });
    const requestClient = { from: client.from.bind(client), auth: { getUser: async () => {
      calls.push("auth");
      return { data: { user: mode === "guest" ? null : { id: ownerId, app_metadata: {}, user_metadata: {} } }, error: null };
    } } };
    mocks.route.mockResolvedValue(requestClient);
    mocks.verified.mockImplementation(async value => {
      expect(value).toBe(requestClient);
      calls.push("verified");
      return { ok: true, sessionAuthority: mode === "stale" ? { ...authority, ownerUuid: "other-owner" } : authority };
    });
    const internalClient = { rpc: vi.fn() };
    mocks.internal.mockImplementation(() => { calls.push("internal"); return internalClient; });

    const result = await authorizeMealLogRequest();
    if (mode === "success") {
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error("expected authorized result");
      expect(result.client).toBe(internalClient);
      expect(result.authorityArgs).toEqual({ p_owner_uuid: ownerId,
        p_auth_identity_created_at_snapshot: authority.authIdentityCreatedAt, p_session_key_hash: authority.sessionKeyHash,
        p_hmac_key_version: 1, p_session_issued_at: authority.sessionIssuedAt });
      expect(calls).toEqual(["auth", "users", "users", "verified", "internal"]);
    } else {
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error("expected rejected result");
      expect(result.response.status).toBe(mode === "guest" ? 401 : mode === "stale" ? 409 : 500);
      expect(await result.response.json()).toMatchObject({ success: false, data: null, error: {
        code: mode === "guest" ? "UNAUTHORIZED" : mode === "stale" ? "ACCOUNT_SESSION_STALE" : "INTERNAL_ERROR", fields: [],
      } });
      expect(calls).toEqual(mode === "guest" ? ["auth"] : mode === "stale" ? ["auth", "users", "users", "verified"] : ["auth", "users"]);
    }
    expect(internalClient.rpc).not.toHaveBeenCalled();
  });
});
