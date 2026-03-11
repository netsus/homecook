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
