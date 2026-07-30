import { afterEach, describe, expect, it, vi } from "vitest";

async function readContentSecurityPolicy(exposure: "lan" | "local-only" | "public") {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("HOMECOOK_PRODUCTION_EXPOSURE", exposure);
  vi.resetModules();

  const { default: nextConfig } = await import("../next.config");
  const headerGroups = await nextConfig.headers?.();
  const contentSecurityPolicy = headerGroups
    ?.flatMap((group) => group.headers)
    .find((header) => header.key === "Content-Security-Policy");

  return contentSecurityPolicy?.value ?? "";
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("production Content-Security-Policy", () => {
  it("does not upgrade HTTP assets for trusted LAN production", async () => {
    const policy = await readContentSecurityPolicy("lan");

    expect(policy).not.toContain("upgrade-insecure-requests");
  });

  it("does not upgrade HTTP assets for loopback-only production", async () => {
    const policy = await readContentSecurityPolicy("local-only");

    expect(policy).not.toContain("upgrade-insecure-requests");
  });

  it("keeps HTTPS upgrade protection for public production", async () => {
    const policy = await readContentSecurityPolicy("public");

    expect(policy).toContain("upgrade-insecure-requests");
  });
});
