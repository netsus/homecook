import { createClient } from "@supabase/supabase-js";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { prepareRecipeNutritionSnapshot } from "@/lib/server/recipe-nutrition-service";

const recipeId = "550e8400-e29b-41d4-a716-446655440002";
const recipe = {
  id: recipeId,
  base_servings: 2,
  updated_at: "2026-10-17T00:00:00Z",
  created_by: "550e8400-e29b-41d4-a716-446655440001",
  revision: 1,
};
const ingredient = {
  id: "550e8400-e29b-41d4-a716-446655440003",
  ingredient_id: "550e8400-e29b-41d4-a716-446655440004",
  amount: 100,
  unit: "g",
  ingredient_type: "QUANT",
  scalable: true,
  sort_order: 0,
  quantity_input: null,
  food_product_id: null,
  food_product_nutrition_version_id: null,
};

function ownerClient(recipeRow: unknown = recipe, ingredientRows: unknown[] = [ingredient]) {
  const requests: Array<{ path: string; query: URLSearchParams; method: string }> = [];
  const fetchRead = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    requests.push({ path: url.pathname, query: url.searchParams, method: init?.method ?? "GET" });
    const data = url.pathname.endsWith("/rpc/build_recipe_nutrition_input_guard")
      ? { recipe_ingredients: [] }
      : url.pathname.endsWith("/recipes") ? recipeRow
      : url.pathname.endsWith("/recipe_ingredients") ? ingredientRows : [];
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  });
  const client = createClient("http://nutrition-owner.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchRead },
  });
  return { client, requests };
}

describe("nutrition owner native query contract", () => {
  it("reads real SDK table/select stages and preserves the exact owner row projection", async () => {
    const { client, requests } = ownerClient();
    const typedClient: Parameters<typeof prepareRecipeNutritionSnapshot>[0] = client;
    const projection = typedClient.from("recipes").select("id, base_servings, updated_at")
      .eq("id", recipeId).maybeSingle();
    expectTypeOf<Awaited<typeof projection>["data"]>().toEqualTypeOf<{
      id: string; base_servings: number; updated_at: string;
    } | null>();
    expect(projection.then).toBeTypeOf("function");
    const prepared = await prepareRecipeNutritionSnapshot(typedClient, recipeId);

    expect(prepared.expectedRecipeVersion).toBe(recipe.updated_at);
    expect(prepared.calculation).toMatchObject({ base_servings: 2 });
    const recipeRead = requests.find(row => row.path.endsWith("/recipes"));
    expect(recipeRead?.query.get("select")).toBe("id,base_servings,updated_at,created_by,revision");
    expect(recipeRead?.query.get("id")).toBe(`eq.${recipeId}`);
    const ingredientRead = requests.find(row => row.path.endsWith("/recipe_ingredients"));
    expect(ingredientRead?.query.get("select")).toBe("id,ingredient_id,amount,unit,ingredient_type,scalable,sort_order,quantity_input,food_product_id,food_product_nutrition_version_id");
    expect(ingredientRead?.query.get("recipe_id")).toBe(`eq.${recipeId}`);
    expect(ingredientRead?.query.get("order")).toBe("sort_order.asc");
    expect(requests.filter(row => row.method !== "GET").map(row => row.path))
      .toEqual(["/rest/v1/rpc/build_recipe_nutrition_input_guard"]);
  });

  it.each([
    { name: "missing recipe", row: null, rows: [ingredient] },
    { name: "invalid servings", row: { ...recipe, base_servings: 0 }, rows: [ingredient] },
    { name: "missing version", row: { ...recipe, updated_at: "" }, rows: [ingredient] },
    { name: "invalid ingredient", row: recipe, rows: [{ ...ingredient, amount: -1 }] },
  ])("preserves rejection for $name without a snapshot write", async ({ row, rows }) => {
    const { client, requests } = ownerClient(row, rows);
    await expect(prepareRecipeNutritionSnapshot(client, recipeId))
      .rejects.toMatchObject({ code: "INVALID_RECIPE_NUTRITION_INPUT" });
    expect(requests.every(request => request.method === "GET")).toBe(true);
  });
});
