import { readFile } from "node:fs/promises";

import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServerComponentClient = vi.fn();
const createServiceRoleClient = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServerComponentClient,
  createServiceRoleClient,
}));

vi.mock("next/navigation", () => ({
  notFound,
  redirect,
  usePathname: () => "/admin",
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
    insert: vi.fn(() => Promise.resolve(result)),
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
      throw new Error("page-view route must not use routeClient.from");
    }),
  };
  createRouteHandlerClient.mockResolvedValue(routeClient);
  return routeClient;
}

function setupServerComponentUser(user: { id: string } | null) {
  const serverComponentClient = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user } })),
    },
    from: vi.fn(() => {
      throw new Error("admin layout must not use serverComponentClient.from");
    }),
  };
  createServerComponentClient.mockResolvedValue(serverComponentClient);
  return serverComponentClient;
}

function setupAdminServiceClient({
  auditResult = { data: null, error: null },
  member = { user_id: "admin-1", role: "viewer" },
}: {
  auditResult?: QueryResult<null>;
  member?: Record<string, unknown> | null;
} = {}) {
  const adminMembersQuery = createQuery({ data: member, error: null });
  const auditInsertQuery = createQuery(auditResult);

  const client = {
    from: vi.fn((table: string) => {
      if (table === "admin_members") return adminMembersQuery;
      if (table === "admin_audit_logs") {
        return { insert: auditInsertQuery.insert };
      }
      if (table === "operational_events") {
        return { insert: auditInsertQuery.insert };
      }
      throw new Error(`unexpected table: ${table}`);
    }),
    __queries: { adminMembersQuery, auditInsertQuery },
  };
  createServiceRoleClient.mockReturnValue(client);
  return client;
}

async function importPageViewRoute() {
  return import("@/app/api/v1/admin/page-view/route");
}

async function importAdminLayout() {
  return import("@/app/admin/layout");
}

