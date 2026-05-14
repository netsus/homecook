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
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { LoginGateModal } from "@/components/auth/login-gate-modal";
import { IngredientFilterModal } from "@/components/home/ingredient-filter-modal";
import { RecipeCard } from "@/components/home/recipe-card";
import { useHomeRecipeSaveFlow } from "@/components/home/use-home-recipe-save-flow";
import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { SaveModal } from "@/components/recipe/save-modal";
import { ContentState } from "@/components/shared/content-state";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import { Skeleton } from "@/components/ui/skeleton";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { SortDropdown } from "@/components/ui/sort-dropdown";
import { fetchJson } from "@/lib/api/fetch-json";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { useDiscoveryFilterStore } from "@/stores/discovery-filter-store";
import { useAuthGateStore } from "@/stores/ui-store";
import type {
  RecipeCardItem,
  RecipeListData,
  RecipeSaveData,
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

const RECIPE_CATEGORY_FILTERS = [
  { label: "전체", keywords: [] },
  { label: "다이어트", keywords: ["다이어트", "샐러드", "저칼로리", "닭가슴살"] },
  { label: "고단백", keywords: ["고단백", "단백질", "닭가슴살", "두부", "계란", "고기"] },
  { label: "저당·저탄수", keywords: ["저당", "저탄수", "키토", "샐러드", "두부"] },
  { label: "10분컷", keywords: ["10분", "10분컷", "간단", "초간단", "빠른"] },
  { label: "국물요리", keywords: ["국물", "국", "탕", "찌개", "전골"] },
  { label: "든든한메인", keywords: ["메인", "든든", "고기", "불고기", "갈비", "제육", "스테이크"] },
  { label: "밑반찬", keywords: ["반찬", "밑반찬", "나물", "무침", "볶음"] },
  { label: "도시락", keywords: ["도시락", "주먹밥", "김밥", "샌드위치"] },
  { label: "아이반찬", keywords: ["아이", "아이반찬", "어린이", "달걀", "계란"] },
  { label: "에어프라이어", keywords: ["에어프라이어", "구이", "튀김", "오븐"] },
  { label: "채식", keywords: ["채식", "비건", "채소", "버섯", "두부"] },
  { label: "손님상", keywords: ["손님상", "손님", "파티", "갈비", "찜", "구이"] },
] as const;

type RecipeCategoryLabel = (typeof RECIPE_CATEGORY_FILTERS)[number]["label"];

export function HomeScreen() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<RecipeSortKey>("view_count");
  const [activeRecipeCategory, setActiveRecipeCategory] =
    useState<RecipeCategoryLabel>("전체");
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [themeState, setThemeState] = useState<AsyncState>("loading");
  const [recipes, setRecipes] = useState<RecipeListData | null>(null);
  const [themes, setThemes] = useState<RecipeThemesData | null>(null);
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
  const [isIngredientModalOpen, setIngredientModalOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
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
  const openAuthGate = useAuthGateStore((state) => state.open);
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

  useEffect(() => {
    const e2eAuthOverride = readE2EAuthOverride();

    if (typeof e2eAuthOverride === "boolean") {
      setIsAuthenticated(e2eAuthOverride);
      return;
    }

    if (!hasSupabasePublicEnv()) {
      setIsAuthenticated(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();

    void supabase.auth
      .getSession()
      .then((result: { data: { session: Session | null } }) => {
        setIsAuthenticated(Boolean(result.data.session));
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setIsAuthenticated(Boolean(session));
      },
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

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
  const hasRecipeCategoryFilter = activeRecipeCategory !== "전체";
  const hasActiveFilters = hasQuery || hasIngredientFilter || hasRecipeCategoryFilter;
  const selectedTheme = useMemo(
    () => themes?.themes.find((theme) => theme.id === activeThemeId) ?? null,
    [activeThemeId, themes],
  );
  const displayedRecipes = useMemo(
    () =>
      filterRecipesByCategory(
        selectedTheme?.recipes ?? recipes?.items ?? [],
        activeRecipeCategory,
      ),
    [activeRecipeCategory, recipes?.items, selectedTheme?.recipes],
  );
  const listTitle = selectedTheme
    ? selectedTheme.title
    : hasRecipeCategoryFilter
      ? activeRecipeCategory
      : hasActiveFilters
      ? "검색 결과"
      : "모든 레시피";
  const showInitialDiscoverySkeleton =
    !hasActiveFilters && themeState === "loading";
  const showEmptyState =
    (screenState === "ready" || screenState === "empty") &&
    displayedRecipes.length === 0;
  const emptyStateActionLabel =
    hasQuery && !hasIngredientFilter && !hasRecipeCategoryFilter && !selectedTheme
      ? "검색 초기화"
      : "초기화";

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

  const selectSort = useCallback((nextSort: string) => {
    setSort(nextSort as RecipeSortKey);
    setActiveThemeId(null);
  }, []);

  const selectTheme = useCallback((themeId: string) => {
    setActiveThemeId((currentThemeId) =>
      currentThemeId === themeId ? null : themeId,
    );
  }, []);

  const selectRecipeCategory = useCallback((category: RecipeCategoryLabel) => {
    setActiveRecipeCategory(category);
  }, []);

  const updateRecipeSaveState = useCallback((recipeId: string, result: RecipeSaveData) => {
    setRecipes((currentRecipes) => {
      if (!currentRecipes) {
        return currentRecipes;
      }

      return {
        ...currentRecipes,
        items: currentRecipes.items.map((recipe) =>
          recipe.id === recipeId
            ? { ...recipe, save_count: result.save_count }
            : recipe,
        ),
      };
    });

    setThemes((currentThemes) => {
      if (!currentThemes) {
        return currentThemes;
      }

      return {
        themes: currentThemes.themes.map((theme) => ({
          ...theme,
          recipes: theme.recipes.map((recipe) =>
            recipe.id === recipeId
              ? { ...recipe, save_count: result.save_count }
              : recipe,
          ),
        })),
      };
    });
  }, []);

  const homeSaveFlow = useHomeRecipeSaveFlow({
    isAuthenticated,
    onRecipeSaved: updateRecipeSaveState,
    requestLogin: (recipeId) => {
      openAuthGate({ recipeId, type: "save" });
    },
  });

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
          activeRecipeCategory={activeRecipeCategory}
          listTitle={listTitle}
          emptyStateActionLabel={emptyStateActionLabel}
          onOpenIngredientModal={() => setIngredientModalOpen(true)}
          onRecipeSave={homeSaveFlow.openRecipeSaveModal}
          onRetry={() => void loadRecipes()}
          onSelectRecipeCategory={selectRecipeCategory}
          onSelectSort={selectSort}
          query={query}
          savedRecipeIds={homeSaveFlow.savedRecipeIds}
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
                onSelectTheme={selectTheme}
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

                {/* Discovery filter chip rail */}
                <div className="pb-2.5">
                  <DiscoveryFilterRail
                    activeRecipeCategory={activeRecipeCategory}
                    appliedIngredientIds={appliedIngredientIds}
                    onClear={clearIngredientFilters}
                    onOpenModal={() => setIngredientModalOpen(true)}
                    onSelectRecipeCategory={selectRecipeCategory}
                  />
                </div>

                {screenState === "loading" ? <div className="px-4"><RecipeListSkeleton /></div> : null}

                {screenState === "ready" && displayedRecipes.length ? (
                  <div className="grid grid-cols-1 gap-4 px-4">
                    {displayedRecipes.map((recipe) => (
                      <RecipeCard
                        isSaved={homeSaveFlow.savedRecipeIds.has(recipe.id)}
                        key={recipe.id}
                        onSave={homeSaveFlow.openRecipeSaveModal}
                        recipe={recipe}
                      />
                    ))}
                  </div>
                ) : null}

                {showEmptyState ? (
                  <div className="px-4">
                    <ContentState
                      actionLabel={emptyStateActionLabel}
                      description="조건에 맞는 레시피가 없어요."
                      eyebrow="다른 조합"
                      tone="empty"
                      onAction={() => {
                        clearIngredientFilters();
                        clearSearch();
                        setActiveRecipeCategory("전체");
                        setActiveThemeId(null);
                      }}
                      title="다른 조합을 찾아보세요"
                    />
                  </div>
                ) : null}
              </section>
            ) : null}
          </div>

          <Wave1MobileBottomTab ariaLabel="HOME 하단 탭" currentTab="home" />
        </div>
      </div>
      ) : null}
      {ingredientFilterModal}
      <SaveModal
        alreadySavedBookIds={homeSaveFlow.alreadySavedBookIds}
        books={homeSaveFlow.saveBooks}
        isCreatingBook={homeSaveFlow.isCreatingBook}
        isOpen={homeSaveFlow.isSaveModalOpen}
        isSavingRecipe={homeSaveFlow.isSavingRecipe}
        loadErrorMessage={homeSaveFlow.saveLoadError}
        newBookName={homeSaveFlow.newSaveBookName}
        onClose={homeSaveFlow.closeSaveModal}
        onCreateBook={() => {
          void homeSaveFlow.createSaveBook();
        }}
        onNewBookNameChange={homeSaveFlow.setNewSaveBookName}
        onRetry={homeSaveFlow.retryLoadSaveBooks}
        onSaveRecipe={() => {
          void homeSaveFlow.saveRecipe();
        }}
        onSelectBook={homeSaveFlow.selectSaveBook}
        saveErrorMessage={homeSaveFlow.saveSubmitError}
        selectedBookIds={homeSaveFlow.selectedSaveBookIds}
        viewState={
          homeSaveFlow.saveModalState === "idle"
            ? "loading"
            : homeSaveFlow.saveModalState
        }
      />
      <LoginGateModal />
    </>
  );
}

function HomeWebScreen({
  activeRecipeCategory,
  appliedIngredientIds,
  clearIngredientFilters,
  clearSearch,
  displayedRecipes,
  emptyStateActionLabel,
  listTitle,
  onOpenIngredientModal,
  onRecipeSave,
  onRetry,
  onSelectRecipeCategory,
  onSelectSort,
  query,
  savedRecipeIds,
  screenState,
  selectedTheme,
  setActiveThemeId,
  setQuery,
  sort,
  themes,
  totalRecipeCount,
}: {
  activeRecipeCategory: RecipeCategoryLabel;
  appliedIngredientIds: string[];
  clearIngredientFilters: () => void;
  clearSearch: () => void;
  displayedRecipes: RecipeListData["items"];
  emptyStateActionLabel: string;
  listTitle: string;
  onOpenIngredientModal: () => void;
  onRecipeSave: (recipe: RecipeCardItem) => void;
  onRetry: () => void;
  onSelectRecipeCategory: (category: RecipeCategoryLabel) => void;
  onSelectSort: (nextSort: string) => void;
  query: string;
  savedRecipeIds: Set<string>;
  screenState: ScreenState;
  selectedTheme: RecipeTheme | null;
  setActiveThemeId: (themeId: string | null) => void;
  setQuery: (query: string) => void;
  sort: RecipeSortKey;
  themes: RecipeTheme[];
  totalRecipeCount: number;
}) {
  const showEmptyState =
    (screenState === "ready" || screenState === "empty") &&
    displayedRecipes.length === 0;

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
              <DiscoveryFilterRail
                activeRecipeCategory={activeRecipeCategory}
                appliedIngredientIds={appliedIngredientIds}
                onClear={clearIngredientFilters}
                onOpenModal={onOpenIngredientModal}
                onSelectRecipeCategory={onSelectRecipeCategory}
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
                  onClick={() =>
                    setActiveThemeId(selectedTheme?.id === theme.id ? null : theme.id)
                  }
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
                <RecipeCard
                  isSaved={savedRecipeIds.has(recipe.id)}
                  key={recipe.id}
                  onSave={onRecipeSave}
                  recipe={recipe}
                />
              ))}
            </div>
          ) : null}

          {showEmptyState ? (
            <ContentState
              actionLabel={emptyStateActionLabel}
              description="다른 키워드나 재료 조합으로 다시 찾아보세요."
              eyebrow="다른 조합"
              onAction={() => {
                clearIngredientFilters();
                clearSearch();
                onSelectRecipeCategory("전체");
                setActiveThemeId(null);
              }}
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

function DiscoveryFilterRail({
  activeRecipeCategory,
  appliedIngredientIds,
  onClear,
  onOpenModal,
  onSelectRecipeCategory,
}: {
  activeRecipeCategory: RecipeCategoryLabel;
  appliedIngredientIds: string[];
  onClear: () => void;
  onOpenModal: () => void;
  onSelectRecipeCategory: (category: RecipeCategoryLabel) => void;
}) {
  const hasFilters = appliedIngredientIds.length > 0;

  return (
    <div className="scrollbar-hide flex gap-2 overflow-x-auto px-4 pb-1">
      <button
        className={`flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-semibold ${
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

      {RECIPE_CATEGORY_FILTERS.map((filter) => {
        const isActive = activeRecipeCategory === filter.label;

        return (
          <button
            aria-pressed={isActive}
            className={[
              "flex h-11 shrink-0 items-center rounded-[10px] border px-3 text-[13px] transition-colors",
              isActive
                ? "border-[#212529] bg-[#212529] font-bold text-white"
                : "border-[#DEE2E6] bg-[#F8F9FA] font-medium text-[#495057]",
            ].join(" ")}
            key={filter.label}
            onClick={() => onSelectRecipeCategory(filter.label)}
            type="button"
          >
            {filter.label}
          </button>
        );
      })}

      {hasFilters ? (
        <button
          className="flex h-11 shrink-0 items-center rounded-[10px] border border-[#DEE2E6] bg-white px-3 text-[13px] font-medium text-[#495057]"
          onClick={onClear}
          type="button"
        >
          초기화
        </button>
      ) : null}
    </div>
  );
}

function filterRecipesByCategory(
  recipes: RecipeCardItem[],
  category: RecipeCategoryLabel,
) {
  if (category === "전체") {
    return recipes;
  }

  const filter = RECIPE_CATEGORY_FILTERS.find((item) => item.label === category);

  if (!filter || filter.keywords.length === 0) {
    return recipes;
  }

  return recipes.filter((recipe) => {
    const searchableText = [recipe.title, ...recipe.tags]
      .join(" ")
      .toLowerCase();

    return filter.keywords.some((keyword) =>
      searchableText.includes(keyword.toLowerCase()),
    );
  });
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
        {activeThemeId ? (
          <button
            className="text-[12px] font-semibold text-[#007A76]"
            onClick={() => onSelectTheme(activeThemeId)}
            type="button"
          >
            필터 해제
          </button>
        ) : null}
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
      className={`relative flex h-[96px] w-[148px] shrink-0 flex-col justify-between overflow-hidden rounded-[12px] p-3 text-left ${
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
      <span className="line-clamp-2 text-[14px] font-bold leading-[1.15] text-[#212529]" style={{ fontFamily: "var(--font-jua), -apple-system, sans-serif" }}>
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
