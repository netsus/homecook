"use client";
import React from "react";
import Image from "next/image";
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
  WebRecipeCard,
  WebShell,
  WebSkeleton,
  WebTopNav,
} from "@/components/web";
import {
  E2E_AUTH_OVERRIDE_KEY,
  readE2EAuthOverride,
} from "@/lib/auth/e2e-auth-override";
import { fetchUserProfile, type UserProfileData } from "@/lib/api/mypage";
import { fetchUserGamification } from "@/lib/api/user-gamification";
import { fetchUserProgress } from "@/lib/api/user-progress";
import { fetchRecipeTags } from "@/lib/api/recipe";
import { SortDropdown } from "@/components/ui/sort-dropdown";
import { fetchJson } from "@/lib/api/fetch-json";
import { formatCount, formatRecipeSourceLabel } from "@/lib/recipe";
import { KOREA_TIME_ZONE } from "@/lib/korean-date";
import { PRIMARY_WEB_NAV_ITEMS } from "@/lib/navigation/app-nav";
import {
  filterSafeDisplayItems,
  isSafeDisplayText,
} from "@/lib/display-safety";
import { resolveRecipeImage } from "@/lib/recipe-image";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { useDiscoveryFilterStore } from "@/stores/discovery-filter-store";
import { useAuthGateStore } from "@/stores/ui-store";
import type {
  RecipeCardItem,
  RecipeListData,
  RecipeSortKey,
  RecipeTagItem,
  RecipeTheme,
  RecipeThemesData,
} from "@/types/recipe";
import type { UserGamificationData } from "@/types/user-gamification";
import type { UserProgressData } from "@/types/user-progress";

const SORT_OPTIONS: Array<{ label: string; value: RecipeSortKey }> = [
  { label: "조회수순", value: "view_count" },
  { label: "최신순", value: "latest" },
  { label: "저장순", value: "save_count" },
  { label: "플래너 등록순", value: "plan_count" },
  { label: "요리완료순", value: "cook_count" },
];

const WEB_HOME_MAX_VISIBLE_TAGS = 3;
const WEB_HOME_TAG_ROW_UNIT_LIMIT = 14;
const WEB_HOME_TAG_GAP_UNITS = 1;

type ScreenState = "loading" | "ready" | "empty" | "error";
type AsyncState = "loading" | "ready" | "error";

