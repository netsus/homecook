import { fetchJson } from "@/lib/api/fetch-json";
import type { RecipeDetail } from "@/types/recipe";

/** Uses the normal visibility checks without incrementing a recipe's view count. */
export async function fetchRecipePreview(recipeId: string, signal?: AbortSignal): Promise<RecipeDetail> {
  const data = await fetchJson<RecipeDetail>(`/api/v1/recipes/${encodeURIComponent(recipeId)}?view=preview`, {
    cache: "no-store",
    signal,
  });
  if (data.id !== recipeId || !Array.isArray(data.ingredients) || !Array.isArray(data.steps)
    || !Number.isFinite(data.base_servings) || data.base_servings <= 0) {
    throw new Error("레시피 정보를 확인하지 못했어요.");
  }
  return data;
}
