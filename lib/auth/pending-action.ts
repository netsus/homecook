import type { RecipeEditContext } from "@/types/recipe";

export type PendingRecipeActionType =
  | "like"
  | "save"
  | "planner"
  | "recipe-fork"
  | "recipe-delete"
  | "recipe-edit-save"
  | "recipe-save-as-new";

interface PendingRecipeActionBase {
  recipeId: string;
  redirectTo: string;
  createdAt: number;
  sourceOwnerUuid?: string | null;
}

export type PendingRecipeAction = PendingRecipeActionBase & (
  | { type: "like" | "save" | "planner" | "recipe-delete" }
  | { type: "recipe-fork"; editContext?: RecipeEditContext }
  | { type: "recipe-edit-save" | "recipe-save-as-new"; editContext: RecipeEditContext }
);

export const PENDING_ACTION_KEY = "homecook.pending-recipe-action";
const PENDING_ACTION_TTL_MS = 15 * 60 * 1000;
const MAX_PENDING_ACTION_LENGTH = 256 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isNullableUuid(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && UUID_PATTERN.test(value));
}

function isIngredientUsed(value: unknown) {
  return isRecord(value)
    && hasExactKeys(value, ["ingredient_id", "amount", "unit", "cut_size"])
    && typeof value.ingredient_id === "string"
    && UUID_PATTERN.test(value.ingredient_id)
    && isNullableNumber(value.amount)
    && isNullableString(value.unit)
    && isNullableString(value.cut_size);
}

function isIngredient(value: unknown) {
  return isRecord(value)
    && hasExactKeys(value, [
      "ingredient_id",
      "amount",
      "unit",
      "ingredient_type",
      "display_text",
      "component_label",
      "scalable",
      "food_product_id",
      "food_product_nutrition_version_id",
    ])
    && typeof value.ingredient_id === "string"
    && UUID_PATTERN.test(value.ingredient_id)
    && isNullableNumber(value.amount)
    && isNullableString(value.unit)
    && (value.ingredient_type === "QUANT" || value.ingredient_type === "TO_TASTE")
    && isNullableString(value.display_text)
    && isNullableString(value.component_label)
    && typeof value.scalable === "boolean"
    && isNullableUuid(value.food_product_id)
    && isNullableUuid(value.food_product_nutrition_version_id)
    && ((value.food_product_id === null) ===
      (value.food_product_nutrition_version_id === null));
}

function isStep(value: unknown) {
  return isRecord(value)
    && hasExactKeys(value, [
      "step_number",
      "instruction",
      "cooking_method_id",
      "cooking_method_ids",
      "ingredients_used",
      "component_label",
      "heat_level",
      "duration_seconds",
      "duration_text",
    ])
    && isPositiveInteger(value.step_number)
    && typeof value.instruction === "string"
    && typeof value.cooking_method_id === "string"
    && UUID_PATTERN.test(value.cooking_method_id)
    && Array.isArray(value.cooking_method_ids)
    && value.cooking_method_ids.length > 0
    && value.cooking_method_ids.every((item) => typeof item === "string" && UUID_PATTERN.test(item))
    && Array.isArray(value.ingredients_used)
    && value.ingredients_used.every(isIngredientUsed)
    && isNullableString(value.component_label)
    && isNullableString(value.heat_level)
    && isNullableNumber(value.duration_seconds)
    && isNullableString(value.duration_text);
}

function isEditContext(value: unknown): value is RecipeEditContext {
  if (
    !isRecord(value)
    || !hasExactKeys(value, ["base_recipe_revision", "draft", "image_object_id"])
    || !isPositiveInteger(value.base_recipe_revision)
    || !isNullableUuid(value.image_object_id)
    || !isRecord(value.draft)
    || !hasExactKeys(value.draft, [
      "title",
      "description",
      "base_servings",
      "ingredients",
      "steps",
    ])
  ) {
    return false;
  }

  return typeof value.draft.title === "string"
    && isNullableString(value.draft.description)
    && isPositiveInteger(value.draft.base_servings)
    && Array.isArray(value.draft.ingredients)
    && value.draft.ingredients.every(isIngredient)
    && Array.isArray(value.draft.steps)
    && value.draft.steps.every(isStep);
}

export function parsePendingAction(raw: string, now = Date.now()) {
  if (raw.length > MAX_PENDING_ACTION_LENGTH) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingRecipeAction>;
    if (
      !value
      || typeof value.createdAt !== "number"
      || !Number.isFinite(value.createdAt)
      || value.createdAt > now
      || now - value.createdAt >= PENDING_ACTION_TTL_MS
      || (value.sourceOwnerUuid !== undefined && !isNullableUuid(value.sourceOwnerUuid))
    ) {
      return null;
    }

    if (
      (value.type === "like"
        || value.type === "save"
        || value.type === "planner"
        || value.type === "recipe-delete") &&
      typeof value.recipeId === "string" &&
      typeof value.redirectTo === "string" &&
      Number.isFinite(value.createdAt)
    ) {
      return value as PendingRecipeAction;
    }

    if (
      value.type === "recipe-fork"
      && typeof value.recipeId === "string"
      && typeof value.redirectTo === "string"
      && (value.editContext === undefined || isEditContext(value.editContext))
    ) {
      return value as PendingRecipeAction;
    }

    if (
      (value.type === "recipe-edit-save" || value.type === "recipe-save-as-new")
      && typeof value.recipeId === "string"
      && typeof value.redirectTo === "string"
      && Number.isFinite(value.createdAt)
      && isEditContext(value.editContext)
    ) {
      return value as PendingRecipeAction;
    }
  } catch {
    return null;
  }

  return null;
}

export function savePendingAction(action: PendingRecipeAction) {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const raw = JSON.stringify({
      ...action,
      createdAt: Date.now(),
    });
    if (raw.length > MAX_PENDING_ACTION_LENGTH) return false;
    clearPendingAction();
    window.sessionStorage.setItem(PENDING_ACTION_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

export function readPendingAction() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    // Old actions were shared across tabs/accounts and must not be resumed.
    window.localStorage.removeItem(PENDING_ACTION_KEY);
  } catch {
    // The current tab may still support sessionStorage.
  }
  try {
    const raw = window.sessionStorage.getItem(PENDING_ACTION_KEY);
    if (!raw) return null;
    const action = parsePendingAction(raw);
    if (!action) clearPendingAction();
    return action;
  } catch {
    return null;
  }
}

export function clearPendingAction() {
  if (typeof window === "undefined") {
    return;
  }

  for (const storageName of ["localStorage", "sessionStorage"] as const) {
    try {
      window[storageName].removeItem(PENDING_ACTION_KEY);
    } catch {
      // A disabled storage backend must not prevent cancellation or logout.
    }
  }
}
