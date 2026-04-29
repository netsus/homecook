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
import { ModalHeader } from "@/components/shared/modal-header";
import { OptionRow } from "@/components/shared/option-row";
import { Skeleton } from "@/components/ui/skeleton";
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
  { label: "좋아요순", value: "like_count" },
  { label: "저장순", value: "save_count" },
  { label: "플래너 등록순", value: "plan_count" },
];

type ScreenState = "loading" | "ready" | "empty" | "error";
type AsyncState = "loading" | "ready";

export function HomeScreen() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sort, setSort] = useState<RecipeSortKey>("view_count");
  const [isSortMenuOpen, setSortMenuOpen] = useState(false);
  const [screenState, setScreenState] = useState<ScreenState>("loading");
  const [themeState, setThemeState] = useState<AsyncState>("loading");
  const [ingredientState, setIngredientState] = useState<AsyncState>("loading");
  const [recipes, setRecipes] = useState<RecipeListData | null>(null);
  const [themes, setThemes] = useState<RecipeThemesData | null>(null);
  const [quickIngredients, setQuickIngredients] = useState<IngredientItem[]>([]);
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
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
  const selectedSortLabel = useMemo(
    () => SORT_OPTIONS.find((option) => option.value === sort)?.label ?? "조회수순",
    [sort],
  );
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

  const selectSort = useCallback((nextSort: RecipeSortKey) => {
    setSort(nextSort);
    setSortMenuOpen(false);
    setActiveThemeId(null);
  }, []);

  const sortControlClassName =
    "flex min-h-11 items-center gap-1 whitespace-nowrap rounded-full bg-[#F8F9FA] px-3 text-sm font-extrabold text-[#495057]";

  return (
    <>
      <div
        className="min-h-screen bg-white text-[#212529]"
        style={
          {
            "--home-mint": "#2AC1BC",
            "--home-mint-deep": "#20A8A4",
            "--home-mint-soft": "#E6F8F7",
            "--home-bg": "#FFFFFF",
            "--home-ink": "#212529",
          } as React.CSSProperties
        }
      >
        <div className="mx-auto flex min-h-screen max-w-[430px] flex-col bg-white pb-[calc(86px+env(safe-area-inset-bottom))] shadow-[0_0_0_1px_rgba(33,37,41,0.04)]">
          <HomeAppBar />

          <div className="space-y-6 px-5 pb-6 pt-4">
            <section className="space-y-4">
              <div>
                <p className="text-[15px] font-bold text-[#495057]">목요일 저녁,</p>
                <h1 className="mt-1 text-[28px] font-black leading-tight text-[#212529]">
                  오늘은 뭐 해먹지?
                </h1>
              </div>

              <label className="flex h-12 items-center gap-2 rounded-full bg-[#F8F9FA] px-4 shadow-[inset_0_0_0_1px_rgba(233,236,239,0.8)]">
                <SearchIcon />
                <span className="visually-hidden">레시피 제목 검색</span>
                <input
                  className="w-full bg-transparent text-[15px] font-semibold text-[#212529] outline-none placeholder:text-[#495057]"
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveThemeId(null);
                  }}
                  placeholder="김치볶음밥, 된장찌개..."
                  value={query}
                />
              </label>

              <QuickIngredientRail
                appliedIngredientIds={appliedIngredientIds}
                ingredients={quickIngredients}
                isLoading={ingredientState === "loading"}
                onClear={clearIngredientFilters}
                onOpenModal={() => setIngredientModalOpen(true)}
                onToggle={toggleQuickIngredient}
              />
            </section>

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
              <section className="space-y-4" aria-label={listTitle}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-[20px] font-black text-[#212529]">
                      {listTitle}
                    </h2>
                    <span className="text-sm font-bold text-[#495057]">
                      ({displayedRecipes.length})
                    </span>
                  </div>
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

                {screenState === "loading" ? <RecipeListSkeleton /> : null}

                {screenState === "ready" && displayedRecipes.length ? (
                  <div className="grid grid-cols-1 gap-4">
                    {displayedRecipes.map((recipe) => (
                      <RecipeCard key={recipe.id} recipe={recipe} />
                    ))}
                  </div>
                ) : null}

                {showEmptyState ? (
                  <ContentState
                    actionLabel={hasIngredientFilter ? "초기화" : "검색 초기화"}
                    description="조건에 맞는 레시피가 없어요."
                    eyebrow="다른 조합"
                    tone="empty"
                    onAction={hasIngredientFilter ? clearIngredientFilters : clearSearch}
                    title="다른 조합을 찾아보세요"
                  />
                ) : null}
              </section>
            ) : null}
          </div>

          <HomeBottomTab />
        </div>
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

