import type { MealLogNutritionEvidence, MealLogQuantityInput, MealLogSourceInput } from "@/types/meal-log";

export interface MealLogNutritionPreviewInput {
  source: MealLogSourceInput;
  quantity: MealLogQuantityInput;
}
export interface MealLogNutritionPreview extends MealLogNutritionPreviewInput {
  nutrition: MealLogNutritionEvidence;
}
