"use client";

import React from "react";

import {
  CookModeThemeToggle,
  type CookModeColorTheme,
} from "@/components/cooking/cook-mode-theme-toggle";
import {
  buildCookModeStepModel,
  formatIngredientAmountOnly,
  type CookModeIngredientUsage,
} from "@/components/cooking/cook-mode-step-model";
import type { CookingModeIngredient, CookingModeRecipe } from "@/types/cooking";
import { getCookingMethodVisual } from "@/lib/cooking-method-colors";
import { getCookingMethodAssistiveLabel } from "@/lib/cooking-method-taxonomy";
import {
  normalizeRecipeSectionLabel,
  shouldShowSectionHeading,
} from "@/lib/recipe-section-labels";
import { WebShell, WebTopNav } from "@/components/web";
import { cn } from "@/components/web/utils";

interface CookModeDesktopViewProps {
  recipe: CookingModeRecipe;
  variant: "planner" | "standalone";
  mealContextLabel?: string | null;
  screenTestId: string;
  contentTestId: string;
  titleTestId: string;
  servingsTestId: string;
  cancelButtonTestId: string;
  completeButtonTestId: string;
  controlsDisabled: boolean;
  colorTheme: CookModeColorTheme;
  onCancel: () => void;
  onComplete: () => void;
  onColorThemeToggle: () => void;
}

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "홈" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

