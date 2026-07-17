import { describe, expect, it, vi } from "vitest";

import {
  readPlannerNutritionSummary,
  type PlannerNutritionDbClient,
} from "@/lib/server/planner-nutrition-summary";

const USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const SNAPSHOT_ID = "550e8400-e29b-41d4-a716-446655440001";
const COLUMN_A = "550e8400-e29b-41d4-a716-446655440002";
const COLUMN_B = "550e8400-e29b-41d4-a716-446655440003";

const SOURCE = {
  provider: "MFDS",
  dataset: "Food DB",
  source_version: "v1",
  data_basis_date: null,
  license: "public",
  source_url: "https://example.test/source",
};

function completeValues(amount: number) {
  return {
    energy_kcal: { amount, known_amount: null, status: "complete", display_mode: "total" },
    carbohydrate_g: { amount, known_amount: null, status: "complete", display_mode: "total" },
    protein_g: { amount, known_amount: null, status: "complete", display_mode: "total" },
    fat_g: { amount, known_amount: null, status: "complete", display_mode: "total" },
    sodium_mg: { amount, known_amount: null, status: "complete", display_mode: "total" },
  } as const;
}

function thenableQuery<T>(result: { data: T[] | null; error: { message: string } | null }) {
  const calls: Array<[string, unknown]> = [];
  const query = {
    calls,
    eq: vi.fn((column: string, value: unknown) => { calls.push([`eq:${column}`, value]); return query; }),
    gte: vi.fn((column: string, value: unknown) => { calls.push([`gte:${column}`, value]); return query; }),
    lte: vi.fn((column: string, value: unknown) => { calls.push([`lte:${column}`, value]); return query; }),
    in: vi.fn((column: string, value: unknown) => { calls.push([`in:${column}`, value]); return query; }),
    order: vi.fn((column: string, value: unknown) => { calls.push([`order:${column}`, value]); return query; }),
    then(
      onFulfilled?: (value: typeof result) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
  return query;
}

function recipeSnapshot() {
  return {
    id: SNAPSHOT_ID,
    base_servings: 2,
    scalable_values_json: {
      energy_kcal: 80,
      carbohydrate_g: 16,
      protein_g: 8,
      fat_g: 4,
      sodium_mg: 40,
    },
    fixed_values_json: {
      energy_kcal: 20,
      carbohydrate_g: 4,
      protein_g: 2,
      fat_g: 1,
      sodium_mg: 10,
    },
    nutrient_status_json: {
      energy_kcal: { amount: 100, known_amount: null, status: "complete", display_mode: "total" },
      carbohydrate_g: { amount: 20, known_amount: null, status: "complete", display_mode: "total" },
      protein_g: { amount: 10, known_amount: null, status: "complete", display_mode: "total" },
      fat_g: { amount: 5, known_amount: null, status: "complete", display_mode: "total" },
      sodium_mg: { amount: 50, known_amount: null, status: "complete", display_mode: "total" },
    },
    calculation_status: "complete",
    calculation_quality: "estimated",
    reflected_ingredient_count: 1,
    target_ingredient_count: 1,
    warnings_json: ["REPRESENTATIVE_VOLUME_CONVERSION_USED"],
    sources_json: [SOURCE],
    calculated_at: "2026-07-17T00:00:00.000Z",
  };
}

describe("planner nutrition bounded read model", () => {
  it("uses only pinned recipe snapshots and the existing pinned product RPC", async () => {
    const meals = thenableQuery({
      data: [
        {
          id: "meal-1",
          plan_date: "2026-07-17",
          column_id: COLUMN_A,
          planned_servings: 4,
          recipe_nutrition_snapshot_id: SNAPSHOT_ID,
        },
        {
          id: "meal-null-pin",
          plan_date: "2026-07-17",
          column_id: COLUMN_B,
          planned_servings: 1,
          recipe_nutrition_snapshot_id: null,
        },
        {
          id: "meal-1",
          plan_date: "2026-07-17",
          column_id: COLUMN_A,
          planned_servings: 4,
          recipe_nutrition_snapshot_id: SNAPSHOT_ID,
        },
      ],
      error: null,
    });
    const snapshots = thenableQuery({ data: [recipeSnapshot()], error: null });
    const productEntry = {
      entry_type: "product",
      id: "product-entry-1",
      product_id: "product-1",
      product_name: "고정 제품",
      product_brand: null,
      plan_date: "2026-07-18",
      column_id: COLUMN_A,
      quantity: { amount: 2, unit: "serving" },
      workflow_status: null,
      product_nutrition_version_id: "old-version-pin",
      basis_relations: [],
      nutrition: {
        basis: { amount: 2, unit: "serving" },
        values: completeValues(30),
        calculation_status: "complete",
        calculation_quality: "direct",
        warnings: [],
        sources: [SOURCE],
      },
    };
    const rpc = vi.fn(async () => ({ data: [productEntry, productEntry], error: null }));
    const from = vi.fn((table: string) => {
      if (table === "meals") return { select: vi.fn(() => meals) };
      if (table === "recipe_nutrition_snapshots") return { select: vi.fn(() => snapshots) };
      throw new Error(`unexpected current or owner-leaking table: ${table}`);
    });
    const db = { from, rpc } as unknown as PlannerNutritionDbClient;

    const result = await readPlannerNutritionSummary(db, USER_ID, {
      startDate: "2026-07-17",
      endDate: "2026-07-18",
    });

    expect(result.range).toEqual({ start_date: "2026-07-17", end_date: "2026-07-18" });
    expect(result.summary.recipe_entry_count).toBe(2);
    expect(result.summary.product_entry_count).toBe(1);
    expect(result.days).toHaveLength(2);
    expect(result.days[0]!.nutrition.values.energy_kcal).toEqual({
      amount: null,
      known_amount: 180,
      status: "partial",
      display_mode: "minimum",
    });
    expect(result.days[0]!.nutrition.incomplete_entry_count).toBe(1);
    expect(result.days[0]!.columns.find((column) => column.column_id === COLUMN_A)?.nutrition.values.energy_kcal.amount).toBe(180);
    expect(result.days[1]!.nutrition.values.energy_kcal.amount).toBe(30);
    expect(result.summary.nutrition.calculation_quality).toBe("mixed");

    expect(from).toHaveBeenCalledTimes(2);
    expect(from).toHaveBeenNthCalledWith(1, "meals");
    expect(from).toHaveBeenNthCalledWith(2, "recipe_nutrition_snapshots");
    expect(meals.calls.slice(0, 3)).toEqual([
      ["eq:user_id", USER_ID],
      ["gte:plan_date", "2026-07-17"],
      ["lte:plan_date", "2026-07-18"],
    ]);
    expect(snapshots.in).toHaveBeenCalledOnce();
    expect(snapshots.in).toHaveBeenCalledWith("id", [SNAPSHOT_ID]);
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("list_product_planner_entries", {
      p_user_id: USER_ID,
      p_start_date: "2026-07-17",
      p_end_date: "2026-07-18",
      p_column_id: null,
    });
  });

  it("fails closed to unavailable for an unreadable pinned snapshot", async () => {
    const meals = thenableQuery({
      data: [{
        id: "meal-bad",
        plan_date: "2026-07-17",
        column_id: COLUMN_A,
        planned_servings: 1,
        recipe_nutrition_snapshot_id: SNAPSHOT_ID,
      }],
      error: null,
    });
    const snapshots = thenableQuery({
      data: [{ ...recipeSnapshot(), base_servings: 0 }],
      error: null,
    });
    const db = {
      from: vi.fn((table: string) => ({
        select: vi.fn(() => table === "meals" ? meals : snapshots),
      })),
      rpc: vi.fn(async () => ({ data: [], error: null })),
    } as unknown as PlannerNutritionDbClient;

    const result = await readPlannerNutritionSummary(db, USER_ID, {
      startDate: "2026-07-17",
      endDate: "2026-07-17",
    });

    expect(result.summary.nutrition.calculation_status).toBe("unavailable");
    expect(result.summary.nutrition.calculation_quality).toBeNull();
    expect(result.summary.nutrition.incomplete_entry_count).toBe(1);
    expect(result.summary.nutrition.values.energy_kcal.amount).toBeNull();
  });

  it("does not issue a snapshot query when every recipe pin is null", async () => {
    const meals = thenableQuery({
      data: [{
        id: "meal-null",
        plan_date: "2026-07-17",
        column_id: COLUMN_A,
        planned_servings: 1,
        recipe_nutrition_snapshot_id: null,
      }],
      error: null,
    });
    const from = vi.fn(() => ({ select: vi.fn(() => meals) }));
    const db = {
      from,
      rpc: vi.fn(async () => ({ data: [], error: null })),
    } as unknown as PlannerNutritionDbClient;

    await readPlannerNutritionSummary(db, USER_ID, {
      startDate: "2026-07-17",
      endDate: "2026-07-17",
    });

    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("meals");
  });

  it("surfaces read failures without leaking database payloads into a result", async () => {
    const meals = thenableQuery({ data: null, error: { message: "secret database detail" } });
    const db = {
      from: vi.fn(() => ({ select: vi.fn(() => meals) })),
      rpc: vi.fn(),
    } as unknown as PlannerNutritionDbClient;

    await expect(readPlannerNutritionSummary(db, USER_ID, {
      startDate: "2026-07-17",
      endDate: "2026-07-17",
    })).rejects.toThrow("PLANNER_NUTRITION_READ_FAILED");
  });
});
