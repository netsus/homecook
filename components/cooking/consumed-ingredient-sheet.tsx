"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import { useIsMobileViewport } from "@/components/cooking/cook-mode-mobile-ui";
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
    if (!isMobileViewport) return;
    setChecked(new Set(ingredients.map((ingredient) => ingredient.ingredient_id)));
  }, [ingredients, isMobileViewport]);

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
      <div
        className="fixed inset-0 z-50 bg-[rgba(0,0,0,0.42)]"
        data-testid="consumed-ingredient-sheet"
        onClick={onClose}
      >
        <div
          aria-labelledby="consumed-sheet-title"
          aria-modal="true"
          className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-[20px] bg-white text-[#212529]"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
        >
          <div className="border-b border-[#DEE2E6] px-5 pb-3 pt-[18px]">
            <h3
              className="text-[18px] font-bold leading-[1.3] [font-family:var(--font-jua),-apple-system,sans-serif]"
              id="consumed-sheet-title"
            >
              소진된 재료를 확인해주세요
            </h3>
            <p className="mt-1 text-[13px] font-normal leading-[1.5] text-[#868E96]">
              체크된 재료는 팬트리에서 자동으로 빠져요.
              {recipeTitle ? ` (요리: ${recipeTitle})` : null}
            </p>
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto p-4"
            data-testid="consumed-ingredient-list"
          >
            {ingredients.map((ingredient) => {
              const isChecked = checked.has(ingredient.ingredient_id);

              return (
                <button
                  className="mb-1.5 flex w-full cursor-pointer items-center gap-3 rounded-[10px] border border-[#DEE2E6] bg-white px-3.5 py-3 text-left last:mb-0"
                  data-testid={`consumed-check-${ingredient.ingredient_id}`}
                  key={ingredient.ingredient_id}
                  onClick={() => toggleIngredient(ingredient.ingredient_id)}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px]"
                    style={{
                      background: isChecked ? "#2AC1BC" : "#FFFFFF",
                      borderColor: isChecked ? "#2AC1BC" : "#DEE2E6",
                    }}
                  >
                    {isChecked ? <CheckIcon /> : null}
                  </span>
                  <span
                    className="min-w-0 flex-1"
                    data-testid="consumed-ingredient-item"
                  >
                    <span className="block text-[14px] font-semibold leading-[1.35] text-[#212529]">
                      {ingredient.standard_name}
                    </span>
                    <span className="block text-[12px] font-normal leading-[1.35] text-[#868E96]">
                      {formatIngredientAmount(ingredient)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex gap-2 border-t border-[#DEE2E6] p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
            <button
              className="flex h-12 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border border-transparent bg-[#F8F9FA] px-6 text-[16px] font-bold text-[#212529]"
              data-testid="consumed-skip-button"
              onClick={onSkip}
              type="button"
            >
              건너뛰기
            </button>
            <button
              className="flex h-12 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-lg border border-transparent bg-[#2AC1BC] px-4 text-[16px] font-bold text-white"
              data-testid="consumed-confirm-button"
              onClick={handleConfirm}
              type="button"
            >
              요리 완료 ({checked.size}개 차감)
            </button>
          </div>
        </div>
      </div>
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
              소진한 재료를 체크해주세요
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
            체크한 재료가 팬트리에서 제거됩니다.
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
                {ing.display_text ?? ""}
              </span>
            </label>
          ))}
        </div>

        <div className="flex gap-3 border-t border-[var(--line)] bg-[var(--surface)] px-6 py-4">
          <button
            className="flex min-h-11 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--line)] bg-transparent px-3 text-sm font-semibold text-[var(--muted)]"
            data-testid="consumed-skip-button"
            onClick={onSkip}
            type="button"
          >
            건너뛰기
          </button>
          <button
            className="flex min-h-11 min-w-0 flex-1 items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] bg-[var(--brand)] px-3 text-sm font-bold text-white"
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

function formatIngredientAmount(ingredient: CookingModeIngredient) {
  if (ingredient.display_text) {
    return ingredient.display_text;
  }

  if (ingredient.ingredient_type === "TO_TASTE") {
    return "적당량";
  }

  if (ingredient.amount === null) {
    return "";
  }

  return `${ingredient.amount}${ingredient.unit ?? ""}`;
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
        stroke="white"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </svg>
  );
}
