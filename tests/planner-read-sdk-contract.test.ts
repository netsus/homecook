import { createClient } from "@supabase/supabase-js";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { PlannerDbClient } from "@/app/api/v1/planner/route";

const owner = "550e8400-e29b-41d4-a716-446655440000";
const id = "550e8400-e29b-41d4-a716-446655440001";
const columns = "id, recipe_id, recipe_content_snapshot_id, recipe_content_snapshots(title), plan_date, column_id, planned_servings, status, is_leftover, shopping_list_id, created_at";

describe("planner native SDK read contract", () => {
  it("preserves exact pinned-title join, owner/date filters, stable order and product RPC args", async () => {
    const requests: Array<{ url: URL; body: unknown }> = [];
    const sdk = createClient("http://planner-read-sdk.invalid", "fixture", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
        const data = url.pathname.includes("/rpc/") ? [] : [{ id, recipe_id: id,
          recipe_content_snapshot_id: id, recipe_content_snapshots: { title: "저장된 제목" },
          plan_date: "2026-10-20", column_id: id, planned_servings: 2, status: "registered",
          is_leftover: false, shopping_list_id: null, created_at: "2026-10-20T00:00:00Z" }];
        return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
      } },
    });
    const db: PlannerDbClient = sdk;
    expect(db).toBe(sdk);
    const read = db.from("meals").select(columns).eq("user_id", owner)
      .gte("plan_date", "2026-10-20").lte("plan_date", "2026-10-26")
      .order("plan_date", { ascending: true }).order("column_id", { ascending: true }).order("created_at", { ascending: true });
    expect((await read).data?.[0]).toMatchObject({ recipe_content_snapshots: { title: "저장된 제목" } });
    const args = { p_user_id: owner, p_start_date: "2026-10-20", p_end_date: "2026-10-26", p_column_id: null };
    const products = db.rpc("list_product_planner_entries", args);
    expectTypeOf<Awaited<typeof products>["data"]>().toBeUnknown();
    expect((await products).data).toEqual([]);
    expect([...requests[0].url.searchParams.entries()]).toEqual([
      ["select", columns.replaceAll(" ", "")], ["user_id", `eq.${owner}`],
      ["plan_date", "gte.2026-10-20"], ["plan_date", "lte.2026-10-26"],
      ["order", "plan_date.asc,column_id.asc,created_at.asc"],
    ]);
    expect(requests[1].url.pathname).toBe("/rest/v1/rpc/list_product_planner_entries");
    expect(requests[1].body).toEqual(args);
  });
});
