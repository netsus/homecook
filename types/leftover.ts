import type { ApiResponse } from "@/types/api";

export type LeftoverDishStatus = "leftover" | "eaten";

export interface LeftoverListItemData {
  id: string;
  recipe_id: string;
  recipe_title: string;
  recipe_thumbnail_url: string | null;
  status: LeftoverDishStatus;
  cooked_at: string;
  eaten_at: string | null;
}

export interface LeftoverListData {
  items: LeftoverListItemData[];
}

export interface LeftoverMutationData {
  id: string;
  status: LeftoverDishStatus;
  eaten_at: string | null;
  auto_hide_at: string | null;
}

export type LeftoverListResponse = ApiResponse<LeftoverListData>;
export type LeftoverMutationResponse = ApiResponse<LeftoverMutationData>;
