import type { MealLogEntry, MealLogMutationInput } from "@/types/meal-log";

export type MealLogMutationBody = {
  consumed_local_date: MealLogMutationInput["consumedLocalDate"];
  timezone_name_snapshot: MealLogMutationInput["timezoneNameSnapshot"];
  consumed_at: MealLogMutationInput["consumedAt"];
  meal_plan_column_id: MealLogMutationInput["mealPlanColumnId"];
  source: MealLogMutationInput["source"];
  quantity: MealLogMutationInput["quantity"];
  expected_revision?: number;
};

export type MealLogMutationResponse = { entry: MealLogEntry };
