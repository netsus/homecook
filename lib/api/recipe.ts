import { fetchJson, isApiFetchError } from "@/lib/api/fetch-json";
import type { ApiResponse } from "@/types/api";
import type {
  PantryMatchListData,
  RecipeBookDeleteData,
  RecipeBookListData,
  RecipeBookRecipeListData,
  RecipeListData,
  RecipeListQuery,
} from "@/types/recipe";

function toFetchError(error: unknown, fallbackMessage: string) {
  if (isApiFetchError(error)) {
    return {
      code: error.code,
      message: error.message,
      fields: error.fields,
    };
  }

  return {
    code: "FETCH_ERROR",
    message: error instanceof Error ? error.message : fallbackMessage,
    fields: [],
  };
}

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
      error: toFetchError(error, "검색 중 오류가 발생했어요."),
    };
  }
}

export async function fetchRecipeBooks(): Promise<ApiResponse<RecipeBookListData>> {
  try {
    const data = await fetchJson<RecipeBookListData>("/api/v1/recipe-books");
    return { success: true, data, error: null };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: toFetchError(error, "레시피북 목록을 불러오지 못했어요."),
    };
  }
}

export async function fetchRecipeBookRecipes(
  bookId: string,
  options?: { cursor?: string | null; limit?: number },
): Promise<ApiResponse<RecipeBookRecipeListData>> {
  try {
    const params = new URLSearchParams();
    if (options?.cursor) params.append("cursor", options.cursor);
    if (options?.limit !== undefined) params.append("limit", String(options.limit));

    const queryString = params.toString();
    const url = `/api/v1/recipe-books/${bookId}/recipes${queryString ? `?${queryString}` : ""}`;
    const data = await fetchJson<RecipeBookRecipeListData>(url);
    return { success: true, data, error: null };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: toFetchError(error, "레시피북 레시피를 불러오지 못했어요."),
    };
  }
}

export async function removeRecipeBookRecipe(
  bookId: string,
  recipeId: string,
): Promise<ApiResponse<RecipeBookDeleteData>> {
  try {
    const data = await fetchJson<RecipeBookDeleteData>(
      `/api/v1/recipe-books/${bookId}/recipes/${recipeId}`,
      { method: "DELETE" },
    );
    return { success: true, data, error: null };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: toFetchError(error, "레시피를 제거하지 못했어요."),
    };
  }
}

export async function fetchPantryMatchRecipes(options?: {
  cursor?: string | null;
  limit?: number;
}): Promise<ApiResponse<PantryMatchListData>> {
  try {
    const params = new URLSearchParams();
    if (options?.cursor) params.append("cursor", options.cursor);
    if (options?.limit !== undefined) params.append("limit", String(options.limit));

    const queryString = params.toString();
    const url = `/api/v1/recipes/pantry-match${queryString ? `?${queryString}` : ""}`;
    const data = await fetchJson<PantryMatchListData>(url);
    return { success: true, data, error: null };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: toFetchError(error, "팬트리 기반 추천을 불러오지 못했어요."),
    };
  }
}
