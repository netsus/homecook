import type { RecipeEditContext } from "@/types/recipe";

export type PendingRecipeActionType =
  | "like"
  | "save"
  | "planner"
  | "recipe-fork"
  | "recipe-delete"
  | "recipe-edit-save";

interface PendingRecipeActionBase {
  recipeId: string;
  redirectTo: string;
  createdAt: number;
}

export type PendingRecipeAction = PendingRecipeActionBase & (
  | { type: "like" | "save" | "planner" | "recipe-fork" | "recipe-delete" }
  | { type: "recipe-edit-save"; editContext: RecipeEditContext }
);

export const PENDING_ACTION_KEY = "homecook.pending-recipe-action";

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

export function parsePendingAction(raw: string) {
  try {
    const value = JSON.parse(raw) as Partial<PendingRecipeAction>;

    if (
      (value.type === "like"
        || value.type === "save"
        || value.type === "planner"
        || value.type === "recipe-fork"
        || value.type === "recipe-delete") &&
      typeof value.recipeId === "string" &&
      typeof value.redirectTo === "string" &&
      Number.isFinite(value.createdAt)
    ) {
      return value as PendingRecipeAction;
    }

    if (
      value.type === "recipe-edit-save"
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
    return;
  }

  window.localStorage.setItem(PENDING_ACTION_KEY, JSON.stringify(action));
}

export function readPendingAction() {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(PENDING_ACTION_KEY);

  if (!raw) {
    return null;
  }

  const action = parsePendingAction(raw);

  if (!action) {
    window.localStorage.removeItem(PENDING_ACTION_KEY);
  }

  return action;
}

export function clearPendingAction() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(PENDING_ACTION_KEY);
}
