"use client";

import React from "react";

import type {
  CookingModeIngredient,
  CookingModeRecipe,
  CookingModeStep,
} from "@/types/cooking";
import {
  normalizeRecipeSectionLabel,
  shouldShowSectionHeading,
  stripMatchingSectionPrefix,
} from "@/lib/recipe-section-labels";

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
  onCancel: () => void;
  onComplete: () => void;
}

interface MethodVisual {
  bg: string;
  border: string;
  label: string;
  text: string;
}

const METHOD_VISUALS = {
  blanch: {
    bg: "var(--accent-green-soft)",
    border: "var(--cook-blanch-border)",
    label: "데치기",
    text: "var(--cook-blanch-text)",
  },
  boil: { bg: "var(--danger-soft)", border: "var(--danger)", label: "끓이기", text: "var(--danger-strong)" },
  fry: { bg: "var(--warning-soft)", border: "var(--warning-border)", label: "튀기기", text: "var(--warning-strong)" },
  mix: { bg: "var(--success-soft)", border: "var(--success-border)", label: "무치기", text: "var(--success-strong)" },
  prep: { bg: "var(--surface-subtle)", border: "var(--text-4)", label: "준비", text: "var(--text-2)" },
  roast: { bg: "var(--cook-roast-bg)", border: "var(--cook-roast-border)", label: "굽기", text: "var(--cook-roast-text)" },
  steam: { bg: "var(--cook-steam-bg)", border: "var(--cook-steam-border)", label: "찌기", text: "var(--cook-steam-text)" },
  stirfry: { bg: "var(--warning-soft)", border: "var(--warning-border)", label: "볶기", text: "var(--warning-strong)" },
} as const satisfies Record<string, MethodVisual>;

const METHOD_ALIASES: Record<string, keyof typeof METHOD_VISUALS> = {
  bake: "fry",
  blanch: "blanch",
  blue: "steam",
  lime: "blanch",
  boil: "boil",
  brown: "roast",
  deep_fry: "fry",
  fry: "fry",
  gray: "prep",
  green: "mix",
  grill: "roast",
  mix: "mix",
  orange: "stirfry",
  other: "prep",
  prep: "prep",
  raw: "mix",
  red: "boil",
  roast: "roast",
  steam: "steam",
  stir_fry: "stirfry",
  stirfry: "stirfry",
  unassigned: "prep",
  yellow: "fry",
};

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
  onCancel,
  onComplete,
}: MobileCookModeViewProps) {
  const contextLabel =
    variant === "standalone" ? "독립 요리" : mealContextLabel ?? "플래너 요리";
  return (
    <div
      className="relative min-h-dvh overflow-hidden bg-[var(--foreground)] text-[var(--text-inverse)]"
      data-testid={screenTestId}
    >
      <div className="flex min-h-dvh flex-col pb-[118px]">
        <header className="flex items-center justify-between px-4 pb-[14px] pt-[52px]">
          <button
            aria-label="뒤로"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-alpha-10)] text-[var(--text-inverse)]"
            onClick={onCancel}
            type="button"
          >
            <ChevronLeftIcon />
          </button>
          <div className="min-w-0 flex-1 px-3 text-center">
            <p className="mb-0.5 text-[11px] font-medium leading-[1.3] text-[var(--text-inverse-65)]">
              요리모드
            </p>
            <h1
              className="truncate text-[17px] font-bold leading-[1.12] text-[var(--text-inverse-95)]"
              data-testid={titleTestId}
            >
              {recipe.title}
            </h1>
            <p
              className="text-[13px] font-medium leading-[1.2] text-[var(--text-inverse)]"
              data-testid={servingsTestId}
            >
              {contextLabel} · {recipe.cooking_servings}인분
            </p>
          </div>
          <div aria-hidden="true" className="h-9 w-9" />
        </header>

        <main
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-4"
          data-testid={contentTestId}
        >
          <MobileIngredientSummary ingredients={recipe.ingredients} />
          <MobileStepList recipeTitle={recipe.title} steps={recipe.steps} />
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[430px] bg-[linear-gradient(180deg,transparent,var(--overlay-50))] px-4 pb-[calc(18px+env(safe-area-inset-bottom))] pt-3">
        <div className="flex items-center gap-2">
          <button
            className="flex h-14 shrink-0 items-center justify-center rounded-[var(--radius-card)] border border-[var(--surface-alpha-10)] bg-[var(--surface-alpha-08)] px-4 text-[14px] font-medium text-[var(--text-inverse-82)] disabled:opacity-60"
            data-testid={cancelButtonTestId}
            disabled={controlsDisabled}
            onClick={onCancel}
            type="button"
          >
            나가기
          </button>
          <button
            className="flex h-14 min-w-0 flex-1 items-center justify-center rounded-[var(--radius-card)] border-0 bg-[var(--brand)] px-4 text-[16px] font-bold leading-none text-[var(--text-inverse)] disabled:opacity-60"
            data-testid={completeButtonTestId}
            disabled={controlsDisabled}
            onClick={onComplete}
            type="button"
          >
            요리 완료
          </button>
        </div>
      </div>
    </div>
  );
}

