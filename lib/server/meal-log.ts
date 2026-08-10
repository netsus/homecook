import type {
  MealLogActiveSection,
  MealLogColumn,
  MealLogDayData,
  MealLogDayTotal,
  MealLogDeletedColumnSection,
  MealLogEntry,
  MealLogMutationData,
  MealLogMutationInput,
  MealLogNutritionEvidence,
  MealLogRecentData,
  MealLogRecentItem,
  MealLogSourceType,
} from "@/types/meal-log";
import { fail } from "@/lib/api/response";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_TYPES = ["cooked_batch", "food_product", "ingredient"] as const;
const NUTRITION_STATUSES = ["complete", "partial", "unavailable"] as const;
const NUTRITION_KEYS = [
  "calculation_status",
  "calories_kcal",
  "carbohydrate_g",
  "protein_g",
  "fat_g",
  "sodium_mg",
] as const;

type FieldError = { field: string; reason: string };
export type ParseResult<T> = { ok: true; value: T } | { ok: false; fields: FieldError[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  return Object.keys(value).length === expected.length
    && expected.every((key) => key in value)
    && hasOnlyKeys(value, expected);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isMealLogEntryId(value: unknown): value is string { return isUuid(value); }

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value.includes("/") || value === "UTC";
  } catch {
    return false;
  }
}

