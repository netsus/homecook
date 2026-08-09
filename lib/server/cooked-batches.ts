import { fail } from "@/lib/api/response";
import { calculateUserProgressLevel } from "@/lib/server/user-progress";
import type { UserGamificationDbClient } from "@/lib/server/user-gamification";
import type { UserProgressData, UserProgressEventCounts } from "@/types/user-progress";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MUTATION_ACTIONS = [
  "set_finished_weight",
  "mark_unrecoverable",
  "discard",
  "adjust",
  "close",
  "cancel_current",
] as const;
const WEIGHT_STATUSES = ["known", "missing", "unrecoverable"] as const;
const BATCH_STATUSES = ["available", "depleted"] as const;
const DEPLETED_REASONS = [
  "consumed",
  "discarded",
  "mixed",
  "consumed_unweighed",
  "discarded_unweighed",
  "mixed_unweighed",
] as const;
const NUTRITION_STATUSES = ["complete", "partial", "unavailable"] as const;

type ValidationField = { field: string; reason: string };
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; fields: ValidationField[] };

export interface CookedBatchRpcClient {
  rpc(
    functionName: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

interface ProjectionLookupQuery {
  eq(column: string, value: string): ProjectionLookupQuery;
  maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>;
}

interface ProjectionLookupClient {
  from(table: string): {
    select(columns: string): ProjectionLookupQuery;
  };
}

export interface CookedBatchProjection {
  id: string;
  recipe_id: string;
  recipe_title: string;
  recipe_thumbnail_url: string | null;
  status: "leftover" | "eaten";
  cooked_at: string;
  cooking_servings: number | null;
  finished_weight_g: number | null;
  remaining_weight_g: number | null;
  weight_status: "known" | "missing" | "unrecoverable" | null;
  batch_status: "available" | "depleted" | null;
  depleted_reason: typeof DEPLETED_REASONS[number] | null;
  revision: number | null;
  nutrition_calculation_status: typeof NUTRITION_STATUSES[number] | null;
  current_unweighed_closure_event_id: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonZeroNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value !== 0;
}

function invalid(fields: ValidationField[]): ValidationResult<never> {
  return { ok: false, fields };
}

export function parseSnapshotV2CompleteRequest(value: unknown) {
  if (!isRecord(value)) return invalid([{ field: "body", reason: "invalid_json" }]);
  const fields: ValidationField[] = [];
  if (!hasOnlyKeys(value, [
    "consumed_pantry_item_ids",
    "weight_action",
    "finished_weight_g",
  ])) fields.push({ field: "body", reason: "unknown_field" });
  const ids = Array.isArray(value.consumed_pantry_item_ids)
    ? value.consumed_pantry_item_ids
    : null;
  if (!ids || ids.some((id) => !isUuid(id)) || new Set(ids).size !== ids.length) {
    fields.push({ field: "consumed_pantry_item_ids", reason: "invalid_uuid_set" });
  }
  if (value.weight_action === "set_finished_weight") {
    if (!isPositiveNumber(value.finished_weight_g)) {
      fields.push({ field: "finished_weight_g", reason: "invalid_positive_number" });
    }
  } else if (value.weight_action === "weigh_later") {
    if (value.finished_weight_g !== null) {
      fields.push({ field: "finished_weight_g", reason: "must_be_null" });
    }
  } else {
    fields.push({ field: "weight_action", reason: "invalid_enum" });
  }
  if (fields.length > 0 || !ids) return invalid(fields);
  return {
    ok: true as const,
    value: {
      consumedPantryItemIds: [...ids] as string[],
      weightAction: value.weight_action as "set_finished_weight" | "weigh_later",
      finishedWeightG: value.finished_weight_g as number | null,
    },
  };
}

export function parseBatchWeightRequest(value: unknown) {
  if (!isRecord(value)) return invalid([{ field: "body", reason: "invalid_json" }]);
  if (value.action === "set_finished_weight") {
    if (!hasOnlyKeys(value, ["action", "finished_weight_g", "expected_revision"])) {
      return invalid([{ field: "body", reason: "unknown_field" }]);
    }
    const fields: ValidationField[] = [];
    if (!isPositiveNumber(value.finished_weight_g)) fields.push({ field: "finished_weight_g", reason: "invalid_positive_number" });
    if (!isPositiveInteger(value.expected_revision)) fields.push({ field: "expected_revision", reason: "invalid_integer" });
    return fields.length > 0 ? invalid(fields) : {
      ok: true as const,
      value: { action: "set_finished_weight" as const, finishedWeightG: value.finished_weight_g as number, expectedRevision: value.expected_revision as number },
    };
  }
  if (value.action === "mark_unrecoverable") {
    if (!hasOnlyKeys(value, ["action", "expected_revision"])) {
      return invalid([{ field: "body", reason: "unknown_field" }]);
    }
    return isPositiveInteger(value.expected_revision)
      ? { ok: true as const, value: { action: "mark_unrecoverable" as const, finishedWeightG: null, expectedRevision: value.expected_revision } }
      : invalid([{ field: "expected_revision", reason: "invalid_integer" }]);
  }
  return invalid([{ field: "action", reason: "invalid_enum" }]);
}

export function parseBatchDiscardRequest(value: unknown) {
  if (!isRecord(value)) return invalid([{ field: "body", reason: "invalid_json" }]);
  const fields: ValidationField[] = [];
  if (!hasOnlyKeys(value, ["discarded_g", "reason", "expected_revision"])) fields.push({ field: "body", reason: "unknown_field" });
  if (!isPositiveNumber(value.discarded_g)) fields.push({ field: "discarded_g", reason: "invalid_positive_number" });
  if (typeof value.reason !== "string" || value.reason.trim().length === 0) fields.push({ field: "reason", reason: "required" });
  if (!isPositiveInteger(value.expected_revision)) fields.push({ field: "expected_revision", reason: "invalid_integer" });
  return fields.length > 0 ? invalid(fields) : {
    ok: true as const,
    value: { discardedG: value.discarded_g as number, reason: String(value.reason).trim(), expectedRevision: value.expected_revision as number },
  };
}

export function parseBatchAdjustmentRequest(value: unknown) {
  if (!isRecord(value)) return invalid([{ field: "body", reason: "invalid_json" }]);
  const fields: ValidationField[] = [];
  if (!hasOnlyKeys(value, ["delta_g", "reason", "expected_revision"])) fields.push({ field: "body", reason: "unknown_field" });
  if (!isNonZeroNumber(value.delta_g)) fields.push({ field: "delta_g", reason: "invalid_nonzero_number" });
  if (typeof value.reason !== "string" || value.reason.trim().length === 0) fields.push({ field: "reason", reason: "required" });
  if (!isPositiveInteger(value.expected_revision)) fields.push({ field: "expected_revision", reason: "invalid_integer" });
  return fields.length > 0 ? invalid(fields) : {
    ok: true as const,
    value: { deltaG: value.delta_g as number, reason: String(value.reason).trim(), expectedRevision: value.expected_revision as number },
  };
}

export function parseBatchCloseRequest(value: unknown) {
  if (!isRecord(value)) return invalid([{ field: "body", reason: "invalid_json" }]);
  if (value.action === "close") {
    const fields: ValidationField[] = [];
    if (!hasOnlyKeys(value, ["action", "closure_reason", "expected_revision"])) fields.push({ field: "body", reason: "unknown_field" });
    if (!["consumed", "discarded", "mixed"].includes(String(value.closure_reason))) fields.push({ field: "closure_reason", reason: "invalid_enum" });
    if (!isPositiveInteger(value.expected_revision)) fields.push({ field: "expected_revision", reason: "invalid_integer" });
    return fields.length > 0 ? invalid(fields) : {
      ok: true as const,
      value: { action: "close" as const, closureReason: value.closure_reason as "consumed" | "discarded" | "mixed", reversesEventId: null, expectedRevision: value.expected_revision as number },
    };
  }
  if (value.action === "cancel_current") {
    const fields: ValidationField[] = [];
    if (!hasOnlyKeys(value, ["action", "reverses_event_id", "expected_revision"])) fields.push({ field: "body", reason: "unknown_field" });
    if (!isUuid(value.reverses_event_id)) fields.push({ field: "reverses_event_id", reason: "invalid_uuid" });
    if (!isPositiveInteger(value.expected_revision)) fields.push({ field: "expected_revision", reason: "invalid_integer" });
    return fields.length > 0 ? invalid(fields) : {
      ok: true as const,
      value: { action: "cancel_current" as const, closureReason: null, reversesEventId: value.reverses_event_id as string, expectedRevision: value.expected_revision as number },
    };
  }
  return invalid([{ field: "action", reason: "invalid_enum" }]);
}

function isNullableNumber(value: unknown) {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function includes<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export function projectCookedBatch(value: unknown): CookedBatchProjection | null {
  if (!isRecord(value)
    || !isUuid(value.id)
    || !isUuid(value.recipe_id)
    || typeof value.recipe_title !== "string"
    || (value.recipe_thumbnail_url !== null && typeof value.recipe_thumbnail_url !== "string")
    || !["leftover", "eaten"].includes(String(value.status))
    || typeof value.cooked_at !== "string"
    || !Number.isFinite(Date.parse(value.cooked_at))
    || (value.cooking_servings !== null && !isPositiveInteger(value.cooking_servings))
    || !isNullableNumber(value.finished_weight_g)
    || !isNullableNumber(value.remaining_weight_g)
    || (value.weight_status !== null && !includes(WEIGHT_STATUSES, value.weight_status))
    || (value.batch_status !== null && !includes(BATCH_STATUSES, value.batch_status))
    || (value.depleted_reason !== null && !includes(DEPLETED_REASONS, value.depleted_reason))
    || (value.revision !== null && !isPositiveInteger(value.revision))
    || (value.nutrition_calculation_status !== null && !includes(NUTRITION_STATUSES, value.nutrition_calculation_status))
    || (value.current_unweighed_closure_event_id !== null && !isUuid(value.current_unweighed_closure_event_id))) return null;

  const status = value.batch_status === "depleted"
      && ["consumed", "consumed_unweighed"].includes(String(value.depleted_reason))
    ? "eaten"
    : value.batch_status === null ? value.status as "leftover" | "eaten" : "leftover";
  return {
    id: value.id,
    recipe_id: value.recipe_id,
    recipe_title: value.recipe_title,
    recipe_thumbnail_url: value.recipe_thumbnail_url as string | null,
    status,
    cooked_at: value.cooked_at,
    cooking_servings: value.cooking_servings as number | null,
    finished_weight_g: value.finished_weight_g as number | null,
    remaining_weight_g: value.remaining_weight_g as number | null,
    weight_status: value.weight_status as CookedBatchProjection["weight_status"],
    batch_status: value.batch_status as CookedBatchProjection["batch_status"],
    depleted_reason: value.depleted_reason as CookedBatchProjection["depleted_reason"],
    revision: value.revision as number | null,
    nutrition_calculation_status: value.nutrition_calculation_status as CookedBatchProjection["nutrition_calculation_status"],
    current_unweighed_closure_event_id: value.current_unweighed_closure_event_id as string | null,
  };
}

export function projectSnapshotV2CompleteData(value: unknown) {
  if (!isRecord(value) || !isUuid(value.session_id) || value.contract_version !== "snapshot_v2"
    || !["planner", "standalone"].includes(String(value.mode)) || value.status !== "completed"
    || !Number.isSafeInteger(value.meals_updated) || Number(value.meals_updated) < 0
    || !Number.isSafeInteger(value.pantry_removed) || Number(value.pantry_removed) < 0
    || !Number.isSafeInteger(value.cook_count) || Number(value.cook_count) < 0) return null;
  const cookedBatch = projectCookedBatch(value.cooked_batch);
  if (!cookedBatch) return null;
  return {
    session_id: value.session_id,
    contract_version: "snapshot_v2" as const,
    mode: value.mode as "planner" | "standalone",
    status: "completed" as const,
    cooked_batch: cookedBatch,
    meals_updated: value.meals_updated,
    pantry_removed: value.pantry_removed,
    cook_count: value.cook_count,
  };
}

export function projectCookedBatchMutationData(value: unknown) {
  if (!isRecord(value) || !includes(MUTATION_ACTIONS, value.action)) return null;
  const batch = projectCookedBatch(value.batch);
  if (!batch) return null;
  if (value.action === "set_finished_weight" ? value.event_id !== null : !isUuid(value.event_id)) return null;
  return { action: value.action, batch, event_id: value.event_id as string | null };
}

export interface CookedBatchCursor {
  availability: "loggable" | "all";
  cookedAt: string;
  id: string;
}

export function encodeCookedBatchCursor(cursor: CookedBatchCursor) {
  return Buffer.from(JSON.stringify({ v: 1, a: cursor.availability, t: cursor.cookedAt, i: cursor.id }), "utf8").toString("base64url");
}

export function decodeCookedBatchCursor(value: string, availability: "loggable" | "all"): CookedBatchCursor | null {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) return null;
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) return null;
    const parsed = JSON.parse(bytes.toString("utf8"));
    if (!isRecord(parsed) || parsed.v !== 1 || parsed.a !== availability || typeof parsed.t !== "string"
      || !Number.isFinite(Date.parse(parsed.t)) || !isUuid(parsed.i)) return null;
    return { availability, cookedAt: parsed.t, id: parsed.i };
  } catch { return null; }
}

