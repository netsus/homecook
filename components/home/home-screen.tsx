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

export function HomeScreen() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<RecipeSortKey>("view_count");
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [recipes, setRecipes] = useState<RecipeListData | null>(null);
  const [themes, setThemes] = useState<RecipeThemesData | null>(null);
  const [isIngredientModalOpen, setIngredientModalOpen] = useState(false);
  const recipeRequestIdRef = useRef(0);
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

      const [recipeResult, themeResult] = await Promise.allSettled([
        fetchJson<RecipeListData>(`/api/v1/recipes?${params}`),
        fetchJson<RecipeThemesData>("/api/v1/recipes/themes"),
      ]);

      if (currentRequestId !== recipeRequestIdRef.current) {
        return;
      }

      if (recipeResult.status === "rejected") {
        throw recipeResult.reason;
      }

      const recipeData = recipeResult.value;
      const themeData =
        themeResult.status === "fulfilled"
          ? themeResult.value
          : { themes: [] };

      setRecipes(recipeData);
      setThemes(themeData);

      const hasQuery = debouncedQuery.trim().length > 0;
      const hasVisibleThemes =
        !hasQuery &&
        appliedIngredientIds.length === 0 &&
        themeData.themes.length > 0;
      const hasRecipes = recipeData.items.length > 0;

      setScreenState(hasRecipes || hasVisibleThemes ? "ready" : "empty");
    } catch {
      if (currentRequestId !== recipeRequestIdRef.current) {
        return;
      }

      setRecipes(null);
      setThemes(null);
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
  const listTitle = hasActiveFilters ? "검색 결과" : "모든 레시피";

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

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_320px]">
        <section className="space-y-6">
          <div className="glass-panel overflow-hidden rounded-[20px]">
            <div className="relative border-b border-[var(--line)] px-5 py-6 md:px-6">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top_left,rgba(255,108,60,0.18),transparent_60%),radial-gradient(circle_at_top_right,rgba(46,166,122,0.16),transparent_58%)]" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
                  Home / Discovery
                </p>
                <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] text-[var(--foreground)] md:text-[2rem]">
                  오늘 만들 집밥을 바로 찾으세요
                </h2>
                <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
                  제목 검색, 정렬 변경, 테마 탐색에 재료 필터까지 더해 한 화면에서
                  바로 저녁 메뉴를 좁혀볼 수 있게 정리했습니다.
                </p>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto_180px] md:items-center">
                <label className="flex min-h-14 items-center rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-4 shadow-[var(--shadow)]">
                  <span className="visually-hidden">레시피 제목 검색</span>
                  <input
                    className="w-full bg-transparent py-4 outline-none placeholder:text-[var(--muted)]"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="레시피 제목 검색"
                    value={query}
                  />
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className={`min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      hasIngredientFilter
                        ? "border-[var(--olive)] bg-[var(--olive)] text-white"
                        : "border-[var(--olive)] text-[var(--olive)] hover:bg-[color:rgba(46,166,122,0.08)]"
                    }`}
                    onClick={() => setIngredientModalOpen(true)}
                    type="button"
                  >
                    {hasIngredientFilter
                      ? `재료로 검색 (${appliedIngredientIds.length})`
                      : "재료로 검색"}
                  </button>
                  {hasIngredientFilter ? (
                    <button
                      className="min-h-11 rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm font-semibold text-[var(--muted)]"
                      onClick={clearIngredientFilters}
                      type="button"
                    >
                      필터 초기화
                    </button>
                  ) : null}
                </div>
                <label className="min-h-11 rounded-[12px] border border-[var(--line)] bg-[var(--surface)] px-4 shadow-[var(--shadow)]">
                  <span className="visually-hidden">정렬 기준</span>
                  <select
                    aria-label="정렬 기준"
                    className="min-h-11 w-full bg-transparent outline-none"
                    onChange={(event) =>
                      setSort(event.target.value as RecipeSortKey)
                    }
                    value={sort}
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {hasIngredientFilter ? (
                <p className="mt-3 rounded-[12px] bg-[color:rgba(46,166,122,0.08)] px-4 py-3 text-sm text-[var(--olive)]">
                  {appliedIngredientIds.length}개 재료로 레시피를 좁혀보고 있어요.
                </p>
              ) : null}
            </div>
          </div>

          {screenState === "loading" ? (
            <div className="space-y-6">
              <ThemeSectionSkeleton />
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
            </div>
          ) : null}

          {screenState === "error" ? (
            <ContentState
              actionLabel="다시 시도"
              description="Supabase 연결이나 API 설정을 확인한 뒤 다시 불러올 수 있어요."
              onAction={() => void loadRecipes()}
              title="레시피를 불러오지 못했어요"
            />
          ) : null}

          {screenState === "empty" ? (
            <ContentState
              actionLabel={hasIngredientFilter ? "필터 초기화" : "검색 초기화"}
              description="조건에 맞는 레시피가 없어요."
              onAction={hasIngredientFilter ? clearIngredientFilters : clearSearch}
              title="다른 조합을 찾아보세요"
            />
          ) : null}

          {screenState !== "loading" && visibleThemes.length > 0 ? (
            <div className="space-y-8">
              {visibleThemes.map((theme) => (
                <ThemeSection key={theme.id} theme={theme} />
              ))}
            </div>
          ) : null}

          {screenState !== "loading" ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--olive)]">
                    Recipe List
                  </p>
                  <h3 className="text-xl font-extrabold tracking-[-0.02em] text-[var(--foreground)]">
                    {listTitle}
                  </h3>
                </div>
                <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-semibold text-[var(--muted)]">
                  {recipes?.items.length ?? 0}개
                </span>
              </div>

              {screenState === "ready" && recipes?.items.length ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {recipes.items.map((recipe) => (
                    <RecipeCard key={recipe.id} recipe={recipe} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <aside className="space-y-4">
          <div className="glass-panel rounded-[20px] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
              Slice Scope
            </p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-[var(--muted)]">
              <li>HOME 목록 + 테마 조회</li>
              <li>제목 검색</li>
              <li>재료 필터 모달</li>
              <li>정렬 변경</li>
              <li>RECIPE_DETAIL 조회</li>
            </ul>
          </div>
          <div className="glass-panel rounded-[20px] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
              Current Filters
            </p>
            <dl className="mt-4 space-y-3 text-sm text-[var(--muted)]">
              <div className="flex justify-between gap-4">
                <dt>검색어</dt>
                <dd className="font-semibold text-[var(--foreground)]">
                  {debouncedQuery.trim() || "없음"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>재료 필터</dt>
                <dd className="font-semibold text-[var(--foreground)]">
                  {hasIngredientFilter ? `${appliedIngredientIds.length}개 선택` : "없음"}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>정렬</dt>
                <dd className="font-semibold text-[var(--foreground)]">
                  {SORT_OPTIONS.find((option) => option.value === sort)?.label}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>목록 상태</dt>
                <dd className="font-semibold text-[var(--foreground)]">
                  {screenState}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>테마 섹션</dt>
                <dd className="font-semibold text-[var(--foreground)]">
                  {visibleThemes.length ? `${visibleThemes.length}개` : "숨김"}
                </dd>
              </div>
            </dl>
          </div>
        </aside>
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
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--olive)]">
            Theme
          </p>
          <h3 className="text-xl font-extrabold tracking-[-0.02em] text-[var(--foreground)]">
            {theme.title}
          </h3>
        </div>
        <span className="text-sm font-medium text-[var(--muted)]">더보기</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {theme.recipes.map((recipe) => (
          <RecipeCard key={`${theme.id}-${recipe.id}`} recipe={recipe} />
        ))}
      </div>
    </section>
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
