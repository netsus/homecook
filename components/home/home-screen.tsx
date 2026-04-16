"use client";
import React from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { IngredientFilterModal } from "@/components/home/ingredient-filter-modal";
import { RecipeCard } from "@/components/home/recipe-card";
import { ContentState } from "@/components/shared/content-state";
import { fetchJson } from "@/lib/api/fetch-json";
import { useDiscoveryFilterStore } from "@/stores/discovery-filter-store";
import type {
  RecipeListData,
  RecipeSortKey,
  RecipeTheme,
  RecipeThemesData,
} from "@/types/recipe";

const SORT_OPTIONS: Array<{ label: string; value: RecipeSortKey }> = [
  { label: "조회수순", value: "view_count" },
  { label: "좋아요순", value: "like_count" },
  { label: "저장순", value: "save_count" },
  { label: "플래너 등록순", value: "plan_count" },
];

type ScreenState = "loading" | "ready" | "empty" | "error";
type ThemeState = "loading" | "ready";

export function HomeScreen() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<RecipeSortKey>("view_count");
  const [isSortMenuOpen, setSortMenuOpen] = useState(false);
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [themeState, setThemeState] = useState<ThemeState>("loading");
  const [recipes, setRecipes] = useState<RecipeListData | null>(null);
  const [themes, setThemes] = useState<RecipeThemesData | null>(null);
  const [isIngredientModalOpen, setIngredientModalOpen] = useState(false);
  const recipeRequestIdRef = useRef(0);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  const appliedIngredientIds = useDiscoveryFilterStore(
    (state) => state.appliedIngredientIds,
  );
  const resetAppliedIngredientIds = useDiscoveryFilterStore(
    (state) => state.resetAppliedIngredientIds,
  );
  const setAppliedIngredientIds = useDiscoveryFilterStore(
    (state) => state.setAppliedIngredientIds,
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [query]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (appliedIngredientIds.length > 0) {
      params.set("ingredient_ids", appliedIngredientIds.join(","));
    } else {
      params.delete("ingredient_ids");
    }

    const queryString = params.toString();
    const nextUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ""}${window.location.hash}`;

    if (nextUrl !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState({}, "", nextUrl);
    }
  }, [appliedIngredientIds]);

  useEffect(() => {
    if (!isSortMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (!sortMenuRef.current?.contains(event.target)) {
        setSortMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSortMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSortMenuOpen]);

  const loadThemes = useCallback(async () => {
    try {
      const themeData = await fetchJson<RecipeThemesData>("/api/v1/recipes/themes");
      setThemes(themeData);
    } catch {
      setThemes({ themes: [] });
    } finally {
      setThemeState("ready");
    }
  }, []);

  useEffect(() => {
    void loadThemes();
  }, [loadThemes]);

  const loadRecipes = useCallback(async () => {
    const currentRequestId = recipeRequestIdRef.current + 1;
    recipeRequestIdRef.current = currentRequestId;

    try {
      setScreenState("loading");

      const params = new URLSearchParams({
        sort,
      });

      if (debouncedQuery.trim()) {
        params.set("q", debouncedQuery.trim());
      }

      if (appliedIngredientIds.length > 0) {
        params.set("ingredient_ids", appliedIngredientIds.join(","));
      }

      const recipeData = await fetchJson<RecipeListData>(`/api/v1/recipes?${params}`);

      if (currentRequestId !== recipeRequestIdRef.current) {
        return;
      }

      setRecipes(recipeData);
      const hasRecipes = recipeData.items.length > 0;

      setScreenState(hasRecipes ? "ready" : "empty");
    } catch {
      if (currentRequestId !== recipeRequestIdRef.current) {
        return;
      }

      setRecipes(null);
      setScreenState("error");
    }
  }, [appliedIngredientIds, debouncedQuery, sort]);

  useEffect(() => {
    void loadRecipes();
  }, [loadRecipes]);

  const hasQuery = debouncedQuery.trim().length > 0;
  const hasIngredientFilter = appliedIngredientIds.length > 0;
  const hasActiveFilters = hasQuery || hasIngredientFilter;
  const visibleThemes = useMemo(
    () => (hasActiveFilters ? [] : themes?.themes ?? []),
    [hasActiveFilters, themes],
  );
  const selectedSortLabel = useMemo(
    () => SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "조회수순",
    [sort],
  );
  const listTitle = hasActiveFilters ? "검색 결과" : "모든 레시피";
  const showInitialDiscoverySkeleton =
    !hasActiveFilters && themeState === "loading";
  const showGlobalEmpty = screenState === "empty" && visibleThemes.length === 0;

  const clearIngredientFilters = useCallback(() => {
    resetAppliedIngredientIds();
  }, [resetAppliedIngredientIds]);

  const clearSearch = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
  }, []);

  const applyIngredientFilter = useCallback(
    (ingredientIds: string[]) => {
      setAppliedIngredientIds(ingredientIds);
      setIngredientModalOpen(false);
    },
    [setAppliedIngredientIds],
  );

  const selectSort = useCallback((nextSort: RecipeSortKey) => {
    setSort(nextSort);
    setSortMenuOpen(false);
  }, []);

  const sortControlClassName =
    "flex min-h-11 w-full items-center justify-between gap-3 whitespace-nowrap rounded-full border border-[var(--line)] bg-white/92 px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)] shadow-[0_10px_24px_rgba(34,24,14,0.08)] sm:w-auto sm:min-w-44";

  return (
    <>
      <div className="mx-auto max-w-5xl space-y-7">
        <section className="space-y-6">
          <div className="glass-panel rounded-[24px] border-white/55 bg-white/76 px-4 py-4 md:rounded-[28px] md:px-5 md:py-5">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <label className="flex min-h-14 items-center rounded-[16px] border border-[var(--line)] bg-white px-4 shadow-[0_12px_28px_rgba(34,24,14,0.06)]">
                  <span className="visually-hidden">레시피 제목 검색</span>
                  <input
                    className="w-full bg-transparent py-4 outline-none placeholder:text-[var(--muted)]"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="레시피 제목 검색"
                    value={query}
                  />
                </label>
                <button
                  className={`min-h-14 rounded-[16px] border px-5 py-3 text-sm font-semibold transition md:min-w-44 ${
                    hasIngredientFilter
                      ? "border-[var(--olive)] bg-[var(--olive)] text-white shadow-[0_12px_24px_rgba(31,107,82,0.2)]"
                      : "border-[color:rgba(224,80,32,0.16)] bg-white text-[color:#9f3614] shadow-[0_12px_24px_rgba(255,108,60,0.12)] hover:bg-[color:rgba(255,108,60,0.08)]"
                  }`}
                  onClick={() => setIngredientModalOpen(true)}
                  type="button"
                >
                  {hasIngredientFilter
                    ? `재료로 검색 (${appliedIngredientIds.length})`
                    : "재료로 검색"}
                </button>
              </div>
              {hasIngredientFilter ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[color:rgba(46,166,122,0.14)] bg-[color:rgba(46,166,122,0.08)] px-4 py-3">
                  <p className="text-sm text-[var(--olive)]">
                    {appliedIngredientIds.length}개 재료로 레시피를 좁혀보고 있어요.
                  </p>
                  <button
                    className="rounded-full border border-[color:rgba(46,166,122,0.18)] bg-white/88 px-3 py-1.5 text-sm font-semibold text-[var(--olive)]"
                    onClick={clearIngredientFilters}
                    type="button"
                  >
                    필터 초기화
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {screenState === "error" ? (
            <ContentState
              actionLabel="다시 시도"
              description="Supabase 연결이나 API 설정을 확인한 뒤 다시 불러올 수 있어요."
              eyebrow="목록 동기화 오류"
              onAction={() => void loadRecipes()}
              tone="error"
              title="레시피를 불러오지 못했어요"
            />
          ) : null}

          {showInitialDiscoverySkeleton ? (
            <div className="space-y-6">
              <ThemeSectionSkeleton />
              <RecipeListSkeleton />
            </div>
          ) : null}

          {!showInitialDiscoverySkeleton && visibleThemes.length > 0 ? (
            <div className="space-y-8">
              {visibleThemes.map((theme) => (
                <ThemeSection key={theme.id} theme={theme} />
              ))}
            </div>
          ) : null}

          {screenState !== "error" && !showInitialDiscoverySkeleton ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-[1.15rem] font-extrabold tracking-[-0.025em] text-[var(--foreground)] md:text-[1.35rem]">
                    {listTitle}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className="rounded-full bg-white/82 px-3 py-1 text-xs font-semibold text-[var(--muted)] shadow-[0_8px_18px_rgba(34,24,14,0.05)]">
                    {recipes?.items.length ?? 0}개
                  </span>
                  {recipes?.items.length ? (
                    <SortMenu
                      buttonClassName={sortControlClassName}
                      currentLabel={selectedSortLabel}
                      isOpen={isSortMenuOpen}
                      onClose={() => setSortMenuOpen(false)}
                      onSelect={selectSort}
                      onToggle={() => setSortMenuOpen((current) => !current)}
                      options={SORT_OPTIONS}
                      selectedValue={sort}
                      sortMenuRef={sortMenuRef}
                    />
                  ) : null}
                </div>
              </div>

              {screenState === "loading" ? <RecipeListSkeleton /> : null}

              {screenState === "ready" && recipes?.items.length ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {recipes.items.map((recipe) => (
                    <RecipeCard key={recipe.id} recipe={recipe} />
                  ))}
                </div>
              ) : null}

              {showGlobalEmpty ? (
                <ContentState
                  actionLabel={hasIngredientFilter ? "필터 초기화" : "검색 초기화"}
                  description="조건에 맞는 레시피가 없어요."
                  eyebrow="다른 조합"
                  tone="empty"
                  onAction={hasIngredientFilter ? clearIngredientFilters : clearSearch}
                  title="다른 조합을 찾아보세요"
                />
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
      <IngredientFilterModal
        appliedIngredientIds={appliedIngredientIds}
        isOpen={isIngredientModalOpen}
        onApply={applyIngredientFilter}
        onClose={() => setIngredientModalOpen(false)}
      />
    </>
  );
}

function ThemeSection({ theme }: { theme: RecipeTheme }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[1.15rem] font-extrabold tracking-[-0.025em] text-[var(--foreground)] md:text-[1.35rem]">
          {theme.title}
        </h2>
        <span className="rounded-full bg-white/82 px-3 py-1 text-xs font-semibold text-[var(--muted)] shadow-[0_8px_18px_rgba(34,24,14,0.05)]">
          {theme.recipes.length}개
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {theme.recipes.map((recipe) => (
          <RecipeCard key={`${theme.id}-${recipe.id}`} recipe={recipe} />
        ))}
      </div>
    </section>
  );
}

function SortMenu({
  buttonClassName,
  currentLabel,
  isOpen,
  onClose,
  onSelect,
  onToggle,
  options,
  selectedValue,
  sortMenuRef,
}: {
  buttonClassName?: string;
  currentLabel: string;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (value: RecipeSortKey) => void;
  onToggle: () => void;
  options: Array<{ label: string; value: RecipeSortKey }>;
  selectedValue: RecipeSortKey;
  sortMenuRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [isDesktopView, setDesktopView] = useState(false);
  const [openAbove, setOpenAbove] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const desktopMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const syncViewport = () => {
      setDesktopView(window.innerWidth >= 768);
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);

    return () => {
      window.removeEventListener("resize", syncViewport);
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !isDesktopView) {
      setOpenAbove(false);
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const buttonRect = buttonRef.current?.getBoundingClientRect();
      const menuRect = desktopMenuRef.current?.getBoundingClientRect();

      if (!buttonRect || !menuRect) {
        return;
      }

      const gap = 12;
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - buttonRect.bottom;
      const spaceAbove = buttonRect.top;
      const shouldOpenAbove =
        spaceBelow < menuRect.height + gap && spaceAbove > spaceBelow;

      setOpenAbove(shouldOpenAbove);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isDesktopView, isOpen]);

  return (
    <div className="relative" ref={sortMenuRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={`정렬 기준 ${currentLabel}`}
        ref={buttonRef}
        className={
          buttonClassName ??
          "flex min-h-11 w-full items-center justify-between gap-3 whitespace-nowrap rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)] shadow-[var(--shadow)]"
        }
        onClick={onToggle}
        type="button"
      >
        <span className="truncate">정렬 · {currentLabel}</span>
        <span
          aria-hidden="true"
          className={`shrink-0 text-[var(--muted)] transition ${isOpen ? "rotate-180" : ""}`}
        >
          <ChevronIcon />
        </span>
      </button>
      {isOpen && !isDesktopView ? (
        <>
          <button
            aria-label="정렬 메뉴 닫기"
            className="fixed inset-0 z-30 bg-black/42 backdrop-blur-[1px] md:hidden"
            onClick={onClose}
            type="button"
          />
          <div className="fixed inset-x-0 bottom-0 z-40 rounded-t-[24px] border-t border-[var(--line)] bg-[var(--panel)] px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 shadow-[0_-18px_44px_rgba(34,24,14,0.2)] md:hidden">
            <div className="mx-auto h-1.5 w-14 rounded-full bg-black/10" />
            <div className="mt-4 flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                  리스트 정렬
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-extrabold tracking-[-0.02em] text-[var(--foreground)]">
                    정렬 기준
                  </h2>
                  <span className="rounded-full border border-[color:rgba(46,166,122,0.16)] bg-[color:rgba(46,166,122,0.1)] px-2.5 py-1 text-[11px] font-semibold text-[var(--olive)]">
                    현재 {currentLabel}
                  </span>
                </div>
              </div>
              <button
                className="min-h-11 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--muted)]"
                onClick={onClose}
                type="button"
              >
                닫기
              </button>
            </div>
            <div
              aria-label="정렬 기준"
              className="mt-4 space-y-2"
              role="listbox"
            >
              {options.map((option) => {
                const isSelected = option.value === selectedValue;

                return (
                  <button
                    aria-selected={isSelected}
                    className={`flex min-h-14 w-full items-center justify-between rounded-[16px] px-4 py-3 text-left text-sm font-semibold ${
                      isSelected
                        ? "bg-[var(--foreground)] text-white"
                        : "border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]"
                    }`}
                    key={`mobile-${option.value}`}
                    onClick={() => onSelect(option.value)}
                    role="option"
                    type="button"
                  >
                    <span>{option.label}</span>
                    {isSelected ? (
                      <span aria-hidden="true" className="text-white/88">
                        현재
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : null}
      {isOpen && isDesktopView ? (
        <div
          className={`absolute right-0 z-20 w-60 rounded-[18px] border border-[var(--line)] bg-[var(--panel)] p-2 shadow-[0_18px_44px_rgba(34,24,14,0.14)] ${
            openAbove ? "bottom-[calc(100%+10px)]" : "top-[calc(100%+10px)]"
          }`}
          ref={desktopMenuRef}
        >
          <div aria-label="정렬 기준" className="space-y-1" role="listbox">
            {options.map((option) => {
              const isSelected = option.value === selectedValue;

              return (
                <button
                  aria-selected={isSelected}
                  className={`flex min-h-12 w-full items-center justify-between rounded-[12px] px-3 py-3 text-sm font-semibold ${
                    isSelected
                      ? "bg-[var(--foreground)] text-white"
                      : "text-[var(--muted)] hover:bg-white/70"
                  }`}
                  key={`desktop-${option.value}`}
                  onClick={() => onSelect(option.value)}
                  role="option"
                  type="button"
                >
                  <span>{option.label}</span>
                  {isSelected ? (
                    <span aria-hidden="true" className="text-white/88">
                      현재
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 16 16"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

function ThemeSectionSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-40 animate-pulse rounded-full bg-white/70" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div
            key={index}
            className="glass-panel min-h-72 animate-pulse rounded-[16px] bg-white/60"
          />
        ))}
      </div>
    </div>
  );
}

function RecipeListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-32 animate-pulse rounded-full bg-white/70" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="glass-panel min-h-72 animate-pulse rounded-[16px] bg-white/60"
          />
        ))}
      </div>
    </div>
  );
}
