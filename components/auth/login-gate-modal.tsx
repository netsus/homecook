"use client";

import React from "react";
import { useEffect, useMemo, useRef } from "react";

import {
  AppBottomSheet,
  AppModalFooterActions,
} from "@/components/shared/app-overlay";
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
import { savePendingAction } from "@/lib/auth/pending-action";
import { useAuthGateStore } from "@/stores/ui-store";

const ACTION_LABELS = {
  like: "좋아요",
  save: "저장",
  planner: "플래너 추가",
} as const;

export function LoginGateModal() {
  const { action, close, isOpen } = useAuthGateStore();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const isDesktopViewport = useDesktopViewport();

  const description = useMemo(() => {
    if (!action) {
      return "";
    }

    if (action.type === "planner") {
      return "로그인하면 원래 하려던 작업으로 자동 이동합니다.";
    }

    return `${ACTION_LABELS[action.type]} 기능은 로그인 후 이용할 수 있어요. 로그인하면 원래 하려던 작업으로 자동 이동합니다.`;
  }, [action]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, isOpen]);

  if (!isOpen || !action) {
    return null;
  }

  const handleLogin = () => {
    savePendingAction(action);
    document.cookie = createPostAuthNextCookie(action.redirectTo);
    window.location.assign(`/login?next=${encodeURIComponent(action.redirectTo)}`);
    close();
  };

  if (isDesktopViewport) {
    return (
      <WebModal onBackdropClick={close}>
        <WebDialog aria-labelledby="login-gate-title" size="narrow">
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
      title="로그인이 필요한 작업이에요"
    >
      <p className="text-[14px] font-medium leading-6 text-[var(--wave1-text-2)]">
        {description}
      </p>
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
