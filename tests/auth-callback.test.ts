import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const getSession = vi.fn();
const getUser = vi.fn();
const signOut = vi.fn();
const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();
const cookies = vi.fn();
const cookieGet = vi.fn();
const cookieGetAll = vi.fn();

function createServiceRoleUserLookup(
  existingUser: { id: string; social_provider: string } | null = null,
  capabilityResult: {
    data: {
      state: "legacy" | "cutover_maintenance" | "generation_active";
      revision: number;
    } | null;
    error: { message: string } | null;
  } = {
    data: { state: "legacy", revision: 1 },
    error: null,
  },
) {
  const usersQuery = {
    eq: vi.fn(() => usersQuery),
    is: vi.fn(() => usersQuery),
    maybeSingle: vi.fn().mockResolvedValue({ data: existingUser, error: null }),
  };
  const rpc = vi.fn().mockResolvedValue(capabilityResult);

  return {
    client: {
      from: vi.fn(() => ({ select: vi.fn(() => usersQuery) })),
      rpc,
    },
    rpc,
    usersQuery,
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("next/headers", () => ({
  cookies,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  normalizeUserEmail: (value: unknown) => {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim().toLowerCase();
    return normalized || null;
  },
}));

describe("auth callback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    getSession.mockReset();
    getUser.mockReset();
    signOut.mockReset();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    cookies.mockReset();
    cookieGet.mockReset();
    cookieGetAll.mockReset();

    const routeClient = {
      auth: {
        exchangeCodeForSession,
        getSession,
        getUser,
        signOut,
      },
    };

    createRouteHandlerClient.mockResolvedValue(routeClient);
    createServiceRoleClient.mockReturnValue(createServiceRoleUserLookup().client);
    cookies.mockResolvedValue({
      get: cookieGet,
      getAll: cookieGetAll,
    });
    cookieGet.mockReturnValue(undefined);
    cookieGetAll.mockReturnValue([]);
    getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "cook@example.com",
          app_metadata: { provider: "google" },
          user_metadata: {
            nickname: "집밥러",
          },
          identities: [
            {
              provider: "google",
              last_sign_in_at: "2026-07-10T09:00:00.000Z",
              identity_data: { email_verified: true },
            },
          ],
        },
      },
    });
    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
  });

  it("sanitizes external redirect targets", async () => {
    const { resolveNextPath } = await import("@/lib/auth/callback");

    expect(resolveNextPath("https://evil.example")).toBe("/");
    expect(resolveNextPath("//evil.example")).toBe("/");
    expect(resolveNextPath("/recipe/abc")).toBe("/recipe/abc");
  });

  it("adds authError when OAuth exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: new Error("oauth failed"),
    });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new Request(
        "http://localhost:3000/auth/callback?code=abc&next=/recipe/mock-kimchi-jjigae",
        { headers: { Cookie: "sb-homecook-auth-token=partial-session" } },
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/recipe/mock-kimchi-jjigae?authError=oauth_failed",
    );
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.headers.get("set-cookie") ?? "")
      .toMatch(/sb-homecook-auth-token=;.*Max-Age=0/i);
  });

  it("redirects login-page OAuth failures back to /login with authError", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: new Error("oauth failed"),
    });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new Request("http://localhost:3000/auth/callback?code=abc&next=/"),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?authError=oauth_failed",
    );
  });

  it("adds authError when the provider returns without a code", async () => {
    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new Request(
        "http://localhost:3000/auth/callback?error=access_denied&next=/",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?authError=oauth_failed",
    );
  });

  it("adds authError when Supabase client throws", async () => {
    exchangeCodeForSession.mockRejectedValue(new Error("network error"));

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new Request(
        "http://localhost:3000/auth/callback?code=abc&next=/recipe/kimchi",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/recipe/kimchi?authError=oauth_failed",
    );
  });

  it("expires Supabase auth cookies when code exchange throws", async () => {
    exchangeCodeForSession.mockRejectedValue(new Error("network error"));

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/callback?code=abc&attemptedProvider=google",
      { headers: { Cookie: "sb-homecook-auth-token=partial-session" } },
    ));

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/sb-homecook-auth-token=;.*Max-Age=0/i);
    expect(setCookie).not.toContain("partial-session");
  });

  it("fails closed when getUser returns an error", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({
      data: { user: null },
      error: new Error("auth user lookup failed"),
    });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/callback?code=abc&attemptedProvider=google",
    ));

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("authError"))
      .toBe("oauth_failed");
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
  });

  it("blocks the same normalized email when it belongs to a different user id", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: null,
    });
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "naver-auth-user",
          email: "cook@example.com",
          app_metadata: { provider: "custom:naver" },
          user_metadata: {
            nickname: "집밥러",
            sub: "naver-sub",
          },
          identities: [
            {
              provider: "custom:naver",
              last_sign_in_at: "2026-07-10T09:00:00.000Z",
              identity_data: { sub: "naver-sub", email_verified: true },
            },
            {
              provider: "kakao",
              last_sign_in_at: "2026-07-10T10:00:00.000Z",
              identity_data: { sub: "kakao-sub", email_verified: true },
            },
          ],
        },
      },
    });

    const lookup = createServiceRoleUserLookup({
      id: "google-auth-user",
      social_provider: "google",
    });
    createServiceRoleClient.mockReturnValue(lookup.client);

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new Request(
        "http://localhost:3000/auth/callback?code=abc&attemptedProvider=naver&next=/planner",
      ),
    );

    const redirectUrl = new URL(response.headers.get("location") ?? "");
    expect(redirectUrl.pathname).toBe("/login");
    expect(redirectUrl.searchParams.get("authError")).toBe("account_conflict");
    expect(redirectUrl.searchParams.has("expectedProvider")).toBe(false);
    expect(redirectUrl.searchParams.has("attemptedProvider")).toBe(false);
    expect(redirectUrl.searchParams.get("next")).toBe("/planner");
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
    expect(ensureUserBootstrapState).not.toHaveBeenCalled();
  });

  it("allows a linked provider login when normalized email and user id match", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: " Cook@Example.COM ",
          app_metadata: { provider: "google" },
          user_metadata: { nickname: "집밥러", sub: "naver-sub" },
          identities: [
            {
              provider: "custom:naver",
              last_sign_in_at: "2026-07-10T09:00:00.000Z",
              identity_data: { sub: "naver-sub", email_verified: true },
            },
            {
              provider: "kakao",
              last_sign_in_at: "2026-07-10T10:00:00.000Z",
              identity_data: { sub: "kakao-sub", email_verified: true },
            },
          ],
        },
      },
    });
    const lookup = createServiceRoleUserLookup({ id: "user-1", social_provider: "google" });
    createServiceRoleClient.mockReturnValue(lookup.client);

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/callback?code=abc&attemptedProvider=naver&next=/planner",
    ));

    expect(response.headers.get("location")).toBe("http://localhost:3000/planner");
    expect(lookup.usersQuery.eq).toHaveBeenCalledWith("email", "cook@example.com");
    expect(response.headers.get("set-cookie")).toContain("homecook-last-auth-provider=naver");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("rejects a missing email and never bootstraps", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({
      data: { user: {
        id: "user-1",
        email: "   ",
        app_metadata: { provider: "google" },
        user_metadata: {},
        identities: [{ provider: "google", identity_data: { email_verified: true } }],
      } },
    });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/callback?code=abc&attemptedProvider=google",
    ));

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("authError"))
      .toBe("email_required");
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
    expect(ensureUserBootstrapState).not.toHaveBeenCalled();
  });

  it("rejects explicitly unverified identity email metadata", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({
      data: { user: {
        id: "user-1",
        email: "cook@example.com",
        app_metadata: { provider: "google" },
        user_metadata: { sub: "google-sub" },
        identities: [
          {
            provider: "google",
            last_sign_in_at: "2026-07-10T09:00:00.000Z",
            identity_data: { sub: "google-sub", email_verified: false },
          },
          {
            provider: "kakao",
            last_sign_in_at: "2026-07-10T10:00:00.000Z",
            identity_data: { sub: "kakao-sub", email_verified: true },
          },
        ],
      } },
    });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/callback?code=abc&attemptedProvider=google",
    ));

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("authError"))
      .toBe("email_required");
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
  });

  it("rejects explicitly invalid user email metadata", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({
      data: { user: {
        id: "user-1",
        email: "cook@example.com",
        app_metadata: { provider: "kakao" },
        user_metadata: { is_email_valid: false },
        identities: [{
          provider: "kakao",
          identity_data: {},
        }],
      } },
    });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/callback?code=abc&attemptedProvider=kakao",
    ));

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("authError"))
      .toBe("email_required");
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
  });

  it("rejects email without any positive verification evidence", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({ data: { user: {
      id: "user-1",
      email: "cook@example.com",
      email_confirmed_at: null,
      app_metadata: { provider: "google" },
      user_metadata: {},
      identities: [{ provider: "google", identity_data: {} }],
    } } });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/callback?code=abc&attemptedProvider=google",
    ));

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("authError"))
      .toBe("email_required");
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
  });

  it("fails closed when the service-role client is unavailable", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    createServiceRoleClient.mockReturnValue(null);

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/callback?code=abc&attemptedProvider=google",
    ));

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("authError"))
      .toBe("oauth_failed");
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
  });

  it("clears the partial session when the account capability cannot be read", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const lookup = createServiceRoleUserLookup(null, {
      data: null,
      error: { message: "capability unavailable" },
    });
    createServiceRoleClient.mockReturnValue(lookup.client);
    cookieGetAll.mockReturnValue([
      { name: "sb-homecook-auth-token", value: "partial-session" },
    ]);

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/callback?code=abc&attemptedProvider=google&next=/planner",
    ));

    const redirectUrl = new URL(response.headers.get("location") ?? "");
    expect(redirectUrl.pathname).toBe("/planner");
    expect(redirectUrl.searchParams.get("authError")).toBe("oauth_failed");
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.headers.get("set-cookie") ?? "")
      .toMatch(/sb-homecook-auth-token=;.*Max-Age=0/i);
    expect(lookup.usersQuery.maybeSingle).not.toHaveBeenCalled();
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
    expect(ensureUserBootstrapState).not.toHaveBeenCalled();
  });

  it("clears the partial session and exposes the exact maintenance signal", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const lookup = createServiceRoleUserLookup(null, {
      data: { state: "cutover_maintenance", revision: 2 },
      error: null,
    });
    createServiceRoleClient.mockReturnValue(lookup.client);
    cookieGetAll.mockReturnValue([
      { name: "sb-homecook-auth-token", value: "partial-session" },
    ]);

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/callback?code=abc&attemptedProvider=google&next=/planner",
    ));

    const redirectUrl = new URL(response.headers.get("location") ?? "");
    expect(redirectUrl.pathname).toBe("/login");
    expect(redirectUrl.searchParams.get("authError"))
      .toBe("ACCOUNT_LIFECYCLE_MAINTENANCE");
    expect(redirectUrl.searchParams.get("next")).toBe("/planner");
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.headers.get("set-cookie") ?? "")
      .toMatch(/sb-homecook-auth-token=;.*Max-Age=0/i);
    expect(lookup.usersQuery.maybeSingle).not.toHaveBeenCalled();
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
    expect(ensureUserBootstrapState).not.toHaveBeenCalled();
  });

  it("never falls back to UUID-only legacy bootstrap after generation activation", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    const lookup = createServiceRoleUserLookup(null, {
      data: { state: "generation_active", revision: 3 },
      error: null,
    });
    createServiceRoleClient.mockReturnValue(lookup.client);
    cookieGetAll.mockReturnValue([
      { name: "sb-homecook-auth-token", value: "generation-session" },
    ]);

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/callback?code=abc&attemptedProvider=google&next=/planner",
    ));

    const redirectUrl = new URL(response.headers.get("location") ?? "");
    expect(redirectUrl.pathname).toBe("/login");
    expect(redirectUrl.searchParams.get("authError")).toBe("ACCOUNT_SESSION_STALE");
    expect(redirectUrl.searchParams.get("next")).toBe("/planner");
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.headers.get("set-cookie") ?? "")
      .toMatch(/sb-homecook-auth-token=;.*Max-Age=0/i);
    expect(lookup.usersQuery.maybeSingle).not.toHaveBeenCalled();
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
    expect(ensureUserBootstrapState).not.toHaveBeenCalled();
  });

  it("preserves the verified session and return intent for quarantined accounts", async () => {
    const ownerUuid = "76000000-0000-4000-8000-000000000001";
    const sessionId = "76000000-0000-4000-8000-000000000002";
    const identityCreatedAt = "2026-07-23T10:00:00.000Z";
    const issuedAt = Math.floor(Date.now() / 1_000) - 10;
    const expiresAt = issuedAt + 3_600;
    const accessToken = [
      Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url"),
      Buffer.from(JSON.stringify({
        aud: "authenticated",
        exp: expiresAt,
        iat: issuedAt,
        iss: "https://example.supabase.co/auth/v1",
        session_id: sessionId,
        sub: ownerUuid,
      })).toString("base64url"),
      "signature",
    ].join(".");
    const user = {
      id: ownerUuid,
      created_at: identityCreatedAt,
      email: "quarantined@example.com",
      email_confirmed_at: identityCreatedAt,
      app_metadata: { provider: "google" },
      user_metadata: {
        nickname: "격리 사용자",
        sub: "quarantined-social-id",
      },
      identities: [{
        provider: "google",
        identity_data: { email_verified: true },
      }],
    };
    const lookup = createServiceRoleUserLookup(null, {
      data: { state: "generation_active", revision: 3 },
      error: null,
    });
    lookup.rpc.mockImplementation((name: string) => {
      if (name === "get_account_generation_capability") {
        return Promise.resolve({
          data: { state: "generation_active", revision: 3 },
          error: null,
        });
      }
      if (name === "bootstrap_account_generation_identity") {
        return Promise.resolve({
          data: null,
          error: {
            code: "P0001",
            message: "ACCOUNT_CUTOVER_QUARANTINED",
          },
        });
      }
      throw new Error(`unexpected rpc: ${name}`);
    });
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: accessToken } },
      error: null,
    });
    getUser.mockResolvedValue({
      data: { user },
      error: null,
    });
    createServiceRoleClient.mockReturnValue(lookup.client);
    cookieGetAll.mockReturnValue([
      { name: "sb-homecook-auth-token", value: "verified-session" },
    ]);
    vi.stubEnv(
      "HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1",
      "auth-callback-session-hmac-secret-32-bytes-minimum",
    );
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/callback?code=abc&attemptedProvider=google&next=/planner",
    ));

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/account-quarantine?next=%2Fplanner",
    );
    expect(signOut).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie") ?? "")
      .not.toContain("sb-homecook-auth-token=");
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
    expect(ensureUserBootstrapState).not.toHaveBeenCalled();
  });

  it("bootstraps a verified post-cutover identity through the generation adapter", async () => {
    const ownerUuid = "76000000-0000-4000-8000-000000000001";
    const sessionId = "76000000-0000-4000-8000-000000000002";
    const identityCreatedAt = "2026-07-23T10:00:00.000Z";
    const issuedAt = Math.floor(Date.now() / 1_000) - 10;
    const expiresAt = issuedAt + 3_600;
    const accessToken = [
      Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url"),
      Buffer.from(JSON.stringify({
        aud: "authenticated",
        exp: expiresAt,
        iat: issuedAt,
        iss: "https://example.supabase.co/auth/v1",
        session_id: sessionId,
        sub: ownerUuid,
      })).toString("base64url"),
      "signature",
    ].join(".");
    const user = {
      id: ownerUuid,
      created_at: identityCreatedAt,
      email: "post-cutover@example.com",
      email_confirmed_at: identityCreatedAt,
      app_metadata: { provider: "google" },
      user_metadata: {
        nickname: "새 집밥러",
        sub: "post-cutover-social-id",
      },
      identities: [{
        provider: "google",
        identity_data: { email_verified: true },
      }],
    };
    const lookup = createServiceRoleUserLookup(null, {
      data: { state: "generation_active", revision: 3 },
      error: null,
    });
    lookup.rpc.mockImplementation((name: string) => {
      if (name === "get_account_generation_capability") {
        return Promise.resolve({
          data: { state: "generation_active", revision: 3 },
          error: null,
        });
      }
      if (name === "bootstrap_account_generation_identity") {
        return Promise.resolve({
          data: {
            account_generation: 1,
            nickname: "새 집밥러",
          },
          error: null,
        });
      }
      throw new Error(`unexpected rpc: ${name}`);
    });
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: accessToken } },
      error: null,
    });
    getSession.mockResolvedValue({
      data: { session: { access_token: accessToken } },
      error: null,
    });
    getUser.mockResolvedValue({
      data: { user },
      error: null,
    });
    createServiceRoleClient.mockReturnValue(lookup.client);
    vi.stubEnv(
      "HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1",
      "auth-callback-session-hmac-secret-32-bytes-minimum",
    );
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/callback?code=abc&attemptedProvider=google&next=/planner",
    ));

    expect(response.headers.get("location")).toBe("http://localhost:3000/planner");
    expect(lookup.rpc).toHaveBeenCalledWith(
      "bootstrap_account_generation_identity",
      expect.objectContaining({
        p_auth_identity_created_at_snapshot: identityCreatedAt,
        p_hmac_key_version: 1,
        p_owner_uuid: ownerUuid,
        p_session_issued_at: new Date(issuedAt * 1_000).toISOString(),
        p_session_key_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
    expect(ensureUserBootstrapState).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("fails provider resolution when query and cookie attempts conflict", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    cookieGet.mockImplementation((name: string) => name === "homecook-auth-provider-attempt"
      ? { value: "naver" }
      : undefined);

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/callback?code=abc&attemptedProvider=google",
    ));

    const redirectUrl = new URL(response.headers.get("location") ?? "");
    expect(redirectUrl.searchParams.get("authError")).toBe("provider_resolution_failed");
    expect(response.headers.get("set-cookie")).not.toContain("homecook-last-auth-provider=google");
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
  });

  it("expires Supabase auth cookies even when signOut throws", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    signOut.mockRejectedValue(new Error("sign out unavailable"));
    getUser.mockResolvedValue({ data: { user: {
      id: "user-1",
      email: null,
      app_metadata: { provider: "google" },
      user_metadata: {},
      identities: [{ provider: "google", identity_data: { email_verified: true } }],
    } } });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/callback?code=abc&attemptedProvider=google",
      { headers: { Cookie: "sb-homecook-auth-token=secret-session" } },
    ));

    const setCookie = response.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("sb-homecook-auth-token=");
    expect(setCookie).toMatch(/sb-homecook-auth-token=;.*Max-Age=0/i);
    expect(setCookie).not.toContain("secret-session");
  });

  it("expires newly created chunked auth and code-verifier cookies from the cookie store", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    signOut.mockRejectedValue(new Error("sign out unavailable"));
    getUser.mockResolvedValue({ data: { user: null }, error: new Error("user failed") });
    cookieGetAll.mockReturnValue([
      { name: "sb-homecook-auth-token.0", value: "new-session-0" },
      { name: "sb-homecook-auth-token.1", value: "new-session-1" },
      { name: "sb-homecook-auth-token-code-verifier", value: "verifier" },
      { name: "homecook-theme", value: "dark" },
    ]);

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/callback?code=abc&attemptedProvider=google",
    ));
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(setCookie).toContain("sb-homecook-auth-token.0=");
    expect(setCookie).toContain("sb-homecook-auth-token.1=");
    expect(setCookie).toContain("sb-homecook-auth-token-code-verifier=");
    expect(setCookie).not.toContain("homecook-theme=");
    expect(setCookie).not.toContain("new-session");
    expect(setCookie).not.toContain("=verifier");
  });

  it("clears the partial session and stops after a post-exchange database exception", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: null });
    createServiceRoleClient.mockReturnValue({
      from: vi.fn(() => {
        throw new Error("database unavailable");
      }),
    });
    cookieGetAll.mockReturnValue([
      { name: "sb-homecook-auth-token", value: "new-session" },
    ]);

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/callback?code=abc&attemptedProvider=google",
    ));

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("authError"))
      .toBe("oauth_failed");
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(response.headers.get("set-cookie") ?? "").toContain("sb-homecook-auth-token=");
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
    expect(ensureUserBootstrapState).not.toHaveBeenCalled();
  });

  it("bootstraps public user data after successful OAuth exchange", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: null,
    });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new Request("http://localhost:3000/auth/callback?code=abc&attemptedProvider=google&next=/planner"),
    );

    expect(ensurePublicUserRow).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(Function) }),
      expect.objectContaining({
        id: "user-1",
      }),
    );
    expect(ensureUserBootstrapState).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(Function) }),
      "user-1",
    );
    expect(response.headers.get("location")).toBe("http://localhost:3000/planner");
  });

  it("redirects newly bootstrapped users with empty nicknames to nickname onboarding", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: null,
    });
    ensurePublicUserRow.mockResolvedValueOnce({
      nickname: "",
    });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new Request("http://localhost:3000/auth/callback?code=abc&attemptedProvider=google&next=/planner"),
    );

    expect(ensureUserBootstrapState).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(Function) }),
      "user-1",
    );
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/onboarding/nickname?next=%2Fplanner",
    );
  });

  it("falls back to the saved post-auth next cookie when the callback query omits next", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: null,
    });
    cookieGet.mockImplementation((name: string) => {
      if (name === "homecook-post-auth-next") {
        return { value: "%2Fplanner" };
      }

      if (name === "homecook-auth-provider-attempt") {
        return { value: "google" };
      }

      return undefined;
    });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new Request("http://localhost:3000/auth/callback?code=abc"),
    );

    expect(response.headers.get("location")).toBe("http://localhost:3000/planner");
  });
});
