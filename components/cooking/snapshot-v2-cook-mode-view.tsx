"use client";

import React from "react";

import { CookModeWholeBoard } from "@/components/cooking/cook-mode-whole-board";
import type { SnapshotV2CompleteData, SnapshotV2CookModeData } from "@/types/cooking";

interface SnapshotV2CookModeViewProps {
  cancelling?: boolean;
  completionResult?: SnapshotV2CompleteData | null;
  data: SnapshotV2CookModeData;
  onCancel: () => void;
  onComplete?: () => void;
}

export function SnapshotV2CookModeView({
  cancelling = false,
  completionResult,
  data,
  onCancel,
  onComplete,
}: SnapshotV2CookModeViewProps) {
  const terminal = data.status !== "in_progress";

  return (
    <div
      className="cook-mobile-whole-screen relative mx-auto flex min-h-dvh max-w-[430px] flex-col overflow-hidden"
      data-cook-theme="dark"
      data-testid="snapshot-v2-cook-mode"
    >
      <header className="px-4 py-4">
        <h1 className="cook-mobile-whole-title text-xl font-extrabold">
          {data.recipe.title}
        </h1>
        <p className="cook-mobile-whole-subtitle">
          {data.recipe.cooking_servings}인분 · 고정된 레시피
        </p>
      </header>

      {terminal ? (
        completionResult ? (
          <section
            className="mx-4 rounded-[16px] bg-[var(--surface-alpha-08)] p-4"
            role="status"
          >
            <strong className="block">저장된 완료 결과를 확인했어요.</strong>
            <span className="mt-1 block text-sm">
              팬트리 항목 {completionResult.pantry_removed}개를 반영했어요.
            </span>
            <span className="mt-1 block text-sm">
              완료 효과는 다시 실행하지 않아요.
            </span>
          </section>
        ) : (
          <p
            className="mx-4 rounded-[16px] bg-[var(--surface-alpha-08)] p-4"
            role="status"
          >
            {data.status === "completed"
              ? "완료된 요리 기록이에요. 읽기 전용으로 볼 수 있어요."
              : "취소된 요리 기록이에요. 읽기 전용으로 볼 수 있어요."}
          </p>
        )
      ) : null}

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-24">
        <CookModeWholeBoard density="mobile" recipe={data.recipe} />
      </main>

      {!terminal ? (
        <footer className="cook-mobile-whole-bottom-bar fixed inset-x-0 bottom-0 mx-auto flex max-w-[430px] gap-2.5 p-4">
          <button
            className="cook-mobile-whole-cancel-button min-h-14 flex-1 rounded-[16px] border-0 font-bold"
            disabled={cancelling}
            onClick={onCancel}
            type="button"
          >
            {cancelling ? "취소 중…" : "취소"}
          </button>
          {onComplete ? (
            <button
              className="min-h-14 flex-[2] rounded-[16px] border-0 bg-[var(--brand-primary)] font-bold text-[var(--text-inverse)] disabled:opacity-50"
              disabled={cancelling}
              onClick={onComplete}
              type="button"
            >
              요리 완료
            </button>
          ) : null}
        </footer>
      ) : null}
    </div>
  );
}
