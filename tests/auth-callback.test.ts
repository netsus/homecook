import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const getUser = vi.fn();
const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
}));

describe("auth callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    getUser.mockReset();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();

    const routeClient = {
      auth: {
        exchangeCodeForSession,
        getUser,
      },
    };

    createRouteHandlerClient.mockResolvedValue(routeClient);
    createServiceRoleClient.mockReturnValue(null);
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
});
