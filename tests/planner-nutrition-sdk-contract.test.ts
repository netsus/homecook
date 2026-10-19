import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { mapRecipeNutritionSnapshot, type RecipeNutritionSnapshotRow } from "@/lib/server/recipe-nutrition-snapshot";
import { readPlannerRecipeNutritionEntries, readPlannerNutritionSummary, type PlannerNutritionDbClient } from "@/lib/server/planner-nutrition-summary";

const owner = "550e8400-e29b-41d4-a716-446655440001";
const range = { startDate: "2026-10-19", endDate: "2026-10-25" };
function snapshot(): RecipeNutritionSnapshotRow {
  const value = { amount: 10, known_amount: null, status: "complete", display_mode: "total" } as const;
  const vector = { energy_kcal: 8, carbohydrate_g: 8, protein_g: 8, fat_g: 8, sodium_mg: 8 };
  return { id: "good", base_servings: 2, scalable_values_json: vector,
    fixed_values_json: { energy_kcal: 2, carbohydrate_g: 2, protein_g: 2, fat_g: 2, sodium_mg: 2 },
    nutrient_status_json: { energy_kcal: value, carbohydrate_g: value, protein_g: value, fat_g: value, sodium_mg: value },
    calculation_status: "complete", calculation_quality: "direct", reflected_ingredient_count: 1,
    target_ingredient_count: 1, warnings_json: [], sources_json: [{ provider: "MFDS", dataset: "fixture",
      source_version: "v1", data_basis_date: null, license: "public", source_url: "https://fixture.invalid/source" }],
    calculated_at: "2026-10-19T00:00:00Z" };
}
const malformed = [null, 1, "bad", true, [], {}, [null], [1]];
const jsonFields = ["scalable_values_json", "fixed_values_json", "nutrient_status_json", "warnings_json", "sources_json"] as const;
const cases = jsonFields.flatMap(field => malformed.map(value => ({ field, value })));

describe("planner native SDK and stored JSON behavior lock", () => {
  it.each(cases)("preserves mapper outcome for $field=$value", ({ field, value }) => {
    const row = { ...snapshot(), [field]: value };
    if (field === "warnings_json" && Array.isArray(value) && value.length === 0) {
      expect(mapRecipeNutritionSnapshot(row)).toEqual(mapRecipeNutritionSnapshot(snapshot()));
      return;
    }
    // Deliberately corrupt persisted JSON; the production reader must validate it.
    expect(() => mapRecipeNutritionSnapshot(row))
      .toThrowError(expect.objectContaining({ code: "INVALID_SNAPSHOT_PROJECTION" }));
  });

  it.each([null, "meal", "snapshot", "product"])("preserves scoped reads and error=%s", async failure => {
    const requests: Array<{ url: URL; body: unknown }> = [];
    const sdk = createClient("http://nutrition-sdk.invalid", "fixture", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
        const table = url.pathname.split("/").at(-1);
        const failed = failure === "meal" && table === "meals"
          || failure === "snapshot" && table === "recipe_nutrition_snapshots"
          || failure === "product" && table === "list_product_planner_entries";
        const rows = table === "meals" ? [
          { id: "meal", recipe_id: "recipe", plan_date: range.startDate, column_id: "column", planned_servings: 4,
            recipe_content_snapshot_id: "pin", recipe_nutrition_snapshot_id: "must-not-use",
            recipe_content_snapshots: { recipe_nutrition_snapshot_id: "good", base_servings: 2, ingredients_json: [] } },
          { id: "bad-meal", recipe_id: "recipe", plan_date: range.startDate, column_id: "column", planned_servings: 4,
            recipe_content_snapshot_id: null, recipe_nutrition_snapshot_id: "bad", recipe_content_snapshots: null },
        ] : table === "recipe_nutrition_snapshots" ? [snapshot(), { ...snapshot(), id: "bad", sources_json: [null] }] : [];
        return new Response(JSON.stringify(failed ? { code: "42501", message: "fixture denied" } : rows), {
          status: failed ? 403 : 200, headers: { "content-type": "application/json" },
        });
      } },
    });
    const db: PlannerNutritionDbClient = sdk;
    if (failure) {
      await expect(readPlannerNutritionSummary(db, owner, range)).rejects.toThrow("PLANNER_NUTRITION_READ_FAILED");
      return;
    }
    const entries = await readPlannerRecipeNutritionEntries(db, owner, range);
    expect(entries[0].entry.values.energy_kcal.amount).toBe(18);
    expect(entries[1].entry.values).toEqual({});
    const summary = await readPlannerNutritionSummary(db, owner, range);
    expect(summary.summary.recipe_entry_count).toBe(2);
    const meals = requests[0].url.searchParams;
    expect(meals.get("user_id")).toBe(`eq.${owner}`);
    expect(meals.get("plan_date")).toBe(`gte.${range.startDate}`);
    expect(meals.getAll("plan_date")).toEqual([`gte.${range.startDate}`, `lte.${range.endDate}`]);
    expect(meals.get("order")).toBe("plan_date.asc,column_id.asc,id.asc");
    expect(requests[1].url.searchParams.get("id")).toBe("in.(bad,good)");
    expect(requests.at(-1)?.body).toEqual({ p_user_id: owner, p_start_date: range.startDate, p_end_date: range.endDate, p_column_id: null });
  });
});
