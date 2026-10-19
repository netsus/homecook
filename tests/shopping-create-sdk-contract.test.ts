import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/v1/shopping/lists/route";

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
type Mode = "legacy" | "pinned" | "foreign" | "read-error" | "invalid-array" | "invalid-row" | "invalid-text" | "null-ingredients" | "null-base";

function fixture(mode: Mode) {
  const requests: Array<{ url: URL; method: string; body: unknown }> = [];
  const sdk = createClient("http://shopping-create-contract.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      const method = init?.method ?? "GET";
      requests.push({ url, method, body });
      const table = url.pathname.split("/").at(-1);
      if (table === "meals" && mode === "read-error") {
        return new Response(JSON.stringify({ code: "42501", message: "fixture denied" }), { status: 403 });
      }
      const ingredient = { ingredient_id: INGREDIENT, food_product_id: null, food_product_nutrition_version_id: null,
        amount: 100, unit: "g", ingredient_type: "QUANT", display_text: "양파 100g" };
      const pinned = mode !== "legacy" && mode !== "foreign" && mode !== "read-error";
      const snapshot = { base_servings: mode === "null-base" ? null : 2,
        ingredients_json: mode === "invalid-array" ? {} : mode === "invalid-row" ? [null]
          : mode === "invalid-text" ? [{ ...ingredient, display_text: 42 }]
          : mode === "null-ingredients" ? null : [ingredient] };
      const rows = table === "meals" ? [{ id: MEAL, user_id: mode === "foreign" ? "other" : "user-1", recipe_id: RECIPE,
        recipe_content_snapshot_id: pinned ? "snapshot-1" : null,
        recipe_content_snapshots: pinned ? snapshot : null,
        plan_date: "2026-10-20", column_id: "column-1", planned_servings: 2, status: "registered",
        is_leftover: false, leftover_dish_id: null, shopping_list_id: null }]
        : table === "recipes" ? [{ id: RECIPE, base_servings: 2 }]
        : table === "recipe_ingredients" ? [{ ...ingredient, recipe_id: RECIPE }]
        : table === "ingredients" ? [{ id: INGREDIENT, standard_name: "양파" }]
        : [];
      const data = table === "create_shopping_list_with_snapshot_authority"
        ? { id: "list-1", created_at: "2026-10-20T03:00:00Z", items: [] } : rows;
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
    const { sdk } = fixture("legacy");
    const query = sdk.from("recipes").select("id, base_servings").in("id", [RECIPE]);
    expect(query.then).toBeTypeOf("function");
  });

  it.each<Mode>(["invalid-array", "invalid-row"])("records the existing malformed %s rejection without writes", async (mode) => {
    const { requests } = fixture(mode);
    await expect(POST(new Request("http://localhost/api/v1/shopping/lists", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ meal_configs: [{ meal_id: MEAL, shopping_servings: 2 }] }),
    }))).rejects.toBeInstanceOf(TypeError);
    expect(requests.every((request) => request.method === "GET")).toBe(true);
    expect(mocks.growth).not.toHaveBeenCalled();
  });

  it("records the existing unused malformed label acceptance", async () => {
    fixture("invalid-text");
    const response = await POST(new Request("http://localhost/api/v1/shopping/lists", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ meal_configs: [{ meal_id: MEAL, shopping_servings: 2 }] }),
    }));
    expect(response.status).toBe(201);
  });

  it.each<Mode>(["null-ingredients", "null-base"])("keeps the existing %s empty snapshot behavior without recipe fallback", async (mode) => {
    const { requests } = fixture(mode);
    const response = await POST(new Request("http://localhost/api/v1/shopping/lists", { method: "POST",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ meal_configs: [{ meal_id: MEAL, shopping_servings: 2 }] }),
    }));
    expect(response.status).toBe(201);
    expect(requests.map((request) => request.url.pathname.split("/").at(-1))).toEqual(["meals", "create_shopping_list_with_snapshot_authority"]);
    expect(requests[1].body).toMatchObject({ p_item_rows: [], p_recipe_rows: [{ recipe_id: RECIPE,
      recipe_content_snapshot_id: "snapshot-1", shopping_servings: 2, planned_servings_total: 2 }] });
  });

  it.each<Mode>(["legacy", "pinned", "foreign", "read-error"])("preserves %s source selection and owner filters on the actual wire", async (mode) => {
    const { client, requests } = fixture(mode);
    const response = await POST(new Request("http://localhost/api/v1/shopping/lists", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ meal_configs: [{ meal_id: MEAL, shopping_servings: 2 }], complete_without_list: false }),
    }));
    expect(response.status).toBe(mode === "foreign" ? 403 : mode === "read-error" ? 500 : 201);
    expect(mocks.user).toHaveBeenCalledWith(client, { id: "user-1" });
    expect(mocks.bootstrap).toHaveBeenCalledWith(client, "user-1");
    expect(requests[0].url.searchParams.get("id")).toBe(`in.(${MEAL})`);
    expect(requests[0].url.searchParams.get("select")).toContain("recipe_content_snapshots(base_servings,ingredients_json)");
    if (mode === "foreign" || mode === "read-error") {
      expect(requests).toHaveLength(1);
      expect(mocks.growth).not.toHaveBeenCalled();
      return;
    }
    const reads = requests.filter((request) => request.method === "GET");
    expect(reads.map((request) => request.url.pathname.split("/").at(-1))).toEqual(mode === "legacy"
      ? ["meals", "recipes", "recipe_ingredients", "ingredients", "pantry_items"] : ["meals", "ingredients", "pantry_items"]);
    const pantry = reads[reads.length - 1];
    expect(pantry.url.searchParams.get("select")).toBe("ingredient_id,food_product_id,food_product_nutrition_version_id");
    expect(pantry.url.searchParams.get("user_id")).toBe("eq.user-1");
    expect(pantry.url.searchParams.get("or")).toBe(`(ingredient_id.in.(${INGREDIENT}))`);
    const mutations = requests.filter((request) => request.method !== "GET");
    expect(mutations).toHaveLength(1);
    expect(mutations[0].url.pathname).toBe("/rest/v1/rpc/create_shopping_list_with_snapshot_authority");
    expect(mutations[0]).toMatchObject({ method: "POST", body: { p_owner_uuid: "user-1", p_user_id: "user-1",
      p_shopping_meal_ids: [MEAL], p_complete_without_list: false,
      p_recipe_rows: [{ recipe_id: RECIPE, recipe_content_snapshot_id: mode === "pinned" ? "snapshot-1" : null,
        shopping_servings: 2, planned_servings_total: 2 }],
      p_item_rows: [expect.objectContaining({ ingredient_id: INGREDIENT, amounts_json: [{ amount: 100, unit: "g" }] })] } });
    expect(mocks.growth).toHaveBeenCalledWith(client, expect.objectContaining({ userId: "user-1", sourceId: "list-1" }));
  });
});
