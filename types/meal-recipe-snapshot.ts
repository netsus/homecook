import type { CookingModeIngredient, CookingModeStep } from "@/types/cooking";

/** A read-only projection of the content pinned to one owned plan. */
export interface MealRecipeSnapshotData {
  meal_id: string;
  recipe_id: string;
  snapshot_id: string;
  title: string;
  planned_servings: number;
  ingredients: CookingModeIngredient[];
  steps: CookingModeStep[];
}
