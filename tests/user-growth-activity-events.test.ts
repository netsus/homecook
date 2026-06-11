import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  buildMealAddPathSourceKey,
  buildShoppingBundlePreparedSourceKey,
  readUserShoppingGrowthCounts,
  recordUserGrowthActivityEvent,
  type UserGrowthActivityDbClient,
  type UserShoppingGrowthCountsDbClient,
} from "@/lib/server/user-growth-activity";

function createMaybeSingleQuery(
  result: { data: { id: string } | null; error: { code?: string; message: string } | null },
) {
  return {
    select: vi.fn(() => ({
      maybeSingle: vi.fn(async () => result),
    })),
  };
}

describe("user growth activity ledger", () => {
  it("records a non-XP activity event with idempotent source keys", async () => {
    const table = {
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "activity-1" }, error: null })),
    };
    const dbClient = {
      from: vi.fn((tableName: string) => {
        if (tableName === "user_growth_activity_events") return table;
        throw new Error(`unexpected table: ${tableName}`);
      }),
    };

    const result = await recordUserGrowthActivityEvent(
      dbClient as unknown as UserGrowthActivityDbClient,
      {
        userId: "user-1",
        activityType: "pantry_item_added",
        category: "pantry",
        sourceKey: "pantry_item_added:pantry-1",
        sourceTable: "pantry_items",
        sourceId: "pantry-1",
        sourceMeta: { ingredient_name: "양파" },
        occurredAt: "2026-06-10T10:00:00.000Z",
      },
    );

    expect(result).toEqual({ recorded: true, duplicate: false, error: null });
    expect(table.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      activity_type: "pantry_item_added",
      category: "pantry",
      source_key: "pantry_item_added:pantry-1",
      source_table: "pantry_items",
      source_id: "pantry-1",
      source_meta_json: { ingredient_name: "양파" },
      occurred_at: "2026-06-10T10:00:00.000Z",
    });
  });

  it("does not treat shopping list count and meal bundle count as the same key", () => {
    expect(buildShoppingBundlePreparedSourceKey({
      actionKind: "shopping_list",
      mealIds: ["meal-2", "meal-1", "meal-1"],
    })).toBe(buildShoppingBundlePreparedSourceKey({
      actionKind: "shopping_list",
      mealIds: ["meal-1", "meal-2"],
    }));
    expect(buildShoppingBundlePreparedSourceKey({
      actionKind: "shopping_list",
      mealIds: ["meal-1", "meal-2"],
    })).not.toBe(buildShoppingBundlePreparedSourceKey({
      actionKind: "completed_without_list",
      mealIds: ["meal-1", "meal-2"],
    }));
  });

  it("uses a distinct user/path key for planner add paths", () => {
    expect(buildMealAddPathSourceKey("user-1", "recipebook")).toBe(
      "meal_add_path:user-1:recipebook",
    );
  });

  it("accepts planner add path source keys only when the path segment is known", async () => {
    const table = {
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "activity-1" }, error: null })),
    };
    const dbClient = {
      from: vi.fn((tableName: string) => {
        if (tableName === "user_growth_activity_events") return table;
        throw new Error(`unexpected table: ${tableName}`);
      }),
    };

    const result = await recordUserGrowthActivityEvent(
      dbClient as unknown as UserGrowthActivityDbClient,
      {
        userId: "user-1",
        activityType: "meal_add_path_used",
        category: "planner",
        sourceKey: buildMealAddPathSourceKey("user-1", "recipebook"),
        sourceTable: "meals",
        sourceId: "meal-1",
      },
    );

    expect(result).toEqual({ recorded: true, duplicate: false, error: null });
    expect(table.insert).toHaveBeenCalledWith(expect.objectContaining({
      activity_type: "meal_add_path_used",
      source_key: "meal_add_path:user-1:recipebook",
    }));

    table.insert.mockClear();

    const unknownPathResult = await recordUserGrowthActivityEvent(
      dbClient as unknown as UserGrowthActivityDbClient,
      {
        userId: "user-1",
        activityType: "meal_add_path_used",
        category: "planner",
        sourceKey: "meal_add_path:user-1:unknown",
        sourceTable: "meals",
        sourceId: "meal-2",
      },
    );

    expect(unknownPathResult).toEqual({ recorded: false, duplicate: false, error: null });
    expect(table.insert).not.toHaveBeenCalled();
  });

  it("adds the 34b activity ledger table with RLS and idempotency", async () => {
    const migration = await readFile(
      "supabase/migrations/20260611152000_34b_growth_backend_model.sql",
      "utf8",
    );

    expect(migration).toContain("create table if not exists public.user_growth_activity_events");
    expect(migration).toContain("source_id uuid not null");
    expect(migration).toContain("source_meta_json jsonb not null default '{}'::jsonb");
    expect(migration).toContain("unique (user_id, activity_type, source_key)");
    expect(migration).toContain("shopping_bundle_prepared");
    expect(migration).toContain("recipebook_recipe_removed");
    expect(migration).toContain("alter table public.user_growth_activity_events enable row level security");
    expect(migration).toContain("auth.uid() = user_id");
    expect(migration).toContain("revoke all on public.user_growth_activity_events from authenticated");
    expect(migration).toContain("grant select on public.user_growth_activity_events to authenticated");
    expect(migration).toContain("grant all privileges on public.user_growth_activity_events to service_role");
  });

  it("documents POST /meals source_path as the meal add path metadata", async () => {
    const apiDocument = await readFile("docs/api문서-v1.2.18.md", "utf8");

    expect(apiDocument).toContain("POST /meals.source_path");
    expect(apiDocument).toContain("| Body | source_path");
    expect(apiDocument).toContain("`search` / `recipebook` / `pantry` / `leftover` / `youtube` / `manual`");
    expect(apiDocument).toContain("meal_add_path_used");
  });

  it("separates shopping list, meal bundle, and covered meal counts", async () => {
    const shoppingListCountQuery = {
      eq: vi.fn(() => shoppingListCountQuery),
      then(
        onFulfilled?: (value: {
          data: null;
          error: { message: string } | null;
          count: number | null;
        }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve({ data: null, error: null, count: 2 }).then(
          onFulfilled,
          onRejected,
        );
      },
    };
    const activityRowsQuery = {
      eq: vi.fn(() => activityRowsQuery),
      then(
        onFulfilled?: (value: {
          data: Array<{ source_meta_json: unknown }> | null;
          error: { message: string } | null;
        }) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve({
          data: [
            { source_meta_json: { meal_ids: ["meal-1", "meal-2"] } },
            { source_meta_json: { meal_ids: ["meal-2", "meal-3"] } },
            { source_meta_json: { meal_ids: ["meal-3", null, 42] } },
          ],
          error: null,
        }).then(onFulfilled, onRejected);
      },
    };
    const dbClient = {
      from: vi.fn((tableName: string) => {
        if (tableName === "shopping_lists") {
          return {
            select: vi.fn(() => shoppingListCountQuery),
          };
        }
        if (tableName === "user_growth_activity_events") {
          return {
            select: vi.fn(() => activityRowsQuery),
          };
        }
        throw new Error(`unexpected table: ${tableName}`);
      }),
    };

    const result = await readUserShoppingGrowthCounts(
      dbClient as unknown as UserShoppingGrowthCountsDbClient,
      "user-1",
    );

    expect(result).toEqual({
      counts: {
        shopping_list_completed_count: 2,
        shopping_meal_bundle_completed_count: 3,
        shopping_meals_covered_count: 3,
      },
      error: null,
    });
    expect(shoppingListCountQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(shoppingListCountQuery.eq).toHaveBeenCalledWith("is_completed", true);
    expect(activityRowsQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(activityRowsQuery.eq).toHaveBeenCalledWith(
      "activity_type",
      "shopping_bundle_prepared",
    );
  });
});
