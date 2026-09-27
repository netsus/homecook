"use client";

import React from "react";
import Link from "next/link";

import { CookModeWholeBoard } from "@/components/cooking/cook-mode-whole-board";
import type { SnapshotV2CookModeData } from "@/types/cooking";

interface SnapshotV2CookModeViewProps {
  cancelling?: boolean;
  preparingCompletion?: boolean;
  data: SnapshotV2CookModeData;
  onCancel: () => void;
  onComplete?: () => void;
  returnHref?: string;
}

export function SnapshotV2CookModeView({
  cancelling = false,
  preparingCompletion = false,
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
          {data.recipe.cooking_servings}인분{terminal ? data.status === "completed" ? " · 요리 완료" : " · 취소됨" : ""}
        </p>
      </header>

      <main
        aria-label="요리 내용"
        className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-4"
        style={terminal ? { paddingBottom: "calc(16px + env(safe-area-inset-bottom))" } : undefined}
        tabIndex={0}
      >
      {terminal ? (
        <nav aria-label="요리 후 다음 행동" className="grid gap-2.5">
          {data.status === "completed" ? (
            <Link
              className="flex min-h-14 items-center justify-center rounded-[16px] bg-[var(--brand-primary)] px-4 text-center font-bold text-[var(--text-inverse)]"
              href="/planner?segment=log"
              prefetch={false}
            >
              식사 기록하기
            </Link>
          ) : (
            <Link
              className="flex min-h-12 items-center justify-center rounded-[16px] border border-[var(--surface-alpha-24)] px-4 text-center font-bold"
              href={returnHref ?? fallbackHref}
              prefetch={false}
            >돌아가기</Link>
          )}
        </nav>
      ) : null}

        <CookModeWholeBoard className={terminal ? "mt-4" : undefined} density="mobile" recipe={data.recipe} />
      </main>

      {!terminal ? (
        <footer className="cook-mobile-whole-bottom-bar flex shrink-0 gap-2.5 px-4 pt-3 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <button
            className="cook-mobile-whole-cancel-button min-h-14 flex-1 rounded-[16px] border-0 font-bold"
            disabled={cancelling || preparingCompletion}
            onClick={onCancel}
            type="button"
          >
            {cancelling ? "취소 중…" : "취소"}
          </button>
          {onComplete ? (
            <button
              className="min-h-14 flex-[2] rounded-[16px] border-0 bg-[var(--brand-primary)] font-bold text-[var(--text-inverse)] disabled:opacity-50"
              disabled={cancelling || preparingCompletion}
              aria-busy={preparingCompletion}
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
