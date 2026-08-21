import { beforeEach, describe, expect, it, vi } from "vitest";

const isLocalDevAuthEnabled = vi.fn();
const getAuthAuthority = vi.fn();
const createAuthRouteHandlerClient = vi.fn();
const createAuthCallbackOperationsClient = vi.fn();
const readAuthCallbackAccountGenerationCapability = vi.fn();
const prepareFullLocalSessionAuthority = vi.fn();
const bootstrapAuthCallbackAccountGenerationIdentity = vi.fn();
const recordFullLocalSessionAuthority = vi.fn();

vi.mock("@/lib/auth/local-dev-auth", () => ({
  isLocalDevAuthEnabled: () => isLocalDevAuthEnabled(),
}));

vi.mock("@/lib/supabase/auth-env", () => ({
  getAuthAuthority: () => getAuthAuthority(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAuthRouteHandlerClient,
  createAuthCallbackOperationsClient,
}));

vi.mock("@/lib/server/account-generation/auth-callback", () => ({
  readAuthCallbackAccountGenerationCapability,
  bootstrapAuthCallbackAccountGenerationIdentity,
}));

vi.mock("@/lib/server/full-local-auth/session-authority", () => ({
  prepareFullLocalSessionAuthority,
  recordFullLocalSessionAuthority,
}));

describe("local dev session bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    isLocalDevAuthEnabled.mockReset();
    getAuthAuthority.mockReset();
    createAuthRouteHandlerClient.mockReset();
    createAuthCallbackOperationsClient.mockReset();
    readAuthCallbackAccountGenerationCapability.mockReset();
    prepareFullLocalSessionAuthority.mockReset();
    bootstrapAuthCallbackAccountGenerationIdentity.mockReset();
    recordFullLocalSessionAuthority.mockReset();

    isLocalDevAuthEnabled.mockReturnValue(true);
    getAuthAuthority.mockReturnValue("local");

    const getSession = vi.fn(async () => ({
      data: { session: { access_token: "access-token" } },
      error: null,
    }));
    const getUser = vi.fn(async () => ({
      data: {
        user: {
          id: "user-1",
          created_at: "2026-08-01T00:00:00.000Z",
        },
      },
      error: null,
    }));
    createAuthRouteHandlerClient.mockResolvedValue({
      auth: {
        getSession,
        getUser,
      },
    });
    createAuthCallbackOperationsClient.mockReturnValue({ rpc: vi.fn() });
    readAuthCallbackAccountGenerationCapability.mockResolvedValue({
      ok: true,
      state: "generation_active",
      revision: 4,
    });
    prepareFullLocalSessionAuthority.mockResolvedValue({
      ok: true,
      accountBootstrap: {
        ownerUuid: "user-1",
        authIdentityCreatedAt: "2026-08-01T00:00:00.000Z",
        sessionIssuedAt: "2026-08-21T00:00:00.000Z",
        sessionKeyHash: "hash",
        hmacKeyVersion: 2,
      },
      record: {
        p_access_token_expires_at: "2026-08-21T01:00:00.000Z",
        p_auth_cutover_epoch: 7,
        p_binding_expires_at: "2026-08-21T01:00:00.000Z",
        p_hmac_key_version: 2,
        p_identity_created_at: "2026-08-01T00:00:00.000Z",
        p_issuer: "https://auth.mumeok.kr/auth/v1",
        p_last_token_issued_at: "2026-08-21T00:00:00.000Z",
        p_owner_uuid: "user-1",
        p_session_id: "00000000-0000-4000-8000-000000000001",
        p_session_issued_at: "2026-08-21T00:00:00.000Z",
        p_session_key_hash: "hash",
        p_verified_at: "2026-08-21T00:00:01.000Z",
      },
    });
    bootstrapAuthCallbackAccountGenerationIdentity.mockResolvedValue({
      ok: true,
      accountGeneration: 1,
      nickname: "집밥러",
    });
    recordFullLocalSessionAuthority.mockResolvedValue({ ok: true });
  });

  it("verifies the live cookie session, bootstraps the account, and records local authority in callback order", async () => {
    const { bootstrapLocalDevSessionAuthority } = await import(
      "@/lib/server/full-local-auth/local-dev-session-bootstrap"
    );

    const result = await bootstrapLocalDevSessionAuthority();

    expect(result).toEqual({ ok: true });
    const routeClient = await createAuthRouteHandlerClient.mock.results[0]?.value;
    const getSession = routeClient.auth.getSession as ReturnType<typeof vi.fn>;
    const getUser = routeClient.auth.getUser as ReturnType<typeof vi.fn>;
    const serviceRoleClient = createAuthCallbackOperationsClient.mock.results[0]?.value;
    const prepared = await prepareFullLocalSessionAuthority.mock.results[0]?.value;

    expect(getSession).toHaveBeenCalledTimes(1);
    expect(getUser).toHaveBeenCalledWith("access-token");
    expect(readAuthCallbackAccountGenerationCapability).toHaveBeenCalledWith(
      serviceRoleClient,
    );
    expect(prepareFullLocalSessionAuthority).toHaveBeenCalledWith({
      accessToken: "access-token",
      client: serviceRoleClient,
      user: {
        id: "user-1",
        created_at: "2026-08-01T00:00:00.000Z",
      },
    });
    expect(bootstrapAuthCallbackAccountGenerationIdentity).toHaveBeenCalledWith(
      serviceRoleClient,
      prepared.accountBootstrap,
    );
    expect(recordFullLocalSessionAuthority).toHaveBeenCalledWith({
      client: serviceRoleClient,
      record: prepared.record,
    });
    expect(getSession.mock.invocationCallOrder[0]).toBeLessThan(
      getUser.mock.invocationCallOrder[0],
    );
    expect(getUser.mock.invocationCallOrder[0]).toBeLessThan(
      readAuthCallbackAccountGenerationCapability.mock.invocationCallOrder[0],
    );
    expect(
      readAuthCallbackAccountGenerationCapability.mock.invocationCallOrder[0],
    ).toBeLessThan(prepareFullLocalSessionAuthority.mock.invocationCallOrder[0]);
    expect(prepareFullLocalSessionAuthority.mock.invocationCallOrder[0]).toBeLessThan(
      bootstrapAuthCallbackAccountGenerationIdentity.mock.invocationCallOrder[0],
    );
    expect(
      bootstrapAuthCallbackAccountGenerationIdentity.mock.invocationCallOrder[0],
    ).toBeLessThan(recordFullLocalSessionAuthority.mock.invocationCallOrder[0]);
  });

  it("fails closed when local dev auth is disabled", async () => {
    isLocalDevAuthEnabled.mockReturnValue(false);
    const { bootstrapLocalDevSessionAuthority } = await import(
      "@/lib/server/full-local-auth/local-dev-session-bootstrap"
    );

    await expect(bootstrapLocalDevSessionAuthority()).resolves.toMatchObject({
      ok: false,
      code: "ACCOUNT_SESSION_STALE",
    });
    expect(createAuthRouteHandlerClient).not.toHaveBeenCalled();
  });

  it("fails closed without a cookie session", async () => {
    createAuthRouteHandlerClient.mockResolvedValue({
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: null },
          error: null,
        })),
        getUser: vi.fn(),
      },
    });
    const { bootstrapLocalDevSessionAuthority } = await import(
      "@/lib/server/full-local-auth/local-dev-session-bootstrap"
    );

    await expect(bootstrapLocalDevSessionAuthority()).resolves.toMatchObject({
      ok: false,
      code: "ACCOUNT_SESSION_STALE",
    });
  });

  it("fails closed when the live user cannot be verified", async () => {
    const routeClient = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { access_token: "access-token" } },
          error: null,
        })),
        getUser: vi.fn(async () => ({
          data: { user: null },
          error: null,
        })),
      },
    };
    createAuthRouteHandlerClient.mockResolvedValue(routeClient);
    const { bootstrapLocalDevSessionAuthority } = await import(
      "@/lib/server/full-local-auth/local-dev-session-bootstrap"
    );

    await expect(bootstrapLocalDevSessionAuthority()).resolves.toMatchObject({
      ok: false,
      code: "ACCOUNT_SESSION_STALE",
    });
  });

  it("fails with maintenance when the scoped auth-callback client is unavailable", async () => {
    createAuthCallbackOperationsClient.mockReturnValue(null);
    const { bootstrapLocalDevSessionAuthority } = await import(
      "@/lib/server/full-local-auth/local-dev-session-bootstrap"
    );

    await expect(bootstrapLocalDevSessionAuthority()).resolves.toMatchObject({
      ok: false,
      code: "ACCOUNT_LIFECYCLE_MAINTENANCE",
    });
  });

  it("fails with maintenance when the capability cannot be read", async () => {
    readAuthCallbackAccountGenerationCapability.mockResolvedValue({ ok: false });
    const { bootstrapLocalDevSessionAuthority } = await import(
      "@/lib/server/full-local-auth/local-dev-session-bootstrap"
    );

    await expect(bootstrapLocalDevSessionAuthority()).resolves.toMatchObject({
      ok: false,
      code: "ACCOUNT_LIFECYCLE_MAINTENANCE",
    });
  });

  it("fails closed when the capability is not generation_active", async () => {
    readAuthCallbackAccountGenerationCapability.mockResolvedValue({
      ok: true,
      state: "legacy",
      revision: 3,
    });
    const { bootstrapLocalDevSessionAuthority } = await import(
      "@/lib/server/full-local-auth/local-dev-session-bootstrap"
    );

    await expect(bootstrapLocalDevSessionAuthority()).resolves.toMatchObject({
      ok: false,
      code: "ACCOUNT_SESSION_STALE",
    });
  });

  it("maps prepare failures to the matching safe error", async () => {
    prepareFullLocalSessionAuthority.mockResolvedValue({
      ok: false,
      reason: "maintenance",
    });
    const { bootstrapLocalDevSessionAuthority } = await import(
      "@/lib/server/full-local-auth/local-dev-session-bootstrap"
    );

    await expect(bootstrapLocalDevSessionAuthority()).resolves.toMatchObject({
      ok: false,
      code: "ACCOUNT_LIFECYCLE_MAINTENANCE",
    });
  });

  it("fails closed when account bootstrap fails", async () => {
    bootstrapAuthCallbackAccountGenerationIdentity.mockResolvedValue({
      ok: false,
      errorCode: "ACCOUNT_DELETION_PENDING",
    });
    const { bootstrapLocalDevSessionAuthority } = await import(
      "@/lib/server/full-local-auth/local-dev-session-bootstrap"
    );

    await expect(bootstrapLocalDevSessionAuthority()).resolves.toMatchObject({
      ok: false,
      code: "ACCOUNT_SESSION_STALE",
    });
  });

  it("fails closed when recording the local authority binding fails", async () => {
    recordFullLocalSessionAuthority.mockResolvedValue({
      ok: false,
      reason: "stale",
    });
    const { bootstrapLocalDevSessionAuthority } = await import(
      "@/lib/server/full-local-auth/local-dev-session-bootstrap"
    );

    await expect(bootstrapLocalDevSessionAuthority()).resolves.toMatchObject({
      ok: false,
      code: "ACCOUNT_SESSION_STALE",
    });
  });
});
