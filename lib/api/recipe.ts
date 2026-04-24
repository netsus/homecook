import { fetchJson } from "@/lib/api/fetch-json";
import type { ApiResponse } from "@/types/api";
import type { RecipeListData, RecipeListQuery } from "@/types/recipe";

export async function fetchRecipes(query: RecipeListQuery): Promise<ApiResponse<RecipeListData>> {
  try {
    const params = new URLSearchParams();
    if (query.q) params.append("q", query.q);
    if (query.ingredient_ids && query.ingredient_ids.length > 0) {
      params.append("ingredient_ids", query.ingredient_ids.join(","));
    }
    if (query.sort) params.append("sort", query.sort);
    if (query.cursor) params.append("cursor", query.cursor);
    if (query.limit !== undefined) params.append("limit", String(query.limit));

    const data = await fetchJson<RecipeListData>(`/api/v1/recipes?${params.toString()}`);
    return { success: true, data, error: null };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: {
        code: "FETCH_ERROR",
        message: error instanceof Error ? error.message : "검색 중 오류가 발생했어요.",
        fields: [],
      },
    };
  }
}
