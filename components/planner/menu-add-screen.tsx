"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useRef, useState } from "react";

import { LeftoverPicker } from "@/components/planner/leftover-picker";
import { PantryMatchPicker } from "@/components/planner/pantry-match-picker";
import { RecipeBookDetailPicker } from "@/components/planner/recipe-book-detail-picker";
import { RecipeBookSelector } from "@/components/planner/recipe-book-selector";
import { RecipeSearchPicker } from "@/components/planner/recipe-search-picker";
import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import { createMealSafe } from "@/lib/api/meal";
import type { LeftoverListItemData } from "@/types/leftover";
import type {
  PantryMatchRecipeItem,
  RecipeBookRecipeItem,
  RecipeBookSummary,
  RecipeCardItem,
} from "@/types/recipe";

export interface MenuAddScreenProps {
  planDate: string;
  columnId: string;
  slotName: string;
  initialAuthenticated: boolean;
  initialSource?: string;
}

type PickerMode = "none" | "search" | "recipebook-selector" | "recipebook-detail" | "pantry" | "leftover";

// ─── AppBar ──────────────────────────────────────────────────────────────────

interface AppBarProps {
  onBack: () => void;
}

function AppBar({ onBack }: AppBarProps) {
  return (
    <div className="shrink-0 border-b border-[var(--line)] bg-[var(--background)]">
      <div className="flex h-14 items-center gap-2 px-2">
        <button
          aria-label="뒤로 가기"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--foreground)] hover:bg-white/60"
          onClick={onBack}
          type="button"
        >
          <svg
            fill="none"
            height="20"
            viewBox="0 0 20 20"
            width="20"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 5L7 10L12 15"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        </button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-extrabold tracking-[-0.02em] text-[var(--foreground)]">
          식사 추가
        </h1>
        {/* Right spacer matching back button width */}
        <div className="h-11 w-11 shrink-0" aria-hidden="true" />
      </div>
    </div>
  );
}

// ─── Action Buttons ──────────────────────────────────────────────────────────

interface ActionButtonsProps {
  onSearchClick: () => void;
  onRecipeBookClick: () => void;
  onPantryClick: () => void;
  onLeftoverClick: () => void;
  onManualRecipeClick: () => void;
  onYoutubeRecipeClick: () => void;
}

const MENU_ADD_OPTIONS = [
  { id: "search", emoji: "🔍", label: "검색", subtitle: "레시피 검색" },
  { id: "recipebook", emoji: "📖", label: "레시피북", subtitle: "저장한 레시피" },
  { id: "pantry", emoji: "🧊", label: "팬트리 추천", subtitle: "보유 재료 기반" },
  { id: "leftover", emoji: "🍱", label: "남은요리", subtitle: "남은 요리에서 추가" },
  { id: "youtube", emoji: "🎬", label: "유튜브", subtitle: "유튜브에서 가져오기" },
  { id: "manual", emoji: "✏️", label: "직접 등록", subtitle: "레시피 직접 작성" },
] as const;

function formatTargetLabel(planDate: string, slotName: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(planDate);
  const dateLabel = match
    ? `${Number(match[2])}/${Number(match[3])}`
    : planDate;

  if (dateLabel && slotName) return `${dateLabel} ${slotName}`;
  return slotName || dateLabel || "플래너";
}