export function CookModeDesktopView({
  recipe,
  variant,
  mealContextLabel,
  screenTestId,
  contentTestId,
  titleTestId,
  servingsTestId,
  cancelButtonTestId,
  completeButtonTestId,
  controlsDisabled,
  colorTheme,
  onCancel,
  onComplete,
  onColorThemeToggle,
}: CookModeDesktopViewProps) {
  const [currentStepIndex, setCurrentStepIndex] = React.useState(0);
  const steps = recipe.steps;
  const totalSteps = steps.length;
  const currentStep = steps[currentStepIndex] ?? null;
  const stepModel = currentStep
    ? buildCookModeStepModel(recipe, currentStep)
    : null;
  const methodVisual = getCookingMethodVisual(currentStep?.cooking_method);
  const methodAssistiveLabel = getCookingMethodAssistiveLabel({
    methodCode: currentStep?.cooking_method.code,
    methodLabel: currentStep?.cooking_method.label,
    categoryCode: currentStep?.cooking_method.category_code,
    categoryLabel: currentStep?.cooking_method.category_label,
  });
  const contextLabel = variant === "planner" ? "플래너 요리" : "독립 요리";
  const summaryParts = [
    "요리모드",
    `${recipe.cooking_servings}인분`,
    mealContextLabel ?? contextLabel,
  ];

  React.useEffect(() => {
    setCurrentStepIndex((index) => {
      if (totalSteps === 0) return 0;

      return Math.min(index, totalSteps - 1);
    });
  }, [totalSteps]);

  const moveStep = React.useCallback(
    (delta: number) => {
      setCurrentStepIndex((index) =>
        Math.max(0, Math.min(totalSteps - 1, index + delta)),
      );
    },
    [totalSteps],
  );

  const selectStep = React.useCallback((index: number) => {
    setCurrentStepIndex(index);
  }, []);

  return (
    <WebShell
      className={cn(
        "web-cooking-shell",
        colorTheme === "dark" && "web-cooking-shell-dark",
      )}
      wide
    >
      <WebTopNav
        activeId={variant === "planner" ? "planner" : undefined}
        items={WEB_NAV_ITEMS}
        rightSlot={
          <div className="web-profile-button">
            {variant === "planner" ? "JY" : "◎"}
          </div>
        }
      />

      <main
        className="web-cook-mode-screen web-cook-mode-prototype-screen"
        data-cook-theme={colorTheme}
        data-testid={screenTestId}
      >
        <h1 className="sr-only">요리모드</h1>

        <div
          className="web-cook-prototype-board"
          data-testid={contentTestId}
        >
          <header className="web-cook-prototype-top">
            <div className="web-cook-prototype-title">
              <b data-testid={titleTestId} title={recipe.title}>
                {recipe.title}
              </b>
              <span>
                {summaryParts.map((part, index) => (
                  <React.Fragment key={`${part}-${index}`}>
                    {index > 0 ? " · " : null}
                    <span
                      data-testid={
                        part === `${recipe.cooking_servings}인분`
                          ? servingsTestId
                          : undefined
                      }
                    >
                      {part}
                    </span>
                  </React.Fragment>
                ))}
              </span>
            </div>
            <div className="web-cook-prototype-actions">
              <span className="web-cook-prototype-status">화면 켜짐</span>
              <CookModeThemeToggle
                onToggle={onColorThemeToggle}
                theme={colorTheme}
                variant="desktop"
              />
              <button
                className="web-cook-prototype-cancel"
                data-testid={cancelButtonTestId}
                disabled={controlsDisabled}
                onClick={onCancel}
                type="button"
              >
                취소
              </button>
            </div>
          </header>

          <div className="web-cook-prototype-grid">
            <aside
              aria-label="꺼내둘 재료"
              className="web-cook-prototype-panel"
              data-testid="cook-mode-action-rail"
            >
              <h2>꺼내둘 재료</h2>
              <IngredientBoard
                activeIngredientIds={stepModel?.activeIngredientIds ?? new Set()}
                ingredients={recipe.ingredients}
              />
            </aside>

            {currentStep && stepModel ? (
              <section
                aria-label="현재 조리 단계"
                className="web-cook-prototype-panel web-cook-prototype-focus"
                data-testid="cook-mode-current-step"
              >
                <div className="web-cook-prototype-step-head">
                  <div className="web-cook-prototype-count">
                    <strong data-testid="cook-mode-counter">
                      {currentStepIndex + 1}
                    </strong>
                    <span
                      aria-label={methodAssistiveLabel}
                      className="web-cook-prototype-method"
                      style={{ backgroundColor: methodVisual.color }}
                      title={methodAssistiveLabel}
                    >
                      {methodVisual.label}
                    </span>
                  </div>
                  <div
                    className="web-cook-prototype-step-nav"
                    data-testid="cook-mode-step-nav"
                  >
                    <button
                      aria-label="이전 단계"
                      className="web-cook-prototype-arrow"
                      data-testid="cook-mode-prev-step"
                      disabled={controlsDisabled || currentStepIndex <= 0}
                      onClick={() => moveStep(-1)}
                      type="button"
                    >
                      ‹
                    </button>
                    <button
                      aria-label="다음 단계"
                      className="web-cook-prototype-arrow"
                      data-testid="cook-mode-next-step"
                      disabled={
                        controlsDisabled ||
                        totalSteps === 0 ||
                        currentStepIndex >= totalSteps - 1
                      }
                      onClick={() => moveStep(1)}
                      type="button"
                    >
                      ›
                    </button>
                  </div>
                </div>

                <div
                  className="web-cook-prototype-copy"
                  data-testid="step-item"
                >
                  <h2 data-testid="cook-mode-current-step-title">
                    {stepModel.title}
                  </h2>
                  <p data-testid="cook-mode-current-step-copy">
                    {stepModel.instruction}
                  </p>
                  <div className="web-cook-prototype-meta-row">
                    <span>{stepModel.heatLabel}</span>
                    <span>{stepModel.durationLabel}</span>
                  </div>
                  {stepModel.ingredientUsages.length > 0 ? (
                    <CurrentAmountBoard usages={stepModel.ingredientUsages} />
                  ) : null}
                </div>

                <div className="web-cook-prototype-controls">
                  <button
                    className="web-cook-prototype-complete"
                    data-testid={completeButtonTestId}
                    disabled={controlsDisabled}
                    onClick={onComplete}
                    type="button"
                  >
                    요리 완료
                  </button>
                </div>
              </section>
            ) : (
              <section className="web-cook-prototype-panel web-cook-prototype-focus">
                <p className="web-cook-prototype-empty">
                  등록된 만들기가 없어요.
                </p>
              </section>
            )}

            <aside aria-label="조리 순서" className="web-cook-prototype-panel">
              <h2>조리 순서</h2>
              <ol className="web-cook-prototype-timeline" data-testid="step-list">
                {steps.map((step, index) => {
                  const isActive = index === currentStepIndex;

                  return (
                    <li key={step.step_number}>
                      <button
                        aria-current={isActive ? "step" : undefined}
                        className={cn(
                          "web-cook-prototype-timeline-row",
                          isActive && "web-cook-prototype-timeline-row-active",
                        )}
                        data-testid={`cook-mode-timeline-step-${step.step_number}`}
                        onClick={() => selectStep(index)}
                        type="button"
                      >
                        <strong>{step.step_number}</strong>
                        <span>{getTimelineTitle(step)}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </aside>
          </div>
        </div>
      </main>
    </WebShell>
  );
}

function IngredientBoard({
  activeIngredientIds,
  ingredients,
}: {
  activeIngredientIds: Set<string>;
  ingredients: CookingModeIngredient[];
}) {
  if (ingredients.length === 0) {
    return (
      <p className="web-cook-prototype-empty">등록된 재료가 없어요.</p>
    );
  }

  return (
    <ul className="web-cook-prototype-ingredients" data-testid="ingredient-list">
      {ingredients.map((ingredient, idx) => {
        const sectionLabel = normalizeRecipeSectionLabel(
          ingredient.component_label,
        );
        const previousLabel =
          idx > 0 ? ingredients[idx - 1]?.component_label : null;
        const showSectionHeading = shouldShowSectionHeading(
          sectionLabel,
          previousLabel,
        );
        const isActive = activeIngredientIds.has(ingredient.ingredient_id);

        return (
          <React.Fragment key={`${ingredient.ingredient_id}-${idx}`}>
            {showSectionHeading ? (
              <li className="web-cook-prototype-section-label">
                {sectionLabel}
              </li>
            ) : null}
            <li data-testid="ingredient-item">
              <div
                className={cn(
                  "web-cook-prototype-ingredient",
                  isActive && "web-cook-prototype-ingredient-active",
                )}
                data-active={isActive ? "true" : "false"}
                data-testid={`cook-mode-ingredient-${ingredient.ingredient_id}`}
              >
                <b>{ingredient.standard_name}</b>
                <span>{formatIngredientAmountOnly(ingredient) || "-"}</span>
              </div>
            </li>
          </React.Fragment>
        );
      })}
    </ul>
  );
}

function CurrentAmountBoard({
  usages,
}: {
  usages: CookModeIngredientUsage[];
}) {
  return (
    <section
      aria-label="이번 단계 재료량"
      className="web-cook-prototype-amount-board"
      data-testid="cook-mode-current-amount-board"
    >
      <div className="web-cook-prototype-amount-head">
        <span>이번에 쓸 양</span>
        <span>{usages.length}개</span>
      </div>
      <div className="web-cook-prototype-amounts">
        {usages.map((usage) => (
          <div
            className="web-cook-prototype-amount"
            key={usage.ingredient.ingredient_id}
          >
            <b>{usage.ingredient.standard_name}</b>
            <strong>{usage.amountLabel || "-"}</strong>
            {usage.note ? <small>{usage.note}</small> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function getTimelineTitle(step: CookingModeRecipe["steps"][number]) {
  const sectionLabel = normalizeRecipeSectionLabel(step.component_label);

  return sectionLabel || step.cooking_method.label || `${step.step_number}단계`;
}
