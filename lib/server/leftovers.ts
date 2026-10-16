import type {
  LeftoverDishStatus,
  LeftoverListItemData,
  LeftoverMutationData,
  LeftoverKeepData,
} from "@/types/leftover";
import { normalizeFoodSafetyImageUrl } from "@/lib/recipe-image";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface LeftoverDishRow {
  id: string;
  user_id: string;
  recipe_id: string;
  recipe_content_snapshot_id?: string | null;
  recipe_content_snapshots?:
    | {
      id: string;
      recipe_id: string;
      title: string;
    }
    | null;
  status: LeftoverDishStatus;
  cooked_at: string;
  eaten_at: string | null;
  auto_hide_at: string | null;
  stale_reviewed_at: string | null;
  cooking_servings: number | null;
  weight_status?: "known" | "missing" | "unrecoverable" | null;
  batch_status?: "available" | "depleted" | null;
  depleted_reason?:
    | "consumed"
    | "discarded"
    | "mixed"
    | "consumed_unweighed"
    | "discarded_unweighed"
    | "mixed_unweighed"
    | null;
}

export interface LeftoverRecipeRow {
  id: string;
  title: string;
  thumbnail_url: string | null;
}

export interface LeftoverSourceMealRow {
  leftover_dish_id: string | null;
  planned_servings: number;
  meal_plan_columns: { name: string | null } | null;
}

export interface LeftoverOriginMealDetail {
  planned_servings: number;
  meal_plan_columns: { name: string | null } | null;
}

export interface LeftoverOriginMealRow {
  session_id: string | null;
  meals: LeftoverOriginMealDetail | LeftoverOriginMealDetail[] | null;
}

export function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function normalizeLeftoverStatus(value: string | null): LeftoverDishStatus | null {
  if (value === null || value.trim().length === 0) {
    return "leftover";
  }

  return value === "leftover" || value === "eaten" ? value : null;
}

export function addDaysIso(base: Date, days: number) {
  const next = new Date(base.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString();
}

export function projectLeftoverCompatibilityStatus(
  row: Pick<
    LeftoverDishRow,
    "recipe_content_snapshot_id" | "status" | "batch_status" | "depleted_reason"
  >,
): LeftoverDishStatus {
  if (!row.recipe_content_snapshot_id || row.batch_status === null || row.batch_status === undefined) {
    return row.status;
  }

  return row.batch_status === "depleted"
      && (row.depleted_reason === "consumed"
        || row.depleted_reason === "consumed_unweighed")
    ? "eaten"
    : "leftover";
}

interface LegacyLeftoverMutationError {
  error_code: "RESOURCE_NOT_FOUND" | "FORBIDDEN" | "CONFLICT";
}

export function describeLegacyLeftoverMutationError(
  code: LegacyLeftoverMutationError["error_code"],
  action: "eat" | "uneat" | "keep",
) {
  if (code === "RESOURCE_NOT_FOUND") {
    return { code, message: "남은 요리를 찾을 수 없어요.", status: 404 };
  }
  if (code === "FORBIDDEN") {
    return { code, message: "내 남은 요리만 수정할 수 있어요.", status: 403 };
  }
  return {
    code,
    message: action === "keep"
      ? "이미 다먹음 처리된 남은 요리는 계속 보관할 수 없어요."
      : "중량 기록이 있는 요리는 전용 기록 화면에서 변경해 주세요.",
    status: 409,
  };
}

export function parseLegacyLeftoverMutation(
  value: unknown,
  action: "keep",
): LeftoverKeepData | LegacyLeftoverMutationError | null;
export function parseLegacyLeftoverMutation(
  value: unknown,
  action: "eat" | "uneat",
): LeftoverMutationData | LegacyLeftoverMutationError | null;
export function parseLegacyLeftoverMutation(
  value: unknown,
  action: "eat" | "uneat" | "keep",
): LeftoverMutationData | LeftoverKeepData | LegacyLeftoverMutationError | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if ("error_code" in value) {
    const code = value.error_code;
    return code === "RESOURCE_NOT_FOUND" || code === "FORBIDDEN" || code === "CONFLICT"
      ? { error_code: code }
      : null;
  }
  if (!("id" in value) || typeof value.id !== "string" || value.id.length === 0 ||
    !("status" in value) || value.status !== (action === "eat" ? "eaten" : "leftover") ||
    !("transitioned" in value) || typeof value.transitioned !== "boolean") return null;

  if (action === "keep") {
    if (!("stale_reviewed_at" in value) || typeof value.stale_reviewed_at !== "string") return null;
    return { id: value.id, status: "leftover", stale_reviewed_at: value.stale_reviewed_at };
  }
  if (!("eaten_at" in value) || (value.eaten_at !== null && typeof value.eaten_at !== "string") ||
    !("auto_hide_at" in value) || (value.auto_hide_at !== null && typeof value.auto_hide_at !== "string")) return null;

  return {
    id: value.id,
    status: action === "eat" ? "eaten" : "leftover",
    eaten_at: value.eaten_at,
    auto_hide_at: value.auto_hide_at,
  };
}

export function toLeftoverListItem(
  row: LeftoverDishRow,
  recipeMap: Map<string, LeftoverRecipeRow>,
  sourceMealMap = new Map<string, LeftoverSourceMealRow>(),
  contentSnapshotMap = new Map<string, { id: string; recipe_id: string; title: string }>(),
): LeftoverListItemData {
  const recipe = recipeMap.get(row.recipe_id);
  const sourceMeal = sourceMealMap.get(row.id);
  const contentSnapshot = row.recipe_content_snapshot_id
    ? contentSnapshotMap.get(row.recipe_content_snapshot_id) ?? null
    : null;

  return {
    id: row.id,
    recipe_id: row.recipe_id,
    recipe_title: contentSnapshot?.title ?? recipe?.title ?? "",
    recipe_thumbnail_url: normalizeFoodSafetyImageUrl(recipe?.thumbnail_url),
    status: row.status,
    cooked_at: row.cooked_at,
    eaten_at: row.eaten_at,
    stale_reviewed_at: row.stale_reviewed_at,
    cooking_servings: row.cooking_servings ?? 1,
    source_meal_label: sourceMeal?.meal_plan_columns?.name ?? null,
    source_planned_servings: sourceMeal?.planned_servings ?? null,
  };
}
