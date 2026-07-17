import {
  scaleNutritionForServings,
  type RecipeNutritionCalculation,
} from "@/lib/nutrition/recipe-nutrition-calculator";
import {
  mapRecipeNutritionSnapshot,
  type RecipeNutritionSnapshotRow,
} from "@/lib/server/recipe-nutrition-snapshot";
import type { ProductPlannerEntryData } from "@/types/product-planner-entry";
import {
  PLANNER_NUTRITION_CORE_CODES,
  type PlannerNutritionAggregate,
  type PlannerNutritionData,
  type PlannerNutritionQuality,
  type PlannerNutritionSource,
  type PlannerNutritionValue,
} from "@/types/planner-nutrition";

const SOURCE_KEYS = [
  "provider",
  "dataset",
  "source_version",
  "data_basis_date",
  "license",
  "source_url",
] as const;
const FORBIDDEN_SOURCE_TEXT = /(?:raw[_-]?(?:payload|row|provider|response)|api[_-]?key|servicekey|secret|cookie|authorization|access[_-]?token|manifest[_-]?(?:sha|path)|(?:^|\/)private(?:\/|$)|(?:^|\/)internal(?:\/|$))/i;
const AUTH_QUERY_KEY_TEXT = /(?:password|passwd|passphrase|secret|token|credential|apikey|accesskey|subscriptionkey|servicekey|signature|cookie)/;

export interface PlannerNutritionEntryProjection {
  storage_key: string;
  plan_date: string;
  column_id: string;
  values: Record<string, PlannerNutritionValue>;
  calculation_quality: PlannerNutritionQuality | null;
  warnings: string[];
  sources: Array<PlannerNutritionSource | Record<string, unknown>>;
}

interface QueryError {
  message: string;
}

interface RecipeMealRow {
  id: string;
  plan_date: string;
  column_id: string;
  planned_servings: number;
  recipe_nutrition_snapshot_id: string | null;
}

type ArrayQueryResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

interface MealRangeQuery {
  eq(column: string, value: string): MealRangeQuery;
  gte(column: string, value: string): MealRangeQuery;
  lte(column: string, value: string): MealRangeQuery;
  order(column: string, options: { ascending: boolean }): MealRangeQuery;
  then: ArrayQueryResult<RecipeMealRow>["then"];
}

interface SnapshotBatchQuery {
  in(column: string, values: string[]): SnapshotBatchQuery;
  then: ArrayQueryResult<RecipeNutritionSnapshotRow>["then"];
}

export interface PlannerNutritionDbClient {
  from(table: "meals"): { select(columns: string): MealRangeQuery };
  from(table: "recipe_nutrition_snapshots"): { select(columns: string): SnapshotBatchQuery };
  rpc(
    name: "list_product_planner_entries",
    args: {
      p_user_id: string;
      p_start_date: string;
      p_end_date: string;
      p_column_id: null;
    },
  ): PromiseLike<{ data: unknown; error: QueryError | null }>;
}

export class PlannerNutritionReadError extends Error {
  constructor() {
    super("PLANNER_NUTRITION_READ_FAILED");
    this.name = "PlannerNutritionReadError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareUnicodeOrdinal(left: string, right: string) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0)!);
  const length = Math.min(leftPoints.length, rightPoints.length);

  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) {
      return leftPoints[index] - rightPoints[index];
    }
  }
  return leftPoints.length - rightPoints.length;
}

function compareNullable(left: string | null, right: string | null) {
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return compareUnicodeOrdinal(left, right);
}

function decodedQueryKeyIsUnsafe(key: string) {
  let decoded = key;
  for (let depth = 0; depth < 8 && decoded.includes("%"); depth += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return true;
    }
  }
  if (decoded.includes("%")) return true;
  const normalized = decoded.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized === "key" || normalized === "pass" || normalized === "auth" ||
    normalized === "authorization" || AUTH_QUERY_KEY_TEXT.test(normalized);
}

