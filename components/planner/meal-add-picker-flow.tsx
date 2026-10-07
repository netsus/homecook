"use client";

import React, { useCallback, useRef, useState } from "react";

import { LeftoverPicker } from "@/components/planner/leftover-picker";
import { PantryMatchPicker } from "@/components/planner/pantry-match-picker";
import { RecipeBookDetailPicker } from "@/components/planner/recipe-book-detail-picker";
import { RecipeBookSelector } from "@/components/planner/recipe-book-selector";
import { RecipeSearchPicker } from "@/components/planner/recipe-search-picker";
import type { MealAddPickerMode } from "@/components/planner/meal-add-options-sheet";
import { MealAddTargetBadge } from "@/components/planner/meal-add-target-badge";
import { AppBackButton } from "@/components/shared/app-back-button";
import { PlannerTaskSheet } from "@/components/planner/planner-task-sheet";
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
  onDismiss?: () => void;
  onComplete: () => void | Promise<void>;
  planDate: string;
  slotName: string;
}

type InternalPickerMode = MealAddPickerMode | "recipebook-detail";

interface PickerSheetProps {
  ariaLabelledBy: string;
  children: React.ReactNode;
  onBack: () => void;
  onClose: () => void;
  targetLabel?: string;
  title: string;
  closeDisabled?: boolean;
  error?: React.ReactNode;
}

function PickerSheet({
  ariaLabelledBy,
  children,
  onBack,
  onClose,
  targetLabel,
  title,
  closeDisabled,
  error,
}: PickerSheetProps) {
  return (
    <PlannerTaskSheet
      ariaLabelledBy={ariaLabelledBy}
      badge={<MealAddTargetBadge className="shrink-0" label={targetLabel} />}
      bodyClassName="pb-[calc(20px+env(safe-area-inset-bottom))]"
      leadingAction={<AppBackButton disabled={closeDisabled} onClick={onBack} />}
      closeDisabled={closeDisabled}
      onClose={onClose}
      panelClassName="h-[78dvh]"
      title={title}
    >
      {error}
      {children}
    </PlannerTaskSheet>
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
  onDismiss,
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
  const creatingRef = useRef(false);
  const createOperation = useRef<{ fingerprint: string; key: string } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const targetLabel = formatTargetLabel(planDate, slotName);

  const finishCreation = useCallback(async () => {
    await onComplete();
  }, [onComplete]);

  const handleCreateRecipeMeal = useCallback(
    async (recipeId: string, servings: number, leftoverDishId?: string) => {
      if (creatingRef.current) return;
      creatingRef.current = true;
      setIsCreating(true);
      setCreationError(null);

      const body = {
        recipe_id: recipeId,
        plan_date: planDate,
        column_id: columnId,
        planned_servings: servings,
        ...(leftoverDishId ? { leftover_dish_id: leftoverDishId } : {}),
      };
      const fingerprint = JSON.stringify(body);
      if (createOperation.current?.fingerprint !== fingerprint) {
        createOperation.current = { fingerprint, key: crypto.randomUUID() };
      }
      const response = await createMealSafe(body, createOperation.current.key);

      if (!response.success) {
        setCreationError(response.error?.message ?? "식사를 추가하지 못했어요.");
        creatingRef.current = false;
        setIsCreating(false);
        return;
      }

      createOperation.current = null;
      await finishCreation();
    },
    [columnId, finishCreation, planDate],
  );

  const handlePickerBackToOptions = useCallback(() => {
    if (creatingRef.current) return;
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
      className="mx-4 mb-3 rounded-[var(--radius-card)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-[13px] font-medium text-[var(--danger)] shadow-[0_8px_20px_var(--shadow-color-raised)]"
      role="alert"
    >
      {creationError}
    </div>
  ) : null;

  if (pickerMode === "search") {
    return (
      <>
        <PickerSheet
          closeDisabled={isCreating}
          error={errorBanner}
          ariaLabelledBy="meal-add-search-picker-title"
          onBack={selectedRecipe || selectedPantryRecipe ? () => { setSelectedRecipe(null); setSelectedPantryRecipe(null); setCreationError(null); } : handlePickerBackToOptions}
          onClose={onDismiss ?? handlePickerBackToOptions}
          targetLabel={targetLabel}
          title={selectedRecipe ? "계획에 추가" : "검색으로 추가"}
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
        <PickerSheet
          closeDisabled={isCreating}
          error={errorBanner}
          ariaLabelledBy="meal-add-recipebook-picker-title"
          onBack={selectedRecipe || selectedPantryRecipe ? () => { setSelectedRecipe(null); setSelectedPantryRecipe(null); setCreationError(null); } : handlePickerBackToOptions}
          onClose={onDismiss ?? handlePickerBackToOptions}
          targetLabel={targetLabel}
          title="레시피북에서 추가"
        >
          <RecipeBookSelector
            onBack={handlePickerBackToOptions}
            onBookSelect={(book) => {
              setSelectedBook(book);
              setPickerMode("recipebook-detail");
            }}
            onClose={onDismiss ?? handlePickerBackToOptions}
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
        <PickerSheet
          closeDisabled={isCreating}
          error={errorBanner}
          ariaLabelledBy="meal-add-recipebook-detail-picker-title"
          onBack={selectedBookRecipe ? () => { setSelectedBookRecipe(null); setCreationError(null); } : handleRecipeBookBack}
          onClose={onDismiss ?? handlePickerBackToOptions}
          targetLabel={targetLabel}
          title={selectedBookRecipe ? "계획에 추가" : selectedBook.name}
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
        <PickerSheet
          closeDisabled={isCreating}
          error={errorBanner}
          ariaLabelledBy="meal-add-pantry-picker-title"
          onBack={selectedRecipe || selectedPantryRecipe ? () => { setSelectedRecipe(null); setSelectedPantryRecipe(null); setCreationError(null); } : handlePickerBackToOptions}
          onClose={onDismiss ?? handlePickerBackToOptions}
          targetLabel={targetLabel}
          title={selectedPantryRecipe ? "계획에 추가" : "팬트리 기반 추천"}
        >
          <PantryMatchPicker
            isCreating={isCreating}
            onBack={handlePickerBackToOptions}
            onClose={onDismiss ?? handlePickerBackToOptions}
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
