import { createClient } from "@supabase/supabase-js";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { ProductPlannerEntryCreateDbClient } from "@/app/api/v1/product-planner-entries/route";
import type { ProductPlannerEntryMutationDbClient } from "@/app/api/v1/product-planner-entries/[entry_id]/route";

const owner = "550e8400-e29b-41d4-a716-446655440000";
const id = "550e8400-e29b-41d4-a716-446655440001";
function fixture(denied = false) {
  const requests: Array<{ url: URL; method: string; body: unknown }> = [];
  const sdk = createClient("http://planner-sdk.invalid", "fixture", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      requests.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
      const data = denied ? { code: "42501", message: "fixture denied" }
        : url.pathname.includes("/rpc/") ? { id, quantity_input: null }
        : { id, user_id: owner, owner_user_id: null, visibility: "public", moderation_status: "visible",
          deleted_at: null, current_nutrition_version_id: id };
      return new Response(JSON.stringify(data), { status: denied ? 403 : 200,
        headers: { "content-type": "application/json" } });
    } },
  });
  return { sdk, requests };
}

describe("product planner native SDK consumed contracts", () => {
  it("preserves column/product projections, id filters and atomic create args", async () => {
    const { sdk, requests } = fixture();
    const db: ProductPlannerEntryCreateDbClient = sdk;
    expect(db).toBe(sdk);
    await db.from("meal_plan_columns").select("id, user_id").eq("id", id).maybeSingle();
    const columns = "id, owner_user_id, visibility, moderation_status, deleted_at, current_nutrition_version_id";
    const product = db.from("food_products").select(columns).eq("id", id).maybeSingle();
    expectTypeOf<NonNullable<Awaited<typeof product>["data"]>["owner_user_id"]>().toEqualTypeOf<string | null>();
    expect((await product).data).toMatchObject({ owner_user_id: null, visibility: "public" });
    const args = { p_user_id: owner, p_product_id: id, p_column_id: id, p_plan_date: "2026-10-20",
      p_quantity_amount: 1, p_quantity_unit: "serving", p_expected_current_version_id: id };
    const result = db.rpc("create_product_planner_entry", args);
    expectTypeOf<Awaited<typeof result>["data"]>().toBeUnknown();
    expect((await result).data).toMatchObject({ id });
    expect(requests.map(({ url, method }) => [url.pathname, method, Object.fromEntries(url.searchParams)]))
      .toEqual([["/rest/v1/meal_plan_columns", "GET", { select: "id,user_id", id: `eq.${id}` }],
        ["/rest/v1/food_products", "GET", { select: columns.replaceAll(" ", ""), id: `eq.${id}` }],
        ["/rest/v1/rpc/create_product_planner_entry", "POST", {}]]);
    expect(requests[2].body).toEqual(args);
  });

  it("uses the same native client for entry lookup and quantity-v4/update/delete RPCs", async () => {
    const { sdk, requests } = fixture();
    const db: ProductPlannerEntryMutationDbClient = sdk;
    expect(db).toBe(sdk);
    expect((await db.from("product_planner_entries").select("id, user_id").eq("id", id).maybeSingle()).data)
      .toMatchObject({ id, user_id: owner });
    const args = { p_user_id: owner, p_entry_id: id, p_quantity_amount: 2, p_quantity_unit: "g",
      p_quantity_input: { mode: "direct", amount: 2, unit: "g", expected_product_nutrition_version_id: id } };
    await db.rpc("update_product_planner_entry_quantity", args);
    await db.rpc("delete_product_planner_entry", { p_user_id: owner, p_entry_id: id });
    expect(requests.map(({ url, method }) => [url.pathname, method])).toEqual([
      ["/rest/v1/product_planner_entries", "GET"],
      ["/rest/v1/rpc/update_product_planner_entry_quantity", "POST"],
      ["/rest/v1/rpc/delete_product_planner_entry", "POST"],
    ]);
    expect(Object.fromEntries(requests[0].url.searchParams)).toEqual({ select: "id,user_id", id: `eq.${id}` });
    expect(requests[1].body).toEqual(args);
    expect(requests[2].body).toEqual({ p_user_id: owner, p_entry_id: id });
  });

  it("does not hide a native denial or issue a follow-up request", async () => {
    const { sdk, requests } = fixture(true);
    const db: ProductPlannerEntryMutationDbClient = sdk;
    expect(await db.from("product_planner_entries").select("id, user_id").eq("id", id).maybeSingle())
      .toMatchObject({ data: null, error: { code: "42501" } });
    expect(requests).toHaveLength(1);
  });
});
