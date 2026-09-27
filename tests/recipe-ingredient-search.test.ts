import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { normalizeIngredientSearchName } from "@/lib/ingredient-search";
import { getMockRecipeList } from "@/lib/mock/recipes";
import { isAnonymousHybridPublicReadRequest } from "@/lib/server/hybrid-auth/public-read-policy";
import { createRecipeIngredientSearch, type RecipeIngredientSearchClient } from "@/lib/server/recipe-ingredient-search";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const ingredients = [
  [1, "돼지고기", "육류"], [2, "돼지고기 목심", "육류"],
  [3, "돼지고기 앞다리", "육류"], [4, "돼지 앞다리살", "육류"],
  [5, "삼겹살", "육류"], [6, "소고기 목심", "육류"],
  [7, "돼지감자", "채소"], [8, "된장", "양념"],
  [9, "재래식 된장", "양념"], [10, "양파", "채소"],
].map(([key, name, category]) => ({
  id: id(Number(key)), standard_name: String(name), category: String(category),
  search_name: normalizeIngredientSearchName(String(name)),
}));
const synonyms = [{
  ingredient_id: id(4), synonym: "돼지고기 앞다리살", search_name: "돼지고기앞다리살",
  ingredients: ingredients.find((row) => row.id === id(4)),
}];
const mappings = [
  ...ingredients.map((row, index) => ({ id: id(100 + index), recipe_id: id(200 + index), ingredient_id: row.id })),
  { id: id(120), recipe_id: id(201), ingredient_id: id(10) },
  { id: id(121), recipe_id: id(207), ingredient_id: id(8) },
];

function searchFixture(options: { failTable?: string; extraMappings?: typeof mappings } = {}) {
  const requests: URL[] = [];
  const client = (scope: "ingredients" | "recipes") => createClient("http://127.0.0.1:54321", "test-only-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input));
      requests.push(url);
      const path = url.pathname.replace("/rest/v1", "");
      expect(isAnonymousHybridPublicReadRequest({ scope, path, method: "GET", search: url.search })).toBe(true);
      const table = path.slice(1);
      if (table === options.failTable) return new Response(JSON.stringify({ message: "lookup unavailable" }), { status: 500 });
      let rows: Record<string, unknown>[] = table === "ingredients" ? [...ingredients]
        : table === "ingredient_synonyms" ? [...synonyms] : [...mappings, ...options.extraMappings ?? []];
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
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit"));
      return new Response(JSON.stringify(rows.slice(offset, offset + limit)), { headers: { "Content-Type": "application/json" } });
    } },
  }) as unknown as RecipeIngredientSearchClient;
  return { search: createRecipeIngredientSearch(client("ingredients"), client("recipes")), requests };
}

describe("recipe ingredient discovery", () => {
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

  it.each(["ingredients", "ingredient_synonyms", "recipe_ingredients"])("reports %s errors instead of a false empty result", async (failTable) => {
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
