import { readFile } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

const cookies = vi.fn();
const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();
const executeHybridLogout = vi.fn();
const cookieGetAll = vi.fn();
const formatBootstrapErrorMessage = vi.fn((error: unknown, fallbackMessage: string) => {
  if (error instanceof Error) {
    return `formatted: ${error.message}`;
  }

  return fallbackMessage;
});

function getSetCookieHeaders(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() ?? [];
}

vi.mock("@/lib/supabase/server", () => ({
  createAccountLifecycleInternalRpcClient: createServiceRoleClient,
  createAuthRouteHandlerClient: createRouteHandlerClient,
  createDataServiceRoleClient: vi.fn(),
  createRemoteCompatibilityServiceRoleClient: createServiceRoleClient,
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
}));

vi.mock("@/lib/server/hybrid-auth/logout", () => ({
  executeHybridLogout,
}));

vi.mock("next/headers", () => ({
  cookies,
}));

interface QueryError {
  message: string;
}

interface QueryResult<T> {
  data: T | null;
  error: QueryError | null;
}

function createAwaitableQuery<T>(results: Array<QueryResult<T>>) {
  const query = {
    eq: vi.fn(() => query),
    update: vi.fn(() => query),
    select: vi.fn(() => query),
    maybeSingle: vi.fn(() =>
      Promise.resolve(
        results.shift() ?? {
          data: null,
          error: { message: "missing maybeSingle result" },
        },
      ),
    ),
    then(
      onFulfilled?: (value: QueryResult<T>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(
        results.shift() ?? {
          data: null,
          error: { message: "missing query result" },
        },
      ).then(onFulfilled, onRejected);
    },
  };

  return query;
}

function createUsersTable(results: Array<QueryResult<unknown>>) {
  const query = createAwaitableQuery(results);

  return {
    select: vi.fn(() => query),
    update: vi.fn<(values: Record<string, unknown>) => typeof query>(() => query),
    __query: query,
  };
}

function setupAuthedClient(
  dbClient: {
    from: ReturnType<typeof vi.fn>;
    rpc?: ReturnType<typeof vi.fn>;
  },
  user = { id: "user-1", created_at: "2026-07-23T00:00:00.000Z" },
) {
  const routeClient = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user } })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    from: dbClient.from,
    rpc: dbClient.rpc,
  };

  createRouteHandlerClient.mockResolvedValue(routeClient);
  createServiceRoleClient.mockReturnValue(null);

  return routeClient;
}

async function importUsersMeRoute() {
  return import("@/app/api/v1/users/me/route");
}

async function importUserSettingsRoute() {
  return import("@/app/api/v1/users/me/settings/route");
}

async function importLogoutRoute() {
  return import("@/app/api/v1/auth/logout/route");
}

