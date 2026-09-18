"use client";

import React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AppBottomSheet,
  AppModalFooterActions,
} from "@/components/shared/app-overlay";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import {
  WebButton,
  WebDialog,
  WebDialogBody,
  WebDialogFooter,
  WebDialogHeader,
  WebDialogTitle,
  WebIconButton,
  WebModal,
} from "@/components/web";
import { createPostAuthNextCookie } from "@/lib/auth/post-auth-next";
import { clearPendingAction, savePendingAction } from "@/lib/auth/pending-action";
import { useAuthGateStore } from "@/stores/ui-store";

export function LoginGateModal() {
  const { action, close: closeGate, isOpen } = useAuthGateStore();
  const close = useCallback(() => {
    clearPendingAction();
    closeGate();
  }, [closeGate]);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const isDesktopViewport = useDesktopViewport();
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => setStorageError(null), [action, isOpen]);

  const description = useMemo(() => {
    if (!action) {
      return "";
    }

    if (action.type === "recipe-edit-save") {
      return "다시 로그인하면 수정한 내용으로 저장을 계속할 수 있어요.";
    }

    if (action.type === "recipe-save-as-new") {
      return "다시 로그인하면 새 레시피 저장을 계속할 수 있어요.";
    }

    if (action.type === "recipe-delete") {
      return "다시 로그인하면 삭제 확인으로 돌아가요. 삭제는 마지막 확인 뒤에만 진행돼요.";
    }

    return "로그인하면 원래 하려던 작업으로 자동 이동해요.";
  }, [action]);

  useDialogBoundary({
    active: isOpen && Boolean(action),
    dialogRef,
    initialFocusRef: closeButtonRef,
    onClose: close,
  });

  if (!isOpen || !action) {
    return null;
  }

  const handleLogin = () => {
    if (!savePendingAction(action)) {
      setStorageError("작업을 임시 보관하지 못했어요. 내용을 복사해 둔 뒤 다시 시도해 주세요.");
      return;
    }
    document.cookie = createPostAuthNextCookie(action.redirectTo);
    window.location.assign(`/login?reauthenticate=1&next=${encodeURIComponent(action.redirectTo)}`);
    closeGate();
  };

  if (isDesktopViewport) {
    return (
      <WebModal onBackdropClick={close}>
        <WebDialog aria-labelledby="login-gate-title" ref={dialogRef} size="narrow">
          <WebDialogHeader>
            <WebDialogTitle id="login-gate-title">
              로그인이 필요한 작업이에요
            </WebDialogTitle>
            <WebIconButton aria-label="닫기" onClick={close} ref={closeButtonRef}>
              <CloseIcon />
            </WebIconButton>
          </WebDialogHeader>
          <WebDialogBody>
            <p className="text-[14px] font-medium leading-6 text-[var(--web-text-2)]">
              {description}
            </p>
            {storageError ? <p className="mt-3 text-sm text-[var(--danger-strong)]" role="alert">{storageError}</p> : null}
          </WebDialogBody>
          <WebDialogFooter>
            <WebButton onClick={close} variant="tertiary">
              취소
            </WebButton>
            <WebButton onClick={handleLogin}>
              로그인
            </WebButton>
          </WebDialogFooter>
        </WebDialog>
      </WebModal>
    );
  }

  return (
    <AppBottomSheet
      ariaLabelledBy="login-gate-title"
      closeButtonRef={closeButtonRef}
      footer={
        <AppModalFooterActions
          confirmLabel="로그인"
          onCancel={close}
          onConfirm={handleLogin}
        />
      }
      onClose={close}
      panelClassName="max-w-md"
      panelRef={dialogRef}
      title="로그인이 필요한 작업이에요"
    >
      <p className="text-[14px] font-medium leading-6 text-[var(--wave1-text-2)]">
        {description}
      </p>
      {storageError ? <p className="mt-3 text-sm text-[var(--danger-strong)]" role="alert">{storageError}</p> : null}
    </AppBottomSheet>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
