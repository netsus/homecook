import type {
  CookingModeIngredient,
  CookingModeRecipe,
  CookingModeStep,
} from "@/types/cooking";
import {
  normalizeRecipeSectionLabel,
  stripMatchingSectionPrefix,
} from "@/lib/recipe-section-labels";

interface IngredientUsageRecord {
  ingredient_id?: unknown;
  amount?: unknown;
  unit?: unknown;
  cut_size?: unknown;
  note?: unknown;
}

export interface CookModeIngredientUsage {
  ingredient: CookingModeIngredient;
  amountLabel: string;
  note: string | null;
}

export interface CookModeStepModel {
  title: string;
  instruction: string;
  heatLabel: string;
  durationLabel: string;
  ingredientUsages: CookModeIngredientUsage[];
  activeIngredientIds: Set<string>;
}

function isRecord(value: unknown): value is IngredientUsageRecord {
  return Boolean(value) && typeof value === "object";
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(value);
}

export function formatIngredientAmountOnly(
  ingredient: CookingModeIngredient,
): string {
  if (ingredient.display_text) {
    const normalized =
      stripMatchingSectionPrefix(
        ingredient.display_text,
        ingredient.component_label,
      ) ?? ingredient.display_text;
    const withoutName = normalized.replace(ingredient.standard_name, "").trim();

    return withoutName || normalized;
  }

  if (ingredient.ingredient_type === "TO_TASTE") {
    return "적당량";
  }

  if (ingredient.amount === null) {
    return "";
  }

  return `${formatNumber(ingredient.amount)}${ingredient.unit ?? ""}`;
}

export function formatHeatLevel(heat: string | null): string {
  if (!heat) return "불 없음";

  switch (heat) {
    case "high":
      return "강불";
    case "medium_high":
      return "중강불";
    case "medium":
      return "중불";
    case "medium_low":
      return "중약불";
    case "low":
      return "약불";
    default:
      return heat;
  }
}

export function formatDuration(step: CookingModeStep): string {
  if (step.duration_text?.trim()) {
    return step.duration_text.trim();
  }

  if (typeof step.duration_seconds !== "number") {
    return "시간 미정";
  }

  if (step.duration_seconds < 60) {
    return `${step.duration_seconds}초`;
  }

  return `${Math.round(step.duration_seconds / 60)}분`;
}

export function getCookModeStepTitle(step: CookingModeStep): string {
  const sectionLabel = normalizeRecipeSectionLabel(step.component_label);

  if (sectionLabel) {
    return sectionLabel;
  }

  return step.cooking_method.label || `${step.step_number}단계`;
}

function buildAmountLabel(
  usage: IngredientUsageRecord,
  ingredient: CookingModeIngredient,
) {
  if (typeof usage.amount === "number") {
    const unit = typeof usage.unit === "string" ? usage.unit : ingredient.unit;

    return `${formatNumber(usage.amount)}${unit ?? ""}`;
  }

  return formatIngredientAmountOnly(ingredient);
}

function buildUsageNote(usage: IngredientUsageRecord) {
  if (typeof usage.cut_size === "string" && usage.cut_size.trim()) {
    return usage.cut_size.trim();
  }

  if (typeof usage.note === "string" && usage.note.trim()) {
    return usage.note.trim();
  }

  return null;
}

function normalizeMentionText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function instructionMentionsIngredient(
  instruction: string,
  ingredient: CookingModeIngredient,
) {
  const normalizedInstruction = normalizeMentionText(instruction);
  const normalizedName = normalizeMentionText(ingredient.standard_name);

  return (
    normalizedName.length > 0 && normalizedInstruction.includes(normalizedName)
  );
}

function getInstructionMentionedIngredientUsages(
  recipe: CookingModeRecipe,
  step: CookingModeStep,
) {
  const instruction =
    stripMatchingSectionPrefix(step.instruction, step.component_label) ??
    step.instruction;

  return recipe.ingredients
    .filter((ingredient) => instructionMentionsIngredient(instruction, ingredient))
    .map((ingredient) => ({
      ingredient,
      amountLabel: formatIngredientAmountOnly(ingredient),
      note: null,
    }));
}

export function getStepIngredientUsages(
  recipe: CookingModeRecipe,
  step: CookingModeStep,
): CookModeIngredientUsage[] {
  const ingredientsById = new Map(
    recipe.ingredients.map((ingredient) => [
      ingredient.ingredient_id,
      ingredient,
    ]),
  );
  const usages = step.ingredients_used
    .filter(isRecord)
    .map((usage) => {
      const ingredientId =
        typeof usage.ingredient_id === "string"
          ? usage.ingredient_id.trim()
          : "";
      const ingredient = ingredientsById.get(ingredientId);

      if (!ingredient) {
        return null;
      }

      return {
        ingredient,
        amountLabel: buildAmountLabel(usage, ingredient),
        note: buildUsageNote(usage),
      };
    })
    .filter((usage): usage is CookModeIngredientUsage => usage !== null);

  if (usages.length > 0) {
    return usages;
  }

  return getInstructionMentionedIngredientUsages(recipe, step);
}

export function buildCookModeStepModel(
  recipe: CookingModeRecipe,
  step: CookingModeStep,
): CookModeStepModel {
  const ingredientUsages = getStepIngredientUsages(recipe, step);

  return {
    title: getCookModeStepTitle(step),
    instruction:
      stripMatchingSectionPrefix(step.instruction, step.component_label) ??
      step.instruction,
    heatLabel: formatHeatLevel(step.heat_level),
    durationLabel: formatDuration(step),
    ingredientUsages,
    activeIngredientIds: new Set(
      ingredientUsages.map((usage) => usage.ingredient.ingredient_id),
    ),
  };
}
