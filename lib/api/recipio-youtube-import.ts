import { withE2EAuthOverrideHeaders } from "@/lib/auth/e2e-auth-override";
import type { ApiResponse } from "@/types/api";
import type { RecipioYoutubeDuplicateCheckData } from "@/types/recipe";

export async function checkRecipioYoutubeDuplicate(
  youtubeUrl: string,
): Promise<ApiResponse<RecipioYoutubeDuplicateCheckData>> {
  const params = new URLSearchParams({ youtube_url: youtubeUrl });

  try {
    const response = await fetch(
      `/api/v1/recipes/youtube/recipio/check?${params.toString()}`,
      withE2EAuthOverrideHeaders({
        method: "GET",
      }),
    );

    let payload: ApiResponse<RecipioYoutubeDuplicateCheckData> | null = null;

    try {
      payload = (await response.json()) as ApiResponse<RecipioYoutubeDuplicateCheckData>;
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
          message: "기존 레시피를 확인하지 못했어요.",
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
