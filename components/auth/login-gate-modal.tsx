"use client";

import React from "react";
import { useEffect, useMemo, useRef } from "react";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { useAuthGateStore } from "@/stores/ui-store";

const ACTION_LABELS = {
  like: "좋아요",
  save: "저장",
  planner: "플래너 추가",
} as const;

export function LoginGateModal() {
  const { action, close, isOpen } = useAuthGateStore();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const description = useMemo(() => {
    if (!action) {
      return "";
    }

    return `${ACTION_LABELS[action.type]} 기능은 로그인 후 이어서 진행돼요. 로그인하고 원래 보던 레시피로 돌아옵니다.`;
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

  return (
    <div
      className="fixed inset-0 z-40 flex items-end bg-black/50 p-4 md:items-center md:justify-center"
      onClick={close}
    >
      <div
        aria-labelledby="login-gate-title"
        aria-modal="true"
        className="glass-panel w-full max-w-md rounded-[20px] px-5 py-6 md:px-6"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[color:rgba(224,80,32,0.16)] bg-[color:rgba(255,108,60,0.14)] text-xl text-[var(--foreground)]">
              잠금
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
              Login Gate
            </p>
            <h2
              className="mt-2 text-2xl font-extrabold tracking-[-0.02em] text-[var(--foreground)]"
              id="login-gate-title"
            >
              로그인이 필요한 작업이에요
            </h2>
          </div>
          <button
            aria-label="닫기"
            className="rounded-full border border-[var(--line)] px-3 py-1 text-sm text-[var(--muted)]"
            onClick={close}
            ref={closeButtonRef}
            type="button"
          >
            닫기
          </button>
        </div>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
          {description}
        </p>
        <div className="mt-5 rounded-[16px] border border-[var(--line)] bg-white/70 p-4">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            로그인하면 원래 레시피로 바로 돌아옵니다.
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            보호 액션 위치를 저장해 두었다가 로그인 완료 후 한 번만 복구합니다.
          </p>
        </div>
        <div className="mt-5">
          <SocialLoginButtons
            nextPath={action.redirectTo}
            onStarted={close}
            pendingAction={action}
          />
        </div>
      </div>
    </div>
  );
}
