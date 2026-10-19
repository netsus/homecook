import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { GET, type LeftoversDbClient } from "@/app/api/v1/leftovers/route";
import { USER_BOOTSTRAP_VERSION } from "@/lib/server/user-bootstrap";

const mocks = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route }));
vi.mock("@/lib/mock/recipes", () => ({ isQaFixtureModeEnabled: () => false }));

const owner = "550e8400-e29b-41d4-a716-446655440001";
const batch = "550e8400-e29b-41d4-a716-446655440002";
const recipe = "550e8400-e29b-41d4-a716-446655440003";
const snapshot = "550e8400-e29b-41d4-a716-446655440004";
const time = "2026-10-19T10:00:00Z";

function fixture(mode: "source" | "origin" | "nullable" | "broken" | "read-error" | "guest" | "eaten" = "source") {
  const requests: URL[] = [];
  const sdk = createClient("http://leftovers-contract.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push(url);
      expect(init?.method ?? "GET").toBe("GET");
      const table = url.pathname.split("/").at(-1);
      let data: unknown;
      switch (table) {
        case "users": data = [{ id: owner, nickname: "fixture", email: null, profile_image_url: null,
          settings_json: { user_bootstrap_version: USER_BOOTSTRAP_VERSION } }]; break;
        case "leftover_dishes": data = mode === "read-error" ? { code: "42501", message: "fixture denied" } : [{
          id: batch, user_id: owner, recipe_id: recipe, recipe_content_snapshot_id: mode === "nullable" ? null : snapshot,
          status: mode === "eaten" ? "eaten" : "leftover", cooked_at: time,
          eaten_at: mode === "eaten" ? time : null, auto_hide_at: mode === "eaten" ? time : null,
          stale_reviewed_at: null, cooking_servings: 2, weight_status: null,
          batch_status: null, depleted_reason: null,
        }]; break;
        case "recipes": data = [{ id: recipe, title: "current title", thumbnail_url: null }]; break;
        case "recipe_content_snapshots": data = mode === "broken" ? [] : [{ id: snapshot, recipe_id: recipe, title: "frozen title" }]; break;
        case "meals": data = mode === "source" || mode === "eaten"
          ? [{ leftover_dish_id: batch, planned_servings: 3, meal_plan_columns: { name: "점심" } }] : []; break;
        case "cooking_session_meals": data = [{ session_id: batch,
          meals: mode === "nullable" ? null : { planned_servings: 2, meal_plan_columns: mode === "origin" ? { name: "저녁" } : null } }]; break;
        default: throw new Error(`unexpected fixture table: ${table}`);
      }
      return new Response(JSON.stringify(data), {
        status: table === "leftover_dishes" && mode === "read-error" ? 403 : 200,
        headers: { "content-type": "application/json" },
      });
    } },
  });
  const client: LeftoversDbClient = sdk;
  mocks.route.mockResolvedValue({ from: sdk.from.bind(sdk), auth: { getUser: async () => ({
    data: { user: mode === "guest" ? null : { id: owner, app_metadata: {}, user_metadata: {} } }, error: null,
  }) } });
  return { client, requests };
}

