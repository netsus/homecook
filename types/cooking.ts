import type { ApiResponse } from "@/types/api";

export type CookingSessionStatus = "in_progress" | "completed" | "cancelled";

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

export interface CookingStandaloneCompleteBody {
  recipe_id?: string;
  cooking_servings?: number;
  consumed_ingredient_ids?: string[];
}

export interface CookingStandaloneCompleteData {
  leftover_dish_id: string;
  pantry_removed: number;
  cook_count: number;
}

export interface CookingMethodSummary {
  code: string;
  label: string;
  color_key: string;
  category_code?: string | null;
  category_label?: string | null;
}

export interface CookingModeIngredient {
  ingredient_id: string;
  standard_name: string;
  amount: number | null;
  unit: string | null;
  display_text: string | null;
  component_label?: string | null;
  ingredient_type: "QUANT" | "TO_TASTE";
  scalable: boolean;
}

export interface CookingModeStep {
  step_number: number;
  instruction: string;
  component_label?: string | null;
  cooking_method: CookingMethodSummary;
  cooking_methods?: CookingMethodSummary[];
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

export interface CookingStandaloneCookModeData {
  recipe: CookingModeRecipe;
}

export interface SnapshotV2StartData {
  session_id: string;
  contract_version: "snapshot_v2";
  mode: "planner" | "standalone";
  status: "in_progress";
  content_summary: { recipe_id: string; title: string; cooking_servings: number };
}

export interface SnapshotV2CookModeData {
  session_id: string;
  contract_version: "snapshot_v2";
  mode: "planner" | "standalone";
  status: CookingSessionStatus;
  recipe: CookingModeRecipe;
  pantry_candidates: SnapshotV2PantryCandidate[];
}

export interface SnapshotV2PantryCandidate {
  pantry_item_id: string;
  ingredient_id: string;
  item_type: "ingredient" | "food_product";
  standard_name: string;
  food_product_id: string | null;
  food_product_nutrition_version_id: string | null;
  name: string;
  brand: string | null;
}

export type SnapshotV2CompleteBody =
  | {
      consumed_pantry_item_ids: string[];
      weight_action: "set_finished_weight";
      finished_weight_g: number;
    }
  | {
      consumed_pantry_item_ids: string[];
      weight_action: "weigh_later";
      finished_weight_g: null;
    };

export interface CookedBatchProjection {
  id: string;
  recipe_id: string;
  recipe_title: string;
  recipe_thumbnail_url: string | null;
  status: "leftover" | "eaten";
  cooked_at: string;
  cooking_servings: number | null;
  finished_weight_g: number | null;
  remaining_weight_g: number | null;
  weight_status: "known" | "missing" | "unrecoverable" | null;
  batch_status: "available" | "depleted" | null;
  depleted_reason:
    | "consumed"
    | "discarded"
    | "mixed"
    | "consumed_unweighed"
    | "discarded_unweighed"
    | "mixed_unweighed"
    | null;
  revision: number | null;
  nutrition_calculation_status: "complete" | "partial" | "unavailable" | null;
  current_unweighed_closure_event_id: string | null;
}

export interface SnapshotV2CompleteData {
  session_id: string;
  contract_version: "snapshot_v2";
  mode: "planner" | "standalone";
  status: "completed";
  cooked_batch: CookedBatchProjection;
  meals_updated: number;
  pantry_removed: number;
  cook_count: number;
}

export interface SnapshotV2CancelData {
  session_id: string;
  contract_version: "snapshot_v2";
  mode: "planner" | "standalone";
  status: "cancelled";
}

export type CookingSessionCreateResponse = ApiResponse<CookingSessionCreateData>;
export type CookingSessionCancelResponse = ApiResponse<CookingSessionCancelData>;
export type CookingSessionCompleteResponse = ApiResponse<CookingSessionCompleteData>;
export type CookingSessionCookModeResponse = ApiResponse<CookingSessionCookModeData>;
export type CookingStandaloneCompleteResponse =
  ApiResponse<CookingStandaloneCompleteData>;
export type CookingStandaloneCookModeResponse =
  ApiResponse<CookingStandaloneCookModeData>;
