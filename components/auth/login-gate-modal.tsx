"use client";

import React from "react";
import { useEffect, useMemo, useRef } from "react";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { ModalHeader } from "@/components/shared/modal-header";
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
      className="fixed inset-0 z-40 flex items-end bg-[color-mix(in_srgb,var(--foreground)_42%,transparent)] p-4 backdrop-blur-[1px] md:items-center md:justify-center"
      onClick={close}
    >
      <div
        aria-labelledby="login-gate-title"
        aria-modal="true"
        className="w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--line)] bg-[var(--panel)] px-5 py-6 shadow-[var(--shadow-3)] md:px-6"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        {/* D2: no eyebrow · D3: icon-only 44×44 close · D6: modal family join */}
        <ModalHeader
          closeButtonRef={closeButtonRef}
          onClose={close}
          title="로그인이 필요한 작업이에요"
          titleId="login-gate-title"
        />
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
          {description}
        </p>
        <div className="mt-5 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface-fill)] p-4">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            로그인하면 원래 레시피로 바로 돌아옵니다.
          </p>
          <p className="mt-1.5 text-sm text-[var(--muted)]">
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
