import {
  createHmac,
  generateKeyPairSync,
  sign,
} from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();
const formatBootstrapErrorMessage = vi.fn((_error: unknown, fallbackMessage: string) => {
  return fallbackMessage;
});
const recordOperationalEvent = vi.fn(async () => true);

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
}));

vi.mock("@/lib/server/admin-events", () => ({
  recordOperationalEvent,
}));

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

function createCapabilityRpc(
  capabilityResult: QueryResult<{ state: string; revision: number }>,
  otherResult: QueryResult<unknown> = { data: null, error: null },
) {
  return vi.fn(async (functionName: string) => {
    if (functionName === "get_account_generation_capability") {
      return capabilityResult;
    }
    return otherResult;
  });
}

function createTestAccessToken(payload: Record<string, unknown>) {
  const encode = (value: Record<string, unknown>) => {
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  };

  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    aud: "authenticated",
    iss: "https://project.supabase.co/auth/v1",
    ...payload,
  })}.test-signature`;
}

function createSignedTestAccessToken(payload: Record<string, unknown>) {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const kid = "account-generation-replay-test-key";
  const encode = (value: Record<string, unknown>) => {
    return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  };
  const signingInput = `${encode({ alg: "RS256", kid, typ: "JWT" })}.${encode(payload)}`;
  const signature = sign(
    "RSA-SHA256",
    Buffer.from(signingInput, "utf8"),
    privateKey,
  ).toString("base64url");
  const jwk = publicKey.export({ format: "jwk" });

  return {
    accessToken: `${signingInput}.${signature}`,
    jwk: {
      ...jwk,
      alg: "RS256",
      kid,
      use: "sig",
    },
  };
}

function setupAuthedRouteClient(
  user = { id: "user-1", created_at: "2026-07-23T00:00:00.000Z" },
) {
  createRouteHandlerClient.mockResolvedValue({
    auth: {
      getUser: vi.fn(async () => ({ data: { user } })),
    },
    from: vi.fn(),
  });
}

async function importUsersMeRoute() {
  return import("@/app/api/v1/users/me/route");
}

async function importCutoverQuarantineRoute() {
  return import("@/app/api/v1/users/me/cutover-quarantine-resolution/route");
}

async function importAccountGenerationActiveAdapter() {
  return import("@/app/api/v1/users/me/_account-generation-active");
}

describe("account session generation F0 routes", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    formatBootstrapErrorMessage.mockClear();
    recordOperationalEvent.mockClear();
    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("fails closed when the capability singleton cannot be read", async () => {
    setupAuthedRouteClient();
    const cleanupRpc = vi.fn(async () => ({ data: null, error: { message: "missing" } }));
    createServiceRoleClient.mockReturnValue({
      rpc: cleanupRpc,
    });

    const { DELETE } = await importUsersMeRoute();
    const response = await DELETE(
      new Request("http://localhost:3000/api/v1/users/me", { method: "DELETE" }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "INTERNAL_ERROR" },
    });
    expect(cleanupRpc).toHaveBeenCalledTimes(1);
    expect(cleanupRpc).not.toHaveBeenCalledWith(
      "delete_user_private_data",
      expect.anything(),
    );
  }, 15_000);

  it("preserves the legacy DELETE /users/me cleanup response after an authoritative lookup", async () => {
    setupAuthedRouteClient();
    const rpc = createCapabilityRpc(
      { data: { state: "legacy", revision: 1 }, error: null },
      { data: { deleted: true }, error: null },
    );
    createServiceRoleClient.mockReturnValue({ rpc });

    const { DELETE } = await importUsersMeRoute();
    const response = await DELETE(
      new Request("http://localhost:3000/api/v1/users/me", { method: "DELETE" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { deleted: true },
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith(
      "delete_user_private_data_with_generation_receipt",
      {
      p_user_id: "user-1",
        p_auth_identity_created_at: "2026-07-23T00:00:00.000Z",
      },
    );
  });

  it("fails closed with 503 when DELETE /users/me sees cutover maintenance", async () => {
    setupAuthedRouteClient();
    const cleanupRpc = createCapabilityRpc({
      data: { state: "cutover_maintenance", revision: 3 },
      error: null,
    });
    createServiceRoleClient.mockReturnValue({ rpc: cleanupRpc });

    const { DELETE } = await importUsersMeRoute();
    const response = await DELETE(
      new Request("http://localhost:3000/api/v1/users/me", { method: "DELETE" }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "ACCOUNT_LIFECYCLE_MAINTENANCE" },
    });
    expect(cleanupRpc).not.toHaveBeenCalledWith(
      "delete_user_private_data",
      expect.anything(),
    );
  });

  it("requires a UUID Idempotency-Key before the generation-active delete skeleton can run", async () => {
    setupAuthedRouteClient();
    createServiceRoleClient.mockReturnValue({
      rpc: createCapabilityRpc({
        data: { state: "generation_active", revision: 4 },
        error: null,
      }),
    });

    const { DELETE } = await importUsersMeRoute();
    const response = await DELETE(
      new Request("http://localhost:3000/api/v1/users/me", { method: "DELETE" }),
    );
    const body = await response.json();

    expect(response.status).toBe(428);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "IDEMPOTENCY_KEY_REQUIRED",
        fields: [{ field: "Idempotency-Key", reason: "required" }],
      },
    });
  });

  it("rejects a non-UUID Idempotency-Key with the exact public error", async () => {
    setupAuthedRouteClient();
    createServiceRoleClient.mockReturnValue({
      rpc: createCapabilityRpc({
        data: { state: "generation_active", revision: 4 },
        error: null,
      }),
    });

    const { DELETE } = await importUsersMeRoute();
    const response = await DELETE(
      new Request("http://localhost:3000/api/v1/users/me", {
        method: "DELETE",
        headers: { "Idempotency-Key": "not-a-uuid" },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "INVALID_IDEMPOTENCY_KEY",
        fields: [{ field: "Idempotency-Key", reason: "invalid_uuid" }],
      },
    });
  });

  it("routes a generation-active delete through the verified-session RPC", async () => {
    vi.stubEnv(
      "HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1",
      "test-only-session-generation-secret-at-least-32-bytes",
    );
    const user = {
      id: "550e8400-e29b-41d4-a716-446655440001",
      created_at: "2026-07-23T00:00:00.000Z",
    };
    const accessToken = createTestAccessToken({
      sub: user.id,
      session_id: "550e8400-e29b-41d4-a716-446655440099",
      iat: 1784764800,
      exp: 4102444800,
    });
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { access_token: accessToken } },
        })),
        getUser: vi.fn(async (token?: string) => ({
          data: { user: !token || token === accessToken ? user : null },
        })),
      },
    });
    const rpc = createCapabilityRpc(
      { data: { state: "generation_active", revision: 4 }, error: null },
      { data: { deletion_status: "cleanup_pending" }, error: null },
    );
    createServiceRoleClient.mockReturnValue({ rpc });

    const { DELETE } = await importUsersMeRoute();
    const response = await DELETE(
      new Request("http://localhost:3000/api/v1/users/me", {
        method: "DELETE",
        headers: {
          "Idempotency-Key": "550e8400-e29b-41d4-a716-446655440000",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual({
      success: true,
      data: { deletion_status: "cleanup_pending" },
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith(
      "initiate_account_generation_delete",
      expect.objectContaining({
        p_owner_uuid: user.id,
        p_auth_identity_created_at_snapshot: user.created_at,
        p_session_key_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        p_hmac_key_version: 1,
      }),
    );
  }, 15_000);

  it("replays an auth-deleted generation result only after exact JWKS verification", async () => {
    vi.stubEnv(
      "HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1",
      "test-only-session-generation-secret-at-least-32-bytes",
    );
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    const ownerUuid = "550e8400-e29b-41d4-a716-446655440001";
    const sessionId = "550e8400-e29b-41d4-a716-446655440099";
    const { accessToken, jwk } = createSignedTestAccessToken({
      aud: "authenticated",
      exp: 4102444800,
      iat: 1784764800,
      iss: "https://project.supabase.co/auth/v1",
      session_id: sessionId,
      sub: ownerUuid,
    });
    const fetchJwks = vi.fn(async () => {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchJwks);
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { access_token: accessToken } },
        })),
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
    });
    const rpc = createCapabilityRpc(
      { data: { state: "generation_active", revision: 4 }, error: null },
      { data: { deletion_status: "cleanup_pending" }, error: null },
    );
    createServiceRoleClient.mockReturnValue({ rpc });

    const { DELETE } = await importUsersMeRoute();
    const response = await DELETE(
      new Request("http://localhost:3000/api/v1/users/me", {
        method: "DELETE",
        headers: {
          "Idempotency-Key": "550e8400-e29b-41d4-a716-446655440000",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual({
      success: true,
      data: { deletion_status: "cleanup_pending" },
      error: null,
    });
    expect(fetchJwks).toHaveBeenCalledWith(
      "https://project.supabase.co/auth/v1/.well-known/jwks.json",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "replay_account_generation_delete",
      expect.objectContaining({
        p_owner_uuid: ownerUuid,
        p_session_key_hash: createHmac(
          "sha256",
          "test-only-session-generation-secret-at-least-32-bytes",
        ).update(sessionId, "utf8").digest("hex"),
        p_hmac_key_version: 1,
      }),
    );
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(accessToken);
    expect(JSON.stringify(rpc.mock.calls)).not.toContain(sessionId);
    expect(rpc.mock.calls.map(([functionName]) => functionName)).toEqual([
      "get_account_generation_capability",
      "replay_account_generation_delete",
    ]);
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
    expect(ensureUserBootstrapState).not.toHaveBeenCalled();
  }, 15_000);

  it("fails closed when a stale G1 JWT targets an owner that already has G2", async () => {
    vi.stubEnv(
      "HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1",
      "test-only-session-generation-secret-at-least-32-bytes",
    );
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    const ownerUuid = "550e8400-e29b-41d4-a716-446655440001";
    const { accessToken, jwk } = createSignedTestAccessToken({
      aud: "authenticated",
      exp: 4102444800,
      iat: 1784764800,
      iss: "https://project.supabase.co/auth/v1",
      session_id: "550e8400-e29b-41d4-a716-446655440099",
      sub: ownerUuid,
    });
    vi.stubGlobal("fetch", vi.fn(async () => {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }));
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { access_token: accessToken } },
        })),
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
    });
    const rpc = createCapabilityRpc(
      { data: { state: "generation_active", revision: 4 }, error: null },
      { data: null, error: { message: "ACCOUNT_GENERATION_STALE" } },
    );
    createServiceRoleClient.mockReturnValue({ rpc });

    const { DELETE } = await importUsersMeRoute();
    const response = await DELETE(
      new Request("http://localhost:3000/api/v1/users/me", {
        method: "DELETE",
        headers: {
          "Idempotency-Key": "550e8400-e29b-41d4-a716-446655440000",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "ACCOUNT_GENERATION_STALE" },
    });
    expect(rpc.mock.calls.map(([functionName]) => functionName)).toEqual([
      "get_account_generation_capability",
      "replay_account_generation_delete",
    ]);
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
    expect(ensureUserBootstrapState).not.toHaveBeenCalled();
  }, 15_000);

  it("rejects auth-deleted replay when the JWT kid is unknown", async () => {
    vi.stubEnv(
      "HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1",
      "test-only-session-generation-secret-at-least-32-bytes",
    );
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    const { accessToken } = createSignedTestAccessToken({
      aud: "authenticated",
      exp: 4102444800,
      iat: 1784764800,
      iss: "https://project.supabase.co/auth/v1",
      session_id: "550e8400-e29b-41d4-a716-446655440099",
      sub: "550e8400-e29b-41d4-a716-446655440001",
    });
    vi.stubGlobal("fetch", vi.fn(async () => {
      return new Response(JSON.stringify({ keys: [] }), { status: 200 });
    }));
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { access_token: accessToken } },
        })),
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
    });
    const rpc = createCapabilityRpc({
      data: { state: "generation_active", revision: 4 },
      error: null,
    });
    createServiceRoleClient.mockReturnValue({ rpc });

    const { DELETE } = await importUsersMeRoute();
    const response = await DELETE(
      new Request("http://localhost:3000/api/v1/users/me", {
        method: "DELETE",
        headers: {
          "Idempotency-Key": "550e8400-e29b-41d4-a716-446655440000",
        },
      }),
    );

    expect(response.status).toBe(401);
    expect(rpc).not.toHaveBeenCalledWith(
      "replay_account_generation_delete",
      expect.anything(),
    );
  }, 15_000);

  it("adapts a server-verified generation session into the protected delete RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: { deletion_status: "cleanup_pending" },
      error: null,
    }));
    const { executeAccountGenerationDelete } = await importAccountGenerationActiveAdapter();

    const response = await executeAccountGenerationDelete({
      dbClient: { rpc },
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
      request: new Request("http://localhost:3000/api/v1/users/me", {
        method: "DELETE",
      }),
      sessionAuthority: {
        ownerUuid: "550e8400-e29b-41d4-a716-446655440001",
        authIdentityCreatedAt: "2026-07-23T00:00:00.000Z",
        sessionKeyHash: "a".repeat(64),
        hmacKeyVersion: 2,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual({
      success: true,
      data: { deletion_status: "cleanup_pending" },
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith("initiate_account_generation_delete", {
      p_owner_uuid: "550e8400-e29b-41d4-a716-446655440001",
      p_auth_identity_created_at_snapshot: "2026-07-23T00:00:00.000Z",
      p_session_key_hash: "a".repeat(64),
      p_hmac_key_version: 2,
      p_idempotency_key: "550e8400-e29b-41d4-a716-446655440000",
      p_payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("maps a protected delete replay conflict to the exact public error", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        code: "P0001",
        message: "IDEMPOTENCY_KEY_REUSED",
      },
    }));
    const { executeAccountGenerationDelete } = await importAccountGenerationActiveAdapter();

    const response = await executeAccountGenerationDelete({
      dbClient: { rpc },
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
      request: new Request("http://localhost:3000/api/v1/users/me", {
        method: "DELETE",
      }),
      sessionAuthority: {
        ownerUuid: "550e8400-e29b-41d4-a716-446655440001",
        authIdentityCreatedAt: "2026-07-23T00:00:00.000Z",
        sessionKeyHash: "a".repeat(64),
        hmacKeyVersion: 2,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "IDEMPOTENCY_KEY_REUSED" },
    });
  });

  it.each([
    "ACCOUNT_CUTOVER_UNCLASSIFIED",
    "ACCOUNT_CUTOVER_QUARANTINED",
    "ACCOUNT_SESSION_STALE",
    "ACCOUNT_GENERATION_STALE",
    "ACCOUNT_DELETING",
    "ACCOUNT_DELETION_PENDING",
  ] as const)("maps the protected RPC %s contract without aliasing", async (errorCode) => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        code: "P0001",
        message: errorCode,
      },
    }));
    const { executeAccountGenerationDelete } =
      await importAccountGenerationActiveAdapter();

    const response = await executeAccountGenerationDelete({
      dbClient: { rpc },
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
      request: new Request("http://localhost:3000/api/v1/users/me", {
        method: "DELETE",
      }),
      sessionAuthority: {
        ownerUuid: "550e8400-e29b-41d4-a716-446655440001",
        authIdentityCreatedAt: "2026-07-23T00:00:00.000Z",
        sessionKeyHash: "a".repeat(64),
        hmacKeyVersion: 2,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: errorCode },
    });
  });

  it("does not send a raw session identifier to the protected delete RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: { deletion_status: "cleanup_pending" },
      error: null,
    }));
    const { executeAccountGenerationDelete } = await importAccountGenerationActiveAdapter();

    const response = await executeAccountGenerationDelete({
      dbClient: { rpc },
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
      request: new Request("http://localhost:3000/api/v1/users/me", {
        method: "DELETE",
      }),
      sessionAuthority: {
        ownerUuid: "550e8400-e29b-41d4-a716-446655440001",
        authIdentityCreatedAt: "2026-07-23T00:00:00.000Z",
        sessionKeyHash: "550e8400-e29b-41d4-a716-446655440099",
        hmacKeyVersion: 2,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "INTERNAL_ERROR" },
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("derives only a versioned HMAC from the exact server-verified session", async () => {
    vi.stubEnv(
      "HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1",
      "test-only-session-generation-secret-at-least-32-bytes",
    );
    const sessionId = "550e8400-e29b-41d4-a716-446655440099";
    const user = {
      id: "550e8400-e29b-41d4-a716-446655440001",
      created_at: "2026-07-23T00:00:00.000Z",
    };
    const accessToken = createTestAccessToken({
      sub: user.id,
      session_id: sessionId,
      iat: 1784764800,
      exp: 4102444800,
    });
    const getUser = vi.fn(async (token?: string) => ({
      data: { user: token === accessToken ? user : null },
    }));
    const routeClient = {
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { access_token: accessToken } },
        })),
        getUser,
      },
    };
    const { readVerifiedAccountGenerationSession } =
      await importAccountGenerationActiveAdapter();

    const result = await readVerifiedAccountGenerationSession(routeClient);

    expect(result).toEqual({
      ok: true,
      sessionAuthority: {
        ownerUuid: user.id,
        authIdentityCreatedAt: user.created_at,
        sessionIssuedAt: new Date(1784764800 * 1_000).toISOString(),
        sessionKeyHash: createHmac(
          "sha256",
          "test-only-session-generation-secret-at-least-32-bytes",
        )
          .update(sessionId, "utf8")
          .digest("hex"),
        hmacKeyVersion: 1,
      },
    });
    expect(getUser).toHaveBeenCalledWith(accessToken);
    expect(JSON.stringify(result)).not.toContain(accessToken);
    expect(JSON.stringify(result)).not.toContain(sessionId);
  });

  it("keeps the quarantine resolution route non-exposed while capability is legacy", async () => {
    setupAuthedRouteClient();
    createServiceRoleClient.mockReturnValue({
      rpc: createCapabilityRpc({
        data: { state: "legacy", revision: 1 },
        error: null,
      }),
    });

    const { POST } = await importCutoverQuarantineRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/users/me/cutover-quarantine-resolution", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "RESOURCE_NOT_FOUND" },
    });
  });

  it("returns 503 maintenance for quarantine resolution during cutover maintenance", async () => {
    setupAuthedRouteClient();
    createServiceRoleClient.mockReturnValue({
      rpc: createCapabilityRpc({
        data: { state: "cutover_maintenance", revision: 3 },
        error: null,
      }),
    });

    const { POST } = await importCutoverQuarantineRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/users/me/cutover-quarantine-resolution", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "ACCOUNT_LIFECYCLE_MAINTENANCE" },
    });
  });

  it("routes auth-absent generation-active quarantine to Manual Only recovery", async () => {
    vi.stubEnv(
      "HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1",
      "test-only-session-generation-secret-at-least-32-bytes",
    );
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    const ownerUuid = "550e8400-e29b-41d4-a716-446655440001";
    const { accessToken, jwk } = createSignedTestAccessToken({
      aud: "authenticated",
      exp: 4102444800,
      iat: 1784764800,
      iss: "https://project.supabase.co/auth/v1",
      session_id: "550e8400-e29b-41d4-a716-446655440099",
      sub: ownerUuid,
    });
    vi.stubGlobal("fetch", vi.fn(async () => {
      return new Response(JSON.stringify({ keys: [jwk] }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }));
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { access_token: accessToken } },
        })),
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
    });
    const rpc = createCapabilityRpc({
      data: { state: "generation_active", revision: 4 },
      error: null,
    });
    createServiceRoleClient.mockReturnValue({ rpc });

    const { POST } = await importCutoverQuarantineRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/users/me/cutover-quarantine-resolution", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "ACCOUNT_QUARANTINE_MANUAL_RECOVERY_REQUIRED",
        message: "고객 지원을 통한 계정 복구가 필요해요.",
        fields: [],
      },
    });
    expect(rpc.mock.calls.map(([functionName]) => functionName)).toEqual([
      "get_account_generation_capability",
    ]);
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
    expect(ensureUserBootstrapState).not.toHaveBeenCalled();
  });

  it("keeps auth-absent quarantine at 401 when JWKS verification fails", async () => {
    vi.stubEnv(
      "HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1",
      "test-only-session-generation-secret-at-least-32-bytes",
    );
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    const { accessToken } = createSignedTestAccessToken({
      aud: "authenticated",
      exp: 4102444800,
      iat: 1784764800,
      iss: "https://project.supabase.co/auth/v1",
      session_id: "550e8400-e29b-41d4-a716-446655440099",
      sub: "550e8400-e29b-41d4-a716-446655440001",
    });
    vi.stubGlobal("fetch", vi.fn(async () => {
      return new Response(JSON.stringify({ keys: [] }), { status: 200 });
    }));
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { access_token: accessToken } },
        })),
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
    });

    const { POST } = await importCutoverQuarantineRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/users/me/cutover-quarantine-resolution", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      success: false,
      data: null,
      error: {
        code: "UNAUTHORIZED",
        message: "로그인이 필요해요.",
        fields: [],
      },
    });
    expect(createServiceRoleClient).not.toHaveBeenCalled();
    expect(ensurePublicUserRow).not.toHaveBeenCalled();
    expect(ensureUserBootstrapState).not.toHaveBeenCalled();
  });

  it("requires a UUID Idempotency-Key before generation-active quarantine resolution can run", async () => {
    setupAuthedRouteClient();
    createServiceRoleClient.mockReturnValue({
      rpc: createCapabilityRpc({
        data: { state: "generation_active", revision: 4 },
        error: null,
      }),
    });

    const { POST } = await importCutoverQuarantineRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/users/me/cutover-quarantine-resolution", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(428);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "IDEMPOTENCY_KEY_REQUIRED",
        fields: [{ field: "Idempotency-Key", reason: "required" }],
      },
    });
  });

  it("resolves an auth-present quarantine through the verified-session adapter", async () => {
    vi.stubEnv(
      "HOMECOOK_SESSION_GENERATION_HMAC_KEY_V1",
      "test-only-session-generation-secret-at-least-32-bytes",
    );
    const user = {
      id: "550e8400-e29b-41d4-a716-446655440001",
      created_at: "2026-07-23T00:00:00.000Z",
    };
    const accessToken = createTestAccessToken({
      sub: user.id,
      session_id: "550e8400-e29b-41d4-a716-446655440099",
      iat: 1784764800,
      exp: 4102444800,
    });
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getSession: vi.fn(async () => ({
          data: { session: { access_token: accessToken } },
        })),
        getUser: vi.fn(async (token?: string) => ({
          data: { user: !token || token === accessToken ? user : null },
        })),
      },
    });
    const rpc = createCapabilityRpc(
      { data: { state: "generation_active", revision: 4 }, error: null },
      { data: { resolution_status: "active", account_generation: 1 }, error: null },
    );
    createServiceRoleClient.mockReturnValue({ rpc });

    const { POST } = await importCutoverQuarantineRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/users/me/cutover-quarantine-resolution", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": "550e8400-e29b-41d4-a716-446655440000",
        },
        body: JSON.stringify({
          action: "activate",
          profile: { nickname: "집밥러" },
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { resolution_status: "active", account_generation: 1 },
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith(
      "resolve_account_cutover_quarantine",
      expect.objectContaining({
        p_owner_uuid: user.id,
        p_session_key_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
        p_hmac_key_version: 1,
        p_action: "activate",
        p_nickname: "집밥러",
      }),
    );
  });

  it("adapts an auth-present quarantine activate request into the protected RPC", async () => {
    const rpc = vi.fn(async () => ({
      data: { resolution_status: "active", account_generation: 1 },
      error: null,
    }));
    const { executeAccountQuarantineResolution } = await importAccountGenerationActiveAdapter();

    const response = await executeAccountQuarantineResolution({
      action: "activate",
      dbClient: { rpc },
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440010",
      nickname: "집밥러",
      request: new Request(
        "http://localhost:3000/api/v1/users/me/cutover-quarantine-resolution",
        { method: "POST" },
      ),
      sessionAuthority: {
        ownerUuid: "550e8400-e29b-41d4-a716-446655440001",
        authIdentityCreatedAt: "2026-07-23T00:00:00.000Z",
        sessionKeyHash: "b".repeat(64),
        hmacKeyVersion: 2,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { resolution_status: "active", account_generation: 1 },
      error: null,
    });
    expect(rpc).toHaveBeenCalledWith("resolve_account_cutover_quarantine", {
      p_owner_uuid: "550e8400-e29b-41d4-a716-446655440001",
      p_auth_identity_created_at_snapshot: "2026-07-23T00:00:00.000Z",
      p_session_key_hash: "b".repeat(64),
      p_hmac_key_version: 2,
      p_idempotency_key: "550e8400-e29b-41d4-a716-446655440010",
      p_payload_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_action: "activate",
      p_nickname: "집밥러",
    });
  });

  it("returns durable cleanup_pending for an auth-present quarantine delete", async () => {
    const rpc = vi.fn(async () => ({
      data: { deletion_status: "cleanup_pending" },
      error: null,
    }));
    const { executeAccountQuarantineResolution } = await importAccountGenerationActiveAdapter();

    const response = await executeAccountQuarantineResolution({
      action: "delete",
      dbClient: { rpc },
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440010",
      nickname: null,
      request: new Request(
        "http://localhost:3000/api/v1/users/me/cutover-quarantine-resolution",
        { method: "POST" },
      ),
      sessionAuthority: {
        ownerUuid: "550e8400-e29b-41d4-a716-446655440001",
        authIdentityCreatedAt: "2026-07-23T00:00:00.000Z",
        sessionKeyHash: "b".repeat(64),
        hmacKeyVersion: 2,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual({
      success: true,
      data: { deletion_status: "cleanup_pending" },
      error: null,
    });
  });

  it("maps auth-absent quarantine to manual recovery without mutation", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        code: "P0001",
        message: "ACCOUNT_QUARANTINE_MANUAL_RECOVERY_REQUIRED",
      },
    }));
    const { executeAccountQuarantineResolution } = await importAccountGenerationActiveAdapter();

    const response = await executeAccountQuarantineResolution({
      action: "delete",
      dbClient: { rpc },
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440010",
      nickname: null,
      request: new Request(
        "http://localhost:3000/api/v1/users/me/cutover-quarantine-resolution",
        { method: "POST" },
      ),
      sessionAuthority: {
        ownerUuid: "550e8400-e29b-41d4-a716-446655440001",
        authIdentityCreatedAt: "2026-07-23T00:00:00.000Z",
        sessionKeyHash: "b".repeat(64),
        hmacKeyVersion: 2,
      },
    });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "ACCOUNT_QUARANTINE_MANUAL_RECOVERY_REQUIRED" },
    });
  });
});