function localDateAt(instant: string, timeZone: string) {
  const date = new Date(instant);
  if (Number.isNaN(date.valueOf())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function parseIdempotencyKey(value: string | null): ParseResult<string> {
  if (value === null || value.trim() === "") {
    return { ok: false, fields: [{ field: "Idempotency-Key", reason: "required" }] };
  }
  if (!isUuid(value)) {
    return { ok: false, fields: [{ field: "Idempotency-Key", reason: "invalid_uuid" }] };
  }
  return { ok: true, value: value.toLowerCase() };
}

export function parseMealLogDateQuery(params: URLSearchParams): ParseResult<{ date: string }> {
  const date = params.get("date");
  if ([...params.keys()].some((key) => key !== "date") || !isDate(date)) {
    return { ok: false, fields: [{ field: "date", reason: "invalid_date" }] };
  }
  return { ok: true, value: { date } };
}

export function parseMealLogRecentQuery(params: URLSearchParams): ParseResult<{ limit: number; cursor: string | null }> {
  const unknown = [...params.keys()].some((key) => key !== "limit" && key !== "cursor");
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? 20 : Number(rawLimit);
  const cursor = params.get("cursor");
  const fields: FieldError[] = [];
  if (unknown) fields.push({ field: "query", reason: "unknown_field" });
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || (rawLimit !== null && !/^\d+$/.test(rawLimit))) {
    fields.push({ field: "limit", reason: "invalid_integer" });
  }
  if (cursor !== null && (!/^[A-Za-z0-9_-]+$/.test(cursor) || cursor.length > 512)) {
    fields.push({ field: "cursor", reason: "invalid_cursor" });
  }
  return fields.length > 0 ? { ok: false, fields } : { ok: true, value: { limit, cursor } };
}

export function parseMealLogMutationRequest(value: unknown, mode: "create" | "patch"): ParseResult<MealLogMutationInput> {
  if (!isRecord(value)) return { ok: false, fields: [{ field: "body", reason: "invalid_json" }] };
  const allowed = ["consumed_local_date", "timezone_name_snapshot", "consumed_at", "meal_plan_column_id", "source", "quantity"];
  if (mode === "patch") allowed.push("expected_revision");
  const fields: FieldError[] = [];
  if (!hasOnlyKeys(value, allowed)) fields.push({ field: "body", reason: "unknown_field" });
  if (!isDate(value.consumed_local_date)) fields.push({ field: "consumed_local_date", reason: "invalid_date" });
  if (!isTimeZone(value.timezone_name_snapshot)) fields.push({ field: "timezone_name_snapshot", reason: "invalid_iana_timezone" });
  if (value.consumed_at !== null && (typeof value.consumed_at !== "string" || Number.isNaN(Date.parse(value.consumed_at)))) {
    fields.push({ field: "consumed_at", reason: "invalid_timestamp" });
  }
  if (!isUuid(value.meal_plan_column_id)) fields.push({ field: "meal_plan_column_id", reason: "invalid_uuid" });
  if (!isRecord(value.source)
    || !hasOnlyKeys(value.source, ["type", "id"])
    || !SOURCE_TYPES.includes(value.source.type as MealLogSourceType)
    || !isUuid(value.source.id)) fields.push({ field: "source", reason: "invalid_exact_source" });
  if (!isRecord(value.quantity)
    || !hasOnlyKeys(value.quantity, ["amount", "unit"])
    || typeof value.quantity.amount !== "number"
    || !Number.isFinite(value.quantity.amount)
    || value.quantity.amount <= 0
    || typeof value.quantity.unit !== "string"
    || value.quantity.unit.trim().length === 0
    || value.quantity.unit.length > 24) fields.push({ field: "quantity", reason: "invalid_quantity" });
  const expectedRevision = mode === "patch" ? value.expected_revision : null;
  if (mode === "patch" && (!Number.isSafeInteger(expectedRevision) || Number(expectedRevision) < 1)) {
    fields.push({ field: "expected_revision", reason: "invalid_integer" });
  }
  if (fields.length === 0 && typeof value.consumed_at === "string") {
    const actual = localDateAt(value.consumed_at, value.timezone_name_snapshot as string);
    if (actual !== value.consumed_local_date) {
      fields.push({ field: "consumed_at", reason: "consumed_date_timezone_mismatch" });
    }
  }
  if (fields.length > 0) return { ok: false, fields };
  const source = value.source as { type: MealLogSourceType; id: string };
  const quantity = value.quantity as { amount: number; unit: string };
  return {
    ok: true,
    value: {
      consumedLocalDate: value.consumed_local_date as string,
      timezoneNameSnapshot: value.timezone_name_snapshot as string,
      consumedAt: typeof value.consumed_at === "string"
        ? new Date(value.consumed_at).toISOString()
        : null,
      mealPlanColumnId: (value.meal_plan_column_id as string).toLowerCase(),
      source: { type: source.type, id: source.id.toLowerCase() },
      quantity: { amount: quantity.amount, unit: quantity.unit.trim() },
      expectedRevision: expectedRevision as number | null,
    },
  };
}

export function parseMealLogDeleteRequest(value: unknown): ParseResult<{ expectedRevision: number }> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["expected_revision"])
    || !Number.isSafeInteger(value.expected_revision) || Number(value.expected_revision) < 1) {
    return { ok: false, fields: [{ field: "expected_revision", reason: "invalid_integer" }] };
  }
  return { ok: true, value: { expectedRevision: value.expected_revision as number } };
}

export function toMealLogRpcPayload(value: MealLogMutationInput) {
  return {
    consumed_local_date: value.consumedLocalDate,
    timezone_name_snapshot: value.timezoneNameSnapshot,
    consumed_at: value.consumedAt,
    meal_plan_column_id: value.mealPlanColumnId,
    source: value.source,
    quantity: value.quantity,
    ...(value.expectedRevision === null ? {} : { expected_revision: value.expectedRevision }),
  };
}

export interface MealLogRpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

