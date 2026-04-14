import type { ApiResponse } from "@/types/api";
import type { MealStatus } from "@/types/planner";

export interface MealCreateBody {
  recipe_id?: string;
  plan_date?: string;
  column_id?: string;
  planned_servings?: number;
  leftover_dish_id?: string | null;
}

export interface MealCreateData {
  id: string;
  recipe_id: string;
  plan_date: string;
  column_id: string;
  planned_servings: number;
  status: MealStatus;
  is_leftover: boolean;
  leftover_dish_id: string | null;
}

export type MealCreateResponse = ApiResponse<MealCreateData>;
