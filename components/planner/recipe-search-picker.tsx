"use client";

import Image from "next/image";
import React, { useCallback, useEffect, useState } from "react";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { NumericStepperCompact } from "@/components/shared/numeric-stepper-compact";
import { fetchRecipes } from "@/lib/api/recipe";
import type { RecipeCardItem } from "@/types/recipe";

export interface RecipeSearchPickerProps {
  selectedRecipe: RecipeCardItem | null;
  isCreating: boolean;
  onRecipeSelect: (recipe: RecipeCardItem) => void;
  onServingsConfirm: (servings: number) => void;
  onServingsCancel: () => void;
  searchInputRef?: React.Ref<HTMLInputElement>;
  presentation?: "inline" | "screen";
  title?: string;
  slotLabel?: string;
  onBack?: () => void;
}

type SearchState = "idle" | "loading" | "ready" | "empty" | "error";

// ─── Search Input ────────────────────────────────────────────────────────────

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  disabled: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}

function SearchInput({
  value,
  onChange,
  onSearch,
  disabled,
  inputRef,
}: SearchInputProps) {
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
        ref={inputRef}
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
  presentation?: "inline" | "screen";
}

function RecipeThumb({ recipe }: { recipe: RecipeCardItem }) {
  if (recipe.thumbnail_url) {
    return (
      <Image
        alt=""
        className="h-full w-full object-cover"
        height={56}
        src={recipe.thumbnail_url}
        unoptimized
        width={56}
      />
    );
  }

  return <span className="text-[18px] font-bold text-[#20A8A4]">{recipe.title.charAt(0)}</span>;
}

