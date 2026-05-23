"use client";

import Link from "next/link";
import React from "react";

import type { CookingModeRecipe, CookingModeStep } from "@/types/cooking";
import { getCookingMethodColor } from "@/lib/cooking-method-colors";
import { WebButton, WebShell, WebTopNav } from "@/components/web";

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
  onComplete: (consumedIds: string[]) => void;
}

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "탐색" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

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
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    () => new Set(recipe.ingredients.map((ingredient) => ingredient.ingredient_id)),
  );
  const ingredientIds = React.useMemo(
    () => recipe.ingredients.map((ingredient) => ingredient.ingredient_id),
    [recipe.ingredients],
  );
  const selectedCount = ingredientIds.filter((id) => selectedIds.has(id)).length;
  const cancelLabel = "취소";
  const breadcrumb =
    variant === "planner"
      ? { current: "플래너 요리모드", href: "/cooking/ready", parent: "요리 준비" }
      : { current: "독립 요리모드", href: `/recipe/${recipe.id}`, parent: "레시피" };
  const heroClassName =
    variant === "planner"
      ? "web-cook-mode-hero web-cook-mode-hero-planner"
      : "web-cook-mode-hero web-cook-mode-hero-standalone";

  React.useEffect(() => {
    setSelectedIds(new Set(ingredientIds));
  }, [ingredientIds]);

  const handleToggleIngredient = React.useCallback((ingredientId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(ingredientId)) {
        next.delete(ingredientId);
      } else {
        next.add(ingredientId);
      }

      return next;
    });
  }, []);

  const handleComplete = React.useCallback(() => {
    onComplete(ingredientIds.filter((id) => selectedIds.has(id)));
  }, [ingredientIds, onComplete, selectedIds]);

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
          <div className="web-cook-mode-hero-meta">
            {variant === "planner" ? (
              <span className="web-cook-status-pill web-cook-status-done">
                장보기 완료
              </span>
            ) : null}
            <span>
              {variant === "planner" ? "플래너 끼니" : "독립 요리"} ·{" "}
              <span data-testid={servingsTestId}>{recipe.cooking_servings}인분</span>
            </span>
          </div>
          <h1 data-testid={titleTestId}>{recipe.title}</h1>
          <p className="web-cook-mode-summary">
            조리 단계 {recipe.steps.length}개 · 소진된 재료 {recipe.ingredients.length}개
          </p>
          {variant === "standalone" ? (
            <p className="web-cook-standalone-notice">
              이 요리는 플래너 끼니와 연결되지 않아요. 팬트리 재료 소진만 진행합니다.
            </p>
          ) : null}
        </section>

        <div className="web-cook-mode-layout" data-testid={contentTestId}>
          <section
            aria-labelledby={`${screenTestId}-steps-heading`}
            className="web-cook-step-panel"
          >
            <h2 id={`${screenTestId}-steps-heading`}>조리 단계</h2>
            <StepList steps={recipe.steps} />
          </section>

          <aside className="web-cook-checklist-panel" data-testid="cook-mode-action-rail">
            <h2 id={`${screenTestId}-ingredients-heading`}>소진된 재료</h2>
            <p className="web-cook-checklist-helper">
              체크된 재료는 팬트리에서 자동으로 빠져요.
            </p>
            <IngredientChecklist
              controlsDisabled={controlsDisabled}
              onToggle={handleToggleIngredient}
              recipe={recipe}
              selectedIds={selectedIds}
            />
            <p className="web-cook-checklist-summary">
              {recipe.ingredients.length}개 중 {selectedCount}개 선택
            </p>
            <WebButton
              data-testid={completeButtonTestId}
              disabled={controlsDisabled}
              fullWidth
              onClick={handleComplete}
            >
              ✓ 요리 완료 ({selectedCount}개 소진)
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
        </div>
      </main>
    </WebShell>
  );
}

function IngredientChecklist({
  controlsDisabled,
  onToggle,
  recipe,
  selectedIds,
}: {
  controlsDisabled: boolean;
  onToggle: (ingredientId: string) => void;
  recipe: CookingModeRecipe;
  selectedIds: Set<string>;
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
      {recipe.ingredients.map((ingredient) => {
        const selected = selectedIds.has(ingredient.ingredient_id);

        return (
          <li data-testid="ingredient-item" key={ingredient.ingredient_id}>
            <button
              aria-pressed={selected}
              className={
                selected
                  ? "web-cook-checklist-item web-cook-checklist-item-selected"
                  : "web-cook-checklist-item"
              }
              data-testid={`consumed-check-${ingredient.ingredient_id}`}
              disabled={controlsDisabled}
              onClick={() => onToggle(ingredient.ingredient_id)}
              type="button"
            >
              <span className="web-cook-checkmark" aria-hidden="true">
                {selected ? "✓" : ""}
              </span>
              <span className="web-cook-check-name">
                {ingredient.standard_name}
              </span>
              <span className="web-cook-check-amount">
                {formatIngredientAmount(ingredient)}
              </span>
              <span className="web-cook-check-owned">보유</span>
            </button>
          </li>
        );
      })}
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
    <ol className="web-cook-step-list" data-testid="step-list">
      {steps.map((step) => {
        const methodColor = getCookingMethodColor(step.cooking_method.color_key);
        const heat = formatHeatLevel(step.heat_level);

        return (
          <li
            className="web-cook-step-item"
            data-testid="step-item"
            key={step.step_number}
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
                {heat ? (
                  <span className="web-cook-heat-pill">
                    {heat}
                  </span>
                ) : null}
              </div>
              <p>
                {step.instruction}
              </p>
            </div>
            <span className="web-cook-step-number">단계 {step.step_number}</span>
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
