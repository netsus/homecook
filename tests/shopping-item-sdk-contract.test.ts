import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { PATCH, type ShoppingItemUpdateDbClient } from "@/app/api/v1/shopping/lists/[list_id]/items/[item_id]/route";
import { USER_BOOTSTRAP_VERSION } from "@/lib/server/user-bootstrap";

const mocks = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route }));
const owner = "550e8400-e29b-41d4-a716-446655440001";
const list = "550e8400-e29b-41d4-a716-446655440002";
const item = "550e8400-e29b-41d4-a716-446655440003";
const columns = "id,shopping_list_id,ingredient_id,display_text,amounts_json,is_checked,is_pantry_excluded,added_to_pantry,sort_order";
type Mode = "check" | "exclude" | "noop" | "foreign" | "completed" | "item-missing" | "list-missing" | "guest" | "conflict" | "update-error";

function fixture(mode: Mode = "check") {
  const requests: Array<{ url: URL; method: string; body: unknown }> = [];
  const row = { id: item, shopping_list_id: list, ingredient_id: "ingredient-1", display_text: "양파",
    amounts_json: [{ amount: 2, unit: "개" }], is_checked: false, is_pantry_excluded: false, added_to_pantry: false, sort_order: 0 };
  const sdk = createClient("http://shopping-item-contract.invalid", "public-test-key", {
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
      else if (table === "shopping_lists" && method === "GET") data = mode === "list-missing" ? null
        : { id: list, user_id: mode === "foreign" ? "other-owner" : owner, is_completed: mode === "completed" };
      else if (table === "shopping_list_items" && method === "GET") data = mode === "item-missing" ? null : row;
      else if (table === "shopping_list_items" && method === "PATCH") {
        if (mode === "conflict" || mode === "update-error") {
          status = mode === "conflict" ? 409 : 500;
          data = { code: mode === "conflict" ? "409" : "XX000", message: "fixture update rejected" };
        } else data = { ...row, is_checked: mode !== "exclude", is_pantry_excluded: mode === "exclude" };
      } else throw new Error(`unexpected fixture operation: ${method} ${table}`);
      return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    } },
  });
  const client: ShoppingItemUpdateDbClient = sdk;
  mocks.route.mockResolvedValue({ from: sdk.from.bind(sdk), auth: { getUser: async () => ({
    data: { user: mode === "guest" ? null : { id: owner, app_metadata: {}, user_metadata: {} } }, error: null,
  }) } });
  return { client, requests };
}

describe("shopping single item native selected-single contract", () => {
  beforeEach(() => vi.resetAllMocks());
  it("infers exact selected-single rows before and after update", () => {
    const { client } = fixture();
    const read = client.from("shopping_list_items").select("id, amounts_json, is_checked").maybeSingle();
    const update = client.from("shopping_list_items").update({ is_checked: false, is_pantry_excluded: true })
      .select("id, amounts_json, is_checked").maybeSingle();
    expectTypeOf<Awaited<typeof read>["data"]>().toEqualTypeOf<{ id: string; amounts_json: unknown; is_checked: boolean } | null>();
    expectTypeOf<Awaited<typeof update>["data"]>().toEqualTypeOf<Awaited<typeof read>["data"]>();
    expect(read.then).toBeTypeOf("function");
    expect(update.then).toBeTypeOf("function");
  });
  it.each<Mode>(["check", "exclude", "noop", "foreign", "completed", "item-missing", "list-missing", "guest", "conflict", "update-error"])("preserves %s guards, normalization and no-op/write boundary", async mode => {
    const { requests } = fixture(mode);
    const response = await PATCH(new Request("http://localhost/item", { method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify(mode === "exclude" ? { is_checked: true, is_pantry_excluded: true } : { is_checked: mode !== "noop" }) }),
    { params: Promise.resolve({ list_id: list, item_id: item }) });
    const success = mode === "check" || mode === "exclude" || mode === "noop";
    expect(response.status).toBe(success ? 200 : mode === "foreign" ? 403 : mode === "completed" || mode === "conflict" ? 409
      : mode === "guest" ? 401 : mode === "item-missing" || mode === "list-missing" ? 404 : 500);
    const result = await response.json();
    if (success) expect(result).toMatchObject({ success: true, error: null, data: {
      id: item, is_checked: mode === "check", is_pantry_excluded: mode === "exclude", amounts_json: [{ amount: 2, unit: "개" }],
    } });
    else expect(result).toMatchObject({ success: false, data: null, error: { fields: [] } });
    const writes = requests.filter(request => request.method === "PATCH");
    const shouldWrite = mode === "check" || mode === "exclude" || mode === "conflict" || mode === "update-error";
    expect(writes).toHaveLength(shouldWrite ? 1 : 0);
    if (shouldWrite) expect(writes[0].body).toEqual({ is_checked: mode !== "exclude", is_pantry_excluded: mode === "exclude" });
    for (const request of requests.filter(request => request.url.pathname.endsWith("/shopping_list_items"))) {
      expect(Object.fromEntries(request.url.searchParams)).toEqual({ select: columns, id: `eq.${item}`, shopping_list_id: `eq.${list}` });
    }
    if (mode === "guest") expect(requests).toHaveLength(0);
    else {
      expect(requests.slice(0, 3).map(request => request.url.pathname.split("/").at(-1))).toEqual(["users", "users", "shopping_lists"]);
      expect(Object.fromEntries(requests[2].url.searchParams)).toEqual({ select: "id,user_id,is_completed", id: `eq.${list}` });
      if (mode === "foreign" || mode === "completed" || mode === "list-missing") expect(requests).toHaveLength(3);
    }
  });
});
