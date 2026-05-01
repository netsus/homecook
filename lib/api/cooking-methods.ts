import { fetchJson } from "@/lib/api/fetch-json";
import type { ApiResponse } from "@/types/api";
import type { CookingMethodListData } from "@/types/recipe";

export async function fetchCookingMethods(): Promise<ApiResponse<CookingMethodListData>> {
  try {
    const data = await fetchJson<CookingMethodListData>("/api/v1/cooking-methods");
    return { success: true, data, error: null };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: {
        code: "FETCH_ERROR",
        message: error instanceof Error ? error.message : "조리방법 목록을 불러오지 못했어요.",
        fields: [],
      },
    };
  }
}