export function parseCookedBatchListQuery(params: URLSearchParams) {
  const availability = params.get("availability") ?? "loggable";
  const limitText = params.get("limit");
  const cursorText = params.get("cursor");
  const cursorPresent = params.has("cursor");
  const fields: ValidationField[] = [];
  if (availability !== "loggable" && availability !== "all") fields.push({ field: "availability", reason: "invalid_enum" });
  const limit = limitText === null ? 20 : Number(limitText);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50 || (limitText !== null && !/^\d+$/.test(limitText))) fields.push({ field: "limit", reason: "invalid_integer" });
  const cursor = cursorText && (availability === "loggable" || availability === "all")
    ? decodeCookedBatchCursor(cursorText, availability) : null;
  if (cursorPresent && !cursor) fields.push({ field: "cursor", reason: "invalid_cursor" });
  return fields.length > 0 ? invalid(fields) : {
    ok: true as const,
    value: { availability: availability as "loggable" | "all", limit, cursor },
  };
}

export function projectCookedBatchListData(value: unknown, availability: "loggable" | "all") {
  if (!isRecord(value) || !Array.isArray(value.items) || typeof value.has_next !== "boolean") return null;
  const items = value.items.map(projectCookedBatch);
  if (items.some((item) => item === null)) return null;
  const last = items.at(-1);
  return {
    items: items as CookedBatchProjection[],
    next_cursor: value.has_next && last ? encodeCookedBatchCursor({ availability, cookedAt: last.cooked_at, id: last.id }) : null,
    has_next: value.has_next,
  };
}

