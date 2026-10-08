import type { PlannerNutritionValue } from "@/types/planner-nutrition";

/** Server-rendered presentation data, not a public API response. */
export type PlannerMealNutritionViewMap = Record<string, {
  plannedServings: number;
  /** Read only from the pinned nutrition snapshot warnings. */
  containsAiEstimate?: boolean;
  /** Planned total from the recipe snapshot's converted ingredient weights. */
  totalWeightGrams?: number | null;
  values: Record<string, PlannerNutritionValue>;
}>;
