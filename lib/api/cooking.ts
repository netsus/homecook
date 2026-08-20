import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiError, ApiResponse } from "@/types/api";
import type {
  CookingSessionCancelData,
  CookingSessionCompleteData,
  CookingSessionCookModeData,
  CookingSessionCreateData,
  CookingStandaloneCompleteData,
  CookingStandaloneCookModeData,
  CookedBatchProjection,
  SnapshotV2CancelData,
  SnapshotV2CompleteBody,
  SnapshotV2CompleteData,
  SnapshotV2CookModeData,
  SnapshotV2StartData,
} from "@/types/cooking";

export interface CookedBatchListData {
  items: CookedBatchProjection[];
  next_cursor: string | null;
  has_next: boolean;
}

export interface CookedBatchMutationData {
  action: "set_finished_weight" | "mark_unrecoverable" | "discard" | "adjust" | "close" | "cancel_current";
  batch: CookedBatchProjection;
  event_id: string | null;
}

export type CookedBatchWeightBody =
  | { action: "set_finished_weight"; finished_weight_g: number; expected_revision: number }
  | { action: "mark_unrecoverable"; expected_revision: number };

export interface CookedBatchDiscardBody {
  discarded_g: number;
  reason: string;
  expected_revision: number;
}

export interface CookedBatchAdjustmentBody {
  delta_g: number;
  reason: string;
  expected_revision: number;
}

export type CookedBatchCloseBody =
  | { action: "close"; closure_reason: "consumed" | "discarded" | "mixed"; expected_revision: number }
  | { action: "cancel_current"; reverses_event_id: string; expected_revision: number };

export interface CookingApiError extends Error {
  status: number;
  code: string;
  fields: ApiError["fields"];
}

type SnapshotV2SessionMode = SnapshotV2CompleteData["mode"];

const MAX_REMEMBERED_SNAPSHOT_V2_SESSIONS = 32;
const snapshotV2SessionModes = new Map<string, SnapshotV2SessionMode>();

function rememberSnapshotV2SessionMode(sessionId: string, mode: SnapshotV2SessionMode) {
  snapshotV2SessionModes.delete(sessionId);
  snapshotV2SessionModes.set(sessionId, mode);
  if (snapshotV2SessionModes.size <= MAX_REMEMBERED_SNAPSHOT_V2_SESSIONS) return;
  const oldestSessionId = snapshotV2SessionModes.keys().next().value;
  if (oldestSessionId !== undefined) snapshotV2SessionModes.delete(oldestSessionId);
}

export async function createSnapshotV2CookingSession(body: { mode: "planner"; meal_ids: string[]; expected_meal_revisions: Record<string, number> } | { mode: "standalone"; recipe_id: string; expected_recipe_revision: number; cooking_servings: number }, idempotencyKey = crypto.randomUUID()): Promise<SnapshotV2StartData> {
  const data = await requestCooking<SnapshotV2StartData>("/api/v1/cooking/session-attempts", { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify(body) });
  if (!isExactSnapshotV2StartData(data, body)) throw createCookingApiError({ status: 502, code: "INVALID_RESPONSE", fields: [], message: "요리 세션 응답을 확인하지 못했어요." });
  return data;
}

export async function fetchSnapshotV2CookMode(sessionId: string): Promise<SnapshotV2CookModeData> {
  snapshotV2SessionModes.delete(sessionId);
  const data = await requestCooking<SnapshotV2CookModeData>(`/api/v1/cooking/session-attempts/${sessionId}/cook-mode`);
  if (
    data.session_id !== sessionId
    || data.contract_version !== "snapshot_v2"
    || (data.mode !== "planner" && data.mode !== "standalone")
  ) throw createCookingApiError({ status: 502, code: "INVALID_RESPONSE", fields: [], message: "요리 세션 버전을 확인하지 못했어요." });
  rememberSnapshotV2SessionMode(sessionId, data.mode);
  return data;
}

export async function cancelSnapshotV2CookingSession(sessionId: string, idempotencyKey: string): Promise<SnapshotV2CancelData> {
  const expectedMode = snapshotV2SessionModes.get(sessionId);
  const data = await requestCooking<SnapshotV2CancelData>(`/api/v1/cooking/session-attempts/${sessionId}/cancel`, { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify({}) });
  if (
    data.session_id !== sessionId
    || data.contract_version !== "snapshot_v2"
    || (data.mode !== "planner" && data.mode !== "standalone")
    || (expectedMode !== undefined && data.mode !== expectedMode)
    || data.status !== "cancelled"
  ) throw createCookingApiError({ status: 502, code: "INVALID_RESPONSE", fields: [], message: "요리 세션 버전을 확인하지 못했어요." });
  snapshotV2SessionModes.delete(sessionId);
  return data;
}