function safeSourceUrl(value: string | null) {
  if (value === null) return true;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return ["http:", "https:"].includes(url.protocol) &&
    url.username === "" && url.password === "" && url.hash === "" &&
    [...url.searchParams.keys()].every((key) => !decodedQueryKeyIsUnsafe(key));
}

function sanitizeSource(source: unknown): PlannerNutritionSource | null {
  if (!isRecord(source) || typeof source.provider !== "string" || source.provider.trim() === "") {
    return null;
  }
  const projected = Object.fromEntries(SOURCE_KEYS.map((key) => [key, source[key]])) as unknown as
    PlannerNutritionSource;
  for (const key of SOURCE_KEYS.slice(1)) {
    const value = projected[key];
    if (value !== null && (typeof value !== "string" || value.trim() === "")) return null;
  }
  if (FORBIDDEN_SOURCE_TEXT.test(JSON.stringify(projected)) || !safeSourceUrl(projected.source_url)) {
    return null;
  }
  return projected;
}

function sourceTuple(source: PlannerNutritionSource) {
  return SOURCE_KEYS.map((key) => source[key]);
}

function compareSources(left: PlannerNutritionSource, right: PlannerNutritionSource) {
  const leftTuple = sourceTuple(left);
  const rightTuple = sourceTuple(right);
  for (let index = 0; index < SOURCE_KEYS.length; index += 1) {
    const comparison = compareNullable(leftTuple[index]!, rightTuple[index]!);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function unavailableValue(): PlannerNutritionValue {
  return {
    amount: null,
    known_amount: null,
    status: "unavailable",
    display_mode: null,
  };
}

function normalizeValue(value: unknown): PlannerNutritionValue {
  if (!isRecord(value)) return unavailableValue();
  if (
    value.status === "complete" &&
    typeof value.amount === "number" && Number.isFinite(value.amount) && value.amount >= 0 &&
    value.known_amount === null && value.display_mode === "total"
  ) {
    return { amount: value.amount, known_amount: null, status: "complete", display_mode: "total" };
  }
  if (
    value.status === "partial" && value.amount === null &&
    typeof value.known_amount === "number" && Number.isFinite(value.known_amount) &&
    value.known_amount >= 0 && value.display_mode === "minimum"
  ) {
    return {
      amount: null,
      known_amount: value.known_amount,
      status: "partial",
      display_mode: "minimum",
    };
  }
  return unavailableValue();
}

function aggregateValue(entries: PlannerNutritionEntryProjection[], code: string) {
  if (entries.length === 0) return unavailableValue();
  let knownSum = 0;
  let hasKnown = false;
  let allComplete = true;

  for (const entry of entries) {
    const value = normalizeValue(entry.values[code]);
    if (value.status === "complete") {
      knownSum += value.amount!;
      hasKnown = true;
    } else {
      allComplete = false;
      if (value.status === "partial") {
        knownSum += value.known_amount!;
        hasKnown = true;
      }
    }
  }

  if (allComplete) {
    return { amount: knownSum, known_amount: null, status: "complete", display_mode: "total" } as const;
  }
  if (hasKnown) {
    return {
      amount: null,
      known_amount: knownSum,
      status: "partial",
      display_mode: "minimum",
    } as const;
  }
  return unavailableValue();
}

export function aggregatePlannerNutritionEntries(
  entries: PlannerNutritionEntryProjection[],
): PlannerNutritionAggregate {
  const values = Object.fromEntries(
    PLANNER_NUTRITION_CORE_CODES.map((code) => [code, aggregateValue(entries, code)]),
  ) as PlannerNutritionAggregate["values"];
  const statuses = Object.values(values).map((value) => value.status);
  const calculationStatus = statuses.every((status) => status === "complete")
    ? "complete"
    : statuses.some((status) => status !== "unavailable")
      ? "partial"
      : "unavailable";

  const calculableEntries = entries.filter((entry) =>
    PLANNER_NUTRITION_CORE_CODES.some((code) => normalizeValue(entry.values[code]).status !== "unavailable")
  );
  const qualities = calculableEntries.map((entry) => entry.calculation_quality);
  const calculationQuality: PlannerNutritionQuality | null = qualities.length === 0
    ? null
    : qualities.every((quality) => quality === "direct")
      ? "direct"
      : qualities.every((quality) => quality === "estimated")
        ? "estimated"
        : "mixed";

  const warnings = [...new Set(entries.flatMap((entry) =>
    entry.warnings.filter((warning) => typeof warning === "string" && warning.length > 0)
  ))].sort(compareUnicodeOrdinal);
  const sources = [...new Map(entries.flatMap((entry) => entry.sources)
    .map(sanitizeSource)
    .filter((source): source is PlannerNutritionSource => source !== null)
    .map((source) => [JSON.stringify(sourceTuple(source)), source] as const)).values()]
    .sort(compareSources);
  const incompleteEntryCount = entries.filter((entry) =>
    PLANNER_NUTRITION_CORE_CODES.some((code) => normalizeValue(entry.values[code]).status !== "complete")
  ).length;

  return {
    basis: { amount: 1, unit: "range" },
    values,
    calculation_status: calculationStatus,
    calculation_quality: calculationQuality,
    incomplete_entry_count: incompleteEntryCount,
    warnings,
    sources,
  };
}

function unavailableEntry(
  storageKey: string,
  planDate: string,
  columnId: string,
): PlannerNutritionEntryProjection {
  return {
    storage_key: storageKey,
    plan_date: planDate,
    column_id: columnId,
    values: {},
    calculation_quality: null,
    warnings: [],
    sources: [],
  };
}

function projectRecipeMeal(
  meal: RecipeMealRow,
  snapshots: Map<string, RecipeNutritionSnapshotRow>,
): PlannerNutritionEntryProjection {
  const storageKey = `recipe:${meal.id}`;
  if (!meal.recipe_nutrition_snapshot_id) {
    return unavailableEntry(storageKey, meal.plan_date, meal.column_id);
  }
  const row = snapshots.get(meal.recipe_nutrition_snapshot_id);
  if (!row) return unavailableEntry(storageKey, meal.plan_date, meal.column_id);

  try {
    const mapped = mapRecipeNutritionSnapshot(row);
    const calculation: RecipeNutritionCalculation = {
      basis: { amount: row.base_servings, unit: "serving" },
      base_servings: row.base_servings,
      values: row.nutrient_status_json,
      scalable_values: row.scalable_values_json,
      fixed_values: row.fixed_values_json,
      calculation_status: row.calculation_status,
      calculation_quality: row.calculation_quality,
      reflected_ingredient_count: row.reflected_ingredient_count,
      target_ingredient_count: row.target_ingredient_count,
      missing_reasons: [],
      warnings: row.warnings_json,
      sources: row.sources_json,
      input_hash: "0".repeat(64),
      calculation_version: "snapshot-projection-v1",
      rounding_policy_version: "display-v1",
    };
    const scaled = scaleNutritionForServings(calculation, meal.planned_servings);
    return {
      storage_key: storageKey,
      plan_date: meal.plan_date,
      column_id: meal.column_id,
      values: scaled.values,
      calculation_quality: mapped.calculation_quality,
      warnings: [...mapped.warnings],
      sources: mapped.sources.map((source) => ({ ...source })),
    };
  } catch {
    return unavailableEntry(storageKey, meal.plan_date, meal.column_id);
  }
}

function projectProductEntry(entry: ProductPlannerEntryData): PlannerNutritionEntryProjection {
  const nutrition: Record<string, unknown> = isRecord(entry.nutrition)
    ? entry.nutrition as unknown as Record<string, unknown>
    : {};
  return {
    storage_key: `product:${entry.id}`,
    plan_date: entry.plan_date,
    column_id: entry.column_id,
    values: isRecord(nutrition.values)
      ? nutrition.values as Record<string, PlannerNutritionValue>
      : {},
    calculation_quality: ["direct", "estimated", "mixed"].includes(
      String(nutrition.calculation_quality),
    )
      ? nutrition.calculation_quality as PlannerNutritionQuality
      : null,
    warnings: Array.isArray(nutrition.warnings)
      ? nutrition.warnings.filter((warning: unknown): warning is string => typeof warning === "string")
      : [],
    sources: Array.isArray(nutrition.sources)
      ? nutrition.sources.filter(isRecord)
      : [],
  };
}

function dedupeByStorageKey(entries: PlannerNutritionEntryProjection[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.storage_key)) return false;
    seen.add(entry.storage_key);
    return true;
  });
}

