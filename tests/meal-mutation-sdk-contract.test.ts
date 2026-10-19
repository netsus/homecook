import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { MealsDbClient } from "@/app/api/v1/meals/[meal_id]/route";
import type { MealsDbClient as MealsCollectionDbClient } from "@/app/api/v1/meals/route";

const id = "550e8400-e29b-41d4-a716-446655440001";
describe("meal mutation native read contract", () => {
  it("preserves slot-scoped list ordering, recipe lookup and product RPC args", async () => {
    const requests: Array<{ url: URL; body: unknown }> = [];
    const sdk = createClient("http://meals-sdk.invalid", "fixture", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input, init) => {
        requests.push({ url: new URL(input instanceof Request ? input.url : String(input)),
          body: init?.body ? JSON.parse(String(init.body)) : null });
        return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
      } },
    });
    const db: MealsCollectionDbClient = sdk;
    const columns = "id, recipe_id, planned_servings, status, shopping_list_id, is_leftover, created_at, revision, recipe_content_snapshot_id, recipe_content_snapshots(title)";
    await db.from("meals").select(columns).eq("user_id", id).eq("plan_date", "2026-10-20")
      .eq("column_id", id).order("created_at", { ascending: true }).order("id", { ascending: true });
    await db.from("recipes").select("id").eq("id", id).maybeSingle();
    const args = { p_user_id: id, p_start_date: "2026-10-20", p_end_date: "2026-10-20", p_column_id: id };
    await db.rpc("list_product_planner_entries", args);
    expect(Object.fromEntries(requests[0].url.searchParams)).toEqual({ select: columns.replaceAll(" ", ""),
      user_id: `eq.${id}`, plan_date: "eq.2026-10-20", column_id: `eq.${id}`, order: "created_at.asc,id.asc" });
    expect(Object.fromEntries(requests[1].url.searchParams)).toEqual({ select: "id", id: `eq.${id}` });
    expect(requests[2].url.pathname).toBe("/rest/v1/rpc/list_product_planner_entries");
    expect(requests[2].body).toEqual(args);
  });
  it.each([false, true])("preserves selected owner/state read and native denial=%s", async denied => {
    const requests: URL[] = [];
    const sdk = createClient("http://meal-sdk.invalid", "fixture", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async input => {
        requests.push(new URL(input instanceof Request ? input.url : String(input)));
        return new Response(JSON.stringify(denied ? { code: "42501", message: "fixture denied" }
          : [{ id, user_id: id, planned_servings: 2, status: "registered" }]), {
          status: denied ? 403 : 200, headers: { "content-type": "application/json" },
        });
      } },
    });
    const db: MealsDbClient = sdk;
    expect(db).toBe(sdk);
    const result = await db.from("meals").select("id, user_id, planned_servings, status").eq("id", id).maybeSingle();
    expect(result).toMatchObject(denied ? { data: null, error: { code: "42501" } }
      : { data: { id, user_id: id, planned_servings: 2, status: "registered" }, error: null });
    expect(requests).toHaveLength(1);
    expect(requests[0].pathname).toBe("/rest/v1/meals");
    expect(Object.fromEntries(requests[0].searchParams)).toEqual({ select: "id,user_id,planned_servings,status", id: `eq.${id}` });
  });
});
