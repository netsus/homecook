"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useState } from "react";

import { PantryMatchPicker } from "@/components/planner/pantry-match-picker";
import { RecipeBookDetailPicker } from "@/components/planner/recipe-book-detail-picker";
import { RecipeBookSelector } from "@/components/planner/recipe-book-selector";
import { RecipeSearchPicker } from "@/components/planner/recipe-search-picker";
import { createMealSafe } from "@/lib/api/meal";
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
}

type PickerMode = "none" | "recipebook-selector" | "recipebook-detail" | "pantry";

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
  onRecipeBookClick: () => void;
  onPantryClick: () => void;
}

function ActionButtons({ onRecipeBookClick, onPantryClick }: ActionButtonsProps) {
  const enabledActions = [
    { id: "recipebook", label: "레시피북", onClick: onRecipeBookClick },
    { id: "pantry", label: "팬트리", onClick: onPantryClick },
  ];

  const disabledActions = [
    { id: "youtube", label: "유튜브" },
    { id: "leftover", label: "남은요리" },
  ];

  return (
    <div className="mt-8 space-y-4">
      <h2 className="text-sm font-semibold text-[var(--muted)]">
        다른 방법으로 추가
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {enabledActions.map((action) => (
          <button
            key={action.id}
            className="flex h-16 items-center justify-center rounded-[12px] border border-[var(--line)] bg-[var(--surface)] text-base font-semibold text-[var(--foreground)] hover:bg-[var(--line)]"
            onClick={action.onClick}
            type="button"
          >
            {action.label}
          </button>
        ))}
        {disabledActions.map((action) => (
          <button
            key={action.id}
            className="flex h-16 items-center justify-center rounded-[12px] border border-[var(--line)] bg-[var(--surface)] text-base font-semibold text-[var(--muted)] opacity-50"
            disabled
            type="button"
          >
            {action.label}
            <span className="ml-2 text-xs">(준비 중)</span>
          </button>
        ))}
      </div>
      <p className="text-sm text-[var(--muted)]">
        직접 등록은 18번 슬라이스에서 열림
      </p>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function MenuAddScreen({
  planDate,
  columnId,
  slotName,
}: MenuAddScreenProps) {
  const router = useRouter();
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeCardItem | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);

  // Recipe book state
  const [pickerMode, setPickerMode] = useState<PickerMode>("none");
  const [selectedBook, setSelectedBook] = useState<RecipeBookSummary | null>(null);
  const [selectedBookRecipe, setSelectedBookRecipe] = useState<RecipeBookRecipeItem | null>(null);

  // Pantry match state
  const [selectedPantryRecipe, setSelectedPantryRecipe] = useState<PantryMatchRecipeItem | null>(
    null,
  );

  const navigateToMealScreen = useCallback((mode: "push" | "replace" = "push") => {
    if (!planDate || !columnId) {
      router[mode]("/planner");
      return;
    }

    const slotSuffix = slotName ? `?slot=${encodeURIComponent(slotName)}` : "";
    router[mode](`/planner/${planDate}/${columnId}${slotSuffix}`);
  }, [router, planDate, columnId, slotName]);

  const handleBack = useCallback(() => {
    navigateToMealScreen("replace");
  }, [navigateToMealScreen]);

  const handleRecipeSelect = useCallback((recipe: RecipeCardItem) => {
    setSelectedRecipe(recipe);
  }, []);

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

  return (
    <div className="flex h-screen flex-col bg-[var(--background)]">
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
            onPantryClick={handlePantryClick}
            onRecipeBookClick={handleRecipeBookClick}
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
    </div>
  );
}
