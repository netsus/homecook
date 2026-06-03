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
  WebButton,
  WebEmptyState,
  WebRecipeCard,
  WebSkeleton,
} from "@/components/web";
import { fetchRecipes } from "@/lib/api/recipe";
import { resolveRecipeImage } from "@/lib/recipe-image";
import type { RecipeCardItem } from "@/types/recipe";

type RecipeSearchPresentation = "inline" | "screen" | "sheet";

export interface RecipeSearchPickerProps {
  selectedRecipe: RecipeCardItem | null;
  isCreating: boolean;
  onRecipeSelect: (recipe: RecipeCardItem) => void;
  onServingsConfirm: (servings: number) => void;
  onServingsCancel: () => void;
  searchInputRef?: React.Ref<HTMLInputElement>;
  presentation?: RecipeSearchPresentation;
  title?: string;
  slotLabel?: string;
  onBack?: () => void;
}

type SearchState = "idle" | "loading" | "ready" | "empty" | "error";

// ─── Search Input ────────────────────────────────────────────────────────────

function SearchGlyph({
  className,
  testId,
}: {
  className?: string;
  testId?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      data-testid={testId}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.3"
      viewBox="0 0 24 24"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16.5 16.5 4 4" />
    </svg>
  );
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  disabled: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
  variant?: "web" | "app";
}

function SearchInput({
  value,
  onChange,
  onSearch,
  disabled,
  inputRef,
  variant = "web",
}: SearchInputProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        onSearch();
      }
    },
    [onSearch],
  );

  if (variant === "app") {
    return (
      <div className="flex h-12 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5">
        <span
          aria-hidden="true"
          className="flex shrink-0 items-center justify-center text-[var(--text-3)]"
        >
          <SearchGlyph className="h-5 w-5" testId="recipe-search-submit-icon" />
        </span>
        <input
          aria-label="레시피 검색"
          autoFocus
          className="min-w-0 flex-1 bg-transparent text-[14px] text-[var(--foreground)] outline-none placeholder:text-[var(--text-3)]"
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="레시피 이름으로 검색"
          ref={inputRef}
          type="text"
          value={value}
        />
        {value ? (
          <button
            aria-label="검색어 지우기"
            className="shrink-0 text-[16px] font-bold text-[var(--text-3)]"
            onClick={() => onChange("")}
            type="button"
          >
            ×
          </button>
        ) : null}
        <button
          aria-label="검색"
          className="flex h-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand)] px-4 text-[13px] font-bold text-[var(--text-inverse)] disabled:opacity-50"
          disabled={disabled}
          onClick={onSearch}
          type="button"
        >
          검색
        </button>
      </div>
    );
  }

  return (
    <div className="web-picker-search">
      <span aria-hidden="true">
        <SearchGlyph className="h-5 w-5" />
      </span>
      <input
        aria-label="레시피 검색"
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="레시피 이름으로 검색"
        ref={inputRef}
        type="text"
        value={value}
      />
      <WebButton
        aria-label="검색"
        disabled={disabled}
        onClick={onSearch}
        size="sm"
        type="button"
      >
        검색
      </WebButton>
    </div>
  );
}

// ─── Result Card ─────────────────────────────────────────────────────────────

interface ResultCardProps {
  recipe: RecipeCardItem;
  onSelect: (recipe: RecipeCardItem) => void;
  presentation?: RecipeSearchPresentation;
}

function RecipeThumb({ recipe }: { recipe: RecipeCardItem }) {
  return (
    <Image
      alt=""
      className="h-full w-full object-cover"
      height={56}
      src={resolveRecipeImage(recipe)}
      unoptimized
      width={56}
    />
  );
}

