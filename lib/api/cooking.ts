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
  SnapshotV2CookModeData,
  SnapshotV2StartData,
} from "@/types/cooking";

export interface CookingApiError extends Error {
  status: number;
  code: string;
  fields: ApiError["fields"];
}

export async function createSnapshotV2CookingSession(body: { mode: "planner"; meal_ids: string[]; expected_meal_revisions: Record<string, number> } | { mode: "standalone"; recipe_id: string; expected_recipe_revision: number; cooking_servings: number }, idempotencyKey = crypto.randomUUID()): Promise<SnapshotV2StartData> {
  const data = await requestCooking<SnapshotV2StartData>("/api/v1/cooking/session-attempts", { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey }, body: JSON.stringify(body) });
  if (data.contract_version !== "snapshot_v2" || data.status !== "in_progress") throw createCookingApiError({ status: 502, code: "INVALID_RESPONSE", fields: [], message: "요리 세션 버전을 확인하지 못했어요." });
  return data;
}

export async function fetchSnapshotV2CookMode(sessionId: string): Promise<SnapshotV2CookModeData> {
  const data = await requestCooking<SnapshotV2CookModeData>(`/api/v1/cooking/session-attempts/${sessionId}/cook-mode`);
  if (data.contract_version !== "snapshot_v2") throw createCookingApiError({ status: 502, code: "INVALID_RESPONSE", fields: [], message: "요리 세션 버전을 확인하지 못했어요." });
  return data;
}

export async function cancelSnapshotV2CookingSession(sessionId: string): Promise<SnapshotV2CancelData> {
  const data = await requestCooking<SnapshotV2CancelData>(`/api/v1/cooking/session-attempts/${sessionId}/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
  if (data.contract_version !== "snapshot_v2" || data.status !== "cancelled") throw createCookingApiError({ status: 502, code: "INVALID_RESPONSE", fields: [], message: "요리 세션 버전을 확인하지 못했어요." });
  return data;
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
