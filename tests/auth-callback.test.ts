import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const getUser = vi.fn();
const signOut = vi.fn();
const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();
const cookies = vi.fn();
const cookieGet = vi.fn();

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
}));

describe("auth callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    getUser.mockReset();
    signOut.mockReset();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    cookies.mockReset();
    cookieGet.mockReset();

    const routeClient = {
      auth: {
        exchangeCodeForSession,
        getUser,
        signOut,
      },
    };

    createRouteHandlerClient.mockResolvedValue(routeClient);
    createServiceRoleClient.mockReturnValue(null);
    cookies.mockResolvedValue({
      get: cookieGet,
    });
    cookieGet.mockReturnValue(undefined);
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "cook@example.com",
          app_metadata: { provider: "google" },
          user_metadata: {
            nickname: "집밥러",
          },
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
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/recipe/mock-kimchi-jjigae?authError=oauth_failed",
    );
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

  it("blocks OAuth callbacks when the email belongs to a different provider", async () => {
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
          },
        },
      },
    });

    const usersQuery = {
      eq: vi.fn(() => usersQuery),
      is: vi.fn(() => usersQuery),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "google-auth-user",
          social_provider: "google",
        },
        error: null,
      }),
    };
    const usersTable = {
      select: vi.fn(() => usersQuery),
    };
    createServiceRoleClient.mockReturnValue({
      from: vi.fn(() => usersTable),
    });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new Request(
        "http://localhost:3000/auth/callback?code=abc&attemptedProvider=naver&next=/planner",
      ),
    );

    const redirectUrl = new URL(response.headers.get("location") ?? "");
    expect(redirectUrl.pathname).toBe("/login");
    expect(redirectUrl.searchParams.get("authError")).toBe("provider_mismatch");
    expect(redirectUrl.searchParams.get("expectedProvider")).toBe("google");
    expect(redirectUrl.searchParams.get("attemptedProvider")).toBe("naver");
    expect(redirectUrl.searchParams.get("next")).toBe("/planner");
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
    expect(ensureUserBootstrapState).not.toHaveBeenCalled();
  });

  it("bootstraps public user data after successful OAuth exchange", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: null,
    });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new Request("http://localhost:3000/auth/callback?code=abc&next=/planner"),
    );

    expect(ensurePublicUserRow).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({
          getUser,
        }),
      }),
      expect.objectContaining({
        id: "user-1",
      }),
    );
    expect(ensureUserBootstrapState).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({
          getUser,
        }),
      }),
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
      new Request("http://localhost:3000/auth/callback?code=abc&next=/planner"),
    );

    expect(ensureUserBootstrapState).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({
          getUser,
        }),
      }),
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
    cookieGet.mockReturnValue({
      value: "%2Fplanner",
    });

    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(
      new Request("http://localhost:3000/auth/callback?code=abc"),
    );

    expect(response.headers.get("location")).toBe("http://localhost:3000/planner");
  });
});