function HomeAppBar() {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[#F1F3F5] bg-white/96 px-5 backdrop-blur">
      <div className="grid h-9 w-9 place-items-center rounded-full bg-[#E6F8F7] text-sm font-black text-[#0B6F6C]">
        채
      </div>
      <div className="text-[18px] font-black tracking-normal text-[#0B6F6C]">
        homecook_
      </div>
      <button
        aria-label="장보기"
        className="grid h-9 w-9 place-items-center rounded-full bg-[#F8F9FA] text-[#212529]"
        type="button"
      >
        <BagIcon />
      </button>
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
  return (
    <div className="scrollbar-hide -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
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
                className={`h-11 shrink-0 rounded-full px-4 text-sm font-extrabold transition ${
                  isActive
                    ? "bg-[#0B6F6C] text-white shadow-[0_6px_14px_rgba(42,193,188,0.24)]"
                    : "bg-[#E6F8F7] text-[#0B6F6C]"
                }`}
                key={ingredient.id}
                onClick={() => onToggle(ingredient.id)}
                type="button"
              >
                {ingredient.standard_name}
              </button>
            );
          })}

      <button
        aria-label="재료 더보기"
        className="h-11 shrink-0 rounded-full bg-[#F8F9FA] px-4 text-sm font-extrabold text-[#495057]"
        onClick={onOpenModal}
        type="button"
      >
        더보기
      </button>

      {appliedIngredientIds.length > 0 ? (
        <button
          className="h-11 shrink-0 rounded-full border border-[#E9ECEF] bg-white px-4 text-sm font-extrabold text-[#495057]"
          onClick={onClear}
          type="button"
        >
          초기화
        </button>
      ) : null}
    </div>
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
    <section aria-label="테마별 레시피" className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[20px] font-black text-[#212529]">테마별 레시피</h2>
        <span className="text-xs font-black text-[#495057]">전체보기 ›</span>
      </div>
      <div className="scrollbar-hide -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
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
  const palette = [
    "linear-gradient(135deg,#E6F8F7,#FFF5C2)",
    "linear-gradient(135deg,#FFE8D6,#E6F8F7)",
    "linear-gradient(135deg,#E8F0FF,#F1F8E9)",
  ];
  const emoji = ["🍲", "🍚", "🥗", "🍳"][variantIndex % 4];
  const representative = theme.recipes[0];

  return (
    <button
      aria-pressed={isActive}
      className={`relative h-[132px] w-[148px] shrink-0 overflow-hidden rounded-[12px] p-3 text-left shadow-[0_8px_20px_rgba(33,37,41,0.10)] transition ${
        isActive ? "ring-2 ring-[#0B6F6C]" : ""
      }`}
      onClick={onClick}
      style={{ background: palette[variantIndex % palette.length] }}
      type="button"
    >
      <span className="absolute right-3 top-3 text-4xl" aria-hidden="true">
        {emoji}
      </span>
      <span className="relative z-10 mt-10 block max-w-[108px] text-[16px] font-black leading-tight text-[#212529]">
        {theme.title}
      </span>
      {representative ? (
        <span className="relative z-10 mt-2 line-clamp-1 block text-[11px] font-bold text-[#495057]">
          {representative.title}
        </span>
      ) : null}
    </button>
  );
}

function PromoStrip() {
  return (
    <Link
      className="flex min-h-[84px] items-center justify-between rounded-[16px] bg-[linear-gradient(135deg,#0B6F6C,#085F5C)] px-4 text-white shadow-[0_10px_24px_rgba(42,193,188,0.26)]"
      href="/planner"
    >
      <span>
        <span className="block text-[13px] font-bold opacity-85">
          오늘 저녁까지 2끼 남았어요
        </span>
        <span className="mt-1 block text-[19px] font-black">
          이번 주 식단 플래너
        </span>
      </span>
      <span className="text-4xl" aria-hidden="true">
        🍳
      </span>
    </Link>
  );
}

