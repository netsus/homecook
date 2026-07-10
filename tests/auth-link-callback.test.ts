import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const getUser = vi.fn();
const getSession = vi.fn();
const setSession = vi.fn();
const signOut = vi.fn();
const createRouteHandlerClient = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();
const cookies = vi.fn();
const cookieGet = vi.fn();
const cookieGetAll = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
}));

vi.mock("next/headers", () => ({ cookies }));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
}));

function userWithProviders(id: string, providers: string[]) {
  return {
    id,
    identities: providers.map((provider, index) => ({
      id: `identity-${index}`,
      provider,
      last_sign_in_at: `2026-07-10T0${index + 1}:00:00.000Z`,
      identity_data: {},
    })),
  };
}

describe("auth link callback", () => {
  beforeEach(() => {
    vi.resetModules();
    exchangeCodeForSession.mockReset();
    getUser.mockReset();
    getSession.mockReset();
    setSession.mockReset();
    signOut.mockReset();
    createRouteHandlerClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    cookies.mockReset();
    cookieGet.mockReset();
    cookieGetAll.mockReset();

    createRouteHandlerClient.mockResolvedValue({
      auth: { exchangeCodeForSession, getUser, getSession, setSession, signOut },
    });
    cookies.mockResolvedValue({ get: cookieGet, getAll: cookieGetAll });
    cookieGet.mockReturnValue(undefined);
    cookieGetAll.mockReturnValue([]);
    getSession.mockResolvedValue({
      data: {
        session: {
          access_token: "existing-access-token",
          refresh_token: "existing-refresh-token",
        },
      },
      error: null,
    });
    setSession.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
  });

  it("requires an authenticated user before exchanging the link code", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null } });

    const { GET } = await import("@/app/auth/link/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/link/callback?code=secret&attemptedProvider=naver&next=/mypage",
    ));

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("linkError"))
      .toBe("link_failed");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("preserves the existing session on provider cancellation", async () => {
    getUser.mockResolvedValueOnce({ data: { user: userWithProviders("user-1", ["google"]) } });

    const { GET } = await import("@/app/auth/link/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/link/callback?error=access_denied&attemptedProvider=naver&next=/mypage",
    ));

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("linkError"))
      .toBe("link_cancelled");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("rejects a callback that changes the authenticated user id", async () => {
    getUser
      .mockResolvedValueOnce({ data: { user: userWithProviders("user-1", ["google"]) } })
      .mockResolvedValueOnce({ data: { user: userWithProviders("user-2", ["google", "custom:naver"]) } });
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const { GET } = await import("@/app/auth/link/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/link/callback?code=secret&attemptedProvider=naver&next=/mypage",
    ));

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("linkError"))
      .toBe("link_conflict");
    expect(setSession).toHaveBeenCalledWith({
      access_token: "existing-access-token",
      refresh_token: "existing-refresh-token",
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("terminates the changed session when restoring the original session fails", async () => {
    getUser
      .mockResolvedValueOnce({ data: { user: userWithProviders("user-1", ["google"]) } })
      .mockResolvedValueOnce({ data: { user: userWithProviders("user-2", ["google", "custom:naver"]) } });
    exchangeCodeForSession.mockResolvedValue({ error: null });
    setSession.mockResolvedValue({ error: new Error("restore failed") });
    signOut.mockRejectedValue(new Error("sign out failed"));
    cookieGetAll.mockReturnValue([
      { name: "sb-homecook-auth-token.0", value: "changed-session" },
      { name: "homecook-theme", value: "dark" },
    ]);

    const { GET } = await import("@/app/auth/link/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/link/callback?code=secret&attemptedProvider=naver&next=/mypage",
    ));
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("linkError"))
      .toBe("link_conflict");
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(setCookie).toContain("sb-homecook-auth-token.0=");
    expect(setCookie).not.toContain("homecook-theme=");
    expect(setCookie).not.toContain("changed-session");
  });

  it("requires the requested identity to exist after exchange", async () => {
    const sameUser = userWithProviders("user-1", ["google"]);
    getUser
      .mockResolvedValueOnce({ data: { user: sameUser } })
      .mockResolvedValueOnce({ data: { user: sameUser } });
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const { GET } = await import("@/app/auth/link/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/link/callback?code=secret&attemptedProvider=naver&next=/mypage",
    ));

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("linkError"))
      .toBe("link_failed");
    expect(setSession).toHaveBeenCalledWith({
      access_token: "existing-access-token",
      refresh_token: "existing-refresh-token",
    });
  });

  it("restores the original session when the post-exchange user lookup throws", async () => {
    getUser
      .mockResolvedValueOnce({ data: { user: userWithProviders("user-1", ["google"]) } })
      .mockRejectedValueOnce(new Error("user lookup unavailable"));
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const { GET } = await import("@/app/auth/link/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/link/callback?code=secret&attemptedProvider=naver&next=/mypage",
    ));

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("linkError"))
      .toBe("link_failed");
    expect(setSession).toHaveBeenCalledWith({
      access_token: "existing-access-token",
      refresh_token: "existing-refresh-token",
    });
  });

  it("restores the original session when the post-exchange user is missing", async () => {
    getUser
      .mockResolvedValueOnce({ data: { user: userWithProviders("user-1", ["google"]) } })
      .mockResolvedValueOnce({ data: { user: null }, error: new Error("user missing") });
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const { GET } = await import("@/app/auth/link/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/link/callback?code=secret&attemptedProvider=naver&next=/mypage",
    ));

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("linkError"))
      .toBe("link_failed");
    expect(setSession).toHaveBeenCalledWith({
      access_token: "existing-access-token",
      refresh_token: "existing-refresh-token",
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("preserves the existing auth cookie when code exchange throws", async () => {
    getUser.mockResolvedValueOnce({
      data: { user: userWithProviders("user-1", ["google"]) },
    });
    exchangeCodeForSession.mockRejectedValue(new Error("network error"));

    const { GET } = await import("@/app/auth/link/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/link/callback?code=secret&attemptedProvider=naver&next=/mypage",
      { headers: { Cookie: "sb-homecook-auth-token=existing-session" } },
    ));

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("linkError"))
      .toBe("link_failed");
    expect(setSession).toHaveBeenCalledWith({
      access_token: "existing-access-token",
      refresh_token: "existing-refresh-token",
    });
    expect(response.headers.get("set-cookie") ?? "").not.toContain("sb-homecook-auth-token=");
  });

  it("returns success only for the same user with the requested identity", async () => {
    const before = userWithProviders("user-1", ["google"]);
    const after = userWithProviders("user-1", ["google", "custom:naver"]);
    getUser
      .mockResolvedValueOnce({ data: { user: before } })
      .mockResolvedValueOnce({ data: { user: after } });
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const { GET } = await import("@/app/auth/link/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/link/callback?code=secret&attemptedProvider=naver&next=/mypage",
    ));
    const redirectUrl = new URL(response.headers.get("location") ?? "");

    expect(redirectUrl.pathname).toBe("/mypage");
    expect(redirectUrl.searchParams.get("linkResult")).toBe("linked");
    expect(redirectUrl.searchParams.has("email")).toBe(false);
    expect(redirectUrl.searchParams.has("userId")).toBe(false);
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
    expect(ensureUserBootstrapState).not.toHaveBeenCalled();
  });

  it("treats an already linked provider as a safe no-op", async () => {
    const user = userWithProviders("user-1", ["google", "custom:naver"]);
    getUser.mockResolvedValueOnce({ data: { user } });

    const { GET } = await import("@/app/auth/link/callback/route");
    const response = await GET(new Request(
      "http://localhost:3000/auth/link/callback?code=secret&attemptedProvider=naver&next=/mypage",
    ));

    expect(new URL(response.headers.get("location") ?? "").searchParams.get("linkResult"))
      .toBe("already_linked");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
