import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { POST, type CookingSessionDbClient } from "@/app/api/v1/cooking/sessions/route";
import { USER_BOOTSTRAP_VERSION } from "@/lib/server/user-bootstrap";

const mocks = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route }));
const owner = "550e8400-e29b-41d4-a716-446655440001";
const meal = "550e8400-e29b-41d4-a716-446655440002";
const recipe = "550e8400-e29b-41d4-a716-446655440003";
const session = "550e8400-e29b-41d4-a716-446655440004";
type Mode = "standard" | "legacy" | "non-product-json" | "product-snapshot" | "product-live" | "guest" | "foreign" | "registered" | "cook_done" | "mismatch" | "missing" | "read-error" | "insert-error" | "link-error";
function fixture(mode: Mode = "standard") {
  const requests: Array<{ url: URL; method: string; body: unknown }> = [];
  const sdk = createClient("http://cooking-create-contract.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? "GET";
      requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      const table = url.pathname.split("/").at(-1);
      let data: unknown;
      if (table === "users" && method === "GET") data = [{ id: owner, nickname: "fixture", email: null, profile_image_url: null,
        settings_json: { user_bootstrap_version: USER_BOOTSTRAP_VERSION } }];
      else if (table === "recipes" && method === "GET") data = { id: recipe };
      else if (table === "meals" && method === "GET") data = mode === "missing" ? [] : [{ id: meal, user_id: mode === "foreign" ? "other-owner" : owner,
        recipe_id: mode === "mismatch" ? "other-recipe" : recipe, status: mode === "registered" || mode === "cook_done" ? mode : "shopping_done",
        recipe_content_snapshots: mode === "legacy" || mode === "product-live" ? null : { ingredients_json: mode === "product-snapshot"
          ? [{ ingredient_id: null, food_product_id: "product-1", food_product_nutrition_version_id: "version-1" }]
          : mode === "non-product-json" ? [null, 42, [], {}] : [] },
      }];
      else if (table === "recipe_ingredients" && method === "GET") data = [{ ingredient_id: mode === "product-live" ? null : "ingredient-1",
        food_product_id: mode === "product-live" ? "product-1" : null, food_product_nutrition_version_id: mode === "product-live" ? "version-1" : null }];
      else if (table === "cooking_sessions" && method === "POST") data = { id: session, status: "in_progress" };
      else if (table === "cooking_session_meals" && method === "POST") data = [{ meal_id: meal, is_cooked: false }];
      else throw new Error(`unexpected fixture operation: ${method} ${table}`);
      const failed = table === "meals" && mode === "read-error" || table === "cooking_sessions" && mode === "insert-error"
        || table === "cooking_session_meals" && mode === "link-error";
      return new Response(JSON.stringify(failed ? { code: "42501", message: "fixture denied" } : data), {
        status: failed ? 403 : 200, headers: { "content-type": "application/json" },
      });
    } },
  });
  const client: CookingSessionDbClient = sdk;
  mocks.route.mockResolvedValue({ from: sdk.from.bind(sdk), auth: { getUser: async () => ({
    data: { user: mode === "guest" ? null : { id: owner, app_metadata: {}, user_metadata: {} } }, error: null,
  }) } });
  return { client, requests };
}

describe("legacy cooking create native contract", () => {
  beforeEach(() => vi.resetAllMocks());
  it("infers unknown snapshot JSON, actual insert/select phases and session enum", () => {
    const { client } = fixture();
    const meals = client.from("meals").select("status, recipe_content_snapshots(ingredients_json)");
    const created = client.from("cooking_sessions").insert({ user_id: owner, status: "in_progress" }).select("id, status").maybeSingle();
    const links = client.from("cooking_session_meals").insert([{ session_id: session, meal_id: meal, recipe_id: recipe, cooking_servings: 2, is_cooked: false }]).select("meal_id, is_cooked");
    expectTypeOf<Awaited<typeof meals>["data"]>().toEqualTypeOf<Array<{ status: "registered" | "shopping_done" | "cook_done";
      recipe_content_snapshots: { ingredients_json: unknown } | null }> | null>();
    expectTypeOf<Awaited<typeof created>["data"]>().toEqualTypeOf<{ id: string; status: "in_progress" | "completed" | "cancelled" } | null>();
    expectTypeOf<Awaited<typeof links>["data"]>().toEqualTypeOf<Array<{ meal_id: string; is_cooked: boolean }> | null>();
    for (const query of [meals, created, links]) expect(query.then).toBeTypeOf("function");
  });
  it.each<Mode>(["standard", "legacy", "non-product-json", "product-snapshot", "product-live", "guest", "foreign", "registered", "cook_done", "mismatch", "missing", "read-error", "insert-error", "link-error"])("preserves %s guards and existing insert ordering", async mode => {
    const { requests } = fixture(mode);
    const response = await POST(new Request("http://localhost/cooking", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipe_id: recipe, meal_ids: [meal], cooking_servings: 2 }) }));
    const success = mode === "standard" || mode === "legacy" || mode === "non-product-json";
    expect(response.status).toBe(success ? 201 : mode === "guest" ? 401 : mode === "foreign" ? 403 : mode === "missing" ? 404
      : mode === "mismatch" ? 422 : mode === "registered" || mode === "cook_done" || mode.startsWith("product-") ? 409 : 500);
    if (success) expect(await response.json()).toEqual({ success: true, error: null, data: {
      session_id: session, recipe_id: recipe, status: "in_progress", cooking_servings: 2, meals: [{ meal_id: meal, is_cooked: false }],
    } });
    else expect(await response.json()).toMatchObject({ success: false, data: null, error: { fields: expect.any(Array) } });
    const writes = requests.filter(request => request.method === "POST");
    expect(writes).toHaveLength(success || mode === "link-error" ? 2 : mode === "insert-error" ? 1 : 0);
    if (writes[0]) {
      expect(writes[0].url.pathname).toBe("/rest/v1/cooking_sessions");
      expect(writes[0].body).toEqual({ user_id: owner, status: "in_progress" });
      expect(writes[0].url.searchParams.get("select")).toBe("id,status");
    }
    if (writes[1]) {
      expect(writes[1].url.pathname).toBe("/rest/v1/cooking_session_meals");
      expect(writes[1].body).toEqual([{ session_id: session, meal_id: meal, recipe_id: recipe, cooking_servings: 2, is_cooked: false }]);
      expect(writes[1].url.searchParams.get("select")).toBe("meal_id,is_cooked");
    }
    if (mode === "guest") { expect(requests).toHaveLength(0); return; }
    expect(Object.fromEntries(requests[2].url.searchParams)).toEqual({ select: "id", id: `eq.${recipe}` });
    expect(Object.fromEntries(requests[3].url.searchParams)).toEqual({ select: "id,user_id,recipe_id,status,recipe_content_snapshots(ingredients_json)", id: `in.(${meal})` });
    const live = requests.find(request => request.url.pathname.endsWith("/recipe_ingredients"));
    if (mode === "legacy" || mode === "product-live") expect(Object.fromEntries(live?.url.searchParams ?? [])).toEqual({
      select: "ingredient_id,food_product_id,food_product_nutrition_version_id", recipe_id: `eq.${recipe}`,
    });
    else expect(live).toBeUndefined();
  });
});
