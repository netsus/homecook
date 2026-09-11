import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

import { isAnonymousHybridPublicReadRequest } from
  "@/lib/server/hybrid-auth/public-read-policy";

function isAllowed(input: Record<string, unknown>) {
  return isAnonymousHybridPublicReadRequest(input as never);
}

const recipeDetailSelect = "id,title,description,thumbnail_url,base_servings,tags,source_type,created_by,visibility,deleted_at,revision,view_count,like_count,save_count,plan_count,cook_count";
const recipeId = "00000000-0000-4000-8000-000000000001";

describe("hybrid anonymous public read policy", () => {
  it("allows the actual SDK recipe detail query with visibility, deletion, and revision fields", async () => {
    const requests: URL[] = [];
    const client = createClient("http://127.0.0.1:54321", "public-test-key", {
      auth: { persistSession: false },
      global: { fetch: async (input) => {
        requests.push(new URL(String(input)));
        return new Response("[]", { headers: { "content-type": "application/json" } });
      } },
    });

    await client.from("recipes").select(recipeDetailSelect).eq("id", recipeId).maybeSingle();

    expect(requests).toHaveLength(1);
    expect(isAllowed({
      scope: "recipe-detail", method: "GET", path: "/recipes", search: requests[0].search,
    })).toBe(true);
  });

  it.each([
    ["wildcard columns", { select: "*" }, {}],
    ["additional columns", { select: `${recipeDetailSelect},updated_at` }, {}],
    ["missing recipe ID", { id: null }, {}],
    ["empty recipe ID", { id: "eq." }, {}],
    ["multiple recipe IDs", { id: `in.(${recipeId})` }, {}],
    ["additional query keys", { limit: "1" }, {}],
    ["mutation requests", {}, { method: "PATCH" }],
    ["HEAD requests", {}, { method: "HEAD" }],
    ["recipe list scope", {}, { scope: "recipes" }],
    ["cook mode scope", {}, { scope: "recipe-cook-mode" }],
    ["other tables", {}, { path: "/users" }],
  ])("rejects recipe detail queries with %s", (_label, params, overrides) => {
    const search = new URLSearchParams({ select: recipeDetailSelect, id: `eq.${recipeId}` });
    for (const [key, value] of Object.entries(params)) {
      if (value === null) search.delete(key);
      else search.set(key, value);
    }
    expect(isAllowed({
      scope: "recipe-detail", method: "GET", path: "/recipes", search: search.toString(), ...overrides,
    })).toBe(false);
  });

  it.each(["view_count", "like_count", "save_count", "plan_count", "cook_count", "created_at"])(
    "allows actual SDK recipe ordering by %s, including the next page",
    async (sort) => {
      const requests: URL[] = [];
      const client = createClient("http://127.0.0.1:54321", "public-test-key", {
        auth: { persistSession: false },
        global: { fetch: async (input) => {
          requests.push(new URL(String(input)));
          return new Response("[]", { headers: { "content-type": "application/json" } });
        } },
      });
      const id = "00000000-0000-4000-8000-000000000001";
      const value = sort === "created_at" ? "2026-09-06T00:00:00Z" : "10";
      const query = () => client.from("recipes")
        .select("id,title,thumbnail_url,tags,base_servings,view_count,like_count,save_count,plan_count,cook_count,created_at,source_type")
        .eq("visibility", "public").is("deleted_at", null).limit(21)
        .order(sort, { ascending: false })
        .order("id", { ascending: sort !== "created_at" });
      await query();
      await query().or(`${sort}.lt.${value},and(${sort}.eq.${value},id.${sort === "created_at" ? "lt" : "gt"}.${id})`);
      expect(requests).toHaveLength(2);
      for (const url of requests) {
        expect(isAllowed({ scope: "recipes", method: "GET", path: "/recipes", search: url.search })).toBe(true);
        for (const [key, invalid] of [
          ["visibility", "eq.private"],
          ["deleted_at", "not.is.null"],
          ["select", "*"],
          ["order", `${sort}.desc,id.asc,title.asc`],
          ["order", "title.desc,id.asc"],
        ]) {
          const search = new URLSearchParams(url.search);
          search.set(key, invalid);
          expect(isAllowed({ scope: "recipes", method: "GET", path: "/recipes", search: search.toString() })).toBe(false);
        }
        expect(isAllowed({ scope: "recipes", method: "PATCH", path: "/recipes", search: url.search })).toBe(false);
      }
    },
  );

  it("allows actual SDK public home theme ordering", async () => {
    let allowed = false;
    const client = createClient("http://127.0.0.1:54321", "public-test-key", {
      auth: { persistSession: false },
      global: { fetch: async (input) => {
        allowed = isAllowed({ scope: "recipe-themes", method: "GET", path: "/recipes", search: new URL(String(input)).search });
        return new Response("[]", { headers: { "content-type": "application/json" } });
      } },
    });
    await client.from("recipes")
      .select("id,title,thumbnail_url,tags,base_servings,view_count,like_count,save_count,source_type")
      .eq("visibility", "public").is("deleted_at", null).limit(80)
      .order("view_count", { ascending: false }).order("id", { ascending: true });
    expect(allowed).toBe(true);
  });

  it.each([
    [
      "ingredients",
      "GET",
      "/ingredients",
      "?select=id%2Cstandard_name%2Ccategory%2Ccategory_code&order=standard_name.asc",
      undefined,
    ],
    [
      "ingredients",
      "GET",
      "/ingredient_synonyms",
      "?select=ingredient_id%2Cingredients%21inner%28id%2Cstandard_name%2Ccategory%2Ccategory_code%29&order=ingredient_id.asc",
      undefined,
    ],
    [
      "cooking-methods",
      "GET",
      "/cooking_methods",
      "?select=id%2Ccode%2Clabel%2Ccolor_key%2Ccategory_code%2Cis_system&order=display_order.asc%2Ccreated_at.asc",
      undefined,
    ],
    [
      "cooking-methods",
      "GET",
      "/cooking_method_synonyms",
      "?select=method_code%2Csynonym&is_active=eq.true&order=synonym.asc",
      undefined,
    ],
    [
      "tags",
      "POST",
      "/rpc/list_public_recipe_tags",
      "",
      {
        p_q: null,
        p_kind: null,
        p_theme_eligible: null,
        p_limit: 30,
      },
    ],
    [
      "recipe-themes",
      "POST",
      "/rpc/list_home_theme_recipes",
      "",
      {
        p_tag_limit: 8,
        p_recipes_per_tag: 10,
      },
    ],
    [
      "recipes",
      "POST",
      "/rpc/find_recipe_ids_by_public_tags",
      "",
      {
        p_q: "두부",
        p_tag: null,
      },
    ],
    [
      "recipes",
      "GET",
      "/recipes",
      "?select=id%2Ctitle%2Cthumbnail_url%2Ctags%2Cbase_servings%2Cview_count%2Clike_count%2Csave_count%2Cplan_count%2Ccook_count%2Ccreated_at%2Csource_type&visibility=eq.public&deleted_at=is.null&limit=21&order=view_count.desc&order=id.asc",
      undefined,
    ],
    [
      "recipe-detail",
      "GET",
      "/recipes",
      `?${new URLSearchParams({ select: recipeDetailSelect, id: `eq.${recipeId}` })}`,
      undefined,
    ],
    [
      "recipe-cook-mode",
      "GET",
      "/recipes",
      "?select=id%2Ctitle%2Cbase_servings&id=eq.00000000-0000-4000-8000-000000000001",
      undefined,
    ],
    [
      "recipe-themes",
      "GET",
      "/recipe_steps",
      "?select=recipe_id%2Ccooking_methods%28code%29&recipe_id=in.%2800000000-0000-4000-8000-000000000001%29",
      undefined,
    ],
  ])(
    "allows the exact %s read-only downstream shape",
    (scope, method, path, search, body) => {
      expect(isAllowed({ scope, method, path, search, body })).toBe(true);
    },
  );

  it.each([
    {
      scope: "ingredients",
      method: "HEAD",
      path: "/ingredients",
      search: "?select=id%2Cstandard_name%2Ccategory%2Ccategory_code&order=standard_name.asc",
    },
    {
      scope: "ingredients",
      method: "GET",
      path: "/ingredients",
      search: "?select=*",
    },
    {
      scope: "recipe-themes",
      method: "GET",
      path: "/meals",
      search: "?select=recipe_id",
    },
    {
      scope: "tags",
      method: "POST",
      path: "/rpc/list_public_recipe_tags",
      body: {
        p_q: null,
        p_kind: null,
        p_theme_eligible: null,
        p_limit: 1000,
      },
    },
    {
      scope: "cooking-methods",
      method: "PATCH",
      path: "/cooking_methods",
      search: "?id=eq.1",
    },
    {
      scope: "ingredients",
      method: "GET",
      path: "/users",
      search: "?select=id",
    },
    {
      scope: "recipes",
      method: "GET",
      path: "/recipes",
      search: "?select=id,created_by&visibility=eq.public&deleted_at=is.null&limit=21&order=view_count.desc&order=id.asc",
    },
    {
      scope: "recipe-detail",
      method: "GET",
      path: "/recipes",
      search: "?select=id,title",
    },
    {
      scope: "recipe-themes",
      method: "GET",
      path: "/recipe_ingredients",
      search: "?select=recipe_id,ingredient_id",
    },
    {
      scope: "recipes",
      method: "POST",
      path: "/rpc/find_recipe_ids_by_public_tags",
      body: {
        p_q: null,
        p_tag: null,
        p_private: true,
      },
    },
  ])("rejects private, mutation, wildcard, and widened query shapes", (input) => {
    expect(isAllowed(input)).toBe(false);
  });
});
