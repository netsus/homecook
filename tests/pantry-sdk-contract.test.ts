import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { PantryDbClient } from "@/app/api/v1/pantry/route";

const mocks = vi.hoisted(() => ({ route: vi.fn(), bootstrap: vi.fn(), publicUser: vi.fn(), growth: vi.fn(), after: vi.fn() }));
vi.mock("next/server", async importOriginal => ({ ...await importOriginal<typeof import("next/server")>(), after: mocks.after }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route }));
vi.mock("@/lib/server/user-bootstrap", () => ({ ensurePublicUserRow: mocks.publicUser, ensureUserBootstrapState: mocks.bootstrap,
  formatBootstrapErrorMessage: (_error: unknown, message: string) => message }));
vi.mock("@/lib/server/user-growth-activity", () => ({ recordUserGrowthActivityEvent: mocks.growth }));
const owner = "550e8400-e29b-41d4-a716-446655440001";
const ingredient = "550e8400-e29b-41d4-a716-446655440002";
const product = "550e8400-e29b-41d4-a716-446655440003";
const version = "550e8400-e29b-41d4-a716-446655440004";
const item = "550e8400-e29b-41d4-a716-446655440005";
const ingredientRow = { id: item, ingredient_id: ingredient, created_at: "2026-10-20", ingredients: { standard_name: "감자", category: "채소", category_code: null } };
const productRow = { id: item, food_product_id: product, food_product_nutrition_version_id: version, created_at: "2026-10-20",
  food_product_nutrition_versions: { food_products: { name: "제품", brand: null } } };

