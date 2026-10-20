"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import styles from "./cook-mode-layout.module.css";

import { CookModeWholeBoard } from "@/components/cooking/cook-mode-whole-board";
import type { SnapshotV2CookModeData } from "@/types/cooking";
import { ExecutionQuantityInline, executionQuantityText, type ExecutionQuantityChange } from "./execution-quantity-inline";
import { formatIngredientAmountOnly } from "./cook-mode-step-model";

interface SnapshotV2CookModeViewProps {
  cancelling?: boolean;
  preparingCompletion?: boolean;
  completionButtonRef?: React.RefObject<HTMLButtonElement | null>;
  data: SnapshotV2CookModeData | Pick<SnapshotV2CookModeData, "status" | "mode" | "recipe">;
  notice?: React.ReactNode;
  completionActions?: React.ReactNode;
  quantityDescription?: string;
  onCancel: () => void;
  onSaveIngredients?: (changes: ExecutionQuantityChange[]) => Promise<void>;
  onComplete?: () => void;
  returnHref?: string;
}

export function SnapshotV2CookModeView({
  cancelling = false,
  preparingCompletion = false,
  completionButtonRef,
  data,
  notice,
  completionActions,
  quantityDescription,
  onCancel,
  onSaveIngredients,
  onComplete,
  returnHref,
}: SnapshotV2CookModeViewProps) {
  const terminal = data.status !== "in_progress";
  const fallbackHref = data.mode === "standalone" ? `/recipe/${data.recipe.id}` : "/planner";
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const editTrigger = useRef<HTMLButtonElement | null>(null);
  const lastEditedRow = useRef<number | null>(null);
  const busy = cancelling || preparingCompletion || editingRow !== null;
  const closeEditor = () => {
    setEditingRow(null);
    requestAnimationFrame(() => editTrigger.current?.focus());
  };
  const actions = !terminal ? <div className={styles.snapshotActions}>
    <button className="cook-mobile-whole-cancel-button min-h-14 flex-1 rounded-[16px] border-0 px-4 font-bold" disabled={busy} onClick={onCancel} type="button">{cancelling ? "취소 중…" : "취소"}</button>
    {onComplete ? <button className="min-h-14 flex-[2] rounded-[16px] border-0 bg-[var(--brand-primary)] px-4 font-bold text-[var(--text-inverse)] disabled:opacity-50" disabled={busy} aria-busy={preparingCompletion} onClick={onComplete} ref={completionButtonRef} type="button">요리 완료</button> : null}
  </div> : null;

  return (
    <div
      aria-label="요리 화면"
      className={`${styles.snapshotScreen} cook-mobile-whole-screen relative mx-auto h-dvh max-w-[430px] overflow-y-auto overscroll-y-contain`}
      role="region"
      tabIndex={0}
      data-cook-theme="dark"
      data-testid="snapshot-v2-cook-mode"
    >
      <header className={`shrink-0 px-4 pb-4 pt-[calc(16px+env(safe-area-inset-top))] ${styles.snapshotHeader}`}>
        <div>
        <h1 className="cook-mobile-whole-title text-xl font-extrabold">
          {data.recipe.title}
        </h1>
        <p className="cook-mobile-whole-subtitle">
          {data.recipe.cooking_servings}인분{terminal ? data.status === "completed" ? " · 요리 완료" : " · 취소됨" : ""}
        </p>
        </div>
      </header>
      {actions}

      <main
        aria-label="요리 내용"
        className="px-4 pb-4"
        style={terminal ? { paddingBottom: "calc(16px + env(safe-area-inset-bottom))" } : undefined}
      >
      {notice}
      {terminal ? (
        <nav aria-label="요리 후 다음 행동" className="grid gap-2.5">
          {data.status === "completed" ? completionActions ?? (
            <Link
              className="flex min-h-14 items-center justify-center rounded-[16px] bg-[var(--brand-primary)] px-4 text-center font-bold text-[var(--text-inverse)]"
              href="/planner?segment=log"
              prefetch={false}
            >
              식사 기록하기
            </Link>
          ) : null}
            <Link
              className="flex min-h-12 items-center justify-center rounded-[16px] border border-[var(--surface-alpha-24)] px-4 text-center font-bold"
              href={returnHref ?? fallbackHref}
              prefetch={false}
            >돌아가기</Link>
        </nav>
      ) : null}

        <CookModeWholeBoard className={terminal ? "mt-4" : undefined} density="mobile" recipe={data.recipe}
          renderIngredientAmount={!terminal && onSaveIngredients ? (ingredient, index) => editingRow === index
            ? <ExecutionQuantityInline ingredient={ingredient} index={index} onClose={closeEditor} onSave={onSaveIngredients} description={quantityDescription} />
            : <button aria-label={`${ingredient.standard_name} 수량 수정`} ref={lastEditedRow.current === index ? editTrigger : undefined} className="cook-whole-ingredient-amount min-h-11 rounded-lg px-2 underline decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2" disabled={busy} type="button" onClick={event => { editTrigger.current = event.currentTarget; lastEditedRow.current = index; setEditingRow(index); }}>
              {(ingredient.quantity_input || ingredient.ingredient_type === "TO_TASTE") ? formatIngredientAmountOnly(ingredient) : ingredient.amount === null ? "양 미확인" : `${executionQuantityText(ingredient)}${ingredient.unit ?? ""}`}
            </button> : undefined} />
      </main>
    </div>
  );
}
