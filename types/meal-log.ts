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
  created_at: string;
  updated_at: string;
}

export interface MealLogColumn {
  id: string;
  name: string;
  sort_order: number;
}

export interface MealLogActiveSection {
  meal_plan_column_id: string;
  slot_name_snapshot: string;
  sort_order: number;
  entries: MealLogEntry[];
  subtotal: MealLogNutritionEvidence;
  incomplete_count: number;
}

export interface MealLogDeletedColumnSection {
  slot_name_snapshot: string;
  entries: MealLogEntry[];
  subtotal: MealLogNutritionEvidence;
  incomplete_count: number;
}

export interface MealLogDayTotal extends MealLogNutritionEvidence {
  incomplete_count: number;
}

export interface MealLogMutationData {
  entry: MealLogEntry;
}

export interface MealLogDayData {
  date: string;
  active_columns: MealLogColumn[];
  active_sections: MealLogActiveSection[];
  deleted_column_sections: MealLogDeletedColumnSection[];
  entries: MealLogEntry[];
  day_total: MealLogDayTotal;
}

export interface MealLogRecentItem {
  source: { type: MealLogSourceType; id: string };
  display_name: string;
  display_brand: string | null;
  last_quantity: { amount: number; unit: string };
  frequency: number;
}

export interface MealLogRecentData {
  items: MealLogRecentItem[];
  next_cursor: string | null;
  has_next: boolean;
}
