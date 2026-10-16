import { createClient } from "@supabase/supabase-js";
import { describe, expect, expectTypeOf, it } from "vitest";

import { normalizeIngredientSearchName } from "@/lib/ingredient-search";
import { getMockRecipeList } from "@/lib/mock/recipes";
import { isAnonymousHybridPublicReadRequest } from "@/lib/server/hybrid-auth/public-read-policy";
import { createRecipeIngredientSearch } from "@/lib/server/recipe-ingredient-search";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const ingredients = [
  [1, "돼지고기", "육류"], [2, "돼지고기 목심", "육류"],
  [3, "돼지고기 앞다리", "육류"], [4, "돼지 앞다리살", "육류"],
  [5, "삼겹살", "육류"], [6, "소고기 목심", "육류"],
  [7, "돼지감자", "채소"], [8, "된장", "양념"],
  [9, "재래식 된장", "양념"], [10, "양파", "채소"],
  [11, "슈가파우더", "양념"], [12, "가루 설탕", "양념"],
].map(([key, name, category]) => ({
  id: id(Number(key)), standard_name: String(name), category: String(category),
  category_code: null,
  search_name: normalizeIngredientSearchName(String(name)),
}));
const aliases = [{ ingredient_id: id(11), representative_ingredient_id: id(12),
  representative_standard_name: "가루 설탕", representative_category: "양념", representative_category_code: null }];
const synonyms = [{
  ingredient_id: id(4), synonym: "돼지고기 앞다리살", search_name: "돼지고기앞다리살",
  ingredients: ingredients.find((row) => row.id === id(4)),
}];
const mappings = [
  ...ingredients.map((row, index) => ({ id: id(100 + index), recipe_id: id(200 + index), ingredient_id: row.id })),
  { id: id(120), recipe_id: id(201), ingredient_id: id(10) },
  { id: id(121), recipe_id: id(207), ingredient_id: id(8) },
];

function searchFixture(options: {
  failTable?: string; extraMappings?: typeof mappings;
  productMappings?: Array<{ recipe_id: string; ingredient_id: string }>;
  withoutProductRpc?: boolean;
  unexpectedNullMatch?: { recipe_id: string; ingredient_id: null };
} = {}) {
  const requests: URL[] = [];
  const client = (scope: "ingredients" | "recipes") => createClient("http://127.0.0.1:54321", "test-only-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      requests.push(url);
      const path = url.pathname.replace("/rest/v1", "");
      const method = init?.method ?? "GET";
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      expect(isAnonymousHybridPublicReadRequest({ scope, path, method, search: url.search, body })).toBe(true);
      if (path === "/rpc/read_recipe_product_ingredient_classification") {
        return new Response(JSON.stringify((options.productMappings ?? []).filter((row) => body.p_ingredient_ids.includes(row.ingredient_id))), { headers: { "Content-Type": "application/json" } });
      }
      const table = path.slice(1);
      if (table === options.failTable) return new Response(JSON.stringify({ message: "lookup unavailable" }), { status: 500 });
      let rows: Record<string, unknown>[] = table === "ingredients" ? [...ingredients]
        : table === "ingredient_synonyms" ? [...synonyms]
        : table === "ingredient_catalog_aliases" ? [...aliases] : [...mappings, ...options.extraMappings ?? []];
      for (const [key, expression] of url.searchParams) {
        if (expression.startsWith("in.(")) {
          const values = expression.slice(4, -1).split(",").map((v) => v.replace(/^"|"$/g, ""));
          rows = rows.filter((row) => values.includes(String(row[key])));
        } else if (expression.startsWith("like.")) {
          const term = expression.slice(5).replace(/^%|%$/g, "").replace(/\\([%_\\])/g, "$1");
          rows = rows.filter((row) => String(row[key]).includes(term));
        }
      }
      rows.sort((a, b) => String(a.id ?? a.ingredient_id).localeCompare(String(b.id ?? b.ingredient_id)));
      // Deliberately bypass the fake response filter for this defensive case.
      // Real PostgREST IN filters exclude null; this is not a DB/RLS claim.
      if (table === "recipe_ingredients" && options.unexpectedNullMatch) rows.push(options.unexpectedNullMatch);
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit"));
      return new Response(JSON.stringify(rows.slice(offset, offset + limit)), { headers: { "Content-Type": "application/json" } });
    } },
  });
  const recipes: Parameters<typeof createRecipeIngredientSearch>[1] = client("recipes");
  const catalog: Parameters<typeof createRecipeIngredientSearch>[0] = client("ingredients");
  const recipeReads = options.withoutProductRpc ? { from: recipes.from.bind(recipes) } : recipes;
  return { search: createRecipeIngredientSearch(catalog, recipeReads), requests, catalog, recipes };
}

