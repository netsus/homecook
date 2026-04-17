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
import { formatRecipeSourceLabel } from "@/lib/recipe";
import { useDiscoveryFilterStore } from "@/stores/discovery-filter-store";
import type {
  RecipeCardItem,
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
    "flex min-h-11 items-center justify-between gap-3 whitespace-nowrap rounded-full border border-[var(--line)] bg-white/92 px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)] shadow-[0_10px_24px_rgba(34,24,14,0.08)]";

  return (
    <>
      <div className="mx-auto max-w-5xl space-y-7">
        <section className="space-y-6">
          {/* ── Discovery panel ─────────────────────────────────── */}
          <div className="glass-panel rounded-[24px] border-white/55 bg-white/76 px-4 py-4 md:rounded-[28px] md:px-5 md:py-5">
            <div className="space-y-3">
              {/* Search bar */}
              <label className="flex min-h-14 items-center rounded-[16px] border border-[var(--line)] bg-white px-4 shadow-[0_12px_28px_rgba(34,24,14,0.06)]">
                <span className="visually-hidden">레시피 제목 검색</span>
                <input
                  className="w-full bg-transparent py-4 outline-none placeholder:text-[var(--muted)]"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="레시피 제목 검색"
                  value={query}
                />
              </label>

              {/* Ingredient filter — standalone row below search */}
              <button
                className={`min-h-11 w-full rounded-[14px] border px-5 py-2.5 text-sm font-semibold transition sm:w-auto ${
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

              {/* Active filter summary bar */}
              {hasIngredientFilter ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[color:rgba(46,166,122,0.14)] bg-[color:rgba(46,166,122,0.08)] px-4 py-3">
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

          {/* ── Error state ─────────────────────────────────────── */}
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

          {/* ── Loading skeleton ────────────────────────────────── */}
          {showInitialDiscoverySkeleton ? (
            <div className="space-y-6">
              <ThemeCarouselSkeleton />
              <RecipeListSkeleton />
            </div>
          ) : null}

          {/* ── Theme carousel strips ───────────────────────────── */}
          {!showInitialDiscoverySkeleton && visibleThemes.length > 0 ? (
            <div className="space-y-6">
              {visibleThemes.map((theme) => (
                <ThemeCarouselStrip key={theme.id} theme={theme} />
              ))}
            </div>
          ) : null}

          {/* ── 모든 레시피 section ─────────────────────────────── */}
          {screenState !== "error" && !showInitialDiscoverySkeleton ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[1.15rem] font-extrabold tracking-[-0.025em] text-[var(--foreground)] md:text-[1.35rem]">
                  {listTitle}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
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

// ── Theme Carousel Strip ────────────────────────────────────────────────────

function ThemeCarouselStrip({ theme }: { theme: RecipeTheme }) {
  return (
    <section aria-label={theme.title} data-testid="theme-carousel">
      {/* Compact section header */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-extrabold tracking-[-0.02em] text-[var(--foreground)]">
          {theme.title}
        </h2>
        <span className="text-xs font-semibold text-[var(--muted)]">
          {theme.recipes.length}개
        </span>
      </div>

      {/* Horizontal scroll strip with right-fade affordance */}
      <div className="relative">
        <div
          className="scrollbar-hide flex gap-3 overflow-x-auto overscroll-x-contain pb-1"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {theme.recipes.map((recipe) => (
            <ThemeCarouselCard
              key={`${theme.id}-${recipe.id}`}
              recipe={recipe}
            />
          ))}
        </div>
        {/* Right-side gradient hint — indicates more content beyond edge */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-10 rounded-r-[12px] bg-gradient-to-l from-[var(--background,#fff9f2)] to-transparent"
        />
      </div>
    </section>
  );
}

function ThemeCarouselCard({ recipe }: { recipe: RecipeCardItem }) {
  return (
    <a
      className="block shrink-0 overflow-hidden rounded-[12px] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(34,24,14,0.12)]"
      href={`/recipe/${recipe.id}`}
      style={{ scrollSnapAlign: "start", width: "200px" }}
    >
      {/* Compact thumbnail */}
      <div
        className="relative border-b border-[var(--line)] bg-[linear-gradient(135deg,rgba(255,108,60,0.22),rgba(255,249,242,0.85),rgba(46,166,122,0.18))]"
        style={
          recipe.thumbnail_url
            ? {
                backgroundImage: `linear-gradient(rgba(26,26,46,0.06),rgba(26,26,46,0.22)),url(${recipe.thumbnail_url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                height: "88px",
              }
            : { height: "88px" }
        }
      >
        <span className="absolute left-2 top-2 rounded-full bg-[var(--panel)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--brand-deep)]">
          {formatRecipeSourceLabel(recipe.source_type)}
        </span>
      </div>
      {/* Title */}
      <div className="px-3 py-2.5">
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--foreground)]">
          {recipe.title}
        </p>
      </div>
    </a>
  );
}

// ── Sort Menu ───────────────────────────────────────────────────────────────

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
          "flex min-h-11 items-center justify-between gap-3 whitespace-nowrap rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-left text-sm font-semibold text-[var(--foreground)] shadow-[var(--shadow)]"
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
            {/* D2: no eyebrow · D3: icon-only close */}
            <div className="mt-4 flex items-start justify-between gap-3">
              <h2 className="text-xl font-extrabold tracking-[-0.02em] text-[var(--foreground)]">
                정렬 기준
              </h2>
              <button
                aria-label="닫기"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--muted)] hover:bg-white/60"
                onClick={onClose}
                type="button"
              >
                <svg fill="none" height="18" viewBox="0 0 18 18" width="18" xmlns="http://www.w3.org/2000/svg">
                  <path d="M4 4L14 14M14 4L4 14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
                </svg>
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
                    className={`flex min-h-14 w-full items-center rounded-[16px] px-4 py-3 text-left text-sm font-semibold ${
                      isSelected
                        ? "bg-[color:rgba(46,166,122,0.12)] text-[var(--olive)]"
                        : "border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]"
                    }`}
                    key={`mobile-${option.value}`}
                    onClick={() => onSelect(option.value)}
                    role="option"
                    type="button"
                  >
                    <span>{option.label}</span>
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
                  className={`flex min-h-12 w-full items-center rounded-[12px] px-3 py-3 text-sm font-semibold ${
                    isSelected
                      ? "bg-[color:rgba(46,166,122,0.12)] text-[var(--olive)]"
                      : "text-[var(--muted)] hover:bg-white/70"
                  }`}
                  key={`desktop-${option.value}`}
                  onClick={() => onSelect(option.value)}
                  role="option"
                  type="button"
                >
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Icons ───────────────────────────────────────────────────────────────────

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

// ── Skeletons ───────────────────────────────────────────────────────────────

function ThemeCarouselSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-5 w-36 animate-pulse rounded-full bg-white/70" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-[128px] w-[200px] shrink-0 animate-pulse rounded-[12px] bg-white/60"
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
