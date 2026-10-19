import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { RecipeDetailIngredientReadClient } from "@/app/api/v1/recipes/[id]/route";
import type { normalizeRecipeIngredients } from "@/lib/recipe-detail";

const { createRouteHandlerClient } = vi.hoisted(() => ({ createRouteHandlerClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient,
  createRemoteCompatibilityServiceRoleClient: () => null,
  createRecipeImageInternalClient: () => null,
  createRecipeViewInternalClient: () => null,
  createRecipeFuturePropagationInternalClient: () => null,
  createRecipeMealWeightReadInternalClient: () => null,
}));

const recipeId = "550e8400-e29b-41d4-a716-446655440022";
const row = {
  id: "550e8400-e29b-41d4-a716-446655440023", ingredient_id: "ingredient-1",
  source_kind: "ingredient", amount: "1.5", unit: "g", ingredient_type: "QUANT",
  display_text: "재료", component_label: null, scalable: true, sort_order: 3,
  ingredients: { standard_name: "재료" }, quantity_input: null,
  food_product_id: null, food_product_nutrition_version_id: null,
};
const baseColumns = "id,source_kind,ingredient_id,amount,unit,ingredient_type,display_text,component_label,scalable,sort_order,ingredients(standard_name)";

function fixture(authenticated: boolean, fail = false, product = false) {
  const requests: Array<{ url: URL; method: string }> = [];
  const client = createClient("http://recipe-detail.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push({ url, method: init?.method ?? "GET" });
      const table = url.pathname.split("/").at(-1);
      let data: unknown = [];
      const failed = fail && table === "recipe_ingredients";
      if (failed) data = { code: "XX000", message: "ingredient read failed" };
      else if (table === "recipes") data = {
        id: recipeId, title: "조회 계약", description: null, thumbnail_url: null,
        base_servings: 1, tags: [], source_type: "manual", created_by: null,
        visibility: "public", origin_recipe_id: null, deleted_at: null, revision: 1,
        view_count: 0, like_count: 0, save_count: 0, plan_count: 0, cook_count: 0,
      };
      else if (table === "recipe_sources" || table === "recipe_nutrition_snapshots") data = null;
      else if (table === "recipe_ingredients") {
        const select = url.searchParams.get("select") ?? "";
        const selectedRow = product ? { ...row, ingredient_id: null, ingredients: null,
          source_kind: "food_product", food_product_id: "product-1", food_product_nutrition_version_id: "version-1" } : row;
        data = [Object.fromEntries(Object.entries(selectedRow).filter(([key]) => select.includes(key)))];
      } else if (table === "food_products") data = [{ id: "product-1", name: "제품", brand: "상표" }];
      else if (table === "read_public_recipe_product_sources" && product) data = [{
        row_key: row.id, food_product_id: "product-1", food_product_nutrition_version_id: "version-1",
        food_product_name: "제품", food_product_brand: "상표",
      }];
      else if (!["recipe_steps", "recipe_likes", "recipe_book_items", "read_public_recipe_product_sources"].includes(table ?? "")) {
        throw new Error(`unexpected request: ${url.pathname}`);
      }
      return new Response(JSON.stringify(data), {
        status: failed ? 500 : 200, headers: { "content-type": "application/json" },
      });
    } },
  });
  createRouteHandlerClient.mockResolvedValue({
    from: client.from.bind(client), rpc: client.rpc.bind(client),
    auth: { getUser: async () => ({ data: { user: authenticated ? { id: "viewer" } : null }, error: null }) },
  });
  return requests;
}

