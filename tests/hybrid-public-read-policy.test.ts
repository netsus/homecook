import { describe, expect, it } from "vitest";

import { isAnonymousHybridPublicReadRequest } from
  "@/lib/server/hybrid-auth/public-read-policy";

function isAllowed(input: Record<string, unknown>) {
  return isAnonymousHybridPublicReadRequest(input as never);
}

describe("hybrid anonymous public read policy", () => {
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
      "?select=id%2Ctitle%2Cdescription%2Cthumbnail_url%2Cbase_servings%2Ctags%2Csource_type%2Ccreated_by%2Cview_count%2Clike_count%2Csave_count%2Cplan_count%2Ccook_count&id=eq.00000000-0000-4000-8000-000000000001",
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
