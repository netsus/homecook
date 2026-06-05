"use client";

import Link from "next/link";
import React from "react";

import type { CookingModeRecipe, CookingModeStep } from "@/types/cooking";
import { getCookingMethodColor } from "@/lib/cooking-method-colors";
import {
  normalizeRecipeSectionLabel,
  shouldShowSectionHeading,
  stripMatchingSectionPrefix,
} from "@/lib/recipe-section-labels";
import { WebButton, WebShell, WebTopNav } from "@/components/web";

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
  onCancel: () => void;
  onComplete: () => void;
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
  onCancel,
  onComplete,
}: CookModeDesktopViewProps) {
  const cancelLabel = "취소";
  const breadcrumb =
    variant === "planner"
      ? { current: "플래너 요리모드", href: "/planner", parent: "플래너" }
      : { current: "독립 요리모드", href: `/recipe/${recipe.id}`, parent: "레시피" };
  const heroClassName =
    variant === "planner"
      ? "web-cook-mode-hero web-cook-mode-hero-planner"
      : "web-cook-mode-hero web-cook-mode-hero-standalone";

  return (
    <WebShell className="web-cooking-shell" wide>
      <WebTopNav
        activeId={variant === "planner" ? "planner" : undefined}
        items={WEB_NAV_ITEMS}
        rightSlot={
          <div className="web-profile-button">
            {variant === "planner" ? "JY" : "◎"}
          </div>
        }
      />

      <main className="web-cook-mode-screen" data-testid={screenTestId}>
        <nav aria-label="현재 위치" className="web-cook-breadcrumb">
          <Link href={breadcrumb.href}>{breadcrumb.parent}</Link>
          <span aria-hidden="true">/</span>
          <strong>{breadcrumb.current}</strong>
        </nav>

        <section className={heroClassName}>
          <h1 className="web-cook-mode-page-title">요리모드</h1>
          <div className="web-cook-mode-hero-meta">
            {mealContextLabel ? <span>{mealContextLabel}</span> : null}
            <span>
              {variant === "planner" ? "플래너 요리" : "독립 요리"} ·{" "}
              <span data-testid={servingsTestId}>{recipe.cooking_servings}인분</span>
            </span>
          </div>
          <h2 data-testid={titleTestId}>{recipe.title}</h2>
          <p className="web-cook-mode-summary">
            만들기 {recipe.steps.length}개 · 필요한 재료 {recipe.ingredients.length}개
          </p>
          {variant === "standalone" ? (
            <p className="web-cook-standalone-notice">
              이 요리는 플래너 끼니와 연결되지 않아요. 팬트리 재료 소진만 진행합니다.
            </p>
          ) : null}
        </section>

        <div className="web-cook-mode-layout" data-testid={contentTestId}>
          <aside className="web-cook-checklist-panel" data-testid="cook-mode-action-rail">
            <h2 id={`${screenTestId}-ingredients-heading`}>필요한 재료</h2>
            <IngredientSummary recipe={recipe} />
            <WebButton
              data-testid={completeButtonTestId}
              disabled={controlsDisabled}
              fullWidth
              onClick={onComplete}
            >
              요리 완료
            </WebButton>
            <WebButton
              data-testid={cancelButtonTestId}
              disabled={controlsDisabled}
              fullWidth
              onClick={onCancel}
              variant="ghost"
            >
              {cancelLabel}
            </WebButton>
          </aside>

          <section
            aria-labelledby={`${screenTestId}-steps-heading`}
            className="web-cook-step-panel"
          >
            <h2 id={`${screenTestId}-steps-heading`}>만들기</h2>
            <StepList steps={recipe.steps} />
          </section>
        </div>
      </main>
    </WebShell>
  );
}

function IngredientSummary({
  recipe,
}: {
  recipe: CookingModeRecipe;
}) {
  if (recipe.ingredients.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted)]">
        등록된 재료가 없어요.
      </p>
    );
  }

  return (
    <ul
      className="web-cook-checklist"
      data-testid="ingredient-list"
    >
      {recipe.ingredients.map((ingredient, idx) => {
        const sectionLabel = normalizeRecipeSectionLabel(
          ingredient.component_label,
        );
        const previousLabel =
          idx > 0 ? recipe.ingredients[idx - 1]?.component_label : null;
        const showSectionHeading = shouldShowSectionHeading(
          sectionLabel,
          previousLabel,
        );

        return (
          <React.Fragment key={`${ingredient.ingredient_id}-${idx}`}>
            {showSectionHeading ? (
              <li className="px-1 pt-2 text-[13px] font-bold text-[var(--brand)] first:pt-0">
                {sectionLabel}
              </li>
            ) : null}
            <li data-testid="ingredient-item">
              <div className="web-cook-checklist-item">
                <span className="web-cook-check-name">
                  {ingredient.standard_name}
                </span>
                <span className="web-cook-check-amount">
                  {formatIngredientAmountOnly(ingredient)}
                </span>
              </div>
            </li>
          </React.Fragment>
        );
      })}
    </ul>
  );
}

function StepList({ steps }: { steps: CookingModeStep[] }) {
  if (steps.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--muted)]">
        등록된 만들기가 없어요.
      </p>
    );
  }

  return (
    <ol className="web-cook-step-list" data-testid="step-list">
      {steps.map((step, idx) => {
        const methodColor = getCookingMethodColor(step.cooking_method.color_key);
        const heat = formatHeatLevel(step.heat_level);
        const sectionLabel = normalizeRecipeSectionLabel(step.component_label);
        const previousLabel = idx > 0 ? steps[idx - 1]?.component_label : null;
        const showSectionHeading = shouldShowSectionHeading(
          sectionLabel,
          previousLabel,
        );

        return (
          <React.Fragment key={step.step_number}>
            {showSectionHeading ? (
              <li className="list-none px-1 pt-2 text-[13px] font-bold text-[var(--brand)] first:pt-0">
                {sectionLabel}
              </li>
            ) : null}
            <li
              className="web-cook-step-item"
              data-testid="step-item"
              style={{ borderLeft: `4px solid ${methodColor}` }}
            >
              <div className="web-cook-step-copy">
                <div className="web-cook-step-meta">
                  {step.cooking_method.label ? (
                    <span
                      className="web-cook-method-pill"
                      style={{ backgroundColor: methodColor }}
                    >
                      {step.cooking_method.label}
                    </span>
                  ) : null}
                  {heat ? <span className="web-cook-heat-pill">{heat}</span> : null}
                </div>
                <p>
                  {stripMatchingSectionPrefix(
                    step.instruction,
                    step.component_label,
                  ) ?? step.instruction}
                </p>
              </div>
              <span className="web-cook-step-number">단계 {step.step_number}</span>
            </li>
          </React.Fragment>
        );
      })}
    </ol>
  );
}

function formatIngredientAmountOnly(
  ingredient: CookingModeRecipe["ingredients"][number],
) {
  if (ingredient.ingredient_type === "TO_TASTE") {
    return "적당량";
  }

  if (ingredient.display_text) {
    const normalized =
      stripMatchingSectionPrefix(
        ingredient.display_text,
        ingredient.component_label,
      ) ?? ingredient.display_text;
    const withoutName = normalized.replace(ingredient.standard_name, "").trim();

    return withoutName || normalized;
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