const RPC_ERRORS = {
  ACCOUNT_CUTOVER_QUARANTINED: [409, "계정 복구가 필요해요."],
  ACCOUNT_DELETING: [409, "계정 삭제가 진행 중이에요."],
  ACCOUNT_GENERATION_STALE: [409, "계정 상태를 다시 확인해 주세요."],
  ACCOUNT_LIFECYCLE_MAINTENANCE: [503, "계정 정비 작업 중이에요. 잠시 후 다시 시도해 주세요."],
  ACCOUNT_SESSION_STALE: [409, "세션을 다시 확인해 주세요."],
  BATCH_ADJUSTMENT_INVALID: [409, "보정할 수 있는 중량 범위를 확인해 주세요."],
  CONFLICT: [409, "현재 상태에서는 요청을 처리할 수 없어요."],
  IDEMPOTENCY_KEY_REUSED: [409, "이미 다른 요청에 사용된 요청 키예요."],
  RESOURCE_NOT_FOUND: [404, "요청한 항목을 찾을 수 없어요."],
  VALIDATION_ERROR: [422, "요청 값을 확인해 주세요."],
  WEIGHT_UNRECOVERABLE: [409, "원래 완성 중량을 확인할 수 없는 요리예요."],
} as const;

function readErrorText(error: unknown) {
  if (!isRecord(error)) return typeof error === "string" ? error : "";
  return [error.code, error.message, error.details, error.hint].filter((item) => typeof item === "string").join(" ");
}

