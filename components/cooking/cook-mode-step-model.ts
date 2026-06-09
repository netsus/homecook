import type { CookingModeIngredient, CookingModeStep } from "@/types/cooking";
import {
  normalizeRecipeSectionLabel,
  stripMatchingSectionPrefix,
} from "@/lib/recipe-section-labels";

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(value);
}

export function formatIngredientAmountOnly(
  ingredient: CookingModeIngredient,
): string {
  if (ingredient.ingredient_type === "TO_TASTE") {
    return "적당량";
  }

  if (ingredient.display_text) {
    let normalized =
      stripMatchingSectionPrefix(
        ingredient.display_text,
        ingredient.component_label,
      ) ?? ingredient.display_text;
    const sectionLabel = normalizeRecipeSectionLabel(ingredient.component_label);

    if (sectionLabel && normalized.startsWith(sectionLabel)) {
      normalized = normalized.slice(sectionLabel.length).trimStart();
    }

    const withoutName = normalized.replace(ingredient.standard_name, "").trim();

    return withoutName || normalized;
  }

  if (ingredient.amount === null) {
    return "";
  }

  return `${formatNumber(ingredient.amount)}${ingredient.unit ?? ""}`;
}

export function getCookModeStepInstruction(step: CookingModeStep) {
  return (
    stripMatchingSectionPrefix(step.instruction, step.component_label) ??
    step.instruction
  );
}
