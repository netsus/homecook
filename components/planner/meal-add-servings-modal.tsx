"use client";

import React, { useCallback, useState } from "react";

import { NumericStepperCompact } from "@/components/shared/numeric-stepper-compact";

export interface MealAddServingsModalProps {
  /** Pre-formatted target, e.g. "6/1 아침". Shown under the title in theme color. */
  targetLabel?: string;
  /** Recipe title shown in the preview card. */
  recipeTitle: string;
  /** Thumbnail node (image or emoji). When omitted, the preview card is hidden. */
  thumbnail?: React.ReactNode;
  /** Optional secondary meta, e.g. "기본 2인분". */
  metaText?: string;
  initialServings?: number;
  minServings?: number;
  isCreating: boolean;
  onConfirm: (servings: number) => void;
  onCancel: () => void;
  title?: string;
}

/**
 * Single "계획 인분 입력" modal used by every meal-add flow. Web and app render
 * the exact same content — only the panel anchoring differs (bottom sheet on
 * mobile, centered on desktop). The target date·끼니 sits directly under the
 * title in the theme color; there is no separate date/끼니 block in the body.
 */
export function MealAddServingsModal({
  targetLabel,
  recipeTitle,
  thumbnail,
  metaText,
  initialServings = 2,
  minServings = 1,
  isCreating,
  onConfirm,
  onCancel,
  title = "계획 인분 입력",
}: MealAddServingsModalProps) {
  const [servings, setServings] = useState(initialServings);

  const handleConfirm = useCallback(() => {
    if (servings < minServings) return;
    onConfirm(servings);
  }, [minServings, onConfirm, servings]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[var(--overlay-42)] lg:items-center lg:p-4"
      onClick={onCancel}
    >
      <div
        aria-labelledby="meal-add-servings-title"
        aria-modal="true"
        className="w-full rounded-t-[var(--radius-sheet)] bg-[var(--surface)] px-5 pb-[calc(24px+env(safe-area-inset-bottom))] pt-2 shadow-[0_8px_24px_var(--shadow-color-strong)] lg:max-w-md lg:rounded-[var(--radius-sheet)] lg:pb-6 lg:pt-5"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex justify-center pb-4 lg:hidden">
          <div className="h-1 w-9 rounded-full bg-[var(--line-strong)]" />
        </div>

        <h2
          className="text-[20px] font-bold text-[var(--foreground)]"
          id="meal-add-servings-title"
        >
          {title}
        </h2>
        {targetLabel ? (
          <p className="mt-1 text-[14px] font-bold text-[var(--brand)]">
            {targetLabel}
          </p>
        ) : null}

        {thumbnail ? (
          <div className="mt-4 flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-fill)] p-2.5">
            <span className="flex h-[var(--control-height-md)] w-11 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] bg-[var(--brand-soft)] text-[22px]">
              {thumbnail}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-extrabold text-[var(--foreground)]">
                {recipeTitle}
              </span>
              <span className="mt-0.5 block text-[11px] text-[var(--text-3)]">
                {metaText ? `${metaText} · ` : ""}선택 {servings}인분
              </span>
            </span>
          </div>
        ) : (
          <p className="mt-3 text-[14px] font-semibold text-[var(--text-2)]">
            {recipeTitle}
          </p>
        )}

        <p className="mt-3 text-[13px] font-bold text-[var(--text-2)]">인분</p>
        <div className="mt-3 [&>div]:w-full">
          <NumericStepperCompact
            disabled={isCreating}
            min={minServings}
            onChange={setServings}
            unit="인분"
            value={servings}
          />
        </div>

        <div className="mt-6 flex gap-3">
          <button
            className="h-[var(--control-height-md)] flex-1 rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] text-[14px] font-bold text-[var(--text-2)]"
            disabled={isCreating}
            onClick={onCancel}
            type="button"
          >
            취소
          </button>
          <button
            className="h-[var(--control-height-md)] flex-1 rounded-[var(--radius-control)] bg-[var(--brand)] text-[14px] font-bold text-[var(--text-inverse)] disabled:opacity-50"
            disabled={isCreating || servings < minServings}
            onClick={handleConfirm}
            type="button"
          >
            {isCreating ? "추가 중..." : "추가하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
