import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { PlannerColumnsDbClient } from "@/app/api/v1/planner/columns/shared";

const owner = "550e8400-e29b-41d4-a716-446655440000";
const id = "550e8400-e29b-41d4-a716-446655440001";
const columns = "id, user_id, name, sort_order, created_at";
const row = { id, user_id: owner, name: "아침", sort_order: 0, created_at: "2026-10-20T00:00:00Z" };
function fixture() {
  const requests: Array<{ url: URL; method: string; body: unknown }> = [];
  const sdk = createClient("http://columns-sdk.invalid", "fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? "GET";
      const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url, method, body });
      return new Response(JSON.stringify(method === "GET" ? [row] : row), {
        status: 200, headers: { "content-type": "application/json" },
      });
    } },
  });
  const db: PlannerColumnsDbClient = sdk;
  return { db, sdk, requests };
}

describe("planner columns native SDK contract", () => {
  it("keeps owned list order, exact projection and single-column id lookup", async () => {
    const { db, sdk, requests } = fixture();
    expect(db).toBe(sdk);
    expect((await db.from("meal_plan_columns").select(columns).eq("user_id", owner)
      .order("sort_order", { ascending: true }).order("id", { ascending: true })).data).toEqual([row]);
    expect((await db.from("meal_plan_columns").select(columns).eq("id", id).maybeSingle()).data).toEqual(row);
    expect(requests.map(({ url }) => Object.fromEntries(url.searchParams))).toEqual([
      { select: columns.replaceAll(" ", ""), user_id: `eq.${owner}`, order: "sort_order.asc,id.asc" },
      { select: columns.replaceAll(" ", ""), id: `eq.${id}` },
    ]);
  });

  it("preserves insert/rename/reorder bodies, id filters and atomic owned-delete RPC", async () => {
    const { db, requests } = fixture();
    await db.from("meal_plan_columns").insert(row).select(columns).maybeSingle();
    await db.from("meal_plan_columns").update({ name: "새 아침" }).eq("id", id).select(columns).maybeSingle();
    await db.from("meal_plan_columns").update({ sort_order: 103 }).eq("id", id);
    await db.rpc("delete_owned_planner_column", { p_user_id: owner, p_column_id: id });
    expect(requests.map(({ url, method, body }) => [url.pathname, method, body])).toEqual([
      ["/rest/v1/meal_plan_columns", "POST", row],
      ["/rest/v1/meal_plan_columns", "PATCH", { name: "새 아침" }],
      ["/rest/v1/meal_plan_columns", "PATCH", { sort_order: 103 }],
      ["/rest/v1/rpc/delete_owned_planner_column", "POST", { p_user_id: owner, p_column_id: id }],
    ]);
    expect(Object.fromEntries(requests[1].url.searchParams)).toEqual({ select: columns.replaceAll(" ", ""), id: `eq.${id}` });
    expect(Object.fromEntries(requests[2].url.searchParams)).toEqual({ id: `eq.${id}` });
  });
});
