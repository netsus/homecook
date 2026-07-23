import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookies = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({ cookies }));

describe("account quarantine QA fixture gate", () => {
  const cookieGet = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    cookies.mockResolvedValue({ get: cookieGet });
    cookieGet.mockReturnValue(undefined);
    vi.stubEnv("HOMECOOK_ENABLE_QA_FIXTURES", "1");
    vi.stubEnv("NODE_ENV", "test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("projects an exact quarantine state only in QA fixture mode", async () => {
    cookieGet.mockImplementation((name: string) => name
      === "homecook.qa-account-quarantine-state"
      ? { value: "auth-present" }
      : undefined);
    const { readQaFixtureAccountQuarantineGate } = await import(
      "@/lib/server/account-generation/quarantine-fixture"
    );

    await expect(readQaFixtureAccountQuarantineGate()).resolves.toEqual({
      state: "auth-present",
      hasSession: true,
    });
  });

  it("defaults existing authenticated E2E flows to legacy non-exposure", async () => {
    cookieGet.mockImplementation((name: string) => name
      === "homecook.e2e-auth-override"
      ? { value: "authenticated" }
      : undefined);
    const { readQaFixtureAccountQuarantineGate } = await import(
      "@/lib/server/account-generation/quarantine-fixture"
    );

    await expect(readQaFixtureAccountQuarantineGate()).resolves.toEqual({
      state: "not-applicable",
      hasSession: false,
    });
  });

  it("ignores fixture cookies in production even when the flag is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    cookieGet.mockReturnValue({ value: "auth-present" });
    const { readQaFixtureAccountQuarantineGate } = await import(
      "@/lib/server/account-generation/quarantine-fixture"
    );

    await expect(readQaFixtureAccountQuarantineGate()).resolves.toBeNull();
    expect(cookies).not.toHaveBeenCalled();
  });
});
