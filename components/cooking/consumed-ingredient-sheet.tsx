"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

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
    setChecked(
      new Set(ingredients.map((ingredient) => ingredient.ingredient_id)),
    );
  }, [ingredients]);

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

  const handleConfirm = useCallback(() => {
    onConfirm([...checked]);
  }, [checked, onConfirm]);

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
        <div
          className="grid grid-cols-2 gap-2"
          data-testid="consumed-ingredient-list"
        >
          {ingredients.map((ingredient) => {
            const isChecked = checked.has(ingredient.ingredient_id);

            return (
              <button
                className="flex min-h-[58px] w-full cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-[var(--wave1-border)] bg-[var(--surface)] px-3 py-2.5 text-left"
                data-testid={`consumed-check-${ingredient.ingredient_id}`}
                key={ingredient.ingredient_id}
                onClick={() => toggleIngredient(ingredient.ingredient_id)}
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
          {ingredients.map((ing) => (
            <label
              className="mb-2 flex cursor-pointer items-center gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-fill)] px-4 py-3 last:mb-0"
              data-testid="consumed-ingredient-item"
              key={ing.ingredient_id}
            >
              <input
                checked={checked.has(ing.ingredient_id)}
                className="h-5 w-5 shrink-0 accent-[var(--brand)]"
                data-testid={`consumed-check-${ing.ingredient_id}`}
                onChange={() => toggleIngredient(ing.ingredient_id)}
                type="checkbox"
              />
              <span className="min-w-0 flex-1 break-keep text-sm text-[var(--foreground)]">
                {ing.standard_name}
              </span>
              <span className="min-w-0 max-w-[44%] break-words text-right text-xs text-[var(--muted)]">
                {formatIngredientAmountOnly(ing)}
              </span>
            </label>
          ))}
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
