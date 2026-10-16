import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeRecipeListCursor } from "@/lib/recipe-list";

const { createRouteHandlerClient } = vi.hoisted(() => ({ createRouteHandlerClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient }));

const recipe = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  title: "native search row",
  thumbnail_url: null,
  tags: ["한식"],
  base_servings: 2,
  view_count: 10,
  like_count: 1,
  save_count: 2,
  plan_count: 3,
  cook_count: 4,
  created_at: "2026-06-17T00:00:00.000Z",
  source_type: "manual",
};
const columns = "id,title,thumbnail_url,tags,base_servings,view_count,like_count,save_count,plan_count,cook_count,created_at,source_type";

function nativeFixture(options: { nullRows?: boolean; failAt?: "recipes" | "find_recipe_ids_by_public_tags" } = {}) {
  const requests: Array<{ url: URL; method: string; body: unknown }> = [];
  const fetchRead = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET";
    requests.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    const resource = url.pathname.split("/").at(-1);
    const failed = resource === options.failAt;
    let data: unknown;
    if (failed) data = { code: "XX000", message: "fixture read failure" };
    else if (resource === "recipes") data = options.nullRows ? null : [recipe];
    else if (resource === "find_recipe_ids_by_public_tags" || resource === "find_public_recipe_ids_by_product_name") {
      data = [{ recipe_id: recipe.id }, { recipe_id: recipe.id }];
    } else if (["ingredients", "ingredient_synonyms", "ingredient_catalog_aliases"].includes(resource ?? "")) data = [];
    else throw new Error(`unexpected native request: ${method} ${url.pathname}`);
    return new Response(JSON.stringify(data), {
      status: failed ? 500 : 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  const client = createClient("http://recipe-search.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchRead },
  });
  createRouteHandlerClient.mockResolvedValue(client);
  return { requests };
}

async function get(search: string) {
  const { GET } = await import("@/app/api/v1/recipes/route");
  return GET(new NextRequest(`http://localhost:3000/api/v1/recipes?${search}`));
}

describe("recipe discovery native query contract", () => {
  beforeEach(() => { createRouteHandlerClient.mockReset(); });

  it.each(["latest", "view_count"] as const)("preserves %s cursor direction, selected fields and public filters", async (sort) => {
    const { requests } = nativeFixture();
    const cursor = encodeRecipeListCursor({ sort, recipe });
    const response = await get(new URLSearchParams({ sort, cursor, limit: "1" }).toString());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true, data: { items: [{ id: recipe.id, tags: ["한식"] }], has_next: false }, error: null,
    });
    expect(createRouteHandlerClient).toHaveBeenCalledExactlyOnceWith({ anonymousPublicReadScope: "recipes" });
    expect(requests).toHaveLength(1);
    const { url, method } = requests[0];
    expect(method).toBe("GET");
    expect(url.pathname).toBe("/rest/v1/recipes");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      select: columns, visibility: "eq.public", deleted_at: "is.null", limit: "2",
      order: sort === "latest" ? "created_at.desc,id.desc" : "view_count.desc,id.asc",
      or: sort === "latest"
        ? `(created_at.lt.${recipe.created_at},and(created_at.eq.${recipe.created_at},id.lt.${recipe.id}))`
        : `(view_count.lt.10,and(view_count.eq.10,id.gt.${recipe.id}))`,
    });
  });

  it("preserves the exact tag RPC arguments and deduped recipe filter", async () => {
    const { requests } = nativeFixture();
    expect((await get("tag=%ED%95%9C%EC%8B%9D")).status).toBe(200);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      method: "POST", body: { p_q: null, p_tag: "한식" },
    });
    expect(requests[0].url.pathname).toBe("/rest/v1/rpc/find_recipe_ids_by_public_tags");
    expect(requests[1].url.searchParams.get("id")).toBe(`in.(${recipe.id})`);
  });

  it("preserves product/tag search RPC bodies and escaped title lookup", async () => {
    const { requests } = nativeFixture();
    expect((await get(new URLSearchParams({ q: "50%_밥" }).toString())).status).toBe(200);
    const rpc = requests.filter(({ method }) => method === "POST");
    expect(rpc).toHaveLength(2);
    expect(rpc.map(({ url, body }) => ({ path: url.pathname, body }))).toEqual(expect.arrayContaining([
      { path: "/rest/v1/rpc/find_recipe_ids_by_public_tags", body: { p_q: "50%_밥", p_tag: null } },
      { path: "/rest/v1/rpc/find_public_recipe_ids_by_product_name", body: { p_q: "50%_밥" } },
    ]));
    const recipeReads = requests.filter(({ url }) => url.pathname === "/rest/v1/recipes");
    expect(recipeReads).toHaveLength(2);
    expect(recipeReads[0].url.searchParams.get("title")).toBe("ilike.%50\\%\\_밥%");
    expect(recipeReads[1].url.searchParams.get("id")).toBe(`in.(${recipe.id})`);
    expect(createRouteHandlerClient.mock.calls).toEqual([
      [{ anonymousPublicReadScope: "recipes" }], [{ anonymousPublicReadScope: "ingredients" }],
    ]);
  });

  it.each(["recipes", "find_recipe_ids_by_public_tags"] as const)("preserves %s failure without a success envelope", async (failAt) => {
    const { requests } = nativeFixture({ failAt });
    const response = await get(failAt === "recipes" ? "" : "tag=test");
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ success: false, data: null, error: { code: "INTERNAL_ERROR" } });
    expect(requests).toHaveLength(1);
  });

  it("preserves an empty list when a successful recipe read has null data", async () => {
    nativeFixture({ nullRows: true });
    const response = await get("");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true, data: { items: [], has_next: false, next_cursor: null }, error: null,
    });
  });
});