function HomeBottomTab() {
  const tabs = [
    { href: "/", icon: <HomeIcon />, isActive: true, label: "홈" },
    { href: "/planner", icon: <CalendarIcon />, isActive: false, label: "플래너" },
  ];
  const pendingTabs = [
    { icon: <PantryIcon />, label: "팬트리" },
    { icon: <UserIcon />, label: "마이" },
  ];

  return (
    <nav
      aria-label="HOME 하단 탭"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[430px] border-t border-[#E9ECEF] bg-white/96 px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur"
    >
      <div className="grid grid-cols-4">
        {tabs.map((tab) => (
          <Link
            aria-current={tab.isActive ? "page" : undefined}
            className={`flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-black ${
              tab.isActive ? "text-[#0B6F6C]" : "text-[#495057]"
            }`}
            href={tab.href}
            key={tab.label}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </Link>
        ))}
        {pendingTabs.map((tab) => (
          <button
            className="flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-black text-[#495057]"
            key={tab.label}
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
          "flex min-h-11 items-center gap-1 whitespace-nowrap bg-transparent text-sm font-semibold text-[var(--text-2)]"
        }
        onClick={onToggle}
        type="button"
      >
        <span className="truncate">{currentLabel}</span>
        <span
          aria-hidden="true"
          className={`shrink-0 text-[#495057] transition ${isOpen ? "rotate-180" : ""}`}
        >
          <ChevronIcon />
        </span>
      </button>
      {isOpen && !isDesktopView ? (
        <>
          <button
            aria-label="정렬 메뉴 닫기"
            className="fixed inset-0 z-30 bg-[rgba(33,37,41,0.42)] backdrop-blur-[1px] md:hidden"
            onClick={onClose}
            type="button"
          />
          <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[430px] rounded-t-[24px] border-t-2 border-t-[#0B6F6C] bg-white px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-16px_40px_rgba(33,37,41,0.16)] md:hidden">
            <div className="mx-auto h-1 w-9 rounded-sm bg-[#DEE2E6]" />
            <div className="mt-4">
              <ModalHeader
                description="모든 레시피 순서를 바꿔요"
                onClose={onClose}
                title="정렬 기준"
              />
            </div>
            <div aria-label="정렬 기준" className="mt-4 space-y-2" role="listbox">
              {options.map((option) => (
                <OptionRow
                  isSelected={option.value === selectedValue}
                  key={`mobile-${option.value}`}
                  label={option.label}
                  onClick={() => onSelect(option.value)}
                />
              ))}
            </div>
          </div>
        </>
      ) : null}
      {isOpen && isDesktopView ? (
        <div
          className={`absolute right-0 z-20 w-60 rounded-[16px] border border-[#E9ECEF] bg-white p-2 shadow-[0_12px_28px_rgba(33,37,41,0.14)] ${
            openAbove ? "bottom-[calc(100%+10px)]" : "top-[calc(100%+10px)]"
          }`}
          ref={desktopMenuRef}
        >
          <div aria-label="정렬 기준" className="space-y-1" role="listbox">
            {options.map((option) => (
              <OptionRow
                isSelected={option.value === selectedValue}
                key={`desktop-${option.value}`}
                label={option.label}
                onClick={() => onSelect(option.value)}
              />
            ))}
          </div>
        </div>
      ) : null}
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

function BagIcon() {
  return (
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
      <path d="M6 7h12l-1 13H7L6 7Z" />
      <path d="M9 7a3 3 0 0 1 6 0" />
    </svg>
  );
}

function HomeIcon() {
  return (
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
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10.5V20h14v-9.5" />
    </svg>
  );
}

function CalendarIcon() {
  return (
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
      <path d="M7 3v3M17 3v3M4 8h16M5 5h14v15H5z" />
    </svg>
  );
}

function PantryIcon() {
  return (
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
      className="h-5 w-5"
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
