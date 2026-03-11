"use client";

import { useMemo } from "react";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { useAuthGateStore } from "@/stores/ui-store";

const ACTION_LABELS = {
  like: "좋아요",
  save: "저장",
  planner: "플래너 추가",
} as const;

export function LoginGateModal() {
  const { action, close, isOpen } = useAuthGateStore();

  const description = useMemo(() => {
    if (!action) {
      return "";
    }

    return `${ACTION_LABELS[action.type]} 기능은 로그인 후 이어서 진행돼요. 로그인하고 원래 보던 레시피로 돌아옵니다.`;
  }, [action]);

  if (!isOpen || !action) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/30 p-4 md:items-center md:justify-center">
      <div className="glass-panel w-full max-w-md rounded-[30px] px-5 py-6 md:px-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)]">
              Login Gate
            </p>
            <h2 className="display mt-2 text-3xl text-[var(--brand-deep)]">
              로그인이 필요한 작업이에요
            </h2>
          </div>
          <button
            aria-label="닫기"
            className="rounded-full border border-[var(--line)] px-3 py-1 text-sm text-[var(--muted)]"
            onClick={close}
            type="button"
          >
            닫기
          </button>
        </div>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
          {description}
        </p>
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