describe("admin page-view API route", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServerComponentClient.mockReset();
    createServiceRoleClient.mockReset();
    createServiceRoleClient.mockReturnValue(null);
    notFound.mockClear();
    redirect.mockClear();
    vi.stubGlobal("React", React);
  });

  it("returns 401 for unauthenticated users", async () => {
    setupRouteUser(null);

    const { POST } = await importPageViewRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/admin/page-view", {
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 403 for non-admin users", async () => {
    setupRouteUser({ id: "user-1" });
    setupAdminServiceClient({ member: null });

    const { POST } = await importPageViewRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/admin/page-view", {
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("writes admin_page_view audit and returns verified for admin users", async () => {
    setupRouteUser({ id: "admin-1" });
    const serviceClient = setupAdminServiceClient();

    const { POST } = await importPageViewRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/admin/page-view", {
        body: JSON.stringify({ path: "/admin/users?ignored=query" }),
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "AdminTest",
          "x-forwarded-for": "10.0.0.1",
        },
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.verified).toBe(true);
    expect(serviceClient.__queries.auditInsertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin_page_view",
        actor_admin_user_id: "admin-1",
        target_type: "admin_page",
        target_id: null,
        request_path: "/admin/users",
      }),
    );
  });

  it("records the admin feedback page path in page-view audit", async () => {
    setupRouteUser({ id: "admin-1" });
    const serviceClient = setupAdminServiceClient();

    const { POST } = await importPageViewRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/admin/page-view", {
        body: JSON.stringify({ path: "/admin/feedback?ignored=query" }),
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(serviceClient.__queries.auditInsertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin_page_view",
        request_path: "/admin/feedback",
      }),
    );
  });

  it("falls back to /admin when page-view path is not an admin page", async () => {
    setupRouteUser({ id: "admin-1" });
    const serviceClient = setupAdminServiceClient();

    const { POST } = await importPageViewRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/admin/page-view", {
        body: JSON.stringify({ path: "/api/v1/admin/users?q=secret" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    expect(serviceClient.__queries.auditInsertQuery.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        request_path: "/admin",
      }),
    );
  });

  it("fails closed when audit write fails", async () => {
    setupRouteUser({ id: "admin-1" });
    setupAdminServiceClient({
      auditResult: { data: null, error: { message: "insert failed" } },
    });

    const { POST } = await importPageViewRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/admin/page-view", {
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("ADMIN_AUDIT_WRITE_FAILED");
  });

  it("fails closed when service role is unavailable", async () => {
    setupRouteUser({ id: "admin-1" });
    createServiceRoleClient.mockReturnValue(null);

    const { POST } = await importPageViewRoute();
    const response = await POST(
      new Request("http://localhost:3000/api/v1/admin/page-view", {
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("ADMIN_SERVICE_ROLE_UNAVAILABLE");
  });
});

describe("admin server route guard", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServerComponentClient.mockReset();
    createServiceRoleClient.mockReset();
    createServiceRoleClient.mockReturnValue(null);
    notFound.mockClear();
    redirect.mockClear();
    vi.stubGlobal("React", React);
  });

  it("hides admin pages from unauthenticated visitors before content renders", async () => {
    setupServerComponentUser(null);

    const { default: AdminLayout } = await importAdminLayout();

    await expect(
      Promise.resolve().then(() => AdminLayout({ children: "admin-content" })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });

  it("hides admin pages from authenticated non-admin users before content renders", async () => {
    setupServerComponentUser({ id: "user-1" });
    const serviceClient = setupAdminServiceClient({ member: null });

    const { default: AdminLayout } = await importAdminLayout();

    await expect(
      Promise.resolve().then(() => AdminLayout({ children: "admin-content" })),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
    expect(serviceClient.from).toHaveBeenCalledWith("admin_members");
  });

  it("renders admin page content only for admin members", async () => {
    setupServerComponentUser({ id: "admin-1" });
    setupAdminServiceClient();

    const { default: AdminLayout } = await importAdminLayout();
    const output = await AdminLayout({ children: "admin-content" });

    expect(output.props.children).toBe("admin-content");
    expect(notFound).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("admin frontend structure validation", () => {
  it("has admin page routes without from/to date filter params", async () => {
    const eventsScreen = await readFile(
      "components/admin/admin-events-screen.tsx",
      "utf8",
    );
    const auditLogsScreen = await readFile(
      "components/admin/admin-audit-logs-screen.tsx",
      "utf8",
    );

    expect(eventsScreen).not.toMatch(/\bfrom\b.*date|date.*\bfrom\b/iu);
    expect(eventsScreen).not.toMatch(/\bto\b.*date|date.*\bto\b/iu);
    expect(auditLogsScreen).not.toMatch(/\bfrom\b.*date|date.*\bfrom\b/iu);
    expect(auditLogsScreen).not.toMatch(/\bto\b.*date|date.*\bto\b/iu);
  });

  it("has admin shell with disabled future nav placeholders", async () => {
    const shell = await readFile("components/admin/admin-shell.tsx", "utf8");

    expect(shell).toContain("/admin/feedback");
    expect(shell).toContain("피드백");
    expect(shell).toContain("커뮤니티");
    expect(shell).toContain("신고");
    expect(shell).toContain("제재");
    expect(shell).toContain('aria-disabled="true"');
    expect(shell).not.toContain('href="/admin/community"');
    expect(shell).not.toContain('href="/admin/reports"');
    expect(shell).not.toContain('href="/admin/moderation"');
  });

  it("admin pages use AdminAuthGuard for fail-closed audit-before-render", async () => {
    const dashboardPage = await readFile("app/admin/page.tsx", "utf8");
    const usersPage = await readFile("app/admin/users/page.tsx", "utf8");
    const eventsPage = await readFile("app/admin/events/page.tsx", "utf8");
    const feedbackPage = await readFile("app/admin/feedback/page.tsx", "utf8");
    const auditLogsPage = await readFile("app/admin/audit-logs/page.tsx", "utf8");

    for (const page of [
      dashboardPage,
      usersPage,
      eventsPage,
      feedbackPage,
      auditLogsPage,
    ]) {
      expect(page).toContain("AdminAuthGuard");
      expect(page).toContain("AdminShell");
    }
  });

  it("admin screen components handle loading/empty/error states", async () => {
    const usersScreen = await readFile(
      "components/admin/admin-users-screen.tsx",
      "utf8",
    );
    const eventsScreen = await readFile(
      "components/admin/admin-events-screen.tsx",
      "utf8",
    );
    const feedbackScreen = await readFile(
      "components/admin/admin-feedback-screen.tsx",
      "utf8",
    );
    const auditLogsScreen = await readFile(
      "components/admin/admin-audit-logs-screen.tsx",
      "utf8",
    );

    for (const screen of [
      usersScreen,
      eventsScreen,
      feedbackScreen,
      auditLogsScreen,
    ]) {
      expect(screen).toContain('"loading"');
      expect(screen).toContain('"empty"');
      expect(screen).toContain('"error"');
      expect(screen).toContain("다시 시도");
    }
  });

  it("admin auth guard handles unauthorized/forbidden/error states", async () => {
    const guard = await readFile(
      "components/admin/admin-auth-guard.tsx",
      "utf8",
    );

    expect(guard).toContain('"unauthorized"');
    expect(guard).toContain('"forbidden"');
    expect(guard).toContain('"error"');
    expect(guard).toContain("로그인이 필요해요");
    expect(guard).toContain("관리자 권한이 없어요");
    expect(guard).toContain("verifyAdminPageView");
    expect(guard).toContain("usePathname");
  });

  it("does not expose admin routes in normal user navigation", async () => {
    const appShell = await readFile("components/layout/app-shell.tsx", "utf8");
    const bottomTabs = await readFile("components/layout/bottom-tabs.tsx", "utf8");

    expect(appShell).not.toContain("/admin");
    expect(bottomTabs).not.toContain("/admin");
  });

  it("events screen includes event detail panel (accordion pattern)", async () => {
    const eventsScreen = await readFile(
      "components/admin/admin-events-screen.tsx",
      "utf8",
    );

    expect(eventsScreen).toContain("EventDetailPanel");
    expect(eventsScreen).toContain("expandedId");
    expect(eventsScreen).toContain("metadata_json");
    expect(eventsScreen).toContain("shouldDisplayMetadataField");
    expect(eventsScreen).toContain("BLOCKED_METADATA_KEY_PATTERNS");
    expect(eventsScreen).toContain("상세 메타데이터");
  });

  it("feedback screen reads only 404 feedback operational events", async () => {
    const feedbackScreen = await readFile(
      "components/admin/admin-feedback-screen.tsx",
      "utf8",
    );

    expect(feedbackScreen).toContain('FEEDBACK_EVENT_TYPE = "not_found_feedback"');
    expect(feedbackScreen).toContain('FEEDBACK_SOURCE = "web"');
    expect(feedbackScreen).toContain("fetchAdminOperationalEvents");
    expect(feedbackScreen).toContain("feedback_text");
    expect(feedbackScreen).toContain("current_path");
    expect(feedbackScreen).toContain("referrer_path");
    expect(feedbackScreen).toContain("is_authenticated");
    expect(feedbackScreen).toContain("아직 404 피드백이 없어요");
    expect(feedbackScreen).toContain("total={state.data.total}");
    expect(feedbackScreen).not.toContain("user_agent_hash");
    expect(feedbackScreen).not.toContain("anonymous_id");
  });

  it("audit logs screen includes actor filter and actor/hash display fields", async () => {
    const auditLogsScreen = await readFile(
      "components/admin/admin-audit-logs-screen.tsx",
      "utf8",
    );

    expect(auditLogsScreen).toContain("actorAdminUserId");
    expect(auditLogsScreen).toContain("actor_admin_user_id");
    expect(auditLogsScreen).toContain("관리자 UUID");
    expect(auditLogsScreen).toContain("ip_hash");
    expect(auditLogsScreen).toContain("user_agent_hash");
  });

  it("admin list screens pass API total counts into pagination", async () => {
    const usersScreen = await readFile(
      "components/admin/admin-users-screen.tsx",
      "utf8",
    );
    const eventsScreen = await readFile(
      "components/admin/admin-events-screen.tsx",
      "utf8",
    );
    const feedbackScreen = await readFile(
      "components/admin/admin-feedback-screen.tsx",
      "utf8",
    );
    const auditLogsScreen = await readFile(
      "components/admin/admin-audit-logs-screen.tsx",
      "utf8",
    );

    for (const screen of [
      usersScreen,
      eventsScreen,
      feedbackScreen,
      auditLogsScreen,
    ]) {
      expect(screen).toContain("total={state.data.total}");
      expect(screen).toContain("onPageChange={setPage}");
    }
    expect(usersScreen).toContain("setPage(1)");
    expect(eventsScreen).toContain("setPage(1)");
    expect(auditLogsScreen).toContain("setPage(1)");
  });

  it("page-view API route records admin_page_view audit", async () => {
    const pageViewRoute = await readFile(
      "app/api/v1/admin/page-view/route.ts",
      "utf8",
    );

    expect(pageViewRoute).toContain("admin_page_view");
    expect(pageViewRoute).toContain("requireAdminUser");
    expect(pageViewRoute).toContain("recordAdminAudit");
    expect(pageViewRoute).toContain("ADMIN_AUDIT_WRITE_FAILED");
  });
});
