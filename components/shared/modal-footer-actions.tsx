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

/** Cancel (flex-1) + primary confirm (flex-2) footer row. D1: olive CTA. */
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
        className="flex-1 rounded-[14px] border border-[var(--line)] bg-white/60 py-3.5 text-sm font-semibold text-[var(--foreground)] hover:bg-white/80 disabled:opacity-40"
        disabled={cancelDisabled}
        onClick={onCancel}
        type="button"
      >
        {cancelLabel}
      </button>
      <button
        className="flex-[2] rounded-[14px] bg-[var(--olive)] py-3.5 text-sm font-bold text-white disabled:opacity-50"
        disabled={confirmDisabled}
        onClick={onConfirm}
        type="button"
      >
        {confirmLabel}
      </button>
    </div>
  );
}
