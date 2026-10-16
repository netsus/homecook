"use client";

import React from "react";
import styles from "./cook-mode-layout.module.css";

import {
  formatIngredientAmountOnly,
  getCookModeStepInstruction,
} from "@/components/cooking/cook-mode-step-model";
import { cn } from "@/components/web/utils";
import { getCookingMethodVisual } from "@/lib/cooking-method-colors";
import { getCookingMethodAssistiveLabel } from "@/lib/cooking-method-taxonomy";
import {
  normalizeRecipeSectionLabel,
  shouldShowSectionHeading,
} from "@/lib/recipe-section-labels";
import type {
  CookingModeIngredient,
  CookingModeRecipe,
  CookingModeStep,
} from "@/types/cooking";

interface CookModeWholeBoardProps {
  recipe: CookingModeRecipe;
  density: "mobile" | "desktop";
  className?: string;
}

export function CookModeWholeBoard({
  recipe,
  density,
  className,
}: CookModeWholeBoardProps) {
  return (
    <div
      className={cn("cook-whole-board", `cook-whole-board-${density}`, className)}
      data-testid="cook-mode-whole-board"
    >
      <section
        aria-label="전체 재료"
        className="cook-whole-panel cook-whole-ingredient-panel"
      >
        <h2>전체 재료</h2>
        <IngredientList ingredients={recipe.ingredients} />
      </section>

      <section
        aria-label="전체 조리순서"
        className="cook-whole-panel cook-whole-step-panel"
      >
        <h2>전체 조리순서</h2>
        <p className={styles.servingsNote} data-testid="cook-mode-servings-note">
          재료표는 선택한 인분으로 환산됩니다. 조리법의 수량은 원문 그대로입니다
        </p>
        <StepList recipe={recipe} />
      </section>
    </div>
  );
}

function IngredientList({
  ingredients,
}: {
  ingredients: CookingModeIngredient[];
}) {
  if (ingredients.length === 0) {
    return (
      <p className="cook-whole-empty" data-testid="ingredient-list">
        등록된 재료가 없어요.
      </p>
    );
  }

  return (
    <ul className="cook-whole-ingredients" data-testid="ingredient-list">
      {ingredients.map((ingredient, index) => {
        const sectionLabel = normalizeRecipeSectionLabel(
          ingredient.component_label,
        );
        const previousLabel =
          index > 0 ? ingredients[index - 1]?.component_label : null;
        const showSectionHeading = shouldShowSectionHeading(
          sectionLabel,
          previousLabel,
        );
        const amountLabel = formatIngredientAmountOnly(ingredient);

        return (
          <React.Fragment key={`${ingredientDisplayKey(ingredient, index)}-${index}`}>
            {showSectionHeading ? (
              <li className="cook-whole-section-label">{sectionLabel}</li>
            ) : null}
            <li data-testid="ingredient-item">
              <div
                className="cook-whole-ingredient"
                data-testid={`cook-mode-ingredient-${ingredientDisplayKey(ingredient, index)}`}
              >
                <span className="cook-whole-ingredient-name">
                  {ingredient.standard_name}
                </span>
                <strong className="cook-whole-ingredient-amount">
                  {amountLabel || "-"}
                </strong>
              </div>
            </li>
          </React.Fragment>
        );
      })}
    </ul>
  );
}

