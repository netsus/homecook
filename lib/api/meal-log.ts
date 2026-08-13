import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiError, ApiResponse } from "@/types/api";
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

async function requestMealLog<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, withE2EAuthOverrideHeaders(init));
  let payload: ApiResponse<T> | null = null;

  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw createMealLogApiError({
      status: response.status,
      code: "INVALID_RESPONSE",
      fields: [],
      message: "서버 응답을 해석하지 못했어요.",
    });
  }

  if (!response.ok || !payload.success || payload.data === null) {
    throw createMealLogApiError({
      status: response.status,
      code: payload.error?.code ?? "UNKNOWN_ERROR",
      fields: payload.error?.fields ?? [],
      message: payload.error?.message ?? "식사 기록 요청을 처리하지 못했어요.",
    });
  }

  return payload.data;
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
  return requestMealLog<MealLogDayData>(`/api/v1/meal-log?${params.toString()}`);
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
  return requestMealLog<MealLogRecentData>(`/api/v1/meal-log/recent?${params.toString()}`);
}

export async function createMealLogEntry(
  input: MealLogCreateInput,
  idempotencyKey = crypto.randomUUID(),
) {
  const data = await requestMealLog<MealLogMutationResponse>(
    "/api/v1/meal-log/entries",
    mutationRequest("POST", mutationBody(input), idempotencyKey),
  );
  return data.entry;
}

export async function updateMealLogEntry(
  entryId: string,
  input: MealLogUpdateInput,
  idempotencyKey = crypto.randomUUID(),
) {
  const data = await requestMealLog<MealLogMutationResponse>(
    `/api/v1/meal-log/entries/${entryId}`,
    mutationRequest("PATCH", mutationBody(input), idempotencyKey),
  );
  return data.entry;
}

export async function deleteMealLogEntry(
  entryId: string,
  expectedRevision: number,
  idempotencyKey = crypto.randomUUID(),
) {
  const data = await requestMealLog<MealLogMutationResponse>(
    `/api/v1/meal-log/entries/${entryId}`,
    mutationRequest("DELETE", { expected_revision: expectedRevision }, idempotencyKey),
  );
  return data.entry;
}
