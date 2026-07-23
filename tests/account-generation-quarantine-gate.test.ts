import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bootstrapIdentity: vi.fn(),
  createServerComponentClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  hasSupabasePublicEnv: vi.fn(),
  readCapability: vi.fn(),
  readReplaySession: vi.fn(),
  readVerifiedSession: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerComponentClient: mocks.createServerComponentClient,
  createServiceRoleClient: mocks.createServiceRoleClient,
}));

vi.mock("@/lib/supabase/env", () => ({
  hasSupabasePublicEnv: mocks.hasSupabasePublicEnv,
}));

vi.mock("@/lib/server/account-generation/auth-callback", () => ({
  bootstrapAuthCallbackAccountGenerationIdentity: mocks.bootstrapIdentity,
  readAuthCallbackAccountGenerationCapability: mocks.readCapability,
}));

vi.mock("@/lib/server/account-generation/session-authority", () => ({
  readVerifiedAccountGenerationReplaySession: mocks.readReplaySession,
  readVerifiedAccountGenerationSession: mocks.readVerifiedSession,
}));

describe("account quarantine server gate", () => {
  const routeClient = {
    auth: {
      getSession: vi.fn(),
    },
  };
  const serviceRoleClient = { rpc: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    routeClient.auth.getSession.mockResolvedValue({
      data: { session: { access_token: "verified-token" } },
      error: null,
    });
    mocks.createServerComponentClient.mockResolvedValue(routeClient);
    mocks.createServiceRoleClient.mockReturnValue(serviceRoleClient);
    mocks.hasSupabasePublicEnv.mockReturnValue(true);
    mocks.readCapability.mockResolvedValue({
      ok: true,
      state: "generation_active",
      revision: 3,
    });
    mocks.readVerifiedSession.mockResolvedValue({
      ok: true,
      sessionAuthority: {
        ownerUuid: "76000000-0000-4000-8000-000000000001",
      },
    });
    mocks.readReplaySession.mockResolvedValue({ ok: false });
    mocks.bootstrapIdentity.mockResolvedValue({
      ok: false,
      errorCode: "ACCOUNT_CUTOVER_QUARANTINED",
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps an unconfigured local legacy runtime invisible before creating clients", async () => {
    mocks.hasSupabasePublicEnv.mockReturnValue(false);

    const { readAccountQuarantineGate } = await import(
      "@/lib/server/account-generation/quarantine-gate"
    );

    await expect(readAccountQuarantineGate()).resolves.toEqual({
      state: "not-applicable",
      hasSession: false,
    });
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
    expect(mocks.readCapability).not.toHaveBeenCalled();
  });

  it("fails closed when production is missing its Supabase public configuration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.hasSupabasePublicEnv.mockReturnValue(false);

    const { readAccountQuarantineGate } = await import(
      "@/lib/server/account-generation/quarantine-gate"
    );

    await expect(readAccountQuarantineGate()).resolves.toEqual({
      state: "error",
      hasSession: false,
    });
    expect(mocks.createServiceRoleClient).not.toHaveBeenCalled();
    expect(mocks.readCapability).not.toHaveBeenCalled();
  });

  it("keeps legacy capability invisible without reading auth or bootstrap state", async () => {
    mocks.readCapability.mockResolvedValue({
      ok: true,
      state: "legacy",
      revision: 1,
    });

    const { readAccountQuarantineGate } = await import(
      "@/lib/server/account-generation/quarantine-gate"
    );

    await expect(readAccountQuarantineGate()).resolves.toEqual({
      state: "not-applicable",
      hasSession: false,
    });
    expect(mocks.createServerComponentClient).not.toHaveBeenCalled();
    expect(mocks.bootstrapIdentity).not.toHaveBeenCalled();
  });

  it("blocks normal content for an auth-present quarantined lifecycle", async () => {
    const { readAccountQuarantineGate } = await import(
      "@/lib/server/account-generation/quarantine-gate"
    );

    await expect(readAccountQuarantineGate()).resolves.toEqual({
      state: "auth-present",
      hasSession: true,
    });
    expect(mocks.bootstrapIdentity).toHaveBeenCalledTimes(1);
    expect(mocks.readReplaySession).not.toHaveBeenCalled();
  });

  it("returns support-only when a signed current session has no auth identity", async () => {
    mocks.readVerifiedSession.mockResolvedValue({ ok: false });
    mocks.readReplaySession.mockResolvedValue({
      ok: true,
      sessionAuthority: {
        ownerUuid: "76000000-0000-4000-8000-000000000001",
      },
    });

    const { readAccountQuarantineGate } = await import(
      "@/lib/server/account-generation/quarantine-gate"
    );

    await expect(readAccountQuarantineGate()).resolves.toEqual({
      state: "auth-absent",
      hasSession: true,
    });
    expect(mocks.bootstrapIdentity).not.toHaveBeenCalled();
  });

  it("does not classify an ordinary signed-out visitor as quarantined", async () => {
    routeClient.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const { readAccountQuarantineGate } = await import(
      "@/lib/server/account-generation/quarantine-gate"
    );

    await expect(readAccountQuarantineGate()).resolves.toEqual({
      state: "unauthorized",
      hasSession: false,
    });
    expect(mocks.readVerifiedSession).not.toHaveBeenCalled();
    expect(mocks.readReplaySession).not.toHaveBeenCalled();
    expect(mocks.bootstrapIdentity).not.toHaveBeenCalled();
  });

  it.each([
    ["ACCOUNT_DELETING", "cleanup-pending"],
    ["ACCOUNT_DELETION_PENDING", "cleanup-pending"],
    ["ACCOUNT_GENERATION_STALE", "unauthorized"],
    ["ACCOUNT_SESSION_STALE", "unauthorized"],
    ["ACCOUNT_CUTOVER_UNCLASSIFIED", "auth-absent"],
  ] as const)("maps %s to the fail-closed %s state", async (errorCode, state) => {
    mocks.bootstrapIdentity.mockResolvedValue({ ok: false, errorCode });

    const { readAccountQuarantineGate } = await import(
      "@/lib/server/account-generation/quarantine-gate"
    );

    await expect(readAccountQuarantineGate()).resolves.toEqual({
      state,
      hasSession: true,
    });
  });
});
