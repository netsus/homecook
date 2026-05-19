"use client";

import { useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useRef, useState } from "react";

import { LeftoverPicker } from "@/components/planner/leftover-picker";
import { PantryMatchPicker } from "@/components/planner/pantry-match-picker";
import { RecipeBookDetailPicker } from "@/components/planner/recipe-book-detail-picker";
import { RecipeBookSelector } from "@/components/planner/recipe-book-selector";
import { RecipeSearchPicker } from "@/components/planner/recipe-search-picker";
import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
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
  initialAuthenticated: boolean;
  initialSource?: string;
}

type PickerMode = "none" | "search" | "recipebook-selector" | "recipebook-detail" | "pantry" | "leftover";

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "탐색" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

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
    return "none";
  });
  const [selectedBook, setSelectedBook] = useState<RecipeBookSummary | null>(null);
  const [selectedBookRecipe, setSelectedBookRecipe] = useState<RecipeBookRecipeItem | null>(null);

  // Pantry match state
  const [selectedPantryRecipe, setSelectedPantryRecipe] = useState<PantryMatchRecipeItem | null>(
    null,
  );
  const [selectedLeftover, setSelectedLeftover] = useState<LeftoverListItemData | null>(null);

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
    if (!isDesktopViewport) {
      setPickerMode("search");
      return;
    }

    searchInputRef.current?.focus();
    searchInputRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [isDesktopViewport]);

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
  }, [appReturn.href, isMealAddModalOrigin, mealAddQuery, router]);

  const handleYoutubeRecipeClick = useCallback(() => {
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

    router.push(
      buildReturnHref(targetPath, context),
    );
  }, [appReturn.href, isMealAddModalOrigin, mealAddQuery, router]);

  const targetLabel = formatTargetLabel(planDate, slotName);

  const desktopPickerTitle =
    pickerMode === "recipebook-selector"
      ? "레시피북에서 추가"
      : pickerMode === "recipebook-detail"
        ? selectedBook?.name ?? "레시피북"
        : pickerMode === "pantry"
          ? "팬트리 추천"
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
        <div className="flex min-h-[var(--control-height-xl)] items-center border-b border-[#DEE2E6] bg-white px-2">
          <button
            aria-label="뒤로 가기"
            className="flex h-[var(--control-height-md)] w-11 shrink-0 items-center justify-center rounded-full text-[28px] leading-none text-[#212529]"
            onClick={handleBack}
            type="button"
          >
            ‹
          </button>
          <h1 className="min-w-0 flex-1 truncate text-center text-[18px] font-bold text-[#212529]">
            식사 추가
          </h1>
          <div className="h-[var(--control-height-md)] w-11 shrink-0" aria-hidden="true" />
        </div>

        <section className="px-5 py-3">
          <p className="text-[11px] font-bold text-[var(--brand)]">대상</p>
          <p className="mt-0.5 text-[16px] font-bold text-[#212529]">{targetLabel}</p>
        </section>

        <section className="flex flex-col gap-2.5 px-4 pb-8" data-testid="menu-add-option-grid">
          {MENU_ADD_OPTIONS.map((option) => (
            <button
              className="flex min-h-[76px] w-full items-center gap-3.5 rounded-[var(--radius-card)] border border-[#DEE2E6] bg-white p-4 text-left"
              data-testid={`menu-add-option-${option.id}`}
              key={option.id}
              onClick={actionMapForMobile(option.id)}
              type="button"
            >
              <span className="flex h-[var(--control-height-md)] w-11 shrink-0 items-center justify-center rounded-[var(--radius-card)] bg-[var(--brand-soft)] text-[22px]">
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
        <div className="hidden lg:block">
          <WebShell wide className="web-menu-add-shell">
            <WebTopNav activeId="planner" items={WEB_NAV_ITEMS} />
            <nav aria-label="메뉴 추가 경로" className="web-breadcrumb">
              <button
                className="web-breadcrumb-link"
                onClick={() => router.push("/planner")}
                type="button"
              >
                Planner
              </button>
              <span className="web-breadcrumb-sep">/</span>
              <button
                className="web-breadcrumb-link"
                onClick={handleBack}
                type="button"
              >
                {targetLabel}
              </button>
              <span className="web-breadcrumb-sep">/</span>
              <span className="web-breadcrumb-current">메뉴 추가</span>
            </nav>

            <div className="web-menu-add-hero">
              <div>
                <p className="web-menu-add-eyebrow">식사 추가</p>
                <h1>어떤 방식으로 메뉴를 추가할까요?</h1>
                <p>{targetLabel}에 넣을 레시피를 검색하거나 새로 등록할 수 있어요.</p>
              </div>
              <WebButton onClick={handleBack} variant="secondary">
                플래너로 돌아가기
              </WebButton>
            </div>

            <div className="web-menu-add-layout">
              <section aria-labelledby="menu-add-options-title">
                <h2 className="web-menu-add-section-title" id="menu-add-options-title">
                  추가 방법
                </h2>
                <div className="web-menu-add-grid" data-testid="menu-add-option-grid">
                  {MENU_ADD_OPTIONS.map((option) => {
                    const onClick = actionMapForMobile(option.id);
                    const active =
                      (option.id === "search" && pickerMode === "search") ||
                      (option.id === "recipebook" &&
                        (pickerMode === "recipebook-selector" ||
                          pickerMode === "recipebook-detail")) ||
                      (option.id === "pantry" && pickerMode === "pantry");

                    return (
                      <button
                        className={[
                          "web-menu-add-card",
                          active ? "web-menu-add-card-active" : "",
                        ].join(" ")}
                        data-testid={`menu-add-option-${option.id}`}
                        key={option.id}
                        onClick={onClick}
                        type="button"
                      >
                        <span className="web-menu-add-card-icon" aria-hidden="true">
                          {option.emoji}
                        </span>
                        <span className="web-menu-add-card-copy">
                          <span>{option.label}</span>
                          <small>{option.subtitle}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <WebCard className="web-menu-add-picker-panel">
                <div className="web-menu-add-picker-head">
                  <div>
                    <p className="web-menu-add-eyebrow">현재 선택</p>
                    <h2>{desktopPickerTitle}</h2>
                  </div>
                  {pickerMode !== "none" ? (
                    <WebButton
                      onClick={handlePickerBackToMenu}
                      size="sm"
                      variant="tertiary"
                    >
                      초기화
                    </WebButton>
                  ) : null}
                </div>

                {creationError ? (
                  <div className="web-menu-add-error" role="alert">
                    {creationError}
                  </div>
                ) : null}

                {(pickerMode === "none" || pickerMode === "search") && (
                  <RecipeSearchPicker
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
                    isCreating={isCreating}
                    onClose={handleLeftoverClose}
                    onLeftoverSelect={handleLeftoverSelect}
                    onServingsCancel={handleLeftoverServingsCancel}
                    onServingsConfirm={handleLeftoverServingsConfirm}
                    selectedLeftover={selectedLeftover}
                  />
                )}
              </WebCard>
            </div>
          </WebShell>
        </div>
      ) : null}
    </>
  );
}