const RPC_ERRORS = {
  ACCOUNT_SESSION_STALE: [409, "세션을 다시 확인해 주세요."],
  ACCOUNT_GENERATION_STALE: [409, "계정 상태를 다시 확인해 주세요."],
  ACCOUNT_DELETING: [409, "계정 삭제가 진행 중이에요."],
  ACCOUNT_LIFECYCLE_MAINTENANCE: [503, "계정 정비 작업 중이에요."],
  CONSUMED_DATE_TIMEZONE_MISMATCH: [422, "날짜와 시간대를 확인해 주세요."],
  UNIT_CONVERSION_MISSING: [422, "정확한 단위 환산 정보를 찾지 못했어요."],
  WEIGHT_UNRECOVERABLE: [409, "원래 완성 중량을 확인할 수 없는 요리예요."],
  IDEMPOTENCY_KEY_REUSED: [409, "이미 다른 요청에 사용된 요청 키예요."],
  RESOURCE_NOT_FOUND: [404, "요청한 항목을 찾을 수 없어요."],
  CONFLICT: [409, "다른 변경이 먼저 반영됐어요."],
  VALIDATION_ERROR: [422, "요청 값을 확인해 주세요."],
} as const;

function errorText(value: unknown) {
  if (!isRecord(value)) return typeof value === "string" ? value : "";
  return [value.code, value.message, value.details, value.hint].filter((part) => typeof part === "string").join(" ");
}

function mealLogRpcError(value: unknown) {
  const text = errorText(value);
  if (/40P01|deadlock detected/i.test(text)) {
    const [status, message] = RPC_ERRORS.CONFLICT;
    return fail("CONFLICT", message, status);
  }
  const code = (Object.keys(RPC_ERRORS) as Array<keyof typeof RPC_ERRORS>).find((candidate) => text.includes(candidate));
  if (!code) return fail("INTERNAL_ERROR", "요청을 처리하지 못했어요.", 500);
  const [status, message] = RPC_ERRORS[code];
  return fail(code, message, status);
}

export async function callMealLogRpc(client: MealLogRpcClient, name: string, args: Record<string, unknown>) {
  try {
    const result = await client.rpc(name, args);
    if (result.error) return { ok: false as const, response: mealLogRpcError(result.error) };
    if (isRecord(result.data) && typeof result.data.success === "boolean") {
      if (!result.data.success) return { ok: false as const, response: mealLogRpcError(result.data.error) };
      return { ok: true as const, data: result.data.data };
    }
    return { ok: true as const, data: result.data };
  } catch { return { ok: false as const, response: fail("INTERNAL_ERROR", "요청을 처리하지 못했어요.", 500) }; }
}

export function isMealLogNutritionEvidence(value: unknown): value is MealLogNutritionEvidence {
  if (!isRecord(value) || !hasOnlyKeys(value, NUTRITION_KEYS)
    || !NUTRITION_KEYS.every((key) => key in value)
    || !NUTRITION_STATUSES.includes(value.calculation_status as typeof NUTRITION_STATUSES[number])) return false;
  return NUTRITION_KEYS.slice(1).every((key) => value[key] === null
    || (typeof value[key] === "number" && Number.isFinite(value[key])));
}

function projectMealLogNutrition(value: unknown): MealLogNutritionEvidence | null {
  if (!isMealLogNutritionEvidence(value)) return null;
  return {
    calculation_status: value.calculation_status,
    calories_kcal: value.calories_kcal,
    carbohydrate_g: value.carbohydrate_g,
    protein_g: value.protein_g,
    fat_g: value.fat_g,
    sodium_mg: value.sodium_mg,
  };
}

