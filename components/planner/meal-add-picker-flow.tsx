"use client";

import React, { useCallback, useRef, useState } from "react";

import { LeftoverPicker } from "@/components/planner/leftover-picker";
import { PantryMatchPicker } from "@/components/planner/pantry-match-picker";
import { RecipeBookDetailPicker } from "@/components/planner/recipe-book-detail-picker";
import { RecipeBookSelector } from "@/components/planner/recipe-book-selector";
import { RecipeSearchPicker } from "@/components/planner/recipe-search-picker";
import { YoutubeImportEntrySheet } from "@/components/planner/youtube-import-entry-sheet";
import type { MealAddPickerMode } from "@/components/planner/meal-add-options-sheet";
import { createMealSafe } from "@/lib/api/meal";
import type { LeftoverListItemData } from "@/types/leftover";
import type {
  PantryMatchRecipeItem,
  RecipeBookRecipeItem,
  RecipeBookSummary,
  RecipeCardItem,
} from "@/types/recipe";

interface MealAddPickerFlowProps {
  columnId: string;
  entryMode: MealAddPickerMode;
  onClose: () => void;
  onComplete: () => void | Promise<void>;
  planDate: string;
  slotName: string;
  youtubeHref: string;
}

type InternalPickerMode = MealAddPickerMode | "recipebook-detail";

function formatTargetLabel(planDate: string, slotName: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(planDate);
  const dateLabel = match
    ? `${Number(match[2])}/${Number(match[3])}`
    : planDate;

  if (dateLabel && slotName) return `${dateLabel} ${slotName}`;
  return slotName || dateLabel || "플래너";
}

function mapEntryMode(entryMode: MealAddPickerMode): InternalPickerMode {
  return entryMode === "recipebook" ? "recipebook" : entryMode;
}

