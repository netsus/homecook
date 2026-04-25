"use client";

import React, { useCallback, useEffect, useState } from "react";

import { NumericStepperCompact } from "@/components/shared/numeric-stepper-compact";
import { fetchRecipeBookRecipes } from "@/lib/api/recipe";
import type { RecipeBookRecipeItem, RecipeBookSummary } from "@/types/recipe";

export interface RecipeBookDetailPickerProps {
  book: RecipeBookSummary;
  selectedRecipe: RecipeBookRecipeItem | null;
  isCreating: boolean;
  onRecipeSelect: (recipe: RecipeBookRecipeItem) => void;
  onServingsConfirm: (servings: number) => void;
  onServingsCancel: () => void;
  onBack: () => void;
}

type LoadState = "idle" | "loading" | "ready" | "empty" | "error";

// ─── Recipe Card ─────────────────────────────────────────────────────────────

interface RecipeCardProps {
  recipe: RecipeBookRecipeItem;
  onSelect: (recipe: RecipeBookRecipeItem) => void;
}

function RecipeCard({ recipe, onSelect }: RecipeCardProps) {
  return (
    <div className="rounded-[16px] border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
      <h3 className="line-clamp-2 text-2xl font-bold tracking-[-0.02em] text-[var(--foreground)]">
        {recipe.title}
      </h3>
      {recipe.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {recipe.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex rounded-full bg-[var(--olive)]/10 px-2 py-0.5 text-xs font-semibold text-[var(--olive)]"
            >
              {tag}
            </span>
          ))}
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
  recipe: RecipeBookRecipeItem;
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

export function RecipeBookDetailPicker({
  book,
  selectedRecipe,
  isCreating,
  onRecipeSelect,
  onServingsConfirm,
  onServingsCancel,
  onBack,
}: RecipeBookDetailPickerProps) {
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [recipes, setRecipes] = useState<RecipeBookRecipeItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRecipes = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage(null);

    const response = await fetchRecipeBookRecipes(book.id, { limit: 20 });

    if (!response.success || !response.data) {
      setLoadState("error");
      setErrorMessage(response.error?.message ?? "레시피를 불러오지 못했어요.");
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
  }, [book.id]);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-black/42 p-4 backdrop-blur-[1px] md:items-center md:justify-center"
      onClick={onBack}
    >
      <div
        aria-labelledby="recipebook-detail-title"
        aria-modal="true"
        className="glass-panel max-h-[80vh] w-full max-w-md overflow-hidden rounded-[24px] px-5 py-6 md:px-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-center gap-2">
          <button
            aria-label="뒤로"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--foreground)] hover:bg-[var(--line)]"
            onClick={onBack}
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
                d="M12 5L7 10L12 15"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          </button>
          <h2
            className="flex-1 text-xl font-bold text-[var(--foreground)]"
            id="recipebook-detail-title"
          >
            {book.name}
          </h2>
        </div>

        <div className="mt-4 max-h-[60vh] overflow-y-auto">
          {loadState === "loading" && (
            <div className="py-8 text-center text-sm text-[var(--muted)]" aria-busy="true">
              레시피 불러오는 중...
            </div>
          )}

          {loadState === "empty" && (
            <div className="py-8 text-center">
              <p className="text-base font-semibold text-[var(--foreground)]">
                레시피가 없어요
              </p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                레시피를 저장하면 이 레시피북에 추가돼요.
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
                <RecipeCard key={recipe.recipe_id} onSelect={onRecipeSelect} recipe={recipe} />
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