function StepList({ recipe }: { recipe: CookingModeRecipe }) {
  if (recipe.steps.length === 0) {
    return (
      <p className="cook-whole-empty" data-testid="step-list">
        등록된 만들기가 없어요.
      </p>
    );
  }

  const ingredientsById = new Map<string, CookingModeIngredient[]>();
  for (const ingredient of recipe.ingredients) {
    const keys: string[] = [];
    if (ingredient.row_key) keys.push(`row:${ingredient.row_key}`);
    if (ingredient.food_product_id && ingredient.food_product_nutrition_version_id) {
      keys.push(`product:${ingredient.food_product_id}:${ingredient.food_product_nutrition_version_id}`);
    }
    if (ingredient.ingredient_id !== null) keys.push(`ingredient:${ingredient.ingredient_id}`);
    for (const key of keys) {
      const rows = ingredientsById.get(key);
      if (rows) rows.push(ingredient);
      else ingredientsById.set(key, [ingredient]);
    }
  }

  return (
    <ol
      aria-label="전체 조리순서 목록"
      className="cook-whole-steps"
      data-testid="step-list"
      tabIndex={0}
    >
      {recipe.steps.map((step, index) => {
        const sectionLabel = normalizeRecipeSectionLabel(step.component_label);
        const previousLabel =
          index > 0 ? recipe.steps[index - 1]?.component_label : null;
        const showSectionHeading = shouldShowSectionHeading(
          sectionLabel,
          previousLabel,
        );

        return (
          <React.Fragment key={`${step.step_number}-${index}`}>
            {showSectionHeading ? (
              <li className="cook-whole-section-label">{sectionLabel}</li>
            ) : null}
            <CookModeWholeStep ingredientsById={ingredientsById} step={step} />
          </React.Fragment>
        );
      })}
    </ol>
  );
}

function ingredientDisplayKey(ingredient: CookingModeIngredient, index: number) {
  if (ingredient.row_key) return ingredient.row_key;
  if (ingredient.food_product_id && ingredient.food_product_nutrition_version_id) {
    return `product:${ingredient.food_product_id}:${ingredient.food_product_nutrition_version_id}:${ingredient.component_label ?? ""}`;
  }
  return ingredient.ingredient_id ?? `unidentified:${index}`;
}

function readIngredientLookupKey(value: unknown) {
  if (value === null || typeof value !== "object") {
    return null;
  }
  if ("row_key" in value && typeof value.row_key === "string") return `row:${value.row_key}`;
  if ("food_product_id" in value && typeof value.food_product_id === "string") {
    return "food_product_nutrition_version_id" in value && typeof value.food_product_nutrition_version_id === "string"
      ? `product:${value.food_product_id}:${value.food_product_nutrition_version_id}` : null;
  }
  return "ingredient_id" in value && typeof value.ingredient_id === "string" ? `ingredient:${value.ingredient_id}` : null;
}

function getStepIngredientNames(
  step: CookingModeStep,
  ingredientsById: Map<string, CookingModeIngredient[]>,
) {
  const names = new Set<string>();

  step.ingredients_used.forEach((usage) => {
    const key = readIngredientLookupKey(usage);
    const rows = key === null ? [] : ingredientsById.get(key) ?? [];
    const candidates = key?.startsWith("row:") || !step.component_label?.trim() ? rows
      : rows.filter((ingredient) => ingredient.component_label?.trim() === step.component_label?.trim());
    const ingredientName = candidates.length === 1 ? candidates[0].standard_name.trim() : null;

    if (ingredientName) {
      names.add(ingredientName);
    }
  });

  return Array.from(names).sort((a, b) => b.length - a.length);
}

function getStepCookingMethods(step: CookingModeStep) {
  if (step.cooking_methods && step.cooking_methods.length > 0) {
    return step.cooking_methods;
  }

  return step.cooking_method ? [step.cooking_method] : [];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type InstructionHighlight = {
  start: number;
  end: number;
  label: string;
  type: "ingredient" | "method";
};

function getInstructionHighlights(
  instruction: string,
  ingredientNames: string[],
  methodLabels: string[],
) {
  const candidates: Array<{
    label: string;
    type: InstructionHighlight["type"];
  }> = [];

  for (const label of ingredientNames) {
    candidates.push({ label, type: "ingredient" });
  }
  for (const methodLabel of methodLabels) {
    const label = methodLabel.trim();
    if (label.length > 0) {
      candidates.push({ label, type: "method" });
    }
  }
  candidates.sort((a, b) => b.label.length - a.label.length);

  const highlights: InstructionHighlight[] = [];

  candidates.forEach((candidate) => {
    const pattern = new RegExp(escapeRegExp(candidate.label), "gu");
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(instruction)) !== null) {
      const start = match.index;
      const end = start + candidate.label.length;
      const overlaps = highlights.some(
        (highlight) => start < highlight.end && end > highlight.start,
      );

      if (!overlaps) {
        highlights.push({
          start,
          end,
          label: candidate.label,
          type: candidate.type,
        });
      }
    }
  });

  return highlights.sort((a, b) => a.start - b.start);
}

