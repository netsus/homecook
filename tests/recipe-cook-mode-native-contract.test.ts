import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { StandaloneCookModeDbClient } from "@/app/api/v1/recipes/[id]/cook-mode/route";
import type { CookingIngredientRow, CookingStepRow } from "@/lib/server/cooking";
import { COOK_MODE_STEP_SELECT_LEGACY, COOK_MODE_STEP_SELECT_WITH_METHODS } from "@/lib/server/recipe-step-method-select";

const { createRouteHandlerClient } = vi.hoisted(() => ({ createRouteHandlerClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient, createRecipeFuturePropagationInternalClient: () => null }));

const recipeId = "550e8400-e29b-41d4-a716-446655440101";
const rowId = "550e8400-e29b-41d4-a716-446655440102";
const baseColumns = "id,source_kind,ingredient_id,amount,unit,display_text,component_label,ingredient_type,scalable,sort_order,ingredients(standard_name)";

function fixture(options: { authenticated?: boolean; legacy?: boolean; product?: boolean; missing?: boolean; fail?: boolean } = {}) {
  const requests: Array<{ url: URL; method: string }> = [];
  let stepReads = 0;
  const client = createClient("http://recipe-cooking.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push({ url, method: init?.method ?? "GET" });
      const table = url.pathname.split("/").at(-1);
      let status = 200;
      let data: unknown;
      if (table === "recipes") data = options.missing ? null : { id: recipeId, title: "김치찌개", base_servings: 2 };
      else if (table === "recipe_ingredients") {
        const row = { id: rowId, source_kind: options.product ? "food_product" : "ingredient",
          ingredient_id: options.product ? null : "ingredient-1", amount: 100, unit: "g",
          display_text: "재료", component_label: null, ingredient_type: "QUANT", scalable: true, sort_order: 1,
          ingredients: options.product ? null : { standard_name: "김치" }, quantity_input: null,
          food_product_id: options.product ? "product-1" : null,
          food_product_nutrition_version_id: options.product ? "version-1" : null,
        };
        const select = url.searchParams.get("select") ?? "";
        data = [Object.fromEntries(Object.entries(row).filter(([key]) => select.includes(key)))];
        if (options.fail) { status = 500; data = { code: "XX000", message: "ingredients failed" }; }
      } else if (table === "recipe_steps") {
        stepReads++;
        if (options.legacy && stepReads === 1) {
          status = 400; data = { code: "PGRST200", message: "recipe_step_cooking_methods relationship missing" };
        } else {
          const method = { code: "stir_fry", label: "볶기", color_key: "red", category_code: "dry_heat" };
          data = [{ step_number: 1, instruction: "볶아주세요", component_label: null, ingredients_used: [],
            heat_level: "medium", duration_seconds: 60, duration_text: null, cooking_methods: method,
            ...(!options.legacy ? { recipe_step_cooking_methods: [{ position: 1, cooking_methods: method }] } : {}),
          }];
        }
      } else if (table === "read_public_recipe_product_sources") data = options.product ? [{ row_key: rowId,
        food_product_id: "product-1", food_product_nutrition_version_id: "version-1", food_product_name: "김치", food_product_brand: "상표" }] : [];
      else if (table === "food_products") data = [{ id: "product-1", name: "김치", brand: "상표" }];
      else throw new Error(`unexpected request: ${url.pathname}`);
      return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    } },
  });
  createRouteHandlerClient.mockResolvedValue({ from: client.from.bind(client), rpc: client.rpc.bind(client),
    auth: { getUser: async () => ({ data: { user: options.authenticated ? { id: "viewer" } : null }, error: null }) } });
  return requests;
}

async function get(servings = "4") {
  const { GET } = await import("@/app/api/v1/recipes/[id]/cook-mode/route");
  return GET(new Request(`http://localhost/api/v1/recipes/${recipeId}/cook-mode?servings=${servings}`), {
    params: Promise.resolve({ id: recipeId }),
  });
}

