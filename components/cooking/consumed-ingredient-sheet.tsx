"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

import type { CookingModeIngredient } from "@/types/cooking";

interface ConsumedIngredientSheetProps {
  ingredients: CookingModeIngredient[];
  onClose: () => void;
  onConfirm: (consumedIds: string[]) => void;
  onSkip: () => void;
}

export function ConsumedIngredientSheet({
  ingredients,
  onClose,
  onConfirm,
  onSkip,
}: ConsumedIngredientSheetProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

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

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-[color-mix(in_srgb,var(--foreground)_42%,transparent)] backdrop-blur-[1px] md:items-center md:justify-center"
      data-testid="consumed-ingredient-sheet"
      onClick={onClose}
    >
      <div
        aria-labelledby="consumed-sheet-title"
        aria-modal="true"
        className="w-full max-w-md rounded-t-[var(--radius-xl)] border border-[var(--line)] border-t-2 border-t-[var(--brand)] bg-[var(--panel)] shadow-[var(--shadow-3)] md:rounded-[var(--radius-xl)] md:border-t-2 md:border-t-[var(--brand)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
      >
        {/* Grabber */}
        <div className="flex justify-center pt-2 md:hidden">
          <div className="h-1 w-9 rounded-sm bg-[var(--line)]" />
        </div>

        <div className="px-5 pt-3 md:px-6 md:pt-5">
          <div className="flex items-center justify-between">
            <h3
              className="text-base font-bold text-[var(--foreground)]"
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
          <p className="mt-1 text-sm text-[var(--muted)]">
            체크한 재료가 팬트리에서 제거됩니다.
          </p>
        </div>

        <div
          className="mt-3 max-h-[60vh] overflow-y-auto px-5 md:px-6"
          data-testid="consumed-ingredient-list"
        >
          {ingredients.map((ing) => (
            <label
              className="flex cursor-pointer items-center gap-3 border-b border-[var(--line)] py-3 last:border-b-0"
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
              <span className="flex-1 text-sm text-[var(--foreground)]">
                {ing.standard_name}
              </span>
              <span className="text-xs text-[var(--muted)]">
                {ing.display_text ?? ""}
              </span>
            </label>
          ))}
        </div>

        <div className="flex gap-3 px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-4 md:px-6">
          <button
            className="flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--line)] bg-transparent text-sm font-semibold text-[var(--muted)]"
            data-testid="consumed-skip-button"
            onClick={onSkip}
            type="button"
          >
            건너뛰기
          </button>
          <button
            className="flex min-h-11 flex-1 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--brand)] text-sm font-bold text-white"
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
