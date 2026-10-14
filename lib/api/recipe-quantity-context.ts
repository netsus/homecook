import { fetchJson } from "@/lib/api/fetch-json";
import { QUANTITY_CONTRACT_HEADER, QUANTITY_INPUT_VERSION } from "@/types/quantity-input";
import type { RecipeQuantityContextData, RecipeQuantitySource } from "@/types/recipe";

/** This bounded POST reads metadata only; callers invoke it explicitly after login. */
export async function fetchRecipeQuantityContexts(sources: RecipeQuantitySource[], signal?: AbortSignal): Promise<RecipeQuantityContextData> {
  const data = await fetchJson<RecipeQuantityContextData>("/api/v1/recipes/quantity-input-context", {
    method: "POST", cache: "no-store", signal,
    headers: { "Content-Type": "application/json", [QUANTITY_CONTRACT_HEADER]: QUANTITY_INPUT_VERSION },
    body: JSON.stringify({ sources }),
  });
  if (!data.subject || !Number.isSafeInteger(data.subject.account_generation) || data.subject.account_generation < 1
    || typeof data.subject.owner_uuid !== "string" || !Array.isArray(data.items) || data.items.length !== sources.length
    || data.items.some((item, index) => item.row_key !== sources[index].row_key
      || item.ingredient_id !== sources[index].ingredient_id || item.food_product_id !== sources[index].food_product_id
      || item.food_product_nutrition_version_id !== sources[index].food_product_nutrition_version_id
      || typeof item.context?.ready !== "boolean")) throw new Error("재료의 고정된 수량 정보를 확인하지 못했어요. 원입력은 유지돼요.");
  return data;
}
