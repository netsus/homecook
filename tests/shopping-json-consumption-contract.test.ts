import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import { POST, type ShoppingCreateDbClient } from "@/app/api/v1/shopping/lists/route";

const mocks = vi.hoisted(() => ({ route: vi.fn(), internal: vi.fn(), user: vi.fn(), bootstrap: vi.fn(), growth: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route, createShoppingCreateInternalClient: mocks.internal }));
vi.mock("@/lib/server/user-bootstrap", () => ({ ensurePublicUserRow: mocks.user, ensureUserBootstrapState: mocks.bootstrap,
  formatBootstrapErrorMessage: (_error: unknown, message: string) => message }));
vi.mock("@/lib/server/user-growth-activity", async (original) => ({
  ...await original<typeof import("@/lib/server/user-growth-activity")>(), recordUserGrowthActivityEvent: mocks.growth,
}));
vi.mock("@/lib/server/account-generation/session-authority", () => ({ readVerifiedAccountGenerationSession: async () => ({
  ok: true, sessionAuthority: { ownerUuid: "user-1", authIdentityCreatedAt: "2026-08-01T00:00:00Z",
    sessionIssuedAt: "2026-08-02T00:00:00Z", sessionKeyHash: "a".repeat(64), hmacKeyVersion: 1 },
}) }));

const MEAL = "550e8400-e29b-41d4-a716-446655440001";
const RECIPE = "550e8400-e29b-41d4-a716-446655440002";
const INGREDIENT = "550e8400-e29b-41d4-a716-446655440003";

function fixture(value: unknown, base: number | null = 2, catalogPresent = true) {
  const requests: Array<{ url: URL; method: string; body: unknown }> = [];
  const sdk = createClient("http://shopping-create-contract.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      const method = init?.method ?? "GET";
      requests.push({ url, method, body });
      const table = url.pathname.split("/").at(-1);
      if (table === "ingredients" && url.searchParams.get("id") !== `in.(${INGREDIENT})`) {
        return new Response(JSON.stringify({ code: "22P02", message: "fixture invalid input syntax for uuid" }), { status: 400 });
      }
      const rows = table === "meals" ? [{ id: MEAL, user_id: "user-1", recipe_id: RECIPE,
        recipe_content_snapshot_id: "snapshot-1",
        recipe_content_snapshots: { base_servings: base, ingredients_json: value },
        plan_date: "2026-10-20", column_id: "column-1", planned_servings: 2, status: "registered",
        is_leftover: false, leftover_dish_id: null, shopping_list_id: null }]
        : table === "ingredients" && catalogPresent ? [{ id: INGREDIENT, standard_name: "양파" }] : [];
      const sentItems = body && typeof body === "object" && "p_item_rows" in body && Array.isArray(body.p_item_rows) ? body.p_item_rows : [];
      if (table === "create_shopping_list_with_snapshot_authority" && sentItems.some((item: unknown) => item && typeof item === "object"
        && "food_product_id" in item && item.food_product_id && typeof item.food_product_id !== "string")) {
        return new Response(JSON.stringify({ code: "22P02", message: "fixture invalid product uuid" }), { status: 400 });
      }
      const data = table === "create_shopping_list_with_snapshot_authority"
        ? { id: "list-1", created_at: "2026-10-20T03:00:00Z", items: sentItems.map((item: unknown) => (
          item && typeof item === "object" ? { ...item, id: "item-1", is_checked: false, added_to_pantry: false } : item)) }
        : table === "read_recipe_product_nutrition_predecessors" ? [{
          id: `${INGREDIENT}:${RECIPE}`, unit_context: { basis: { amount: 100, unit: "g" },
            basis_relations: [{ from: { amount: 100, unit: "g" }, to: { amount: 1, unit: "package" } }] },
        }] : rows;
      return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
    } },
  });
  const client = { from: sdk.from.bind(sdk), rpc: sdk.rpc.bind(sdk),
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) } };
  mocks.route.mockResolvedValue(client);
  mocks.internal.mockReturnValue(sdk);
  return { sdk, client, requests };
}