const ENTRY_KEYS = [
  "id", "revision", "consumed_at", "consumed_local_date", "timezone_name_snapshot",
  "meal_plan_column_id", "slot_name_snapshot", "source", "quantity", "display_name",
  "display_brand", "nutrition", "created_at", "updated_at",
] as const;

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function projectMealLogEntry(value: unknown): MealLogEntry | null {
  if (!isRecord(value) || !hasExactKeys(value, ENTRY_KEYS)
    || !isUuid(value.id)
    || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1
    || (value.consumed_at !== null && !isTimestamp(value.consumed_at))
    || !isDate(value.consumed_local_date)
    || !isTimeZone(value.timezone_name_snapshot)
    || (value.meal_plan_column_id !== null && !isUuid(value.meal_plan_column_id))
    || !isNonEmptyString(value.slot_name_snapshot)
    || !isRecord(value.source) || !hasExactKeys(value.source, ["type", "id"])
    || !SOURCE_TYPES.includes(value.source.type as MealLogSourceType) || !isUuid(value.source.id)
    || !isRecord(value.quantity) || !hasExactKeys(value.quantity, ["amount", "unit"])
    || typeof value.quantity.amount !== "number" || !Number.isFinite(value.quantity.amount)
    || value.quantity.amount <= 0 || !isNonEmptyString(value.quantity.unit)
    || !isNonEmptyString(value.display_name)
    || (value.display_brand !== null && typeof value.display_brand !== "string")
    || !isTimestamp(value.created_at) || !isTimestamp(value.updated_at)) return null;
  const nutrition = projectMealLogNutrition(value.nutrition);
  if (!nutrition) return null;
  return {
    id: value.id,
    revision: value.revision as number,
    consumed_at: value.consumed_at as string | null,
    consumed_local_date: value.consumed_local_date,
    timezone_name_snapshot: value.timezone_name_snapshot,
    meal_plan_column_id: value.meal_plan_column_id as string | null,
    slot_name_snapshot: value.slot_name_snapshot,
    source: { type: value.source.type as MealLogSourceType, id: value.source.id },
    quantity: { amount: value.quantity.amount, unit: value.quantity.unit },
    display_name: value.display_name,
    display_brand: value.display_brand as string | null,
    nutrition,
    created_at: value.created_at,
    updated_at: value.updated_at,
  };
}

function projectMealLogColumn(value: unknown): MealLogColumn | null {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "name", "sort_order"])
    || !isUuid(value.id) || !isNonEmptyString(value.name)
    || !Number.isSafeInteger(value.sort_order)) return null;
  return { id: value.id, name: value.name, sort_order: value.sort_order as number };
}

function projectMealLogEntries(value: unknown): MealLogEntry[] | null {
  if (!Array.isArray(value)) return null;
  const entries = value.map(projectMealLogEntry);
  return entries.some((entry) => entry === null) ? null : entries as MealLogEntry[];
}

function projectMealLogDayTotal(value: unknown): MealLogDayTotal | null {
  if (!isRecord(value)
    || !hasExactKeys(value, [...NUTRITION_KEYS, "incomplete_count"])
    || !Number.isSafeInteger(value.incomplete_count)
    || Number(value.incomplete_count) < 0) return null;
  const nutrition = Object.fromEntries(NUTRITION_KEYS.map((key) => [key, value[key]]));
  const projected = projectMealLogNutrition(nutrition);
  return projected ? { ...projected, incomplete_count: value.incomplete_count as number } : null;
}

function projectMealLogActiveSection(value: unknown): MealLogActiveSection | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "meal_plan_column_id", "slot_name_snapshot", "sort_order", "entries", "subtotal", "incomplete_count",
  ]) || !isUuid(value.meal_plan_column_id) || !isNonEmptyString(value.slot_name_snapshot)
    || !Number.isSafeInteger(value.sort_order) || !Number.isSafeInteger(value.incomplete_count)
    || Number(value.incomplete_count) < 0) return null;
  const entries = projectMealLogEntries(value.entries);
  const subtotal = projectMealLogNutrition(value.subtotal);
  return entries && subtotal ? {
    meal_plan_column_id: value.meal_plan_column_id,
    slot_name_snapshot: value.slot_name_snapshot,
    sort_order: value.sort_order as number,
    entries,
    subtotal,
    incomplete_count: value.incomplete_count as number,
  } : null;
}

function projectMealLogDeletedSection(value: unknown): MealLogDeletedColumnSection | null {
  if (!isRecord(value) || !hasExactKeys(value, [
    "slot_name_snapshot", "entries", "subtotal", "incomplete_count",
  ]) || !isNonEmptyString(value.slot_name_snapshot)
    || !Number.isSafeInteger(value.incomplete_count) || Number(value.incomplete_count) < 0) return null;
  const entries = projectMealLogEntries(value.entries);
  const subtotal = projectMealLogNutrition(value.subtotal);
  return entries && subtotal ? {
    slot_name_snapshot: value.slot_name_snapshot,
    entries,
    subtotal,
    incomplete_count: value.incomplete_count as number,
  } : null;
}

