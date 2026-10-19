import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { GET, type CookModeDbClient } from "@/app/api/v1/cooking/sessions/[session_id]/cook-mode/route";
import { USER_BOOTSTRAP_VERSION } from "@/lib/server/user-bootstrap";
import { COOK_MODE_STEP_SELECT_WITH_METHODS, COOK_MODE_STEP_SELECT_LEGACY } from "@/lib/server/recipe-step-method-select";
import type { CookingStepRow } from "@/lib/server/cooking";

const mocks = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route }));
const owner = "550e8400-e29b-41d4-a716-446655440001";
const sessionId = "550e8400-e29b-41d4-a716-446655440002";
const recipeId = "550e8400-e29b-41d4-a716-446655440003";
const snapshotId = "550e8400-e29b-41d4-a716-446655440004";
const ingredient = { ingredient_id: "ingredient-1", amount: 100, unit: "g", display_text: "소금 100g", ingredient_type: "QUANT" };
const step = { step_number: 2, instruction: "두 번째", cooking_methods: [{ code: "boil", label: "끓이기", color_key: "red" }] };
type Options = {
  legacy?: boolean; legacyMethods?: boolean; guest?: boolean; foreign?: boolean; closed?: boolean;
  missing?: boolean; missingMeals?: boolean; broken?: boolean; arrayJoin?: boolean;
  ingredients?: unknown; steps?: unknown;
};
function fixture(options: Options = {}) {
  const requests: URL[] = [];
  let stepReads = 0;
  const snapshot = { id: snapshotId, recipe_id: recipeId, title: "저장 당시 제목", base_servings: 2,
    ingredients_json: Object.hasOwn(options, "ingredients") ? options.ingredients : [ingredient],
    steps_json: Object.hasOwn(options, "steps") ? options.steps : [step] };
  const sdk = createClient("http://session-mode-contract.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input)); requests.push(url);
      expect(init?.method ?? "GET").toBe("GET");
      const table = url.pathname.split("/").at(-1);
      let data: unknown; let status = 200;
      if (table === "users") data = [{ id: owner, nickname: "fixture", email: null, profile_image_url: null,
        settings_json: { user_bootstrap_version: USER_BOOTSTRAP_VERSION } }];
      else if (table === "cooking_sessions") data = options.missing ? null : {
        id: sessionId, user_id: options.foreign ? "foreign" : owner, status: options.closed ? "completed" : "in_progress",
        contract_version: options.legacy ? "legacy_v1" : "snapshot_v2", session_kind: "planner",
        recipe_id: recipeId, recipe_content_snapshot_id: options.legacy ? null : snapshotId, cooking_servings: 4,
        recipe_content_snapshots: options.broken || options.legacy ? null : options.arrayJoin ? [snapshot] : snapshot,
      };
      else if (table === "cooking_session_meals") data = options.missingMeals ? [] : [{ meal_id: "meal-1", recipe_id: recipeId, cooking_servings: 4 }];
      else if (table === "ingredients") data = [{ id: "ingredient-1", standard_name: "소금" }, { id: "ingredient-2", standard_name: "후추" }];
      else if (table === "recipes") data = { id: recipeId, title: "현재 제목", base_servings: 2 };
      else if (table === "recipe_ingredients") data = [{ ...ingredient, scalable: true, sort_order: 0,
        quantity_input: null, component_label: null, food_product_id: null, food_product_nutrition_version_id: null,
        ingredients: { standard_name: "소금" } }];
      else if (table === "recipe_steps") {
        stepReads++;
        if (options.legacyMethods && stepReads === 1) {
          status = 400; data = { code: "PGRST200", message: "recipe_step_cooking_methods relationship missing" };
        } else data = [{ ...step, cooking_methods: step.cooking_methods[0], ingredients_used: [],
          component_label: null, heat_level: null, duration_seconds: null, duration_text: null,
          ...(!options.legacyMethods ? { recipe_step_cooking_methods: [{ position: 1, cooking_methods: step.cooking_methods[0] }] } : {}) }];
      } else throw new Error(`Unexpected request: ${table}`);
      return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    } },
  });
  const client: CookModeDbClient = sdk;
  mocks.route.mockResolvedValue({ from: sdk.from.bind(sdk), auth: { getUser: async () => ({
    data: { user: options.guest ? null : { id: owner, app_metadata: {}, user_metadata: {} } }, error: null,
  }) } });
  return { client, requests };
}
const get = () => GET(new NextRequest(`http://localhost/api/v1/cooking/sessions/${sessionId}/cook-mode`), {
  params: Promise.resolve({ session_id: sessionId }),
});

