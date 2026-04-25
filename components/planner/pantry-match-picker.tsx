"use client";

import React, { useCallback, useEffect, useState } from "react";

import { NumericStepperCompact } from "@/components/shared/numeric-stepper-compact";
import { fetchPantryMatchRecipes } from "@/lib/api/recipe";
import type { PantryMatchRecipeItem } from "@/types/recipe";

export interface PantryMatchPickerProps {
  selectedRecipe: PantryMatchRecipeItem | null;
  isCreating: boolean;
  onRecipeSelect: (recipe: PantryMatchRecipeItem) => void;
  onServingsConfirm: (servings: number) => void;
  onServingsCancel: () => void;
  onClose: () => void;
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
      ? "bg-green-100 text-green-800"
      : percentage >= 50
        ? "bg-yellow-100 text-yellow-800"
        : "bg-gray-100 text-gray-800";

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
}

function PantryRecipeCard({ recipe, onSelect }: PantryRecipeCardProps) {
  return (
    <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
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
                className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800"
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
        className="mt-3 h-11 w-full rounded-[12px] bg-[var(--brand)] text-base font-semibold text-white hover:bg-[var(--brand-deep)]"
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
}

function ServingsModal({ recipe, isCreating, onConfirm, onCancel }: ServingsModalProps) {
  const [servings, setServings] = useState(2);

  const handleConfirm = useCallback(() => {
    if (servings < 1) return;
    onConfirm(servings);
  }, [servings, onConfirm]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-black/42 p-4 backdrop-blur-[1px] md:items-center md:justify-center"
      onClick={onCancel}
    >
      <div
        aria-labelledby="servings-modal-title"
        aria-modal="true"
        className="glass-panel w-full max-w-md rounded-[24px] px-5 py-6 md:px-6"
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
            className="h-11 flex-1 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] text-base font-semibold text-[var(--foreground)] hover:bg-[var(--line)]"
            disabled={isCreating}
            onClick={onCancel}
            type="button"
          >
            취소
          </button>
          <button
            className="h-11 flex-1 rounded-[12px] bg-[var(--brand)] text-base font-semibold text-white hover:bg-[var(--brand-deep)] disabled:opacity-50"
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

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-black/42 p-4 backdrop-blur-[1px] md:items-center md:justify-center"
      onClick={onClose}
    >
      <div
        aria-labelledby="pantry-match-title"
        aria-modal="true"
        className="glass-panel max-h-[80vh] w-full max-w-md overflow-hidden rounded-[24px] px-5 py-6 md:px-6"
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

        <div className="mt-4 max-h-[60vh] overflow-y-auto">
          {loadState === "loading" && (
            <div className="py-8 text-center text-sm text-[var(--muted)]" aria-busy="true">
              추천 레시피 불러오는 중...
            </div>
          )}

          {loadState === "empty" && (
            <div className="py-8 text-center">
              <p className="text-base font-semibold text-[var(--foreground)]">
                추천 레시피가 없어요
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                팬트리에 재료를 추가하면 추천 레시피를 볼 수 있어요.
              </p>
            </div>
          )}

          {loadState === "error" && (
            <div
              className="rounded-[12px] border border-red-300 bg-red-50 p-4 text-sm text-red-700"
              role="alert"
            >
              {errorMessage}
            </div>
          )}

          {loadState === "ready" && recipes.length > 0 && (
            <div className="space-y-3">
              {recipes.map((recipe) => (
                <PantryRecipeCard key={recipe.id} onSelect={onRecipeSelect} recipe={recipe} />
              ))}
            </div>
          )}
        </div>
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
