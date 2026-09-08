import type { PlannerNutritionValue } from "@/types/planner-nutrition";

/** Server-rendered presentation data, not a public API response. */
export type PlannerMealNutritionViewMap = Record<string, {
  plannedServings: number;
  /** Explicit whole-dish weight only; never inferred from servings or ingredient mass. */
  totalWeightGrams?: number | null;
  values: Record<string, PlannerNutritionValue>;
}>;
