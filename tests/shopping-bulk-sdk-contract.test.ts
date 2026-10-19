import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { PATCH, type ShoppingBulkItemUpdateDbClient } from "@/app/api/v1/shopping/lists/[list_id]/items/bulk/route";
import { USER_BOOTSTRAP_VERSION } from "@/lib/server/user-bootstrap";

const mocks = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route }));
const owner = "550e8400-e29b-41d4-a716-446655440001";
const list = "550e8400-e29b-41d4-a716-446655440002";
const first = "550e8400-e29b-41d4-a716-446655440003";
const second = "550e8400-e29b-41d4-a716-446655440004";
const columns = "id,shopping_list_id,ingredient_id,display_text,amounts_json,is_checked,is_pantry_excluded,added_to_pantry,sort_order";

function fixture(mode: "check" | "uncheck" | "empty" | "foreign" | "completed" | "missing" | "guest" | "error" = "check") {
  const requests: Array<{ url: URL; method: string; body: unknown; prefer: string | null }> = [];
  const sdk = createClient("http://shopping-bulk-contract.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? "GET";
      requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null, prefer: new Headers(init?.headers).get("Prefer") });
      const table = url.pathname.split("/").at(-1);
      let data: unknown;
      if (table === "users" && method === "GET") data = [{ id: owner, nickname: "fixture", email: null,
        profile_image_url: null, settings_json: { user_bootstrap_version: USER_BOOTSTRAP_VERSION } }];
      else if (table === "shopping_lists" && method === "GET") data = mode === "missing" ? null
        : { id: list, user_id: mode === "foreign" ? "other-owner" : owner, is_completed: mode === "completed" };
      else if (table === "shopping_list_items" && method === "PATCH") data = mode === "error" ? { code: "42501", message: "fixture denied" }
        : mode === "empty" ? [] : [second, first].map(id => ({ id, shopping_list_id: list, ingredient_id: "ingredient-1",
          display_text: "양파", amounts_json: id === first ? [{ amount: 2, unit: "개" }, { amount: "bad", unit: "개" }] : null,
          is_checked: mode !== "uncheck", is_pantry_excluded: false, added_to_pantry: false, sort_order: 1 }));
      else throw new Error(`unexpected fixture operation: ${method} ${table}`);
      return new Response(JSON.stringify(data), { status: table === "shopping_list_items" && mode === "error" ? 403 : 200,
        headers: { "content-type": "application/json" } });
    } },
  });
  const client: ShoppingBulkItemUpdateDbClient = sdk;
  mocks.route.mockResolvedValue({ from: sdk.from.bind(sdk), auth: { getUser: async () => ({
    data: { user: mode === "guest" ? null : { id: owner, app_metadata: {}, user_metadata: {} } }, error: null,
  }) } });
  return { client, requests };
}

describe("shopping bulk native update/select contract", () => {
  beforeEach(() => vi.resetAllMocks());
  it("infers actual update/select rows and untrusted amounts JSON", () => {
    const { client } = fixture();
    const update = client.from("shopping_list_items").update({ is_checked: true })
      .eq("shopping_list_id", list).select("id, amounts_json, is_checked");
    expectTypeOf<Awaited<typeof update>["data"]>().toEqualTypeOf<Array<{ id: string; amounts_json: unknown; is_checked: boolean }> | null>();
    expect(update.then).toBeTypeOf("function");
  });
  it.each(["check", "uncheck", "empty", "foreign", "completed", "missing", "guest", "error"] as const)("preserves %s boundaries, one scoped update and normalized sorted response", async mode => {
    const { requests } = fixture(mode);
    const response = await PATCH(new Request("http://localhost/bulk", { method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ item_ids: [first, second], is_checked: mode !== "uncheck" }) }), { params: Promise.resolve({ list_id: list }) });
    const allowed = mode === "check" || mode === "uncheck" || mode === "empty";
    expect(response.status).toBe(allowed ? 200 : mode === "foreign" ? 403 : mode === "completed" ? 409 : mode === "missing" ? 404 : mode === "guest" ? 401 : 500);
    const result = await response.json();
    if (allowed) {
      expect(result).toMatchObject({ success: true, error: null });
      expect(result.data.items.map((item: { id: string }) => item.id)).toEqual(mode === "empty" ? [] : [first, second]);
      if (mode !== "empty") {
        expect(result.data.items[0]).toMatchObject({ is_checked: mode !== "uncheck", amounts_json: [{ amount: 2, unit: "개" }] });
        expect(result.data.items[1].amounts_json).toEqual([]);
      }
    } else expect(result).toMatchObject({ success: false, data: null, error: { fields: [] } });
    const writes = requests.filter(request => request.method === "PATCH");
    if (allowed || mode === "error") {
      expect(writes).toHaveLength(1);
      expect(writes[0].body).toEqual({ is_checked: mode !== "uncheck" });
      expect(writes[0].prefer).toContain("return=representation");
      expect(Object.fromEntries(writes[0].url.searchParams)).toEqual({ shopping_list_id: `eq.${list}`,
        is_pantry_excluded: "eq.false", id: `in.(${first},${second})`, select: columns });
    } else expect(writes).toHaveLength(0);
    if (mode === "guest") expect(requests).toHaveLength(0);
    else {
      expect(requests.slice(0, 3).map(request => request.url.pathname.split("/").at(-1))).toEqual(["users", "users", "shopping_lists"]);
      expect(Object.fromEntries(requests[2].url.searchParams)).toEqual({ select: "id,user_id,is_completed", id: `eq.${list}` });
    }
  });
});
