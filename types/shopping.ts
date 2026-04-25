import type { ApiResponse } from "@/types/api";

export interface ShoppingPreviewMeal {
  id: string;
  recipe_id: string;
  recipe_name: string;
  recipe_thumbnail: string | null;
  planned_servings: number;
  created_at: string;
}

export interface ShoppingPreviewData {
  eligible_meals: ShoppingPreviewMeal[];
}

export interface ShoppingMealConfigInput {
  meal_id?: string;
  shopping_servings?: number;
}

export interface ShoppingListCreateBody {
  meal_configs?: ShoppingMealConfigInput[];
}

export interface ShoppingListSummary {
  id: string;
  title: string;
  is_completed: boolean;
  created_at: string;
}

export type ShoppingPreviewResponse = ApiResponse<ShoppingPreviewData>;
export type ShoppingListCreateResponse = ApiResponse<ShoppingListSummary>;
