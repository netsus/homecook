import type {
  LeftoverDishStatus,
  LeftoverListItemData,
  LeftoverMutationData,
} from "@/types/leftover";

export const LEFTOVER_DISH_STATUSES = ["leftover", "eaten"] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface LeftoverDishRow {
  id: string;
  user_id: string;
  recipe_id: string;
  status: LeftoverDishStatus;
  cooked_at: string;
  eaten_at: string | null;
  auto_hide_at: string | null;
}

export interface LeftoverRecipeRow {
  id: string;
  title: string;
  thumbnail_url: string | null;
}

export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function normalizeLeftoverStatus(value: string | null): LeftoverDishStatus | null {
  if (value === null || value.trim().length === 0) {
    return "leftover";
  }

  return LEFTOVER_DISH_STATUSES.includes(value as LeftoverDishStatus)
    ? (value as LeftoverDishStatus)
    : null;
}

export function addDaysIso(base: Date, days: number) {
  const next = new Date(base.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

export function toLeftoverMutationData(row: {
  id: string;
  status: LeftoverDishStatus;
  eaten_at: string | null;
  auto_hide_at: string | null;
}): LeftoverMutationData {
  return {
    id: row.id,
    status: row.status,
    eaten_at: row.eaten_at,
    auto_hide_at: row.auto_hide_at,
  };
}

export function toLeftoverListItem(
  row: LeftoverDishRow,
  recipeMap: Map<string, LeftoverRecipeRow>,
): LeftoverListItemData {
  const recipe = recipeMap.get(row.recipe_id);

  return {
    id: row.id,
    recipe_id: row.recipe_id,
    recipe_title: recipe?.title ?? "",
    recipe_thumbnail_url: recipe?.thumbnail_url ?? null,
    status: row.status,
    cooked_at: row.cooked_at,
    eaten_at: row.eaten_at,
  };
}