export async function completeSnapshotV2CookingSession(
  sessionId: string,
  body: SnapshotV2CompleteBody,
  idempotencyKey: string,
  expectedMode = snapshotV2SessionModes.get(sessionId),
): Promise<SnapshotV2CompleteData> {
  if (!expectedMode) {
    throw createCookingApiError({
      status: 502,
      code: "INVALID_RESPONSE",
      fields: [],
      message: "요리 완료 결과를 확인하지 못했어요.",
    });
  }
  const data = await requestCooking<SnapshotV2CompleteData>(
    `/api/v1/cooking/session-attempts/${sessionId}/complete`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
    },
  );
  if (!isExactSnapshotV2CompleteData(data, {
    body,
    mode: expectedMode,
    sessionId,
  })) {
    throw createCookingApiError({
      status: 502,
      code: "INVALID_RESPONSE",
      fields: [],
      message: "요리 완료 결과를 확인하지 못했어요.",
    });
  }
  snapshotV2SessionModes.delete(sessionId);
  return data;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}

function isExactSnapshotV2StartData(
  value: unknown,
  request: { mode: "planner"; meal_ids: string[]; expected_meal_revisions: Record<string, number> } | { mode: "standalone"; recipe_id: string; expected_recipe_revision: number; cooking_servings: number },
): value is SnapshotV2StartData {
  if (!isRecord(value) || !hasExactKeys(value, ["session_id", "contract_version", "mode", "status", "content_summary"])) return false;
  if (typeof value.session_id !== "string" || !UUID_PATTERN.test(value.session_id) || value.contract_version !== "snapshot_v2" || value.mode !== request.mode || value.status !== "in_progress") return false;
  const summary = value.content_summary;
  const exactSummary = isRecord(summary)
    && hasExactKeys(summary, ["recipe_id", "title", "cooking_servings"])
    && typeof summary.recipe_id === "string"
    && UUID_PATTERN.test(summary.recipe_id)
    && typeof summary.title === "string"
    && summary.title.trim().length > 0
    && Number.isInteger(summary.cooking_servings)
    && Number(summary.cooking_servings) > 0;
  if (!exactSummary) return false;
  return request.mode === "planner"
    || (summary.recipe_id === request.recipe_id
      && summary.cooking_servings === request.cooking_servings);
}

const COOKED_BATCH_KEYS = [
  "id",
  "recipe_id",
  "recipe_title",
  "recipe_thumbnail_url",
  "status",
  "cooked_at",
  "cooking_servings",
  "finished_weight_g",
  "remaining_weight_g",
  "weight_status",
  "batch_status",
  "depleted_reason",
  "revision",
  "nutrition_calculation_status",
  "current_unweighed_closure_event_id",
];

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isExactCookedBatchProjection(value: unknown): value is CookedBatchProjection {
  if (!isRecord(value) || !hasExactKeys(value, COOKED_BATCH_KEYS)) return false;
  return typeof value.id === "string"
    && UUID_PATTERN.test(value.id)
    && typeof value.recipe_id === "string"
    && UUID_PATTERN.test(value.recipe_id)
    && typeof value.recipe_title === "string"
    && value.recipe_title.trim().length > 0
    && (value.recipe_thumbnail_url === null || typeof value.recipe_thumbnail_url === "string")
    && (value.status === "leftover" || value.status === "eaten")
    && typeof value.cooked_at === "string"
    && Number.isFinite(Date.parse(value.cooked_at))
    && (value.cooking_servings === null || isPositiveInteger(value.cooking_servings))
    && isNullableFiniteNumber(value.finished_weight_g)
    && isNullableFiniteNumber(value.remaining_weight_g)
    && (value.weight_status === null || ["known", "missing", "unrecoverable"].includes(String(value.weight_status)))
    && (value.batch_status === null || ["available", "depleted"].includes(String(value.batch_status)))
    && (value.depleted_reason === null || ["consumed", "discarded", "mixed", "consumed_unweighed", "discarded_unweighed", "mixed_unweighed"].includes(String(value.depleted_reason)))
    && (value.revision === null || isPositiveInteger(value.revision))
    && (value.nutrition_calculation_status === null || ["complete", "partial", "unavailable"].includes(String(value.nutrition_calculation_status)))
    && (value.current_unweighed_closure_event_id === null
      || (typeof value.current_unweighed_closure_event_id === "string" && UUID_PATTERN.test(value.current_unweighed_closure_event_id)));
}

