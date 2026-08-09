import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const executeHybridLogout = vi.fn();
const cookies = vi.fn();
const cookieGetAll = vi.fn();

function getSetCookieHeaders(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() ?? [];
}

vi.mock("@/lib/supabase/server", () => ({
  createAuthRouteHandlerClient: createRouteHandlerClient,
  createDataServiceRoleClient: vi.fn(),
  createRouteHandlerClient,
}));

vi.mock("@/lib/server/hybrid-auth/logout", () => ({
  executeHybridLogout,
}));

vi.mock("next/headers", () => ({
  cookies,
}));

describe("auth logout route", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    executeHybridLogout.mockReset();
    cookies.mockReset();
    cookieGetAll.mockReset();

    createRouteHandlerClient.mockResolvedValue({ auth: {} });
    executeHybridLogout.mockResolvedValue({ ok: true });
    cookies.mockResolvedValue({
      getAll: cookieGetAll,
    });
    cookieGetAll.mockReturnValue([]);
    vi.stubEnv("NEXT_PUBLIC_AUTH_SUPABASE_URL", "https://local.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
  });

  it("clears the server session and redirects to the requested local path", async () => {
    cookieGetAll.mockReturnValue([
      { name: "sb-local-auth-token.1" },
      { name: "sb-local-auth-token-code-verifier" },
      { name: "sb-other-auth-token.4" },
      { name: "sb-other-auth-token-code-verifier" },
      { name: "preferences" },
    ]);

    const { GET } = await import("@/app/auth/logout/route");
    const response = await GET(
      new Request("http://localhost:3000/auth/logout?next=/planner", {
        headers: {
          cookie: [
            "sb-local-auth-token=token",
            "sb-local-auth-token.0=chunk-0",
            "sb-other-auth-token=other-token",
            "sb-other-auth-token.0=other-chunk-0",
            "marketing_opt_in=yes",
          ].join("; "),
        },
      }),
    );
    const setCookieHeaders = getSetCookieHeaders(response);

    expect(executeHybridLogout).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe("http://localhost:3000/planner");
    expect(response.cookies.get("sb-local-auth-token")?.maxAge).toBe(0);
    expect(response.cookies.get("sb-local-auth-token.0")?.maxAge).toBe(0);
    expect(response.cookies.get("sb-local-auth-token.1")?.maxAge).toBe(0);
    expect(response.cookies.get("sb-local-auth-token-code-verifier")?.maxAge).toBe(0);
    expect(response.cookies.get("sb-other-auth-token")).toBeUndefined();
    expect(response.cookies.get("sb-other-auth-token.0")).toBeUndefined();
    expect(response.cookies.get("sb-other-auth-token.4")).toBeUndefined();
    expect(response.cookies.get("sb-other-auth-token-code-verifier")).toBeUndefined();
    expect(setCookieHeaders).toContainEqual(
      expect.stringMatching(
        /__Host-homecook-auth-flow=;.*Path=\/.*Max-Age=0.*Secure.*HttpOnly.*SameSite=Lax/i,
      ),
    );
    expect(setCookieHeaders.some((header) => /^sb-other-auth-token=;/i.test(header))).toBe(false);
    expect(setCookieHeaders.some((header) => /^sb-other-auth-token\.0=;/i.test(header))).toBe(
      false,
    );
    expect(setCookieHeaders.some((header) => /^sb-other-auth-token\.4=;/i.test(header))).toBe(
      false,
    );
    expect(
      setCookieHeaders.some((header) => /^sb-other-auth-token-code-verifier=;/i.test(header)),
    ).toBe(false);
    expect(setCookieHeaders.some((header) => /^marketing_opt_in=;/i.test(header))).toBe(
      false,
    );
    expect(setCookieHeaders.some((header) => /^preferences=;/i.test(header))).toBe(false);
  });

  it("prefers the public app origin over the proxy request origin", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.mumeok.kr");

    const { GET } = await import("@/app/auth/logout/route");
    const response = await GET(
      new Request("http://localhost:3100/auth/logout?next=/planner"),
    );

    expect(response.headers.get("location")).toBe("https://app.mumeok.kr/planner");
  });

  it("fails closed to login when hybrid revoke rejects the session", async () => {
    executeHybridLogout.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "ACCOUNT_SESSION_STALE",
        message: "세션을 다시 확인해 주세요.",
        status: 409,
      },
    });

    const { GET } = await import("@/app/auth/logout/route");
    const response = await GET(
      new Request("http://localhost:3000/auth/logout?next=/planner", {
        headers: {
          cookie: "sb-local-auth-token=token",
        },
      }),
    );

    const redirectUrl = new URL(response.headers.get("location") ?? "");
    expect(redirectUrl.pathname).toBe("/login");
    expect(redirectUrl.searchParams.get("authError")).toBe("ACCOUNT_SESSION_STALE");
    expect(redirectUrl.searchParams.get("next")).toBe("/planner");
    expect(response.cookies.get("sb-local-auth-token")?.maxAge).toBe(0);
    expect(getSetCookieHeaders(response)).toContainEqual(
      expect.stringMatching(
        /__Host-homecook-auth-flow=;.*Path=\/.*Max-Age=0.*Secure.*HttpOnly.*SameSite=Lax/i,
      ),
    );
  });

  it("fails closed to login when signOut reports an error", async () => {
    executeHybridLogout.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "로그아웃하지 못했어요.",
        status: 500,
      },
    });

    const { GET } = await import("@/app/auth/logout/route");
    const response = await GET(
      new Request("http://localhost:3000/auth/logout?next=/planner", {
        headers: {
          cookie: "sb-local-auth-token=token",
        },
      }),
    );

    const redirectUrl = new URL(response.headers.get("location") ?? "");
    expect(redirectUrl.pathname).toBe("/login");
    expect(redirectUrl.searchParams.get("authError")).toBe("ACCOUNT_SESSION_STALE");
    expect(redirectUrl.searchParams.get("next")).toBe("/planner");
    expect(response.cookies.get("sb-local-auth-token")?.maxAge).toBe(0);
    expect(getSetCookieHeaders(response)).toContainEqual(
      expect.stringMatching(
        /__Host-homecook-auth-flow=;.*Path=\/.*Max-Age=0.*Secure.*HttpOnly.*SameSite=Lax/i,
      ),
    );
  });
});
