import { beforeEach, describe, expect, it, vi } from "vitest";

const { createRouteHandlerClient } = vi.hoisted(() => ({
  createRouteHandlerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient }));

const listId = "550e8400-e29b-41d4-a716-446655440001";
const itemId = "550e8400-e29b-41d4-a716-446655440111";
const context = () => ({ params: Promise.resolve({ list_id: listId, item_id: itemId }) });
const request = (body: object) => new Request("http://localhost/api/v1/shopping", {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const routes = [
  { name: "preview", invoke: async () =>
    (await import("@/app/api/v1/shopping/preview/route")).GET() },
  { name: "detail", invoke: async () =>
    (await import("@/app/api/v1/shopping/lists/[list_id]/route")).GET(new Request("http://localhost/api/v1/shopping"), context()) },
  { name: "share text", invoke: async () =>
    (await import("@/app/api/v1/shopping/lists/[list_id]/share-text/route")).GET(new Request("http://localhost/api/v1/shopping"), context()) },
  { name: "complete", invoke: async () =>
    (await import("@/app/api/v1/shopping/lists/[list_id]/complete/route")).POST(new Request("http://localhost/api/v1/shopping", { method: "POST" }), context()) },
  { name: "item", invoke: async () =>
    (await import("@/app/api/v1/shopping/lists/[list_id]/items/[item_id]/route"))
      .PATCH(request({ is_checked: true }), context()) },
  { name: "bulk items", invoke: async () =>
    (await import("@/app/api/v1/shopping/lists/[list_id]/items/bulk/route"))
      .PATCH(request({ item_ids: [itemId], is_checked: true }), context()) },
  { name: "reorder", invoke: async () =>
    (await import("@/app/api/v1/shopping/lists/[list_id]/items/reorder/route"))
      .PATCH(request({ orders: [{ item_id: itemId, sort_order: 0 }] }), context()) },
];

describe("shopping leaf route authentication reads", () => {
  beforeEach(() => {
    vi.resetModules();
    createRouteHandlerClient.mockReset();
  });

  it.each(routes)("$name reads the same client once and rejects guests before table access", async ({ invoke }) => {
    const getUser = vi.fn(async () => ({ data: { user: null } }));
    const from = vi.fn();
    const rpc = vi.fn();
    createRouteHandlerClient.mockResolvedValue({ auth: { getUser }, from, rpc });

    const response = await invoke();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      data: null,
      error: { code: "UNAUTHORIZED" },
    });
    expect(createRouteHandlerClient).toHaveBeenCalledOnce();
    expect(getUser).toHaveBeenCalledOnce();
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
