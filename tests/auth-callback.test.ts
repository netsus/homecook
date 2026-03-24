import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession,
    },
  })),
}));

describe("auth callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
  });

  it("sanitizes external redirect targets", async () => {
    const { resolveNextPath } = await import("@/app/auth/callback/route");

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
});
