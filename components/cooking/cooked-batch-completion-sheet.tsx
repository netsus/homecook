"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import { ConsumedSelectionToolbar } from "@/components/cooking/consumed-ingredient-sheet";
import { AppBottomSheet } from "@/components/shared/app-overlay";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import type {
  SnapshotV2CompleteBody,
  SnapshotV2PantryCandidate,
} from "@/types/cooking";

export interface CookedBatchCompletionError {
  code: string;
  fields: Array<{ field: string; reason: string }>;
  message: string;
  status: number;
}

interface CookedBatchCompletionSheetProps {
  candidates: SnapshotV2PantryCandidate[];
  initialSelection?: string[];
  onClose: () => void;
  onSubmit: (body: SnapshotV2CompleteBody) => void;
  serverError: CookedBatchCompletionError | null;
  submitting: boolean;
}

export function CookedBatchCompletionSheet({
  candidates,
  initialSelection = [],
  onClose,
  onSubmit,
  serverError,
  submitting,
}: CookedBatchCompletionSheetProps) {
  const [selectedIds, setSelectedIds] = useState(() => new Set(initialSelection));
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);

  useDialogBoundary({
    closeOnEscape: !submitting,
    dialogRef: panelRef,
    initialFocusRef: titleRef,
    onClose,
  });

  useEffect(() => {
    const validIds = new Set(candidates.map((candidate) => candidate.pantry_item_id));
    setSelectedIds((current) => new Set([...current].filter((id) => validIds.has(id))));
  }, [candidates]);

  useEffect(() => {
    if (serverError) errorRef.current?.focus();
  }, [serverError]);

  const rows = useMemo(() => {
    const sameNameCounts = new Map<string, number>();
    const ordinals = new Map<string, number>();
    for (const candidate of candidates) {
      const key = JSON.stringify([candidate.name, candidate.brand, candidate.item_type]);
      sameNameCounts.set(key, (sameNameCounts.get(key) ?? 0) + 1);
    }
    return candidates.map((candidate) => {
      const key = JSON.stringify([candidate.name, candidate.brand, candidate.item_type]);
      const ordinal = (ordinals.get(key) ?? 0) + 1;
      ordinals.set(key, ordinal);
      const brand = candidate.brand?.trim();
      const context = [
        brand && !candidate.name.includes(brand) ? brand : null,
        (sameNameCounts.get(key) ?? 0) > 1 ? `항목 ${ordinal}` : null,
      ].filter(Boolean).join(" · ");
      return { candidate, context };
    });
  }, [candidates]);
  const validIds = useMemo(() => [...new Set(candidates.map((candidate) => candidate.pantry_item_id))], [candidates]);
  const selectedCount = validIds.filter((id) => selectedIds.has(id)).length;
  const allSelected = validIds.length > 0 && selectedCount === validIds.length;

  const toggleCandidate = (pantryItemId: string) => {
    if (submitting) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(pantryItemId)) next.delete(pantryItemId);
      else next.add(pantryItemId);
      return next;
    });
  };

  const handleSubmit = () => {
    if (submitting) return;
    onSubmit({
      consumed_pantry_item_ids: validIds.filter((id) => selectedIds.has(id)),
      weight_action: "weigh_later",
      finished_weight_g: null,
    });
  };

  return (
    <AppBottomSheet
      ariaLabelledBy="cooked-batch-completion-title"
      bodyClassName="space-y-5"
      closeDisabled={submitting}
      footer={
        <div
          className="flex flex-col gap-2.5 [--wave1-mint-contrast:var(--brand-primary-text)] [--wave1-mint-contrast-deep:var(--foreground)] [&_button]:text-base min-[321px]:flex-row-reverse"
          data-testid="cooked-batch-completion-actions"
        >
          <button
            className="flex h-[var(--control-height-lg)] w-full min-w-0 items-center justify-center whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--wave1-mint-contrast)] px-4 text-base font-bold text-[var(--wave1-surface)] shadow-[var(--wave1-shadow-natural)] transition-colors hover:bg-[var(--wave1-mint-contrast-deep)] disabled:opacity-50 min-[321px]:w-auto min-[321px]:flex-[2]"
            disabled={submitting}
            onClick={handleSubmit}
            type="button"
          >
            {submitting ? "저장 중…" : "완료 저장"}
          </button>

        </div>
      }
      horizontalPaddingClassName="px-4"
      onClose={() => {
        if (!submitting) onClose();
      }}
      panelClassName="max-w-[430px]"
      panelRef={panelRef}
      testId="cooked-batch-completion-sheet"
      title="요리 완료"
      titleRef={titleRef}
      titleTabIndex={-1}
    >
      {submitting ? (
        <div
          className="rounded-[var(--radius-card)] bg-[var(--brand-primary-soft)] px-4 py-3 text-sm font-semibold leading-5 text-[var(--brand-primary-hover)]"
          role="status"
        >
          완료 결과를 기다리는 중이에요. 버튼과 선택을 잠시 잠갔어요.
        </div>
      ) : null}

      {serverError ? (
        <div
          className="rounded-[var(--radius-card)] border border-[var(--danger)] bg-[var(--surface-fill)] px-4 py-3 text-sm leading-5 text-[var(--danger-strong)] outline-none"
          id="cooked-batch-completion-error"
          ref={errorRef}
          role="alert"
          tabIndex={-1}
        >
          <strong className="block font-bold">{serverError.message}</strong>
          <span className="mt-1 block text-[var(--wave1-text-2)]">선택한 항목은 유지했어요. 다시 시도해 주세요.</span>
        </div>
      ) : null}

      <section aria-labelledby="cooked-batch-pantry-heading">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-base font-bold" id="cooked-batch-pantry-heading">사용한 팬트리 항목</h3>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-[var(--radius-card)] bg-[var(--wave1-surface-fill)] px-4 py-5 text-sm text-[var(--wave1-text-2)]" data-testid="cooked-batch-pantry-empty">사용할 팬트리 항목이 없어요</p>
        ) : (
          <>
            <ConsumedSelectionToolbar
              allSelected={allSelected}
              partiallySelected={selectedCount > 0 && !allSelected}
              selectedCount={selectedCount}
              totalCount={validIds.length}
              disabled={submitting}
              onToggleAll={() => { if (!submitting) setSelectedIds(allSelected ? new Set() : new Set(validIds)); }}
              selectionLabel="팬트리 항목"
              variant="mobile"
            />
            <div className="space-y-2">
              {rows.map(({ candidate, context }) => {
                const checked = selectedIds.has(candidate.pantry_item_id);
                return (
                  <label className={`flex min-h-12 items-center gap-3 rounded-[var(--radius-card)] border px-3 py-3 ${checked ? "border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]" : "border-[var(--wave1-border)] bg-[var(--wave1-surface)]"} ${submitting ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`} key={candidate.pantry_item_id}>
                    <input
                      aria-label={[candidate.name, context, "선택"].filter(Boolean).join(" ")}
                      aria-checked={checked}
                      checked={checked}
                      className="h-6 w-6 shrink-0 accent-[var(--brand-primary)]"
                      disabled={submitting}
                      onChange={() => toggleCandidate(candidate.pantry_item_id)}
                      type="checkbox"
                    />
                    <span className="min-w-0 flex-1">
                      <strong className="block break-words text-sm font-bold leading-5">{candidate.name}</strong>
                      {context ? <span className="mt-0.5 block text-xs text-[var(--wave1-text-2)]">{context}</span> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </section>

    </AppBottomSheet>
  );
}
