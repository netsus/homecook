import type {
  RecipeIngredient,
  RecipeStep,
  RecipeStepCookingMethod,
} from "@/types/recipe";
import { isQuantityInputSnapshot } from "@/lib/quantity-input";

export interface YoutubeSavedPublicRecipeProjection {
  /** Current owner-selected identity exists; legacy nutrition snapshots may predate it. */
  catalogSelectionPresent?: boolean;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : value === null ? null : undefined;
}

function finiteNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function parseCookingMethod(value: unknown): RecipeStepCookingMethod | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.code !== "string"
    || typeof value.label !== "string"
    || typeof value.color_key !== "string"
  ) {
    return null;
  }

  return {
    id: typeof value.id === "string" ? value.id : value.code,
    code: value.code,
    label: value.label,
    color_key: value.color_key,
    category_code: nullableString(value.category_code) ?? null,
    category_label: nullableString(value.category_label) ?? null,
  };
}

function parseIngredient(value: unknown): RecipeIngredient | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string"
    || typeof value.ingredient_id !== "string"
    || typeof value.standard_name !== "string"
    || (value.ingredient_type !== "QUANT" && value.ingredient_type !== "TO_TASTE")
    || typeof value.scalable !== "boolean"
  ) {
    return null;
  }

  const amount = value.amount === null ? null : finiteNumber(value.amount);
  const sortOrder = finiteNumber(value.sort_order);
  const unit = nullableString(value.unit);
  const displayText = nullableString(value.display_text);
  const componentLabel = nullableString(value.component_label);

  if (
    (value.amount !== null && amount === null)
    || sortOrder === null
    || unit === undefined
    || displayText === undefined
    || componentLabel === undefined
  ) {
    return null;
  }

  const ingredient: RecipeIngredient = {
    id: value.id,
    ingredient_id: value.ingredient_id,
    standard_name: value.standard_name,
    amount,
    unit,
    ingredient_type: value.ingredient_type,
    display_text: displayText,
    component_label: componentLabel,
    scalable: value.scalable,
    sort_order: sortOrder,
  };
  if ("quantity_input" in value) {
    if (amount === null || unit === null || !isQuantityInputSnapshot(value.quantity_input, { amount, unit })) return null;
    const withQuantity = { ...ingredient, quantity_input: value.quantity_input,
      display_text: value.ingredient_type === "QUANT"
        ? `${value.standard_name} ${value.quantity_input.raw_value}${value.quantity_input.raw_unit}` : displayText };
    return withQuantity;
  }
  return ingredient;
}

function parseStep(value: unknown): RecipeStep | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string"
    || typeof value.instruction !== "string"
  ) {
    return null;
  }

  const stepNumber = finiteNumber(value.step_number);
  const componentLabel = nullableString(value.component_label);
  const heatLevel = nullableString(value.heat_level);
  const durationText = nullableString(value.duration_text);
  const durationSeconds = value.duration_seconds === null
    ? null
    : finiteNumber(value.duration_seconds);

  if (
    stepNumber === null
    || componentLabel === undefined
    || heatLevel === undefined
    || durationText === undefined
    || (value.duration_seconds !== null && durationSeconds === null)
  ) {
    return null;
  }

  const cookingMethods = Array.isArray(value.cooking_methods)
    ? value.cooking_methods
      .map(parseCookingMethod)
      .filter((method): method is RecipeStepCookingMethod => method !== null)
    : [];

  return {
    id: value.id,
    step_number: stepNumber,
    instruction: value.instruction,
    component_label: componentLabel,
    cooking_method: cookingMethods[0] ?? null,
    cooking_methods: cookingMethods,
    ingredients_used: Array.isArray(value.ingredients_used)
      ? value.ingredients_used as RecipeStep["ingredients_used"]
      : [],
    heat_level: heatLevel,
    duration_seconds: durationSeconds,
    duration_text: durationText,
  };
}

export function parseYoutubeSavedPublicRecipeProjection(
  value: unknown,
): YoutubeSavedPublicRecipeProjection | null {
  if (
    !isRecord(value)
    || ("catalog_selection_present" in value && typeof value.catalog_selection_present !== "boolean")
    || !Array.isArray(value.ingredients)
    || !Array.isArray(value.steps)
  ) {
    return null;
  }

  const ingredients = value.ingredients.map(parseIngredient);
  const steps = value.steps.map(parseStep);
  if (
    ingredients.some((ingredient) => ingredient === null)
    || steps.some((step) => step === null)
  ) {
    return null;
  }

  const projection: YoutubeSavedPublicRecipeProjection = {
    ingredients: ingredients as RecipeIngredient[],
    steps: steps as RecipeStep[],
  };
  if (typeof value.catalog_selection_present === "boolean") projection.catalogSelectionPresent = value.catalog_selection_present;
  return projection;
}
