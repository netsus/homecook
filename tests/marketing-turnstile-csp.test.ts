import { describe, expect, it } from "vitest";

import nextConfig from "../next.config";

describe("marketing Turnstile CSP", () => {
  it("allows only the official Turnstile origin for its script, connection, and iframe", async () => {
    const headers = await nextConfig.headers?.();
    const csp = headers
      ?.flatMap((entry) => entry.headers)
      .find((header) => header.key === "Content-Security-Policy")
      ?.value;

    expect(csp).toContain("script-src 'self'");
    expect(csp).toMatch(/script-src[^;]*https:\/\/challenges\.cloudflare\.com/u);
    expect(csp).toMatch(/connect-src[^;]*https:\/\/challenges\.cloudflare\.com/u);
    expect(csp).toContain("frame-src https://challenges.cloudflare.com");
    expect(csp).not.toMatch(/frame-src[^;]*'none'/u);
  });
});