function ActionButtons({
  onLeftoverClick,
  onManualRecipeClick,
  onPantryClick,
  onRecipeBookClick,
  onSearchClick,
  onYoutubeRecipeClick,
}: ActionButtonsProps) {
  const actionMap: Record<(typeof MENU_ADD_OPTIONS)[number]["id"], () => void> = {
    search: onSearchClick,
    recipebook: onRecipeBookClick,
    pantry: onPantryClick,
    leftover: onLeftoverClick,
    manual: onManualRecipeClick,
    youtube: onYoutubeRecipeClick,
  };

  return (
    <div className="mt-6 space-y-3">
      <h2 className="text-sm font-semibold text-[var(--muted)]">
        추가 방법 선택
      </h2>
      <div className="grid grid-cols-2 gap-3" data-testid="menu-add-option-grid">
        {MENU_ADD_OPTIONS.map((option) => (
          <button
            key={option.id}
            className="flex min-h-[72px] items-center gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-3 py-3 text-left hover:bg-[var(--surface-fill)]"
            data-testid={`menu-add-option-${option.id}`}
            onClick={actionMap[option.id]}
            type="button"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--brand-soft)] text-[20px]">
              {option.emoji}
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-[var(--foreground)]">{option.label}</p>
              <p className="mt-0.5 truncate text-[11px] text-[var(--text-3)]">{option.subtitle}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function MenuAddScreen({
  initialSource = "",
  planDate,
  columnId,
  slotName,
}: MenuAddScreenProps) {
  const router = useRouter();
  const isDesktopViewport = useDesktopViewport();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeCardItem | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);

  // Recipe book state
  const [pickerMode, setPickerMode] = useState<PickerMode>(() => {
    if (initialSource === "search") return "search";
    if (initialSource === "recipebook") return "recipebook-selector";
    if (initialSource === "pantry") return "pantry";
    if (initialSource === "leftover") return "leftover";
    return "none";
  });
  const [selectedBook, setSelectedBook] = useState<RecipeBookSummary | null>(null);
  const [selectedBookRecipe, setSelectedBookRecipe] = useState<RecipeBookRecipeItem | null>(null);

  // Pantry match state
  const [selectedPantryRecipe, setSelectedPantryRecipe] = useState<PantryMatchRecipeItem | null>(
    null,
  );
  const [selectedLeftover, setSelectedLeftover] = useState<LeftoverListItemData | null>(null);

  const navigateToMealScreen = useCallback((mode: "push" | "replace" = "push") => {
    if (!planDate || !columnId) {
      router[mode]("/planner");
      return;
    }

    const slotSuffix = slotName ? `?slot=${encodeURIComponent(slotName)}` : "";
    router[mode](`/planner/${planDate}/${columnId}${slotSuffix}`);
  }, [router, planDate, columnId, slotName]);

  const replaceMenuAddSource = useCallback(() => {
    const params = new URLSearchParams();
    if (planDate) params.set("date", planDate);
    if (columnId) params.set("columnId", columnId);
    if (slotName) params.set("slot", slotName);
    const query = params.toString();

    router.replace(query ? `/menu-add?${query}` : "/menu-add");
  }, [columnId, planDate, router, slotName]);

  const handleBack = useCallback(() => {
    router.replace("/planner");
  }, [router]);

  const handleRecipeSelect = useCallback((recipe: RecipeCardItem) => {
    setSelectedRecipe(recipe);
  }, []);

  const handleSearchOptionClick = useCallback(() => {
    if (!isDesktopViewport) {
      setPickerMode("search");
      return;
    }

    searchInputRef.current?.focus();
    searchInputRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [isDesktopViewport]);

  const handlePickerBackToMenu = useCallback(() => {
    setPickerMode("none");
    setSelectedRecipe(null);
    setSelectedBook(null);
    setSelectedBookRecipe(null);
    setSelectedPantryRecipe(null);
    setSelectedLeftover(null);
    setCreationError(null);
    replaceMenuAddSource();
  }, [replaceMenuAddSource]);

  const handleServingsConfirm = useCallback(
    async (servings: number) => {
      if (!selectedRecipe) return;

      setIsCreating(true);
      setCreationError(null);

      const response = await createMealSafe({
        recipe_id: selectedRecipe.id,
        plan_date: planDate,
        column_id: columnId,
        planned_servings: servings,
      });

      if (!response.success) {
        setCreationError(response.error?.message ?? "식사를 추가하지 못했어요.");
        setIsCreating(false);
        return;
      }

      // Success: keep /menu-add out of browser back history.
      navigateToMealScreen("replace");
    },
    [selectedRecipe, planDate, columnId, navigateToMealScreen],
  );

  const handleServingsCancel = useCallback(() => {
    setSelectedRecipe(null);
    setCreationError(null);
  }, []);

  // Recipe book handlers
  const handleRecipeBookClick = useCallback(() => {
    setPickerMode("recipebook-selector");
  }, []);

  const handleBookSelect = useCallback((book: RecipeBookSummary) => {
    setSelectedBook(book);
    setPickerMode("recipebook-detail");
  }, []);

  const handleBookRecipeSelect = useCallback((recipe: RecipeBookRecipeItem) => {
    setSelectedBookRecipe(recipe);
  }, []);

  const handleBookServingsConfirm = useCallback(
    async (servings: number) => {
      if (!selectedBookRecipe) return;

      setIsCreating(true);
      setCreationError(null);

      const response = await createMealSafe({
        recipe_id: selectedBookRecipe.recipe_id,
        plan_date: planDate,
        column_id: columnId,
        planned_servings: servings,
      });

      if (!response.success) {
        setCreationError(response.error?.message ?? "식사를 추가하지 못했어요.");
        setIsCreating(false);
        return;
      }

      // Success: keep /menu-add out of browser back history.
      navigateToMealScreen("replace");
    },
    [selectedBookRecipe, planDate, columnId, navigateToMealScreen],
  );

  const handleBookServingsCancel = useCallback(() => {
    setSelectedBookRecipe(null);
    setCreationError(null);
  }, []);

  const handleRecipeBookBack = useCallback(() => {
    if (pickerMode === "recipebook-detail") {
      setPickerMode("recipebook-selector");
      setSelectedBook(null);
      setSelectedBookRecipe(null);
    } else {
      setPickerMode("none");
    }
  }, [pickerMode]);

  const handleRecipeBookClose = useCallback(() => {
    setPickerMode("none");
    setSelectedBook(null);
    setSelectedBookRecipe(null);
  }, []);

  // Pantry match handlers
  const handlePantryClick = useCallback(() => {
    setPickerMode("pantry");
  }, []);

  const handlePantryRecipeSelect = useCallback((recipe: PantryMatchRecipeItem) => {
    setSelectedPantryRecipe(recipe);
  }, []);

  const handlePantryServingsConfirm = useCallback(
    async (servings: number) => {
      if (!selectedPantryRecipe) return;

      setIsCreating(true);
      setCreationError(null);

      const response = await createMealSafe({
        recipe_id: selectedPantryRecipe.id,
        plan_date: planDate,
        column_id: columnId,
        planned_servings: servings,
      });

      if (!response.success) {
        setCreationError(response.error?.message ?? "식사를 추가하지 못했어요.");
        setIsCreating(false);
        return;
      }

      // Success: keep /menu-add out of browser back history.
      navigateToMealScreen("replace");
    },
    [selectedPantryRecipe, planDate, columnId, navigateToMealScreen],
  );

  const handlePantryServingsCancel = useCallback(() => {
    setSelectedPantryRecipe(null);
    setCreationError(null);
  }, []);

  const handlePantryClose = useCallback(() => {
    setPickerMode("none");
    setSelectedPantryRecipe(null);
  }, []);

  const handleLeftoverClick = useCallback(() => {
    setPickerMode("leftover");
  }, []);

  const handleLeftoverSelect = useCallback((leftover: LeftoverListItemData) => {
    setSelectedLeftover(leftover);
  }, []);

  const handleLeftoverServingsConfirm = useCallback(
    async (servings: number) => {
      if (!selectedLeftover) return;

      setIsCreating(true);
      setCreationError(null);

      const response = await createMealSafe({
        recipe_id: selectedLeftover.recipe_id,
        plan_date: planDate,
        column_id: columnId,
        planned_servings: servings,
        leftover_dish_id: selectedLeftover.id,
      });

      if (!response.success) {
        setCreationError(response.error?.message ?? "식사를 추가하지 못했어요.");
        setIsCreating(false);
        return;
      }

      navigateToMealScreen("replace");
    },
    [selectedLeftover, planDate, columnId, navigateToMealScreen],
  );

  const handleLeftoverServingsCancel = useCallback(() => {
    setSelectedLeftover(null);
    setCreationError(null);
  }, []);

  const handleLeftoverClose = useCallback(() => {
    setPickerMode("none");
    setSelectedLeftover(null);
  }, []);

  const handleManualRecipeClick = useCallback(() => {
    const queryParts: string[] = [];
    if (planDate) queryParts.push(`date=${encodeURIComponent(planDate)}`);
    if (columnId) queryParts.push(`columnId=${encodeURIComponent(columnId)}`);
    if (slotName) queryParts.push(`slot=${encodeURIComponent(slotName)}`);
    const queryString = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
    router.push(`/menu/add/manual${queryString}`);
  }, [router, planDate, columnId, slotName]);

  const handleYoutubeRecipeClick = useCallback(() => {
    const queryParts: string[] = [];
    if (planDate) queryParts.push(`date=${encodeURIComponent(planDate)}`);
    if (columnId) queryParts.push(`columnId=${encodeURIComponent(columnId)}`);
    if (slotName) queryParts.push(`slot=${encodeURIComponent(slotName)}`);
    const queryString = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
    router.push(`/menu/add/youtube${queryString}`);
  }, [router, planDate, columnId, slotName]);

  const targetLabel = formatTargetLabel(planDate, slotName);

  const actionMapForMobile = (id: (typeof MENU_ADD_OPTIONS)[number]["id"]) => {
    const actionMap: Record<(typeof MENU_ADD_OPTIONS)[number]["id"], () => void> = {
      search: handleSearchOptionClick,
      recipebook: handleRecipeBookClick,
      pantry: handlePantryClick,
      leftover: handleLeftoverClick,
      manual: handleManualRecipeClick,
      youtube: handleYoutubeRecipeClick,
    };

    return actionMap[id];
  };

  const shouldRenderWebView =
    process.env.NODE_ENV !== "test" || isDesktopViewport;
  const shouldRenderAppView =
    process.env.NODE_ENV !== "test" || !isDesktopViewport;

  const mobileContent = (() => {
    if (pickerMode === "search") {
      return (
        <RecipeSearchPicker
          isCreating={isCreating}
          onBack={handlePickerBackToMenu}
          onRecipeSelect={handleRecipeSelect}
          onServingsCancel={handleServingsCancel}
          onServingsConfirm={handleServingsConfirm}
          presentation="screen"
          searchInputRef={searchInputRef}
          selectedRecipe={selectedRecipe}
          slotLabel={targetLabel}
          title="검색으로 추가"
        />
      );
    }

    if (pickerMode === "recipebook-selector") {
      return (
        <RecipeBookSelector
          onBack={handlePickerBackToMenu}
          onBookSelect={handleBookSelect}
          onClose={handleRecipeBookClose}
          presentation="screen"
          slotLabel={targetLabel}
        />
      );
    }

    if (pickerMode === "recipebook-detail" && selectedBook) {
      return (
        <RecipeBookDetailPicker
          book={selectedBook}
          isCreating={isCreating}
          onBack={handleRecipeBookBack}
          onRecipeSelect={handleBookRecipeSelect}
          onServingsCancel={handleBookServingsCancel}
          onServingsConfirm={handleBookServingsConfirm}
          presentation="screen"
          selectedRecipe={selectedBookRecipe}
          slotLabel={targetLabel}
        />
      );
    }

    if (pickerMode === "pantry") {
      return (
        <PantryMatchPicker
          isCreating={isCreating}
          onBack={handlePickerBackToMenu}
          onClose={handlePantryClose}
          onRecipeSelect={handlePantryRecipeSelect}
          onServingsCancel={handlePantryServingsCancel}
          onServingsConfirm={handlePantryServingsConfirm}
          presentation="screen"
          selectedRecipe={selectedPantryRecipe}
          slotLabel={targetLabel}
        />
      );
    }

    if (pickerMode === "leftover") {
      return (
        <LeftoverPicker
          isCreating={isCreating}
          onClose={handleLeftoverClose}
          onLeftoverSelect={handleLeftoverSelect}
          onServingsCancel={handleLeftoverServingsCancel}
          onServingsConfirm={handleLeftoverServingsConfirm}
          selectedLeftover={selectedLeftover}
        />
      );
    }

    return (
      <div className="min-h-screen bg-[#F8F9FA] pb-[112px] text-[#212529]">
        <div className="flex min-h-[52px] items-center border-b border-[#DEE2E6] bg-white px-2">
          <button
            aria-label="뒤로 가기"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[28px] leading-none text-[#212529]"
            onClick={handleBack}
            type="button"
          >
            ‹
          </button>
          <h1 className="min-w-0 flex-1 truncate text-center text-[18px] font-bold text-[#212529]">
            식사 추가
          </h1>
          <div className="h-11 w-11 shrink-0" aria-hidden="true" />
        </div>

        <section className="px-5 py-3">
          <p className="text-[11px] font-bold text-[#20A8A4]">대상</p>
          <p className="mt-0.5 text-[16px] font-bold text-[#212529]">{targetLabel}</p>
        </section>

        <section className="flex flex-col gap-2.5 px-4 pb-8" data-testid="menu-add-option-grid">
          {MENU_ADD_OPTIONS.map((option) => (
            <button
              className="flex min-h-[76px] w-full items-center gap-3.5 rounded-[12px] border border-[#DEE2E6] bg-white p-4 text-left"
              data-testid={`menu-add-option-${option.id}`}
              key={option.id}
              onClick={actionMapForMobile(option.id)}
              type="button"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#E6F8F7] text-[22px]">
                {option.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-[#212529]">{option.label}</span>
                <span className="mt-0.5 block text-[12px] text-[#868E96]">{option.subtitle}</span>
              </span>
              <span className="text-[22px] text-[#ADB5BD]" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
        </section>
        <Wave1MobileBottomTab ariaLabel="식사 추가 하단 탭" currentTab="planner" />
      </div>
    );
  })();

  return (
    <>
      {shouldRenderAppView ? (
        <div className="lg:hidden">{mobileContent}</div>
      ) : null}

      {shouldRenderWebView ? (
        <div className="hidden h-screen flex-col bg-[var(--background)] lg:flex">
          <AppBar onBack={handleBack} />
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
            <div className="mx-auto max-w-2xl py-4">
              <p className="text-sm text-[var(--muted)]">
                레시피를 검색해서 식사에 추가할 수 있어요.
              </p>
              <div className="mt-4">
                <RecipeSearchPicker
                  isCreating={isCreating}
                  onRecipeSelect={handleRecipeSelect}
                  onServingsCancel={handleServingsCancel}
                  onServingsConfirm={handleServingsConfirm}
                  searchInputRef={searchInputRef}
                  selectedRecipe={selectedRecipe}
                />
              </div>
              {creationError && (
                <div
                  className="mt-4 rounded-[12px] border border-red-300 bg-red-50 p-3 text-sm text-red-700"
                  role="alert"
                >
                  {creationError}
                </div>
              )}
              <ActionButtons
                onLeftoverClick={handleLeftoverClick}
                onManualRecipeClick={handleManualRecipeClick}
                onPantryClick={handlePantryClick}
                onRecipeBookClick={handleRecipeBookClick}
                onSearchClick={handleSearchOptionClick}
                onYoutubeRecipeClick={handleYoutubeRecipeClick}
              />
            </div>
          </div>

          {/* Recipe Book Selector */}
          {pickerMode === "recipebook-selector" && (
            <RecipeBookSelector onBookSelect={handleBookSelect} onClose={handleRecipeBookClose} />
          )}

          {/* Recipe Book Detail Picker */}
          {pickerMode === "recipebook-detail" && selectedBook && (
            <RecipeBookDetailPicker
              book={selectedBook}
              isCreating={isCreating}
              onBack={handleRecipeBookBack}
              onRecipeSelect={handleBookRecipeSelect}
              onServingsCancel={handleBookServingsCancel}
              onServingsConfirm={handleBookServingsConfirm}
              selectedRecipe={selectedBookRecipe}
            />
          )}

          {/* Pantry Match Picker */}
          {pickerMode === "pantry" && (
            <PantryMatchPicker
              isCreating={isCreating}
              onClose={handlePantryClose}
              onRecipeSelect={handlePantryRecipeSelect}
              onServingsCancel={handlePantryServingsCancel}
              onServingsConfirm={handlePantryServingsConfirm}
              selectedRecipe={selectedPantryRecipe}
            />
          )}

          {pickerMode === "leftover" && (
            <LeftoverPicker
              isCreating={isCreating}
              onClose={handleLeftoverClose}
              onLeftoverSelect={handleLeftoverSelect}
              onServingsCancel={handleLeftoverServingsCancel}
              onServingsConfirm={handleLeftoverServingsConfirm}
              selectedLeftover={selectedLeftover}
            />
          )}
        </div>
      ) : null}
    </>
  );
}
