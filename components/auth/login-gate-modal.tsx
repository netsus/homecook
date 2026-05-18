"use client";

import React from "react";
import { useEffect, useMemo, useRef } from "react";

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
    <div
      className="fixed inset-0 z-40 flex items-end bg-black/40 md:items-center md:justify-center md:p-4"
      onClick={close}
    >
      <div
        aria-labelledby="login-gate-title"
        aria-modal="true"
        className="w-full max-w-md overflow-hidden rounded-t-[20px] bg-white shadow-[0_-10px_30px_rgba(0,0,0,0.18)] md:rounded-[20px]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex justify-center pt-2">
          <div className="h-1 w-9 rounded-sm bg-[#DEE2E6]" />
        </div>
        <div className="flex items-center px-5 pb-2 pt-3">
          <h2
            className="flex-1 text-[18px] font-bold leading-tight text-[var(--wave1-ink)]"
            id="login-gate-title"
          >
            로그인이 필요한 작업이에요
          </h2>
          <button
            aria-label="닫기"
            className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--wave1-text-2)] transition-colors hover:bg-[var(--wave1-surface-fill)]"
            onClick={close}
            ref={closeButtonRef}
            type="button"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--wave1-surface-fill)]">
              <CloseIcon />
            </span>
          </button>
        </div>
        <div className="px-5 pb-7 pt-3">
          <p className="text-[14px] font-medium leading-6 text-[var(--wave1-text-2)]">
            {description}
          </p>
        </div>
        <div className="flex gap-2 border-t border-[#DEE2E6] bg-white px-5 pb-[calc(28px+env(safe-area-inset-bottom))] pt-3">
          <button
            className="min-h-[48px] flex-1 rounded-[8px] bg-[var(--wave1-surface-fill)] px-4 text-[15px] font-bold text-[var(--wave1-ink)]"
            onClick={close}
            type="button"
          >
            취소
          </button>
          <button
            className="min-h-[48px] flex-[1.45] rounded-[8px] bg-[var(--wave1-mint-contrast)] px-4 text-[15px] font-bold text-white"
            onClick={handleLogin}
            type="button"
          >
            로그인
          </button>
        </div>
      </div>
    </div>
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
