"use client";

import React from "react";

import type { CookingModeRecipe, CookingModeStep } from "@/types/cooking";
import { getCookingMethodColor } from "@/lib/cooking-method-colors";

interface CookModeDesktopViewProps {
  recipe: CookingModeRecipe;
  variant: "planner" | "standalone";
  screenTestId: string;
  contentTestId: string;
  titleTestId: string;
  servingsTestId: string;
  cancelButtonTestId: string;
  completeButtonTestId: string;
  controlsDisabled: boolean;
  onCancel: () => void;
  onComplete: () => void;
}

export function CookModeDesktopView({
  recipe,
  variant,
  screenTestId,
  contentTestId,
  titleTestId,
  servingsTestId,
  cancelButtonTestId,
  completeButtonTestId,
  controlsDisabled,
  onCancel,
  onComplete,
}: CookModeDesktopViewProps) {
  const eyebrow =
    variant === "planner" ? "플래너 요리 모드" : "독립 요리 모드";
  const cancelLabel = variant === "planner" ? "요리 취소" : "레시피로 돌아가기";

  return (
    <div
      className="min-h-dvh bg-[var(--background)]"
      data-testid={screenTestId}
    >
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <main
          className="min-w-0 space-y-6"
          data-testid={contentTestId}
        >
          <section className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow-1)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--brand)]">
              {eyebrow}
            </p>
            <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <h1
                  className="truncate text-3xl font-bold tracking-[-0.3px] text-[var(--foreground)]"
                  data-testid={titleTestId}
                >
                  {recipe.title}
                </h1>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  재료와 조리 순서를 한 화면에서 확인하고, 완료 시 소진한 재료만 팬트리에 반영해요.
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <span
                  className="rounded-full bg-[var(--brand-soft)] px-3 py-1.5 text-sm font-bold text-[var(--brand-deep)]"
                  data-testid={servingsTestId}
                >
                  {recipe.cooking_servings}인분
                </span>
                <span className="rounded-full bg-[var(--surface-fill)] px-3 py-1.5 text-sm font-semibold text-[var(--text-2)]">
                  {recipe.steps.length}단계
                </span>
              </div>
            </div>
          </section>

          <section
            aria-labelledby={`${screenTestId}-steps-heading`}
            className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-1)]"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[var(--brand)]">
                  Cooking Steps
                </p>
                <h2
                  className="mt-1 text-xl font-bold tracking-[-0.3px] text-[var(--foreground)]"
                  id={`${screenTestId}-steps-heading`}
                >
                  조리 과정
                </h2>
              </div>
              <span className="text-sm font-semibold text-[var(--muted)]">
                순서대로 진행
              </span>
            </div>
            <StepList steps={recipe.steps} />
          </section>

          <section
            aria-labelledby={`${screenTestId}-ingredients-heading`}
            className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-1)]"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[var(--brand)]">
                  Ingredients
                </p>
                <h2
                  className="mt-1 text-xl font-bold tracking-[-0.3px] text-[var(--foreground)]"
                  id={`${screenTestId}-ingredients-heading`}
                >
                  재료
                </h2>
              </div>
              <span className="text-sm font-semibold text-[var(--muted)]">
                {recipe.ingredients.length}개
              </span>
            </div>
            <IngredientList recipe={recipe} />
          </section>
        </main>

        <aside className="lg:sticky lg:top-6 lg:self-start" data-testid="cook-mode-action-rail">
          <div className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-1)]">
            <p className="text-sm font-bold text-[var(--foreground)]">
              요리 진행
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-[var(--radius-md)] bg-[var(--surface-fill)] px-3 py-3">
                <p className="text-xs font-semibold text-[var(--muted)]">재료</p>
                <p className="mt-1 text-lg font-bold text-[var(--foreground)]">
                  {recipe.ingredients.length}개
                </p>
              </div>
              <div className="rounded-[var(--radius-md)] bg-[var(--surface-fill)] px-3 py-3">
                <p className="text-xs font-semibold text-[var(--muted)]">단계</p>
                <p className="mt-1 text-lg font-bold text-[var(--foreground)]">
                  {recipe.steps.length}단계
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
              요리 모드에서는 인분을 조절하지 않습니다. 인분 변경은 플래너나 레시피 진입 전 단계에서 처리해요.
            </p>
            <div className="mt-5 space-y-2">
              <button
                className="flex min-h-12 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--brand)] px-4 text-sm font-bold text-white disabled:opacity-60"
                data-testid={completeButtonTestId}
                disabled={controlsDisabled}
                onClick={onComplete}
                type="button"
              >
                요리 완료
              </button>
              <button
                className="flex min-h-12 w-full items-center justify-center rounded-[var(--radius-md)] border border-[var(--line)] bg-transparent px-4 text-sm font-semibold text-[var(--foreground)] disabled:opacity-60"
                data-testid={cancelButtonTestId}
                disabled={controlsDisabled}
                onClick={onCancel}
                type="button"
              >
                {cancelLabel}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function IngredientList({ recipe }: { recipe: CookingModeRecipe }) {
  if (recipe.ingredients.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted)]">
        등록된 재료가 없어요.
      </p>
    );
  }

  return (
    <ul
      className="grid gap-2 lg:grid-cols-2"
      data-testid="ingredient-list"
    >
      {recipe.ingredients.map((ingredient) => (
        <li
          className="flex min-h-[64px] items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-fill)] px-4 py-3"
          data-testid="ingredient-item"
          key={ingredient.ingredient_id}
        >
          <span className="min-w-0 break-keep text-sm font-semibold text-[var(--foreground)]">
            {ingredient.standard_name}
          </span>
          <span className="shrink-0 text-right text-sm text-[var(--muted)]">
            {formatIngredientAmount(ingredient)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function StepList({ steps }: { steps: CookingModeStep[] }) {
  if (steps.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted)]">
        등록된 조리 과정이 없어요.
      </p>
    );
  }

  return (
    <ol className="space-y-3" data-testid="step-list">
      {steps.map((step) => {
        const methodColor = getCookingMethodColor(step.cooking_method.color_key);
        const heat = formatHeatLevel(step.heat_level);

        return (
          <li
            className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-fill)]"
            data-testid="step-item"
            key={step.step_number}
            style={{ borderLeft: `4px solid ${methodColor}` }}
          >
            <div className="px-4 py-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-[var(--muted)]">
                  {step.step_number}단계
                </span>
                {step.cooking_method.label ? (
                  <span
                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold text-white"
                    style={{ backgroundColor: methodColor }}
                  >
                    {step.cooking_method.label}
                  </span>
                ) : null}
                {heat ? (
                  <span className="rounded-full bg-[var(--surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--muted)]">
                    {heat}
                  </span>
                ) : null}
              </div>
              <p className="text-base leading-7 text-[var(--foreground)]">
                {step.instruction}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function formatIngredientAmount(
  ingredient: CookingModeRecipe["ingredients"][number],
) {
  if (ingredient.display_text) {
    return ingredient.display_text;
  }

  if (ingredient.ingredient_type === "TO_TASTE") {
    return "적당량";
  }

  if (ingredient.amount === null) {
    return "";
  }

  return `${ingredient.amount}${ingredient.unit ?? ""}`;
}

function formatHeatLevel(heat: string | null): string | null {
  if (!heat) return null;
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
