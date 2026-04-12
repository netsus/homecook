import type { ApiResponse } from "@/types/api";

export type MealStatus = "registered" | "shopping_done" | "cook_done";
export const PLANNER_FIXED_SLOT_NAMES = ["아침", "점심", "간식", "저녁"] as const;
export type PlannerFixedSlotName = (typeof PLANNER_FIXED_SLOT_NAMES)[number];

export interface PlannerColumnData {
  id: string;
  name: string;
  sort_order: number;
}

export interface PlannerMealData {
  id: string;
  recipe_id: string;
  recipe_title: string;
  recipe_thumbnail_url: string | null;
  plan_date: string;
  column_id: string;
  planned_servings: number;
  status: MealStatus;
  is_leftover: boolean;
}

export interface PlannerData {
  columns: PlannerColumnData[];
  meals: PlannerMealData[];
}

export type PlannerResponse = ApiResponse<PlannerData>;
