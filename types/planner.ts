import type { ApiResponse } from "@/types/api";

export type MealStatus = "registered" | "shopping_done" | "cook_done";

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

export interface PlannerColumnCreateBody {
  name: string;
}

export interface PlannerColumnUpdateBody {
  name?: string;
  sort_order?: number;
}

export type PlannerResponse = ApiResponse<PlannerData>;
export type PlannerColumnResponse = ApiResponse<PlannerColumnData>;
