import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiResponse } from "@/types/api";
import type { MealCreateBody, MealCreateData, MealListData, MealMutationData } from "@/types/meal";

interface MealApiError extends Error {
  status: number;
  code: string;
}

function createMealApiError({
  status,
  code,
  message,
}: {
  status: number;
  code: string;
  message: string;
}) {
  const error = new Error(message) as MealApiError;
  error.status = status;
  error.code = code;
  return error;
}

export function isMealApiError(error: unknown): error is MealApiError {
  if (!(error instanceof Error)) {
    return false;
  }

  return "status" in error && "code" in error;
}

export async function createMeal(body: MealCreateBody): Promise<MealCreateData> {
  const response = await fetch(
    "/api/v1/meals",
    withE2EAuthOverrideHeaders({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

  let payload: ApiResponse<MealCreateData> | null = null;

  try {
    payload = (await response.json()) as ApiResponse<MealCreateData>;
  } catch {
    throw createMealApiError({
      status: response.status,
      code: "INVALID_RESPONSE",
      message: "서버 응답을 해석하지 못했어요.",
    });
  }

  if (!response.ok || !payload.success || !payload.data) {
    throw createMealApiError({
      status: response.status,
      code: payload?.error?.code ?? "UNKNOWN_ERROR",
      message: payload?.error?.message ?? "요청을 처리하지 못했어요.",
    });
  }

  return payload.data;
}

export async function createMealSafe(body: MealCreateBody): Promise<ApiResponse<MealCreateData>> {
  try {
    const data = await createMeal(body);
    return { success: true, data, error: null };
  } catch (error) {
    if (isMealApiError(error)) {
      return {
        success: false,
        data: null,
        error: { code: error.code, message: error.message, fields: [] },
      };
    }
    return {
      success: false,
      data: null,
      error: { code: "UNKNOWN_ERROR", message: "알 수 없는 오류가 발생했어요.", fields: [] },
    };
  }
}

export async function fetchMeals(planDate: string, columnId: string): Promise<MealListData> {
  const params = new URLSearchParams({ plan_date: planDate, column_id: columnId });
  const response = await fetch(
    `/api/v1/meals?${params.toString()}`,
    withE2EAuthOverrideHeaders(),
  );

  let payload: ApiResponse<MealListData> | null = null;

  try {
    payload = (await response.json()) as ApiResponse<MealListData>;
  } catch {
    throw createMealApiError({
      status: response.status,
      code: "INVALID_RESPONSE",
      message: "서버 응답을 해석하지 못했어요.",
    });
  }

  if (!response.ok || !payload.success || !payload.data) {
    throw createMealApiError({
      status: response.status,
      code: payload?.error?.code ?? "UNKNOWN_ERROR",
      message: payload?.error?.message ?? "요청을 처리하지 못했어요.",
    });
  }

  return payload.data;
}

export async function updateMealServings(mealId: string, plannedServings: number): Promise<MealMutationData> {
  const response = await fetch(
    `/api/v1/meals/${mealId}`,
    withE2EAuthOverrideHeaders({
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planned_servings: plannedServings }),
    }),
  );

  let payload: ApiResponse<MealMutationData> | null = null;

  try {
    payload = (await response.json()) as ApiResponse<MealMutationData>;
  } catch {
    throw createMealApiError({
      status: response.status,
      code: "INVALID_RESPONSE",
      message: "서버 응답을 해석하지 못했어요.",
    });
  }

  if (!response.ok || !payload.success || !payload.data) {
    throw createMealApiError({
      status: response.status,
      code: payload?.error?.code ?? "UNKNOWN_ERROR",
      message: payload?.error?.message ?? "요청을 처리하지 못했어요.",
    });
  }

  return payload.data;
}

export async function deleteMeal(mealId: string): Promise<void> {
  const response = await fetch(
    `/api/v1/meals/${mealId}`,
    withE2EAuthOverrideHeaders({ method: "DELETE" }),
  );

  if (response.status === 204) {
    return;
  }

  let payload: ApiResponse<null> | null = null;

  try {
    payload = (await response.json()) as ApiResponse<null>;
  } catch {
    throw createMealApiError({
      status: response.status,
      code: "INVALID_RESPONSE",
      message: "서버 응답을 해석하지 못했어요.",
    });
  }

  throw createMealApiError({
    status: response.status,
    code: payload?.error?.code ?? "UNKNOWN_ERROR",
    message: payload?.error?.message ?? "요청을 처리하지 못했어요.",
  });
}