function rpcError(error: unknown) {
  const text = readErrorText(error);
  const code = (Object.keys(RPC_ERRORS) as Array<keyof typeof RPC_ERRORS>).find((item) => text.includes(item));
  if (!code) return fail("INTERNAL_ERROR", "요청을 처리하지 못했어요.", 500);
  const [status, message] = RPC_ERRORS[code];
  return fail(code, message, status);
}

export async function callCookedBatchRpc(client: CookedBatchRpcClient, functionName: string, args: Record<string, unknown>) {
  try {
    const result = await client.rpc(functionName, args);
    if (result.error) return { ok: false as const, response: rpcError(result.error) };
    if (isRecord(result.data) && typeof result.data.success === "boolean") {
      if (!result.data.success) return { ok: false as const, response: rpcError(result.data.error) };
      return { ok: true as const, data: result.data.data };
    }
    return { ok: true as const, data: result.data };
  } catch {
    return { ok: false as const, response: fail("INTERNAL_ERROR", "요청을 처리하지 못했어요.", 500) };
  }
}

function readProgressEventCounts(value: unknown): UserProgressEventCounts | null {
  if (!isRecord(value)) return null;
  const requiredKeys = [
    "cooking_completed",
    "shopping_completed",
    "recipe_saved_distinct_ever",
    "custom_book_created",
    "planner_registered_first",
    "planner_registered_repeat",
  ] as const;
  if (!requiredKeys.every((key) => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0)) {
    return null;
  }
  if (value.leftover_eaten !== undefined
    && (!Number.isSafeInteger(value.leftover_eaten) || Number(value.leftover_eaten) < 0)) {
    return null;
  }
  return {
    cooking_completed: Number(value.cooking_completed),
    shopping_completed: Number(value.shopping_completed),
    recipe_saved_distinct_ever: Number(value.recipe_saved_distinct_ever),
    custom_book_created: Number(value.custom_book_created),
    planner_registered_first: Number(value.planner_registered_first),
    planner_registered_repeat: Number(value.planner_registered_repeat),
    ...(value.leftover_eaten === undefined
      ? {}
      : { leftover_eaten: Number(value.leftover_eaten) }),
  };
}