function formatMetricCount(value: number) {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1).replace(/\.0$/, "")}만`;
  }

  return value.toLocaleString("ko-KR");
}

function ResultCard({ recipe, onSelect, presentation = "inline" }: ResultCardProps) {
  if (presentation === "screen") {
    return (
      <button
        aria-label={`${recipe.title} 선택`}
        className="mb-2 flex w-full items-center gap-3 rounded-[12px] border border-[#DEE2E6] bg-white p-3 text-left active:border-[#2AC1BC] active:bg-[#E6F8F7]"
        onClick={() => onSelect(recipe)}
        type="button"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#E6F8F7]">
          <RecipeThumb recipe={recipe} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-bold text-[#212529]">
            {recipe.title}
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-[#868E96]">
            조회 {formatMetricCount(recipe.view_count)}
            {recipe.tags.length > 0 ? ` · ${recipe.tags.slice(0, 4).join(" · ")}` : ""}
          </span>
        </span>
        <span className="rounded-[7px] bg-[#E6F8F7] px-3 py-2 text-[13px] font-semibold text-[#007A76]">
          선택
        </span>
      </button>
    );
  }

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

function ScreenServingsStepper({
  disabled,
  onChange,
  servings,
}: {
  disabled: boolean;
  onChange: (servings: number) => void;
  servings: number;
}) {
  return (
    <div className="mt-3 flex h-14 items-center justify-between rounded-[12px] border border-[#DEE2E6] bg-[#F8F9FA] px-3.5">
      <span className="text-[13px] font-bold text-[#495057]">계획 인분</span>
      <div className="flex items-center gap-3">
        <button
          aria-label="인분 줄이기"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[18px] font-bold text-[#212529] shadow-[0_1px_4px_rgba(0,0,0,0.04)] disabled:opacity-40"
          disabled={disabled || servings <= 1}
          onClick={() => onChange(Math.max(1, servings - 1))}
          type="button"
        >
          −
        </button>
        <span aria-live="polite" className="min-w-12 text-center text-[18px] font-extrabold text-[#212529]">
          {servings}인분
        </span>
        <button
          aria-label="인분 늘리기"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2AC1BC] text-[18px] font-bold text-white disabled:opacity-40"
          disabled={disabled}
          onClick={() => onChange(servings + 1)}
          type="button"
        >
          +
        </button>
      </div>
    </div>
  );
}

// ─── Servings Modal ──────────────────────────────────────────────────────────

interface ServingsModalProps {
  recipe: RecipeCardItem;
  isCreating: boolean;
  onConfirm: (servings: number) => void;
  onCancel: () => void;
  presentation?: "inline" | "screen";
  slotLabel?: string;
}

function ServingsModal({
  recipe,
  isCreating,
  onConfirm,
  onCancel,
  presentation = "inline",
  slotLabel,
}: ServingsModalProps) {
  const [servings, setServings] = useState(recipe.base_servings);

  const handleConfirm = useCallback(() => {
    if (servings < 1) return;
    onConfirm(servings);
  }, [servings, onConfirm]);

  if (presentation === "screen") {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end bg-black/42"
        onClick={onCancel}
      >
        <div
          aria-labelledby="servings-modal-title"
          aria-modal="true"
          className="w-full rounded-t-[20px] bg-white px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-2 shadow-[0_8px_24px_rgba(0,0,0,0.16)]"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
        >
          <div className="flex justify-center pb-4">
            <div className="h-1 w-9 rounded-full bg-[#DEE2E6]" />
          </div>
          <h2
            className="text-[20px] font-bold text-[#212529]"
            id="servings-modal-title"
          >
            플래너에 추가
          </h2>
          <p className="mt-1 text-[13px] text-[#868E96]">
            {slotLabel ? `${slotLabel}에 추가할 인분을 선택해주세요.` : "추가할 인분을 선택해주세요."}
          </p>
          <div className="mt-4 flex items-center gap-3 rounded-[12px] border border-[#DEE2E6] bg-[#F8F9FA] p-2.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#E6F8F7]">
              <RecipeThumb recipe={recipe} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-extrabold text-[#212529]">
                {recipe.title}
              </span>
              <span className="mt-0.5 block text-[11px] text-[#868E96]">
                기본 {recipe.base_servings}인분 · 선택 {servings}인분
              </span>
            </span>
          </div>
          {slotLabel ? (
            <div className="mt-3 rounded-[12px] border border-[#DEE2E6] bg-[#F8F9FA] px-3.5 py-2.5 text-[14px] font-bold text-[#495057]">
              {slotLabel}
            </div>
          ) : null}
          <p className="mt-2.5 text-[13px] font-bold text-[#495057]">인분</p>
          <ScreenServingsStepper
            disabled={isCreating}
            onChange={setServings}
            servings={servings}
          />
          <div className="mt-5 flex gap-3">
            <button
              className="h-11 flex-1 rounded-[10px] border border-[#DEE2E6] bg-white text-[14px] font-bold text-[#495057]"
              disabled={isCreating}
              onClick={onCancel}
              type="button"
            >
              취소
            </button>
            <button
              className="h-11 flex-1 rounded-[10px] bg-[#2AC1BC] text-[14px] font-bold text-white disabled:opacity-50"
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

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-black/42 p-4 backdrop-blur-[1px] lg:items-center lg:justify-center"
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
    if (!searchQuery.trim() && presentation === "inline") {
      setSearchState("idle");
      setResults([]);
      return;
    }

    await runSearch(searchQuery);
  }, [presentation, runSearch, searchQuery]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      if (presentation === "screen") {
        void runSearch("");
      } else {
        setSearchState("idle");
        setResults([]);
      }
    }
  }, [presentation, runSearch, searchQuery]);

  if (presentation === "screen") {
    return (
      <div className="min-h-screen bg-[#F8F9FA] pb-[112px] text-[#212529]">
        <div className="flex min-h-[52px] items-center border-b border-[#DEE2E6] bg-white px-2">
          <button
            aria-label="뒤로"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[28px] leading-none text-[#212529]"
            onClick={onBack}
            type="button"
          >
            ‹
          </button>
          <h1 className="min-w-0 flex-1 truncate text-center text-[18px] font-bold text-[#212529]">
            {title}
          </h1>
          <div className="h-11 w-11 shrink-0" aria-hidden="true" />
        </div>
        <div className="border-b border-[#DEE2E6] bg-white px-4 pb-3 pt-4">
          <div className="flex items-center gap-2 rounded-[10px] bg-[#F8F9FA] px-3.5 py-2.5">
            <button
              aria-label="검색"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#495057]"
              disabled={searchState === "loading"}
              onClick={() => void handleSearch()}
              type="button"
            >
              <svg
                aria-hidden="true"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
            <input
              aria-label="레시피 검색"
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-[14px] text-[#212529] outline-none placeholder:text-[#868E96]"
              disabled={searchState === "loading"}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handleSearch();
              }}
              placeholder="레시피 이름 또는 재료"
              ref={searchInputRef}
              type="text"
              value={searchQuery}
            />
            {searchQuery ? (
              <button
                className="text-[14px] font-bold text-[#868E96]"
                onClick={() => setSearchQuery("")}
                type="button"
              >
                ×
              </button>
            ) : null}
          </div>
          {slotLabel ? (
            <p className="mt-2 text-[11px] text-[#868E96]">대상 · {slotLabel}</p>
          ) : null}
        </div>
        <div className="p-4 pb-[112px]">
          {searchState === "loading" ? (
            <div className="py-8 text-center text-[13px] text-[#868E96]" aria-busy="true">
              검색 중...
            </div>
          ) : null}

          {searchState === "empty" ? (
            <div className="py-[60px] text-center text-[#868E96]">
              <div className="mb-1.5 text-[36px]" aria-hidden="true">🤔</div>
              <p className="text-[13px]">검색 결과가 없어요</p>
            </div>
          ) : null}

          {searchState === "error" ? (
            <div className="rounded-[12px] border border-red-200 bg-red-50 p-4 text-[13px] text-red-700" role="alert">
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
            presentation="screen"
            recipe={selectedRecipe}
            slotLabel={slotLabel}
          />
        ) : null}
        <Wave1MobileBottomTab ariaLabel="검색 피커 하단 탭" currentTab="planner" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <SearchInput
          disabled={searchState === "loading"}
          inputRef={searchInputRef}
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
          presentation={presentation}
          recipe={selectedRecipe}
        />
      )}
    </>
  );
}
