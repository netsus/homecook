"use client";

import React from "react";
import Link from "next/link";

import { CookModeWholeBoard } from "@/components/cooking/cook-mode-whole-board";
import type { SnapshotV2CompleteData, SnapshotV2CookModeData } from "@/types/cooking";

interface SnapshotV2CookModeViewProps {
  cancelling?: boolean;
  completionResult?: SnapshotV2CompleteData | null;
  data: SnapshotV2CookModeData;
  onCancel: () => void;
  onComplete?: () => void;
  returnHref?: string;
}

export function SnapshotV2CookModeView({
  cancelling = false,
  completionResult,
  data,
  onCancel,
  onComplete,
  returnHref,
}: SnapshotV2CookModeViewProps) {
  const terminal = data.status !== "in_progress";
  const fallbackHref = data.mode === "standalone" ? `/recipe/${data.recipe.id}` : "/planner";

  return (
    <div
      className="cook-mobile-whole-screen relative mx-auto flex h-dvh min-h-0 max-w-[430px] flex-col overflow-hidden"
      data-cook-theme="dark"
      data-testid="snapshot-v2-cook-mode"
    >
      <header className="shrink-0 px-4 pb-4 pt-[calc(16px+env(safe-area-inset-top))]">
        <h1 className="cook-mobile-whole-title text-xl font-extrabold">
          {data.recipe.title}
        </h1>
        <p className="cook-mobile-whole-subtitle">
          {data.recipe.cooking_servings}인분 · 고정된 레시피
        </p>
      </header>

      <main
        aria-label="요리 내용"
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-4"
        style={terminal ? { paddingBottom: "calc(16px + env(safe-area-inset-bottom))" } : undefined}
        tabIndex={0}
      >
      {terminal ? (
        completionResult ? (
          <section
            className="rounded-[16px] bg-[var(--surface-alpha-08)] p-4 pr-14 sm:pr-4"
            role="status"
          >
            <strong className="block">저장된 완료 결과를 확인했어요.</strong>
            <span className="mt-1 block text-sm">
              팬트리 항목 {completionResult.pantry_removed}개를 반영했어요.
            </span>
            <span className="mt-1 block text-sm">
              먹은 양은 식사 기록에서 따로 남길 수 있어요.
            </span>
          </section>
        ) : (
          <p
            className="rounded-[16px] bg-[var(--surface-alpha-08)] p-4 pr-14 sm:pr-4"
            role="status"
          >
            {data.status === "completed"
              ? "완료된 요리 기록이에요. 읽기 전용으로 볼 수 있어요."
              : "취소된 요리 기록이에요. 읽기 전용으로 볼 수 있어요."}
          </p>
        )
      ) : null}

      {terminal ? (
        <nav aria-label="요리 후 다음 행동" className="mt-4 grid gap-2.5">
          {data.status === "completed" ? (
            <>
              <Link
                className="flex min-h-14 items-center justify-center rounded-[16px] bg-[var(--brand-primary)] px-4 text-center font-bold text-[var(--text-inverse)]"
                href="/planner?segment=log"
                prefetch={false}
              >
                먹은 음식 기록하기
              </Link>
              <Link
                className="cook-mobile-whole-cancel-button flex min-h-12 items-center justify-center rounded-[16px] px-4 text-center font-bold"
                href="/leftovers"
                prefetch={false}
              >
                남은요리 보기
              </Link>
            </>
          ) : null}
          <Link
            className="flex min-h-12 items-center justify-center rounded-[16px] border border-[var(--surface-alpha-24)] px-4 text-center font-bold"
            href={returnHref ?? fallbackHref}
            prefetch={false}
          >
            돌아가기
          </Link>
        </nav>
      ) : null}

        <CookModeWholeBoard className={terminal ? "mt-4" : undefined} density="mobile" recipe={data.recipe} />
      </main>

      {!terminal ? (
        <footer className="cook-mobile-whole-bottom-bar flex shrink-0 gap-2.5 px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]">
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
