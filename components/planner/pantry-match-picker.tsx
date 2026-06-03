"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useState } from "react";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { MealAddServingsModal } from "@/components/planner/meal-add-servings-modal";
import { MealAddTargetBadge } from "@/components/planner/meal-add-target-badge";
import {
  AppBackButton,
  AppBackButtonSpacer,
} from "@/components/shared/app-back-button";
import {
  WebEmptyState,
  WebListRow,
  WebSkeleton,
} from "@/components/web";
import { fetchPantryMatchRecipes } from "@/lib/api/recipe";
import { resolveRecipeImage } from "@/lib/recipe-image";
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

type PantryMatchScoreTone = "brand" | "warning" | "danger";

function getPantryMatchScoreTone(percentage: number): PantryMatchScoreTone {
  if (percentage >= 80) return "brand";
  if (percentage >= 50) return "warning";
  return "danger";
}

function getMobileProgressToneClasses(tone: PantryMatchScoreTone) {
  if (tone === "brand") {
    return {
      track: "bg-[var(--brand-soft)]",
      fill: "bg-[color-mix(in_srgb,var(--brand)_32%,transparent)]",
      label: "text-[var(--brand)]",
    };
  }

  if (tone === "warning") {
    return {
      track: "bg-[var(--warning-soft)]",
      fill: "bg-[color-mix(in_srgb,var(--warning)_36%,transparent)]",
      label: "text-[var(--warning)]",
    };
  }

  return {
    track: "bg-[var(--danger-soft)]",
    fill: "bg-[color-mix(in_srgb,var(--danger)_32%,transparent)]",
    label: "text-[var(--danger)]",
  };
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

// ─── Pantry Recipe Card ──────────────────────────────────────────────────────

interface PantryRecipeCardProps {
  recipe: PantryMatchRecipeItem;
  onSelect: (recipe: PantryMatchRecipeItem) => void;
  presentation?: PantryMatchPresentation;
}

function PantryRecipeCard({ recipe, onSelect, presentation = "dialog" }: PantryRecipeCardProps) {
  if (presentation === "screen" || presentation === "sheet") {
    const percentage = Math.round(recipe.match_score * 100);
    const scoreTone = getPantryMatchScoreTone(percentage);
    const scoreToneClasses = getMobileProgressToneClasses(scoreTone);

    return (
      <button
        aria-label={`${recipe.title} 선택`}
        className="mb-2 flex w-full gap-3 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-3 text-left active:border-[var(--brand)] active:bg-[var(--brand-soft)]"
        onClick={() => onSelect(recipe)}
        type="button"
      >
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] bg-[var(--brand-soft)] text-[28px]">
          <Image
            alt=""
            className="h-full w-full object-cover"
            height={64}
            src={resolveRecipeImage(recipe)}
            unoptimized
            width={64}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-bold text-[var(--foreground)]">
            {recipe.title}
          </span>
          <span
            className={[
              "relative mt-1.5 flex h-5 items-center overflow-hidden rounded-full",
              `pantry-match-progress-${scoreTone}`,
              scoreToneClasses.track,
            ].join(" ")}
            data-testid={`pantry-match-progress-${recipe.id}`}
          >
            <span
              className={[
                "absolute left-0 top-0 h-full rounded-full",
                `pantry-match-progress-fill-${scoreTone}`,
                scoreToneClasses.fill,
              ].join(" ")}
              style={{ width: `${Math.max(4, Math.min(100, percentage))}%` }}
            />
            <span
              className={[
                "relative ml-auto pr-2 text-[10px] font-extrabold",
                `pantry-match-progress-label-${scoreTone}`,
                scoreToneClasses.label,
              ].join(" ")}
            >
              {percentage}%
            </span>
          </span>
          <span
            className="mt-1.5 flex flex-wrap items-center gap-1"
            data-testid={`pantry-ingredient-summary-row-${recipe.id}`}
          >
            <span className="mr-0.5 text-[11px] font-bold text-[var(--text-2)]">
              {recipe.matched_ingredients}/{recipe.total_ingredients}개 보유
            </span>
            {recipe.missing_ingredients.slice(0, 3).map((ingredient) => (
              <span
                className="rounded-[var(--radius-badge)] bg-[var(--warning-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--warning-strong)]"
                key={ingredient.id}
              >
                {ingredient.standard_name}
              </span>
            ))}
            {recipe.missing_ingredients.length > 3 ? (
              <span className="rounded-[var(--radius-badge)] bg-[var(--surface-subtle)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--text-3)]">
                +{recipe.missing_ingredients.length - 3}
              </span>
            ) : null}
          </span>
        </span>
      </button>
    );
  }

  if (presentation === "web") {
    const percentage = Math.round(recipe.match_score * 100);
    const scoreTone = getPantryMatchScoreTone(percentage);

    return (
      <button
        aria-label={`${recipe.title} 선택`}
        className="web-picker-pantry-button"
        onClick={() => onSelect(recipe)}
        type="button"
      >
        <WebListRow interactive className="web-picker-pantry-row">
          <span className="web-picker-pantry-thumb" aria-hidden="true">
            <Image
              alt=""
              className="web-picker-pantry-thumb-image h-full w-full object-cover"
              height={56}
              src={resolveRecipeImage(recipe)}
              unoptimized
              width={56}
            />
          </span>
          <span className="web-picker-pantry-copy">
            <span>{recipe.title}</span>
            <span
              className={`web-picker-progress web-picker-progress-${scoreTone}`}
              data-testid={`pantry-match-progress-${recipe.id}`}
            >
              <span
                className={`web-picker-progress-fill web-picker-progress-${scoreTone}`}
                style={{ width: `${Math.max(4, Math.min(100, percentage))}%` }}
              />
              <span className={`web-picker-progress-label web-picker-progress-label-${scoreTone}`}>
                {percentage}%
              </span>
            </span>
            <span className="web-picker-pantry-stats">
              <span className="web-picker-pantry-have">
                {recipe.matched_ingredients}/{recipe.total_ingredients}개 보유
              </span>
              {recipe.missing_ingredients.slice(0, 3).map((ingredient) => (
                <span className="web-picker-missing-chip" key={ingredient.id}>
                  {ingredient.standard_name}
                </span>
              ))}
              {recipe.missing_ingredients.length > 3 ? (
                <span className="web-picker-missing-more">
                  +{recipe.missing_ingredients.length - 3}
                </span>
              ) : null}
            </span>
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

// ─── Servings Modal ───────────────────────────────────────

interface ServingsModalProps {
  recipe: PantryMatchRecipeItem;
  isCreating: boolean;
  onConfirm: (servings: number) => void;
  onCancel: () => void;
  slotLabel?: string;
}

function ServingsModal({
  recipe,
  isCreating,
  onConfirm,
  onCancel,
  slotLabel,
}: ServingsModalProps) {
  return (
    <MealAddServingsModal
      initialServings={2}
      isCreating={isCreating}
      metaText="팬트리 추천"
      onCancel={onCancel}
      onConfirm={onConfirm}
      recipeTitle={recipe.title}
      targetLabel={slotLabel}
      thumbnail={
        <Image
          alt=""
          className="h-full w-full object-cover"
          height={44}
          src={resolveRecipeImage(recipe)}
          unoptimized
          width={44}
        />
      }
    />
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
            팬트리 추천
          </h1>
          <AppBackButtonSpacer />
        </div>
        {slotLabel ? (
          <div className="border-b border-[var(--line-strong)] bg-[var(--surface)] px-4 py-3.5">
            <MealAddTargetBadge label={slotLabel} />
          </div>
        ) : null}
        <div className="p-3 pb-[112px]">{content}</div>
        {selectedRecipe && (
          <ServingsModal
            isCreating={isCreating}
            onCancel={onServingsCancel}
            onConfirm={onServingsConfirm}
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
        {content}
        {selectedRecipe && (
          <ServingsModal
            isCreating={isCreating}
            onCancel={onServingsCancel}
            onConfirm={onServingsConfirm}
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
        <MealAddTargetBadge className="mb-3" label={slotLabel} tone="web" />
        {content}
        {selectedRecipe && (
          <ServingsModal
            isCreating={isCreating}
            onCancel={onServingsCancel}
            onConfirm={onServingsConfirm}
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
          recipe={selectedRecipe}
        />
      )}
    </div>
  );
}
