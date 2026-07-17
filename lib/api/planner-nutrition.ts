import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiError, ApiResponse } from "@/types/api";
import type { PlannerNutritionData } from "@/types/planner-nutrition";

export interface PlannerNutritionApiError extends Error {
  status: number;
  code: string;
  fields: ApiError["fields"];
}

function createPlannerNutritionApiError({
  code,
  fields,
  message,
  status,
}: {
  code: string;
  fields: ApiError["fields"];
  message: string;
  status: number;
}) {
  const error = new Error(message) as PlannerNutritionApiError;
  error.status = status;
  error.code = code;
  error.fields = fields;
  return error;
}

export function isPlannerNutritionApiError(
  error: unknown,
): error is PlannerNutritionApiError {
  return (
    error instanceof Error &&
    "status" in error &&
    "code" in error &&
    "fields" in error
  );
}

export async function fetchPlannerNutrition(
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
  });
  const response = await fetch(
    `/api/v1/planner/nutrition?${params.toString()}`,
    withE2EAuthOverrideHeaders({ signal }),
  );

  let payload: ApiResponse<PlannerNutritionData> | null = null;
  try {
    payload = (await response.json()) as ApiResponse<PlannerNutritionData>;
  } catch {
    throw createPlannerNutritionApiError({
      code: "INVALID_RESPONSE",
      fields: [],
      message: "계획 영양 응답을 해석하지 못했어요.",
      status: response.status,
    });
  }

  if (!response.ok || !payload.success || payload.data === null) {
    throw createPlannerNutritionApiError({
      code: payload.error?.code ?? "UNKNOWN_ERROR",
      fields: payload.error?.fields ?? [],
      message: payload.error?.message ?? "계획 영양을 불러오지 못했어요.",
      status: response.status,
    });
  }

  return payload.data;
}
