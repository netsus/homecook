"use client";

import { useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";

import { LeftoverPicker } from "@/components/planner/leftover-picker";
import { MealAddTargetBadge } from "@/components/planner/meal-add-target-badge";
import { PantryMatchPicker } from "@/components/planner/pantry-match-picker";
import { RecipeBookDetailPicker } from "@/components/planner/recipe-book-detail-picker";
import { RecipeBookSelector } from "@/components/planner/recipe-book-selector";
import { RecipeSearchPicker } from "@/components/planner/recipe-search-picker";
import { YoutubeImportEntrySheet } from "@/components/planner/youtube-import-entry-sheet";
import { ManualRecipeCreateScreen } from "@/components/recipe/manual-recipe-create-screen";
import { YoutubeImportScreen } from "@/components/recipe/youtube-import-screen";
import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
import {
  AppBackButton,
  AppBackButtonSpacer,
} from "@/components/shared/app-back-button";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import { useAppReturn } from "@/components/shared/use-app-return";
import {
  WebButton,
  WebCard,
  WebShell,
  WebTopNav,
} from "@/components/web";
import { createMealSafe } from "@/lib/api/meal";
import { buildReturnHref } from "@/lib/navigation/return-context";
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
  initialSource?: string;
}

type PickerMode =
  | "none"
  | "search"
  | "recipebook-selector"
  | "recipebook-detail"
  | "pantry"
  | "leftover"
  | "manual"
  | "youtube";

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "홈" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

const MENU_ADD_OPTIONS = [
  { id: "search", emoji: "🔍", label: "레시피 검색" },
  { id: "recipebook", emoji: "📖", label: "레시피북" },
  { id: "pantry", emoji: "🧊", label: "팬트리에서 찾기" },
  { id: "leftover", emoji: "🍱", label: "남은 요리" },
  { id: "youtube", emoji: "🎬", label: "유튜브" },
  { id: "manual", emoji: "✏️", label: "직접 등록" },
] as const;