describe("17c settings/account backend", () => {
  beforeEach(() => {
    vi.resetModules();
    cookies.mockReset();
    cookieGetAll.mockReset();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    executeHybridLogout.mockReset();
    formatBootstrapErrorMessage.mockClear();
    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
    createServiceRoleClient.mockReturnValue(null);
    executeHybridLogout.mockResolvedValue({
      ok: true,
    });
    cookies.mockResolvedValue({
      getAll: cookieGetAll,
    });
    cookieGetAll.mockReturnValue([]);
    vi.stubEnv("HOMECOOK_AUTH_AUTHORITY", "local");
    vi.stubEnv("NEXT_PUBLIC_AUTH_SUPABASE_URL", "https://local.mumeok.kr");
    vi.stubEnv("NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
    delete process.env.HOMECOOK_ENABLE_QA_FIXTURES;
  });

  it("PATCH /users/me/settings merges screen wake lock into existing settings", async () => {
    const usersTable = createUsersTable([
      {
        data: {
          settings_json: { user_bootstrap_version: 1, screen_wake_lock: false },
        },
        error: null,
      },
      {
        data: {
          settings_json: { user_bootstrap_version: 1, screen_wake_lock: true },
        },
        error: null,
      },
    ]);
    setupAuthedClient({
      from: vi.fn((table: string) => {
        if (table === "users") return usersTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { PATCH } = await importUserSettingsRoute();
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/users/me/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ screen_wake_lock: true }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { settings: { screen_wake_lock: true } },
      error: null,
    });
    expect(usersTable.update).toHaveBeenCalledWith(
      expect.objectContaining({
        settings_json: { user_bootstrap_version: 1, screen_wake_lock: true },
      }),
    );
  }, 15_000);

  it.each([
    { existing: { user_bootstrap_version: 1, screen_wake_lock: true }, patch: {}, expected: { user_bootstrap_version: 1, screen_wake_lock: true } },
    { existing: { user_bootstrap_version: 1, screen_wake_lock: true }, patch: { screen_wake_lock: false }, expected: { user_bootstrap_version: 1, screen_wake_lock: false } },
    { existing: { user_bootstrap_version: 1 }, patch: {}, expected: { user_bootstrap_version: 1 } },
    { existing: null, patch: {}, expected: {} },
    { existing: null, patch: { screen_wake_lock: false }, expected: { screen_wake_lock: false } },
    { existing: null, patch: { screen_wake_lock: true }, expected: { screen_wake_lock: true } },
  ])("PATCH preserves omission and explicit boolean settings: %j", async ({ existing, patch, expected }) => {
    const original = existing ? Object.freeze({ ...existing }) : null;
    const usersTable = createUsersTable([
      { data: { settings_json: original }, error: null },
      { data: { settings_json: expected }, error: null },
    ]);
    setupAuthedClient({ from: vi.fn(() => usersTable) });

    const { PATCH } = await importUserSettingsRoute();
    const response = await PATCH(new Request("http://localhost:3000/api/v1/users/me/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }));

    expect(response.status).toBe(200);
    expect(usersTable.update).toHaveBeenCalledWith(expect.objectContaining({ settings_json: expected }));
    const written = usersTable.update.mock.calls[0][0].settings_json;
    expect(written).toStrictEqual(expected);
    expect(written).not.toBe(original);
    expect(original).toEqual(existing);
    expect(await response.json()).toEqual({
      success: true,
      data: { settings: { screen_wake_lock: "screen_wake_lock" in expected && expected.screen_wake_lock === true } },
      error: null,
    });
  });

  it.each([
    { json: null, stored: {}, enabled: false },
    { json: "legacy-json", stored: {}, enabled: false },
    { json: 42, stored: {}, enabled: false },
    { json: true, stored: {}, enabled: false },
    { json: ["legacy"], stored: { 0: "legacy" }, enabled: false },
    { json: { keep: 1, screen_wake_lock: "true" }, stored: { keep: 1, screen_wake_lock: "true" }, enabled: false },
    { json: { keep: 1, screen_wake_lock: true }, stored: { keep: 1, screen_wake_lock: true }, enabled: true },
  ])("preserves profile and preference JSON consumption: %j", async ({ json, stored, enabled }) => {
    const usersTable = createUsersTable([
      { data: { id: "user-1", nickname: "집밥러", email: null, profile_image_url: null,
        social_provider: "google", settings_json: json }, error: null },
      { data: { settings_json: json }, error: null },
      { data: { settings_json: json }, error: null },
    ]);
    setupAuthedClient({ from: vi.fn(() => usersTable) });
    const profile = await importUsersMeRoute();
    const response = await profile.GET(new Request("http://localhost/api/v1/users/me"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true,
      data: { id: "user-1", settings: { screen_wake_lock: enabled } }, error: null });
    const preferences = await importUserSettingsRoute();
    const updated = await preferences.PATCH(new Request("http://localhost/api/v1/users/me/settings", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: "{}",
    }));
    expect(updated.status).toBe(200);
    expect(await updated.json()).toEqual({ success: true,
      data: { settings: { screen_wake_lock: enabled } }, error: null });
    expect(usersTable.update).toHaveBeenCalledWith(expect.objectContaining({ settings_json: stored }));
    for (const call of usersTable.__query.eq.mock.calls) expect(call).toEqual(["id", "user-1"]);
  });

  it("PATCH /users/me/settings rejects non-boolean wake lock values", async () => {
    setupAuthedClient({ from: vi.fn() });

    const { PATCH } = await importUserSettingsRoute();
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/users/me/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ screen_wake_lock: "yes" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "screen_wake_lock", reason: "boolean" }],
      },
    });
  });

  it("PATCH /users/me/settings rejects non-object request bodies", async () => {
    const { PATCH } = await importUserSettingsRoute();
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/users/me/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(null),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "INVALID_REQUEST",
        fields: [{ field: "body", reason: "invalid_object" }],
      },
    });
    expect(createRouteHandlerClient).not.toHaveBeenCalled();
  });

  it("PATCH /users/me updates nickname and returns the user profile envelope", async () => {
    const usersTable = createUsersTable([
      {
        data: {
          id: "user-1",
          nickname: "새집밥러",
          email: "user@example.com",
          profile_image_url: null,
          social_provider: "google",
          settings_json: { screen_wake_lock: true },
        },
        error: null,
      },
    ]);
    setupAuthedClient({
      from: vi.fn((table: string) => {
        if (table === "users") return usersTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    });

    const { PATCH } = await importUsersMeRoute();
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/users/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname: " 새집밥러 " }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        id: "user-1",
        nickname: "새집밥러",
        email: "user@example.com",
        profile_image_url: null,
        social_provider: "google",
        settings: { screen_wake_lock: true },
      },
      error: null,
    });
    expect(usersTable.update).toHaveBeenCalledWith(
      expect.objectContaining({ nickname: "새집밥러" }),
    );
  });

  it.each([
    ["empty", ""],
    ["one-character", "집"],
    ["31-character", "가".repeat(31)],
  ])("PATCH /users/me rejects %s nicknames", async (_label, nickname) => {
    setupAuthedClient({ from: vi.fn() });

    const { PATCH } = await importUsersMeRoute();
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/users/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        fields: [{ field: "nickname", reason: "length" }],
      },
    });
  });

  it("PATCH /users/me rejects non-object request bodies", async () => {
    const { PATCH } = await importUsersMeRoute();
    const response = await PATCH(
      new Request("http://localhost:3000/api/v1/users/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(null),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "INVALID_REQUEST",
        fields: [{ field: "body", reason: "invalid_object" }],
      },
    });
    expect(createRouteHandlerClient).not.toHaveBeenCalled();
  });

  it("DELETE /users/me removes private user data through the database cleanup policy", async () => {
    const cleanupRpc = vi.fn(async (functionName: string) => {
      if (functionName === "get_account_generation_capability") {
        return {
          data: { state: "legacy", revision: 1 },
          error: null,
        };
      }

      return {
        data: {
          deleted: true,
          user_deleted: true,
          preserved_recipe_count: 2,
        },
        error: null,
      };
    });
    setupAuthedClient({
      from: vi.fn((table: string) => {
        throw new Error(`unexpected table: ${table}`);
      }),
    });
    createServiceRoleClient.mockReturnValue({ rpc: cleanupRpc });

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
    expect(cleanupRpc).toHaveBeenCalledWith(
      "delete_user_private_data_with_generation_receipt",
      {
        p_user_id: "user-1",
        p_auth_identity_created_at: "2026-07-23T00:00:00.000Z",
      },
    );
  });

  it("DELETE /users/me fails closed when the service-role client is unavailable", async () => {
    const routeRpc = vi.fn();
    setupAuthedClient({
      from: vi.fn((table: string) => {
        throw new Error(`unexpected table: ${table}`);
      }),
      rpc: routeRpc,
    });
    createServiceRoleClient.mockReturnValue(null);

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
    expect(routeRpc).not.toHaveBeenCalled();
  });

  it.each([
    { payload: { deleted: true }, status: 200 },
    { payload: { deleted: false }, status: 500 },
    { payload: null, status: 500 },
    { payload: [], status: 500 },
    { payload: "true", status: 500 },
    { payload: 1, status: 500 },
    { payload: false, status: 500 },
    { payload: {}, status: 500 },
    { payload: { deleted: 1 }, status: 200 },
    { payload: { deleted: "legacy-truthy" }, status: 200 },
    { payload: { deleted: 0 }, status: 500 },
    { payload: { deleted: "" }, status: 500 },
    { payload: { deleted: [] }, status: 200 },
    { payload: { deleted: {} }, status: 200 },
  ])("preserves legacy cleanup JSON flag consumption %#", async ({ payload, status }) => {
    setupAuthedClient({ from: vi.fn(() => { throw new Error("unexpected table read"); }) });
    const rpc = vi.fn(async (name: string) => ({
      data: name === "get_account_generation_capability" ? { state: "legacy", revision: 1 } : payload,
      error: null,
    }));
    createServiceRoleClient.mockReturnValue({ rpc });
    const { DELETE } = await importUsersMeRoute();
    const response = await DELETE(new Request("http://localhost/api/v1/users/me", { method: "DELETE" }));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject(status === 200
      ? { success: true, data: { deleted: true }, error: null }
      : { success: false, data: null, error: { code: "INTERNAL_ERROR", fields: [] } });
    expect(rpc).toHaveBeenCalledWith("delete_user_private_data_with_generation_receipt", {
      p_user_id: "user-1", p_auth_identity_created_at: "2026-07-23T00:00:00.000Z",
    });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("DELETE /users/me surfaces cleanup failures before reporting account deletion success", async () => {
    setupAuthedClient({
      from: vi.fn((table: string) => {
        throw new Error(`unexpected table: ${table}`);
      }),
    });
    createServiceRoleClient.mockReturnValue({
      rpc: vi.fn(async (functionName: string) => {
        if (functionName === "get_account_generation_capability") {
          return {
            data: { state: "legacy", revision: 1 },
            error: null,
          };
        }
        return {
          data: null,
          error: { message: "cleanup failed" },
        };
      }),
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
  });

  it("adds an account deletion cleanup migration that preserves authored recipes", async () => {
    const migration = await readFile(
      "supabase/migrations/20260718090000_community_prepared_food_catalog.sql",
      "utf8",
    );

    expect(migration).toContain("public.delete_user_private_data");
    expect(migration).toContain("delete from public.users");
    expect(migration).toContain("from public.recipe_book_items");
    expect(migration).toContain("set save_count =");
    expect(migration).toContain("set like_count =");
    expect(migration).toContain("where created_by = p_user_id");
    expect(migration).not.toContain("delete from public.recipes");
    expect(migration).toContain("owner_user_id = null");
    expect(migration).toMatch(/visibility\s*=\s*'public'/);
    expect(migration).toMatch(/source_type\s*=\s*'manual'/);
  });

  it("rejects unauthenticated settings, nickname, and delete account requests", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
      },
      from: vi.fn(),
    });

    const settingsRoute = await importUserSettingsRoute();
    const usersMeRoute = await importUsersMeRoute();

    const settingsResponse = await settingsRoute.PATCH(
      new Request("http://localhost:3000/api/v1/users/me/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ screen_wake_lock: true }),
      }),
    );
    const nicknameResponse = await usersMeRoute.PATCH(
      new Request("http://localhost:3000/api/v1/users/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname: "새집밥러" }),
      }),
    );
    const deleteResponse = await usersMeRoute.DELETE(
      new Request("http://localhost:3000/api/v1/users/me", { method: "DELETE" }),
    );

    await expect(settingsResponse.json()).resolves.toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED" },
    });
    await expect(nicknameResponse.json()).resolves.toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED" },
    });
    await expect(deleteResponse.json()).resolves.toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED" },
    });

    expect(settingsResponse.status).toBe(401);
    expect(nicknameResponse.status).toBe(401);
    expect(deleteResponse.status).toBe(401);
  });

  it("POST /auth/logout invalidates the current session and returns an API envelope", async () => {
    const routeClient = setupAuthedClient({ from: vi.fn() });
    cookieGetAll.mockReturnValue([
      { name: "sb-local-auth-token.2" },
      { name: "sb-local-auth-token-code-verifier" },
      { name: "sb-other-auth-token.7" },
      { name: "sb-other-auth-token-code-verifier" },
      { name: "ui_preference" },
    ]);

    const { POST } = await importLogoutRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/auth/logout", {
        method: "POST",
        headers: {
          cookie: [
            "sb-local-auth-token=token",
            "sb-local-auth-token.0=chunk-0",
            "sb-other-auth-token=other-token",
            "sb-other-auth-token.0=other-chunk-0",
            "feature_flag=on",
          ].join("; "),
        },
      }),
    );
    const body = await response.json();
    const setCookieHeaders = getSetCookieHeaders(response);

    expect(response.status).toBe(200);
    expect(executeHybridLogout).toHaveBeenCalledOnce();
    expect(executeHybridLogout).toHaveBeenCalledWith(routeClient);
    expect(body).toEqual({
      success: true,
      data: { logged_out: true },
      error: null,
    });
    expect(response.cookies.get("sb-local-auth-token")?.maxAge).toBe(0);
    expect(response.cookies.get("sb-local-auth-token.0")?.maxAge).toBe(0);
    expect(response.cookies.get("sb-local-auth-token.2")?.maxAge).toBe(0);
    expect(response.cookies.get("sb-local-auth-token-code-verifier")?.maxAge).toBe(0);
    expect(response.cookies.get("sb-other-auth-token")).toBeUndefined();
    expect(response.cookies.get("sb-other-auth-token.0")).toBeUndefined();
    expect(response.cookies.get("sb-other-auth-token.7")).toBeUndefined();
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
    expect(setCookieHeaders.some((header) => /^sb-other-auth-token\.7=;/i.test(header))).toBe(
      false,
    );
    expect(
      setCookieHeaders.some((header) => /^sb-other-auth-token-code-verifier=;/i.test(header)),
    ).toBe(false);
    expect(setCookieHeaders.some((header) => /^feature_flag=;/i.test(header))).toBe(false);
    expect(setCookieHeaders.some((header) => /^ui_preference=;/i.test(header))).toBe(false);
  });

  it("POST /auth/logout fails closed before signOut when local authority revoke fails", async () => {
    const routeClient = setupAuthedClient({ from: vi.fn() });
    executeHybridLogout.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "ACCOUNT_SESSION_STALE",
        message: "세션을 다시 확인해 주세요.",
        status: 409,
      },
    });
    cookieGetAll.mockReturnValue([{ name: "sb-local-auth-token.1" }]);

    const { POST } = await importLogoutRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/auth/logout", {
        method: "POST",
        headers: {
          cookie: "sb-local-auth-token=token",
        },
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "ACCOUNT_SESSION_STALE" },
    });
    expect(response.status).toBe(409);
    expect(executeHybridLogout).toHaveBeenCalledWith(routeClient);
    expect(response.cookies.get("sb-local-auth-token")?.maxAge).toBe(0);
    expect(response.cookies.get("sb-local-auth-token.1")?.maxAge).toBe(0);
    expect(getSetCookieHeaders(response)).toContainEqual(
      expect.stringMatching(
        /__Host-homecook-auth-flow=;.*Path=\/.*Max-Age=0.*Secure.*HttpOnly.*SameSite=Lax/i,
      ),
    );
  });

  it("POST /auth/logout returns an explicit internal error when signOut fails", async () => {
    const routeClient = setupAuthedClient({ from: vi.fn() });
    executeHybridLogout.mockResolvedValueOnce({
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "로그아웃하지 못했어요.",
        status: 500,
      },
    });
    cookieGetAll.mockReturnValue([{ name: "sb-local-auth-token.3" }]);

    const { POST } = await importLogoutRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/auth/logout", {
        method: "POST",
        headers: {
          cookie: "sb-local-auth-token=token",
        },
      }),
    );

    await expect(response.json()).resolves.toEqual({
      success: false,
      data: null,
      error: {
        code: "INTERNAL_ERROR",
        message: "로그아웃하지 못했어요.",
        fields: [],
      },
    });
    expect(response.status).toBe(500);
    expect(executeHybridLogout).toHaveBeenCalledWith(routeClient);
    expect(response.cookies.get("sb-local-auth-token")?.maxAge).toBe(0);
    expect(response.cookies.get("sb-local-auth-token.3")?.maxAge).toBe(0);
    expect(getSetCookieHeaders(response)).toContainEqual(
      expect.stringMatching(
        /__Host-homecook-auth-flow=;.*Path=\/.*Max-Age=0.*Secure.*HttpOnly.*SameSite=Lax/i,
      ),
    );
  });

  it("POST /auth/logout rejects unauthenticated requests", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
        signOut: vi.fn(),
      },
    });
    cookieGetAll.mockReturnValue([{ name: "sb-local-auth-token.4" }]);

    const { POST } = await importLogoutRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/auth/logout", {
        method: "POST",
        headers: {
          cookie: "sb-local-auth-token=token",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED" },
    });
    expect(response.cookies.get("sb-local-auth-token")?.maxAge).toBe(0);
    expect(response.cookies.get("sb-local-auth-token.4")?.maxAge).toBe(0);
    expect(getSetCookieHeaders(response)).toContainEqual(
      expect.stringMatching(
        /__Host-homecook-auth-flow=;.*Path=\/.*Max-Age=0.*Secure.*HttpOnly.*SameSite=Lax/i,
      ),
    );
  });

  it("QA fixture auth lets the settings screen fetch account data without Supabase", async () => {
    process.env.HOMECOOK_ENABLE_QA_FIXTURES = "1";

    const usersMeRoute = await importUsersMeRoute();
    const settingsRoute = await importUserSettingsRoute();
    const logoutRoute = await importLogoutRoute();
    const authHeaders = { "x-homecook-e2e-auth": "authenticated" };

    const profileResponse = await usersMeRoute.GET(
      new Request("http://localhost:3000/api/v1/users/me", {
        headers: authHeaders,
      }),
    );
    const settingsResponse = await settingsRoute.PATCH(
      new Request("http://localhost:3000/api/v1/users/me/settings", {
        method: "PATCH",
        headers: {
          ...authHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({ screen_wake_lock: true }),
      }),
    );
    const logoutResponse = await logoutRoute.POST(
      new Request("http://localhost:3000/api/v1/auth/logout", {
        method: "POST",
        headers: authHeaders,
      }),
    );

    await expect(profileResponse.json()).resolves.toMatchObject({
      success: true,
      data: {
        nickname: "집밥러",
        settings: { screen_wake_lock: false },
      },
    });
    await expect(settingsResponse.json()).resolves.toEqual({
      success: true,
      data: { settings: { screen_wake_lock: true } },
      error: null,
    });
    await expect(logoutResponse.json()).resolves.toEqual({
      success: true,
      data: { logged_out: true },
      error: null,
    });

    expect(profileResponse.status).toBe(200);
    expect(settingsResponse.status).toBe(200);
    expect(logoutResponse.status).toBe(200);
    expect(createRouteHandlerClient).not.toHaveBeenCalled();
    expect(getSetCookieHeaders(logoutResponse)).toContainEqual(
      expect.stringMatching(
        /__Host-homecook-auth-flow=;.*Path=\/.*Max-Age=0.*Secure.*HttpOnly.*SameSite=Lax/i,
      ),
    );
  });

  it("QA fixture account endpoints still reject guest overrides", async () => {
    process.env.HOMECOOK_ENABLE_QA_FIXTURES = "1";

    const usersMeRoute = await importUsersMeRoute();
    const settingsRoute = await importUserSettingsRoute();
    const logoutRoute = await importLogoutRoute();
    const guestHeaders = { "x-homecook-e2e-auth": "guest" };

    const profileResponse = await usersMeRoute.GET(
      new Request("http://localhost:3000/api/v1/users/me", {
        headers: guestHeaders,
      }),
    );
    const settingsResponse = await settingsRoute.PATCH(
      new Request("http://localhost:3000/api/v1/users/me/settings", {
        method: "PATCH",
        headers: {
          ...guestHeaders,
          "content-type": "application/json",
        },
        body: JSON.stringify({ screen_wake_lock: true }),
      }),
    );
    const logoutResponse = await logoutRoute.POST(
      new Request("http://localhost:3000/api/v1/auth/logout", {
        method: "POST",
        headers: guestHeaders,
      }),
    );

    await expect(profileResponse.json()).resolves.toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED" },
    });
    await expect(settingsResponse.json()).resolves.toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED" },
    });
    await expect(logoutResponse.json()).resolves.toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED" },
    });

    expect(profileResponse.status).toBe(401);
    expect(settingsResponse.status).toBe(401);
    expect(logoutResponse.status).toBe(401);
    expect(createRouteHandlerClient).not.toHaveBeenCalled();
    expect(getSetCookieHeaders(logoutResponse)).toContainEqual(
      expect.stringMatching(
        /__Host-homecook-auth-flow=;.*Path=\/.*Max-Age=0.*Secure.*HttpOnly.*SameSite=Lax/i,
      ),
    );
  });
});
