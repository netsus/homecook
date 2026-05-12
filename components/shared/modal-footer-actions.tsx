"use client";

import React from "react";

interface ModalFooterActionsProps {
  cancelLabel?: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
}

/** Cancel (flex-1) + primary confirm (flex-2) footer row. */
export function ModalFooterActions({
  cancelLabel = "취소",
  confirmLabel,
  onCancel,
  onConfirm,
  confirmDisabled,
  cancelDisabled,
}: ModalFooterActionsProps) {
  return (
    <div className="flex gap-2.5">
      <button
        className="flex min-h-[48px] flex-1 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--wave1-border)] bg-[var(--wave1-surface)] py-3.5 text-sm font-semibold text-[var(--wave1-text-2)] transition-colors hover:bg-[var(--wave1-surface-fill)] disabled:opacity-40"
        disabled={cancelDisabled}
        onClick={onCancel}
        type="button"
      >
        {cancelLabel}
      </button>
      <button
        className="flex min-h-[48px] flex-[2] items-center justify-center rounded-[var(--radius-sm)] bg-[var(--wave1-mint-contrast)] py-3.5 text-sm font-bold text-[var(--wave1-surface)] shadow-[var(--wave1-shadow-natural)] transition-colors hover:bg-[var(--wave1-mint-contrast-deep)] disabled:opacity-50"
        disabled={confirmDisabled}
        onClick={onConfirm}
        type="button"
      >
        {confirmLabel}
      </button>
    </div>
  );
}
