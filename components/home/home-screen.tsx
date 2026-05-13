"use client";
import React from "react";
import Link from "next/link";
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
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import { Skeleton } from "@/components/ui/skeleton";
import { SortDropdown } from "@/components/ui/sort-dropdown";
import { fetchJson } from "@/lib/api/fetch-json";
import { useDiscoveryFilterStore } from "@/stores/discovery-filter-store";
import type {
  IngredientItem,
  IngredientListData,
  RecipeListData,
  RecipeSortKey,
  RecipeTheme,
  RecipeThemesData,
} from "@/types/recipe";

const SORT_OPTIONS: Array<{ label: string; value: RecipeSortKey }> = [
  { label: "조회수순", value: "view_count" },
  { label: "최신순", value: "latest" },
  { label: "저장순", value: "save_count" },
  { label: "플래너 등록순", value: "plan_count" },
];

type ScreenState = "loading" | "ready" | "empty" | "error";
type AsyncState = "loading" | "ready";

export function HomeScreen() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<RecipeSortKey>("view_count");
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [themeState, setThemeState] = useState<AsyncState>("loading");
  const [ingredientState, setIngredientState] = useState<AsyncState>("loading");
  const [recipes, setRecipes] = useState<RecipeListData | null>(null);
  const [themes, setThemes] = useState<RecipeThemesData | null>(null);
  const [quickIngredients, setQuickIngredients] = useState<IngredientItem[]>([]);
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
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
  const isDesktopViewport = useDesktopViewport();
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

  const loadQuickIngredients = useCallback(async () => {
    try {
      const ingredientData = await fetchJson<IngredientListData>("/api/v1/ingredients");
      setQuickIngredients(ingredientData.items.slice(0, 8));
    } catch {
      setQuickIngredients([]);
    } finally {
      setIngredientState("ready");
    }
  }, []);

  useEffect(() => {
    void loadQuickIngredients();
  }, [loadQuickIngredients]);

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
      setScreenState(recipeData.items.length > 0 ? "ready" : "empty");
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
  const selectedTheme = useMemo(
    () => themes?.themes.find((theme) => theme.id === activeThemeId) ?? null,
    [activeThemeId, themes],
  );
  const displayedRecipes = selectedTheme?.recipes ?? recipes?.items ?? [];
  const listTitle = selectedTheme
    ? selectedTheme.title
    : hasActiveFilters
      ? "검색 결과"
      : "모든 레시피";
  const showInitialDiscoverySkeleton =
    !hasActiveFilters && themeState === "loading";
  const showEmptyState = screenState === "empty" && displayedRecipes.length === 0;

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
      setActiveThemeId(null);
    },
    [setAppliedIngredientIds],
  );

  const toggleQuickIngredient = useCallback(
    (ingredientId: string) => {
      setAppliedIngredientIds(
        appliedIngredientIds.includes(ingredientId)
          ? appliedIngredientIds.filter((currentId) => currentId !== ingredientId)
          : [...appliedIngredientIds, ingredientId],
      );
      setActiveThemeId(null);
    },
    [appliedIngredientIds, setAppliedIngredientIds],
  );

  const selectSort = useCallback((nextSort: string) => {
    setSort(nextSort as RecipeSortKey);
    setActiveThemeId(null);
  }, []);

  const ingredientFilterModal = (
    <IngredientFilterModal
      appliedIngredientIds={appliedIngredientIds}
      isOpen={isIngredientModalOpen}
      onApply={applyIngredientFilter}
      onClose={() => setIngredientModalOpen(false)}
    />
  );
  const shouldRenderWebView =
    process.env.NODE_ENV !== "test" || isDesktopViewport;
  const shouldRenderAppView =
    process.env.NODE_ENV !== "test" || !isDesktopViewport;

  return (
    <>
      {shouldRenderWebView ? (
      <div className="hidden lg:block">
        <HomeWebScreen
          appliedIngredientIds={appliedIngredientIds}
          clearIngredientFilters={clearIngredientFilters}
          clearSearch={clearSearch}
          displayedRecipes={displayedRecipes}
          hasIngredientFilter={hasIngredientFilter}
          ingredientState={ingredientState}
          listTitle={listTitle}
          onOpenIngredientModal={() => setIngredientModalOpen(true)}
          onRetry={() => void loadRecipes()}
          onSelectSort={selectSort}
          onToggleQuickIngredient={toggleQuickIngredient}
          query={query}
          quickIngredients={quickIngredients}
          screenState={screenState}
          selectedTheme={selectedTheme}
          setActiveThemeId={setActiveThemeId}
          setQuery={setQuery}
          sort={sort}
          themes={themes?.themes ?? []}
          totalRecipeCount={recipes?.items.length ?? 0}
        />
      </div>
      ) : null}
      {shouldRenderAppView ? (
      <div
        className="min-h-screen bg-white text-[#212529] lg:hidden"
        style={
          {
            "--home-mint": "#2AC1BC",
            "--home-mint-deep": "#007A76",
            "--home-mint-soft": "#E6F8F7",
            "--home-bg": "#FFFFFF",
            "--home-ink": "#212529",
          } as React.CSSProperties
        }
      >
        <div className="mx-auto flex min-h-screen max-w-[430px] flex-col bg-white pb-[calc(86px+env(safe-area-inset-bottom))] shadow-[0_0_0_1px_rgba(33,37,41,0.04)]">
          <HomeAppBar />

          <div className="pb-[100px]">
            {/* Hero greeting */}
            <div className="bg-white px-4 pb-3 pt-5">
              <div className="mb-0.5 text-[14px] text-[#495057]">목요일 저녁,</div>
              <h1 className="text-[22px] font-bold leading-[1.2] text-[#212529]" style={{ fontFamily: "var(--font-jua), -apple-system, sans-serif" }}>
                오늘은 뭐 해먹지?
              </h1>
            </div>

            {/* Search */}
            <div className="px-4 pb-3 pt-1">
              <label className="flex h-[44px] items-center gap-2 rounded-[20px] bg-[#F8F9FA] px-4">
                <SearchIcon />
                <span className="visually-hidden">레시피 제목 검색</span>
                <input
                  className="w-full bg-transparent text-[14px] text-[#212529] outline-none placeholder:text-[#868E96]"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveThemeId(null);
                  }}
                  placeholder="김치볶음밥, 된장찌개…"
                  value={query}
                  style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif' }}
                />
              </label>
            </div>

            {screenState === "error" ? (
              <div className="px-4 pb-4">
                <ContentState
                  actionLabel="다시 시도"
                  description="Supabase 연결이나 API 설정을 확인한 뒤 다시 불러올 수 있어요."
                  eyebrow="목록 동기화 오류"
                  onAction={() => void loadRecipes()}
                  tone="error"
                  title="레시피를 불러오지 못했어요"
                />
              </div>
            ) : null}

            {showInitialDiscoverySkeleton ? (
              <div className="space-y-4 px-4">
                <ThemeCarouselSkeleton />
                <RecipeListSkeleton />
              </div>
            ) : null}

            {!showInitialDiscoverySkeleton && (themes?.themes.length ?? 0) > 0 ? (
              <ThemeCarousel
                activeThemeId={activeThemeId}
                onSelectTheme={(themeId) => setActiveThemeId(themeId)}
                themes={themes?.themes ?? []}
              />
            ) : null}

            {!showInitialDiscoverySkeleton ? <PromoStrip /> : null}

            {screenState !== "error" && !showInitialDiscoverySkeleton ? (
              <section aria-label={listTitle}>
                {/* Section header with sort */}
                <div className="flex items-center justify-between px-4 pb-2">
                  <div className="flex items-baseline gap-1.5">
                    <h2 className="text-[18px] font-bold text-[#212529]">
                      {listTitle}
                    </h2>
                    <span className="text-[14px] font-medium text-[#495057]">
                      ({displayedRecipes.length})
                    </span>
                  </div>
                  {recipes?.items.length ? (
                    <SortDropdown
                      label="정렬 기준"
                      onChange={selectSort}
                      options={SORT_OPTIONS}
                      value={sort}
                    />
                  ) : null}
                </div>

                {/* Quick ingredient chip rail */}
                <div className="pb-2.5">
                  <QuickIngredientRail
                    appliedIngredientIds={appliedIngredientIds}
                    ingredients={quickIngredients}
                    isLoading={ingredientState === "loading"}
                    onClear={clearIngredientFilters}
                    onOpenModal={() => setIngredientModalOpen(true)}
                    onToggle={toggleQuickIngredient}
                  />
                </div>

                {screenState === "loading" ? <div className="px-4"><RecipeListSkeleton /></div> : null}

                {screenState === "ready" && displayedRecipes.length ? (
                  <div className="grid grid-cols-1 gap-4 px-4">
                    {displayedRecipes.map((recipe) => (
                      <RecipeCard key={recipe.id} recipe={recipe} />
                    ))}
                  </div>
                ) : null}

                {showEmptyState ? (
                  <div className="px-4">
                    <ContentState
                      actionLabel={hasIngredientFilter ? "초기화" : "검색 초기화"}
                      description="조건에 맞는 레시피가 없어요."
                      eyebrow="다른 조합"
                      tone="empty"
                      onAction={hasIngredientFilter ? clearIngredientFilters : clearSearch}
                      title="다른 조합을 찾아보세요"
                    />
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          <HomeBottomTab />
        </div>
      </div>
      ) : null}
      {ingredientFilterModal}
    </>
  );
}

function HomeWebScreen({
  appliedIngredientIds,
  clearIngredientFilters,
  clearSearch,
  displayedRecipes,
  hasIngredientFilter,
  ingredientState,
  listTitle,
  onOpenIngredientModal,
  onRetry,
  onSelectSort,
  onToggleQuickIngredient,
  query,
  quickIngredients,
  screenState,
  selectedTheme,
  setActiveThemeId,
  setQuery,
  sort,
  themes,
  totalRecipeCount,
}: {
  appliedIngredientIds: string[];
  clearIngredientFilters: () => void;
  clearSearch: () => void;
  displayedRecipes: RecipeListData["items"];
  hasIngredientFilter: boolean;
  ingredientState: AsyncState;
  listTitle: string;
  onOpenIngredientModal: () => void;
  onRetry: () => void;
  onSelectSort: (nextSort: string) => void;
  onToggleQuickIngredient: (ingredientId: string) => void;
  query: string;
  quickIngredients: IngredientItem[];
  screenState: ScreenState;
  selectedTheme: RecipeTheme | null;
  setActiveThemeId: (themeId: string | null) => void;
  setQuery: (query: string) => void;
  sort: RecipeSortKey;
  themes: RecipeTheme[];
  totalRecipeCount: number;
}) {
  const showEmptyState = screenState === "empty" && displayedRecipes.length === 0;

  return (
    <div className="min-h-screen bg-[var(--surface-fill)] text-[var(--foreground)]">
      <div className="mx-auto max-w-[1200px] px-8 pb-16 pt-8">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-[24px] border border-[var(--line)] bg-[var(--panel)] p-8 shadow-[var(--shadow-1)]">
            <div className="max-w-2xl">
              <p className="text-xs font-bold tracking-[-0.3px] text-[var(--foreground)]">
                레시피 탐색
              </p>
              <h1 className="mt-3 text-[42px] font-black leading-[1.08] tracking-[-0.02em] text-[var(--foreground)]">
                오늘 뭐 먹지?
              </h1>
              <p className="mt-3 text-base leading-7 text-[var(--text-2)]">
                레시피 제목으로 찾고, 재료 필터로 지금 만들 수 있는 메뉴를 좁혀보세요.
              </p>
            </div>

            <div className="mt-7 flex gap-3">
              <label className="flex min-h-14 flex-1 items-center gap-3 rounded-[18px] border border-[var(--line)] bg-[var(--surface)] px-5 shadow-[var(--shadow-1)] focus-within:border-[var(--brand)]">
                <SearchIcon />
                <span className="visually-hidden">레시피 제목 검색</span>
                <input
                  className="w-full bg-transparent text-[15px] font-medium outline-none placeholder:text-[var(--muted)]"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveThemeId(null);
                  }}
                  placeholder="레시피 제목 검색"
                  value={query}
                />
              </label>
              <button
                className="inline-flex min-h-14 items-center gap-2 rounded-[18px] bg-[var(--foreground)] px-5 text-sm font-bold text-white shadow-[var(--shadow-1)] transition hover:bg-[var(--brand-deep)]"
                onClick={onOpenIngredientModal}
                type="button"
              >
                <SearchSmallIcon color="currentColor" />
                재료로 검색
              </button>
            </div>

            <div className="mt-5">
              <QuickIngredientRail
                appliedIngredientIds={appliedIngredientIds}
                ingredients={quickIngredients}
                isLoading={ingredientState === "loading"}
                onClear={clearIngredientFilters}
                onOpenModal={onOpenIngredientModal}
                onToggle={onToggleQuickIngredient}
              />
            </div>
          </div>

          <div className="rounded-[24px] border border-[var(--line)] bg-[var(--panel)] p-6 shadow-[var(--shadow-1)]">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
              이번 주 식단
            </p>
            <h2 className="mt-3 text-2xl font-black tracking-[-0.02em]">
              플래너로 이어가기
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-2)]">
              마음에 드는 레시피를 저장하고 바로 끼니에 연결할 수 있어요.
            </p>
            <Link
              className="mt-6 inline-flex w-full items-center justify-center rounded-[16px] bg-[var(--foreground)] px-4 py-3 text-sm font-bold text-white transition hover:bg-[var(--brand-deep)]"
              href="/planner"
              prefetch={false}
            >
              플래너 열기
            </Link>
          </div>
        </section>

        {themes.length > 0 ? (
          <section className="mt-10">
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="text-2xl font-black tracking-[-0.02em]">
                  이번 주 인기 테마
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  사진 중심 카드로 빠르게 둘러보세요.
                </p>
              </div>
              {selectedTheme ? (
                <button
                  className="rounded-[var(--radius-full)] border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm font-bold text-[var(--text-2)]"
                  onClick={() => setActiveThemeId(null)}
                  type="button"
                >
                  전체 보기
                </button>
              ) : null}
            </div>
            <div className="grid gap-4 lg:grid-cols-4">
              {themes.slice(0, 4).map((theme, index) => (
                <button
                  aria-pressed={selectedTheme?.id === theme.id}
                  className={[
                    "group overflow-hidden rounded-[18px] border bg-[var(--panel)] text-left shadow-[var(--shadow-1)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_26px_rgba(0,0,0,0.10)]",
                    selectedTheme?.id === theme.id
                      ? "border-[var(--brand)]"
                      : "border-[var(--line)]",
                  ].join(" ")}
                  key={theme.id}
                  onClick={() => setActiveThemeId(theme.id)}
                  type="button"
                >
                  <div
                    className="relative aspect-[4/3] overflow-hidden bg-[#EAEDEF]"
                    style={
                      theme.recipes[0]?.thumbnail_url
                        ? {
                            backgroundImage: `url(${theme.recipes[0].thumbnail_url})`,
                            backgroundPosition: "center",
                            backgroundSize: "cover",
                          }
                        : undefined
                    }
                  >
                    {theme.recipes[0]?.thumbnail_url ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 bg-cover bg-center transition duration-300 group-hover:scale-105"
                        style={{
                          backgroundImage: `url(${theme.recipes[0].thumbnail_url})`,
                        }}
                      />
                    ) : (
                      <span className="grid h-full place-items-center text-5xl">
                        {["🍳", "🥘", "🥗", "🍚"][index % 4]}
                      </span>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent p-4 text-white">
                      <div className="text-lg font-black">{theme.title}</div>
                      <div className="mt-1 text-xs font-semibold opacity-85">
                        {theme.recipes.length}개 레시피
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black tracking-[-0.02em]">
                {listTitle}
              </h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {displayedRecipes.length}개 표시
                {totalRecipeCount ? ` · 전체 ${totalRecipeCount}개` : ""}
              </p>
            </div>
            <SortDropdown
              label="정렬 기준"
              onChange={onSelectSort}
              options={SORT_OPTIONS}
              value={sort}
            />
          </div>

          {screenState === "loading" ? (
            <RecipeGridSkeleton />
          ) : null}

          {screenState === "error" ? (
            <ContentState
              actionLabel="다시 시도"
              description="네트워크 연결이나 API 설정을 확인한 뒤 다시 불러올 수 있어요."
              eyebrow="목록 동기화 오류"
              onAction={onRetry}
              tone="error"
              title="레시피를 불러오지 못했어요"
            />
          ) : null}

          {screenState === "ready" && displayedRecipes.length ? (
            <div className="grid gap-5 lg:grid-cols-4">
              {displayedRecipes.map((recipe) => (
                <RecipeCard key={recipe.id} recipe={recipe} />
              ))}
            </div>
          ) : null}

          {showEmptyState ? (
            <ContentState
              actionLabel={hasIngredientFilter ? "초기화" : "검색 초기화"}
              description="다른 키워드나 재료 조합으로 다시 찾아보세요."
              eyebrow="다른 조합"
              onAction={hasIngredientFilter ? clearIngredientFilters : clearSearch}
              tone="empty"
              title="조건에 맞는 레시피가 없어요"
            />
          ) : null}
        </section>
      </div>
    </div>
  );
}

function RecipeGridSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          className="overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--panel)]"
          key={`web-recipe-skeleton-${index}`}
        >
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="space-y-3 p-4">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-7 w-full rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function HomeAppBar() {
  return (
    <header className="sticky top-0 z-20 flex min-h-[52px] items-center justify-center border-b border-[#DEE2E6] bg-white px-4" style={{ borderBottomWidth: '0.5px' }}>
      <div
        aria-label="homecook_"
        className="text-[22px] font-bold tracking-[0.5px]"
        style={{ fontFamily: "var(--font-jua), -apple-system, sans-serif" }}
      >
        <span className="text-[#008F8A]">homecook</span>
        <span className="text-[#212529]">_</span>
      </div>
    </header>
  );
}

function QuickIngredientRail({
  appliedIngredientIds,
  ingredients,
  isLoading,
  onClear,
  onOpenModal,
  onToggle,
}: {
  appliedIngredientIds: string[];
  ingredients: IngredientItem[];
  isLoading: boolean;
  onClear: () => void;
  onOpenModal: () => void;
  onToggle: (ingredientId: string) => void;
}) {
  const hasFilters = appliedIngredientIds.length > 0;

  return (
    <div className="scrollbar-hide flex gap-2 overflow-x-auto px-4 pb-1">
      {/* "재료로 검색" button — prototype style */}
      <button
        className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-[13px] font-bold ${
          hasFilters
            ? "border-[#007A76] bg-[#007A76] text-white"
            : "border-[#007A76] bg-white text-[#007A76]"
        }`}
        onClick={onOpenModal}
        type="button"
      >
        <SearchSmallIcon color={hasFilters ? "#fff" : "#007A76"} />
        {hasFilters ? `재료 ${appliedIngredientIds.length}개` : "재료로 검색"}
      </button>

      {isLoading
        ? Array.from({ length: 4 }).map((_, index) => (
            <Skeleton
              className="h-11 w-16 shrink-0 rounded-full"
              key={`ingredient-skeleton-${index}`}
            />
          ))
        : ingredients.map((ingredient) => {
            const isActive = appliedIngredientIds.includes(ingredient.id);

            return (
              <button
                aria-pressed={isActive}
                className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium ${
                  isActive
                    ? "border border-[#007A76] bg-[#E6F8F7] text-[#007A76]"
                    : "border border-transparent bg-[#F8F9FA] text-[#495057]"
                }`}
                key={ingredient.id}
                onClick={() => onToggle(ingredient.id)}
                type="button"
              >
                <span aria-hidden="true" className="text-[14px]">
                  {ingredientEmoji(ingredient.standard_name)}
                </span>
                {ingredient.standard_name}
              </button>
            );
          })}

      {hasFilters ? (
        <button
          className="flex h-11 shrink-0 items-center rounded-full border border-[#DEE2E6] bg-white px-3.5 text-[13px] font-medium text-[#495057]"
          onClick={onClear}
          type="button"
        >
          초기화
        </button>
      ) : null}
    </div>
  );
}

