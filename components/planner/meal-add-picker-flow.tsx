"use client";

import React, { useCallback, useRef, useState } from "react";

import { LeftoverPicker } from "@/components/planner/leftover-picker";
import { PantryMatchPicker } from "@/components/planner/pantry-match-picker";
import { RecipeBookDetailPicker } from "@/components/planner/recipe-book-detail-picker";
import { RecipeBookSelector } from "@/components/planner/recipe-book-selector";
import { RecipeSearchPicker } from "@/components/planner/recipe-search-picker";
import type { MealAddPickerMode } from "@/components/planner/meal-add-options-sheet";
import { AppBackButton } from "@/components/shared/app-back-button";
import { AppBottomSheet } from "@/components/shared/app-overlay";
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
}

type InternalPickerMode = MealAddPickerMode | "recipebook-detail";

interface PickerSheetProps {
  ariaLabelledBy: string;
  children: React.ReactNode;
  description?: string;
  onBack: () => void;
  onClose: () => void;
  title: string;
}

function PickerSheet({
  ariaLabelledBy,
  children,
  description,
  onBack,
  onClose,
  title,
}: PickerSheetProps) {
  return (
    <AppBottomSheet
      ariaLabelledBy={ariaLabelledBy}
      bodyClassName="pb-5"
      description={description}
      leadingAction={<AppBackButton onClick={onBack} />}
      onClose={onClose}
      panelClassName="max-w-[480px]"
      title={title}
    >
      {children}
    </AppBottomSheet>
  );
}

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
      className="fixed left-4 right-4 top-4 z-[60] rounded-[var(--radius-card)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-[13px] font-semibold text-[var(--danger)] shadow-[0_8px_20px_var(--shadow-color-raised)]"
      role="alert"
    >
      {creationError}
    </div>
  ) : null;

  if (pickerMode === "search") {
    return (
      <>
        {errorBanner}
        <PickerSheet
          ariaLabelledBy="meal-add-search-picker-title"
          description={`대상 · ${targetLabel}`}
          onBack={handlePickerBackToOptions}
          onClose={handlePickerBackToOptions}
          title="검색으로 추가"
        >
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
            presentation="sheet"
            searchInputRef={searchInputRef}
            selectedRecipe={selectedRecipe}
            slotLabel={targetLabel}
            title="검색으로 추가"
          />
        </PickerSheet>
      </>
    );
  }

  if (pickerMode === "recipebook") {
    return (
      <>
        {errorBanner}
        <PickerSheet
          ariaLabelledBy="meal-add-recipebook-picker-title"
          description={`대상 · ${targetLabel}`}
          onBack={handlePickerBackToOptions}
          onClose={handlePickerBackToOptions}
          title="레시피북에서 추가"
        >
          <RecipeBookSelector
            onBack={handlePickerBackToOptions}
            onBookSelect={(book) => {
              setSelectedBook(book);
              setPickerMode("recipebook-detail");
            }}
            onClose={handlePickerBackToOptions}
            presentation="sheet"
            slotLabel={targetLabel}
          />
        </PickerSheet>
      </>
    );
  }

  if (pickerMode === "recipebook-detail" && selectedBook) {
    return (
      <>
        {errorBanner}
        <PickerSheet
          ariaLabelledBy="meal-add-recipebook-detail-picker-title"
          description={`대상 · ${targetLabel}`}
          onBack={handleRecipeBookBack}
          onClose={handlePickerBackToOptions}
          title={selectedBook.name}
        >
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
            presentation="sheet"
            selectedRecipe={selectedBookRecipe}
            slotLabel={targetLabel}
          />
        </PickerSheet>
      </>
    );
  }

  if (pickerMode === "pantry") {
    return (
      <>
        {errorBanner}
        <PickerSheet
          ariaLabelledBy="meal-add-pantry-picker-title"
          description={`대상 · ${targetLabel}`}
          onBack={handlePickerBackToOptions}
          onClose={handlePickerBackToOptions}
          title="팬트리 기반 추천"
        >
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
            presentation="sheet"
            selectedRecipe={selectedPantryRecipe}
            slotLabel={targetLabel}
          />
        </PickerSheet>
      </>
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
        presentation="sheet"
        selectedLeftover={selectedLeftover}
        slotLabel={targetLabel}
      />
    </>
  );
}
