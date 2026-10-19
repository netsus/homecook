import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { RecipeBookReaderDbClient } from "@/app/api/v1/recipe-books/[book_id]/recipes/[recipe_id]/route";
import { normalizeRecipeSteps } from "@/lib/recipe-detail";
import { RECIPE_STEP_SELECT_LEGACY, RECIPE_STEP_SELECT_WITH_METHODS } from "@/lib/server/recipe-step-method-select";

const mocks = vi.hoisted(() => ({ route: vi.fn(), internal: vi.fn(), publicUser: vi.fn(), bootstrap: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route, createRecipeFuturePropagationInternalClient: mocks.internal }));
vi.mock("@/lib/server/user-bootstrap", () => ({
  ensurePublicUserRow: mocks.publicUser, ensureUserBootstrapState: mocks.bootstrap,
  formatBootstrapErrorMessage: (_error: unknown, message: string) => message,
}));
const book = "550e8400-e29b-41d4-a716-446655440041";
const recipe = "550e8400-e29b-41d4-a716-446655440051";
const method = { id: "method", code: "boil", label: "끓이기", color_key: "red", category_code: null };

function fixture({ liked = false, fallback = false, hidden = false, ingredientError = false, product = false } = {}) {
  const requests: Array<{ url: URL; method: string }> = [];
  const sdk = createClient("http://book-reader.invalid", "fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push({ url, method: init?.method ?? "GET" });
      const table = url.pathname.split("/").at(-1);
      let data: unknown;
      let status = 200;
      if (table === "recipe_books") data = { id: book, user_id: "owner", book_type: liked ? "liked" : "saved" };
      else if (table === "recipe_book_items") data = { id: "member", added_at: "2026-10-19" };
      else if (table === "recipe_likes") data = { id: "like" };
      else if (table === "recipes") data = hidden ? null : { id: recipe, title: "리더", thumbnail_url: null,
        tags: [], view_count: 3, base_servings: 2, created_by: null, source_type: "system", recipe_sources: null };
      else if (table === "recipe_ingredients") {
        if (ingredientError) { data = { code: "42501", message: "ingredient denied" }; status = 403; }
        else data = [{ id: "ingredient-row", ingredient_id: product ? null : "ingredient", source_kind: product ? "food_product" : "ingredient",
          food_product_id: product ? "product" : null, food_product_nutrition_version_id: product ? "version" : null,
          quantity_input: null, amount: 1, unit: "g", ingredient_type: "QUANT", display_text: null,
          component_label: null, scalable: true, sort_order: 1, ingredients: product ? null : { standard_name: "재료" } }];
      } else if (table === "food_products") data = [{ id: "product", name: "제품", brand: null }];
      else if (table === "recipe_steps") {
        if (fallback && url.searchParams.get("select")?.includes("recipe_step_cooking_methods")) {
          status = 400; data = { code: "PGRST200", message: "recipe_step_cooking_methods relationship missing" };
        } else data = [{ id: "step", step_number: 1, instruction: "끓인다", component_label: null,
          ingredients_used: { legacy: true }, heat_level: null, duration_seconds: 60, duration_text: null,
          cooking_methods: method, ...(fallback ? {} : { recipe_step_cooking_methods: [{ position: 1, cooking_methods: method }] }) }];
      } else throw new Error(`Unexpected table ${table}`);
      return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    } },
  });
  const client = { from: sdk.from.bind(sdk), auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) } };
  mocks.route.mockResolvedValue(client);
  return { sdk, client, requests };
}
async function read() {
  const { GET } = await import("@/app/api/v1/recipe-books/[book_id]/recipes/[recipe_id]/route");
  return GET(new Request(`http://localhost/api/v1/recipe-books/${book}/recipes/${recipe}`),
    { params: Promise.resolve({ book_id: book, recipe_id: recipe }) });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("HOMECOOK_ENABLE_QA_FIXTURES", "0");
  mocks.publicUser.mockResolvedValue({}); mocks.bootstrap.mockResolvedValue(undefined);
});

