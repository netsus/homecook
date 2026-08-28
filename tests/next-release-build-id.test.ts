import { afterEach, describe, expect, it, vi } from "vitest";

describe("Next.js production release build ID", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses the exact release manifest build ID when the prepare pipeline supplies it", async () => {
    vi.stubEnv("HOMECOOK_RELEASE_BUILD_ID", "prod-20260828.3-8439af5f");
    vi.resetModules();

    const { default: config } = await import("../next.config");

    expect(config.generateBuildId).toBeTypeOf("function");
    await expect(config.generateBuildId?.()).resolves.toBe(
      "prod-20260828.3-8439af5f",
    );
  });
});