function renderInstructionWithHighlights({
  ingredientNames,
  instruction,
  methodColor,
  methodLabels,
}: {
  ingredientNames: string[];
  instruction: string;
  methodColor: string;
  methodLabels: string[];
}) {
  const highlights = getInstructionHighlights(
    instruction,
    ingredientNames,
    methodLabels,
  );

  if (highlights.length === 0) {
    return instruction;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  highlights.forEach((highlight, index) => {
    if (cursor < highlight.start) {
      parts.push(instruction.slice(cursor, highlight.start));
    }

    const text = instruction.slice(highlight.start, highlight.end);

    if (highlight.type === "method") {
      parts.push(
        <span
          className="cook-whole-step-method-highlight"
          data-testid="cook-mode-step-method-highlight"
          key={`${highlight.type}-${highlight.label}-${index}`}
          style={{ color: methodColor }}
        >
          {text}
        </span>,
      );
    } else {
      parts.push(
        <strong
          className="cook-whole-step-ingredient"
          data-testid="cook-mode-step-ingredient-highlight"
          key={`${highlight.type}-${highlight.label}-${index}`}
        >
          {text}
        </strong>,
      );
    }

    cursor = highlight.end;
  });

  if (cursor < instruction.length) {
    parts.push(instruction.slice(cursor));
  }

  return parts;
}

function CookModeWholeStep({
  ingredientsById,
  step,
}: {
  ingredientsById: Map<string, CookingModeIngredient[]>;
  step: CookingModeStep;
}) {
  const instruction = getCookModeStepInstruction(step);
  const methods = getStepCookingMethods(step);
  const primaryMethod = methods[0] ?? step.cooking_method;
  const methodVisual = getCookingMethodVisual(primaryMethod);
  const highlightedInstruction = renderInstructionWithHighlights({
    ingredientNames: getStepIngredientNames(step, ingredientsById),
    instruction,
    methodColor: methodVisual.color,
    methodLabels: methods.map((method) => method.label),
  });
  const methodAssistiveLabel = getCookingMethodAssistiveLabel({
    methodCode: primaryMethod.code,
    methodLabel: primaryMethod.label,
    categoryCode: primaryMethod.category_code,
    categoryLabel: primaryMethod.category_label,
  });

  return (
    <li
      className="cook-whole-step"
      data-testid="step-item"
      data-step-number={step.step_number}
    >
      <div
        className="cook-whole-step-marker"
        data-testid={`cook-mode-step-marker-${step.step_number}`}
      >
        <div className="cook-whole-method-tags">
          {methods.length > 0 ? (
            methods.map((method) => {
              const visual = getCookingMethodVisual(method);
              const assistiveLabel = getCookingMethodAssistiveLabel({
                methodCode: method.code,
                methodLabel: method.label,
                categoryCode: method.category_code,
                categoryLabel: method.category_label,
              });

              return (
                <span
                  aria-label={assistiveLabel}
                  className="cook-whole-method-tag"
                  key={method.code || method.label}
                  style={{ backgroundColor: visual.color }}
                  title={assistiveLabel}
                >
                  {visual.label}
                </span>
              );
            })
          ) : (
            <span
              aria-label={methodAssistiveLabel}
              className="cook-whole-method-tag"
              style={{ backgroundColor: methodVisual.color }}
              title={methodAssistiveLabel}
            >
              {methodVisual.label}
            </span>
          )}
        </div>
      </div>
      <div className="cook-whole-step-main">
        <div
          aria-label={`${step.step_number}단계`}
          className="cook-whole-step-number"
          data-testid={`cook-mode-step-number-${step.step_number}`}
        >
          {step.step_number}
        </div>
        <div className="cook-whole-step-copy">
          <p data-testid={`cook-mode-step-copy-${step.step_number}`}>
            {highlightedInstruction}
          </p>
        </div>
      </div>
    </li>
  );
}
