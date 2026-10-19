import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { GET, type ShoppingListDetailDbClient } from "@/app/api/v1/shopping/lists/[list_id]/route";
import { USER_BOOTSTRAP_VERSION } from "@/lib/server/user-bootstrap";

const mocks = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route }));
const owner = "550e8400-e29b-41d4-a716-446655440001";
const list = "550e8400-e29b-41d4-a716-446655440002";
const recipe = "550e8400-e29b-41d4-a716-446655440003";
const snapshot = "550e8400-e29b-41d4-a716-446655440004";
const ingredient = "550e8400-e29b-41d4-a716-446655440005";
const product = "550e8400-e29b-41d4-a716-446655440006";
const version = "550e8400-e29b-41d4-a716-446655440007";
const created = "2026-10-19T12:00:00Z";
type Mode = "standard" | "product" | "quantity-error" | "empty" | "broken" | "foreign" | "guest" | "missing" | "items-error";
function fixture(mode: Mode = "standard") {
  const requests: Array<{ url: URL; method: string; body: unknown }> = [];
  const isProduct = mode === "product" || mode === "quantity-error";
  const sdk = createClient("http://shopping-detail-contract.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? "GET";
      requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      const table = url.pathname.split("/").at(-1);
      let data: unknown;
      if (table === "users") data = [{ id: owner, nickname: "fixture", email: null, profile_image_url: null,
        settings_json: { user_bootstrap_version: USER_BOOTSTRAP_VERSION } }];
      else if (table === "shopping_lists") data = mode === "missing" ? null : { id: list, user_id: mode === "foreign" ? "other-owner" : owner,
        title: "목록", date_range_start: "2026-10-19", date_range_end: "2026-10-20", is_completed: true, completed_at: created, created_at: created };
      else if (table === "shopping_list_recipes") data = mode === "empty" ? [] : [{ recipe_id: recipe, recipe_content_snapshot_id: snapshot,
        shopping_servings: 2, planned_servings_total: 2, recipe_content_snapshots: { base_servings: 1, ingredients_json: [] } }];
      else if (table === "meals") data = mode === "empty" ? [] : [{ recipe_id: recipe, recipe_content_snapshot_id: snapshot,
        recipe_content_snapshots: mode === "broken" ? null : { title: "고정 제목" } }];
      else if (table === "recipes") data = [{ id: recipe, title: "현재 제목", thumbnail_url: null }];
      else if (table === "shopping_list_items") data = mode === "empty" ? [] : [{ id: "item-1", ingredient_id: isProduct ? null : ingredient,
        food_product_id: isProduct ? product : null, food_product_nutrition_version_id: isProduct ? version : null,
        display_text: "양파", amounts_json: [{ amount: 2, unit: "개" }], is_checked: true, is_pantry_excluded: false, added_to_pantry: false, sort_order: 0 }];
      else if (table === "ingredients") data = [{ id: ingredient, category: "채소" }];
      else if (table === "read_recipe_product_nutrition_predecessors") data = [{ id: `${product}:${version}`, unit_context: null }];
      else throw new Error(`unexpected fixture table: ${table}`);
      const failed = table === "shopping_list_items" && mode === "items-error"
        || table === "read_recipe_product_nutrition_predecessors" && mode === "quantity-error";
      return new Response(JSON.stringify(failed ? { code: "42501", message: "fixture denied" } : data), {
        status: failed ? 403 : 200, headers: { "content-type": "application/json" },
      });
    } },
  });
  const client: ShoppingListDetailDbClient = sdk;
  mocks.route.mockResolvedValue({ from: sdk.from.bind(sdk), rpc: sdk.rpc.bind(sdk), auth: { getUser: async () => ({
    data: { user: mode === "guest" ? null : { id: owner, app_metadata: {}, user_metadata: {} } }, error: null,
  }) } });
  return { client, requests };
}

