import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiError, ApiResponse } from "@/types/api";
import type { ManualRecipeCreateBody, ManualRecipeCreateData } from "@/types/recipe";

export interface ManagedRecipeImageUploadData {
  image_object_id: string;
  state: "uploaded_unlinked";
  read_url: string;
  read_url_expires_at: string;
}

export type RecipeImageUploadData = ManagedRecipeImageUploadData;

export type RecipeImageUploadResult =
  | ApiResponse<RecipeImageUploadData>
  | {
      success: true;
      data: null;
      error: null;
      in_progress: true;
      retry_after_seconds: number;
    };

export interface RecipeImageCancelData {
  image_object_id: string;
  state: "cleanup_pending";
}

interface RecipeImageRequestOptions {
  idempotencyKey?: string;
}

function invalidResponse<T>(): ApiResponse<T> {
  return {
    success: false,
    data: null,
    error: {
      code: "INVALID_RESPONSE",
      message: "서버 응답을 해석하지 못했어요.",
      fields: [],
    },
  };
}

function networkError<T>(message: string): ApiResponse<T> {
  return {
    success: false,
    data: null,
    error: {
      code: "NETWORK_ERROR",
      message,
      fields: [],
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

const UUID_PATTERN
  = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UPLOAD_ERROR_STATUSES = new Set([
  400, 401, 409, 413, 422, 428, 429, 500, 503,
]);
const CANCEL_ERROR_STATUSES = new Set([
  400, 401, 404, 409, 428, 500, 503,
]);

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...keys].sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index]);
}

function hasApiErrorShape(value: unknown): value is ApiError {
  if (!isRecord(value) || !hasExactKeys(value, ["code", "fields", "message"])) {
    return false;
  }

  return (
    isString(value.code)
    && isString(value.message)
    && Array.isArray(value.fields)
    && value.fields.every((field) => (
      isRecord(field)
      && hasExactKeys(field, ["field", "reason"])
      && isString(field.field)
      && isString(field.reason)
    ))
  );
}

function hasStrictWrapper(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
    && hasExactKeys(value, ["data", "error", "success"])
    && typeof value.success === "boolean";
}

function hasManagedUploadShape(value: unknown): value is ManagedRecipeImageUploadData {
  if (!isRecord(value)) {
    return false;
  }

  if (Object.keys(value).length !== 4) {
    return false;
  }

  return (
    isString(value.image_object_id)
    && isString(value.state)
    && isString(value.read_url)
    && isString(value.read_url_expires_at)
    && isUuid(value.image_object_id)
    && value.state === "uploaded_unlinked"
    && URL.canParse(value.read_url)
    && new URL(value.read_url).protocol === "https:"
    && !Number.isNaN(Date.parse(value.read_url_expires_at))
  );
}

function hasCancelShape(value: unknown): value is RecipeImageCancelData {
  return (
    isRecord(value)
    && hasExactKeys(value, ["image_object_id", "state"])
    && isString(value.image_object_id)
    && value.state === "cleanup_pending"
    && isUuid(value.image_object_id)
  );
}

function readRetryAfterSeconds(response: Response): number | null {
  const headerValue = response.headers.get("Retry-After");
  if (!headerValue) {
    return null;
  }
  const parsed = Number.parseInt(headerValue, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function createIdempotencyKey() {
  return crypto.randomUUID();
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function uploadRecipeImage(
  file: File,
  options?: RecipeImageRequestOptions,
): Promise<RecipeImageUploadResult> {
  try {
    const formData = new FormData();
    formData.append("image", file);

    const headers = new Headers();
    headers.set("Idempotency-Key", options?.idempotencyKey ?? createIdempotencyKey());

    const response = await fetch(
      "/api/v1/recipes/images",
      withE2EAuthOverrideHeaders({
        method: "POST",
        headers,
        body: formData,
      }),
    );

    const payload = await readJson<unknown>(response);
    if (!hasStrictWrapper(payload)) {
      return invalidResponse();
    }

    if (response.status === 202) {
      const retryAfter = readRetryAfterSeconds(response);
      if (
        payload.success !== true
        || payload.data !== null
        || payload.error !== null
        || retryAfter === null
      ) {
        return invalidResponse();
      }

      return {
        success: true,
        data: null,
        error: null,
        in_progress: true,
        retry_after_seconds: retryAfter,
      };
    }

    if (UPLOAD_ERROR_STATUSES.has(response.status)) {
      if (
        payload.success !== false
        || payload.data !== null
        || !hasApiErrorShape(payload.error)
      ) {
        return invalidResponse();
      }

      if (payload.error.code === "IMAGE_UPLOAD_LIMITED" && !response.headers.has("Retry-After")) {
        return invalidResponse();
      }
      if (payload.error.code === "IMAGE_UPLOAD_LIMITED") {
        const retryAfter = readRetryAfterSeconds(response);
        if (retryAfter === null) {
          return invalidResponse();
        }
      }
      if (response.status === 429 && payload.error.code !== "IMAGE_UPLOAD_LIMITED") {
        return invalidResponse();
      }

      return {
        success: false,
        data: null,
        error: payload.error,
      };
    }

    if (
      response.status !== 201
      || payload.success !== true
      || payload.error !== null
      || !hasManagedUploadShape(payload.data)
    ) {
      return invalidResponse();
    }

    return {
      success: true,
      data: payload.data,
      error: null,
    };
  } catch {
    return networkError("네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
  }
}

export async function cancelRecipeImage(
  imageObjectId: string,
  options?: RecipeImageRequestOptions,
): Promise<ApiResponse<RecipeImageCancelData>> {
  try {
    const headers = new Headers();
    headers.set("Idempotency-Key", options?.idempotencyKey ?? createIdempotencyKey());

    const response = await fetch(
      `/api/v1/recipes/images/${imageObjectId}/cancel`,
      withE2EAuthOverrideHeaders({
        method: "POST",
        headers,
      }),
    );

    const payload = await readJson<unknown>(response);
    if (!hasStrictWrapper(payload)) {
      return invalidResponse();
    }

    if (CANCEL_ERROR_STATUSES.has(response.status)) {
      if (
        payload.success !== false
        || payload.data !== null
        || !hasApiErrorShape(payload.error)
      ) {
        return invalidResponse();
      }

      return {
        success: false,
        data: null,
        error: payload.error,
      };
    }

    if (
      response.status !== 200
      || payload.success !== true
      || payload.error !== null
      || !hasCancelShape(payload.data)
    ) {
      return invalidResponse();
    }

    return {
      success: true,
      data: payload.data,
      error: null,
    };
  } catch {
    return networkError("네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
  }
}

export async function createManualRecipe(
  body: ManualRecipeCreateBody,
): Promise<ApiResponse<ManualRecipeCreateData>> {
  try {
    const response = await fetch(
      "/api/v1/recipes",
      withE2EAuthOverrideHeaders({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

    const payload = await readJson<ApiResponse<ManualRecipeCreateData>>(response);
    if (!payload) {
      return invalidResponse();
    }

    if (!response.ok || !payload.success) {
      return {
        success: false,
        data: null,
        error: payload.error ?? {
          code: "UNKNOWN_ERROR",
          message: "레시피를 등록하지 못했어요.",
          fields: [],
        },
      };
    }

    return {
      success: true,
      data: payload.data,
      error: null,
    };
  } catch {
    return networkError("네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.");
  }
}
