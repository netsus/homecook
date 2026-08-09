import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiError, ApiResponse } from "@/types/api";
import type {
  CookingSessionCancelData,
  CookingSessionCompleteData,
  CookingSessionCookModeData,
  CookingSessionCreateData,
  CookingStandaloneCompleteData,
  CookingStandaloneCookModeData,
  SnapshotV2CancelData,
  SnapshotV2CompleteBody,
  SnapshotV2CompleteData,
  SnapshotV2CookModeData,
  SnapshotV2StartData,
} from "@/types/cooking";

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
  if (!isRecord(batch) || !hasExactKeys(batch, COOKED_BATCH_KEYS)) return false;
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
): Promise<CookingSessionCompleteData> {
  return requestCooking<CookingSessionCompleteData>(
    `/api/v1/cooking/sessions/${sessionId}/complete`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
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
}): Promise<CookingStandaloneCompleteData> {
  return requestCooking<CookingStandaloneCompleteData>(
    "/api/v1/cooking/standalone-complete",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}
