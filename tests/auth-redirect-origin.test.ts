import { afterEach, describe, expect, it, vi } from "vitest";

describe("auth redirect origin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers NEXT_PUBLIC_APP_URL for public same-app redirects", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.mumeok.kr/app?ignored=1");

    const { resolveAuthRedirectOrigin } = await import("@/lib/auth/redirect-origin");

    expect(
      resolveAuthRedirectOrigin(new URL("http://localhost:3100/auth/logout?next=%2Fplanner")),
    ).toBe("https://app.mumeok.kr");
  });

  it.each([
    "not-a-url",
    "javascript:alert(1)",
    "ftp://app.mumeok.kr",
  ])("falls back to the request origin when NEXT_PUBLIC_APP_URL is invalid: %s", async (value) => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", value);

    const { resolveAuthRedirectOrigin } = await import("@/lib/auth/redirect-origin");

    expect(
      resolveAuthRedirectOrigin(new URL("http://localhost:3100/auth/callback?code=abc")),
    ).toBe("http://localhost:3100");
  });

  it("falls back to the request origin when NEXT_PUBLIC_APP_URL is absent", async () => {
    const { resolveAuthRedirectOrigin } = await import("@/lib/auth/redirect-origin");

    expect(
      resolveAuthRedirectOrigin(new URL("https://local.test/auth/link/callback?code=abc")),
    ).toBe("https://local.test");
  });
});
