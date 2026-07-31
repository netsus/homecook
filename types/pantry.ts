import type { ApiResponse } from "@/types/api";

export interface PantryItem {
  id: string;
  ingredient_id: string;
  standard_name: string;
  category: string;
  category_group_code?: string | null;
  category_code?: string | null;
  category_label?: string | null;
  created_at: string;
}

export interface PantryProductItem {
  id: string;
  food_product_id: string;
  food_product_nutrition_version_id: string;
  name: string;
  brand: string | null;
  created_at: string;
}

export interface PantryListData {
  items: PantryItem[];
  product_items: PantryProductItem[];
}

export interface PantryMutationBody {
  ingredient_ids?: unknown;
  product_items?: unknown;
}

export interface PantryAddData {
  added: number;
  items: PantryItem[];
  product_added: number;
  product_items: PantryProductItem[];
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
