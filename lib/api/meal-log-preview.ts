import { ApiFetchError, fetchJson } from "@/lib/api/fetch-json";
import type { MealLogNutritionPreview, MealLogNutritionPreviewInput } from "@/types/meal-log-preview";
export type { MealLogNutritionPreview, MealLogNutritionPreviewInput } from "@/types/meal-log-preview";

export async function fetchMealLogNutritionPreview(input: MealLogNutritionPreviewInput, signal?: AbortSignal): Promise<MealLogNutritionPreview> {
  const query = new URLSearchParams({ source_type: input.source.type, source_id: input.source.id,
    amount: String(input.quantity.amount), unit: input.quantity.unit });
  const data = await fetchJson<MealLogNutritionPreview>(`/api/v1/meal-log/nutrition-preview?${query}`, { signal, cache: "no-store" });
  const values = ["calories_kcal", "carbohydrate_g", "protein_g", "fat_g", "sodium_mg"] as const;
  if (data?.source?.type !== input.source.type || data.source.id !== input.source.id.toLowerCase()
    || data.quantity?.amount !== input.quantity.amount || data.quantity.unit !== input.quantity.unit.trim()
    || !data.nutrition || !["complete", "partial", "unavailable"].includes(data.nutrition.calculation_status)
    || values.some((key) => data.nutrition[key] !== null && (typeof data.nutrition[key] !== "number" || !Number.isFinite(data.nutrition[key])))) {
    throw new ApiFetchError({ status: 502, code: "INVALID_RESPONSE", message: "영양 정보를 확인하지 못했어요.", fields: [] });
  }
  return data;
}
