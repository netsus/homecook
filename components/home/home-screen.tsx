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
import {
  WebButton,
  WebChip,
  WebErrorState,
  WebIconButton,
  WebRecipeCard,
  WebShell,
  WebSkeleton,
  WebTopNav,
} from "@/components/web";
import { readE2EAuthOverride } from "@/lib/auth/e2e-auth-override";
import { SortDropdown } from "@/components/ui/sort-dropdown";
import { fetchJson } from "@/lib/api/fetch-json";
import { formatCount, formatRecipeSourceLabel } from "@/lib/recipe";
import { KOREA_TIME_ZONE } from "@/lib/korean-date";
import { resolveRecipeImage } from "@/lib/recipe-image";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { useDiscoveryFilterStore } from "@/stores/discovery-filter-store";
import { useAuthGateStore } from "@/stores/ui-store";
import type {
  RecipeCardItem,
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
  { label: "요리완료순", value: "cook_count" },
];

type ScreenState = "loading" | "ready" | "empty" | "error";
type AsyncState = "loading" | "ready";

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "홈" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

function formatHomeMealGreeting(now = new Date()) {
  const weekday = new Intl.DateTimeFormat("ko-KR", {
    timeZone: KOREA_TIME_ZONE,
    weekday: "long",
  }).format(now);
  const hourText = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone: KOREA_TIME_ZONE,
  }).format(now);
  const hour = Number(hourText);
  const meal =
    hour >= 5 && hour < 11
      ? "아침"
      : hour >= 11 && hour < 15
        ? "점심"
        : hour >= 15 && hour < 18
          ? "오후"
          : hour >= 18 && hour < 22
            ? "저녁"
            : "밤";

  return `${weekday} ${meal},`;
}

