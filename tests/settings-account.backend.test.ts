import { readFile } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();
const ensurePublicUserRow = vi.fn();
const ensureUserBootstrapState = vi.fn();
const formatBootstrapErrorMessage = vi.fn((error: unknown, fallbackMessage: string) => {
  if (error instanceof Error) {
    return `formatted: ${error.message}`;
  }

  return fallbackMessage;
});

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
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
    update: vi.fn(() => query),
    __query: query,
  };
}

function setupAuthedClient(
  dbClient: {
    from: ReturnType<typeof vi.fn>;
    rpc?: ReturnType<typeof vi.fn>;
  },
  user = { id: "user-1" },
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
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    ensurePublicUserRow.mockReset();
    ensureUserBootstrapState.mockReset();
    formatBootstrapErrorMessage.mockClear();
    ensurePublicUserRow.mockResolvedValue({});
    ensureUserBootstrapState.mockResolvedValue(undefined);
    createServiceRoleClient.mockReturnValue(null);
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
    const cleanupRpc = vi.fn(async () => ({
      data: {
        deleted: true,
        user_deleted: true,
        preserved_recipe_count: 2,
      },
      error: null,
    }));
    setupAuthedClient({
      from: vi.fn((table: string) => {
        throw new Error(`unexpected table: ${table}`);
      }),
      rpc: cleanupRpc,
    });

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
    expect(cleanupRpc).toHaveBeenCalledWith("delete_user_private_data", {
      p_user_id: "user-1",
    });
  });

  it("DELETE /users/me surfaces cleanup failures before reporting account deletion success", async () => {
    setupAuthedClient({
      from: vi.fn((table: string) => {
        throw new Error(`unexpected table: ${table}`);
      }),
      rpc: vi.fn(async () => ({
        data: null,
        error: { message: "cleanup failed" },
      })),
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
      "supabase/migrations/20260524154000_account_delete_private_data.sql",
      "utf8",
    );

    expect(migration).toContain("public.delete_user_private_data");
    expect(migration).toContain("delete from public.users");
    expect(migration).toContain("from public.recipe_book_items");
    expect(migration).toContain("set save_count =");
    expect(migration).toContain("set like_count =");
    expect(migration).toContain("where created_by = p_user_id");
    expect(migration).not.toContain("delete from public.recipes");
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

    const { POST } = await importLogoutRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/auth/logout", { method: "POST" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(routeClient.auth.signOut).toHaveBeenCalledTimes(1);
    expect(body).toEqual({
      success: true,
      data: { logged_out: true },
      error: null,
    });
  });

  it("POST /auth/logout rejects unauthenticated requests", async () => {
    createRouteHandlerClient.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({ data: { user: null } })),
        signOut: vi.fn(),
      },
    });

    const { POST } = await importLogoutRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/auth/logout", { method: "POST" }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED" },
    });
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
  });
});
