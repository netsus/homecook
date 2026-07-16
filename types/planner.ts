import type { ApiResponse } from "@/types/api";
import type { ProductPlannerEntryData } from "@/types/product-planner-entry";

export type MealStatus = "registered" | "shopping_done" | "cook_done";
export const DEFAULT_PLANNER_COLUMN_NAMES = ["아침", "점심", "저녁"] as const;
export type DefaultPlannerColumnName = (typeof DEFAULT_PLANNER_COLUMN_NAMES)[number];

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
  shopping_list_id?: string | null;
  shopping_list_title?: string | null;
}

export interface PlannerData {
  columns: PlannerColumnData[];
  meals: PlannerMealData[];
  product_entries: ProductPlannerEntryData[];
}

export type PlannerResponse = ApiResponse<PlannerData>;

export interface PlannerColumnsData {
  columns: PlannerColumnData[];
}

export interface PlannerColumnMutationData {
  column: PlannerColumnData;
}

export interface PlannerColumnDeleteData {
  deleted: true;
}

export type PlannerColumnsResponse = ApiResponse<PlannerColumnsData>;
export type PlannerColumnMutationResponse = ApiResponse<PlannerColumnMutationData>;
export type PlannerColumnDeleteResponse = ApiResponse<PlannerColumnDeleteData>;