function projectArray<T>(value: unknown, project: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const projected = value.map(project);
  return projected.some((item) => item === null) ? null : projected as T[];
}

export function projectMealLogData(value: unknown): MealLogMutationData | MealLogDayData | null {
  if (!isRecord(value)) return null;
  if ("entry" in value) {
    if (!hasExactKeys(value, ["entry"])) return null;
    const entry = projectMealLogEntry(value.entry);
    return entry ? { entry } : null;
  }
  if (!hasExactKeys(value, [
    "date", "active_columns", "active_sections", "deleted_column_sections", "entries", "day_total",
  ]) || !isDate(value.date)) return null;
  const activeColumns = projectArray(value.active_columns, projectMealLogColumn);
  const activeSections = projectArray(value.active_sections, projectMealLogActiveSection);
  const deletedSections = projectArray(value.deleted_column_sections, projectMealLogDeletedSection);
  const entries = projectMealLogEntries(value.entries);
  const dayTotal = projectMealLogDayTotal(value.day_total);
  return activeColumns && activeSections && deletedSections && entries && dayTotal ? {
    date: value.date,
    active_columns: activeColumns,
    active_sections: activeSections,
    deleted_column_sections: deletedSections,
    entries,
    day_total: dayTotal,
  } : null;
}

export function projectMealLogRecentData(value: unknown): MealLogRecentData | null {
  if (!isRecord(value) || !hasExactKeys(value, ["items", "has_next"])
    || !Array.isArray(value.items) || typeof value.has_next !== "boolean") return null;
  const projected = value.items.map((item) => {
    if (!isRecord(item) || !hasExactKeys(item, [
      "source_type", "source_id", "display_name", "display_brand", "last_amount", "last_unit",
      "last_date", "last_id", "frequency",
    ]) || !SOURCE_TYPES.includes(item.source_type as MealLogSourceType)
      || !isUuid(item.source_id) || typeof item.display_name !== "string"
      || (item.display_brand !== null && typeof item.display_brand !== "string")
      || typeof item.last_amount !== "number" || !Number.isFinite(item.last_amount) || item.last_amount <= 0
      || !isNonEmptyString(item.last_unit)
      || !Number.isSafeInteger(item.frequency) || Number(item.frequency) < 1
      || typeof item.last_date !== "string" || !isDate(item.last_date) || !isUuid(item.last_id)) return null;
    return {
      publicItem: {
        source: { type: item.source_type as MealLogSourceType, id: item.source_id },
        display_name: item.display_name,
        display_brand: typeof item.display_brand === "string" ? item.display_brand : null,
        last_quantity: { amount: item.last_amount, unit: item.last_unit },
        frequency: item.frequency as number,
      } satisfies MealLogRecentItem,
      date: item.last_date,
      id: item.last_id,
    };
  });
  if (projected.some((item) => item === null)) return null;
  const last = projected.at(-1);
  return {
    items: projected.map((item) => item!.publicItem),
    next_cursor: value.has_next && last ? encodeMealLogRecentCursor(last.date, last.id) : null,
    has_next: value.has_next,
  };
}

export function decodeMealLogRecentCursor(value: string | null) {
  if (value === null) return { date: null, id: null };
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!isRecord(decoded) || decoded.v !== 1 || !isDate(decoded.d) || !isUuid(decoded.i)) return null;
    return { date: decoded.d, id: decoded.i };
  } catch { return null; }
}

export function encodeMealLogRecentCursor(date: string, id: string) {
  return Buffer.from(JSON.stringify({ v: 1, d: date, i: id }), "utf8").toString("base64url");
}
