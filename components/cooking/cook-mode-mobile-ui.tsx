"use client";

import React from "react";

import {
  CookModeThemeToggle,
  type CookModeColorTheme,
} from "@/components/cooking/cook-mode-theme-toggle";
import {
  buildCookModeStepModel,
  type CookModeIngredientUsage,
} from "@/components/cooking/cook-mode-step-model";
import { cn } from "@/components/web/utils";
import { getCookingMethodVisual } from "@/lib/cooking-method-colors";
import type { CookingModeRecipe } from "@/types/cooking";

export { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";

type MobileCookModeVariant = "planner" | "standalone";

interface MobileCookModeViewProps {
  recipe: CookingModeRecipe;
  variant: MobileCookModeVariant;
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

export function MobileCookModeView({
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
}: MobileCookModeViewProps) {
  const [currentStepIndex, setCurrentStepIndex] = React.useState(0);
  const contextLabel =
    variant === "standalone" ? "독립 요리" : mealContextLabel ?? "플래너 요리";
  const steps = recipe.steps;
  const totalSteps = steps.length;
  const currentStep = steps[currentStepIndex] ?? null;
  const stepModel = currentStep
    ? buildCookModeStepModel(recipe, currentStep)
    : null;
  const methodVisual = getCookingMethodVisual(currentStep?.cooking_method);

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
    <div
      className="cook-mobile-prototype relative min-h-dvh overflow-hidden transition-colors duration-150"
      data-cook-theme={colorTheme}
      data-testid={screenTestId}
    >
      <div
        aria-hidden="true"
        className="cook-mobile-prototype-backdrop pointer-events-none absolute inset-x-0 top-0 h-[260px]"
      />

      <div className="relative flex min-h-dvh flex-col pb-[116px]">
        <header className="px-4 pb-[14px] pt-[calc(22px+env(safe-area-inset-top))]">
          <div className="mb-[18px] flex items-center justify-between gap-2">
            <button
              aria-label="취소"
              className="cook-mobile-icon-button inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border-0"
              data-testid={cancelButtonTestId}
              disabled={controlsDisabled}
              onClick={onCancel}
              type="button"
            >
              <ChevronLeftIcon />
            </button>
            <div className="ml-auto flex items-center gap-2">
              <span className="cook-mobile-status inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-[12px] font-extrabold leading-none">
                <span className="cook-mobile-status-dot h-2 w-2 rounded-full" />
                화면 켜짐
              </span>
              <CookModeThemeToggle
                onToggle={onColorThemeToggle}
                theme={colorTheme}
                variant="mobile"
              />
            </div>
          </div>

          <h1
            className="cook-mobile-hero-title line-clamp-1 max-w-full text-[21px] font-extrabold leading-[1.08]"
            data-testid={titleTestId}
            title={recipe.title}
          >
            {recipe.title}
          </h1>
          <p
            className="cook-mobile-hero-subtitle mt-2 text-[14px] font-extrabold leading-[1.25]"
            data-testid={servingsTestId}
          >
            요리모드 · {recipe.cooking_servings}인분 · {contextLabel}
          </p>
        </header>

        <main
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-4"
          data-testid={contentTestId}
        >
          {currentStep && stepModel ? (
            <>
              <CurrentStepStage
                currentStepIndex={currentStepIndex}
                methodColor={methodVisual.color}
                methodLabel={methodVisual.label}
                model={stepModel}
              />
              {stepModel.ingredientUsages.length > 0 ? (
                <MobileAmountBoard usages={stepModel.ingredientUsages} />
              ) : null}
              <nav aria-label="단계 이동" data-testid="step-list">
                <div
                  className="mt-3 grid gap-2"
                  data-testid="cook-mode-step-rail"
                  style={{
                    gridTemplateColumns: `repeat(${Math.max(totalSteps, 1)}, minmax(0, 1fr))`,
                  }}
                >
                  {steps.map((step, index) => {
                    const isActive = index === currentStepIndex;

                    return (
                      <button
                        aria-current={isActive ? "step" : undefined}
                        aria-label={`${step.step_number}단계`}
                        className={cn(
                          "min-h-[38px] rounded-[13px] border text-[13px] font-extrabold leading-none transition-colors",
                          isActive
                            ? "cook-mobile-step-dot-active border-transparent"
                            : "cook-mobile-step-dot-idle",
                        )}
                        data-testid={`cook-mode-step-dot-${step.step_number}`}
                        key={step.step_number}
                        onClick={() => selectStep(index)}
                        type="button"
                      >
                        {step.step_number}
                      </button>
                    );
                  })}
                </div>
              </nav>
            </>
          ) : (
            <p
              className="cook-mobile-empty rounded-[22px] border p-8 text-center text-sm font-bold"
            >
              등록된 만들기가 없어요.
            </p>
          )}
        </main>
      </div>

      <div className="cook-mobile-bottom-bar fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[430px] px-4 pb-[calc(18px+env(safe-area-inset-bottom))] pt-4">
        <div className="grid grid-cols-[52px_minmax(0,1fr)_76px] gap-2.5">
          <button
            aria-label="이전 단계"
            className="cook-mobile-bottom-arrow min-h-14 rounded-2xl border-0 text-[22px] font-extrabold disabled:opacity-40"
            data-testid="cook-mode-prev-step"
            disabled={controlsDisabled || currentStepIndex <= 0}
            onClick={() => moveStep(-1)}
            type="button"
          >
            ‹
          </button>
          <button
            className="cook-mobile-next-button min-h-14 rounded-2xl border-0 px-4 text-[17px] font-extrabold leading-none disabled:opacity-60"
            data-testid="cook-mode-next-step"
            disabled={
              controlsDisabled ||
              totalSteps === 0 ||
              currentStepIndex >= totalSteps - 1
            }
            onClick={() => moveStep(1)}
            type="button"
          >
            {currentStepIndex >= totalSteps - 1 ? "마지막 단계" : "다음 단계"}
          </button>
          <button
            className="cook-mobile-complete-button min-h-14 rounded-2xl border-0 px-3 text-[14px] font-extrabold leading-none disabled:opacity-60"
            data-testid={completeButtonTestId}
            disabled={controlsDisabled}
            onClick={onComplete}
            type="button"
          >
            완료
          </button>
        </div>
      </div>
    </div>
  );
}

function CurrentStepStage({
  currentStepIndex,
  methodColor,
  methodLabel,
  model,
}: {
  currentStepIndex: number;
  methodColor: string;
  methodLabel: string;
  model: ReturnType<typeof buildCookModeStepModel>;
}) {
  return (
    <section
      aria-label="현재 조리 단계"
      className="cook-mobile-current-step min-h-[298px] rounded-[24px] border p-5"
      data-testid="cook-mode-current-step"
      style={{ borderTopColor: methodColor, borderTopWidth: 4 }}
    >
      <div className="mb-[18px] flex items-center justify-between gap-3">
        <span
          className="cook-mobile-muted-text inline-flex items-center gap-2 text-[13px] font-extrabold"
        >
          <strong
            className="cook-mobile-counter inline-flex h-[30px] min-w-[38px] items-center justify-center rounded-full px-3 text-[14px]"
            data-testid="cook-mode-counter"
          >
            {currentStepIndex + 1}
          </strong>
        </span>
        <span
          className="cook-mobile-method-pill rounded-full px-3 py-2 text-[13px] font-extrabold leading-none"
          style={{ backgroundColor: methodColor }}
        >
          {methodLabel}
        </span>
      </div>

      <h2
        className="cook-mobile-primary-text mb-4 text-[21px] font-extrabold leading-[1.18]"
        data-testid="cook-mode-current-step-title"
      >
        {model.title}
      </h2>
      <p
        className="cook-mobile-primary-text min-h-[116px] text-[28px] font-extrabold leading-[1.32] [word-break:keep-all]"
        data-testid="cook-mode-current-step-copy"
      >
        {model.instruction}
      </p>
      <div className="mt-[18px] flex flex-wrap gap-2">
        <span
          className="cook-mobile-meta-pill rounded-xl px-3 py-2 text-[13px] font-extrabold"
        >
          {model.heatLabel}
        </span>
        <span
          className="cook-mobile-meta-pill rounded-xl px-3 py-2 text-[13px] font-extrabold"
        >
          {model.durationLabel}
        </span>
      </div>
    </section>
  );
}

function MobileAmountBoard({ usages }: { usages: CookModeIngredientUsage[] }) {
  return (
    <section
      aria-label="이번 단계 재료량"
      className="cook-mobile-amount-board mt-3 rounded-[22px] p-[15px]"
      data-testid="cook-mode-current-amount-board"
    >
      <div className="cook-mobile-amount-head mb-2.5 flex items-center justify-between text-[13px] font-extrabold">
        <span>이번에 쓸 양</span>
        <span>{usages.length}개</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {usages.map((usage) => (
          <div
            className="cook-mobile-amount-card min-h-[94px] rounded-[18px] p-3"
            key={usage.ingredient.ingredient_id}
          >
            <b
              className="cook-mobile-amount-name mb-2 block text-[14px] font-bold"
            >
              {usage.ingredient.standard_name}
            </b>
            <strong className="cook-mobile-amount-value block text-[27px] font-extrabold leading-none">
              {usage.amountLabel || "-"}
            </strong>
            {usage.note ? (
              <small
                className="cook-mobile-amount-note mt-1.5 block text-[12px] font-extrabold"
              >
                {usage.note}
              </small>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="22"
      viewBox="0 0 24 24"
      width="22"
    >
      <path
        d="M15 18 9 12l6-6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </svg>
  );
}
