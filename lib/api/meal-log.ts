import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiError } from "@/types/api";
import type {
  MealLogDayData,
  MealLogEntry,
  MealLogMutationInput,
  MealLogRecentData,
} from "@/types/meal-log";

export type MealLogMutationBody = {
  consumed_local_date: MealLogMutationInput["consumedLocalDate"];
  timezone_name_snapshot: MealLogMutationInput["timezoneNameSnapshot"];
  consumed_at: MealLogMutationInput["consumedAt"];
  meal_plan_column_id: MealLogMutationInput["mealPlanColumnId"];
  source: MealLogMutationInput["source"];
  quantity: MealLogMutationInput["quantity"];
  expected_revision?: number;
};

export type MealLogMutationResponse = { entry: MealLogEntry };

export type MealLogCreateInput = Omit<MealLogMutationInput, "expectedRevision">;
export type MealLogUpdateInput = MealLogMutationInput & { expectedRevision: number };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
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

export interface MealLogApiError extends Error {
  status: number;
  code: string;
  fields: ApiError["fields"];
}

function createMealLogApiError({
  status,
  code,
  fields,
  message,
}: {
  status: number;
  code: string;
  fields: ApiError["fields"];
  message: string;
}) {
  const error = new Error(message) as MealLogApiError;
  error.status = status;
  error.code = code;
  error.fields = fields;
  return error;
}