describe("recipebook native reader contract", () => {
  it("accepts the actual SDK and infers nullable FK, one-to-one source and both step projections", () => {
    const { sdk } = fixture();
    const reader: RecipeBookReaderDbClient = sdk;
    const ingredient = reader.from("recipe_ingredients").select("ingredient_id, quantity_input, ingredients(standard_name)");
    const source = reader.from("recipes").select("recipe_sources(extraction_meta_json)");
    const current = reader.from("recipe_steps").select(RECIPE_STEP_SELECT_WITH_METHODS);
    const legacy = reader.from("recipe_steps").select(RECIPE_STEP_SELECT_LEGACY);
    type Ingredient = NonNullable<Awaited<typeof ingredient>["data"]>[number];
    expectTypeOf<Ingredient["ingredient_id"]>().toEqualTypeOf<string | null>();
    expectTypeOf<Ingredient["ingredients"]>().toEqualTypeOf<{ standard_name: string } | null>();
    expectTypeOf<Ingredient["quantity_input"]>().toEqualTypeOf<unknown>();
    expectTypeOf<NonNullable<Awaited<typeof source>["data"]>[number]["recipe_sources"]>()
      .toEqualTypeOf<{ extraction_meta_json: unknown } | null>();
    expectTypeOf<Awaited<typeof current>["data"]>().toExtend<Parameters<typeof normalizeRecipeSteps>[0]>();
    expectTypeOf<Awaited<typeof legacy>["data"]>().toExtend<Parameters<typeof normalizeRecipeSteps>[0]>();
    expect([ingredient, source, current, legacy].every(query => typeof query.then === "function")).toBe(true);
    expect(reader).toBe(sdk);
  });

  it("preserves ordered authenticated membership/recipe/ingredient/step GETs and the same bootstrap object", async () => {
    const { client, requests } = fixture();
    const response = await read();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { view_count: 3,
      ingredients: [{ standard_name: "재료" }], steps: [{ ingredients_used: [], cooking_methods: [method] }] } });
    expect(mocks.publicUser).toHaveBeenCalledWith(client, { id: "owner" });
    expect(mocks.bootstrap).toHaveBeenCalledWith(client, "owner");
    expect(requests.map(({ url, method: verb }) => [url.pathname.split("/").at(-1), verb])).toEqual([
      ["recipe_books", "GET"], ["recipe_book_items", "GET"], ["recipes", "GET"], ["recipe_steps", "GET"], ["recipe_ingredients", "GET"],
    ]);
    expect(Object.fromEntries(requests[1].url.searchParams)).toEqual({ select: "id,added_at", book_id: `eq.${book}`, recipe_id: `eq.${recipe}` });
    expect(requests[4].url.searchParams.get("select")).toBe("id,source_kind,ingredient_id,food_product_id,food_product_nutrition_version_id,quantity_input,amount,unit,ingredient_type,display_text,component_label,scalable,sort_order,ingredients(standard_name)");
    expect(requests[4].url.searchParams.get("recipe_id")).toBe(`eq.${recipe}`);
    expect(requests[4].url.searchParams.get("order")).toBe("sort_order.asc");
    expect(requests[3].url.searchParams.get("order")).toBe("step_number.asc");
    expect(mocks.internal).not.toHaveBeenCalled();
  });

  it("keeps liked membership scoped to the authenticated user and recipe", async () => {
    const { requests } = fixture({ liked: true });
    expect((await read()).status).toBe(200);
    expect(requests[1].url.pathname).toMatch(/\/recipe_likes$/);
    expect(Object.fromEntries(requests[1].url.searchParams)).toEqual({ select: "id", user_id: "eq.owner", recipe_id: `eq.${recipe}` });
  });

  it("retains legacy method fallback with the same recipe filter/order", async () => {
    const { requests } = fixture({ fallback: true });
    const response = await read();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { steps: [{ cooking_method: method, ingredients_used: [] }] } });
    const steps = requests.filter(({ url }) => url.pathname.endsWith("/recipe_steps"));
    expect(steps).toHaveLength(2);
    expect(steps[1].url.searchParams.get("select")).not.toContain("recipe_step_cooking_methods");
    expect(steps.map(({ url }) => [url.searchParams.get("recipe_id"), url.searchParams.get("order")]))
      .toEqual([[`eq.${recipe}`, "step_number.asc"], [`eq.${recipe}`, "step_number.asc"]]);
  });

  it("keeps nullable product-only ingredients on the same authenticated label reader", async () => {
    const { requests } = fixture({ product: true });
    const response = await read();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { ingredients: [{ ingredient_id: null, standard_name: "제품", food_product_id: "product" }] } });
    expect(requests.filter(({ url }) => url.pathname.endsWith("/food_products"))).toHaveLength(1);
    expect(mocks.internal).not.toHaveBeenCalled();
  });

  it("does not read child rows after an RLS-hidden recipe", async () => {
    const { requests } = fixture({ hidden: true });
    expect((await read()).status).toBe(404);
    expect(requests).toHaveLength(3);
  });

  it("preserves ingredient errors as the existing wrapped 500", async () => {
    fixture({ ingredientError: true });
    const response = await read();
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ success: false, data: null, error: { code: "INTERNAL_ERROR", message: "레시피 재료를 불러오지 못했어요." } });
  });
});
