"use client";

import React from "react";

import type {
  ShoppingListAllPantryCompletionSummary,
  ShoppingListAllPantrySummary,
} from "@/types/shopping";

type AllPantryModalSummary =
  | ShoppingListAllPantryCompletionSummary
  | ShoppingListAllPantrySummary;

export function AllPantryCompletionModal({
  completion,
  mealCount,
  onClose,
  onGoPlanner,
  onOpenShoppingList,
}: {
  completion: AllPantryModalSummary;
  mealCount?: number;
  onClose: () => void;
  onGoPlanner: () => void;
  onOpenShoppingList?: () => void;
}) {
  const hasShoppingList = typeof completion.id === "string";
  const resolvedMealCount =
    mealCount ??
    ("meals_updated" in completion ? completion.meals_updated : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-30)] px-4 py-6">
      <section
        aria-labelledby="all-pantry-completion-title"
        aria-modal="true"
        className="w-full max-w-[420px] rounded-[var(--radius-panel)] border border-[var(--success-border)] bg-[var(--surface)] p-5 text-center shadow-[0_24px_60px_var(--shadow-color-soft)]"
        role="dialog"
      >
        <div
          aria-hidden="true"
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[var(--success-soft)] text-[22px] font-extrabold text-[var(--success-strong)]"
        >
          ✓
        </div>
        <h2
          className="mt-4 text-[22px] font-extrabold leading-[1.25] text-[var(--foreground)]"
          id="all-pantry-completion-title"
        >
          살 재료가 없어요
        </h2>
        <p className="mt-3 text-[14px] font-semibold leading-[1.55] text-[var(--text-2)]">
          {hasShoppingList
            ? "선택한 끼니의 재료가 모두 팬트리에 있어요. 그래도 목록에서 필요한 재료를 되살릴 수 있어요."
            : "선택한 끼니의 재료가 모두 팬트리에 있어 장보기 완료로 바꿨어요."}
        </p>
        <p className="mt-4 inline-flex h-8 items-center rounded-full bg-[var(--success-soft)] px-3 text-[13px] font-extrabold text-[var(--success-strong)]">
          {resolvedMealCount}개 끼니 · {completion.pantry_item_count}개 재료
        </p>
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {hasShoppingList ? (
            <button
              className="flex h-[var(--control-height-md)] items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-4 text-[14px] font-extrabold text-[var(--foreground)]"
              onClick={onGoPlanner}
              type="button"
            >
              플래너로 돌아가기
            </button>
          ) : (
            <button
              className="flex h-[var(--control-height-md)] items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-4 text-[14px] font-extrabold text-[var(--foreground)]"
              onClick={onClose}
              type="button"
            >
              계속 보기
            </button>
          )}
          <button
            className="flex h-[var(--control-height-md)] items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand)] px-4 text-[14px] font-extrabold text-[var(--text-inverse)]"
            onClick={hasShoppingList && onOpenShoppingList ? onOpenShoppingList : onGoPlanner}
            type="button"
          >
            {hasShoppingList ? "장보기목록 만들기" : "플래너로 돌아가기"}
          </button>
        </div>
      </section>
    </div>
  );
}
