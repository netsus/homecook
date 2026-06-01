"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useState } from "react";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import {
  AppBackButton,
  AppBackButtonSpacer,
} from "@/components/shared/app-back-button";
import { NumericStepperCompact } from "@/components/shared/numeric-stepper-compact";
import {
  WebButton,
  WebDialog,
  WebDialogBody,
  WebDialogFooter,
  WebDialogHeader,
  WebDialogTitle,
  WebEmptyState,
  WebListRow,
  WebModal,
  WebSkeleton,
} from "@/components/web";
import { fetchPantryMatchRecipes } from "@/lib/api/recipe";
import type { PantryMatchRecipeItem } from "@/types/recipe";

type PantryMatchPresentation = "dialog" | "screen" | "web" | "sheet";

export interface PantryMatchPickerProps {
  selectedRecipe: PantryMatchRecipeItem | null;
  isCreating: boolean;
  onRecipeSelect: (recipe: PantryMatchRecipeItem) => void;
  onServingsConfirm: (servings: number) => void;
  onServingsCancel: () => void;
  onClose: () => void;
  onBack?: () => void;
  presentation?: PantryMatchPresentation;
  slotLabel?: string;
}

type LoadState = "idle" | "loading" | "ready" | "empty" | "error";

// ─── Match Score Badge ───────────────────────────────────────────────────────

interface MatchScoreBadgeProps {
  score: number;
}

