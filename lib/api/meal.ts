import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiResponse } from "@/types/api";
import type { MealCreateBody, MealCreateData } from "@/types/meal";

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
