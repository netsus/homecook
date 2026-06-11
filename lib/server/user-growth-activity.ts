import { createHash } from "node:crypto";

interface QueryError {
  code?: string;
  message: string;
}

export type UserGrowthActivityCategory =
  | "recipe"
  | "planner"
  | "shopping"
  | "cooking"
  | "pantry"
  | "leftovers"
  | "recipebook";

export type UserGrowthActivityType =
  | "shopping_bundle_prepared"
  | "pantry_item_added"
  | "leftover_eaten"
  | "meal_add_path_used"
  | "recipebook_created"
  | "recipebook_recipe_added"
  | "recipebook_recipe_removed";

export type MealAddPath = "search" | "recipebook" | "pantry" | "leftover" | "youtube" | "manual";

export const MEAL_ADD_PATHS = new Set<MealAddPath>([
  "search",
  "recipebook",
  "pantry",
  "leftover",
  "youtube",
  "manual",
]);

interface ActivityInsert {
  user_id: string;
  activity_type: UserGrowthActivityType;
  category: UserGrowthActivityCategory;
  source_key: string;
  source_table: string;
  source_id: string;
  source_meta_json: Record<string, unknown>;
  occurred_at: string;
}

type MaybeSingleResult<T> = PromiseLike<{
  data: T | null;
  error: QueryError | null;
}>;

interface ActivityInsertQuery {
  select(columns: string): {
    maybeSingle(): MaybeSingleResult<{ id: string }>;
  };
}

interface ActivityTable {
  insert(values: ActivityInsert): ActivityInsertQuery;
}

export interface UserGrowthActivityDbClient {
  from(table: "user_growth_activity_events"): ActivityTable;
}

export interface UserGrowthActivityInput {
  userId: string;
  activityType: UserGrowthActivityType;
  category: UserGrowthActivityCategory;
  sourceKey: string;
  sourceTable: string;
  sourceId: string;
  sourceMeta?: Record<string, unknown>;
  occurredAt?: string;
}

interface ShoppingListCountQuery {
  eq(column: string, value: string | boolean): ShoppingListCountQuery;
  then: PromiseLike<{
    data: null;
    error: QueryError | null;
    count: number | null;
  }>["then"];
}

interface ShoppingListCountTable {
  select(columns: string, options: { count: "exact"; head: true }): ShoppingListCountQuery;
}

interface ShoppingBundleActivityRow {
  source_meta_json: unknown;
}

interface ShoppingBundleActivityQuery {
  eq(column: string, value: string): ShoppingBundleActivityQuery;
  then: PromiseLike<{
    data: ShoppingBundleActivityRow[] | null;
    error: QueryError | null;
  }>["then"];
}

interface ShoppingBundleActivityTable {
  select(columns: "source_meta_json"): ShoppingBundleActivityQuery;
}

export interface UserShoppingGrowthCountsDbClient {
  from(table: "shopping_lists"): ShoppingListCountTable;
  from(table: "user_growth_activity_events"): ShoppingBundleActivityTable;
}

export interface UserShoppingGrowthCounts {
  shopping_list_completed_count: number;
  shopping_meal_bundle_completed_count: number;
  shopping_meals_covered_count: number;
}

export async function recordUserGrowthActivityEvent(
  dbClient: UserGrowthActivityDbClient,
  input: UserGrowthActivityInput,
): Promise<{ recorded: boolean; duplicate: boolean; error: QueryError | null }> {
  try {
    if (input.activityType === "meal_add_path_used" && !isKnownMealAddPathSourceKey(input.sourceKey)) {
      return { recorded: false, duplicate: false, error: null };
    }

    const result = await dbClient
      .from("user_growth_activity_events")
      .insert({
        user_id: input.userId,
        activity_type: input.activityType,
        category: input.category,
        source_key: input.sourceKey,
        source_table: input.sourceTable,
        source_id: input.sourceId,
        source_meta_json: input.sourceMeta ?? {},
        occurred_at: input.occurredAt ?? new Date().toISOString(),
      })
      .select("id")
      .maybeSingle();

    if (isDuplicateInsert(result.error)) {
      return { recorded: false, duplicate: true, error: null };
    }

    if (result.error || !result.data) {
      return {
        recorded: false,
        duplicate: false,
        error: result.error ?? { message: "missing growth activity insert result" },
      };
    }

    return { recorded: true, duplicate: false, error: null };
  } catch (error) {
    return {
      recorded: false,
      duplicate: false,
      error: { message: error instanceof Error ? error.message : "unknown growth activity failure" },
    };
  }
}

export async function readUserShoppingGrowthCounts(
  dbClient: UserShoppingGrowthCountsDbClient,
  userId: string,
): Promise<{ counts: UserShoppingGrowthCounts | null; error: QueryError | null }> {
  const listCountResult = await dbClient
    .from("shopping_lists")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_completed", true);

  if (listCountResult.error) {
    return { counts: null, error: listCountResult.error };
  }

  const bundleRowsResult = await dbClient
    .from("user_growth_activity_events")
    .select("source_meta_json")
    .eq("user_id", userId)
    .eq("activity_type", "shopping_bundle_prepared");

  if (bundleRowsResult.error || !bundleRowsResult.data) {
    return {
      counts: null,
      error: bundleRowsResult.error ?? { message: "missing shopping bundle activity rows" },
    };
  }

  const coveredMealIds = new Set<string>();

  for (const row of bundleRowsResult.data) {
    const sourceMeta = normalizeRecord(row.source_meta_json);
    const mealIds = Array.isArray(sourceMeta.meal_ids) ? sourceMeta.meal_ids : [];

    for (const mealId of mealIds) {
      if (typeof mealId === "string" && mealId.length > 0) {
        coveredMealIds.add(mealId);
      }
    }
  }

  return {
    counts: {
      shopping_list_completed_count: listCountResult.count ?? 0,
      shopping_meal_bundle_completed_count: bundleRowsResult.data.length,
      shopping_meals_covered_count: coveredMealIds.size,
    },
    error: null,
  };
}

export function buildShoppingBundlePreparedSourceKey(input: {
  mealIds: string[];
  actionKind: "shopping_list" | "completed_without_list";
}) {
  const digest = createHash("sha256")
    .update(JSON.stringify({
      actionKind: input.actionKind,
      mealIds: [...new Set(input.mealIds)].sort(),
    }))
    .digest("hex")
    .slice(0, 24);

  return `shopping_bundle_prepared:${digest}`;
}

export function buildMealAddPathSourceKey(userId: string, path: MealAddPath) {
  return `meal_add_path:${userId}:${path}`;
}

function isKnownMealAddPathSourceKey(sourceKey: string) {
  const path = sourceKey.match(/^meal_add_path:[^:]+:([^:]+)$/)?.[1];
  return Boolean(path && MEAL_ADD_PATHS.has(path as MealAddPath));
}

function normalizeRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function isDuplicateInsert(error: QueryError | null | undefined) {
  if (!error) {
    return false;
  }

  return error.code === "23505" || error.message.toLowerCase().includes("duplicate key");
}