function ingredientEmoji(name: string) {
  if (/밥|면|쌀|국수|밀가루/.test(name)) return "🍚";
  if (/고기|소고기|돼지|닭|육류/.test(name)) return "🥩";
  if (/생선|해산|멸치|연어|새우/.test(name)) return "🐟";
  if (/계란|달걀|두부/.test(name)) return "🥚";
  if (/김치/.test(name)) return "🥬";
  return "🥕";
}

function ThemeCarousel({
  activeThemeId,
  onSelectTheme,
  themes,
}: {
  activeThemeId: string | null;
  onSelectTheme: (themeId: string) => void;
  themes: RecipeTheme[];
}) {
  return (
    <section aria-label="테마별 레시피" className="pb-4 pt-2">
      <div className="flex items-baseline justify-between px-4 pb-3">
        <h2 className="text-[18px] font-bold text-[#212529]">테마별 레시피</h2>
        <span className="text-[12px] text-[#495057]">전체보기 ›</span>
      </div>
      <div className="scrollbar-hide flex gap-2.5 overflow-x-auto px-4 pb-1">
        {themes.map((theme, index) => (
          <ThemeCarouselCard
            isActive={activeThemeId === theme.id}
            key={theme.id}
            onClick={() => onSelectTheme(theme.id)}
            theme={theme}
            variantIndex={index}
          />
        ))}
      </div>
    </section>
  );
}

