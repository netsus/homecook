import { readFile } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

interface QueryError {
  message: string;
}

interface QueryResult<T> {
  data: T | null;
  error: QueryError | null;
  count?: number | null;
}

function createQuery<T>(result: QueryResult<T>) {
  const query = {
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
    in: vi.fn(() => query),
    insert: vi.fn(() => Promise.resolve(result)),
    lte: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(() => query),
    select: vi.fn(() => query),
    then(
      onFulfilled?: (value: QueryResult<T>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };

  return query;
}

function setupRouteUser(user: { id: string } | null) {
  const routeClient = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user } })),
    },
    from: vi.fn(() => {
      throw new Error("admin route must not use routeClient.from");
    }),
  };

  createRouteHandlerClient.mockResolvedValue(routeClient);

  return routeClient;
}

function setupAdminServiceClient({
  auditResult = { data: null, error: null },
  auditRows = [{ id: "audit-1", actor_admin_user_id: "admin-1", action: "list_users", target_type: "user_search", target_id: null, request_path: "/api/v1/admin/users", result: "success", ip_hash: "sha256:old", user_agent_hash: "sha256:ua", created_at: "2026-05-27T00:00:00Z" }],
  eventsRows = [{ id: "event-1", event_type: "youtube_provider_failure", severity: "error", source: "youtube", actor_user_id: "user-1", target_user_id: null, request_path: "/api/v1/recipes/youtube/extract", http_status: 502, error_code: "PROVIDER_ERROR", message_summary: "YouTube provider request failed", metadata_json: {}, created_at: "2026-05-27T00:00:00Z" }],
  member = { user_id: "admin-1", role: "viewer" },
  userRows = [{ id: "user-1", email: "cook@example.com", social_provider: "google", nickname: "Home Cook", created_at: "2026-05-27T00:00:00Z", deleted_at: null }],
}: {
  auditResult?: QueryResult<null>;
  auditRows?: Array<Record<string, unknown>>;
  eventsRows?: Array<Record<string, unknown>>;
  member?: Record<string, unknown> | null;
  userRows?: Array<Record<string, unknown>>;
} = {}) {
  const adminMembersQuery = createQuery({ data: member, error: null });
  const auditInsertQuery = createQuery(auditResult);
  const usersQuery = createQuery({ data: userRows, error: null, count: userRows.length });
  const recipeBooksQuery = createQuery({
    data: [{ user_id: "user-1" }, { user_id: "user-1" }],
    error: null,
  });
  const mealsQuery = createQuery({ data: [{ user_id: "user-1" }], error: null });
  const shoppingListsQuery = createQuery({ data: [{ user_id: "user-1" }], error: null });
  const pantryItemsQuery = createQuery({
    data: [{ user_id: "user-1" }, { user_id: "user-1" }, { user_id: "user-1" }],
    error: null,
  });
  const eventsQuery = createQuery({ data: eventsRows, error: null, count: eventsRows.length });
  const auditLogsQuery = createQuery({ data: auditRows, error: null, count: auditRows.length });

  const client = {
    from: vi.fn((table: string) => {
      if (table === "admin_members") return adminMembersQuery;
      if (table === "admin_audit_logs") {
        return {
          insert: auditInsertQuery.insert,
          select: vi.fn(() => auditLogsQuery),
        };
      }
      if (table === "users") return usersQuery;
      if (table === "recipe_books") return recipeBooksQuery;
      if (table === "meals") return mealsQuery;
      if (table === "shopping_lists") return shoppingListsQuery;
      if (table === "pantry_items") return pantryItemsQuery;
      if (table === "operational_events") return eventsQuery;
      throw new Error(`unexpected table: ${table}`);
    }),
    __queries: {
      adminMembersQuery,
      auditInsertQuery,
      auditLogsQuery,
      eventsQuery,
      pantryItemsQuery,
      recipeBooksQuery,
      shoppingListsQuery,
      usersQuery,
    },
  };

  createServiceRoleClient.mockReturnValue(client);

  return client;
}

async function importAdminUsersRoute() {
  return import("@/app/api/v1/admin/users/route");
}

