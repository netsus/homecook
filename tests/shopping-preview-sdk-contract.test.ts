import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { GET, type ShoppingPreviewDbClient } from "@/app/api/v1/shopping/preview/route";
import { USER_BOOTSTRAP_VERSION } from "@/lib/server/user-bootstrap";

const mocks = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createRouteHandlerClient: mocks.route }));
const owner = "550e8400-e29b-41d4-a716-446655440001";
const meal = "550e8400-e29b-41d4-a716-446655440002";
const recipe = "550e8400-e29b-41d4-a716-446655440003";
const column = "550e8400-e29b-41d4-a716-446655440004";
const snapshot = "550e8400-e29b-41d4-a716-446655440005";
type Mode = "snapshot" | "legacy" | "empty" | "broken" | "guest" | "meals-error" | "recipes-error" | "columns-error";

function fixture(mode: Mode = "snapshot") {
  const requests: URL[] = [];
  const sdk = createClient("http://shopping-preview-contract.invalid", "public-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push(url);
      expect(init?.method ?? "GET").toBe("GET");
      const table = url.pathname.split("/").at(-1);
      let data: unknown;
      if (table === "users") data = [{ id: owner, nickname: "fixture", email: null, profile_image_url: null,
        settings_json: { user_bootstrap_version: USER_BOOTSTRAP_VERSION } }];
      else if (table === "meals") data = mode === "empty" ? [] : [{ id: meal, recipe_id: recipe, column_id: column,
        recipe_content_snapshot_id: mode === "legacy" ? null : snapshot,
        recipe_content_snapshots: mode === "legacy" || mode === "broken" ? null : { title: "고정 제목" },
        plan_date: "2026-10-20", planned_servings: 2, status: "registered", shopping_list_id: null, created_at: "2026-10-19T12:00:00Z" }];
      else if (table === "recipes") data = [{ id: recipe, title: "현재 제목", thumbnail_url: null }];
      else if (table === "meal_plan_columns") data = [{ id: column, name: "저녁" }];
      else throw new Error(`unexpected fixture table: ${table}`);
      const failed = (table === "meals" && mode === "meals-error") || (table === "recipes" && mode === "recipes-error")
        || (table === "meal_plan_columns" && mode === "columns-error");
      return new Response(JSON.stringify(failed ? { code: "42501", message: "fixture denied" } : data), {
        status: failed ? 403 : 200, headers: { "content-type": "application/json" },
      });
    } },
  });
  const client: ShoppingPreviewDbClient = sdk;
  mocks.route.mockResolvedValue({ from: sdk.from.bind(sdk), auth: { getUser: async () => ({
    data: { user: mode === "guest" ? null : { id: owner, app_metadata: {}, user_metadata: {} } }, error: null,
  }) } });
  return { client, requests };
}

describe("shopping preview native projection contract", () => {
  beforeEach(() => vi.resetAllMocks());
  it("infers exact selected fields, real meal enum and nullable snapshot FK object", () => {
    const { client } = fixture();
    const meals = client.from("meals").select("id, status, shopping_list_id, recipe_content_snapshot_id, recipe_content_snapshots(title)");
    expectTypeOf<Awaited<typeof meals>["data"]>().toEqualTypeOf<Array<{ id: string;
      status: "registered" | "shopping_done" | "cook_done"; shopping_list_id: string | null;
      recipe_content_snapshot_id: string | null; recipe_content_snapshots: { title: string } | null;
    }> | null>();
    expect(meals.then).toBeTypeOf("function");
  });
  it.each<Mode>(["snapshot", "legacy", "empty", "broken", "guest", "meals-error", "recipes-error", "columns-error"])("preserves %s filters, pinned title and failure boundaries", async mode => {
    const { requests } = fixture(mode);
    const response = await GET();
    const success = mode === "snapshot" || mode === "legacy" || mode === "empty" || mode === "columns-error";
    expect(response.status).toBe(success ? 200 : mode === "guest" ? 401 : 500);
    const result = await response.json();
    if (mode === "empty") expect(result).toEqual({ success: true, data: { eligible_meals: [], recipes: [] }, error: null });
    else if (success) {
      expect(result.data.eligible_meals).toEqual([expect.objectContaining({ id: meal, recipe_name: mode === "legacy" ? "현재 제목" : "고정 제목",
        column_name: mode === "columns-error" ? null : "저녁", planned_servings: 2 })]);
      expect(result.data.recipes).toEqual([expect.objectContaining({ recipe_id: recipe, recipe_name: mode === "legacy" ? "현재 제목" : "고정 제목",
        meal_ids: [meal], planned_servings_total: 2, shopping_servings: 2, is_selected: true })]);
    } else expect(result).toMatchObject({ success: false, data: null, error: { fields: [] } });
    const tables = requests.map(url => url.pathname.split("/").at(-1));
    expect(tables).toEqual(mode === "guest" ? [] : mode === "empty" || mode === "broken" || mode === "meals-error"
      ? ["users", "users", "meals"] : mode === "recipes-error" ? ["users", "users", "meals", "recipes"]
      : ["users", "users", "meals", "recipes", "meal_plan_columns"]);
    if (mode === "guest") return;
    expect(Object.fromEntries(requests[2].searchParams)).toEqual({
      select: "id,recipe_id,recipe_content_snapshot_id,recipe_content_snapshots(title),column_id,plan_date,planned_servings,status,shopping_list_id,created_at",
      user_id: `eq.${owner}`, status: "eq.registered", shopping_list_id: "is.null", order: "created_at.asc,id.asc",
    });
    if (requests[3]) expect(Object.fromEntries(requests[3].searchParams)).toEqual({ select: "id,title,thumbnail_url", id: `in.(${recipe})` });
    if (requests[4]) expect(Object.fromEntries(requests[4].searchParams)).toEqual({ select: "id,name", user_id: `eq.${owner}`, id: `in.(${column})` });
  });
});
