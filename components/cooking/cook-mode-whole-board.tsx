"use client";

import React from "react";

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
          <React.Fragment key={`${ingredient.ingredient_id}-${index}`}>
            {showSectionHeading ? (
              <li className="cook-whole-section-label">{sectionLabel}</li>
            ) : null}
            <li data-testid="ingredient-item">
              <div
                className="cook-whole-ingredient"
                data-testid={`cook-mode-ingredient-${ingredient.ingredient_id}`}
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

  return (
    <ol className="cook-whole-steps" data-testid="step-list">
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
            <CookModeWholeStep step={step} />
          </React.Fragment>
        );
      })}
    </ol>
  );
}

function CookModeWholeStep({
  step,
}: {
  step: CookingModeStep;
}) {
  const instruction = getCookModeStepInstruction(step);
  const methodVisual = getCookingMethodVisual(step.cooking_method);
  const methodAssistiveLabel = getCookingMethodAssistiveLabel({
    methodCode: step.cooking_method.code,
    methodLabel: step.cooking_method.label,
    categoryCode: step.cooking_method.category_code,
    categoryLabel: step.cooking_method.category_label,
  });

  return (
    <li
      className="cook-whole-step"
      data-testid="step-item"
      data-step-number={step.step_number}
    >
      <div
        aria-label={`${step.step_number}단계`}
        className="cook-whole-step-number"
        data-testid={`cook-mode-step-number-${step.step_number}`}
      >
        {step.step_number}
      </div>
      <div className="cook-whole-step-copy">
        <span
          aria-label={methodAssistiveLabel}
          className="cook-whole-method-tag"
          style={{ backgroundColor: methodVisual.color }}
          title={methodAssistiveLabel}
        >
          {methodVisual.label}
        </span>
        <p data-testid={`cook-mode-step-copy-${step.step_number}`}>
          {instruction}
        </p>
      </div>
    </li>
  );
}
