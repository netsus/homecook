"use client";

import React, { useCallback, useEffect, useState } from "react";

import { NumericStepperCompact } from "@/components/shared/numeric-stepper-compact";
import { fetchRecipes } from "@/lib/api/recipe";
import type { RecipeCardItem } from "@/types/recipe";

export interface RecipeSearchPickerProps {
  selectedRecipe: RecipeCardItem | null;
  isCreating: boolean;
  onRecipeSelect: (recipe: RecipeCardItem) => void;
  onServingsConfirm: (servings: number) => void;
  onServingsCancel: () => void;
}

type SearchState = "idle" | "loading" | "ready" | "empty" | "error";

// ─── Search Input ────────────────────────────────────────────────────────────

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  disabled: boolean;
}

function SearchInput({ value, onChange, onSearch, disabled }: SearchInputProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        onSearch();
      }
    },
    [onSearch],
  );

  return (
    <div className="relative">
      <input
        aria-label="레시피 검색"
        className="h-11 w-full rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-4 text-base text-[var(--foreground)] placeholder-[var(--muted)] focus:border-[var(--brand)] focus:outline-none"
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="레시피 이름으로 검색"
        type="text"
        value={value}
      />
      <button
        aria-label="검색"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[9999px] bg-[var(--brand)] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[var(--brand-deep)] disabled:opacity-50"
        disabled={disabled}
        onClick={onSearch}
        type="button"
      >
        검색
      </button>
    </div>
  );
}

// ─── Result Card ─────────────────────────────────────────────────────────────

interface ResultCardProps {
  recipe: RecipeCardItem;
  onSelect: (recipe: RecipeCardItem) => void;
}

function ResultCard({ recipe, onSelect }: ResultCardProps) {
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
      <div className="mt-2 flex items-center gap-3 text-sm text-[var(--muted)]">
        <span>기본 {recipe.base_servings}인분</span>
        <span>•</span>
        <span>저장 {recipe.save_count}</span>
      </div>
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
  recipe: RecipeCardItem;
  isCreating: boolean;
  onConfirm: (servings: number) => void;
  onCancel: () => void;
}

function ServingsModal({ recipe, isCreating, onConfirm, onCancel }: ServingsModalProps) {
  const [servings, setServings] = useState(recipe.base_servings);

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
        <p className="mt-2 text-sm text-[var(--muted)]">
          {recipe.title} — 기본 {recipe.base_servings}인분
        </p>
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

export function RecipeSearchPicker({
  selectedRecipe,
  isCreating,
  onRecipeSelect,
  onServingsConfirm,
  onServingsCancel,
}: RecipeSearchPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [results, setResults] = useState<RecipeCardItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchState("idle");
      setResults([]);
      return;
    }

    setSearchState("loading");
    setErrorMessage(null);

    const response = await fetchRecipes({ q: searchQuery.trim(), limit: 10 });

    if (!response.success || !response.data) {
      setSearchState("error");
      setErrorMessage(response.error?.message ?? "검색 중 오류가 발생했어요.");
      setResults([]);
      return;
    }

    if (response.data.items.length === 0) {
      setSearchState("empty");
      setResults([]);
    } else {
      setSearchState("ready");
      setResults(response.data.items);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchState("idle");
      setResults([]);
    }
  }, [searchQuery]);

  return (
    <>
      <div className="space-y-4">
        <SearchInput
          disabled={searchState === "loading"}
          onChange={setSearchQuery}
          onSearch={handleSearch}
          value={searchQuery}
        />

        {searchState === "loading" && (
          <div className="py-8 text-center text-sm text-[var(--muted)]" aria-busy="true">
            검색 중...
          </div>
        )}

        {searchState === "empty" && (
          <div className="py-8 text-center">
            <p className="text-base font-semibold text-[var(--foreground)]">
              검색 결과가 없어요
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              다른 키워드로 다시 검색해보세요.
            </p>
          </div>
        )}

        {searchState === "error" && (
          <div
            className="rounded-[12px] border border-red-300 bg-red-50 p-4 text-sm text-red-700"
            role="alert"
          >
            {errorMessage}
          </div>
        )}

        {searchState === "ready" && results.length > 0 && (
          <div className="space-y-3">
            {results.map((recipe) => (
              <ResultCard key={recipe.id} onSelect={onRecipeSelect} recipe={recipe} />
            ))}
          </div>
        )}
      </div>

      {selectedRecipe && (
        <ServingsModal
          isCreating={isCreating}
          onCancel={onServingsCancel}
          onConfirm={onServingsConfirm}
          recipe={selectedRecipe}
        />
      )}
    </>
  );
}