describe("leftovers native selected row contract", () => {
  beforeEach(() => vi.resetAllMocks());

  it("infers only selected columns and required-FK many-to-one objects", () => {
    const { client } = fixture();
    const sources = client.from("meals").select("leftover_dish_id, planned_servings, meal_plan_columns(name)");
    const origins = client.from("cooking_session_meals").select("session_id, meals(planned_servings, meal_plan_columns(name))");
    const recipes = client.from("recipes").select("id, title, thumbnail_url");
    type Source = NonNullable<Awaited<typeof sources>["data"]>[number];
    type Origin = NonNullable<Awaited<typeof origins>["data"]>[number];
    expectTypeOf<Source>().toEqualTypeOf<{ leftover_dish_id: string | null; planned_servings: number; meal_plan_columns: { name: string } }>();
    expectTypeOf<Origin>().toEqualTypeOf<{ session_id: string; meals: { planned_servings: number; meal_plan_columns: { name: string } } }>();
    expectTypeOf<NonNullable<Awaited<typeof recipes>["data"]>[number]>().toEqualTypeOf<{ id: string; title: string; thumbnail_url: string | null }>();
    expect(sources.then).toBeTypeOf("function");
    expect(origins.then).toBeTypeOf("function");
    expect(recipes.then).toBeTypeOf("function");
  });

  it.each(["source", "origin", "nullable", "eaten"] as const)("preserves %s projection, owner filters, sorting and fallback", async mode => {
    const { requests } = fixture(mode);
    const response = await GET(new NextRequest(`http://localhost/api/v1/leftovers?status=${mode === "eaten" ? "eaten" : "leftover"}`));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.data.items).toHaveLength(1);
    const item = result.data.items[0];
    expect(item.recipe_title).toBe(mode === "nullable" ? "current title" : "frozen title");
    expect(item.source_meal_label).toBe(mode === "origin" ? "저녁" : mode === "nullable" ? null : "점심");
    expect(item.source_planned_servings).toBe(mode === "origin" ? 2 : mode === "nullable" ? null : 3);
    const byTable = (name: string) => requests.find(url => url.pathname.endsWith(`/${name}`));
    expect(requests.filter(url => url.pathname.endsWith("/users"))).toHaveLength(2);
    for (const request of requests.filter(url => url.pathname.endsWith("/users"))) {
      expect(request.searchParams.get("id")).toBe(`eq.${owner}`);
    }
    expect(byTable("leftover_dishes")?.searchParams.get("user_id")).toBe(`eq.${owner}`);
    expect(byTable("leftover_dishes")?.searchParams.get("select")).toBe("id,user_id,recipe_id,recipe_content_snapshot_id,status,cooked_at,eaten_at,auto_hide_at,stale_reviewed_at,cooking_servings,weight_status,batch_status,depleted_reason");
    expect(byTable("leftover_dishes")?.searchParams.get("order")).toBe(mode === "eaten" ? "eaten_at.desc,id.desc" : "cooked_at.desc,id.desc");
    expect(byTable("leftover_dishes")?.searchParams.get("auto_hide_at")?.startsWith("gt.")).toBe(mode === "eaten" ? true : undefined);
    expect(byTable("leftover_dishes")?.searchParams.get("or")).toContain(mode === "eaten" ? "consumed_unweighed" : "mixed_unweighed");
    expect(byTable("recipes")?.searchParams.get("select")).toBe("id,title,thumbnail_url");
    expect(byTable("recipes")?.searchParams.get("id")).toBe(`in.(${recipe})`);
    if (mode === "nullable") expect(byTable("recipe_content_snapshots")).toBeUndefined();
    else {
      expect(byTable("recipe_content_snapshots")?.searchParams.get("select")).toBe("id,recipe_id,title");
      expect(byTable("recipe_content_snapshots")?.searchParams.get("id")).toBe(`in.(${snapshot})`);
    }
    expect(byTable("meals")?.searchParams.get("select")).toBe("leftover_dish_id,planned_servings,meal_plan_columns(name)");
    expect(byTable("meals")?.searchParams.get("user_id")).toBe(`eq.${owner}`);
    expect(byTable("meals")?.searchParams.get("leftover_dish_id")).toBe(`in.(${batch})`);
    expect(byTable("cooking_session_meals")?.searchParams.get("select")).toBe("session_id,meals(planned_servings,meal_plan_columns(name))");
    expect(byTable("cooking_session_meals")?.searchParams.get("session_id")).toBe(`in.(${batch})`);
    for (const table of ["meals", "cooking_session_meals"]) expect(byTable(table)?.searchParams.get("order")).toBe("cooked_at.desc,id.desc");
  });

  it.each(["guest", "broken", "read-error"] as const)("fails closed for %s without unrelated later reads", async mode => {
    const { requests } = fixture(mode);
    const response = await GET(new NextRequest("http://localhost/api/v1/leftovers"));
    expect(response.status).toBe(mode === "guest" ? 401 : 500);
    expect(await response.json()).toMatchObject({ success: false, data: null, error: { fields: [] } });
    if (mode === "guest") expect(requests).toHaveLength(0);
    else expect(requests.some(url => url.pathname.endsWith("/meals") || url.pathname.endsWith("/cooking_session_meals"))).toBe(false);
  });
});
