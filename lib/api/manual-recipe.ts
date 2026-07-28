import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiResponse } from "@/types/api";
import type { ManualRecipeCreateBody, ManualRecipeCreateData } from "@/types/recipe";

export interface LegacyRecipeImageUploadData {
  thumbnail_url: string;
  storage_path: string;
}

export interface ManagedRecipeImageUploadData {
  image_object_id: string;
  read_url: string;
  read_url_expires_at: string;
  state: string;
}

export type RecipeImageUploadData =
  | LegacyRecipeImageUploadData
  | ManagedRecipeImageUploadData;

export interface RecipeImageCancelData {
  image_object_id: string;
  state: string;
}

interface ImageMutationOptions {
  idempotencyKey?: string;
}

type RecipeImageUploadResponse = ApiResponse<RecipeImageUploadData> & {
  http_status?: number;
  retry_after_seconds?: number;
};

function createIdempotencyKey() {
  return crypto.randomUUID();
}

export async function uploadRecipeImage(
  file: File,
  options: ImageMutationOptions = {},
): Promise<RecipeImageUploadResponse> {
  try {
    const formData = new FormData();
    formData.append("image", file);
    const idempotencyKey = options.idempotencyKey ?? createIdempotencyKey();

    const response = await fetch(
      "/api/v1/recipes/images",
      withE2EAuthOverrideHeaders({
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: formData,
      }),
    );

    let payload: ApiResponse<RecipeImageUploadData> | null = null;

    try {
      payload = (await response.json()) as ApiResponse<RecipeImageUploadData>;
    } catch {
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

    if (!response.ok || !payload.success) {
      return {
        success: false,
        data: null,
        error: payload.error ?? {
          code: "UNKNOWN_ERROR",
          message: "이미지를 업로드하지 못했어요.",
          fields: [],
        },
        http_status: response.status,
      };
    }

    return {
      success: true,
      data: payload.data,
      error: null,
      http_status: response.status,
      retry_after_seconds:
        response.status === 202
          ? Number.parseInt(response.headers.get("Retry-After") ?? "", 10)
          : undefined,
    };
  } catch {
    return {
      success: false,
      data: null,
      error: {
        code: "NETWORK_ERROR",
        message: "네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
        fields: [],
      },
    };
  }
}

export async function cancelRecipeImageUpload(
  imageObjectId: string,
  options: ImageMutationOptions = {},
): Promise<ApiResponse<RecipeImageCancelData>> {
  try {
    const response = await fetch(
      `/api/v1/recipes/images/${encodeURIComponent(imageObjectId)}/cancel`,
      withE2EAuthOverrideHeaders({
        method: "POST",
        headers: {
          "Idempotency-Key":
            options.idempotencyKey ?? createIdempotencyKey(),
        },
      }),
    );

    let payload: ApiResponse<RecipeImageCancelData> | null = null;
    try {
      payload = (await response.json()) as ApiResponse<RecipeImageCancelData>;
    } catch {
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

    if (!response.ok || !payload.success) {
      return {
        success: false,
        data: null,
        error: payload.error ?? {
          code: "UNKNOWN_ERROR",
          message: "이미지 업로드를 취소하지 못했어요.",
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
    return {
      success: false,
      data: null,
      error: {
        code: "NETWORK_ERROR",
        message: "네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
        fields: [],
      },
    };
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

    let payload: ApiResponse<ManualRecipeCreateData> | null = null;

    try {
      payload = (await response.json()) as ApiResponse<ManualRecipeCreateData>;
    } catch {
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
    return {
      success: false,
      data: null,
      error: {
        code: "NETWORK_ERROR",
        message: "네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
        fields: [],
      },
    };
  }
}
