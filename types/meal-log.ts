export type MealLogSourceType = "cooked_batch" | "food_product" | "ingredient";
export type MealLogNutritionStatus = "complete" | "partial" | "unavailable";

export interface MealLogSourceInput {
  type: MealLogSourceType;
  id: string;
}

export interface MealLogQuantityInput {
  amount: number;
  unit: string;
}

export interface MealLogMutationInput {
  consumedLocalDate: string;
  timezoneNameSnapshot: string;
  consumedAt: string | null;
  mealPlanColumnId: string;
  source: MealLogSourceInput;
  quantity: MealLogQuantityInput;
  expectedRevision: number | null;
}

export interface MealLogNutritionEvidence {
  calculation_status: MealLogNutritionStatus;
  calories_kcal: number | null;
  carbohydrate_g: number | null;
  protein_g: number | null;
  fat_g: number | null;
  sodium_mg: number | null;
}

export interface MealLogEntry {
  id: string;
  revision: number;
  consumed_at: string | null;
  consumed_local_date: string;
  timezone_name_snapshot: string;
  meal_plan_column_id: string | null;
  slot_name_snapshot: string;
  source: { type: MealLogSourceType; id: string };
  quantity: { amount: number; unit: string };
  display_name: string;
  display_brand: string | null;
  nutrition: MealLogNutritionEvidence;
}