function ThemeCarouselCard({
  isActive,
  onClick,
  theme,
  variantIndex,
}: {
  isActive: boolean;
  onClick: () => void;
  theme: RecipeTheme;
  variantIndex: number;
}) {
  const THEME_BGS = ["#FFE8DC", "#E8F5FF", "#E8F8E0", "#FFEBEB", "#F3E8FF"];
  const emoji = ["🍳", "🏠", "🥗", "🍚", "🍷"][variantIndex % 5];

  return (
    <button
      aria-pressed={isActive}
      className={`relative flex h-[92px] w-[140px] shrink-0 flex-col justify-between overflow-hidden rounded-[14px] p-3 text-left ${
        isActive ? "ring-2 ring-[#2AC1BC]" : ""
      }`}
      onClick={onClick}
      style={{
        background: THEME_BGS[variantIndex % THEME_BGS.length],
        boxShadow: "0px 1px 3px rgba(0,0,0,0.04)",
        border: isActive ? "2px solid #2AC1BC" : "2px solid transparent",
      }}
      type="button"
    >
      <span className="text-[30px] leading-none" aria-hidden="true">
        {emoji}
      </span>
      <span className="text-[14px] font-bold text-[#212529]" style={{ fontFamily: "var(--font-jua), -apple-system, sans-serif" }}>
        {theme.title}
      </span>
    </button>
  );
}

