import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiError, ApiResponse } from "@/types/api";
import type {
  CookingReadyData,
  CookingSessionCreateData,
} from "@/types/cooking";

export interface CookingApiError extends Error {
  status: number;
  code: string;
  fields: ApiError["fields"];
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

export async function fetchCookingReady(): Promise<CookingReadyData> {
  return requestCooking<CookingReadyData>("/api/v1/cooking/ready");
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
