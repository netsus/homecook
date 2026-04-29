import type { ApiResponse } from "@/types/api";

export type RecipeSortKey =
  | "view_count"
  | "like_count"
  | "save_count"
  | "plan_count";

export interface RecipeCardItem {
  id: string;
  title: string;
  thumbnail_url: string | null;
  tags: string[];
  base_servings: number;
  view_count: number;
  like_count: number;
  save_count: number;
  source_type: "system" | "youtube" | "manual";
}

export interface RecipeListData {
  items: RecipeCardItem[];
  next_cursor: string | null;
  has_next: boolean;
}

export interface RecipeListQuery {
  q?: string;
  ingredient_ids?: string[];
  sort?: RecipeSortKey;
  cursor?: string | null;
  limit?: number;
}

export interface IngredientItem {
  id: string;
  standard_name: string;
  category: string;
}

export interface IngredientListQuery {
  q?: string;
  category?: string;
}

export interface IngredientListData {
  items: IngredientItem[];
}

export interface RecipeTheme {
  id: string;
  title: string;
  recipes: RecipeCardItem[];
}

export interface RecipeThemesData {
  themes: RecipeTheme[];
}

export interface RecipeIngredient {
  id: string;
  ingredient_id: string;
  standard_name: string;
  amount: number | null;
  unit: string | null;
  ingredient_type: "QUANT" | "TO_TASTE";
  display_text: string | null;
  scalable: boolean;
  sort_order: number;
}

export interface RecipeStep {
  id: string;
  step_number: number;
  instruction: string;
  cooking_method: {
    id: string;
    code: string;
    label: string;
    color_key: string;
  } | null;
  ingredients_used: Array<{
    ingredient_id: string;
    amount: number | null;
    unit: string | null;
    cut_size?: string | null;
  }>;
  heat_level: string | null;
  duration_seconds: number | null;
  duration_text: string | null;
}

export interface RecipeUserStatus {
  is_liked: boolean;
  is_saved: boolean;
  saved_book_ids: string[];
}

export interface RecipeLikeData {
  is_liked: boolean;
  like_count: number;
}

export type RecipeLikeResponse = ApiResponse<RecipeLikeData>;

export type RecipeBookType = "my_added" | "saved" | "liked" | "custom";
export type SaveableRecipeBookType = Extract<RecipeBookType, "saved" | "custom">;

export interface RecipeBookSummary {
  id: string;
  name: string;
  book_type: RecipeBookType;
  recipe_count: number;
  sort_order: number;
}

export interface RecipeBookListData {
  books: RecipeBookSummary[];
}

export interface RecipeBookCreateBody {
  name: string;
}

export interface RecipeBookCreateData {
  id: string;
  name: string;
  book_type: "custom";
  recipe_count: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface RecipeBookUpdateBody {
  name: string;
}

export type RecipeBookUpdateData = RecipeBookCreateData;

export interface RecipeBookDeleteData {
  deleted: true;
}

export interface RecipeBookRecipeItem {
  recipe_id: string;
  title: string;
  thumbnail_url: string | null;
  tags: string[];
  added_at: string;
}

export interface RecipeBookRecipeListData {
  items: RecipeBookRecipeItem[];
  next_cursor: string | null;
  has_next: boolean;
}

export interface PantryMatchMissingIngredient {
  id: string;
  standard_name: string;
}

export interface PantryMatchRecipeItem {
  id: string;
  title: string;
  thumbnail_url: string | null;
  match_score: number;
  matched_ingredients: number;
  total_ingredients: number;
  missing_ingredients: PantryMatchMissingIngredient[];
}

export interface PantryMatchListData {
  items: PantryMatchRecipeItem[];
}

export interface RecipeSaveBody {
  book_id: string;
}

export interface RecipeSaveData {
  saved: true;
  save_count: number;
  book_id: string;
}

export type RecipeBookListResponse = ApiResponse<RecipeBookListData>;
export type RecipeBookCreateResponse = ApiResponse<RecipeBookCreateData>;
export type RecipeBookUpdateResponse = ApiResponse<RecipeBookUpdateData>;
export type RecipeBookDeleteResponse = ApiResponse<RecipeBookDeleteData>;
export type RecipeSaveResponse = ApiResponse<RecipeSaveData>;

export interface RecipeDetail {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  base_servings: number;
  tags: string[];
  source_type: "system" | "youtube" | "manual";
  source: {
    youtube_url: string | null;
    youtube_video_id: string | null;
  } | null;
  view_count: number;
  like_count: number;
  save_count: number;
  plan_count: number;
  cook_count: number;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  user_status: RecipeUserStatus | null;
}