function MobileStepList({
  recipeTitle,
  steps,
}: {
  recipeTitle: string;
  steps: CookingModeStep[];
}) {
  if (steps.length === 0) {
    return (
      <p className="py-8 text-center text-sm font-medium text-[var(--text-inverse-70)]">
        등록된 만들기가 없어요.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3" data-testid="step-list">
      {steps.map((step, idx) => {
        const method = getMethodVisual(step);
        const title = getMobileStepTitle(recipeTitle, step);
        const sectionLabel = normalizeRecipeSectionLabel(step.component_label);
        const previousLabel = idx > 0 ? steps[idx - 1]?.component_label : null;
        const showSectionHeading = shouldShowSectionHeading(
          sectionLabel,
          previousLabel,
        );

        return (
          <React.Fragment key={step.step_number}>
            {showSectionHeading ? (
              <li className="list-none px-1 pt-1 text-[13px] font-bold leading-[1.3] text-[var(--text-inverse-78)]">
                {sectionLabel}
              </li>
            ) : null}
            <li
              className="rounded-[var(--radius-panel)] border border-[var(--surface-alpha-18)] bg-[var(--surface)] p-5 text-[var(--foreground)] shadow-[0_10px_28px_var(--foreground-alpha-16)]"
              data-testid="step-item"
              style={{
                borderTop: `4px solid ${method.border}`,
              }}
            >
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[15px] font-extrabold leading-none text-[var(--text-inverse)]"
                  style={{ background: method.border }}
                >
                  {step.step_number}
                </span>
                <span
                  className="rounded-full px-2.5 py-[5px] text-[12px] font-extrabold leading-none"
                  style={{ background: method.bg, color: method.text }}
                >
                  {method.label}
                </span>
              </div>
              {title ? (
                <h2
                  className="sr-only"
                  style={{ color: method.text }}
                >
                  {title}
                </h2>
              ) : null}
              <p className="text-[17px] font-semibold leading-[1.65] text-[var(--foreground)]">
                {stripMatchingSectionPrefix(
                  step.instruction,
                  step.component_label,
                ) ?? step.instruction}
              </p>
            </li>
          </React.Fragment>
        );
      })}
    </ol>
  );
}

function MobileIngredientSummary({
  ingredients,
}: {
  ingredients: CookingModeIngredient[];
}) {
  if (ingredients.length === 0) {
    return null;
  }

  return (
    <section
      aria-labelledby="mobile-ingredients-heading"
      className="mb-3 rounded-[var(--radius-card)] bg-[var(--surface-alpha-08)] px-3 py-3"
      data-testid="mobile-ingredient-summary"
    >
      <h2
        className="mb-2 text-[12px] font-semibold leading-[1.2] text-[var(--text-inverse-68)]"
        id="mobile-ingredients-heading"
      >
        재료
      </h2>
      <ul
        className="flex flex-wrap gap-x-2 gap-y-1.5"
        data-testid="ingredient-list"
      >
        {ingredients.map((ingredient, idx) => {
          const amountLabel = formatIngredientAmount(ingredient);
          const displayText = ingredient.display_text
            ? stripMatchingSectionPrefix(
                ingredient.display_text,
                ingredient.component_label,
              )
            : null;
          const usesDisplayText =
            typeof displayText === "string" &&
            displayText.includes(ingredient.standard_name);
          const sectionLabel = normalizeRecipeSectionLabel(
            ingredient.component_label,
          );
          const previousLabel =
            idx > 0 ? ingredients[idx - 1]?.component_label : null;
          const showSectionHeading = shouldShowSectionHeading(
            sectionLabel,
            previousLabel,
          );

          return (
            <React.Fragment key={`${ingredient.ingredient_id}-${idx}`}>
              {showSectionHeading ? (
                <li className="basis-full pt-1 text-[12px] font-bold leading-[1.3] text-[var(--text-inverse-72)]">
                  {sectionLabel}
                </li>
              ) : null}
              <li
                className="inline-flex min-h-7 items-center gap-1.5 rounded-full bg-[var(--surface-alpha-11)] px-2.5 py-1 text-[13px] font-medium leading-[1.25] text-[var(--text-inverse-88)]"
                data-testid="ingredient-item"
              >
                <span>
                  {usesDisplayText ? displayText : ingredient.standard_name}
                </span>
                {!usesDisplayText && amountLabel ? (
                  <span className="text-[var(--text-inverse-70)]">{amountLabel}</span>
                ) : null}
              </li>
            </React.Fragment>
          );
        })}
      </ul>
    </section>
  );
}

function getMethodVisual(step: CookingModeStep): MethodVisual {
  const key =
    step.cooking_method.color_key ||
    step.cooking_method.code ||
    step.cooking_method.label;
  const normalized = key?.toLowerCase().replace(/\s+/g, "_") ?? "prep";
  const methodKey = METHOD_ALIASES[normalized] ?? "prep";
  const visual = METHOD_VISUALS[methodKey];

  return {
    ...visual,
    label: step.cooking_method.label || visual.label,
  };
}

function getMobileStepTitle(recipeTitle: string, step: CookingModeStep) {
  const plannerTitles = ["재료 손질", "버무리기"];
  const standaloneTitles = [
    "양념장 만들기",
    "고기 재우기",
    "센불 볶기",
    "채소 넣기",
  ];

  if (recipeTitle.includes("닭가슴살")) {
    return plannerTitles[step.step_number - 1] ?? `${step.step_number}단계`;
  }

  if (recipeTitle.includes("제육")) {
    return standaloneTitles[step.step_number - 1] ?? `${step.step_number}단계`;
  }

  return `${step.step_number}단계`;
}

function formatIngredientAmount(ingredient: CookingModeIngredient) {
  if (ingredient.display_text) {
    return (
      stripMatchingSectionPrefix(
        ingredient.display_text,
        ingredient.component_label,
      ) ?? ingredient.display_text
    );
  }

  if (ingredient.ingredient_type === "TO_TASTE") {
    return "적당량";
  }

  if (ingredient.amount === null) {
    return "";
  }

  return `${ingredient.amount}${ingredient.unit ?? ""}`;
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
