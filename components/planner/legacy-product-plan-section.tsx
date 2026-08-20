"use client";

import React, { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import {
  AppBottomSheet,
  AppConfirmDialog,
  AppModalFooterActions,
} from "@/components/shared/app-overlay";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import {
  formatFoodProductExpectedEnergy,
  formatProductQuantity,
  getFoodProductCoreNutritionLines,
} from "@/lib/planner/product-planner-entry-presentation";
import type { ProductPlannerEntryData } from "@/types/product-planner-entry";

interface LegacyProductPlanSectionProps {
  entries: ProductPlannerEntryData[];
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  isDeleting: boolean;
  onDelete: (entryId: string) => Promise<void>;
  onRestoreConsumed?: () => void;
  restoreDeleteEntryId?: string | null;
  selectedDate: string;
}

export function LegacyProductPlanSection({
  entries,
  fallbackFocusRef,
  isDeleting,
  onDelete,
  onRestoreConsumed,
  restoreDeleteEntryId,
  selectedDate,
}: LegacyProductPlanSectionProps) {
  const [selectedEntry, setSelectedEntry] =
    useState<ProductPlannerEntryData | null>(null);
  const [deletingEntry, setDeletingEntry] =
    useState<ProductPlannerEntryData | null>(null);
  const detailPanelRef = useRef<HTMLDivElement | null>(null);
  const detailInvokerRef = useRef<HTMLButtonElement | null>(null);
  const detailCloseRef = useRef<HTMLButtonElement | null>(null);
  const detailDeleteRef = useRef<HTMLButtonElement | null>(null);
  const deletePanelRef = useRef<HTMLDivElement | null>(null);
  const deleteCloseRef = useRef<HTMLButtonElement | null>(null);
  const selectedEntries = useMemo(
    () => entries.filter((entry) => entry.plan_date === selectedDate),
    [entries, selectedDate],
  );
  const [restoringDelete, setRestoringDelete] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const deleteInFlightRef = useRef(false);
  const deleteLocked = isDeleting || deletePending;

  useEffect(() => {
    if (!restoreDeleteEntryId) return;
    const entry = selectedEntries.find(({ id }) => id === restoreDeleteEntryId);
    if (!entry) return;

    setRestoringDelete(true);
    setSelectedEntry(entry);
    onRestoreConsumed?.();
  }, [onRestoreConsumed, restoreDeleteEntryId, selectedEntries]);

  const { setReturnFocusTarget: setDetailReturnFocusTarget } = useDialogBoundary({
    active: selectedEntry !== null && deletingEntry === null,
    dialogRef: detailPanelRef,
    fallbackFocusRef,
    initialFocusRef: restoringDelete ? detailDeleteRef : detailCloseRef,
    onClose: () => {
      setRestoringDelete(false);
      setSelectedEntry(null);
    },
  });
  useDialogBoundary({
    active: deletingEntry !== null,
    closeOnEscape: !deleteLocked,
    dialogRef: deletePanelRef,
    fallbackFocusRef,
    initialFocusRef: deleteCloseRef,
    onClose: () => {
      if (!deleteLocked) setDeletingEntry(null);
    },
  });

  if (selectedEntries.length === 0) return null;

  async function confirmDelete() {
    if (!deletingEntry || deleteInFlightRef.current) return;
    deleteInFlightRef.current = true;
    setDeletePending(true);
    try {
      await onDelete(deletingEntry.id);
      setDeletingEntry(null);
      setSelectedEntry(null);
    } catch {
      // The parent owns the user-facing API error; keep confirmation context open.
    } finally {
      deleteInFlightRef.current = false;
      setDeletePending(false);
    }
  }

  return (
    <>
      <section
        aria-labelledby="legacy-product-plan-title"
        className="rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-4"
      >
        <div className="mb-3">
          <h2
            className="text-[15px] font-extrabold text-[var(--foreground)]"
            id="legacy-product-plan-title"
          >
            기존 완제품 계획
          </h2>
          <p className="mt-1 text-xs leading-5 text-[var(--text-2)]">
            이전에 등록한 항목은 확인하거나 삭제할 수 있어요.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {selectedEntries.map((entry) => (
            <button
              aria-label={`${entry.product_name} 상세 보기`}
              className="flex min-h-11 items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--surface-fill)] px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
              data-testid={`legacy-product-${entry.id}`}
              key={entry.id}
              onClick={(event) => {
                setRestoringDelete(false);
                detailInvokerRef.current = event.currentTarget;
                setDetailReturnFocusTarget(() => detailInvokerRef.current);
                setSelectedEntry(entry);
              }}
              type="button"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-[var(--foreground)]">
                  {entry.product_name}
                </span>
                <span className="mt-0.5 block truncate text-xs text-[var(--text-2)]">
                  {[entry.product_brand, formatProductQuantity(entry.quantity)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span aria-hidden="true" className="text-[var(--text-3)]">›</span>
            </button>
          ))}
        </div>
      </section>

      {selectedEntry ? (
        <AppBottomSheet
          ariaLabelledBy="legacy-product-detail-title"
          closeButtonRef={detailCloseRef}
          footer={
            <button
              className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--danger)] px-4 text-sm font-bold text-[var(--danger)]"
              disabled={deleteLocked}
              onClick={() => setDeletingEntry(selectedEntry)}
              ref={detailDeleteRef}
              type="button"
            >
              계획에서 삭제
            </button>
          }
          onClose={() => setSelectedEntry(null)}
          panelClassName="max-w-[480px]"
          panelRef={detailPanelRef}
          testId="legacy-product-detail-sheet"
          title={selectedEntry.product_name}
        >
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--text-2)]">브랜드</dt>
              <dd className="font-semibold text-[var(--foreground)]">
                {selectedEntry.product_brand ?? "브랜드 정보 없음"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--text-2)]">계획 수량</dt>
              <dd className="font-semibold text-[var(--foreground)]">
                {formatProductQuantity(selectedEntry.quantity)}
              </dd>
            </div>
          </dl>
          <div className="mt-5 rounded-[var(--radius-control)] bg-[var(--surface-fill)] p-3">
            <p className="text-sm font-bold text-[var(--foreground)]">
              {formatFoodProductExpectedEnergy(selectedEntry, selectedEntry.quantity)}
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--text-2)]">
              {getFoodProductCoreNutritionLines(
                selectedEntry,
                selectedEntry.quantity,
              ).join(" · ")}
            </p>
          </div>
        </AppBottomSheet>
      ) : null}

      {deletingEntry ? (
        <AppConfirmDialog
          ariaLabelledBy="legacy-product-delete-title"
          closeButtonRef={deleteCloseRef}
          description="삭제한 계획은 되돌릴 수 없어요. 완제품 데이터 자체는 삭제되지 않아요."
          footer={
            <AppModalFooterActions
              cancelDisabled={deleteLocked}
              confirmDisabled={deleteLocked}
              confirmLabel={deleteLocked ? "삭제 중" : "삭제"}
              onCancel={() => setDeletingEntry(null)}
              onConfirm={() => void confirmDelete()}
            />
          }
          onClose={() => {
            if (!deleteLocked) setDeletingEntry(null);
          }}
          panelRef={deletePanelRef}
          testId="legacy-product-delete-confirm"
          title="완제품 계획 삭제"
        >
          <p className="text-sm text-[var(--foreground)]">
            <strong>{deletingEntry.product_name}</strong> 계획을 삭제할까요?
          </p>
        </AppConfirmDialog>
      ) : null}
    </>
  );
}