export function HomeScreen() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<RecipeSortKey>("view_count");
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
  const hasActiveFilters = hasQuery || hasIngredientFilter;
  const selectedTheme = useMemo(
    () => themes?.themes.find((theme) => theme.id === activeThemeId) ?? null,
    [activeThemeId, themes],
  );
  const displayedRecipes = useMemo(
    () => selectedTheme?.recipes ?? recipes?.items ?? [],
    [recipes?.items, selectedTheme?.recipes],
  );
  const listTitle = selectedTheme
    ? selectedTheme.title
    : hasActiveFilters
      ? "검색 결과"
      : "모든 레시피";
  const showInitialDiscoverySkeleton =
    !hasActiveFilters && themeState === "loading";
  const showEmptyState =
    (screenState === "ready" || screenState === "empty") &&
    displayedRecipes.length === 0;
  const emptyStateActionLabel = "초기화";
  const mealGreeting = useMemo(() => formatHomeMealGreeting(), []);

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

  const updateRecipeSaveState = useCallback((
    recipeId: string,
    saveCount: number,
    savedBookIds: string[],
  ) => {
    setRecipes((currentRecipes) => {
      if (!currentRecipes) {
        return currentRecipes;
      }

      return {
        ...currentRecipes,
        items: currentRecipes.items.map((recipe) =>
          recipe.id === recipeId
            ? {
                ...recipe,
                save_count: saveCount,
                user_status: {
                  is_saved: savedBookIds.length > 0,
                  saved_book_ids: savedBookIds,
                },
              }
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
              ? {
                  ...recipe,
                  save_count: saveCount,
                  user_status: {
                    is_saved: savedBookIds.length > 0,
                    saved_book_ids: savedBookIds,
                  },
                }
              : recipe,
          ),
        })),
      };
    });
  }, []);

  const incrementRecipeViewCount = useCallback((recipeId: string) => {
    const bumpRecipe = (recipe: RecipeCardItem) =>
      recipe.id === recipeId
        ? {
            ...recipe,
            view_count: recipe.view_count + 1,
          }
        : recipe;

    setRecipes((currentRecipes) => {
      if (!currentRecipes) {
        return currentRecipes;
      }

      return {
        ...currentRecipes,
        items: currentRecipes.items.map(bumpRecipe),
      };
    });

    setThemes((currentThemes) => {
      if (!currentThemes) {
        return currentThemes;
      }

      return {
        themes: currentThemes.themes.map((theme) => ({
          ...theme,
          recipes: theme.recipes.map(bumpRecipe),
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
  const syncSavedBookIds = homeSaveFlow.syncSavedBookIds;

  useEffect(() => {
    const hydratedSavedBookIdsByRecipe: Record<string, string[]> = {};
    const collectRecipeStatus = (recipe: RecipeCardItem) => {
      if (recipe.user_status === undefined) {
        return;
      }

      hydratedSavedBookIdsByRecipe[recipe.id] =
        recipe.user_status?.saved_book_ids ?? [];
    };

    recipes?.items.forEach(collectRecipeStatus);
    themes?.themes.forEach((theme) => {
      theme.recipes.forEach(collectRecipeStatus);
    });

    if (Object.keys(hydratedSavedBookIdsByRecipe).length > 0) {
      syncSavedBookIds(hydratedSavedBookIdsByRecipe);
    }
  }, [recipes, syncSavedBookIds, themes]);

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
          listTitle={listTitle}
          mealGreeting={mealGreeting}
          emptyStateActionLabel={emptyStateActionLabel}
          onOpenIngredientModal={() => setIngredientModalOpen(true)}
          onRecipeOpen={incrementRecipeViewCount}
          onRecipeSave={homeSaveFlow.openRecipeSaveModal}
          onRetry={() => void loadRecipes()}
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
        className="min-h-screen bg-[var(--surface)] text-[var(--foreground)] lg:hidden"
        style={
          {
            "--home-mint": "var(--brand)",
            "--home-mint-deep": "var(--brand-deep)",
            "--home-mint-soft": "var(--brand-soft)",
            "--home-bg": "var(--surface)",
            "--home-ink": "var(--foreground)",
          } as React.CSSProperties
        }
      >
        <div className="mx-auto flex min-h-screen max-w-[430px] flex-col bg-[var(--surface)] pb-[calc(86px+env(safe-area-inset-bottom))] shadow-[0_0_0_1px_var(--foreground-alpha-04)]">
          <HomeAppBar />

          <div className="pb-[100px]">
            {/* Hero greeting */}
            <div className="bg-[var(--surface)] px-5 pb-3 pt-5">
              <div className="home-mobile-discovery-kicker">{mealGreeting}</div>
              <h1 className="home-mobile-discovery-title">
                오늘 뭐 먹지?
              </h1>
              <p className="home-mobile-discovery-sub">
                레시피 제목으로 검색하거나, 재료로 좁혀 보세요.
              </p>
            </div>

            {/* Search */}
            <div className="home-mobile-discovery-search px-5 pb-3 pt-1">
              <div className="home-mobile-discovery-search-row">
                <label className="home-mobile-search-bar">
                  <SearchIcon />
                  <span className="visually-hidden">레시피 제목 검색</span>
                  <input
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setActiveThemeId(null);
                    }}
                    placeholder="레시피 제목 검색"
                    value={query}
                  />
                </label>
                <button
                  className="home-mobile-filter-button"
                  onClick={() => setIngredientModalOpen(true)}
                  type="button"
                >
                  <SearchSmallIcon color="currentColor" />
                  재료로 검색
                </button>
              </div>
              <div className="home-mobile-filter-chip-row">
                {hasIngredientFilter ? (
                  <>
                    <button
                      className="home-mobile-filter-chip home-mobile-filter-chip-active"
                      onClick={() => setIngredientModalOpen(true)}
                      type="button"
                    >
                      <SearchSmallIcon color="currentColor" />
                      재료 {appliedIngredientIds.length}개
                    </button>
                    <button
                      className="home-mobile-filter-reset"
                      onClick={clearIngredientFilters}
                      type="button"
                    >
                      초기화
                    </button>
                  </>
                ) : null}
              </div>
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

            {screenState !== "error" && !showInitialDiscoverySkeleton ? (
              <section aria-label={listTitle}>
                {/* Section header with sort */}
                <div className="flex items-center justify-between px-4 pb-2">
                  <div>
                    <h2 className="text-[18px] font-bold text-[var(--foreground)]">
                      {listTitle}
                    </h2>
                    <p className="mt-0.5 text-[13px] font-medium text-[var(--text-3)]">
                      {displayedRecipes.length}개
                    </p>
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

                {screenState === "loading" ? <div className="px-4"><RecipeListSkeleton /></div> : null}

                {screenState === "ready" && displayedRecipes.length ? (
                  <div className="grid grid-cols-1 gap-4 px-4">
                    {displayedRecipes.map((recipe) => (
                      <RecipeCard
                        isSaved={homeSaveFlow.savedRecipeIds.has(recipe.id)}
                        key={recipe.id}
                        onOpen={() => incrementRecipeViewCount(recipe.id)}
                        onSave={homeSaveFlow.openRecipeSaveModal}
                        recipe={recipe}
                      />
                    ))}
                  </div>
                ) : null}

                {showEmptyState ? (
                  <div className="px-4">
                    <HomeSearchEmptyState
                      actionLabel={emptyStateActionLabel}
                      description="다른 키워드나 재료 조합으로 다시 찾아보세요."
                      onAction={() => {
                        clearIngredientFilters();
                        clearSearch();
                        setActiveThemeId(null);
                      }}
                      title="조건에 맞는 레시피가 없어요"
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
  appliedIngredientIds,
  clearIngredientFilters,
  clearSearch,
  displayedRecipes,
  emptyStateActionLabel,
  listTitle,
  mealGreeting,
  onOpenIngredientModal,
  onRecipeOpen,
  onRecipeSave,
  onRetry,
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
  appliedIngredientIds: string[];
  clearIngredientFilters: () => void;
  clearSearch: () => void;
  displayedRecipes: RecipeListData["items"];
  emptyStateActionLabel: string;
  listTitle: string;
  mealGreeting: string;
  onOpenIngredientModal: () => void;
  onRecipeOpen: (recipeId: string) => void;
  onRecipeSave: (recipe: RecipeCardItem) => void;
  onRetry: () => void;
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
  const themeRailRef = useRef<HTMLDivElement | null>(null);
  const scrollThemeRail = (direction: -1 | 1) => {
    themeRailRef.current?.scrollBy({ left: direction * 360, behavior: "smooth" });
  };

  return (
    <WebShell className="web-home" wide>
      <WebTopNav
        activeId="home"
        items={WEB_NAV_ITEMS}
        rightSlot={<WebProfileButton />}
      />
      <div className="web-screen">
        <section className="web-discovery">
          <p className="web-discovery-kicker">{mealGreeting}</p>
          <h1 className="web-discovery-title">오늘 뭐 먹지?</h1>
          <p className="web-discovery-sub">
            레시피 제목으로 검색하거나, 재료로 좁혀 보세요.
          </p>

          <div className="web-discovery-search-row">
            <label className="web-search-bar">
              <SearchIcon />
              <span className="visually-hidden">레시피 제목 검색</span>
              <input
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveThemeId(null);
                }}
                placeholder="레시피 제목 검색"
                value={query}
              />
            </label>
            <WebButton
              className="web-discovery-filter-button"
              onClick={onOpenIngredientModal}
              variant="secondary"
            >
              <SearchSmallIcon color="currentColor" />
              재료로 검색
            </WebButton>
          </div>

          {appliedIngredientIds.length > 0 ? (
            <div className="web-filter-chip-row">
              <WebChip active onClick={onOpenIngredientModal}>
                <SearchSmallIcon color="currentColor" />
                재료 {appliedIngredientIds.length}개
              </WebChip>
              <WebButton
                onClick={clearIngredientFilters}
                size="sm"
                variant="ghost"
              >
                초기화
              </WebButton>
            </div>
          ) : null}
        </section>

        {themes.length > 0 ? (
          <section className="web-theme-strip">
            <div className="web-theme-strip-head">
              <div>
                <h2 className="web-section-title">이번 주 인기 테마</h2>
              </div>
              <div className="web-theme-strip-controls">
                {selectedTheme ? (
                  <WebButton
                    onClick={() => setActiveThemeId(null)}
                    size="sm"
                    variant="ghost"
                  >
                    전체 보기
                  </WebButton>
                ) : null}
                <WebIconButton
                  aria-label="이전"
                  onClick={() => scrollThemeRail(-1)}
                >
                  <ChevronLeftIcon />
                </WebIconButton>
                <WebIconButton
                  aria-label="다음"
                  onClick={() => scrollThemeRail(1)}
                >
                  <ChevronRightIcon />
                </WebIconButton>
              </div>
            </div>
            <div className="web-theme-rail" ref={themeRailRef}>
              {themes.map((theme, index) => (
                <button
                  aria-pressed={selectedTheme?.id === theme.id}
                  className={[
                    "web-theme-card",
                    selectedTheme?.id === theme.id ? "web-theme-card-active" : "",
                  ].join(" ")}
                  key={theme.id}
                  onClick={() =>
                    setActiveThemeId(selectedTheme?.id === theme.id ? null : theme.id)
                  }
                  type="button"
                >
                  <span
                    className="web-theme-card-thumb"
                    style={{
                      backgroundImage: `url(${resolveRecipeImage(theme.recipes[0] ?? { id: String(index) })})`,
                    }}
                  >
                    <span className="web-theme-card-overlay">
                      <span className="web-theme-card-title">{theme.title}</span>
                      <span className="web-theme-card-count">
                        {theme.recipes.length}개 레시피
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <section className="web-all-recipes">
          <div className="web-section-head">
            <div>
              <h2 className="web-section-title">{listTitle}</h2>
              <p className="web-section-meta">
                {displayedRecipes.length}개
                {selectedTheme ? " · 테마 결과" : totalRecipeCount ? ` · 전체 ${totalRecipeCount}개` : ""}
              </p>
            </div>
            <SortDropdown
              className="web-sort-dropdown"
              label="정렬 기준"
              onChange={onSelectSort}
              options={SORT_OPTIONS}
              value={sort}
            />
          </div>

          {screenState === "loading" ? <RecipeGridSkeleton /> : null}

          {screenState === "error" ? (
            <WebErrorState
              action={
                <WebButton onClick={onRetry} variant="primary">
                  다시 시도
                </WebButton>
              }
              description="네트워크 연결이나 API 설정을 확인한 뒤 다시 불러올 수 있어요."
              title="레시피를 불러오지 못했어요"
            />
          ) : null}

          {screenState === "ready" && displayedRecipes.length ? (
            <div className="web-home-grid">
              {displayedRecipes.map((recipe) => (
                <HomeWebRecipeCard
                  isSaved={savedRecipeIds.has(recipe.id)}
                  key={recipe.id}
                  onOpen={onRecipeOpen}
                  onSave={onRecipeSave}
                  recipe={recipe}
                />
              ))}
            </div>
          ) : null}

          {showEmptyState ? (
            <HomeSearchEmptyState
              actionLabel={emptyStateActionLabel}
              description="다른 키워드나 재료 조합으로 다시 찾아보세요."
              onAction={() => {
                clearIngredientFilters();
                clearSearch();
                setActiveThemeId(null);
              }}
              title="조건에 맞는 레시피가 없어요"
            />
          ) : null}
        </section>
      </div>
    </WebShell>
  );
}

function RecipeGridSkeleton() {
  return (
    <div className="web-home-grid">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          className="web-recipe-card"
          key={`web-recipe-skeleton-${index}`}
        >
          <WebSkeleton className="web-recipe-card-thumb" />
          <div className="web-recipe-card-body">
            <WebSkeleton className="h-5 w-3/4" />
            <WebSkeleton className="mt-3 h-4 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function HomeSearchEmptyState({
  actionLabel,
  description,
  onAction,
  title,
}: {
  actionLabel: string;
  description: string;
  onAction: () => void;
  title: string;
}) {
  return (
    <div
      className="home-search-empty-state"
      data-testid="home-search-empty-state"
    >
      <div className="home-search-empty-icon" aria-hidden="true" />
      <h2 className="home-search-empty-title">{title}</h2>
      <p className="home-search-empty-description">{description}</p>
      <button
        className="home-search-empty-action"
        onClick={onAction}
        type="button"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function HomeWebRecipeCard({
  isSaved,
  onOpen,
  onSave,
  recipe,
}: {
  isSaved: boolean;
  onOpen: (recipeId: string) => void;
  onSave: (recipe: RecipeCardItem) => void;
  recipe: RecipeCardItem;
}) {
  const imageSrc = resolveRecipeImage(recipe);
  const sourceLabel = formatRecipeSourceLabel(recipe.source_type);
  const sourceBadge = recipe.source_type === "youtube" ? sourceLabel : null;
  const visibleTags = recipe.tags.slice(0, 3);
  const remainingTagCount = Math.max(recipe.tags.length - visibleTags.length, 0);

  return (
    <article className="web-home-recipe-card">
      <Link href={`/recipe/${recipe.id}`} onClick={() => onOpen(recipe.id)}>
        <WebRecipeCard
          alt={recipe.title}
          badge={sourceBadge}
          imageSrc={imageSrc}
          meta={
            <>
              <span>조회 {formatCount(recipe.view_count)}</span>
              <span className="web-meta-separator">·</span>
              <span>저장 {formatCount(recipe.save_count)}</span>
            </>
          }
          tags={
            visibleTags.length ? (
              <>
                {visibleTags.map((tag) => (
                  <span className="web-recipe-card-tag" key={tag}>
                    {tag}
                  </span>
                ))}
                {remainingTagCount > 0 ? (
                  <span className="web-recipe-card-tag">+{remainingTagCount}</span>
                ) : null}
              </>
            ) : null
          }
          title={recipe.title}
        />
      </Link>
      <button
        aria-label={`${recipe.title} 저장`}
        aria-pressed={isSaved}
        className={[
          "web-photo-card-save",
          isSaved ? "web-photo-card-save-active" : "",
        ].join(" ")}
        data-testid="recipe-card-bookmark"
        onClick={() => onSave(recipe)}
        type="button"
      >
        <WebBookmarkIcon filled={isSaved} />
      </button>
    </article>
  );
}

function WebProfileButton() {
  return (
    <Link
      aria-label="마이페이지"
      className="web-profile-button"
      href="/mypage"
    >
      <UserIcon />
    </Link>
  );
}

function HomeAppBar() {
  return (
    <header className="sticky top-0 z-20 flex min-h-[var(--control-height-xl)] items-center border-b border-[var(--line-strong)] bg-[var(--surface)] px-4" style={{ borderBottomWidth: "0.5px" }}>
      <h1 className="text-[18px] font-bold leading-none text-[var(--brand)]">HOMECOOK</h1>
    </header>
  );
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
    <section aria-label="이번 주 인기 테마" className="pb-4 pt-2">
      <div className="flex items-baseline justify-between px-4 pb-3">
        <h2 className="text-[18px] font-bold text-[var(--foreground)]">이번 주 인기 테마</h2>
        {activeThemeId ? (
          <button
            className="text-[12px] font-semibold text-[var(--brand)]"
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
  const imageSrc = resolveRecipeImage(
    theme.recipes[0] ?? { id: String(variantIndex) },
  );

  return (
    <button
      aria-pressed={isActive}
      className={`relative h-[128px] w-[184px] shrink-0 overflow-hidden rounded-[var(--radius-card)] text-left shadow-[0px_1px_3px_var(--shadow-color-subtle)] transition hover:shadow-[0px_4px_12px_var(--shadow-color-medium)] ${
        isActive ? "ring-2 ring-[var(--brand)]" : ""
      }`}
      onClick={onClick}
      style={{
        backgroundImage: `url(${imageSrc})`,
        backgroundPosition: "center",
        backgroundSize: "cover",
        border: isActive ? "2px solid var(--brand)" : "2px solid transparent",
      }}
      type="button"
    >
      <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_20%,var(--overlay-68)_100%)]" />
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-3 text-[var(--text-inverse)]">
        <span className="line-clamp-2 text-[15px] font-bold leading-[1.2]">
          {theme.title}
        </span>
        <span className="text-[12px] font-semibold opacity-90">
          {theme.recipes.length}개 레시피
        </span>
      </span>
    </button>
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-[var(--text-2)]"
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

function ChevronLeftIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="16"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="16"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="18"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="18"
    >
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function WebBookmarkIcon({ filled = false }: { filled?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      fill={filled ? "currentColor" : "none"}
      height="18"
      stroke="currentColor"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="18"
    >
      <path d="M6 3h12v18l-6-4-6 4V3z" />
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
            className="h-[132px] w-[148px] shrink-0 rounded-[var(--radius-card)]"
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
            className="min-h-72 rounded-[var(--radius-card)]"
          />
        ))}
      </div>
    </div>
  );
}