function dateStrings(startDate: string, endDate: string) {
  const dates: string[] = [];
  const current = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T00:00:00.000Z`);
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

export async function readPlannerNutritionSummary(
  dbClient: PlannerNutritionDbClient,
  userId: string,
  range: { startDate: string; endDate: string },
): Promise<PlannerNutritionData> {
  const mealsResult = await dbClient
    .from("meals")
    .select("id, plan_date, column_id, planned_servings, recipe_nutrition_snapshot_id")
    .eq("user_id", userId)
    .gte("plan_date", range.startDate)
    .lte("plan_date", range.endDate)
    .order("plan_date", { ascending: true })
    .order("column_id", { ascending: true })
    .order("id", { ascending: true });
  if (mealsResult.error || !mealsResult.data) throw new PlannerNutritionReadError();

  const dedupedMeals = [...new Map(mealsResult.data.map((meal) => [meal.id, meal])).values()];
  const snapshotIds = [...new Set(dedupedMeals
    .map((meal) => meal.recipe_nutrition_snapshot_id)
    .filter((id): id is string => typeof id === "string" && id.length > 0))]
    .sort(compareUnicodeOrdinal);
  const snapshotMap = new Map<string, RecipeNutritionSnapshotRow>();
  if (snapshotIds.length > 0) {
    const snapshotsResult = await dbClient
      .from("recipe_nutrition_snapshots")
      .select("id, base_servings, scalable_values_json, fixed_values_json, nutrient_status_json, calculation_status, calculation_quality, reflected_ingredient_count, target_ingredient_count, warnings_json, sources_json, calculated_at")
      .in("id", snapshotIds);
    if (snapshotsResult.error || !snapshotsResult.data) throw new PlannerNutritionReadError();
    for (const snapshot of snapshotsResult.data) snapshotMap.set(snapshot.id, snapshot);
  }

  const productResult = await dbClient.rpc("list_product_planner_entries", {
    p_user_id: userId,
    p_start_date: range.startDate,
    p_end_date: range.endDate,
    p_column_id: null,
  });
  if (productResult.error || !Array.isArray(productResult.data)) {
    throw new PlannerNutritionReadError();
  }

  const recipeEntries = dedupeByStorageKey(
    dedupedMeals.map((meal) => projectRecipeMeal(meal, snapshotMap)),
  );
  const productEntries = dedupeByStorageKey(
    (productResult.data as ProductPlannerEntryData[])
      .filter((entry) => isRecord(entry) && typeof entry.id === "string" &&
        typeof entry.plan_date === "string" && typeof entry.column_id === "string" &&
        entry.plan_date >= range.startDate && entry.plan_date <= range.endDate)
      .map(projectProductEntry),
  );
  const allEntries = [...recipeEntries, ...productEntries];

  return {
    range: { start_date: range.startDate, end_date: range.endDate },
    summary: {
      nutrition: aggregatePlannerNutritionEntries(allEntries),
      recipe_entry_count: recipeEntries.length,
      product_entry_count: productEntries.length,
    },
    days: dateStrings(range.startDate, range.endDate).map((planDate) => {
      const dayEntries = allEntries.filter((entry) => entry.plan_date === planDate);
      const columnIds = [...new Set(dayEntries.map((entry) => entry.column_id))]
        .sort(compareUnicodeOrdinal);
      return {
        plan_date: planDate,
        nutrition: aggregatePlannerNutritionEntries(dayEntries),
        columns: columnIds.map((columnId) => ({
          column_id: columnId,
          nutrition: aggregatePlannerNutritionEntries(
            dayEntries.filter((entry) => entry.column_id === columnId),
          ),
        })),
      };
    }),
  };
}