function isExactSnapshotV2CompleteData(
  value: unknown,
  request: {
    body: SnapshotV2CompleteBody;
    mode: SnapshotV2SessionMode;
    sessionId: string;
  },
): value is SnapshotV2CompleteData {
  if (!isRecord(value) || !hasExactKeys(value, [
    "session_id",
    "contract_version",
    "mode",
    "status",
    "cooked_batch",
    "meals_updated",
    "pantry_removed",
    "cook_count",
  ])) return false;
  if (
    value.session_id !== request.sessionId
    || value.contract_version !== "snapshot_v2"
    || value.mode !== request.mode
    || value.status !== "completed"
    || !Number.isSafeInteger(value.meals_updated)
    || Number(value.meals_updated) < 0
    || (request.mode === "standalone" && value.meals_updated !== 0)
    || !Number.isSafeInteger(value.pantry_removed)
    || Number(value.pantry_removed) < 0
    || !Number.isSafeInteger(value.cook_count)
    || Number(value.cook_count) < 0
  ) return false;

  const batch = value.cooked_batch;
  if (!isExactCookedBatchProjection(batch)) return false;
  const hasRequestedInitialWeight = request.body.weight_action === "set_finished_weight"
    ? batch.weight_status === "known"
      && batch.finished_weight_g === request.body.finished_weight_g
      && batch.remaining_weight_g === request.body.finished_weight_g
    : batch.weight_status === "missing"
      && batch.finished_weight_g === null
      && batch.remaining_weight_g === null;
  if (
    typeof batch.id !== "string"
    || !UUID_PATTERN.test(batch.id)
    || typeof batch.recipe_id !== "string"
    || !UUID_PATTERN.test(batch.recipe_id)
    || typeof batch.recipe_title !== "string"
    || batch.recipe_title.trim().length === 0
    || (batch.recipe_thumbnail_url !== null && typeof batch.recipe_thumbnail_url !== "string")
    || batch.status !== "leftover"
    || typeof batch.cooked_at !== "string"
    || !Number.isSafeInteger(batch.cooking_servings)
    || Number(batch.cooking_servings) <= 0
    || !hasRequestedInitialWeight
    || batch.batch_status !== "available"
    || batch.depleted_reason !== null
    || !Number.isSafeInteger(batch.revision)
    || Number(batch.revision) <= 0
    || !["complete", "partial", "unavailable"].includes(batch.nutrition_calculation_status as never)
    || batch.current_unweighed_closure_event_id !== null
  ) return false;
  return true;
}

function isExactCookedBatchListData(value: unknown): value is CookedBatchListData {
  if (!isRecord(value)
    || !hasExactKeys(value, ["items", "next_cursor", "has_next"])
    || !Array.isArray(value.items)
    || !value.items.every(isExactCookedBatchProjection)
    || typeof value.has_next !== "boolean"
    || (value.next_cursor !== null && typeof value.next_cursor !== "string")) return false;
  return value.has_next
    ? typeof value.next_cursor === "string" && value.next_cursor.length > 0
    : value.next_cursor === null;
}

function isExactCookedBatchMutationData(
  value: unknown,
  expectedAction: CookedBatchMutationData["action"],
): value is CookedBatchMutationData {
  if (!isRecord(value)
    || !hasExactKeys(value, ["action", "batch", "event_id"])
    || value.action !== expectedAction
    || !isExactCookedBatchProjection(value.batch)) return false;
  return expectedAction === "set_finished_weight"
    ? value.event_id === null
    : typeof value.event_id === "string" && UUID_PATTERN.test(value.event_id);
}

