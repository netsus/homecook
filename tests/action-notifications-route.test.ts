import { AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), verified: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient: async () => ({ auth: { getUser: mocks.user } }),
  createActionNotificationsInternalClient: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/server/account-generation/session-authority", () => ({ readVerifiedAccountGenerationSession: mocks.verified }));
import { decodeActionNotificationCursor, listActionNotifications, markActionNotificationsSeen, projectActionNotificationPage } from "@/lib/server/action-notifications";
import type { ActionNotification } from "@/types/action-notification";
import { GET } from "@/app/api/v1/users/me/action-notifications/route";
import { POST } from "@/app/api/v1/users/me/action-notifications/seen/route";
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ data: { user: { id, created_at: "2026-01-01T00:00:00Z" } }, error: null });
  mocks.verified.mockResolvedValue({ ok: true, sessionAuthority: { ownerUuid: id, authIdentityCreatedAt: "2026-01-01T00:00:00Z", sessionKeyHash: "verified", hmacKeyVersion: 1, sessionIssuedAt: "2026-01-01T00:00:00Z" } });
});
describe("action notification API", () => {
  const notificationRequests = [
    ["GET", () => GET(new Request("http://localhost/api/v1/users/me/action-notifications"))],
    ["POST seen", () => POST(new Request("http://localhost/api/v1/users/me/action-notifications/seen", {
      method: "POST", body: JSON.stringify({ ids: [id] }),
    }))],
  ] as const;
  it.each(notificationRequests)("%s returns 401 for the SDK's missing session error", async (_name, request) => {
    mocks.user.mockResolvedValueOnce({ data: { user: null }, error: new AuthSessionMissingError() });
    const response = await request();
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    expect(mocks.verified).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(notificationRequests)("%s retains 503 for an authentication transport failure", async (_name, request) => {
    mocks.user.mockResolvedValueOnce({ data: { user: null }, error: new Error("network timeout") });
    const response = await request();
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("SERVICE_UNAVAILABLE");
    expect(mocks.verified).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uses only verified owner authority and retains microsecond cursor order", async () => {
    const row = { id, created_at: "2026-09-28T01:02:03.123456+00:00" } as ActionNotification;
    const page = projectActionNotificationPage([row, row], 2, 1);
    expect(decodeActionNotificationCursor(page.next_cursor!)).toEqual({ id, created_at: row.created_at });
    mocks.rpc.mockResolvedValue({ data: { items: [row], unread_count: 1 }, error: null });
    const response = await listActionNotifications(new Request("http://localhost/api?owner_uuid=evil&account_generation=900"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_owner_uuid: id, p_session_key_hash: "verified" });
    expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty("p_account_generation");
  });
  it("bounds and validates cursors and seen requests before RPC", async () => {
    expect((await listActionNotifications(new Request("http://localhost/api?limit=51"))).status).toBe(422);
    expect((await listActionNotifications(new Request("http://localhost/api?cursor=garbage"))).status).toBe(422);
    expect((await markActionNotificationsSeen(new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ ids: ["bad"] }) }))).status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("fails closed without authentication and preserves transport errors as unavailable", async () => {
    mocks.user.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect((await listActionNotifications(new Request("http://localhost/api"))).status).toBe(401);
    mocks.rpc.mockRejectedValueOnce(new Error("network timeout"));
    expect((await listActionNotifications(new Request("http://localhost/api"))).status).toBe(503);
  });
  it("does not report an inconclusive authority check as a session error", async () => {
    mocks.verified.mockResolvedValueOnce({ ok: false });
    const response = await listActionNotifications(new Request("http://localhost/api"));
    expect(response.status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("marks only requested IDs with verified identity and deduplicates repeated ids", async () => {
    mocks.rpc.mockResolvedValue({ data: { seen_ids: [id], unread_count: 0 }, error: null });
    const response = await markActionNotificationsSeen(new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ ids: [id, id], owner_uuid: "evil" }) }));
    expect(response.status).toBe(200);
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({ p_ids: [id], p_owner_uuid: id });
  });
});