describe("recipe ingredient discovery", () => {
  it("preserves exact native synonym, alias, nullable stored-match and RPC projections", () => {
    const { catalog, recipes } = searchFixture();
    const synonym = catalog.from("ingredient_synonyms")
      .select("ingredient_id,synonym,ingredients!inner(id,standard_name,category,category_code)");
    expectTypeOf<Awaited<typeof synonym>["data"]>().toEqualTypeOf<Array<{
      ingredient_id: string; synonym: string;
      ingredients: { id: string; standard_name: string; category: string; category_code: string | null };
    }> | null>();
    const alias = catalog.from("ingredient_catalog_aliases").select("ingredient_id,representative_ingredient_id,representative_standard_name,representative_category,representative_category_code");
    expectTypeOf<Awaited<typeof alias>["data"]>().toEqualTypeOf<Array<{
      ingredient_id: string; representative_ingredient_id: string;
      representative_standard_name: string; representative_category: string;
      representative_category_code: string | null;
    }> | null>();
    const stored = recipes.from("recipe_ingredients").select("recipe_id,ingredient_id");
    expectTypeOf<Awaited<typeof stored>["data"]>().toEqualTypeOf<Array<{ recipe_id: string; ingredient_id: string | null }> | null>();
    const product = recipes.rpc?.("read_recipe_product_ingredient_classification", { p_ingredient_ids: [id(8)] });
    expectTypeOf<NonNullable<Awaited<typeof product>>["data"]>().toEqualTypeOf<Array<{ recipe_id: string; ingredient_id: string }> | null>();
    expect(synonym.then).toBeTypeOf("function");
    expect(alias.then).toBeTypeOf("function");
    expect(stored.then).toBeTypeOf("function");
    expect(product?.then).toBeTypeOf("function");
  });

  it("preserves generic-only discovery when the optional product RPC is absent", async () => {
    const { search, requests } = searchFixture({ withoutProductRpc: true });
    expect((await search.search("된장")).sort()).toEqual([id(207), id(208)]);
    expect((await search.filter([id(8)]))?.sort()).toEqual([id(207), id(208)]);
    expect(requests.some((url) => url.pathname.includes("/rpc/"))).toBe(false);
  });

  it("preserves defensive null-row search output while null never matches a selected group", async () => {
    const recipeId = id(950);
    const { search } = searchFixture({ unexpectedNullMatch: { recipe_id: recipeId, ingredient_id: null } });
    expect(await search.search("된장")).toContain(recipeId);
    expect(await search.filter([id(8)])).not.toContain(recipeId);
  });

  it("uses the preview recipe's real ingredient list for both text and selected ingredient searches", () => {
    const selected = getMockRecipeList(null, ["550e8400-e29b-41d4-a716-446655440014"]);
    expect(selected.items).toHaveLength(1);
    expect(getMockRecipeList("돼지고기").items).toEqual(selected.items);
  });
  it("finds the same pork cuts through text and ingredient selection, without beef or Jerusalem artichoke", async () => {
    const { search } = searchFixture();
    const expected = [200, 201, 202, 203, 204].map(id);
    expect((await search.search("돼지고기")).sort()).toEqual(expected);
    expect((await search.search("돼지")).sort()).toEqual(expected);
    expect((await search.filter([id(1)]))?.sort()).toEqual(expected);
  });

  it("matches actual doenjang references and deduplicates repeated rows", async () => {
    const { search } = searchFixture();
    expect((await search.search("된장")).sort()).toEqual([id(207), id(208)]);
    expect((await search.filter([id(8)]))?.sort()).toEqual([id(207), id(208)]);
  });

  it("requires all selected ingredient groups while allowing any pork cut inside a group", async () => {
    const { search } = searchFixture();
    expect(await search.filter([id(1), id(10)])).toEqual([id(201)]);
    expect(await search.filter([id(1), id(8)])).toEqual([]);
  });

  it("matches mixed generic/product classifications inside family OR and selected-condition AND", async () => {
    const recipe = id(900);
    const { search } = searchFixture({ extraMappings: [{ id: id(901), recipe_id: recipe, ingredient_id: id(10) }],
      productMappings: [{ recipe_id: recipe, ingredient_id: id(2) }] });
    expect(await search.filter([id(1), id(10)])).toContain(recipe);
    expect(await search.filter([id(1), id(8)])).not.toContain(recipe);
  });

  it("normalizes spacing and does not expand a specific cut to unrelated pork cuts", async () => {
    const { search } = searchFixture();
    expect(await search.search("돼지 고기　목심")).toEqual([id(201)]);
    expect(await search.filter([id(2)])).toEqual([id(201)]);
    expect(await search.filter([])).toBeNull();
  });

  it("does not lose results after the default 1000-row database page", async () => {
    const extraMappings = Array.from({ length: 1005 }, (_, i) => ({ id: id(1000 + i), recipe_id: id(3000 + i), ingredient_id: id(8) }));
    const { search, requests } = searchFixture({ extraMappings });
    const result = await search.search("된장");
    expect(result).toHaveLength(1007);
    expect(result).toContain(id(4004));
    expect(requests.some((url) => url.pathname.endsWith("recipe_ingredients") && url.searchParams.get("offset") === "1000")).toBe(true);
  });

  it("finds legacy references through either canonical or alias name and preserves both stored rows", async () => {
    const { search } = searchFixture();
    expect((await search.search("가루 설탕")).sort()).toEqual([id(210), id(211)]);
    expect((await search.search("슈가파우더")).sort()).toEqual([id(210), id(211)]);
    expect((await search.filter([id(12)]))?.sort()).toEqual([id(210), id(211)]);
    expect((await search.filter([id(11)]))?.sort()).toEqual([id(210), id(211)]);
  });

  it.each(["ingredients", "ingredient_synonyms", "ingredient_catalog_aliases", "recipe_ingredients"])("reports %s errors instead of a false empty result", async (failTable) => {
    await expect(searchFixture({ failTable }).search.search("된장")).rejects.toBeTruthy();
  });

  it("keeps public read permissions limited to the approved columns, tables, and bounded pages", () => {
    const valid = new URLSearchParams({ select: "id,standard_name,category,category_code", order: "standard_name.asc,id.asc", search_name: "like.%된장%", offset: "0", limit: "1000" });
    const allows = (search: URLSearchParams, method = "GET", path = "/ingredients") => isAnonymousHybridPublicReadRequest({ scope: "ingredients", path, method, search: search.toString() });
    expect(allows(valid)).toBe(true);
    for (const [key, value] of [["select", "*"], ["select", "id,created_by"], ["offset", "-1"], ["limit", "1001"], ["limit", "0"]]) {
      const bad = new URLSearchParams(valid); bad.set(key, value); expect(allows(bad)).toBe(false);
    }
    expect(allows(valid, "PATCH")).toBe(false);
    expect(allows(valid, "GET", "/users")).toBe(false);
  });
});