describe("detail native ingredient projection", () => {
  beforeEach(() => createRouteHandlerClient.mockReset());

  it("infers the four native selected rows without casting the SDK client or result", () => {
    const client: RecipeDetailIngredientReadClient = createClient("http://recipe-detail.invalid", "public-test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const table = client.from("recipe_ingredients");
    const base = table.select("id, source_kind, ingredient_id, amount, unit, ingredient_type, display_text, component_label, scalable, sort_order, ingredients(standard_name)");
    const quantity = table.select("quantity_input, id, source_kind, ingredient_id, amount, unit, ingredient_type, display_text, component_label, scalable, sort_order, ingredients(standard_name)");
    const product = table.select("id, source_kind, ingredient_id, amount, unit, ingredient_type, display_text, component_label, scalable, sort_order, ingredients(standard_name), food_product_id, food_product_nutrition_version_id");
    const combined = table.select("quantity_input, id, source_kind, ingredient_id, amount, unit, ingredient_type, display_text, component_label, scalable, sort_order, ingredients(standard_name), food_product_id, food_product_nutrition_version_id");
    expectTypeOf<Awaited<typeof base>["data"]>().toExtend<Parameters<typeof normalizeRecipeIngredients>[0]>();
    expectTypeOf<Awaited<typeof quantity>["data"]>().toExtend<Parameters<typeof normalizeRecipeIngredients>[0]>();
    expectTypeOf<Awaited<typeof product>["data"]>().toExtend<Parameters<typeof normalizeRecipeIngredients>[0]>();
    expectTypeOf<Awaited<typeof combined>["data"]>().toExtend<Parameters<typeof normalizeRecipeIngredients>[0]>();
    expectTypeOf<NonNullable<Awaited<typeof base>["data"]>[number]["ingredients"]>().toEqualTypeOf<{ standard_name: string } | null>();
    expectTypeOf<keyof NonNullable<Awaited<typeof quantity>["data"]>[number]>().toEqualTypeOf<keyof NonNullable<Awaited<typeof base>["data"]>[number] | "quantity_input">();
    expect(base.then).toBeTypeOf("function");
    expect(quantity.then).toBeTypeOf("function");
    expect(product.then).toBeTypeOf("function");
    expect(combined.then).toBeTypeOf("function");
  });

  it.each([
    { authenticated: false, quantity: false }, { authenticated: false, quantity: true },
    { authenticated: true, quantity: false }, { authenticated: true, quantity: true },
  ])("preserves fields and normalization for $authenticated/$quantity", async ({ authenticated, quantity }) => {
    const requests = fixture(authenticated);
    const { GET } = await import("@/app/api/v1/recipes/[id]/route");
    const response = await GET(new Request(`http://localhost/api/v1/recipes/${recipeId}`, {
      headers: quantity ? { "X-Homecook-Quantity-Contract": "quantity-v4" } : {},
    }), { params: Promise.resolve({ id: recipeId }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, error: null, data: {
      ingredients: [{ id: row.id, ingredient_id: row.ingredient_id, standard_name: "재료", amount: 1.5,
        unit: "g", ingredient_type: "QUANT", scalable: true, sort_order: 3 }],
    } });
    const ingredientReads = requests.filter(({ url }) => url.pathname.endsWith("/recipe_ingredients"));
    expect(ingredientReads).toHaveLength(1);
    expect(ingredientReads[0].method).toBe("GET");
    expect(Object.fromEntries(ingredientReads[0].url.searchParams)).toEqual({
      select: (quantity ? "quantity_input," : "") + baseColumns
        + (authenticated ? ",food_product_id,food_product_nutrition_version_id" : ""),
      recipe_id: `eq.${recipeId}`, order: "sort_order.asc",
    });
    expect(createRouteHandlerClient).toHaveBeenCalledExactlyOnceWith({ anonymousPublicReadScope: "recipe-detail" });
  });

  it("preserves the error wrapper when the ingredient query fails", async () => {
    fixture(false, true);
    const { GET } = await import("@/app/api/v1/recipes/[id]/route");
    const response = await GET(new Request(`http://localhost/api/v1/recipes/${recipeId}`), {
      params: Promise.resolve({ id: recipeId }),
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ success: false, data: null, error: { code: "INTERNAL_ERROR", fields: [] } });
  });

  it.each([false, true])("preserves a product-only row with null ingredient join (authenticated=%s)", async (authenticated) => {
    const requests = fixture(authenticated, false, true);
    const { GET } = await import("@/app/api/v1/recipes/[id]/route");
    const response = await GET(new Request(`http://localhost/api/v1/recipes/${recipeId}`), {
      params: Promise.resolve({ id: recipeId }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { ingredients: [{
      id: row.id, ingredient_id: null, standard_name: "상표 · 제품", amount: 1.5,
      food_product_id: "product-1", food_product_nutrition_version_id: "version-1",
      source_kind: "food_product",
    }] } });
    expect(requests.some(({ url }) => url.pathname.endsWith("/food_products"))).toBe(authenticated);
    expect(requests.some(({ url }) => url.pathname.endsWith("/read_public_recipe_product_sources"))).toBe(!authenticated);
  });
});