export function MealAddPickerFlow({
  columnId,
  entryMode,
  onClose,
  onComplete,
  planDate,
  slotName,
  youtubeHref,
}: MealAddPickerFlowProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [pickerMode, setPickerMode] = useState<InternalPickerMode>(() =>
    mapEntryMode(entryMode),
  );
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeCardItem | null>(null);
  const [selectedBook, setSelectedBook] = useState<RecipeBookSummary | null>(null);
  const [selectedBookRecipe, setSelectedBookRecipe] =
    useState<RecipeBookRecipeItem | null>(null);
  const [selectedPantryRecipe, setSelectedPantryRecipe] =
    useState<PantryMatchRecipeItem | null>(null);
  const [selectedLeftover, setSelectedLeftover] =
    useState<LeftoverListItemData | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const targetLabel = formatTargetLabel(planDate, slotName);

  const finishCreation = useCallback(async () => {
    await onComplete();
  }, [onComplete]);

  const handleCreateRecipeMeal = useCallback(
    async (recipeId: string, servings: number, leftoverDishId?: string) => {
      setIsCreating(true);
      setCreationError(null);

      const response = await createMealSafe({
        recipe_id: recipeId,
        plan_date: planDate,
        column_id: columnId,
        planned_servings: servings,
        ...(leftoverDishId ? { leftover_dish_id: leftoverDishId } : {}),
      });

      if (!response.success) {
        setCreationError(response.error?.message ?? "식사를 추가하지 못했어요.");
        setIsCreating(false);
        return;
      }

      await finishCreation();
    },
    [columnId, finishCreation, planDate],
  );

  const handlePickerBackToOptions = useCallback(() => {
    setSelectedRecipe(null);
    setSelectedBook(null);
    setSelectedBookRecipe(null);
    setSelectedPantryRecipe(null);
    setSelectedLeftover(null);
    setCreationError(null);
    onClose();
  }, [onClose]);

  const handleRecipeBookBack = useCallback(() => {
    if (pickerMode === "recipebook-detail") {
      setPickerMode("recipebook");
      setSelectedBook(null);
      setSelectedBookRecipe(null);
      setCreationError(null);
      return;
    }

    handlePickerBackToOptions();
  }, [handlePickerBackToOptions, pickerMode]);

  const errorBanner = creationError ? (
    <div
      className="fixed left-4 right-4 top-4 z-[60] rounded-[var(--radius-card)] border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700 shadow-[0_8px_20px_rgba(0,0,0,0.12)]"
      role="alert"
    >
      {creationError}
    </div>
  ) : null;

  if (pickerMode === "search") {
    return (
      <div className="fixed inset-0 z-40 lg:hidden">
        {errorBanner}
        <RecipeSearchPicker
          isCreating={isCreating}
          onBack={handlePickerBackToOptions}
          onRecipeSelect={setSelectedRecipe}
          onServingsCancel={() => {
            setSelectedRecipe(null);
            setCreationError(null);
          }}
          onServingsConfirm={(servings) =>
            selectedRecipe
              ? handleCreateRecipeMeal(selectedRecipe.id, servings)
              : undefined
          }
          presentation="screen"
          searchInputRef={searchInputRef}
          selectedRecipe={selectedRecipe}
          slotLabel={targetLabel}
          title="검색으로 추가"
        />
      </div>
    );
  }

  if (pickerMode === "recipebook") {
    return (
      <div className="fixed inset-0 z-40 lg:hidden">
        {errorBanner}
        <RecipeBookSelector
          onBack={handlePickerBackToOptions}
          onBookSelect={(book) => {
            setSelectedBook(book);
            setPickerMode("recipebook-detail");
          }}
          onClose={handlePickerBackToOptions}
          presentation="screen"
          slotLabel={targetLabel}
        />
      </div>
    );
  }

  if (pickerMode === "recipebook-detail" && selectedBook) {
    return (
      <div className="fixed inset-0 z-40 lg:hidden">
        {errorBanner}
        <RecipeBookDetailPicker
          book={selectedBook}
          isCreating={isCreating}
          onBack={handleRecipeBookBack}
          onRecipeSelect={setSelectedBookRecipe}
          onServingsCancel={() => {
            setSelectedBookRecipe(null);
            setCreationError(null);
          }}
          onServingsConfirm={(servings) =>
            selectedBookRecipe
              ? handleCreateRecipeMeal(selectedBookRecipe.recipe_id, servings)
              : undefined
          }
          presentation="screen"
          selectedRecipe={selectedBookRecipe}
          slotLabel={targetLabel}
        />
      </div>
    );
  }

  if (pickerMode === "pantry") {
    return (
      <div className="fixed inset-0 z-40 lg:hidden">
        {errorBanner}
        <PantryMatchPicker
          isCreating={isCreating}
          onBack={handlePickerBackToOptions}
          onClose={handlePickerBackToOptions}
          onRecipeSelect={setSelectedPantryRecipe}
          onServingsCancel={() => {
            setSelectedPantryRecipe(null);
            setCreationError(null);
          }}
          onServingsConfirm={(servings) =>
            selectedPantryRecipe
              ? handleCreateRecipeMeal(selectedPantryRecipe.id, servings)
              : undefined
          }
          presentation="screen"
          selectedRecipe={selectedPantryRecipe}
          slotLabel={targetLabel}
        />
      </div>
    );
  }

  if (pickerMode === "youtube") {
    return (
      <YoutubeImportEntrySheet
        onBack={handlePickerBackToOptions}
        onClose={handlePickerBackToOptions}
        targetLabel={targetLabel}
        youtubeHref={youtubeHref}
      />
    );
  }

  return (
    <>
      {errorBanner}
      <LeftoverPicker
        isCreating={isCreating}
        onBack={handlePickerBackToOptions}
        onClose={handlePickerBackToOptions}
        onLeftoverSelect={setSelectedLeftover}
        onServingsCancel={() => {
          setSelectedLeftover(null);
          setCreationError(null);
        }}
        onServingsConfirm={(servings) =>
          selectedLeftover
            ? handleCreateRecipeMeal(
                selectedLeftover.recipe_id,
                servings,
                selectedLeftover.id,
              )
            : undefined
        }
        selectedLeftover={selectedLeftover}
      />
    </>
  );
}