async function importAdminEventsRoute() {
  return import("@/app/api/v1/admin/operational-events/route");
}

async function importAdminAuditLogsRoute() {
  return import("@/app/api/v1/admin/audit-logs/route");
}

describe("admin foundation backend", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    createServiceRoleClient.mockReturnValue(null);
  });

  it("returns 401 for guests before admin data access", async () => {
    const routeClient = setupRouteUser(null);

    const { GET } = await importAdminUsersRoute();
    const response = await GET(
      new Request("http://localhost:3000/api/v1/admin/users"),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
    expect(routeClient.from).not.toHaveBeenCalled();
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("returns 403 for authenticated non-admin users", async () => {
    setupRouteUser({ id: "user-1" });
    const serviceClient = setupAdminServiceClient({ member: null });

    const { GET } = await importAdminUsersRoute();
    const response = await GET(
      new Request("http://localhost:3000/api/v1/admin/users"),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
    expect(serviceClient.from).toHaveBeenCalledWith("admin_members");
    expect(serviceClient.from).not.toHaveBeenCalledWith("users");
  });

  it("fails closed when the service role client is unavailable and never falls back to routeClient", async () => {
    const routeClient = setupRouteUser({ id: "admin-1" });
    createServiceRoleClient.mockReturnValue(null);

    const { GET } = await importAdminUsersRoute();
    const response = await GET(
      new Request("http://localhost:3000/api/v1/admin/users"),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("ADMIN_SERVICE_ROLE_UNAVAILABLE");
    expect(routeClient.from).not.toHaveBeenCalled();
  });

  it("returns masked user summaries and writes a search audit without the search term", async () => {
    setupRouteUser({ id: "admin-1" });
    const serviceClient = setupAdminServiceClient();

    const { GET } = await importAdminUsersRoute();
    const response = await GET(
      new Request("http://localhost:3000/api/v1/admin/users?q=cook%40example.com&page=1&limit=20", {
        headers: {
          "user-agent": "Admin Browser",
          "x-forwarded-for": "203.0.113.10",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: {
        items: [
          {
            id: "user-1",
            email_masked: "co***@example.com",
            social_provider: "google",
            nickname: "Home Cook",
            created_at: "2026-05-27T00:00:00Z",
            counts: {
              recipe_books: 2,
              meals: 1,
              shopping_lists: 1,
              pantry_items: 3,
            },
            status: "active",
          },
        ],
        page: 1,
        limit: 20,
        total: 1,
      },
      error: null,
    });
    expect(JSON.stringify(body)).not.toContain("cook@example.com");
    expect(serviceClient.__queries.usersQuery.or).toHaveBeenCalled();
    expect(serviceClient.__queries.auditInsertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "list_users",
        actor_admin_user_id: "admin-1",
        request_path: "/api/v1/admin/users",
        target_id: null,
        target_type: "user_search",
      }),
    );

    const auditInsertCalls = serviceClient.__queries.auditInsertQuery.insert.mock
      .calls as unknown as Array<[Record<string, string | null>]>;
    const auditRow = auditInsertCalls[0]?.[0];
    expect(auditRow).toBeDefined();
    if (!auditRow) {
      throw new Error("missing audit insert row");
    }

    expect(JSON.stringify(auditRow)).not.toContain("cook@example.com");
    expect(auditRow.ip_hash).toMatch(/^sha256:/u);
    expect(auditRow.user_agent_hash).toMatch(/^sha256:/u);
    expect(auditRow.ip_hash).not.toContain("203.0.113.10");
    expect(auditRow.user_agent_hash).not.toContain("Admin Browser");
  });

  it("lists operational events and audit logs with audit records for each read", async () => {
    setupRouteUser({ id: "admin-1" });
    const serviceClient = setupAdminServiceClient();

    const { GET: getEvents } = await importAdminEventsRoute();
    const eventsResponse = await getEvents(
      new Request("http://localhost:3000/api/v1/admin/operational-events?event_type=youtube_provider_failure&source=youtube"),
    );
    const eventsBody = await eventsResponse.json();

    expect(eventsResponse.status).toBe(200);
    expect(eventsBody.data.items[0]).toMatchObject({
      event_type: "youtube_provider_failure",
      request_path: "/api/v1/recipes/youtube/extract",
    });
    expect(serviceClient.__queries.auditInsertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "list_operational_events",
        request_path: "/api/v1/admin/operational-events",
        target_type: "operational_event_list",
      }),
    );

    const { GET: getAuditLogs } = await importAdminAuditLogsRoute();
    const auditResponse = await getAuditLogs(
      new Request("http://localhost:3000/api/v1/admin/audit-logs?action=list_users"),
    );
    const auditBody = await auditResponse.json();

    expect(auditResponse.status).toBe(200);
    expect(auditBody.data.items[0]).toMatchObject({
      action: "list_users",
      request_path: "/api/v1/admin/users",
    });
    expect(serviceClient.__queries.auditInsertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "list_audit_logs",
        request_path: "/api/v1/admin/audit-logs",
        target_type: "audit_log_list",
      }),
    );
  });

  it("fails closed when audit writing fails", async () => {
    setupRouteUser({ id: "admin-1" });
    setupAdminServiceClient({
      auditResult: { data: null, error: { message: "audit insert failed" } },
    });

    const { GET } = await importAdminUsersRoute();
    const response = await GET(
      new Request("http://localhost:3000/api/v1/admin/users"),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("ADMIN_AUDIT_WRITE_FAILED");
  });

  it("sanitizes operational metadata and keeps request paths query-free", async () => {
    const {
      maskEmail,
      normalizeRequestPath,
      sanitizeOperationalMetadata,
    } = await import("@/lib/server/admin-log-sanitize");

    expect(maskEmail(null)).toBeNull();
    expect(maskEmail("a@example.com")).toBe("a***@example.com");
    expect(maskEmail("cook@example.com")).toBe("co***@example.com");
    expect(
      normalizeRequestPath(
        "http://localhost:3000/auth/callback?code=secret&next=/planner&error=access_denied",
      ),
    ).toBe("/auth/callback");

    const sanitized = sanitizeOperationalMetadata({
      code: "oauth-code",
      nested: {
        nickname: "Home Cook",
        safe_count: 2,
      },
      q: "admin search",
      raw_source_text: "private transcript",
      user_email: "cook@example.com",
      youtube_url: "https://www.youtube.com/watch?v=secret",
    });

    expect(sanitized).toEqual({ nested: { safe_count: 2 } });
  });

  it("defines service-role-only admin tables and bootstrap without runtime allowlist bypass", async () => {
    const migration = await readFile(
      "supabase/migrations/20260527030000_admin_foundation.sql",
      "utf8",
    );
    const authHelper = await readFile("lib/server/admin-auth.ts", "utf8");

    expect(migration).toContain("create table if not exists public.admin_members");
    expect(migration).toContain("create table if not exists public.operational_events");
    expect(migration).toContain("create table if not exists public.admin_audit_logs");
    expect(migration).toContain("alter table public.admin_members enable row level security");
    expect(migration).toContain("grant all privileges on public.admin_members to service_role");
    expect(migration).toContain("insert into public.admin_members (user_id, role)");
    expect(authHelper).toContain("createServiceRoleClient()");
    expect(authHelper).toContain("admin_members");
    expect(authHelper).not.toMatch(/ADMIN_(EMAIL|USER|ALLOW|ALLOWLIST|UUID|ID)/u);
  });

  it("wires operational event recording into the minimum backend sources", async () => {
    const authCallback = await readFile("app/auth/callback/route.ts", "utf8");
    const youtubeImport = await readFile("lib/server/youtube-import.ts", "utf8");
    const usersMeRoute = await readFile("app/api/v1/users/me/route.ts", "utf8");
    const adminAuth = await readFile("lib/server/admin-auth.ts", "utf8");

    expect(authCallback).toContain("recordOperationalEvent");
    expect(youtubeImport).toContain("youtube_provider_failure");
    expect(usersMeRoute).toContain("account_delete_success");
    expect(usersMeRoute).toContain("account_delete_failure");
    expect(adminAuth).toContain("admin_service_role_missing");
    expect(adminAuth).toContain("unhandled_server_error");
  });
});
