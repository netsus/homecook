import type { ApiResponse } from "@/types/api";

export type CookingSessionStatus = "in_progress" | "completed" | "cancelled";

export interface CookingReadyDateRange {
  start: string;
  end: string;
}

export interface CookingReadyRecipe {
  recipe_id: string;
  recipe_title: string;
  recipe_thumbnail_url: string | null;
  meal_ids: string[];
  total_servings: number;
}

export interface CookingReadyData {
  date_range: CookingReadyDateRange;
  recipes: CookingReadyRecipe[];
}

export interface CookingSessionCreateBody {
  recipe_id?: string;
  meal_ids?: string[];
  cooking_servings?: number;
}

export interface CookingSessionMealData {
  meal_id: string;
  is_cooked: boolean;
}

export interface CookingSessionCreateData {
  session_id: string;
  recipe_id: string;
  status: "in_progress";
  cooking_servings: number;
  meals: CookingSessionMealData[];
}

export interface CookingSessionCancelData {
  session_id: string;
  status: "cancelled";
}

export interface CookingSessionCompleteBody {
  consumed_ingredient_ids?: string[];
}

export interface CookingSessionCompleteData {
  session_id: string;
  status: "completed";
  meals_updated: number;
  leftover_dish_id: string;
  pantry_removed: number;
  cook_count: number;
}

export interface CookingMethodSummary {
  code: string;
  label: string;
  color_key: string;
}

export interface CookingModeIngredient {
  ingredient_id: string;
  standard_name: string;
  amount: number | null;
  unit: string | null;
  display_text: string | null;
  ingredient_type: "QUANT" | "TO_TASTE";
  scalable: boolean;
}

export interface CookingModeStep {
  step_number: number;
  instruction: string;
  cooking_method: CookingMethodSummary;
  ingredients_used: unknown[];
  heat_level: string | null;
  duration_seconds: number | null;
  duration_text: string | null;
}

export interface CookingModeRecipe {
  id: string;
  title: string;
  cooking_servings: number;
  ingredients: CookingModeIngredient[];
  steps: CookingModeStep[];
}

export interface CookingSessionCookModeData {
  session_id: string;
  recipe: CookingModeRecipe;
}

export type CookingReadyResponse = ApiResponse<CookingReadyData>;
export type CookingSessionCreateResponse = ApiResponse<CookingSessionCreateData>;
export type CookingSessionCancelResponse = ApiResponse<CookingSessionCancelData>;
export type CookingSessionCompleteResponse = ApiResponse<CookingSessionCompleteData>;
export type CookingSessionCookModeResponse = ApiResponse<CookingSessionCookModeData>;