function MatchScoreBadge({ score }: MatchScoreBadgeProps) {
  const percentage = Math.round(score * 100);
  const colorClass =
    percentage >= 80
      ? "bg-[var(--success-soft)] text-[var(--success)]"
      : percentage >= 50
        ? "bg-[var(--warning-soft)] text-[var(--warning)]"
        : "bg-[var(--surface-fill)] text-[var(--text-2)]";

  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${colorClass}`}>
      {percentage}% 일치
    </span>
  );
}

function MissingIngredientChips({
  ingredients,
  max = 3,
}: {
  ingredients: PantryMatchRecipeItem["missing_ingredients"];
  max?: number;
}) {
  if (ingredients.length === 0) {
    return null;
  }

  return (
    <span className="flex min-w-0 flex-wrap items-center justify-end gap-1">
      {ingredients.slice(0, max).map((ingredient) => (
        <span
          className="rounded-[var(--radius-badge)] bg-[var(--warning-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--warning-strong)]"
          key={ingredient.id}
        >
          {ingredient.standard_name}
        </span>
      ))}
      {ingredients.length > max ? (
        <span className="rounded-[var(--radius-badge)] bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--text-3)]">
          +{ingredients.length - max}
        </span>
      ) : null}
    </span>
  );
}

function PantryProgress({
  percentage,
  recipeId,
  tone,
  variant,
}: {
  percentage: number;
  recipeId: string;
  tone: "brand" | "warning" | "danger";
  variant: "mobile" | "web";
}) {
  const width = `${Math.max(4, Math.min(100, percentage))}%`;

  if (variant === "web") {
    return (
      <span
        className={`web-picker-progress web-picker-progress-${tone}`}
        data-testid={`pantry-match-progress-${recipeId}`}
      >
        <span
          className={`web-picker-progress-fill web-picker-progress-${tone}`}
          style={{ width }}
        />
        <span className="web-picker-progress-label">{percentage}%</span>
      </span>
    );
  }

  return (
    <span
      className="relative mt-1.5 block h-5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--brand)_14%,var(--surface)_86%)]"
      data-testid={`pantry-match-progress-${recipeId}`}
    >
      <span
        className="block h-full rounded-full bg-[color-mix(in_srgb,var(--brand)_28%,var(--surface)_72%)]"
        style={{ width }}
      />
      <span className="absolute inset-y-0 right-2 flex items-center text-[10px] font-extrabold text-[var(--brand)]">
        {percentage}%
      </span>
    </span>
  );
}

// ─── Pantry Recipe Card ──────────────────────────────────────────────────────

interface PantryRecipeCardProps {
  recipe: PantryMatchRecipeItem;
  onSelect: (recipe: PantryMatchRecipeItem) => void;
  presentation?: PantryMatchPresentation;
}

function PantryRecipeCard({ recipe, onSelect, presentation = "dialog" }: PantryRecipeCardProps) {
  if (presentation === "screen" || presentation === "sheet") {
    const percentage = Math.round(recipe.match_score * 100);

    return (
      <button
        aria-label={`${recipe.title} 선택`}
        className="mb-2 flex w-full gap-3 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-3 text-left active:border-[var(--brand)] active:bg-[var(--brand-soft)]"
        onClick={() => onSelect(recipe)}
        type="button"
      >
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] bg-[var(--brand-soft)] text-[28px]">
          {recipe.thumbnail_url ? (
            <Image
              alt=""
              className="h-full w-full object-cover"
              height={64}
              src={recipe.thumbnail_url}
              unoptimized
              width={64}
            />
          ) : (
            "🍳"
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-bold text-[var(--foreground)]">
            {recipe.title}
          </span>
          <PantryProgress
            percentage={percentage}
            recipeId={recipe.id}
            tone="brand"
            variant="mobile"
          />
          <span
            className="mt-1.5 flex items-center justify-between gap-2 text-[11px] font-bold text-[var(--text-3)]"
            data-testid={`pantry-ingredient-summary-row-${recipe.id}`}
          >
            <span className="shrink-0">
              {recipe.matched_ingredients}/{recipe.total_ingredients}개 보유
            </span>
            <MissingIngredientChips ingredients={recipe.missing_ingredients} />
          </span>
          <span className="mt-2 inline-flex rounded-[var(--radius-badge)] bg-[var(--brand-soft)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--brand)]">
            선택
          </span>
        </span>
      </button>
    );
  }

  if (presentation === "web") {
    const percentage = Math.round(recipe.match_score * 100);
    const scoreTone: "brand" | "warning" | "danger" =
      percentage >= 80 ? "brand" : percentage >= 50 ? "warning" : "danger";

    return (
      <button
        aria-label={`${recipe.title} 선택`}
        className="web-picker-pantry-button"
        onClick={() => onSelect(recipe)}
        type="button"
      >
        <WebListRow interactive className="web-picker-pantry-row">
          <span className="web-picker-pantry-thumb" aria-hidden="true">
            {recipe.thumbnail_url ? (
              <Image
                alt=""
                className="h-full w-full object-cover"
                height={56}
                src={recipe.thumbnail_url}
                unoptimized
                width={56}
              />
            ) : (
              "🍳"
            )}
          </span>
          <span className="web-picker-pantry-copy">
            <span>{recipe.title}</span>
            <small>
              {recipe.matched_ingredients}/{recipe.total_ingredients}개 보유
              <MissingIngredientChips ingredients={recipe.missing_ingredients} max={2} />
            </small>
            <PantryProgress
              percentage={percentage}
              recipeId={recipe.id}
              tone={scoreTone}
              variant="web"
            />
          </span>
        </WebListRow>
      </button>
    );
  }

  return (
    <div className="rounded-[var(--radius-panel)] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_2px_10px_var(--shadow-color-soft)]">
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex-1 line-clamp-2 text-2xl font-bold tracking-[-0.02em] text-[var(--foreground)]">
          {recipe.title}
        </h3>
        <MatchScoreBadge score={recipe.match_score} />
      </div>
      <div className="mt-2 flex items-center gap-3 text-sm text-[var(--muted)]">
        <span>
          {recipe.matched_ingredients}/{recipe.total_ingredients} 재료 보유
        </span>
      </div>
      {recipe.missing_ingredients.length > 0 && (
        <div className="mt-2">
          <p className="text-xs text-[var(--muted)]">부족한 재료:</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {recipe.missing_ingredients.slice(0, 5).map((ingredient) => (
              <span
                key={ingredient.id}
                className="inline-flex rounded-full bg-[var(--danger-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--danger)]"
              >
                {ingredient.standard_name}
              </span>
            ))}
            {recipe.missing_ingredients.length > 5 && (
              <span className="inline-flex items-center px-2 py-0.5 text-xs text-[var(--muted)]">
                +{recipe.missing_ingredients.length - 5}
              </span>
            )}
          </div>
        </div>
      )}
      <button
        className="mt-3 h-[var(--control-height-md)] w-full rounded-[var(--radius-card)] bg-[var(--brand)] text-base font-semibold text-[var(--text-inverse)] hover:bg-[var(--brand-deep)]"
        onClick={() => onSelect(recipe)}
        type="button"
      >
        선택
      </button>
    </div>
  );
}

// ─── Servings Modal ──────────────────────────────────────────────────────────

interface ServingsModalProps {
  recipe: PantryMatchRecipeItem;
  isCreating: boolean;
  onConfirm: (servings: number) => void;
  onCancel: () => void;
  presentation?: PantryMatchPresentation;
  slotLabel?: string;
}

function ServingsModal({
  recipe,
  isCreating,
  onConfirm,
  onCancel,
  presentation = "dialog",
  slotLabel,
}: ServingsModalProps) {
  const [servings, setServings] = useState(2);

  const handleConfirm = useCallback(() => {
    if (servings < 1) return;
    onConfirm(servings);
  }, [servings, onConfirm]);

  if (presentation === "screen" || presentation === "sheet") {
    return (
      <div className="fixed inset-0 z-50 flex items-end bg-[var(--overlay-42)]" onClick={onCancel}>
        <div
          aria-labelledby="servings-modal-title"
          aria-modal="true"
          className="w-full rounded-t-[var(--radius-sheet)] bg-[var(--surface)] px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-2 shadow-[0_8px_24px_var(--shadow-color-strong)]"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
        >
          <div className="flex justify-center pb-4">
            <div className="h-1 w-9 rounded-full bg-[var(--line-strong)]" />
          </div>
          <h2 className="text-[20px] font-bold text-[var(--foreground)]" id="servings-modal-title">
            플래너에 추가
          </h2>
          {slotLabel ? (
            <p className="mt-1 text-[13px] font-bold text-[var(--brand)]">
              대상 · {slotLabel}
            </p>
          ) : null}
          <div className="mt-4 flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-fill)] p-2.5">
            <span className="flex h-[var(--control-height-md)] w-11 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] bg-[var(--brand-soft)] text-[22px]">
              {recipe.thumbnail_url ? (
                <Image
                  alt=""
                  className="h-full w-full object-cover"
                  height={44}
                  src={recipe.thumbnail_url}
                  unoptimized
                  width={44}
                />
              ) : (
                "🍳"
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-extrabold text-[var(--foreground)]">
                {recipe.title}
              </span>
              <span className="mt-0.5 block text-[11px] text-[var(--text-3)]">
                선택 {servings}인분
              </span>
            </span>
          </div>
          <p className="mt-3 text-[13px] font-bold text-[var(--text-2)]">인분</p>
          <div className="mt-3 [&>div]:w-full">
            <NumericStepperCompact
              disabled={isCreating}
              min={1}
              onChange={setServings}
              unit="인분"
              value={servings}
            />
          </div>
          <div className="mt-6 flex gap-3">
            <button
              className="h-[var(--control-height-md)] flex-1 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] text-[14px] font-bold text-[var(--text-2)]"
              disabled={isCreating}
              onClick={onCancel}
              type="button"
            >
              취소
            </button>
            <button
              className="h-[var(--control-height-md)] flex-1 rounded-[var(--radius-control)] bg-[var(--brand)] text-[14px] font-bold text-[var(--text-inverse)] disabled:opacity-50"
              disabled={isCreating || servings < 1}
              onClick={handleConfirm}
              type="button"
            >
              {isCreating ? "추가 중..." : "추가하기"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (presentation === "web") {
    return (
      <WebModal onBackdropClick={onCancel}>
        <WebDialog aria-labelledby="pantry-servings-title" size="narrow">
          <WebDialogHeader>
            <div>
              <WebDialogTitle id="pantry-servings-title">
                플래너에 추가
              </WebDialogTitle>
              {slotLabel ? (
                <p className="web-modal-target">대상 · {slotLabel}</p>
              ) : null}
            </div>
            <button
              aria-label="닫기"
              className="web-modal-close"
              onClick={onCancel}
              type="button"
            >
              ×
            </button>
          </WebDialogHeader>
          <WebDialogBody>
            <div className="web-modal-preview web-modal-preview-compact">
              <div className="web-modal-preview-thumb">
                {recipe.thumbnail_url ? (
                  <Image
                    alt=""
                    className="h-full w-full object-cover"
                    height={52}
                    src={recipe.thumbnail_url}
                    unoptimized
                    width={52}
                  />
                ) : (
                  "🍳"
                )}
              </div>
              <div className="min-w-0">
                <div className="web-modal-preview-title">{recipe.title}</div>
                <div className="web-modal-preview-meta">선택 {servings}인분</div>
              </div>
            </div>
            <p className="web-modal-section-label">인분</p>
            <div className="web-servings-stepper">
              <div className="web-stepper" aria-label="계획 인분" role="group">
                <button
                  aria-label="인분 줄이기"
                  disabled={isCreating || servings <= 1}
                  onClick={() => setServings((value) => Math.max(1, value - 1))}
                  type="button"
                >
                  −
                </button>
                <span>{servings}인분</span>
                <button
                  aria-label="인분 늘리기"
                  disabled={isCreating}
                  onClick={() => setServings((value) => value + 1)}
                  type="button"
                >
                  +
                </button>
              </div>
            </div>
          </WebDialogBody>
          <WebDialogFooter>
            <WebButton disabled={isCreating} onClick={onCancel} variant="secondary">
              취소
            </WebButton>
            <WebButton
              disabled={isCreating || servings < 1}
              onClick={handleConfirm}
            >
              {isCreating ? "추가 중..." : "추가하기"}
            </WebButton>
          </WebDialogFooter>
        </WebDialog>
      </WebModal>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-[var(--overlay-42)] p-4 backdrop-blur-[1px] lg:items-center lg:justify-center"
      onClick={onCancel}
    >
      <div
        aria-labelledby="servings-modal-title"
        aria-modal="true"
        className="glass-panel w-full max-w-md rounded-[var(--radius-sheet)] px-5 py-6 md:px-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <h2
          className="text-lg font-bold text-[var(--foreground)]"
          id="servings-modal-title"
        >
          계획 인분 입력
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">{recipe.title}</p>
        <div className="mt-4 flex items-center justify-center gap-4">
          <NumericStepperCompact
            disabled={isCreating}
            min={1}
            onChange={setServings}
            unit="인분"
            value={servings}
          />
        </div>
        <div className="mt-6 flex gap-3">
          <button
            className="h-[var(--control-height-md)] flex-1 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--surface)] text-base font-semibold text-[var(--foreground)] hover:bg-[var(--line)]"
            disabled={isCreating}
            onClick={onCancel}
            type="button"
          >
            취소
          </button>
          <button
            className="h-[var(--control-height-md)] flex-1 rounded-[var(--radius-card)] bg-[var(--brand)] text-base font-semibold text-[var(--text-inverse)] hover:bg-[var(--brand-deep)] disabled:opacity-50"
            disabled={isCreating || servings < 1}
            onClick={handleConfirm}
            type="button"
          >
            {isCreating ? "추가 중..." : "추가"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function PantryMatchPicker({
  selectedRecipe,
  isCreating,
  onRecipeSelect,
  onServingsConfirm,
  onServingsCancel,
  onClose,
  onBack,
  presentation = "dialog",
  slotLabel,
}: PantryMatchPickerProps) {
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [recipes, setRecipes] = useState<PantryMatchRecipeItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadPantryMatches = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage(null);

    const response = await fetchPantryMatchRecipes({ limit: 20 });

    if (!response.success || !response.data) {
      setLoadState("error");
      setErrorMessage(response.error?.message ?? "팬트리 기반 추천을 불러오지 못했어요.");
      setRecipes([]);
      return;
    }

    if (response.data.items.length === 0) {
      setLoadState("empty");
      setRecipes([]);
    } else {
      setLoadState("ready");
      setRecipes(response.data.items);
    }
  }, []);

  useEffect(() => {
    loadPantryMatches();
  }, [loadPantryMatches]);

  const content = (
    <>
      {loadState === "loading" && (
        <div className={presentation === "web" ? "space-y-2" : "py-8 text-center text-sm text-[var(--muted)]"} aria-busy="true">
          {presentation === "web" ? (
            Array.from({ length: 5 }).map((_, index) => (
              <WebSkeleton className="h-[92px]" key={index} />
            ))
          ) : (
            "추천 레시피 불러오는 중..."
          )}
        </div>
      )}

      {loadState === "empty" && (
        presentation === "web" ? (
          <WebEmptyState
            description="팬트리에 재료를 추가하면 추천 레시피를 볼 수 있어요."
            icon="🧊"
            title="추천 레시피가 없어요"
          />
        ) : (
          <div className="py-8 text-center">
            <p className="text-base font-semibold text-[var(--foreground)]">
              추천 레시피가 없어요
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              팬트리에 재료를 추가하면 추천 레시피를 볼 수 있어요.
            </p>
          </div>
        )
      )}

      {loadState === "error" && (
        <div
          className="rounded-[var(--radius-card)] border border-[var(--danger-border)] bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]"
          role="alert"
        >
          {errorMessage}
        </div>
      )}

      {loadState === "ready" && recipes.length > 0 && (
        <div className={presentation === "screen" || presentation === "sheet" ? "" : presentation === "web" ? "space-y-2" : "space-y-3"}>
          {recipes.map((recipe) => (
            <PantryRecipeCard
              key={recipe.id}
              onSelect={onRecipeSelect}
              presentation={presentation}
              recipe={recipe}
            />
          ))}
        </div>
      )}
    </>
  );

  if (presentation === "screen") {
    return (
      <div className="min-h-screen bg-[var(--surface-fill)] pb-[112px] text-[var(--foreground)]">
        <div className="flex min-h-[var(--control-height-xl)] items-center border-b border-[var(--line-strong)] bg-[var(--surface)] px-2">
          <AppBackButton onClick={onBack ?? onClose} />
          <h1 className="min-w-0 flex-1 truncate text-center text-[18px] font-bold text-[var(--foreground)]">
            팬트리 기반 추천
          </h1>
          <AppBackButtonSpacer />
        </div>
        {slotLabel ? (
          <div className="border-b border-[var(--line-strong)] bg-[var(--surface)] px-4 py-3.5">
            <p className="text-[12px] font-bold leading-[1.5] text-[var(--brand)]">
              대상 · {slotLabel}
            </p>
          </div>
        ) : null}
        <div className="p-3 pb-[112px]">{content}</div>
        {selectedRecipe && (
          <ServingsModal
            isCreating={isCreating}
            onCancel={onServingsCancel}
            onConfirm={onServingsConfirm}
            presentation="screen"
            recipe={selectedRecipe}
            slotLabel={slotLabel}
          />
        )}
        <Wave1MobileBottomTab ariaLabel="팬트리 기반 추천 하단 탭" currentTab="planner" />
      </div>
    );
  }

  if (presentation === "sheet") {
    return (
      <>
        {slotLabel ? (
          <p className="mb-3 text-[12px] font-bold leading-[1.5] text-[var(--brand)]">
            대상 · {slotLabel}
          </p>
        ) : null}
        {content}
        {selectedRecipe && (
          <ServingsModal
            isCreating={isCreating}
            onCancel={onServingsCancel}
            onConfirm={onServingsConfirm}
            presentation="sheet"
            recipe={selectedRecipe}
            slotLabel={slotLabel}
          />
        )}
      </>
    );
  }

  if (presentation === "web") {
    return (
      <section className="web-picker-section" aria-label="팬트리 기반 추천">
        {slotLabel ? <p className="web-picker-subtle web-picker-target">대상 · {slotLabel}</p> : null}
        {content}
        {selectedRecipe && (
          <ServingsModal
            isCreating={isCreating}
            onCancel={onServingsCancel}
            onConfirm={onServingsConfirm}
            presentation="web"
            recipe={selectedRecipe}
            slotLabel={slotLabel}
          />
        )}
      </section>
    );
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-[var(--overlay-42)] p-4 backdrop-blur-[1px] lg:items-center lg:justify-center"
      onClick={onClose}
    >
      <div
        aria-labelledby="pantry-match-title"
        aria-modal="true"
        className="glass-panel max-h-[80vh] w-full max-w-md overflow-hidden rounded-[var(--radius-sheet)] px-5 py-6 md:px-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-center justify-between">
          <h2
            className="text-xl font-bold text-[var(--foreground)]"
            id="pantry-match-title"
          >
            팬트리 기반 추천
          </h2>
          <button
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--line)]"
            onClick={onClose}
            type="button"
          >
            <svg
              fill="none"
              height="20"
              viewBox="0 0 20 20"
              width="20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M5 5L15 15M5 15L15 5"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2"
              />
            </svg>
          </button>
        </div>

        <div className="mt-4 max-h-[60vh] overflow-y-auto">{content}</div>
      </div>

      {selectedRecipe && (
        <ServingsModal
          isCreating={isCreating}
          onCancel={onServingsCancel}
          onConfirm={onServingsConfirm}
          presentation={presentation}
          recipe={selectedRecipe}
        />
      )}
    </div>
  );
}
