"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useIsMobileViewport } from "@/components/cooking/cook-mode-mobile-ui";
import { formatIngredientAmountOnly } from "@/components/cooking/cook-mode-step-model";
import {
  AppBottomSheet,
  AppModalFooterActions,
} from "@/components/shared/app-overlay";
import type { CookingModeIngredient } from "@/types/cooking";

interface ConsumedIngredientSheetProps {
  ingredients: CookingModeIngredient[];
  recipeTitle?: string;
  onClose: () => void;
  onConfirm: (consumedIds: string[]) => void;
  onSkip: () => void;
}

export function ConsumedIngredientSheet({
  ingredients,
  recipeTitle,
  onClose,
  onConfirm,
  onSkip,
}: ConsumedIngredientSheetProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const isMobileViewport = useIsMobileViewport();
  const ingredientIds = useMemo(
    () =>
      Array.from(
        new Set(ingredients.map((ingredient) => ingredient.ingredient_id)),
      ),
    [ingredients],
  );
  const totalCount = ingredientIds.length;
  const selectedCount = ingredientIds.filter((id) => checked.has(id)).length;
  const allSelected = totalCount > 0 && selectedCount === totalCount;
  const partiallySelected = selectedCount > 0 && !allSelected;

  useEffect(() => {
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    setChecked(new Set(ingredientIds));
  }, [ingredientIds]);

  const toggleIngredient = useCallback((id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAllIngredients = useCallback(() => {
    setChecked(allSelected ? new Set() : new Set(ingredientIds));
  }, [allSelected, ingredientIds]);

  const handleConfirm = useCallback(() => {
    onConfirm(ingredientIds.filter((id) => checked.has(id)));
  }, [checked, ingredientIds, onConfirm]);

  const selectionToolbar = (
    <ConsumedSelectionToolbar
      allSelected={allSelected}
      onToggleAll={toggleAllIngredients}
      partiallySelected={partiallySelected}
      selectedCount={selectedCount}
      totalCount={totalCount}
      variant={isMobileViewport ? "mobile" : "desktop"}
    />
  );

  if (isMobileViewport) {
    return (
      <AppBottomSheet
        ariaLabelledBy="consumed-sheet-title"
        closeButtonRef={closeButtonRef}
        description="체크된 재료는 팬트리에서 자동으로 빠져요."
        descriptionClassName="mt-1 text-[13px] font-normal leading-[1.5] text-[var(--wave1-text-2)]"
        footer={
          <AppModalFooterActions
            cancelLabel="건너뛰기"
            cancelTestId="consumed-skip-button"
            confirmLabel={`요리 완료 (${checked.size}개 차감)`}
            confirmTestId="consumed-confirm-button"
            onCancel={onSkip}
            onConfirm={handleConfirm}
          />
        }
        onClose={onClose}
        headerSlot={
          recipeTitle ? (
            <p
              className="truncate rounded-full bg-[var(--wave1-surface-fill)] px-3 py-1.5 text-[12px] font-semibold text-[var(--wave1-text-2)]"
              data-testid="consumed-sheet-recipe-title"
            >
              {recipeTitle}
            </p>
          ) : null
        }
        headerSlotClassName="mt-2"
        testId="consumed-ingredient-sheet"
        title="소진된 재료를 확인해 주세요"
      >
        {selectionToolbar}
        <div
          className="grid grid-cols-2 gap-2"
          data-testid="consumed-ingredient-list"
        >
          {ingredients.map((ingredient, index) => {
            const isChecked = checked.has(ingredient.ingredient_id);

            return (
              <button
                className="flex min-h-[58px] w-full cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-[var(--wave1-border)] bg-[var(--surface)] px-3 py-2.5 text-left"
                data-testid={`consumed-check-${ingredient.ingredient_id}`}
                key={`${ingredient.ingredient_id}-${index}`}
                onClick={() => toggleIngredient(ingredient.ingredient_id)}
                aria-checked={isChecked}
                aria-label={`${ingredient.standard_name} ${formatIngredientAmountOnly(ingredient)} 소진 재료 선택`}
                role="checkbox"
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={[
                    "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px]",
                    isChecked
                      ? "border-[var(--wave1-mint-contrast)] bg-[var(--wave1-mint-contrast)]"
                      : "border-[var(--wave1-border)] bg-[var(--surface)]",
                  ].join(" ")}
                >
                  {isChecked ? <CheckIcon /> : null}
                </span>
                <span
                  className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-1.5"
                  data-testid="consumed-ingredient-item"
                >
                  <span className="truncate text-[14px] font-semibold leading-[1.35] text-[var(--wave1-ink)]">
                    {ingredient.standard_name}
                  </span>
                  <span className="shrink-0 text-right text-[12px] font-semibold leading-[1.35] text-[var(--wave1-text-2)]">
                    {formatIngredientAmountOnly(ingredient)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </AppBottomSheet>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--foreground)_42%,transparent)] p-4 backdrop-blur-[1px]"
      data-testid="consumed-ingredient-sheet"
      onClick={onClose}
    >
      <div
        aria-labelledby="consumed-sheet-title"
        aria-modal="true"
        className="w-full max-w-2xl overflow-hidden rounded-[var(--radius-xl)] border border-[var(--line)] bg-[var(--panel)] shadow-[var(--shadow-3)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        <div className="border-b border-[var(--line)] bg-[var(--surface)] px-6 py-5">
          <div className="flex items-center justify-between">
            <h3
              className="text-xl font-bold tracking-[-0.3px] text-[var(--foreground)]"
              id="consumed-sheet-title"
            >
              소진한 재료를 확인해 주세요
            </h3>
            <button
              aria-label="닫기"
              className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)]"
              data-testid="consumed-sheet-close"
              onClick={onClose}
              ref={closeButtonRef}
              type="button"
            >
              <svg
                fill="none"
                height="18"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="18"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            체크한 재료가 팬트리에서 제거돼요.
            {recipeTitle ? ` 요리: ${recipeTitle}` : null}
          </p>
        </div>

        <div
          className="max-h-[56vh] overflow-y-auto px-6 py-4"
          data-testid="consumed-ingredient-list"
        >
          {selectionToolbar}
          {ingredients.map((ing, index) => {
            const isChecked = checked.has(ing.ingredient_id);

            return (
              <button
                aria-checked={isChecked}
                aria-label={`${ing.standard_name} ${formatIngredientAmountOnly(ing)} 소진 재료 선택`}
                className="mb-2 flex w-full cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-fill)] px-4 py-3 text-left last:mb-0"
                data-testid={`consumed-check-${ing.ingredient_id}`}
                key={`${ing.ingredient_id}-${index}`}
                onClick={() => toggleIngredient(ing.ingredient_id)}
                role="checkbox"
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={[
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border-[1.5px]",
                    isChecked
                      ? "border-[var(--brand)] bg-[var(--brand)]"
                      : "border-[var(--line-strong)] bg-[var(--surface)]",
                  ].join(" ")}
                >
                  {isChecked ? <CheckIcon /> : null}
                </span>
                <span className="min-w-0 flex-1 break-keep text-sm text-[var(--foreground)]">
                  {ing.standard_name}
                </span>
                <span className="min-w-0 max-w-[44%] break-words text-right text-xs text-[var(--muted)]">
                  {formatIngredientAmountOnly(ing)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex gap-3 border-t border-[var(--line)] bg-[var(--surface)] px-6 py-4">
          <button
            className="flex min-h-[var(--control-height-md)] min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--line)] bg-transparent px-3 text-sm font-semibold text-[var(--muted)]"
            data-testid="consumed-skip-button"
            onClick={onSkip}
            type="button"
          >
            건너뛰기
          </button>
          <button
            className="flex min-h-[var(--control-height-md)] min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] bg-[var(--brand)] px-3 text-sm font-bold text-[var(--text-inverse)]"
            data-testid="consumed-confirm-button"
            onClick={handleConfirm}
            type="button"
          >
            확인 ({checked.size}개)
          </button>
        </div>
      </div>
    </div>
  );
}

function ConsumedSelectionToolbar({
  allSelected,
  onToggleAll,
  partiallySelected,
  selectedCount,
  totalCount,
  variant,
}: {
  allSelected: boolean;
  onToggleAll: () => void;
  partiallySelected: boolean;
  selectedCount: number;
  totalCount: number;
  variant: "desktop" | "mobile";
}) {
  let ariaChecked: "false" | "mixed" | "true" = "false";
  if (allSelected) {
    ariaChecked = "true";
  } else if (partiallySelected) {
    ariaChecked = "mixed";
  }

  const actionLabel = allSelected ? "전체 해제" : "전체 선택";
  const hasAnySelection = allSelected || partiallySelected;
  let checkBoxClass =
    "border-[var(--line-strong)] bg-[var(--surface)] text-transparent";
  if (variant === "mobile") {
    checkBoxClass = hasAnySelection
      ? "border-[var(--wave1-mint-contrast)] bg-[var(--wave1-mint-contrast)] text-[var(--text-inverse)]"
      : "border-[var(--wave1-border)] bg-[var(--wave1-surface)] text-transparent";
  } else if (hasAnySelection) {
    checkBoxClass =
      "border-[var(--brand)] bg-[var(--brand)] text-[var(--text-inverse)]";
  }

  const toolbarClass =
    variant === "mobile"
      ? "mb-3 flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--wave1-border)] bg-[var(--wave1-surface-fill)] px-3 py-2.5"
      : "mb-3 flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5";
  const buttonClass =
    variant === "mobile"
      ? "flex h-9 shrink-0 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--wave1-border)] bg-[var(--wave1-surface)] px-3 text-[13px] font-extrabold text-[var(--wave1-ink)] disabled:opacity-45"
      : "flex h-9 shrink-0 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--panel)] px-3 text-[13px] font-bold text-[var(--foreground)] disabled:opacity-45";
  const summaryClass =
    variant === "mobile"
      ? "min-w-0 text-[13px] font-bold text-[var(--wave1-text-2)]"
      : "min-w-0 text-[13px] font-semibold text-[var(--muted)]";

  return (
    <div className={toolbarClass}>
      <button
        aria-checked={ariaChecked}
        aria-label={
          allSelected ? "소진 재료 전체 해제" : "소진 재료 전체 선택"
        }
        className={buttonClass}
        data-testid="consumed-bulk-toggle"
        disabled={totalCount === 0}
        onClick={onToggleAll}
        role="checkbox"
        type="button"
      >
        <span
          aria-hidden="true"
          data-testid="consumed-bulk-checkmark"
          className={[
            "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] border text-[13px] font-extrabold",
            checkBoxClass,
          ].join(" ")}
        >
          {allSelected ? (
            <CheckIcon />
          ) : partiallySelected ? (
            <MinusIcon />
          ) : null}
        </span>
        <span>{totalCount === 0 ? "선택할 재료 없음" : actionLabel}</span>
      </button>
      <span
        aria-live="polite"
        className={summaryClass}
        data-testid="consumed-selection-summary"
      >
        {selectedCount}개 선택됨
      </span>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="14"
      viewBox="0 0 24 24"
      width="14"
    >
      <path
        d="m5 12 4 4 10-10"
        stroke="var(--text-inverse)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="14"
      viewBox="0 0 24 24"
      width="14"
    >
      <path
        d="M6 12h12"
        stroke="var(--text-inverse)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </svg>
  );
}
