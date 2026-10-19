import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { PATCH, type ShoppingReorderDbClient } from "@/app/api/v1/shopping/lists/[list_id]/items/reorder/route";
import { USER_BOOTSTRAP_VERSION } from "@/lib/server/user-bootstrap";

const mocks = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route }));
const owner = "550e8400-e29b-41d4-a716-446655440001";
const list = "550e8400-e29b-41d4-a716-446655440002";
const owned = "550e8400-e29b-41d4-a716-446655440003";
const unowned = "550e8400-e29b-41d4-a716-446655440004";

function fixture(mode: "success" | "completed" | "foreign" | "guest" | "missing" | "items-error" | "conflict" | "update-error" = "success") {
  const requests: Array<{ url: URL; method: string; body: unknown }> = [];
  const sdk = createClient("http://shopping-reorder-contract.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? "GET";
      requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      const table = url.pathname.split("/").at(-1);
      let data: unknown;
      let status = 200;
      if (table === "users" && method === "GET") data = [{ id: owner, nickname: "fixture", email: null,
        profile_image_url: null, settings_json: { user_bootstrap_version: USER_BOOTSTRAP_VERSION } }];
      else if (table === "shopping_lists" && method === "GET") data = mode === "missing" ? null
        : { id: list, user_id: mode === "foreign" ? "other-owner" : owner, is_completed: mode === "completed" };
      else if (table === "shopping_list_items" && method === "GET") {
        data = mode === "items-error" ? { code: "42501", message: "fixture denied" } : [{ id: owned }];
        if (mode === "items-error") status = 403;
      } else if (table === "shopping_list_items" && method === "PATCH") {
        if (mode === "conflict" || mode === "update-error") {
          status = mode === "conflict" ? 409 : 500;
          data = { code: mode === "conflict" ? "409" : "XX000", message: "fixture update rejected" };
        } else return new Response(null, { status: 204 });
      } else throw new Error(`unexpected fixture operation: ${method} ${table}`);
      return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    } },
  });
  const client: ShoppingReorderDbClient = sdk;
  mocks.route.mockResolvedValue({ from: sdk.from.bind(sdk), auth: { getUser: async () => ({
    data: { user: mode === "guest" ? null : { id: owner, app_metadata: {}, user_metadata: {} } }, error: null,
  }) } });
  return { client, requests };
}

describe("shopping reorder native query contract", () => {
  beforeEach(() => vi.resetAllMocks());
  it("infers exact selected rows and a no-return update phase", () => {
    const { client } = fixture();
    const lists = client.from("shopping_lists").select("id, user_id, is_completed").maybeSingle();
    const items = client.from("shopping_list_items").select("id");
    const update = client.from("shopping_list_items").update({ sort_order: 7 }).eq("id", owned);
    expectTypeOf<Awaited<typeof lists>["data"]>().toEqualTypeOf<{ id: string; user_id: string; is_completed: boolean } | null>();
    expectTypeOf<Awaited<typeof items>["data"]>().toEqualTypeOf<Array<{ id: string }> | null>();
    expectTypeOf<Awaited<typeof update>["data"]>().toEqualTypeOf<null>();
    for (const query of [lists, items, update]) expect(query.then).toBeTypeOf("function");
  });

  it.each(["success", "completed", "foreign", "guest", "missing", "items-error", "conflict", "update-error"] as const)("preserves %s boundaries and only updates owned items", async mode => {
    const { requests } = fixture(mode);
    const response = await PATCH(new Request("http://localhost/reorder", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ orders: [{ item_id: owned, sort_order: 7 }, { item_id: unowned, sort_order: 8 }] }),
    }), { params: Promise.resolve({ list_id: list }) });
    expect(response.status).toBe(mode === "success" ? 200 : mode === "completed" || mode === "conflict" ? 409
      : mode === "foreign" ? 403 : mode === "guest" ? 401 : mode === "missing" ? 404 : 500);
    if (mode === "success") expect(await response.json()).toEqual({ success: true, data: { updated: 1 }, error: null });
    else expect(await response.json()).toMatchObject({ success: false, data: null, error: { fields: [] } });
    const writes = requests.filter(request => request.method !== "GET");
    if (mode === "success" || mode === "conflict" || mode === "update-error") {
      expect(writes).toHaveLength(1);
      expect(writes[0].body).toEqual({ sort_order: 7 });
      expect(Object.fromEntries(writes[0].url.searchParams)).toEqual({ id: `eq.${owned}`, shopping_list_id: `eq.${list}` });
      const itemsRead = requests.find(request => request.method === "GET" && request.url.pathname.endsWith("/shopping_list_items"));
      expect(Object.fromEntries(itemsRead?.url.searchParams ?? [])).toEqual({
        select: "id", shopping_list_id: `eq.${list}`, id: `in.(${owned},${unowned})`,
      });
    } else expect(writes).toHaveLength(0);
    if (mode === "guest") expect(requests).toHaveLength(0);
    else {
      expect(requests.slice(0, 3).map(request => request.url.pathname.split("/").at(-1))).toEqual(["users", "users", "shopping_lists"]);
      expect(Object.fromEntries(requests[2].url.searchParams)).toEqual({ select: "id,user_id,is_completed", id: `eq.${list}` });
      if (mode === "completed" || mode === "foreign" || mode === "missing") expect(requests).toHaveLength(3);
    }
  });
});