describe("shopping detail native projection contract", () => {
  beforeEach(() => vi.resetAllMocks());
  it("infers actual nullable pins/JSON/FKs and no fictional list updated_at", () => {
    const { client } = fixture();
    const pins = client.from("shopping_list_recipes").select("recipe_content_snapshot_id, recipe_content_snapshots(base_servings, ingredients_json)");
    const meals = client.from("meals").select("recipe_content_snapshots(title)");
    const items = client.from("shopping_list_items").select("ingredient_id, food_product_id, food_product_nutrition_version_id");
    const lists = client.from("shopping_lists").select("id, created_at").maybeSingle();
    expectTypeOf<Awaited<typeof pins>["data"]>().toEqualTypeOf<Array<{ recipe_content_snapshot_id: string | null;
      recipe_content_snapshots: { base_servings: number; ingredients_json: unknown } | null }> | null>();
    expectTypeOf<Awaited<typeof meals>["data"]>().toEqualTypeOf<Array<{ recipe_content_snapshots: { title: string } | null }> | null>();
    expectTypeOf<Awaited<typeof items>["data"]>().toEqualTypeOf<Array<{ ingredient_id: string | null; food_product_id: string | null; food_product_nutrition_version_id: string | null }> | null>();
    expectTypeOf<Awaited<typeof lists>["data"]>().toEqualTypeOf<{ id: string; created_at: string } | null>();
    for (const query of [pins, meals, items, lists]) expect(query.then).toBeTypeOf("function");
  });
  it.each<Mode>(["standard", "product", "quantity-error", "empty", "broken", "foreign", "guest", "missing", "items-error"])("preserves %s read boundaries and exact quantity RPC client", async mode => {
    const { requests } = fixture(mode);
    const response = await GET(new Request("http://localhost/detail"), { params: Promise.resolve({ list_id: list }) });
    const success = ["standard", "product", "quantity-error", "empty"].includes(mode);
    expect(response.status).toBe(success ? 200 : mode === "foreign" ? 403 : mode === "guest" ? 401 : mode === "missing" ? 404 : 500);
    const result = await response.json();
    if (success) {
      expect(result.data.updated_at).toBe(created);
      expect(result.data.is_completed).toBe(true);
      if (mode === "empty") { expect(result.data.items).toEqual([]); expect(result.data.recipes).toEqual([]); }
      else {
        expect(result.data.recipes[0].recipe_name).toBe("고정 제목");
        expect(result.data.items[0].ingredient_id).toBe(mode === "standard" ? ingredient : null);
        expect(result.data.items[0].amounts_json).toEqual([{ amount: 2, unit: "개" }]);
      }
    } else expect(result).toMatchObject({ success: false, data: null, error: { fields: [] } });
    if (mode === "guest") { expect(requests).toHaveLength(0); return; }
    expect(Object.fromEntries(requests[2].url.searchParams)).toEqual({
      select: "id,user_id,title,date_range_start,date_range_end,is_completed,completed_at,created_at", id: `eq.${list}`,
    });
    if (mode === "foreign" || mode === "missing") { expect(requests).toHaveLength(3); return; }
    expect(Object.fromEntries(requests[3].url.searchParams)).toEqual({
      select: "recipe_id,recipe_content_snapshot_id,shopping_servings,planned_servings_total,recipe_content_snapshots(base_servings,ingredients_json)", shopping_list_id: `eq.${list}`,
    });
    expect(Object.fromEntries(requests[4].url.searchParams)).toEqual({ select: "recipe_id,recipe_content_snapshot_id,recipe_content_snapshots(title)", shopping_list_id: `eq.${list}` });
    if (mode === "broken") { expect(requests).toHaveLength(5); return; }
    const itemsRead = requests.find(request => request.url.pathname.endsWith("/shopping_list_items"));
    const recipesRead = requests.find(request => request.url.pathname.endsWith("/recipes"));
    if (mode !== "empty") expect(Object.fromEntries(recipesRead?.url.searchParams ?? [])).toEqual({ select: "id,title,thumbnail_url", id: `in.(${recipe})` });
    const ingredientsRead = requests.find(request => request.url.pathname.endsWith("/ingredients"));
    if (mode === "standard") expect(Object.fromEntries(ingredientsRead?.url.searchParams ?? [])).toEqual({ select: "id,category", id: `in.(${ingredient})` });
    else expect(ingredientsRead).toBeUndefined();
    expect(Object.fromEntries(itemsRead?.url.searchParams ?? [])).toEqual({
      select: "id,ingredient_id,food_product_id,food_product_nutrition_version_id,display_text,amounts_json,is_checked,is_pantry_excluded,added_to_pantry,sort_order",
      shopping_list_id: `eq.${list}`, order: "sort_order.asc,id.asc",
    });
    const rpc = requests.filter(request => request.method === "POST");
    if (mode === "product" || mode === "quantity-error") {
      expect(rpc).toHaveLength(1);
      expect(rpc[0].url.pathname).toBe("/rest/v1/rpc/read_recipe_product_nutrition_predecessors");
      expect(rpc[0].body).toEqual({ p_owner_uuid: owner, p_ingredients: [{ id: `${product}:${version}`, ingredient_id: null,
        food_product_id: product, food_product_nutrition_version_id: version }] });
      expect(result.data.items[0].purchase_suggestion).toBeNull();
    } else expect(rpc).toHaveLength(0);
    expect(requests.every(request => request.method === "GET" || request.url.pathname.includes("/rpc/read_recipe_product_nutrition_predecessors"))).toBe(true);
  });
});