function invalidResponse(status: number) {
  return createMealLogApiError({
    status,
    code: "INVALID_RESPONSE",
    fields: [],
    message: "서버 응답을 해석하지 못했어요.",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const expectedKeys = new Set(expected);
  return Object.keys(value).length === expected.length
    && Object.keys(value).every((key) => expectedKeys.has(key));
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isApiError(value: unknown): value is ApiError {
  if (!isRecord(value) || !hasExactKeys(value, ["code", "message", "fields"])) return false;
  return isNonEmptyString(value.code)
    && isNonEmptyString(value.message)
    && Array.isArray(value.fields)
    && value.fields.every((field) => isRecord(field)
      && hasExactKeys(field, ["field", "reason"])
      && isNonEmptyString(field.field)
      && isNonEmptyString(field.reason));
}

function isNutrition(value: unknown): boolean {
  if (!isRecord(value) || !hasExactKeys(value, NUTRITION_KEYS)) return false;
  return NUTRITION_STATUSES.includes(value.calculation_status as never)
    && NUTRITION_KEYS.slice(1).every((key) => isNullableFiniteNumber(value[key]));
}

function isSource(value: unknown): boolean {
  return isRecord(value)
    && hasExactKeys(value, ["type", "id"])
    && SOURCE_TYPES.includes(value.type as never)
    && isUuid(value.id);
}

function isQuantity(value: unknown): boolean {
  return isRecord(value)
    && hasExactKeys(value, ["amount", "unit"])
    && typeof value.amount === "number"
    && Number.isFinite(value.amount)
    && value.amount > 0
    && isNonEmptyString(value.unit);
}

function isMealLogEntry(value: unknown): value is MealLogEntry {
  if (!isRecord(value) || !hasExactKeys(value, [
    "id",
    "revision",
    "consumed_at",
    "consumed_local_date",
    "timezone_name_snapshot",
    "meal_plan_column_id",
    "slot_name_snapshot",
    "source",
    "quantity",
    "display_name",
    "display_brand",
    "nutrition",
    "created_at",
    "updated_at",
  ])) return false;
  return isUuid(value.id)
    && isPositiveInteger(value.revision)
    && (value.consumed_at === null || isTimestamp(value.consumed_at))
    && isDate(value.consumed_local_date)
    && isNonEmptyString(value.timezone_name_snapshot)
    && (value.meal_plan_column_id === null || isUuid(value.meal_plan_column_id))
    && isNonEmptyString(value.slot_name_snapshot)
    && isSource(value.source)
    && isQuantity(value.quantity)
    && isNonEmptyString(value.display_name)
    && (value.display_brand === null || typeof value.display_brand === "string")
    && isNutrition(value.nutrition)
    && isTimestamp(value.created_at)
    && isTimestamp(value.updated_at);
}

function isEntryArray(value: unknown): value is MealLogEntry[] {
  return Array.isArray(value) && value.every(isMealLogEntry);
}

function isActiveColumn(value: unknown): boolean {
  return isRecord(value)
    && hasExactKeys(value, ["id", "name", "sort_order"])
    && isUuid(value.id)
    && isNonEmptyString(value.name)
    && Number.isSafeInteger(value.sort_order);
}

function isActiveSection(value: unknown): boolean {
  return isRecord(value)
    && hasExactKeys(value, [
      "meal_plan_column_id",
      "slot_name_snapshot",
      "sort_order",
      "entries",
      "subtotal",
      "incomplete_count",
    ])
    && isUuid(value.meal_plan_column_id)
    && isNonEmptyString(value.slot_name_snapshot)
    && Number.isSafeInteger(value.sort_order)
    && isEntryArray(value.entries)
    && isNutrition(value.subtotal)
    && isNonNegativeInteger(value.incomplete_count);
}

function isDeletedSection(value: unknown): boolean {
  return isRecord(value)
    && hasExactKeys(value, ["slot_name_snapshot", "entries", "subtotal", "incomplete_count"])
    && isNonEmptyString(value.slot_name_snapshot)
    && isEntryArray(value.entries)
    && isNutrition(value.subtotal)
    && isNonNegativeInteger(value.incomplete_count);
}

function isDayTotal(value: unknown): boolean {
  return isRecord(value)
    && hasExactKeys(value, [...NUTRITION_KEYS, "incomplete_count"])
    && NUTRITION_STATUSES.includes(value.calculation_status as never)
    && NUTRITION_KEYS.slice(1).every((key) => isNullableFiniteNumber(value[key]))
    && isNonNegativeInteger(value.incomplete_count);
}

function isMealLogDayData(value: unknown): value is MealLogDayData {
  return isRecord(value)
    && hasExactKeys(value, [
      "date",
      "active_columns",
      "active_sections",
      "deleted_column_sections",
      "entries",
      "day_total",
    ])
    && isDate(value.date)
    && Array.isArray(value.active_columns)
    && value.active_columns.every(isActiveColumn)
    && Array.isArray(value.active_sections)
    && value.active_sections.every(isActiveSection)
    && Array.isArray(value.deleted_column_sections)
    && value.deleted_column_sections.every(isDeletedSection)
    && isEntryArray(value.entries)
    && isDayTotal(value.day_total);
}

function isRecentItem(value: unknown): boolean {
  return isRecord(value)
    && hasExactKeys(value, [
      "source",
      "display_name",
      "display_brand",
      "last_quantity",
      "frequency",
    ])
    && isSource(value.source)
    && isNonEmptyString(value.display_name)
    && (value.display_brand === null || typeof value.display_brand === "string")
    && isQuantity(value.last_quantity)
    && isPositiveInteger(value.frequency);
}

function isMealLogRecentData(value: unknown): value is MealLogRecentData {
  if (!isRecord(value)
    || !hasExactKeys(value, ["items", "next_cursor", "has_next"])
    || !Array.isArray(value.items)
    || !value.items.every(isRecentItem)
    || typeof value.has_next !== "boolean") return false;
  return value.has_next
    ? isNonEmptyString(value.next_cursor)
    : value.next_cursor === null;
}

function isMutationResponse(value: unknown): value is MealLogMutationResponse {
  return isRecord(value)
    && hasExactKeys(value, ["entry"])
    && isMealLogEntry(value.entry);
}

function requireUuid(value: unknown) {
  if (!isUuid(value)) throw invalidResponse(0);
  return value;
}

async function requestMealLog<T>(
  input: string,
  validate: (value: unknown) => value is T,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, withE2EAuthOverrideHeaders(init));
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw invalidResponse(response.status);
  }

  if (!isRecord(payload)
    || !hasExactKeys(payload, ["success", "data", "error"])
    || typeof payload.success !== "boolean") {
    throw invalidResponse(response.status);
  }

  if (response.ok) {
    if (payload.success !== true || payload.error !== null || !validate(payload.data)) {
      throw invalidResponse(response.status);
    }
    return payload.data;
  }

  if (payload.success !== false || payload.data !== null || !isApiError(payload.error)) {
    throw invalidResponse(response.status);
  }

  throw createMealLogApiError({
    status: response.status,
    code: payload.error.code,
    fields: payload.error.fields,
    message: payload.error.message,
  });
}

function mutationBody(input: MealLogCreateInput | MealLogUpdateInput): MealLogMutationBody {
  const expectedRevision = "expectedRevision" in input
    ? input.expectedRevision
    : null;

  return {
    consumed_local_date: input.consumedLocalDate,
    timezone_name_snapshot: input.timezoneNameSnapshot,
    consumed_at: input.consumedAt,
    meal_plan_column_id: input.mealPlanColumnId,
    source: input.source,
    quantity: input.quantity,
    ...(expectedRevision === null ? {} : { expected_revision: expectedRevision }),
  };
}

function mutationRequest(
  method: "POST" | "PATCH" | "DELETE",
  body: unknown,
  idempotencyKey: string,
): RequestInit {
  return {
    method,
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  };
}

export function isMealLogApiError(error: unknown): error is MealLogApiError {
  return error instanceof Error
    && "status" in error
    && "code" in error
    && "fields" in error;
}

export async function fetchMealLogDay(date: string) {
  const params = new URLSearchParams({ date });
  return requestMealLog(`/api/v1/meal-log?${params.toString()}`, isMealLogDayData);
}

export async function fetchMealLogRecent({
  cursor,
  limit = 20,
}: {
  cursor?: string | null;
  limit?: number;
} = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return requestMealLog(`/api/v1/meal-log/recent?${params.toString()}`, isMealLogRecentData);
}

export async function createMealLogEntry(
  input: MealLogCreateInput,
  idempotencyKey: string,
) {
  const data = await requestMealLog(
    "/api/v1/meal-log/entries",
    isMutationResponse,
    mutationRequest("POST", mutationBody(input), requireUuid(idempotencyKey)),
  );
  return data.entry;
}

export async function updateMealLogEntry(
  entryId: string,
  input: MealLogUpdateInput,
  idempotencyKey: string,
) {
  const encodedEntryId = encodeURIComponent(requireUuid(entryId));
  const data = await requestMealLog(
    `/api/v1/meal-log/entries/${encodedEntryId}`,
    isMutationResponse,
    mutationRequest("PATCH", mutationBody(input), requireUuid(idempotencyKey)),
  );
  return data.entry;
}

export async function deleteMealLogEntry(
  entryId: string,
  expectedRevision: number,
  idempotencyKey: string,
) {
  const encodedEntryId = encodeURIComponent(requireUuid(entryId));
  const data = await requestMealLog(
    `/api/v1/meal-log/entries/${encodedEntryId}`,
    isMutationResponse,
    mutationRequest("DELETE", { expected_revision: expectedRevision }, requireUuid(idempotencyKey)),
  );
  return data.entry;
}