const HOME_QUICK_LINKS = [
  {
    description: "이번 주 끼니 정리",
    href: "/planner",
    icon: "calendar",
    label: "식단 짜기",
  },
  {
    description: "재료로 바로 준비",
    href: "/shopping/flow",
    icon: "cart",
    label: "장보기 준비",
  },
  {
    description: "저장 레시피 보기",
    href: "/mypage?tab=recipebooks",
    icon: "book",
    label: "레시피북",
  },
  {
    description: "영상 링크로 등록",
    href: "/menu/add/youtube",
    icon: "youtube",
    label: "유튜브 가져오기",
  },
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

function buildResultStatusText({
  count,
  listTitle,
  screenState,
}: {
  count: number;
  listTitle: string;
  screenState: ScreenState;
}) {
  if (screenState === "loading") {
    return "레시피 목록을 불러오는 중이에요.";
  }
  if (screenState === "error") {
    return "레시피 목록을 불러오지 못했어요.";
  }
  if (count === 0) {
    return `${listTitle} 조건에 맞는 레시피가 없어요.`;
  }

  return `${listTitle} ${count}개가 표시돼요.`;
}

function filterSafeRecipeCards(items: RecipeCardItem[]) {
  return filterSafeDisplayItems(items, (recipe) => recipe.title);
}

function getWebHomeTagUnits(label: string) {
  return Array.from(label).reduce((total, char) => {
    return total + (/^[\x00-\x7F]$/.test(char) ? 0.6 : 1);
  }, 0);
}

function getWebHomeTagPreview(tags: string[]) {
  const normalizedTags = tags.map((tag) => tag.trim()).filter(Boolean);
  const visibleTags: string[] = [];
  let usedUnits = 0;

  for (let index = 0; index < normalizedTags.length; index += 1) {
    if (visibleTags.length >= WEB_HOME_MAX_VISIBLE_TAGS) {
      break;
    }

    const tag = normalizedTags[index];
    const hiddenCountIfIncluded = normalizedTags.length - index - 1;
    const gapUnits = visibleTags.length ? WEB_HOME_TAG_GAP_UNITS : 0;
    const moreUnits =
      hiddenCountIfIncluded > 0
        ? WEB_HOME_TAG_GAP_UNITS + getWebHomeTagUnits(`+${hiddenCountIfIncluded}`)
        : 0;
    const nextUnits = usedUnits + gapUnits + getWebHomeTagUnits(tag) + moreUnits;

    if (nextUnits > WEB_HOME_TAG_ROW_UNIT_LIMIT) {
      break;
    }

    visibleTags.push(tag);
    usedUnits += gapUnits + getWebHomeTagUnits(tag);
  }

  return {
    hiddenTagCount: normalizedTags.length - visibleTags.length,
    visibleTags,
  };
}

function filterSafeRecipeThemes(themeData: RecipeThemesData): RecipeThemesData {
  return {
    themes: themeData.themes
      .map((theme) => ({
        ...theme,
        recipes: filterSafeRecipeCards(theme.recipes),
      }))
      .filter((theme) => isSafeDisplayText(theme.title) && theme.recipes.length > 0),
  };
}

function normalizeHomeThemeLabel(value: string) {
  return value.trim().replace(/^#+/, "").trim().toLowerCase();
}

function getDiscoveryThemes(themes: RecipeTheme[], tagOptions: RecipeTagItem[]) {
  const visibleTagLabels = new Set(
    tagOptions.map((tag) => normalizeHomeThemeLabel(tag.label)),
  );

  return themes.filter((theme) => {
    const themeLabel = normalizeHomeThemeLabel(theme.title);

    return !visibleTagLabels.has(themeLabel);
  });
}

function readHomeAuthOverride() {
  const override = readE2EAuthOverride();

  if (typeof override === "boolean") {
    return override;
  }

  if (process.env.NODE_ENV !== "test" || typeof window === "undefined") {
    return null;
  }

  const testOverride = window.localStorage.getItem(E2E_AUTH_OVERRIDE_KEY);

  if (testOverride === "authenticated") {
    return true;
  }

  if (testOverride === "guest") {
    return false;
  }

  return null;
}

export function HomeScreen() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<RecipeSortKey>("view_count");
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [themeState, setThemeState] = useState<AsyncState>("loading");
  const [tagState, setTagState] = useState<AsyncState>("loading");
  const [recipes, setRecipes] = useState<RecipeListData | null>(null);
  const [themes, setThemes] = useState<RecipeThemesData | null>(null);
  const [tagOptions, setTagOptions] = useState<RecipeTagItem[]>([]);
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
  const [activeTagKey, setActiveTagKey] = useState<string | null>(null);
  const [activeTagLabel, setActiveTagLabel] = useState<string | null>(null);
  const [isIngredientModalOpen, setIngredientModalOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [progress, setProgress] = useState<UserProgressData | null>(null);
  const [gamification, setGamification] = useState<UserGamificationData | null>(null);
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
      setThemes(filterSafeRecipeThemes(themeData));
      setThemeState("ready");
    } catch {
      setThemes({ themes: [] });
      setThemeState("error");
    }
  }, []);

  const loadTagOptions = useCallback(async () => {
    setTagState("loading");
    const response = await fetchRecipeTags({ theme_eligible: true, limit: 12 });

    if (!response.success || !response.data) {
      setTagOptions([]);
      setTagState("error");
      return;
    }

    setTagOptions(filterSafeDisplayItems(response.data.items, (tag) => tag.label));
    setTagState("ready");
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setProfile(null);
      setProgress(null);
      setGamification(null);
      return;
    }

    let isCurrent = true;

    void Promise.allSettled([
      fetchUserProfile(),
      fetchUserProgress(),
      fetchUserGamification(),
    ]).then(([profileResult, progressResult, gamificationResult]) => {
      if (!isCurrent) {
        return;
      }

      setProfile(profileResult.status === "fulfilled" ? profileResult.value : null);
      setProgress(progressResult.status === "fulfilled" ? progressResult.value : null);
      setGamification(
        gamificationResult.status === "fulfilled" ? gamificationResult.value : null,
      );
    });

    return () => {
      isCurrent = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    void loadThemes();
  }, [loadThemes]);

  useEffect(() => {
    void loadTagOptions();
  }, [loadTagOptions]);

  useEffect(() => {
    const e2eAuthOverride = readHomeAuthOverride();

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

  const selectedTheme = useMemo(
    () => themes?.themes.find((theme) => theme.id === activeThemeId) ?? null,
    [activeThemeId, themes],
  );
  const discoveryThemes = useMemo(
    () => getDiscoveryThemes(themes?.themes ?? [], tagOptions),
    [tagOptions, themes],
  );
  const effectiveTagKey = activeTagKey ?? selectedTheme?.tag_key ?? null;
  const effectiveTagLabel =
    activeTagLabel ?? selectedTheme?.tag_label ?? selectedTheme?.title ?? null;

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

      if (effectiveTagKey) {
        params.set("tag", effectiveTagKey);
      }

      const recipeData = await fetchJson<RecipeListData>(`/api/v1/recipes?${params}`);

      if (currentRequestId !== recipeRequestIdRef.current) {
        return;
      }

      const safeRecipeData = {
        ...recipeData,
        items: filterSafeRecipeCards(recipeData.items),
      };

      setRecipes(safeRecipeData);
      setScreenState(safeRecipeData.items.length > 0 ? "ready" : "empty");
    } catch {
      if (currentRequestId !== recipeRequestIdRef.current) {
        return;
      }

      setRecipes(null);
      setScreenState("error");
    }
  }, [appliedIngredientIds, debouncedQuery, effectiveTagKey, sort]);

  useEffect(() => {
    void loadRecipes();
  }, [loadRecipes]);

  const hasQuery = debouncedQuery.trim().length > 0;
  const hasTypedQuery = query.trim().length > 0;
  const hasIngredientFilter = appliedIngredientIds.length > 0;
  const hasTagFilter = Boolean(effectiveTagKey);
  const hasActiveFilters = hasQuery || hasIngredientFilter || hasTagFilter;
  const hasResultPriorityContext = hasActiveFilters || hasTypedQuery;
  const activeFilterCount = [
    hasTypedQuery || hasQuery,
    hasIngredientFilter,
    hasTagFilter,
  ].filter(Boolean).length;
  const showClearAllFilters = activeFilterCount > 1;
  const displayedRecipes = useMemo(
    () => (effectiveTagKey ? recipes?.items ?? [] : selectedTheme?.recipes ?? recipes?.items ?? []),
    [effectiveTagKey, recipes?.items, selectedTheme?.recipes],
  );
  const listTitle = selectedTheme
    ? selectedTheme.title
    : effectiveTagLabel
      ? effectiveTagLabel
      : hasActiveFilters
      ? "검색 결과"
      : "모든 레시피";
  const showInitialDiscoverySkeleton =
    !hasActiveFilters && themeState === "loading";
  const shouldShowMobileThemeCarousel =
    !hasResultPriorityContext &&
    !showInitialDiscoverySkeleton &&
    discoveryThemes.length > 0;
  const mobileThemeInsertAfterIndex = Math.min(
    3,
    Math.max(0, displayedRecipes.length - 1),
  );
  const showEmptyState =
    (screenState === "ready" || screenState === "empty") &&
    displayedRecipes.length === 0;
  const emptyStateActionLabel = "초기화";
  const mealGreeting = useMemo(() => formatHomeMealGreeting(), []);
  const resultStatusText = buildResultStatusText({
    count: displayedRecipes.length,
    listTitle,
    screenState,
  });

  const clearIngredientFilters = useCallback(() => {
    resetAppliedIngredientIds();
  }, [resetAppliedIngredientIds]);

  const clearSearch = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
  }, []);

  const clearTagFilter = useCallback(() => {
    setActiveTagKey(null);
    setActiveTagLabel(null);
    setActiveThemeId(null);
  }, []);

  const clearAllFilters = useCallback(() => {
    clearIngredientFilters();
    clearSearch();
    clearTagFilter();
  }, [clearIngredientFilters, clearSearch, clearTagFilter]);

  const selectTag = useCallback((tag: RecipeTagItem) => {
    setActiveThemeId(null);
    setActiveTagKey((currentKey) => {
      if (currentKey === tag.normalized_key) {
        setActiveTagLabel(null);
        return null;
      }

      setActiveTagLabel(tag.label);
      return tag.normalized_key;
    });
  }, []);

  const applyIngredientFilter = useCallback(
    (ingredientIds: string[]) => {
      setAppliedIngredientIds(ingredientIds);
      setIngredientModalOpen(false);
      setActiveThemeId(null);
      setActiveTagKey(null);
      setActiveTagLabel(null);
    },
    [setAppliedIngredientIds],
  );

  const selectSort = useCallback((nextSort: string) => {
    setSort(nextSort as RecipeSortKey);
    if (selectedTheme && !selectedTheme.tag_key) {
      setActiveThemeId(null);
    }
  }, [selectedTheme]);

  const selectTheme = useCallback((themeId: string) => {
    const nextTheme = themes?.themes.find((theme) => theme.id === themeId) ?? null;
    setActiveThemeId((currentThemeId) => {
      if (currentThemeId === themeId) {
        setActiveTagKey(null);
        setActiveTagLabel(null);
        return null;
      }

      if (nextTheme?.tag_key) {
        setActiveTagKey(nextTheme.tag_key);
        setActiveTagLabel(nextTheme.title);
      } else {
        setActiveTagKey(null);
        setActiveTagLabel(null);
      }

      return themeId;
    });
  }, [themes]);

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
  const shouldRenderWebView = isDesktopViewport;
  const shouldRenderAppView = !isDesktopViewport;

  return (
    <>
      {shouldRenderWebView ? (
      <div className="hidden lg:block">
        <HomeWebScreen
          appliedIngredientIds={appliedIngredientIds}
          clearIngredientFilters={clearIngredientFilters}
          clearSearch={clearSearch}
          clearTagFilter={clearTagFilter}
          displayedRecipes={displayedRecipes}
          activeTagKey={activeTagKey}
          listTitle={listTitle}
          mealGreeting={mealGreeting}
          emptyStateActionLabel={emptyStateActionLabel}
          onOpenIngredientModal={() => setIngredientModalOpen(true)}
          onRecipeOpen={incrementRecipeViewCount}
          onRecipeSave={homeSaveFlow.openRecipeSaveModal}
          onRetry={() => void loadRecipes()}
          onRetryTags={() => void loadTagOptions()}
          onSelectSort={selectSort}
          onSelectTag={selectTag}
          onSelectTheme={selectTheme}
          gamification={gamification}
          isAuthenticated={isAuthenticated}
          profile={profile}
          progress={progress}
          query={query}
          resultStatusText={resultStatusText}
          savedRecipeIds={homeSaveFlow.savedRecipeIds}
          screenState={screenState}
          selectedTheme={selectedTheme}
          showClearAllFilters={showClearAllFilters}
          showDiscoveryShortcuts={!hasResultPriorityContext}
          tagOptions={tagOptions}
          tagState={tagState}
          setQuery={setQuery}
          sort={sort}
          themes={discoveryThemes}
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
        <div className="flex min-h-screen w-full flex-col bg-[var(--surface)] pb-[calc(86px+env(safe-area-inset-bottom))]">
          <HomeAppBar
            gamification={gamification}
            isAuthenticated={isAuthenticated}
            profile={profile}
            progress={progress}
          />

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
            <div className="home-mobile-discovery-search">
              <div className="home-mobile-discovery-search-row">
                <label className="home-mobile-search-bar">
                  <SearchIcon />
                  <span className="visually-hidden">레시피 제목 검색</span>
                  <input
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setActiveThemeId(null);
                      setActiveTagKey(null);
                      setActiveTagLabel(null);
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
              {hasIngredientFilter ? (
                <div className="home-mobile-filter-chip-row">
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
                </div>
              ) : null}
              <HomeTagRail
                activeTagKey={activeTagKey}
                onRetry={() => void loadTagOptions()}
                onSelectTag={selectTag}
                tagOptions={tagOptions}
                tagState={tagState}
                variant="mobile"
              />
            </div>

            {!hasResultPriorityContext ? <HomeQuickLinks variant="mobile" /> : null}

            {!hasResultPriorityContext && showInitialDiscoverySkeleton ? (
              <ThemeCarouselSkeleton />
            ) : null}

            {screenState === "error" && shouldShowMobileThemeCarousel ? (
              <ThemeCarousel
                activeThemeId={activeThemeId}
                onSelectTheme={selectTheme}
                themes={discoveryThemes}
              />
            ) : null}

            {showInitialDiscoverySkeleton ? (
              <section aria-label="레시피 목록 불러오는 중">
                <div className="flex items-center justify-between px-4 pb-2">
                  <div className="space-y-2">
                    <Skeleton className="h-6 w-32 rounded-full" />
                    <Skeleton className="h-4 w-10 rounded-full" />
                  </div>
                  <Skeleton className="h-9 w-24 rounded-[var(--radius-control)]" />
                </div>
                <div className="px-4">
                  <RecipeListSkeleton includeHeader={false} />
                </div>
              </section>
            ) : null}

            {screenState === "error" && !showInitialDiscoverySkeleton ? (
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

            {screenState !== "error" && !showInitialDiscoverySkeleton ? (
              <section aria-label={listTitle}>
                <p
                  aria-live="polite"
                  className="visually-hidden"
                  data-testid="home-result-status"
                  role="status"
                >
                  {resultStatusText}
                </p>
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
                    <div className="flex items-center gap-2">
                      {showClearAllFilters ? (
                        <button
                          className="home-mobile-filter-reset"
                          onClick={clearAllFilters}
                          type="button"
                        >
                          전체 초기화
                        </button>
                      ) : null}
                      {recipes?.items.length ? (
                        <SortDropdown
                          label="정렬 기준"
                          onChange={selectSort}
                          options={SORT_OPTIONS}
                          value={sort}
                        />
                      ) : null}
                    </div>
                  </div>

                {screenState === "loading" ? (
                  <div className="px-4">
                    <RecipeListSkeleton includeHeader={false} />
                  </div>
                ) : null}

                {screenState === "ready" && displayedRecipes.length ? (
                  <div className="grid grid-cols-1 gap-4 px-4">
                    {displayedRecipes.map((recipe, index) => (
                      <React.Fragment key={recipe.id}>
                        <RecipeCard
                          isSaved={homeSaveFlow.savedRecipeIds.has(recipe.id)}
                          onOpen={() => incrementRecipeViewCount(recipe.id)}
                          onSave={homeSaveFlow.openRecipeSaveModal}
                          recipe={recipe}
                        />
                        {index === mobileThemeInsertAfterIndex &&
                        shouldShowMobileThemeCarousel ? (
                          <ThemeCarousel
                            activeThemeId={activeThemeId}
                            embedded
                            onSelectTheme={selectTheme}
                            themes={discoveryThemes}
                          />
                        ) : null}
                      </React.Fragment>
                    ))}
                  </div>
                ) : null}

                {showEmptyState ? (
                  <div className="px-4">
                    <HomeSearchEmptyState
                      actionLabel={emptyStateActionLabel}
                      description="다른 키워드나 재료 조합으로 다시 찾아보세요."
                      onAction={() => {
                        clearAllFilters();
                      }}
                      title="조건에 맞는 레시피가 없어요"
                    />
                  </div>
                ) : null}
              </section>
            ) : null}

          </div>

          <Wave1MobileBottomTab ariaLabel="홈 하단 탭" currentTab="home" />
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
  activeTagKey,
  appliedIngredientIds,
  clearIngredientFilters,
  clearSearch,
  clearTagFilter,
  displayedRecipes,
  emptyStateActionLabel,
  listTitle,
  mealGreeting,
  onOpenIngredientModal,
  onRecipeOpen,
  onRecipeSave,
  onRetry,
  onRetryTags,
  onSelectSort,
  onSelectTag,
  onSelectTheme,
  gamification,
  isAuthenticated,
  profile,
  progress,
  query,
  resultStatusText,
  savedRecipeIds,
  screenState,
  selectedTheme,
  showClearAllFilters,
  showDiscoveryShortcuts,
  tagOptions,
  tagState,
  setQuery,
  sort,
  themes,
  totalRecipeCount,
}: {
  activeTagKey: string | null;
  appliedIngredientIds: string[];
  clearIngredientFilters: () => void;
  clearSearch: () => void;
  clearTagFilter: () => void;
  displayedRecipes: RecipeListData["items"];
  emptyStateActionLabel: string;
  listTitle: string;
  mealGreeting: string;
  onOpenIngredientModal: () => void;
  onRecipeOpen: (recipeId: string) => void;
  onRecipeSave: (recipe: RecipeCardItem) => void;
  onRetry: () => void;
  onRetryTags: () => void;
  onSelectSort: (nextSort: string) => void;
  onSelectTag: (tag: RecipeTagItem) => void;
  onSelectTheme: (themeId: string) => void;
  gamification: UserGamificationData | null;
  isAuthenticated: boolean;
  profile: UserProfileData | null;
  progress: UserProgressData | null;
  query: string;
  resultStatusText: string;
  savedRecipeIds: Set<string>;
  screenState: ScreenState;
  selectedTheme: RecipeTheme | null;
  showClearAllFilters: boolean;
  showDiscoveryShortcuts: boolean;
  tagOptions: RecipeTagItem[];
  tagState: AsyncState;
  setQuery: (query: string) => void;
  sort: RecipeSortKey;
  themes: RecipeTheme[];
  totalRecipeCount: number;
}) {
  const showEmptyState =
    (screenState === "ready" || screenState === "empty") &&
    displayedRecipes.length === 0;
  return (
    <WebShell className="web-home" wide>
      <WebTopNav
        activeId="home"
        items={PRIMARY_WEB_NAV_ITEMS}
        rightSlot={
          <ProfileSummaryButton
            gamification={gamification}
            isAuthenticated={isAuthenticated}
            profile={profile}
            progress={progress}
            variant="web"
          />
        }
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
                  clearTagFilter();
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

          {showDiscoveryShortcuts ? <HomeQuickLinks variant="web" /> : null}
        </section>

        <div className="web-home-content-grid">
          <section className="web-all-recipes">
            <p
              aria-live="polite"
              className="visually-hidden"
              data-testid="home-result-status"
              role="status"
            >
              {resultStatusText}
            </p>
            <div className="web-section-head">
              <div>
                <h2 className="web-section-title">{listTitle}</h2>
                <p className="web-section-meta">
                  {displayedRecipes.length}개
                  {selectedTheme ? " · 테마 결과" : totalRecipeCount ? ` · 전체 ${totalRecipeCount}개` : ""}
                </p>
              </div>
              <div className="web-section-actions">
                {showClearAllFilters ? (
                  <WebButton
                    onClick={() => {
                      clearIngredientFilters();
                      clearSearch();
                      clearTagFilter();
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    전체 초기화
                  </WebButton>
                ) : null}
                <SortDropdown
                  className="web-sort-dropdown"
                  label="정렬 기준"
                  onChange={onSelectSort}
                  options={SORT_OPTIONS}
                  value={sort}
                />
              </div>
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
                  clearTagFilter();
                }}
                title="조건에 맞는 레시피가 없어요"
              />
            ) : null}
          </section>

          <aside className="web-home-aside" aria-label="홈 보조 탐색">
            {screenState !== "error" ? (
              <section className="web-home-aside-section">
                <div className="web-home-aside-head">
                  <h2>추천 태그</h2>
                </div>
                <HomeTagRail
                  activeTagKey={activeTagKey}
                  onRetry={onRetryTags}
                  onSelectTag={onSelectTag}
                  tagOptions={tagOptions}
                  tagState={tagState}
                  variant="webAside"
                />
              </section>
            ) : null}

            {showDiscoveryShortcuts && themes.length > 0 ? (
              <section className="web-home-aside-section">
                <div className="web-home-aside-head">
                  <h2>이번 주 인기 테마</h2>
                  {selectedTheme ? (
                    <WebButton
                      onClick={() => onSelectTheme(selectedTheme.id)}
                      size="sm"
                      variant="ghost"
                    >
                      전체 보기
                    </WebButton>
                  ) : null}
                </div>
                <div className="web-theme-rail web-theme-rail-side">
                  {themes.map((theme, index) => (
                    <button
                      aria-pressed={selectedTheme?.id === theme.id}
                      className={[
                        "web-theme-card",
                        selectedTheme?.id === theme.id ? "web-theme-card-active" : "",
                      ].join(" ")}
                      key={theme.id}
                      onClick={() => onSelectTheme(theme.id)}
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
          </aside>
        </div>
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
  const { hiddenTagCount, visibleTags } = getWebHomeTagPreview(recipe.tags);
  const hasTags = visibleTags.length > 0 || hiddenTagCount > 0;

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
            hasTags ? (
              <>
                {visibleTags.map((tag) => (
                  <span className="web-recipe-card-tag" key={tag}>
                    {tag}
                  </span>
                ))}
                {hiddenTagCount > 0 ? (
                  <span
                    aria-label={`숨긴 태그 ${hiddenTagCount}개`}
                    className="web-recipe-card-tag web-recipe-card-tag-more"
                  >
                    +{hiddenTagCount}
                  </span>
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

function HomeQuickLinks({ variant }: { variant: "mobile" | "web" }) {
  return (
    <nav
      aria-label="홈 빠른 이동"
      className={variant === "mobile" ? "home-mobile-shortcuts" : "web-home-shortcuts"}
    >
      {HOME_QUICK_LINKS.map((item) => (
        <Link
          className={variant === "mobile" ? "home-mobile-shortcut" : "web-home-shortcut"}
          href={item.href}
          key={item.href}
        >
          <span
            aria-hidden="true"
            className={variant === "mobile" ? "home-mobile-shortcut-icon" : "web-home-shortcut-icon"}
          >
            <HomeShortcutIcon icon={item.icon} />
          </span>
          <span className={variant === "mobile" ? "home-mobile-shortcut-copy" : "web-home-shortcut-copy"}>
            <strong>{item.label}</strong>
            <small>{item.description}</small>
          </span>
        </Link>
      ))}
    </nav>
  );
}

function ProfileSummaryButton({
  gamification,
  isAuthenticated,
  profile,
  progress,
  variant,
}: {
  gamification: UserGamificationData | null;
  isAuthenticated: boolean;
  profile: UserProfileData | null;
  progress: UserProgressData | null;
  variant: "mobile" | "web";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const fallbackInitial = profile?.nickname?.slice(0, 1).toUpperCase() ?? null;
  const hasSummaryData = Boolean(profile || progress || gamification);
  const isGuestSummary = !isAuthenticated && !hasSummaryData;
  const isLoadingSummary = isAuthenticated && !hasSummaryData;
  const displayName = profile?.nickname ?? "집밥러";
  const gradeLabel =
    gamification?.grade.label ??
    "새싹 집밥러";
  const level =
    gamification?.level.current_level ?? progress?.level.current_level ?? 1;
  const cookingCount = progress?.event_counts.cooking_completed ?? 0;
  const plannerCount =
    (progress?.event_counts.planner_registered_first ?? 0) +
    (progress?.event_counts.planner_registered_repeat ?? 0);
  const shoppingCount = progress?.event_counts.shopping_completed ?? 0;
  const quest =
    gamification?.quests.active.find((item) => item.quest_type === "tutorial") ??
    gamification?.quests.active[0] ??
    null;
  const notificationTitle =
    gamification?.notifications.priority_unseen[0]?.title ??
    (quest ? "튜토리얼 안내" : "알림");
  const notificationMessage =
    gamification?.notifications.priority_unseen[0]?.body ??
    (quest ? `${quest.title}부터 차근차근 시작해 보세요.` : "새로운 알림이 없어요.");

  return (
    <div className={`profile-summary profile-summary-${variant}`}>
      <button
        aria-expanded={isOpen}
        aria-label={
          profile?.nickname
            ? `${profile.nickname} 프로필 요약 ${isOpen ? "닫기" : "열기"}`
            : `내 프로필 요약 ${isOpen ? "닫기" : "열기"}`
        }
        className="web-profile-button"
        data-testid={`${variant}-profile-summary-button`}
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        {profile?.profile_image_url ? (
          <Image
            alt=""
            className="web-profile-button-image"
            height={40}
            src={profile.profile_image_url}
            unoptimized
            width={40}
          />
        ) : fallbackInitial ? (
          <span aria-hidden="true" className="web-profile-button-fallback">
            {fallbackInitial}
          </span>
        ) : (
          <UserIcon />
        )}
      </button>

      {isOpen ? (
        <section
          aria-label="마이페이지 요약"
          className="profile-summary-popover"
          data-testid={`${variant}-profile-summary-popover`}
          role="dialog"
        >
          {isGuestSummary ? (
            <>
              <div className="profile-summary-head">
                <div>
                  <strong>로그인이 필요해요</strong>
                  <span>로그인하면 기록과 알림을 볼 수 있어요.</span>
                </div>
              </div>
              <Link className="profile-summary-link" href="/mypage">
                마이페이지로 이동
              </Link>
            </>
          ) : isLoadingSummary ? (
            <>
              <div className="profile-summary-head">
                <div>
                  <strong>요약을 불러오는 중이에요</strong>
                  <span>잠시만 기다려 주세요.</span>
                </div>
              </div>
              <Link className="profile-summary-link" href="/mypage">
                마이페이지로 이동
              </Link>
            </>
          ) : (
            <>
              <div className="profile-summary-head">
                <div>
                  <strong>{displayName}</strong>
                  <span>{gradeLabel}</span>
                </div>
                <b>Lv.{level}</b>
              </div>
              <div className="profile-summary-stats" aria-label="기록 요약">
                <span>
                  <b>{cookingCount}</b>
                  요리기록
                </span>
                <span>
                  <b>{plannerCount}</b>
                  플래너기록
                </span>
                <span>
                  <b>{shoppingCount}</b>
                  장보기기록
                </span>
              </div>
              <div className="profile-summary-notice" role="status">
                <strong>{notificationTitle}</strong>
                {quest ? <span>{quest.title}</span> : null}
                <span>{notificationMessage}</span>
              </div>
              <Link className="profile-summary-link" href="/mypage">
                마이페이지로 이동
              </Link>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}

function HomeShortcutIcon({
  icon,
}: {
  icon: (typeof HOME_QUICK_LINKS)[number]["icon"];
}) {
  if (icon === "calendar") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="M7 4v3M17 4v3M5 9h14" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
        <rect height="15" rx="3" stroke="currentColor" strokeWidth="1.8" width="16" x="4" y="6" />
      </svg>
    );
  }

  if (icon === "cart") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="M5 5h2l1.2 9h8.4l1.7-6.2H8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
        <circle cx="10" cy="18" r="1.4" fill="currentColor" />
        <circle cx="16" cy="18" r="1.4" fill="currentColor" />
      </svg>
    );
  }

  if (icon === "book") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 0 5 21.5v-16Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
        <path d="M5 17.5A2.5 2.5 0 0 1 7.5 15H19" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </svg>
    );
  }

  if (icon === "youtube") {
    return (
      <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
        <rect height="13" rx="4" stroke="currentColor" strokeWidth="1.8" width="18" x="3" y="5.5" />
        <path d="m10.5 9 4 2.5-4 2.5V9Z" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
      <path d="M12 20V4M6 10l6-6 6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M8 8h8" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function HomeAppBar({
  gamification,
  isAuthenticated,
  profile,
  progress,
}: {
  gamification: UserGamificationData | null;
  isAuthenticated: boolean;
  profile: UserProfileData | null;
  progress: UserProgressData | null;
}) {
  return (
    <header className="sticky top-0 z-20 flex min-h-[var(--control-height-xl)] items-center justify-between border-b border-[var(--line-strong)] bg-[var(--surface)] px-4" style={{ borderBottomWidth: "0.5px" }}>
      <h1 className="text-[18px] font-bold leading-none text-[var(--brand)]">집밥</h1>
      <ProfileSummaryButton
        gamification={gamification}
        isAuthenticated={isAuthenticated}
        profile={profile}
        progress={progress}
        variant="mobile"
      />
    </header>
  );
}

function HomeTagRail({
  activeTagKey,
  onRetry,
  onSelectTag,
  tagOptions,
  tagState,
  variant,
}: {
  activeTagKey: string | null;
  onRetry: () => void;
  onSelectTag: (tag: RecipeTagItem) => void;
  tagOptions: RecipeTagItem[];
  tagState: AsyncState;
  variant: "mobile" | "web" | "webAside";
}) {
  if (tagState === "loading") {
    return (
      <div
        className={
          variant === "webAside"
            ? "web-home-aside-chip-row"
            : variant === "web"
            ? "web-filter-chip-row"
            : "home-mobile-tag-rail"
        }
        aria-label="태그 불러오는 중"
      >
        {Array.from({ length: 4 }).map((_, index) => (
          <span
            className="h-8 w-16 shrink-0 rounded-[var(--radius-full)] bg-[var(--surface-fill)]"
            key={index}
          />
        ))}
      </div>
    );
  }

  if (tagState === "error") {
    return (
      <div
        className={
          variant === "webAside"
            ? "web-home-aside-chip-row"
            : variant === "web"
            ? "web-filter-chip-row"
            : "home-mobile-tag-rail"
        }
      >
        <span className="text-[12px] font-semibold text-[var(--text-3)]">
          태그를 불러오지 못했어요
        </span>
        <button
          className="text-[12px] font-bold text-[var(--brand)] underline-offset-2 hover:underline"
          onClick={onRetry}
          type="button"
        >
          다시 시도
        </button>
      </div>
    );
  }

  if (tagOptions.length === 0) {
    if (variant === "mobile") {
      return null;
    }

    return (
      <p className={variant === "webAside" ? "web-home-aside-empty" : "visually-hidden"}>
        추천 태그가 없어요
      </p>
    );
  }

  const containerClass =
    variant === "webAside"
      ? "web-home-aside-chip-row"
      : variant === "web"
      ? "web-filter-chip-row"
      : "home-mobile-tag-rail";

  return (
    <div className={containerClass} aria-label="태그 필터">
      {tagOptions.map((tag) => {
        const isActive = activeTagKey === tag.normalized_key;

        if (variant === "web" || variant === "webAside") {
          return (
            <WebChip
              active={isActive}
              key={tag.normalized_key}
              onClick={() => onSelectTag(tag)}
            >
              {tag.label}
            </WebChip>
          );
        }

        return (
          <button
            aria-pressed={isActive}
            className={[
              "home-mobile-filter-chip",
              isActive ? "home-mobile-filter-chip-active" : "",
            ].join(" ")}
            key={tag.normalized_key}
            onClick={() => onSelectTag(tag)}
            type="button"
          >
            {tag.label}
          </button>
        );
      })}
    </div>
  );
}

function ThemeCarousel({
  activeThemeId,
  embedded = false,
  onSelectTheme,
  themes,
}: {
  activeThemeId: string | null;
  embedded?: boolean;
  onSelectTheme: (themeId: string) => void;
  themes: RecipeTheme[];
}) {
  return (
    <section
      aria-label="이번 주 인기 테마"
      className={[
        "home-mobile-theme-section",
        embedded ? "home-mobile-theme-section-embedded" : "",
      ].join(" ")}
    >
      <div className="home-mobile-theme-header">
        <h2 className="home-mobile-theme-title">이번 주 인기 테마</h2>
        {activeThemeId ? (
          <button
            className="home-mobile-theme-reset"
            onClick={() => onSelectTheme(activeThemeId)}
            type="button"
          >
            필터 해제
          </button>
        ) : null}
      </div>
      <div className="home-mobile-theme-rail scrollbar-hide">
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
      className={[
        "home-mobile-theme-card",
        isActive ? "home-mobile-theme-card-active" : "",
      ].join(" ")}
      onClick={onClick}
      style={{
        backgroundImage: `url(${imageSrc})`,
      }}
      type="button"
    >
      <span className="home-mobile-theme-card-overlay" />
      <span className="home-mobile-theme-card-copy">
        <span className="home-mobile-theme-card-title">{theme.title}</span>
        <span className="home-mobile-theme-card-count">{theme.recipes.length}개 레시피</span>
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
    <section
      aria-label="이번 주 인기 테마 불러오는 중"
      className="home-mobile-theme-section"
    >
      <div className="home-mobile-theme-header">
        <Skeleton className="h-6 w-36 rounded-full" />
      </div>
      <div className="home-mobile-theme-rail overflow-hidden">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton
            key={index}
            className="h-[154px] w-[min(76vw,320px)] shrink-0 rounded-[var(--radius-card)]"
          />
        ))}
      </div>
    </section>
  );
}

function RecipeListSkeleton({ includeHeader = true }: { includeHeader?: boolean }) {
  return (
    <div className="space-y-4">
      {includeHeader ? <Skeleton className="h-6 w-32 rounded-full" /> : null}
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
