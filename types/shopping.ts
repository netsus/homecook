import type { ApiResponse } from "@/types/api";

export interface ShoppingPreviewMeal {
  id: string;
  recipe_id: string;
  recipe_name: string;
  recipe_thumbnail: string | null;
  planned_servings: number;
  created_at: string;
}

export interface ShoppingPreviewRecipe {
  recipe_id: string;
  recipe_name: string;
  recipe_thumbnail: string | null;
  meal_ids: string[];
  planned_servings_total: number;
  shopping_servings: number;
  is_selected: boolean;
}

export interface ShoppingPreviewData {
  eligible_meals: ShoppingPreviewMeal[];
  recipes?: ShoppingPreviewRecipe[];
}

export interface ShoppingMealConfigInput {
  meal_id?: string;
  shopping_servings?: number;
}

export interface ShoppingRecipeConfigInput {
  recipe_id?: string;
  meal_ids?: string[];
  shopping_servings?: number;
}

export interface ShoppingListCreateBody {
  meal_configs?: ShoppingMealConfigInput[];
  recipes?: ShoppingRecipeConfigInput[];
}

export interface ShoppingListSummary {
  id: string;
  title: string;
  is_completed: boolean;
  created_at: string;
}

export interface ShoppingListRecipeSummary {
  recipe_id: string;
  recipe_name: string;
  recipe_thumbnail: string | null;
  shopping_servings: number;
  planned_servings_total: number;
}

export interface ShoppingListItemSummary {
  id: string;
  ingredient_id: string;
  display_text: string;
  amounts_json: Array<{ amount: number; unit: string }>;
  is_checked: boolean;
  is_pantry_excluded: boolean;
  added_to_pantry: boolean;
  sort_order: number;
}

export interface ShoppingListDetail {
  id: string;
  title: string;
  date_range_start: string;
  date_range_end: string;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  recipes: ShoppingListRecipeSummary[];
  items: ShoppingListItemSummary[];
}

export interface ShoppingListItemUpdateBody {
  is_checked?: boolean;
  is_pantry_excluded?: boolean;
}

export interface ShoppingListReorderItem {
  item_id: string;
  sort_order: number;
}

export interface ShoppingListReorderBody {
  orders: ShoppingListReorderItem[];
}

export interface ShoppingListReorderData {
  updated: number;
}

export interface ShoppingListCompleteData {
  completed: true;
  meals_updated: number;
  pantry_added: number;
  pantry_added_item_ids: string[];
}

export interface ShoppingListCompleteBody {
  add_to_pantry_item_ids?: string[] | null;
}

export interface ShoppingShareTextData {
  text: string;
}

export type ShoppingPreviewResponse = ApiResponse<ShoppingPreviewData>;
export type ShoppingListCreateResponse = ApiResponse<ShoppingListSummary>;
export type ShoppingListDetailResponse = ApiResponse<ShoppingListDetail>;
export type ShoppingListItemUpdateResponse = ApiResponse<ShoppingListItemSummary>;
export type ShoppingListReorderResponse = ApiResponse<ShoppingListReorderData>;
export type ShoppingListCompleteResponse = ApiResponse<ShoppingListCompleteData>;
export type ShoppingShareTextResponse = ApiResponse<ShoppingShareTextData>;
