import { cookedWeightResponseHeaders } from "@/lib/cooking/cooked-weight-response-contract";
import { ApiFetchError, fetchJson } from "@/lib/api/fetch-json";
import { isCookedWeightAssumptionCodes, isMealLogWeightBasis } from "@/lib/cooking/cooked-weight-summary";
import type { MealLogNutritionPreview, MealLogNutritionPreviewInput } from "@/types/meal-log-preview";
import { QUANTITY_CONTRACT_HEADER, QUANTITY_INPUT_VERSION } from "@/types/quantity-input";
export type { MealLogNutritionPreview, MealLogNutritionPreviewInput } from "@/types/meal-log-preview";

export async function fetchMealLogNutritionPreview(input: MealLogNutritionPreviewInput, signal?: AbortSignal): Promise<MealLogNutritionPreview> {
  const query = new URLSearchParams({ source_type: input.source.type, source_id: input.source.id,
    amount: String(input.quantity.amount), unit: input.quantity.unit });
  if (input.quantityInput) {
    query.set("raw_value", input.quantityInput.raw_value);
    query.set("raw_unit", input.quantityInput.raw_unit);
    if (input.quantityInput.expected_batch_revision !== undefined) query.set("expected_batch_revision", String(input.quantityInput.expected_batch_revision));
    if (input.quantityInput.expected_product_nutrition_version_id) query.set("expected_product_nutrition_version_id", input.quantityInput.expected_product_nutrition_version_id);
  }
  const data = await fetchJson<MealLogNutritionPreview>(`/api/v1/meal-log/nutrition-preview?${query}`, {
    signal, cache: "no-store", headers: cookedWeightResponseHeaders({ [QUANTITY_CONTRACT_HEADER]: QUANTITY_INPUT_VERSION }),
  });
  const values = ["calories_kcal", "carbohydrate_g", "protein_g", "fat_g", "sodium_mg"] as const;
  if (data?.source?.type !== input.source.type || data.source.id !== input.source.id.toLowerCase()
    || data.quantity?.amount !== input.quantity.amount || data.quantity.unit !== input.quantity.unit.trim()
    || !data.nutrition || !["complete", "partial", "unavailable"].includes(data.nutrition.calculation_status)
    || Object.keys(data.nutrition).some(key => !["calculation_status", "contains_ai_estimate", "weight_basis", "weight_assumption_codes", ...values].includes(key))
    || ("weight_basis" in data.nutrition && (!isMealLogWeightBasis(data.nutrition.weight_basis)
      || input.source.type !== "cooked_batch" || data.nutrition.weight_basis.batch_id !== input.source.id.toLowerCase()))
    || ("weight_assumption_codes" in data.nutrition && (!isCookedWeightAssumptionCodes(data.nutrition.weight_assumption_codes) || data.nutrition.weight_basis?.source !== "conditional_estimate"))
    || ("contains_ai_estimate" in data.nutrition && typeof data.nutrition.contains_ai_estimate !== "boolean")
    || values.some((key) => data.nutrition[key] !== null && (typeof data.nutrition[key] !== "number" || !Number.isFinite(data.nutrition[key])))) {
    throw new ApiFetchError({ status: 502, code: "INVALID_RESPONSE", message: "영양 정보를 확인하지 못했어요.", fields: [] });
  }
  return data;
}
