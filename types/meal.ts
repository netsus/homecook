import type { ApiResponse } from "@/types/api";
import type { MealStatus } from "@/types/planner";

export interface MealListItemData {
  id: string;
  recipe_id: string;
  recipe_title: string;
  recipe_thumbnail_url: string | null;
  planned_servings: number;
  status: MealStatus;
  is_leftover: boolean;
}

export interface MealListData {
  items: MealListItemData[];
}

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

export interface MealUpdateBody {
  planned_servings?: number;
}

export interface MealMutationData {
  id: string;
  planned_servings: number;
  status: MealStatus;
}

export type MealListResponse = ApiResponse<MealListData>;
export type MealCreateResponse = ApiResponse<MealCreateData>;
export type MealMutationResponse = ApiResponse<MealMutationData>;