function formatTargetLabel(planDate: string, slotName: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(planDate);
  const dateLabel = match
    ? `${Number(match[2])}/${Number(match[3])}`
    : planDate;

  if (dateLabel && slotName) return `${dateLabel} ${slotName}`;
  return slotName || dateLabel || "플래너";
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function MenuAddScreen({
  initialSource = "",
  planDate,
  columnId,
  slotName,
}: MenuAddScreenProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appReturn = useAppReturn({
    fallback:
      planDate && columnId
        ? `/planner/${planDate}/${columnId}${slotName ? `?slot=${encodeURIComponent(slotName)}` : ""}`
        : "/planner",
  });
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
    if (initialSource === "manual") return "manual";
    if (initialSource === "youtube") return "youtube";
    return "none";
  });
  const [selectedBook, setSelectedBook] = useState<RecipeBookSummary | null>(null);
  const [selectedBookRecipe, setSelectedBookRecipe] = useState<RecipeBookRecipeItem | null>(null);

  // Pantry match state
  const [selectedPantryRecipe, setSelectedPantryRecipe] = useState<PantryMatchRecipeItem | null>(
    null,
  );
  const [selectedLeftover, setSelectedLeftover] = useState<LeftoverListItemData | null>(null);

  // Bumped to force the active web picker to remount (re-fetch + clear its own
  // internal state) when the user re-clicks the option they're already on.
  const [pickerNonce, setPickerNonce] = useState(0);

  const isMealAddModalOrigin =
    searchParams.get("restore") === "meal-add-modal" ||
    searchParams.get("returnSurface") === "planner.meal-add-modal";

  const mealAddParams = new URLSearchParams();
  if (planDate) mealAddParams.set("date", planDate);
  if (columnId) mealAddParams.set("columnId", columnId);
  if (slotName) mealAddParams.set("slot", slotName);
  const mealAddQuery = mealAddParams.toString();

  const navigateToMealScreen = useCallback((mode: "push" | "replace" = "push") => {
    if (!planDate || !columnId) {
      router[mode]("/planner");
      return;
    }

    const slotSuffix = slotName ? `?slot=${encodeURIComponent(slotName)}` : "";
    router[mode](`/planner/${planDate}/${columnId}${slotSuffix}`);
  }, [router, planDate, columnId, slotName]);

  const replaceMenuAddSource = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("source");
    if (planDate) params.set("date", planDate);
    if (columnId) params.set("columnId", columnId);
    if (slotName) params.set("slot", slotName);
    const query = params.toString();

    router.replace(query ? `/menu-add?${query}` : "/menu-add");
  }, [columnId, planDate, router, searchParams, slotName]);

  const handleBack = useCallback(() => {
    appReturn.goBack();
  }, [appReturn]);

  const handleRecipeSelect = useCallback((recipe: RecipeCardItem) => {
    setSelectedRecipe(recipe);
  }, []);

  const handleSearchOptionClick = useCallback(() => {
    setPickerMode("search");
  }, []);

  useEffect(() => {
    if (!isDesktopViewport || pickerMode !== "search") {
      return;
    }

    searchInputRef.current?.focus();
    searchInputRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [isDesktopViewport, pickerMode]);

  const handlePickerBackToMenu = useCallback(() => {
    if (initialSource && isMealAddModalOrigin) {
      appReturn.goBack();
      return;
    }

    setPickerMode("none");
    setSelectedRecipe(null);
    setSelectedBook(null);
    setSelectedBookRecipe(null);
    setSelectedPantryRecipe(null);
    setSelectedLeftover(null);
    setCreationError(null);
    replaceMenuAddSource();
  }, [appReturn, initialSource, isMealAddModalOrigin, replaceMenuAddSource]);

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
    if (initialSource && isMealAddModalOrigin) {
      appReturn.goBack();
      return;
    }

    setPickerMode("none");
    setSelectedBook(null);
    setSelectedBookRecipe(null);
  }, [appReturn, initialSource, isMealAddModalOrigin]);

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
    if (initialSource && isMealAddModalOrigin) {
      appReturn.goBack();
      return;
    }

    setPickerMode("none");
    setSelectedPantryRecipe(null);
  }, [appReturn, initialSource, isMealAddModalOrigin]);

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
    if (initialSource && isMealAddModalOrigin) {
      appReturn.goBack();
      return;
    }

    setPickerMode("none");
    setSelectedLeftover(null);
  }, [appReturn, initialSource, isMealAddModalOrigin]);

  const handleManualRecipeClick = useCallback(() => {
    if (isDesktopViewport) {
      setPickerMode("manual");
      return;
    }

    const targetPath = mealAddQuery
      ? `/menu/add/manual?${mealAddQuery}`
      : "/menu/add/manual";
    const context = isMealAddModalOrigin
      ? {
          restore: "meal-add-modal" as const,
          returnSurface: "planner.meal-add-modal" as const,
          returnTo: appReturn.href,
        }
      : { returnTo: appReturn.href };

    router.push(
      buildReturnHref(targetPath, context),
    );
  }, [appReturn.href, isDesktopViewport, isMealAddModalOrigin, mealAddQuery, router]);

  const getYoutubeTargetHref = useCallback(() => {
    const targetPath = mealAddQuery
      ? `/menu/add/youtube?${mealAddQuery}`
      : "/menu/add/youtube";
    const context = isMealAddModalOrigin
      ? {
          restore: "meal-add-modal" as const,
          returnSurface: "planner.meal-add-modal" as const,
          returnTo: appReturn.href,
        }
      : { returnTo: appReturn.href };

    return buildReturnHref(targetPath, context);
  }, [appReturn.href, isMealAddModalOrigin, mealAddQuery]);

  const handleYoutubeRecipeClick = useCallback(() => {
    setPickerMode("youtube");
  }, []);

  const targetLabel = formatTargetLabel(planDate, slotName);

  const desktopPickerTitle =
    pickerMode === "recipebook-selector"
      ? "레시피북"
      : pickerMode === "recipebook-detail"
        ? selectedBook?.name ?? "레시피북"
        : pickerMode === "pantry"
          ? "팬트리 추천"
          : pickerMode === "leftover"
            ? "남은 요리"
            : pickerMode === "manual"
              ? "직접 등록"
              : pickerMode === "youtube"
                ? "유튜브 가져오기"
                : "레시피 검색";

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

  const isOptionActive = useCallback(
    (id: (typeof MENU_ADD_OPTIONS)[number]["id"]) =>
      (id === "search" && (pickerMode === "none" || pickerMode === "search")) ||
      (id === "recipebook" &&
        (pickerMode === "recipebook-selector" ||
          pickerMode === "recipebook-detail")) ||
      (id === "pantry" && pickerMode === "pantry") ||
      (id === "leftover" && pickerMode === "leftover") ||
      (id === "manual" && pickerMode === "manual") ||
      (id === "youtube" && pickerMode === "youtube"),
    [pickerMode],
  );

  // Web only: clicking the option you're already on resets that picker back to
  // its initial state (replaces the old explicit "초기화" button).
  const handleWebOptionClick = useCallback(
    (id: (typeof MENU_ADD_OPTIONS)[number]["id"]) => {
      if (isOptionActive(id)) {
        setSelectedRecipe(null);
        setSelectedBookRecipe(null);
        setSelectedPantryRecipe(null);
        setSelectedLeftover(null);
        setCreationError(null);
        if (id === "recipebook") {
          setSelectedBook(null);
          setPickerMode("recipebook-selector");
        } else {
          setPickerMode("search");
        }
        setPickerNonce((nonce) => nonce + 1);
        return;
      }

      actionMapForMobile(id)();
    },
    // actionMapForMobile is stable enough for our usage here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOptionActive],
  );

  const shouldRenderWebView = isDesktopViewport;
  const shouldRenderAppView = !isDesktopViewport;

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
          onBack={handleLeftoverClose}
          onClose={handleLeftoverClose}
          onLeftoverSelect={handleLeftoverSelect}
          onServingsCancel={handleLeftoverServingsCancel}
          onServingsConfirm={handleLeftoverServingsConfirm}
          presentation="screen"
          selectedLeftover={selectedLeftover}
          slotLabel={targetLabel}
        />
      );
    }

    if (pickerMode === "youtube") {
      return (
        <YoutubeImportScreen
          onRequestClose={handlePickerBackToMenu}
          planDate={planDate}
          columnId={columnId}
          presentation="screen"
          slotName={slotName}
        />
      );
    }

    return (
      <div className="min-h-screen bg-[var(--surface-fill)] pb-[112px] text-[var(--foreground)]">
        <div className="flex min-h-[var(--control-height-xl)] items-center border-b border-[var(--line-strong)] bg-[var(--surface)] px-2">
          <AppBackButton ariaLabel="뒤로 가기" onClick={handleBack} />
          <h1 className="min-w-0 flex-1 truncate text-center text-[18px] font-bold text-[var(--foreground)]">
            식사 추가
          </h1>
          <AppBackButtonSpacer />
        </div>

        <section className="px-5 py-3.5">
          <MealAddTargetBadge label={targetLabel} />
        </section>

        <section className="flex flex-col gap-2.5 px-4 pb-8" data-testid="menu-add-option-grid">
          {MENU_ADD_OPTIONS.map((option) => (
            <button
              className="flex min-h-[64px] w-full items-center gap-3.5 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-4 text-left"
              data-testid={`menu-add-option-${option.id}`}
              key={option.id}
              onClick={actionMapForMobile(option.id)}
              type="button"
            >
              <span className="flex h-[var(--control-height-md)] w-11 shrink-0 items-center justify-center rounded-[var(--radius-card)] bg-[var(--brand-soft)] text-[22px]">
                {option.emoji}
              </span>
              <span className="min-w-0 flex-1 text-[15px] font-bold text-[var(--foreground)]">
                {option.label}
              </span>
              <span className="text-[22px] text-[var(--text-4)]" aria-hidden="true">
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
        <div className="hidden lg:block">
          <WebShell wide className="web-menu-add-shell">
            <WebTopNav activeId="planner" items={WEB_NAV_ITEMS} />
            <div className="web-menu-add-screen">
            <div className="web-menu-add-hero">
              <div>
                <h1>식사 추가</h1>
                <p className="web-menu-add-date">{targetLabel}</p>
              </div>
              <WebButton onClick={handleBack} variant="secondary">
                플래너로 돌아가기
              </WebButton>
            </div>

            <div className="web-menu-add-layout">
              <section aria-label="추가 방법">
                <div className="web-menu-add-grid" data-testid="menu-add-option-grid">
                  {MENU_ADD_OPTIONS.map((option) => {
                    const active = isOptionActive(option.id);

                    return (
                      <button
                        className={[
                          "web-menu-add-card",
                          active ? "web-menu-add-card-active" : "",
                        ].join(" ")}
                        data-testid={`menu-add-option-${option.id}`}
                        key={option.id}
                        onClick={() => handleWebOptionClick(option.id)}
                        type="button"
                      >
                        <span className="web-menu-add-card-icon" aria-hidden="true">
                          {option.emoji}
                        </span>
                        <span className="web-menu-add-card-copy">
                          <span>{option.label}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <WebCard className="web-menu-add-picker-panel">
                <div className="web-menu-add-picker-head">
                  <div>
                    <h2>{desktopPickerTitle}</h2>
                  </div>
                  <MealAddTargetBadge label={targetLabel} tone="web" />
                </div>

                {creationError ? (
                  <div className="web-menu-add-error" role="alert">
                    {creationError}
                  </div>
                ) : null}

                {(pickerMode === "none" || pickerMode === "search") && (
                  <RecipeSearchPicker
                    key={`search-${pickerNonce}`}
                    isCreating={isCreating}
                    onRecipeSelect={handleRecipeSelect}
                    onServingsCancel={handleServingsCancel}
                    onServingsConfirm={handleServingsConfirm}
                    searchInputRef={searchInputRef}
                    selectedRecipe={selectedRecipe}
                    slotLabel={targetLabel}
                  />
                )}

                {pickerMode === "recipebook-selector" && (
                  <RecipeBookSelector
                    key={`recipebook-selector-${pickerNonce}`}
                    onBack={handlePickerBackToMenu}
                    onBookSelect={handleBookSelect}
                    onClose={handleRecipeBookClose}
                    presentation="web"
                    slotLabel={targetLabel}
                  />
                )}

                {pickerMode === "recipebook-detail" && selectedBook && (
                  <RecipeBookDetailPicker
                    book={selectedBook}
                    isCreating={isCreating}
                    onBack={handleRecipeBookBack}
                    onRecipeSelect={handleBookRecipeSelect}
                    onServingsCancel={handleBookServingsCancel}
                    onServingsConfirm={handleBookServingsConfirm}
                    presentation="web"
                    selectedRecipe={selectedBookRecipe}
                    slotLabel={targetLabel}
                  />
                )}

                {pickerMode === "pantry" && (
                  <PantryMatchPicker
                    key={`pantry-${pickerNonce}`}
                    isCreating={isCreating}
                    onBack={handlePickerBackToMenu}
                    onClose={handlePantryClose}
                    onRecipeSelect={handlePantryRecipeSelect}
                    onServingsCancel={handlePantryServingsCancel}
                    onServingsConfirm={handlePantryServingsConfirm}
                    presentation="web"
                    selectedRecipe={selectedPantryRecipe}
                    slotLabel={targetLabel}
                  />
                )}

                {pickerMode === "leftover" && (
                  <LeftoverPicker
                    key={`leftover-${pickerNonce}`}
                    isCreating={isCreating}
                    onBack={handleLeftoverClose}
                    onClose={handleLeftoverClose}
                    onLeftoverSelect={handleLeftoverSelect}
                    onServingsCancel={handleLeftoverServingsCancel}
                    onServingsConfirm={handleLeftoverServingsConfirm}
                    presentation="web"
                    selectedLeftover={selectedLeftover}
                    slotLabel={targetLabel}
                  />
                )}

                {pickerMode === "manual" && (
                  <ManualRecipeCreateScreen
                    onRequestClose={handlePickerBackToMenu}
                    planDate={planDate}
                    columnId={columnId}
                    presentation="embedded"
                    slotName={slotName}
                  />
                )}

                {pickerMode === "youtube" &&
                  (isDesktopViewport ? (
                    <YoutubeImportScreen
                      onRequestClose={handlePickerBackToMenu}
                      planDate={planDate}
                      columnId={columnId}
                      presentation="embedded"
                      slotName={slotName}
                    />
                  ) : (
                    <YoutubeImportEntrySheet
                      onBack={handlePickerBackToMenu}
                      onClose={handlePickerBackToMenu}
                      targetLabel={targetLabel}
                      youtubeHref={getYoutubeTargetHref()}
                    />
                  ))}
              </WebCard>
            </div>
            </div>
          </WebShell>
        </div>
      ) : null}
    </>
  );
}
