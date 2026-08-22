"use client";

import React, { useRef } from "react";

import {
  AppConfirmDialog,
  AppModalFooterActions,
} from "@/components/shared/app-overlay";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";

interface PersonalRecipeDeleteDialogProps {
  errorMessage?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  submitting?: boolean;
}

export function PersonalRecipeDeleteDialog({
  errorMessage = null,
  isOpen,
  onClose,
  onConfirm,
  submitting = false,
}: PersonalRecipeDeleteDialogProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useDialogBoundary({
    active: isOpen,
    dialogRef,
    initialFocusRef: closeButtonRef,
    onClose: () => {
      if (!submitting) {
        onClose();
      }
    },
  });

  if (!isOpen) {
    return null;
  }

  return (
    <AppConfirmDialog
      ariaLabelledBy="personal-recipe-delete-dialog-title"
      backdropLayerClassName="z-[120]"
      closeButtonRef={closeButtonRef}
      closeDisabled={submitting}
      footer={
        <AppModalFooterActions
          cancelDisabled={submitting}
          confirmDisabled={submitting}
          confirmLabel={submitting ? "삭제 중" : "삭제"}
          confirmTone="danger"
          onCancel={onClose}
          onConfirm={onConfirm}
        />
      }
      onClose={() => {
        if (!submitting) {
          onClose();
        }
      }}
      panelRef={dialogRef}
      title="정말 레시피를 삭제할까요?"
    >
      <div className="space-y-3">
        <p className="text-[15px] leading-6 text-[var(--wave1-text-2)]">
          삭제한 뒤에는 이 레시피를 새로 선택할 수 없어요. 기존 계획, 요리, 기록은 그대로 남아요.
        </p>
        {errorMessage ? (
          <p
            className="rounded-[var(--radius-card)] bg-[var(--danger-surface)] px-3 py-2 text-[14px] font-medium text-[var(--danger)]"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}
      </div>
    </AppConfirmDialog>
  );
}
