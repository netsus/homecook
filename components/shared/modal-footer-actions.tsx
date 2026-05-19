"use client";

import React from "react";

interface ModalFooterActionsProps {
  cancelAriaLabel?: string;
  cancelLabel?: string;
  cancelTestId?: string;
  confirmAriaLabel?: string;
  confirmLabel: string;
  confirmTestId?: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
}

/** Cancel (flex-1) + primary confirm (flex-2) footer row. */
export function ModalFooterActions({
  cancelAriaLabel,
  cancelLabel = "취소",
  cancelTestId,
  confirmAriaLabel,
  confirmLabel,
  confirmTestId,
  onCancel,
  onConfirm,
  confirmDisabled,
  cancelDisabled,
}: ModalFooterActionsProps) {
  return (
    <div className="flex gap-2.5">
      <button
        aria-label={cancelAriaLabel}
        className="flex h-[var(--control-height-lg)] flex-1 items-center justify-center whitespace-nowrap rounded-[var(--radius-sm)] border border-[var(--wave1-border)] bg-[var(--wave1-surface)] px-4 text-sm font-semibold text-[var(--wave1-text-2)] transition-colors hover:bg-[var(--wave1-surface-fill)] disabled:opacity-40"
        data-testid={cancelTestId}
        disabled={cancelDisabled}
        onClick={onCancel}
        type="button"
      >
        {cancelLabel}
      </button>
      <button
        aria-label={confirmAriaLabel}
        className="flex h-[var(--control-height-lg)] flex-[2] items-center justify-center whitespace-nowrap rounded-[var(--radius-sm)] bg-[var(--wave1-mint-contrast)] px-4 text-sm font-bold text-[var(--wave1-surface)] shadow-[var(--wave1-shadow-natural)] transition-colors hover:bg-[var(--wave1-mint-contrast-deep)] disabled:opacity-50"
        data-testid={confirmTestId}
        disabled={confirmDisabled}
        onClick={onConfirm}
        type="button"
      >
        {confirmLabel}
      </button>
    </div>
  );
}
