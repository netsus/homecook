import { beforeEach, describe, expect, it, vi } from "vitest";

const createRouteHandlerClient = vi.fn();
const createServiceRoleClient = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createServiceRoleClient,
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({
    "user-agent": "Vitest Browser",
  })),
}));

interface QueryResult {
  error: { message: string } | null;
}

function setupClients({
  insertResult = { error: null },
  user = null,
}: {
  insertResult?: QueryResult;
  user?: { id: string } | null;
} = {}) {
  const insert = vi.fn(async (values: Record<string, unknown>) => {
    void values;
    return insertResult;
  });
  const serviceClient = {
    from: vi.fn((table: string) => {
      if (table !== "operational_events") {
        throw new Error(`unexpected table: ${table}`);
      }

      return { insert };
    }),
  };
  const routeClient = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user } })),
    },
  };

  createRouteHandlerClient.mockResolvedValue(routeClient);
  createServiceRoleClient.mockReturnValue(serviceClient);

  return { insert, routeClient, serviceClient };
}

async function importRoute() {
  return import("@/app/api/v1/feedback/404/route");
}

describe("POST /api/v1/feedback/404", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
    createServiceRoleClient.mockReset();
    createServiceRoleClient.mockReturnValue(null);
  });

  it("rejects empty feedback without writing an operational event", async () => {
    const { insert } = setupClients();
    const { POST } = await importRoute();

    const response = await POST(
      new Request("http://localhost:3000/api/v1/feedback/404", {
        body: JSON.stringify({ message: "   " }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(insert).not.toHaveBeenCalled();
  });

  it("records sanitized 404 feedback with path, referrer, auth, and user agent context", async () => {
    const { insert } = setupClients({ user: { id: "user-1" } });
    const { POST } = await importRoute();

    const response = await POST(
      new Request("http://localhost:3000/api/v1/feedback/404", {
        body: JSON.stringify({
          anonymous_id: "anon_1234567890abcdef",
          current_url: "http://localhost:3000/missing?token=secret",
          message: "플래너 링크가 깨졌어요. me@example.com https://example.com 010-1234-5678",
          occurred_at: "2026-06-20T09:00:00.000Z",
          referrer: "http://localhost:3000/planner?next=/private",
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({ received: true });
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actor_user_id: "user-1",
        error_code: "ROUTE_NOT_FOUND",
        event_type: "not_found_feedback",
        http_status: 404,
        request_path: "/missing",
        severity: "warn",
        source: "web",
      }),
    );

    const row = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(JSON.stringify(row)).not.toContain("me@example.com");
    expect(JSON.stringify(row)).not.toContain("https://example.com");
    expect(JSON.stringify(row)).not.toContain("010-1234-5678");
    expect(row.message_summary).toBe("플래너 링크가 깨졌어요. [이메일 제거] [링크 제거] [연락처 제거]");
    expect(row.metadata_json).toMatchObject({
      anonymous_id: null,
      current_path: "/missing",
      feedback_text: "플래너 링크가 깨졌어요. [이메일 제거] [링크 제거] [연락처 제거]",
      is_authenticated: true,
      occurred_at: "2026-06-20T09:00:00.000Z",
      referrer_path: "/planner",
    });
    expect(JSON.stringify(row.metadata_json)).toMatch(/sha256:/u);
  });

  it("returns a failure when the operational event cannot be stored", async () => {
    setupClients({ insertResult: { error: { message: "insert failed" } } });
    const { POST } = await importRoute();

    const response = await POST(
      new Request("http://localhost:3000/api/v1/feedback/404", {
        body: JSON.stringify({ message: "깨진 링크 같아요." }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("NOT_FOUND_FEEDBACK_WRITE_FAILED");
  });
});