/**
 * Replays the established live gamification projection from canonical ledger rows.
 * The projection writers are idempotent, while the RPC transaction remains the
 * sole authority for progress and activity ledger mutations.
 */
export async function projectCookedBatchGamification(
  dbClient: unknown,
  ownerId: string,
  eventType: "cooking_completed" | "leftover_eaten",
  sourceId: string,
) {
  if (!isUuid(ownerId) || !isUuid(sourceId)) return;
  try {
    const lookupClient = dbClient as ProjectionLookupClient;
    const progressEventResult = await lookupClient
      .from("user_progress_events")
      .select("id,xp_delta,occurred_at,source_meta_json")
      .eq("user_id", ownerId)
      .eq("event_type", eventType)
      .eq("source_key", `${eventType}:${sourceId}`)
      .maybeSingle();
    const summaryResult = await lookupClient
      .from("user_progress_summary")
      .select("total_xp,event_counts,last_updated_at")
      .eq("user_id", ownerId)
      .maybeSingle();
    if (progressEventResult.error || summaryResult.error
      || !isRecord(progressEventResult.data) || !isRecord(summaryResult.data)
      || !isUuid(progressEventResult.data.id)
      || !isPositiveNumber(progressEventResult.data.xp_delta)
      || typeof progressEventResult.data.occurred_at !== "string"
      || !Number.isSafeInteger(summaryResult.data.total_xp)
      || Number(summaryResult.data.total_xp) < 0
      || typeof summaryResult.data.last_updated_at !== "string") {
      return;
    }
    const eventCounts = readProgressEventCounts(summaryResult.data.event_counts);
    if (!eventCounts) return;
    const totalXp = Number(summaryResult.data.total_xp);
    const xpDelta = Number(progressEventResult.data.xp_delta);
    const sourceMeta = isRecord(progressEventResult.data.source_meta_json)
      ? progressEventResult.data.source_meta_json
      : {};
    const storedPreviousLevel = sourceMeta.previous_level;
    const previousLevel = isPositiveInteger(storedPreviousLevel)
      ? Number(storedPreviousLevel)
      : calculateUserProgressLevel(Math.max(0, totalXp - xpDelta)).current_level;
    const progress: UserProgressData = {
      level: calculateUserProgressLevel(totalXp),
      event_counts: eventCounts,
      last_updated_at: summaryResult.data.last_updated_at,
    };
    const gamification = await import("@/lib/server/user-gamification");
    await gamification.projectUserGamificationAfterProgressEvent(
      dbClient as UserGamificationDbClient,
      {
        userId: ownerId,
        progressEventId: progressEventResult.data.id,
        awardInput: {
          userId: ownerId,
          eventType,
          sourceTable: "leftover_dishes",
          sourceId,
          occurredAt: progressEventResult.data.occurred_at,
        },
        xpDelta,
        previousLevel,
        progress,
      },
    );

    if (eventType === "leftover_eaten") {
      const activityResult = await lookupClient
        .from("user_growth_activity_events")
        .select("id,occurred_at")
        .eq("user_id", ownerId)
        .eq("activity_type", "leftover_eaten")
        .eq("source_key", `leftover_eaten:${sourceId}`)
        .maybeSingle();
      if (!activityResult.error && isRecord(activityResult.data)
        && isUuid(activityResult.data.id)) {
        await gamification.projectUserGamificationAfterActivityEvent(
          dbClient as Parameters<typeof gamification.projectUserGamificationAfterActivityEvent>[0],
          {
            userId: ownerId,
            activityId: activityResult.data.id,
            occurredAt: typeof activityResult.data.occurred_at === "string"
              ? activityResult.data.occurred_at
              : progressEventResult.data.occurred_at,
          },
        );
      }
    }
  } catch {
    // Live rewards are secondary; the transactional progress/activity ledgers stay authoritative.
  }
}
