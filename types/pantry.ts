import type { ApiResponse } from "@/types/api";

export interface PantryItem {
  id: string;
  ingredient_id: string;
  standard_name: string;
  category: string;
  created_at: string;
}

export interface PantryListData {
  items: PantryItem[];
}

export interface PantryMutationBody {
  ingredient_ids?: unknown;
}

export interface PantryAddData {
  added: number;
  items: PantryItem[];
}

export interface PantryDeleteData {
  removed: number;
}

export interface PantryBundleIngredient {
  ingredient_id: string;
  standard_name: string;
  is_in_pantry: boolean;
}

export interface PantryBundle {
  id: string;
  name: string;
  display_order: number;
  ingredients: PantryBundleIngredient[];
}

export interface PantryBundleListData {
  bundles: PantryBundle[];
}

export type PantryListResponse = ApiResponse<PantryListData>;
export type PantryAddResponse = ApiResponse<PantryAddData>;
export type PantryDeleteResponse = ApiResponse<PantryDeleteData>;
export type PantryBundleListResponse = ApiResponse<PantryBundleListData>;