function PromoStrip() {
  return (
    <div className="px-4 pb-3">
      <Link
        className="flex items-center justify-between rounded-[12px] px-4 py-3 text-white"
        href="/planner"
        style={{
          background: "linear-gradient(135deg, #2AC1BC 0%, #12B886 100%)",
        }}
      >
        <span>
          <span className="block text-[12px] font-normal" style={{ opacity: 0.9 }}>
            이번 주 식단 플래너
          </span>
          <span className="mt-0.5 block text-[16px] font-bold" style={{ fontFamily: "var(--font-jua), -apple-system, sans-serif" }}>
            오늘 저녁까지 2끼 남았어요
          </span>
        </span>
        <span className="text-[32px]" aria-hidden="true">
          🍳
        </span>
      </Link>
    </div>
  );
}

function HomeBottomTab() {
  const tabs = [
    { href: "/", icon: <HomeIcon filled />, isActive: true, label: "홈" },
    { href: "/planner", icon: <CalendarIcon />, isActive: false, label: "플래너" },
  ];
  const pendingTabs = [
    { icon: <PantryIcon />, label: "팬트리" },
    { icon: <UserIcon />, label: "마이" },
  ];

  return (
    <nav
      aria-label="HOME 하단 탭"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[430px] bg-white px-4 pt-2"
      style={{
        borderTop: "0.5px solid #DEE2E6",
        paddingBottom: "calc(28px)",
      }}
    >
      <div className="grid grid-cols-4">
        {tabs.map((tab) => (
          <Link
            aria-current={tab.isActive ? "page" : undefined}
            className={`flex flex-col items-center justify-center gap-[3px] py-1 text-[11px] ${
              tab.isActive ? "font-bold" : "font-medium"
            }`}
            href={tab.href}
            key={tab.label}
            style={{ color: tab.isActive ? "#007A76" : "#495057" }}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </Link>
        ))}
        {pendingTabs.map((tab) => (
          <button
            className="flex flex-col items-center justify-center gap-[3px] py-1 text-[11px] font-medium"
            key={tab.label}
            style={{ color: "#495057" }}
            type="button"
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-[#495057]"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function SearchSmallIcon({ color }: { color: string }) {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke={color}
      strokeLinecap="round"
      strokeWidth="2"
      viewBox="0 0 20 20"
    >
      <circle cx="9" cy="9" r="6" />
      <path d="m14 14 3 3" />
    </svg>
  );
}

function HomeIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M7 3v3M17 3v3M4 8h16M5 5h14v15H5z" />
    </svg>
  );
}

function PantryIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M5 9h14v11H5z" />
      <path d="M8 9V6h8v3" />
      <path d="M9 13h6" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function ThemeCarouselSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-36 rounded-full" />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton
            key={index}
            className="h-[132px] w-[148px] shrink-0 rounded-[12px]"
          />
        ))}
      </div>
    </div>
  );
}

function RecipeListSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-32 rounded-full" />
      <div className="grid grid-cols-1 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton
            key={index}
            className="min-h-72 rounded-[12px]"
          />
        ))}
      </div>
    </div>
  );
}
