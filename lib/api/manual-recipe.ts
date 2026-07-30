import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiError, ApiResponse } from "@/types/api";
import type { ManualRecipeCreateBody, ManualRecipeCreateData } from "@/types/recipe";

export interface LegacyRecipeImageUploadData {
  thumbnail_url: string;
  storage_path: string;
}

export interface ManagedRecipeImageUploadData {
  image_object_id: string;
  state: string;
  read_url: string;
  read_url_expires_at: string;
}

export type RecipeImageUploadData =
  | LegacyRecipeImageUploadData
  | ManagedRecipeImageUploadData;

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
  state: string;
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

function unknownUploadError(): ApiError {
  return {
    code: "UNKNOWN_ERROR",
    message: "이미지를 업로드하지 못했어요.",
    fields: [],
  };
}

function unknownCancelError(): ApiError {
  return {
    code: "UNKNOWN_ERROR",
    message: "이미지 업로드를 취소하지 못했어요.",
    fields: [],
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

function hasLegacyUploadShape(value: unknown): value is LegacyRecipeImageUploadData {
  return (
    isRecord(value)
    && isString(value.thumbnail_url)
    && isString(value.storage_path)
    && value.image_object_id === undefined
    && value.read_url === undefined
    && value.read_url_expires_at === undefined
    && value.state === undefined
  );
}

function hasManagedUploadShape(value: unknown): value is ManagedRecipeImageUploadData {
  return (
    isRecord(value)
    && isString(value.image_object_id)
    && isString(value.state)
    && isString(value.read_url)
    && isString(value.read_url_expires_at)
    && value.thumbnail_url === undefined
    && value.storage_path === undefined
  );
}

function hasCancelShape(value: unknown): value is RecipeImageCancelData {
  return (
    isRecord(value)
    && isString(value.image_object_id)
    && isString(value.state)
  );
}

function positiveRetryAfter(response: Response) {
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

    const payload = await readJson<ApiResponse<unknown>>(response);
    if (!payload) {
      return invalidResponse();
    }

    if (response.status === 202) {
      const retryAfter = positiveRetryAfter(response);
      if (!retryAfter || !payload.success || payload.data !== null || payload.error !== null) {
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

    if (!response.ok || !payload.success) {
      if (
        payload.error?.code === "IMAGE_UPLOAD_LIMITED"
        && positiveRetryAfter(response) === null
      ) {
        return invalidResponse();
      }

      return {
        success: false,
        data: null,
        error: payload.error ?? unknownUploadError(),
      };
    }

    if (hasManagedUploadShape(payload.data) || hasLegacyUploadShape(payload.data)) {
      return {
        success: true,
        data: payload.data,
        error: null,
      };
    }

    return invalidResponse();
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

    const payload = await readJson<ApiResponse<unknown>>(response);
    if (!payload) {
      return invalidResponse();
    }

    if (!response.ok || !payload.success) {
      return {
        success: false,
        data: null,
        error: payload.error ?? unknownCancelError(),
      };
    }

    if (!hasCancelShape(payload.data)) {
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
