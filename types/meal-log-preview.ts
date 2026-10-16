import type { MealLogNutritionEvidence, MealLogQuantityInput, MealLogSourceInput } from "@/types/meal-log";
import type { QuantityInputDraft } from "@/types/quantity-input";

export interface MealLogNutritionPreviewInput {
  source: MealLogSourceInput;
  quantity: MealLogQuantityInput;
  quantityInput?: QuantityInputDraft;
}
export interface MealLogNutritionPreview extends MealLogNutritionPreviewInput {
  nutrition: MealLogNutritionEvidence;
}