describe("session cook-mode native rows and snapshot JSON boundary", () => {
  beforeEach(() => vi.resetAllMocks());
  it("infers nullable snapshot FK and unknown JSON, with current and legacy native step joins", () => {
    const { client } = fixture();
    const selected = client.from("cooking_sessions").select("recipe_content_snapshots(ingredients_json,steps_json)").maybeSingle();
    type Snapshot = NonNullable<NonNullable<Awaited<typeof selected>["data"]>["recipe_content_snapshots"]>;
    expectTypeOf<Snapshot["ingredients_json"]>().toBeUnknown();
    expectTypeOf<Snapshot["steps_json"]>().toBeUnknown();
    expectTypeOf<NonNullable<Awaited<typeof selected>["data"]>["recipe_content_snapshots"]>().toEqualTypeOf<Snapshot | null>();
    const modern = client.from("recipe_steps").select(COOK_MODE_STEP_SELECT_WITH_METHODS);
    const legacy = client.from("recipe_steps").select(COOK_MODE_STEP_SELECT_LEGACY);
    expectTypeOf<Awaited<typeof modern>["data"]>().toExtend<CookingStepRow[] | null>();
    expectTypeOf<Awaited<typeof legacy>["data"]>().toExtend<CookingStepRow[] | null>();
    expect(modern.then).toBeTypeOf("function");
    expect(legacy.then).toBeTypeOf("function");
    expect(selected.then).toBeTypeOf("function");
  });
  it.each([false, true])("preserves snapshot=%s and exact owner/session read filters", async snapshot => {
    const { requests } = fixture({ legacy: !snapshot }); const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, error: null, data: { session_id: sessionId, recipe: {
      title: snapshot ? "저장 당시 제목" : "현재 제목", cooking_servings: 4,
      ingredients: [{ ingredient_id: "ingredient-1", amount: 200, scalable: true }], steps: [{ step_number: 2 }],
    } } });
    expect(requests.slice(0, 4).map(url => url.pathname.split("/").at(-1))).toEqual(["users", "users", "cooking_sessions", "cooking_session_meals"]);
    expect(requests[2].searchParams.get("id")).toBe(`eq.${sessionId}`);
    expect(requests[3].searchParams.get("session_id")).toBe(`eq.${sessionId}`);
    if (snapshot) expect(requests.some(url => /\/(?:recipes|recipe_ingredients|recipe_steps)$/u.test(url.pathname))).toBe(false);
    else {
      expect(requests.find(url => url.pathname.endsWith("/recipe_ingredients"))?.searchParams.get("order")).toBe("sort_order.asc");
      expect(requests.find(url => url.pathname.endsWith("/recipe_steps"))?.searchParams.get("order")).toBe("step_number.asc");
    }
  });
  it("preserves legacy optional defaults, original array order and ignored invalid quantity proof", async () => {
    fixture({ ingredients: [{ ...ingredient, sort_order: 9, quantity_input: { invalid: true } },
      { ...ingredient, ingredient_id: "ingredient-2", amount: 10, sort_order: 0 }], steps: [step, { step_number: 1, instruction: "첫 번째" }] });
    const response = await get(); expect(response.status).toBe(200); const body = await response.json();
    expect(body.data.recipe.ingredients.map((row: { ingredient_id: string }) => row.ingredient_id)).toEqual(["ingredient-1", "ingredient-2"]);
    expect(body.data.recipe.ingredients[0]).not.toHaveProperty("quantity_input");
    expect(body.data.recipe.ingredients[0].scalable).toBe(true);
    expect(body.data.recipe.steps.map((row: { step_number: number }) => row.step_number)).toEqual([2, 1]);
    expect(body.data.recipe.steps[1]).toMatchObject({ heat_level: null, duration_seconds: null, duration_text: null, ingredients_used: [] });
  });
  it("keeps frozen product identity/name without generic ingredient or current product reads", async () => {
    const { requests } = fixture({ ingredients: [{ ...ingredient, ingredient_id: null, row_key: "row-1",
      source_kind: "food_product", food_product_id: "product-1", food_product_nutrition_version_id: "version-1",
      food_product_name: "저장 제품", food_product_brand: "저장 업체" }] });
    const response = await get(); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { recipe: { ingredients: [{ ingredient_id: null,
      food_product_id: "product-1", food_product_nutrition_version_id: "version-1", standard_name: "저장 업체 · 저장 제품" }] } } });
    expect(requests.some(url => url.pathname.endsWith("/ingredients") || url.pathname.endsWith("/food_products"))).toBe(false);
  });
  it.each([null, undefined])("preserves nullish JSON defaults (%s)", async value => {
    fixture({ ingredients: value, steps: value }); const response = await get(); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { recipe: { ingredients: [], steps: [] } } });
  });
  it("preserves the first-row array relation compatibility", async () => {
    fixture({ arrayJoin: true }); expect((await get()).status).toBe(200);
  });
  it.each([
    { ingredients: {} }, { ingredients: [null] }, { ingredients: [{ ...ingredient, amount: "100" }] },
    { steps: {} }, { steps: [null] }, { steps: [{ ...step, cooking_methods: {} }] },
  ])("wraps malformed snapshot JSON as INTERNAL_ERROR (%j)", async options => {
    const { requests } = fixture(options); const response = await get();
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ success: false, data: null, error: { code: "INTERNAL_ERROR", fields: [] } });
    expect(requests.some(url => url.pathname.endsWith("/ingredients"))).toBe(false);
  });
  it.each([
    { options: { guest: true }, status: 401 }, { options: { foreign: true }, status: 403 },
    { options: { closed: true }, status: 409 }, { options: { missing: true }, status: 404 },
    { options: { missingMeals: true }, status: 500 }, { options: { broken: true }, status: 500 },
  ])("preserves access/state/error guard (%j)", async ({ options, status }) => {
    fixture(options); expect((await get()).status).toBe(status);
  });
  it("preserves legacy missing-method relation fallback", async () => {
    const { requests } = fixture({ legacy: true, legacyMethods: true }); expect((await get()).status).toBe(200);
    const reads = requests.filter(url => url.pathname.endsWith("/recipe_steps")); expect(reads).toHaveLength(2);
    expect(reads[1].searchParams.get("select")).not.toContain("recipe_step_cooking_methods");
  });
});
