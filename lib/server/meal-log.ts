import type { MealLogMutationInput, MealLogSourceType } from "@/types/meal-log";
import { fail } from "@/lib/api/response";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_TYPES = ["cooked_batch", "food_product", "ingredient"] as const;

type FieldError = { field: string; reason: string };
export type ParseResult<T> = { ok: true; value: T } | { ok: false; fields: FieldError[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
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
      consumedAt: value.consumed_at as string | null,
      mealPlanColumnId: value.meal_plan_column_id as string,
      source: { type: source.type, id: source.id },
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

export function projectMealLogData(value: unknown) {
  return isRecord(value) ? value : null;
}

export function projectMealLogRecentData(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.items) || typeof value.has_next !== "boolean") return null;
  const projected = value.items.map((item) => {
    if (!isRecord(item) || !SOURCE_TYPES.includes(item.source_type as MealLogSourceType)
      || !isUuid(item.source_id) || typeof item.display_name !== "string"
      || typeof item.last_date !== "string" || !isDate(item.last_date) || !isUuid(item.last_id)) return null;
    return {
      publicItem: {
        source: { type: item.source_type as MealLogSourceType, id: item.source_id },
        display_name: item.display_name,
        display_brand: typeof item.display_brand === "string" ? item.display_brand : null,
        last_quantity: { amount: item.last_amount, unit: item.last_unit },
        frequency: item.frequency,
      },
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