function formatMetricCount(value: number) {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1).replace(/\.0$/, "")}만`;
  }

  return value.toLocaleString("ko-KR");
}

function ResultCard({ recipe, onSelect, presentation = "inline" }: ResultCardProps) {
  if (presentation === "screen" || presentation === "sheet") {
    return (
      <button
        aria-label={`${recipe.title} 선택`}
        className="mb-2 flex w-full items-center gap-3 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-3 text-left active:border-[var(--brand)] active:bg-[var(--brand-soft)]"
        onClick={() => onSelect(recipe)}
        type="button"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] bg-[var(--brand-soft)]">
          <RecipeThumb recipe={recipe} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-bold text-[var(--foreground)]">
            {recipe.title}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-[var(--text-3)]">
            조회 {formatMetricCount(recipe.view_count)}
            {recipe.tags.length > 0 ? ` · ${recipe.tags.slice(0, 4).join(" · ")}` : ""}
          </span>
        </span>
        <span className="rounded-[var(--radius-badge)] bg-[var(--brand-soft)] px-3 py-2 text-[13px] font-semibold text-[var(--brand)]">
          선택
        </span>
      </button>
    );
  }

  return (
    <button
      aria-label={`${recipe.title} 선택`}
      className="web-picker-recipe-card"
      onClick={() => onSelect(recipe)}
      type="button"
    >
      <WebRecipeCard
        alt={recipe.title}
        imageSrc={resolveRecipeImage(recipe)}
        meta={
          <>
            <span>기본 {recipe.base_servings}인분</span>
            <span>저장 {recipe.save_count}</span>
          </>
        }
        title={recipe.title}
      />
      <span className="web-picker-select-badge">선택</span>
    </button>
  );
}

// ─── Servings Modal ───────────────────────────────────────

interface ServingsModalProps {
  recipe: RecipeCardItem;
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
      initialServings={recipe.base_servings}
      isCreating={isCreating}
      metaText={`기본 ${recipe.base_servings}인분`}
      onCancel={onCancel}
      onConfirm={onConfirm}
      recipeTitle={recipe.title}
      targetLabel={slotLabel}
      thumbnail={<RecipeThumb recipe={recipe} />}
    />
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function RecipeSearchPicker({
  selectedRecipe,
  isCreating,
  onRecipeSelect,
  onServingsConfirm,
  onServingsCancel,
  searchInputRef,
  presentation = "inline",
  title = "레시피 검색",
  slotLabel,
  onBack,
}: RecipeSearchPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [results, setResults] = useState<RecipeCardItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const runSearch = useCallback(async (query: string) => {
    const trimmedQuery = query.trim();

    setSearchState("loading");
    setErrorMessage(null);

    const response = await fetchRecipes({
      ...(trimmedQuery ? { q: trimmedQuery } : {}),
      limit: 10,
    });

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
  }, []);

  const handleSearch = useCallback(async () => {
    await runSearch(searchQuery);
  }, [runSearch, searchQuery]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      if (
        presentation === "screen" ||
        presentation === "inline" ||
        presentation === "sheet"
      ) {
        void runSearch("");
      } else {
        setSearchState("idle");
        setResults([]);
      }
    }
  }, [presentation, runSearch, searchQuery]);

  if (presentation === "screen") {
    return (
      <div className="min-h-screen bg-[var(--surface-fill)] pb-[112px] text-[var(--foreground)]">
        <div className="flex min-h-[var(--control-height-xl)] items-center border-b border-[var(--line-strong)] bg-[var(--surface)] px-2">
          <AppBackButton onClick={onBack ?? (() => undefined)} />
          <h1 className="min-w-0 flex-1 truncate text-center text-[18px] font-bold text-[var(--foreground)]">
            {title}
          </h1>
          <AppBackButtonSpacer />
        </div>
        <div className="border-b border-[var(--line-strong)] bg-[var(--surface)] px-4 pb-3 pt-4">
          {slotLabel ? (
            <MealAddTargetBadge className="mb-2.5" label={slotLabel} />
          ) : null}
          <div className="flex h-12 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3.5">
            <span
              aria-hidden="true"
              className="flex shrink-0 items-center justify-center text-[var(--text-3)]"
            >
              <SearchGlyph className="h-5 w-5" testId="recipe-search-submit-icon" />
            </span>
            <input
              aria-label="레시피 검색"
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-[14px] text-[var(--foreground)] outline-none placeholder:text-[var(--text-3)]"
              disabled={searchState === "loading"}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleSearch();
              }}
              placeholder="레시피 이름으로 검색"
              ref={searchInputRef}
              type="text"
              value={searchQuery}
            />
            {searchQuery ? (
              <button
                aria-label="검색어 지우기"
                className="shrink-0 text-[16px] font-bold text-[var(--text-3)]"
                onClick={() => setSearchQuery("")}
                type="button"
              >
                ×
              </button>
            ) : null}
            <button
              className="flex h-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand)] px-4 text-[13px] font-bold text-[var(--text-inverse)] disabled:opacity-50"
              disabled={searchState === "loading"}
              onClick={() => void handleSearch()}
              type="button"
            >
              검색
            </button>
          </div>
        </div>
        <div className="p-4 pb-[112px]">
          {searchState === "loading" ? (
            <div className="py-8 text-center text-[13px] text-[var(--text-3)]" aria-busy="true">
              검색 중...
            </div>
          ) : null}

          {searchState === "empty" ? (
            <div className="py-[60px] text-center text-[var(--text-3)]">
              <div className="mb-1.5 text-[36px]" aria-hidden="true">🤔</div>
              <p className="text-[13px]">검색 결과가 없어요</p>
            </div>
          ) : null}

          {searchState === "error" ? (
            <div className="rounded-[var(--radius-card)] border border-[var(--danger-border)] bg-[var(--danger-soft)] p-4 text-[13px] text-[var(--danger)]" role="alert">
              {errorMessage}
            </div>
          ) : null}

          {searchState === "ready" && results.length > 0 ? (
            <div>
              {results.map((recipe) => (
                <ResultCard
                  key={recipe.id}
                  onSelect={onRecipeSelect}
                  presentation="screen"
                  recipe={recipe}
                />
              ))}
            </div>
          ) : null}
        </div>

        {selectedRecipe ? (
          <ServingsModal
            isCreating={isCreating}
            onCancel={onServingsCancel}
            onConfirm={onServingsConfirm}
            recipe={selectedRecipe}
            slotLabel={slotLabel}
          />
        ) : null}
        <Wave1MobileBottomTab ariaLabel="검색 피커 하단 탭" currentTab="planner" />
      </div>
    );
  }

  const isSheet = presentation === "sheet";

  return (
    <>
      <div className="space-y-4">
        <SearchInput
          disabled={searchState === "loading"}
          inputRef={searchInputRef}
          onChange={setSearchQuery}
          onSearch={handleSearch}
          value={searchQuery}
          variant={isSheet ? "app" : "web"}
        />
        {searchState === "loading" && !isSheet && (
          <div className="web-picker-grid" aria-busy="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <WebSkeleton className="h-[220px]" key={index} />
            ))}
          </div>
        )}

        {searchState === "loading" && isSheet ? (
          <div className="py-8 text-center text-[13px] text-[var(--text-3)]" aria-busy="true">
            검색 중...
          </div>
        ) : null}

        {searchState === "empty" && !isSheet && (
          <WebEmptyState
            description="다른 키워드로 다시 검색해보세요."
            icon="⌕"
            title="검색 결과가 없어요"
          />
        )}

        {searchState === "empty" && isSheet ? (
          <div className="py-8 text-center">
            <p className="text-base font-semibold text-[var(--foreground)]">
              검색 결과가 없어요
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              다른 키워드로 다시 검색해보세요.
            </p>
          </div>
        ) : null}

        {searchState === "error" && (
          <div
            className="rounded-[var(--radius-card)] border border-[var(--danger-border)] bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]"
            role="alert"
          >
            {errorMessage}
          </div>
        )}

        {searchState === "ready" && results.length > 0 && (
          <div className={isSheet ? "space-y-2" : "web-picker-grid"}>
            {results.map((recipe) => (
              <ResultCard
                key={recipe.id}
                onSelect={onRecipeSelect}
                presentation={isSheet ? "sheet" : "inline"}
                recipe={recipe}
              />
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
          slotLabel={slotLabel}
        />
      )}
    </>
  );
}