export async function fetchCookedBatches({
  availability = "all",
  cursor,
  limit = 20,
}: {
  availability?: "loggable" | "all";
  cursor?: string | null;
  limit?: number;
} = {}): Promise<CookedBatchListData> {
  const params = new URLSearchParams({ availability, limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  const data = await requestCooking<CookedBatchListData>(`/api/v1/cooked-batches?${params.toString()}`);
  if (!isExactCookedBatchListData(data)) {
    throw createCookingApiError({ status: 502, code: "INVALID_RESPONSE", fields: [], message: "중량·잔량 기록 응답을 확인하지 못했어요." });
  }
  return data;
}

async function mutateCookedBatch(
  input: string,
  method: "PATCH" | "POST",
  body: unknown,
  idempotencyKey: string,
  expectedAction: CookedBatchMutationData["action"],
): Promise<CookedBatchMutationData> {
  const data = await requestCooking<CookedBatchMutationData>(input, {
    method,
    headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(body),
  });
  if (!isExactCookedBatchMutationData(data, expectedAction)) {
    throw createCookingApiError({ status: 502, code: "INVALID_RESPONSE", fields: [], message: "중량·잔량 변경 결과를 확인하지 못했어요." });
  }
  return data;
}

export function updateCookedBatchWeight(
  batchId: string,
  body: CookedBatchWeightBody,
  idempotencyKey: string,
) {
  return mutateCookedBatch(`/api/v1/cooked-batches/${batchId}/weight`, "PATCH", body, idempotencyKey, body.action);
}

export function discardCookedBatch(
  batchId: string,
  body: CookedBatchDiscardBody,
  idempotencyKey: string,
) {
  return mutateCookedBatch(`/api/v1/cooked-batches/${batchId}/discard`, "POST", body, idempotencyKey, "discard");
}

export function adjustCookedBatch(
  batchId: string,
  body: CookedBatchAdjustmentBody,
  idempotencyKey: string,
) {
  return mutateCookedBatch(`/api/v1/cooked-batches/${batchId}/adjust`, "POST", body, idempotencyKey, "adjust");
}

export function closeUnweighedCookedBatch(
  batchId: string,
  body: CookedBatchCloseBody,
  idempotencyKey: string,
) {
  return mutateCookedBatch(`/api/v1/cooked-batches/${batchId}/close-unweighed`, "POST", body, idempotencyKey, body.action);
}

function createCookingApiError({
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
  const error = new Error(message) as CookingApiError;
  error.status = status;
  error.code = code;
  error.fields = fields;

  return error;
}

async function requestCooking<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, withE2EAuthOverrideHeaders(init));

  let payload: ApiResponse<T> | null = null;

  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw createCookingApiError({
      status: response.status,
      code: "INVALID_RESPONSE",
      fields: [],
      message: "서버 응답을 해석하지 못했어요.",
    });
  }

  if (!response.ok || !payload.success || !payload.data) {
    throw createCookingApiError({
      status: response.status,
      code: payload.error?.code ?? "UNKNOWN_ERROR",
      fields: payload.error?.fields ?? [],
      message: payload.error?.message ?? "요청을 처리하지 못했어요.",
    });
  }

  return payload.data;
}

export function isCookingApiError(
  error: unknown,
): error is CookingApiError {
  return error instanceof Error && "status" in error && "code" in error;
}

export async function createCookingSession(body: {
  recipe_id: string;
  meal_ids: string[];
  cooking_servings: number;
}): Promise<CookingSessionCreateData> {
  return requestCooking<CookingSessionCreateData>("/api/v1/cooking/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchCookMode(
  sessionId: string,
): Promise<CookingSessionCookModeData> {
  return requestCooking<CookingSessionCookModeData>(
    `/api/v1/cooking/sessions/${sessionId}/cook-mode`,
  );
}

export async function completeCookingSession(
  sessionId: string,
  body: { consumed_ingredient_ids: string[] },
  idempotencyKey: string,
): Promise<CookingSessionCompleteData> {
  return requestCooking<CookingSessionCompleteData>(
    `/api/v1/cooking/sessions/${sessionId}/complete`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
    },
  );
}

export async function cancelCookingSession(
  sessionId: string,
): Promise<CookingSessionCancelData> {
  return requestCooking<CookingSessionCancelData>(
    `/api/v1/cooking/sessions/${sessionId}/cancel`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    },
  );
}

export async function fetchStandaloneCookMode(
  recipeId: string,
  servings: number,
): Promise<CookingStandaloneCookModeData> {
  return requestCooking<CookingStandaloneCookModeData>(
    `/api/v1/recipes/${recipeId}/cook-mode?servings=${servings}`,
  );
}

export async function completeStandaloneCooking(body: {
  recipe_id: string;
  cooking_servings: number;
  consumed_ingredient_ids: string[];
}, idempotencyKey: string): Promise<CookingStandaloneCompleteData> {
  return requestCooking<CookingStandaloneCompleteData>(
    "/api/v1/cooking/standalone-complete",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(body),
    },
  );
}