describe("shopping creation consumed SDK protocol", () => {
  beforeEach(() => vi.resetAllMocks());

  it("uses the real default SDK builder rather than a hand-written query fixture", () => {
    const { sdk } = fixture([]);
    const client: ShoppingCreateDbClient = sdk;
    const query = client.from("recipes").select("id, base_servings").in("id", [RECIPE]);
    const meal = client.from("meals").select("id, recipe_content_snapshots(base_servings, ingredients_json)");
    const sources = client.from("recipe_ingredients").select("ingredient_id, food_product_id, amount");
    expectTypeOf<Awaited<typeof query>["data"]>().toEqualTypeOf<Array<{ id: string; base_servings: number }> | null>();
    expectTypeOf<Awaited<typeof meal>["data"]>().toEqualTypeOf<Array<{ id: string;
      recipe_content_snapshots: { base_servings: number; ingredients_json: unknown } | null }> | null>();
    expectTypeOf<Awaited<typeof sources>["data"]>().toEqualTypeOf<Array<{
      ingredient_id: string | null; food_product_id: string | null; amount: number | null }> | null>();
    expect(query.then).toBeTypeOf("function");
    expect(meal.then).toBeTypeOf("function");
    expect(sources.then).toBeTypeOf("function");
  });

  const generic = { ingredient_id: INGREDIENT, amount: 100, unit: "g", ingredient_type: "QUANT", display_text: "양파 100g" };
  const product = { ...generic, ingredient_id: null, food_product_id: INGREDIENT, food_product_nutrition_version_id: RECIPE };
  const observations: Array<{ name: string; value: unknown; status?: number; throws?: boolean; amounts?: unknown; suggestion?: unknown; base?: number | null; catalogPresent?: boolean }> = [
    { name: "generic string amount stays text", value: [{ ...generic, amount: "100" }], amounts: [{ amount: 1, unit: "100g" }] },
    { name: "generic missing amount stays text", value: [{ ...generic, amount: undefined }], amounts: [{ amount: 1, unit: "100g" }] },
    { name: "generic missing kind stays text", value: [{ ...generic, ingredient_type: undefined }], amounts: [{ amount: 1, unit: "100g" }] },
    { name: "generic missing fallback label stays default", value: [{ ...generic, amount: "100", display_text: undefined }], amounts: [{ amount: 1, unit: "적당량" }] },
    { name: "generic null unit stays text", value: [{ ...generic, unit: null }], amounts: [{ amount: 1, unit: "100g" }] },
    { name: "generic unused numeric label stays numeric amount", value: [{ ...generic, display_text: 42 }], amounts: [{ amount: 100, unit: "g" }] },
    { name: "prior unavailable display name short-circuits later numeric label", value: [generic, { ...generic, display_text: 42 }],
      catalogPresent: false, amounts: [{ amount: 200, unit: "g" }] },
    { name: "generic consumed numeric label throws", value: [{ ...generic, amount: "100", display_text: 42 }], throws: true },
    { name: "generic consumed numeric unit throws", value: [{ ...generic, unit: 42 }], throws: true },
    { name: "generic consumed missing unit throws", value: [{ ...generic, unit: undefined }], throws: true },
    { name: "primitive and empty array elements stay skipped", value: [1, false, "x", []], amounts: [] },
    { name: "empty object elements stay skipped", value: [{}], amounts: [] },
    { name: "string json iterates empty identities", value: "abc", amounts: [] },
    { name: "null element throws", value: [null], throws: true },
    { name: "object json throws", value: {}, throws: true },
    { name: "null base skips snapshot content", value: [generic], base: null, amounts: [] },
    { name: "null json stays empty", value: null, amounts: [] },
    { name: "undefined json stays empty", value: undefined, amounts: [] },
    { name: "generic truthy nonstring identity keeps baseline HTTP 500", value: [{ ...generic, ingredient_id: 42 }], status: 500 },
    { name: "generic object identity keeps baseline HTTP 500", value: [{ ...generic, ingredient_id: {} }], status: 500 },
    { name: "product string amount stays empty without coercion", value: [{ ...product, amount: "100" }], amounts: [], suggestion: null },
    { name: "product missing amount stays empty", value: [{ ...product, amount: undefined }], amounts: [], suggestion: null },
    { name: "product null unit stays empty", value: [{ ...product, unit: null }], amounts: [], suggestion: null },
    { name: "product truthy numeric unit reaches unchanged payload", value: [{ ...product, unit: 42 }], amounts: [{ amount: 100, unit: 42 }], suggestion: null },
    { name: "product null label uses existing product fallback", value: [{ ...product, display_text: null }], amounts: [{ amount: 100, unit: "g" }], suggestion: { amount: 1, unit: "package" } },
    { name: "product consumed numeric label throws", value: [{ ...product, display_text: 42 }], throws: true },
    { name: "product truthy nonstring identity keeps baseline HTTP 500", value: [{ ...product, food_product_id: 42 }], status: 500 },
    { name: "product scalable string false keeps scaling enabled", value: [{ ...product, scalable: "false" }], base: 1, amounts: [{ amount: 200, unit: "g" }], suggestion: { amount: 2, unit: "package" } },
    { name: "product scalable boolean false keeps fixed amount", value: [{ ...product, scalable: false }], base: 1, amounts: [{ amount: 100, unit: "g" }], suggestion: { amount: 1, unit: "package" } },
  ];
  it.each(observations)("observes legacy JSON behavior: $name", async ({ value, status, throws, amounts, suggestion, base, catalogPresent }) => {
    const { requests } = fixture(value, base, catalogPresent);
    const responsePromise = POST(new Request("http://localhost/api/v1/shopping/lists", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ meal_configs: [{ meal_id: MEAL, shopping_servings: 2 }] }),
    }));
    if (throws) {
      await expect(responsePromise).rejects.toBeInstanceOf(TypeError);
      expect(requests.every((request) => request.method === "GET")).toBe(true);
      return;
    }
    const response = await responsePromise;
    expect(response.status).toBe(status ?? 201);
    if (amounts !== undefined) {
      const mutation = requests.find((request) => request.url.pathname.endsWith("/create_shopping_list_with_snapshot_authority"));
      expect(mutation?.body).toMatchObject({ p_item_rows: Array.isArray(amounts) && amounts.length === 0 && suggestion === undefined
        ? [] : [expect.objectContaining({ amounts_json: amounts })] });
    }
    if (suggestion !== undefined) {
      const json = await response.json();
      expect(json.data.items[0].purchase_suggestion).toEqual(suggestion);
      expect(json.data.items[0].amounts_json).toEqual(amounts);
    }
  });

  it.each([
    { ...generic, ingredient_id: 42 },
    { ...generic, ingredient_id: {} },
    { ...product, food_product_id: 42 },
  ])("closes malformed identity locally before reads or mutation: %j", async (ingredient) => {
    const { requests } = fixture([ingredient]);
    const response = await POST(new Request("http://localhost/api/v1/shopping/lists", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ meal_configs: [{ meal_id: MEAL, shopping_servings: 2 }] }),
    }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, data: null,
      error: { code: "INTERNAL_ERROR", message: "장보기 재료를 확인하지 못했어요.", fields: [] } });
    expect(requests.map((request) => request.url.pathname)).toEqual(["/rest/v1/meals"]);
    expect(requests.every((request) => request.method === "GET")).toBe(true);
    expect(mocks.growth).not.toHaveBeenCalled();
  });
});
