import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiResponse } from "@/types/api";
import type {
  YoutubeRecipeValidateBody,
  YoutubeRecipeValidateData,
  YoutubeRecipeExtractData,
  YoutubeRecipeRegisterBody,
  YoutubeRecipeRegisterData,
} from "@/types/recipe";

export async function validateYoutubeUrl(
  body: YoutubeRecipeValidateBody,
): Promise<ApiResponse<YoutubeRecipeValidateData>> {
  try {
    const response = await fetch(
      "/api/v1/recipes/youtube/validate",
      withE2EAuthOverrideHeaders({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

    let payload: ApiResponse<YoutubeRecipeValidateData> | null = null;

    try {
      payload = (await response.json()) as ApiResponse<YoutubeRecipeValidateData>;
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
          message: "URL을 확인하지 못했어요.",
          fields: [],
        },
      };
    }

    return { success: true, data: payload.data, error: null };
  } catch {
    return {
      success: false,
      data: null,
      error: {
        code: "NETWORK_ERROR",
        message: "네트워크 오류가 발생했어요. 잠시 후 다시 시도해주세요.",
        fields: [],
      },
    };
  }
}

export async function extractYoutubeRecipe(
  body: YoutubeRecipeValidateBody,
): Promise<ApiResponse<YoutubeRecipeExtractData>> {
  try {
    const response = await fetch(
      "/api/v1/recipes/youtube/extract",
      withE2EAuthOverrideHeaders({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

    let payload: ApiResponse<YoutubeRecipeExtractData> | null = null;

    try {
      payload = (await response.json()) as ApiResponse<YoutubeRecipeExtractData>;
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
          message: "레시피를 추출하지 못했어요.",
          fields: [],
        },
      };
    }

    return { success: true, data: payload.data, error: null };
  } catch {
    return {
      success: false,
      data: null,
      error: {
        code: "NETWORK_ERROR",
        message: "네트워크 오류가 발생했어요. 잠시 후 다시 시도해주세요.",
        fields: [],
      },
    };
  }
}

export async function registerYoutubeRecipe(
  body: YoutubeRecipeRegisterBody,
): Promise<ApiResponse<YoutubeRecipeRegisterData>> {
  try {
    const response = await fetch(
      "/api/v1/recipes/youtube/register",
      withE2EAuthOverrideHeaders({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

    let payload: ApiResponse<YoutubeRecipeRegisterData> | null = null;

    try {
      payload = (await response.json()) as ApiResponse<YoutubeRecipeRegisterData>;
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

    return { success: true, data: payload.data, error: null };
  } catch {
    return {
      success: false,
      data: null,
      error: {
        code: "NETWORK_ERROR",
        message: "네트워크 오류가 발생했어요. 잠시 후 다시 시도해주세요.",
        fields: [],
      },
    };
  }
}
