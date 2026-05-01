import { fetchJson } from "@/lib/api/fetch-json";
import type { ApiResponse } from "@/types/api";
import type { IngredientListData, IngredientListQuery } from "@/types/recipe";

export async function fetchIngredients(query?: IngredientListQuery): Promise<ApiResponse<IngredientListData>> {
  try {
    const params = new URLSearchParams();
    if (query?.q) params.append("q", query.q);
    if (query?.category) params.append("category", query.category);

    const queryString = params.toString();
    const url = `/api/v1/ingredients${queryString ? `?${queryString}` : ""}`;
    const data = await fetchJson<IngredientListData>(url);
    return { success: true, data, error: null };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: {
        code: "FETCH_ERROR",
        message: error instanceof Error ? error.message : "재료 목록을 불러오지 못했어요.",
        fields: [],
      },
    };
  }
}