describe("standalone native cook-mode read contract", () => {
  beforeEach(() => createRouteHandlerClient.mockReset());

  it("infers the native ingredient and current/legacy method joins without casts", () => {
    const client: StandaloneCookModeDbClient = createClient("http://recipe-cooking.invalid", "public-test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const publicRows = client.from("recipe_ingredients").select("id, source_kind, ingredient_id, amount, unit, display_text, component_label, ingredient_type, scalable, sort_order, ingredients(standard_name)");
    const authRows = client.from("recipe_ingredients").select("id, source_kind, ingredient_id, amount, unit, display_text, component_label, ingredient_type, scalable, sort_order, ingredients(standard_name), food_product_id, food_product_nutrition_version_id, quantity_input");
    const current = client.from("recipe_steps").select(COOK_MODE_STEP_SELECT_WITH_METHODS);
    const legacy = client.from("recipe_steps").select(COOK_MODE_STEP_SELECT_LEGACY);
    expectTypeOf<Awaited<typeof publicRows>["data"]>().toExtend<CookingIngredientRow[] | null>();
    expectTypeOf<Awaited<typeof authRows>["data"]>().toExtend<CookingIngredientRow[] | null>();
    expectTypeOf<Awaited<typeof current>["data"]>().toExtend<CookingStepRow[] | null>();
    expectTypeOf<Awaited<typeof legacy>["data"]>().toExtend<CookingStepRow[] | null>();
    expectTypeOf<NonNullable<Awaited<typeof publicRows>["data"]>[number]["ingredients"]>().toEqualTypeOf<{ standard_name: string } | null>();
    expectTypeOf<keyof NonNullable<Awaited<typeof current>["data"]>[number]["recipe_step_cooking_methods"][number]>().toEqualTypeOf<"position" | "cooking_methods">();
    expect(publicRows.then).toBeTypeOf("function");
    expect(authRows.then).toBeTypeOf("function");
    expect(current.then).toBeTypeOf("function");
    expect(legacy.then).toBeTypeOf("function");
  });

  it.each([false, true])("preserves native projections, scaling and method joins (authenticated=%s)", async authenticated => {
    const requests = fixture({ authenticated });
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, error: null, data: { recipe: {
      id: recipeId, cooking_servings: 4, ingredients: [{ amount: 200, unit: "g", standard_name: "김치" }],
      steps: [{ step_number: 1, instruction: "볶아주세요" }],
    } } });
    const ingredients = requests.find(({ url }) => url.pathname.endsWith("/recipe_ingredients"));
    expect(ingredients?.method).toBe("GET");
    expect(Object.fromEntries(ingredients!.url.searchParams)).toEqual({
      select: baseColumns + (authenticated ? ",food_product_id,food_product_nutrition_version_id,quantity_input" : ""),
      recipe_id: `eq.${recipeId}`, order: "sort_order.asc",
    });
    const steps = requests.find(({ url }) => url.pathname.endsWith("/recipe_steps"));
    expect(steps?.url.searchParams.get("select")).toContain("recipe_step_cooking_methods(position,cooking_methods(");
    expect(steps?.url.searchParams.get("order")).toBe("step_number.asc");
    expect(createRouteHandlerClient).toHaveBeenCalledExactlyOnceWith({ anonymousPublicReadScope: "recipe-cook-mode" });
  });

  it("preserves the missing relation fallback query", async () => {
    const requests = fixture({ legacy: true });
    expect((await get()).status).toBe(200);
    const steps = requests.filter(({ url }) => url.pathname.endsWith("/recipe_steps"));
    expect(steps).toHaveLength(2);
    expect(steps[1].url.searchParams.get("select")).not.toContain("recipe_step_cooking_methods");
    expect(steps[1].url.searchParams.get("recipe_id")).toBe(`eq.${recipeId}`);
    expect(steps[1].url.searchParams.get("order")).toBe("step_number.asc");
  });

  it.each([false, true])("keeps product-only rows and null ingredient joins (authenticated=%s)", async authenticated => {
    const requests = fixture({ authenticated, product: true });
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { recipe: { ingredients: [{
      ingredient_id: null, food_product_id: "product-1", standard_name: "상표 · 김치", amount: 200,
    }] } } });
    expect(requests.some(({ url }) => url.pathname.endsWith("/food_products"))).toBe(authenticated);
  });

  it("preserves query failure and missing recipe wrappers", async () => {
    fixture({ fail: true });
    const failed = await get();
    expect(failed.status).toBe(500);
    expect(await failed.json()).toMatchObject({ success: false, data: null, error: { code: "INTERNAL_ERROR", fields: [] } });
    fixture({ missing: true });
    expect((await get()).status).toBe(404);
  });

  it("rejects invalid servings before creating a client", async () => {
    expect((await get("0")).status).toBe(422);
    expect(createRouteHandlerClient).not.toHaveBeenCalled();
  });
});