function fixture({ duplicate = false, productDuplicate = false, foreignPrivate = false, mismatch = false, legacy = false, malformed = "", nullJoin = false } = {}) {
  const requests: Array<{ url: URL; method: string; body: unknown }> = [];
  const sdk = createClient("http://pantry-contract.invalid", "fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? "GET";
      requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
      const table = url.pathname.split("/").at(-1);
      const select = url.searchParams.get("select") ?? "";
      let data: unknown = [];
      let status = 200;
      if (table === "ingredient_catalog_aliases") data = [];
      else if (table === "ingredients") data = url.searchParams.get("id") === "in.()" ? [] : [{ id: ingredient, standard_name: "감자", category: "채소", category_code: null }];
      else if (table === "food_product_nutrition_versions") data = [{ id: version, product_id: mismatch ? ingredient : product }];
      else if (table === "food_products") data = [{ id: product, name: "제품", brand: null, owner_user_id: foreignPrivate ? ingredient : owner, visibility: "private", deleted_at: null }];
      else if (table === "pantry_items") {
        if (method === "DELETE") data = [{ id: item }];
        else if (select === "ingredient_id") data = duplicate ? [{ ingredient_id: ingredient }] : [];
        else if (select.includes("food_product_nutrition_versions")) data = method === "POST" || productDuplicate || !url.searchParams.has("food_product_id")
          ? [{ ...productRow, food_product_id: malformed === "product" ? null : product,
            food_product_nutrition_versions: nullJoin ? null : productRow.food_product_nutrition_versions }] : [];
        else data = [{ ...ingredientRow, ingredient_id: malformed === "ingredient" ? null : ingredient,
          ingredients: nullJoin ? null : ingredientRow.ingredients }];
      } else throw new Error(`Unexpected pantry request ${url.pathname}`);
      if (legacy && (table === "ingredients" || table === "pantry_items") && select.includes("category_code")) {
        data = { code: "42703", message: "column category_code does not exist" }; status = 400;
      }
      return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    } },
  });
  const client = { from: sdk.from.bind(sdk), auth: { getUser: async () => ({ data: { user: { id: owner } } }) } };
  mocks.route.mockResolvedValue(client);
  return { sdk, client, requests };
}
async function mutate(method: "POST" | "DELETE", body: unknown) {
  const route = await import("@/app/api/v1/pantry/route");
  return route[method](new Request("http://localhost/api/v1/pantry", { method,
    headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
}
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("HOMECOOK_ENABLE_QA_FIXTURES", "0");
  mocks.bootstrap.mockResolvedValue(undefined); mocks.publicUser.mockResolvedValue({});
});

describe("pantry real SDK contract", () => {
  it("infers actual nullable identities and both ingredient/product FK projections without a cast", () => {
    const { sdk } = fixture();
    const client: PantryDbClient = sdk;
    const ingredientQuery = client.from("pantry_items").select("ingredient_id, ingredients!inner(standard_name, category)");
    const productQuery = client.from("pantry_items").select("food_product_id, food_product_nutrition_version_id, food_product_nutrition_versions!pantry_items_product_version_fkey!inner(food_products!food_product_nutrition_versions_product_id_fkey!inner(name, brand))");
    expectTypeOf<NonNullable<Awaited<typeof ingredientQuery>["data"]>[number]["ingredient_id"]>().toEqualTypeOf<string | null>();
    expectTypeOf<NonNullable<Awaited<typeof ingredientQuery>["data"]>[number]["ingredients"]>()
      .toEqualTypeOf<{ standard_name: string; category: string }>();
    expectTypeOf<NonNullable<Awaited<typeof productQuery>["data"]>[number]>().toEqualTypeOf<{
      food_product_id: string | null; food_product_nutrition_version_id: string | null;
      food_product_nutrition_versions: { food_products: { name: string; brand: string | null } };
    }>();
    expect(ingredientQuery.then).toBeTypeOf("function"); expect(productQuery.then).toBeTypeOf("function");
  });
  it.each([false, true])("preserves ingredient and pinned product GETs with legacy fallback=%s", async legacy => {
    const { requests, client } = fixture({ legacy });
    const { GET } = await import("@/app/api/v1/pantry/route");
    const response = await GET(new NextRequest("http://localhost/api/v1/pantry"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { items: [{ ingredient_id: ingredient }], product_items: [{ food_product_id: product, food_product_nutrition_version_id: version }] } });
    expect(mocks.publicUser).toHaveBeenCalledWith(client, { id: owner });
    const rows = requests.filter(({ url }) => url.pathname.endsWith("/pantry_items"));
    expect(rows).toHaveLength(legacy ? 3 : 2);
    for (const row of rows) {
      expect(row.method).toBe("GET"); expect(row.url.searchParams.get("user_id")).toBe(`eq.${owner}`);
      expect(row.url.searchParams.get("order")).toBe("created_at.desc,id.asc");
    }
    expect(rows.at(-1)?.url.searchParams.get("select")).toContain("pantry_items_product_version_fkey!inner");
  });
  it("skips duplicate ingredients without writes or after-response growth", async () => {
    const { requests } = fixture({ duplicate: true });
    const response = await mutate("POST", { ingredient_ids: [ingredient, ingredient] });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ data: { added: 0, product_added: 0 } });
    expect(requests.every(request => request.method === "GET")).toBe(true);
    expect(mocks.growth).not.toHaveBeenCalled();
  });
  it("preserves own-private product-only insertion, including nullable ingredient identity", async () => {
    const { requests } = fixture();
    const response = await mutate("POST", { product_items: [{ food_product_id: product, food_product_nutrition_version_id: version }] });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ data: { added: 0, product_added: 1, product_items: [{ food_product_id: product }] } });
    expect(requests.filter(request => request.method === "POST").map(request => request.body)).toEqual([
      [{ user_id: owner, food_product_id: product, food_product_nutrition_version_id: version }],
    ]);
    expect(mocks.growth).not.toHaveBeenCalled();
  });
  it("skips existing product/version pairs without writing or recording ingredient growth", async () => {
    const { requests } = fixture({ productDuplicate: true });
    const response = await mutate("POST", { product_items: [{ food_product_id: product, food_product_nutrition_version_id: version }] });
    expect(response.status).toBe(201); expect(await response.json()).toMatchObject({ data: { product_added: 0 } });
    expect(requests.every(request => request.method === "GET")).toBe(true); expect(mocks.growth).not.toHaveBeenCalled();
  });
  it("defers ingredient growth until the after-response task and retains the same request client", async () => {
    const { client } = fixture();
    expect((await mutate("POST", { ingredient_ids: [ingredient] })).status).toBe(201);
    expect(mocks.growth).not.toHaveBeenCalled(); expect(mocks.after).toHaveBeenCalledTimes(1);
    await mocks.after.mock.calls[0][0]();
    expect(mocks.growth).toHaveBeenCalledWith(client, expect.objectContaining({ sourceId: item, sourceMeta: { ingredient_id: ingredient } }));
  });
  it.each(["ingredient", "product"])("closes only malformed %s branch identities with wrapped 500", async malformed => {
    fixture({ malformed });
    const { GET } = await import("@/app/api/v1/pantry/route");
    const response = await GET(new NextRequest("http://localhost/api/v1/pantry"));
    expect(response.status).toBe(500); expect(await response.json()).toMatchObject({ success: false, data: null, error: { code: "INTERNAL_ERROR" } });
  });
  it.each(["ingredient", "product"])("stops POST after a malformed %s INSERT identity without scheduling growth", async malformed => {
    const { requests } = fixture({ malformed });
    const response = await mutate("POST", { ingredient_ids: [ingredient],
      product_items: [{ food_product_id: product, food_product_nutrition_version_id: version }] });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, data: null,
      error: { code: "INTERNAL_ERROR", message: "팬트리에 재료를 추가하지 못했어요.", fields: [] } });
    const writes = requests.filter(request => request.method === "POST");
    expect(writes.map(({ url }) => url.searchParams.get("select")?.includes("food_product_nutrition_versions")))
      .toEqual(malformed === "ingredient" ? [false] : [false, true]);
    expect(writes[0].body).toEqual([{ user_id: owner, ingredient_id: ingredient }]);
    if (malformed === "product") {
      expect(writes[1].body).toEqual([{ user_id: owner, food_product_id: product, food_product_nutrition_version_id: version }]);
    }
    expect(requests.at(-1)).toBe(writes.at(-1));
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.growth).not.toHaveBeenCalled();
  });
  it("preserves the existing optional-join soft fallbacks when identity fields are valid", async () => {
    fixture({ nullJoin: true });
    const { GET } = await import("@/app/api/v1/pantry/route");
    const response = await GET(new NextRequest("http://localhost/api/v1/pantry"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { items: [{ ingredient_id: ingredient, standard_name: "" }], product_items: [{ food_product_id: product, name: "" }] } });
  });
  it.each([{ foreignPrivate: true, expected: 404 }, { mismatch: true, expected: 422 }])("rejects unavailable product/version before writes %j", async options => {
    const { requests } = fixture(options);
    expect((await mutate("POST", { product_items: [{ food_product_id: product, food_product_nutrition_version_id: version }] })).status).toBe(options.expected);
    expect(requests.every(request => request.method === "GET")).toBe(true);
  });
  it("keeps ownership outside the mixed delete OR and returns the selected-row count", async () => {
    const { requests } = fixture();
    const response = await mutate("DELETE", { ingredient_ids: [ingredient], pantry_item_ids: [item] });
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ data: { removed: 1 } });
    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("DELETE");
    expect(Object.fromEntries(requests[0].url.searchParams)).toEqual({ user_id: `eq.${owner}`,
      or: `(ingredient_id.in.(${ingredient}),id.in.(${item}))`, select: "id" });
  });
});
