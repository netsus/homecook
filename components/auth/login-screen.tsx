"use client";

import Link from "next/link";
import React from "react";
import { useEffect } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtonsDeferred } from "@/components/auth/social-login-buttons-deferred";
import { ContentState } from "@/components/shared/content-state";
import { useViewMode } from "@/components/shared/use-view-mode";
import type { AuthProviderId } from "@/lib/auth/providers";
import { sanitizeInternalPath } from "@/lib/navigation/return-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";

interface LoginScreenProps {
  attemptedProvider?: AuthProviderId | null;
  authError?: string | null;
  expectedProvider?: AuthProviderId | null;
  lastProvider?: AuthProviderId | null;
  nextPath?: string;
}

/** Contextual pill + copy so the gate screen matches the surface it guards. */
function resolveGateContext(nextPath: string) {
  if (nextPath.startsWith("/planner")) {
    return {
      eyebrow: "플래너 접근",
      description: "로그인 후 보던 주간 범위로 돌아와 식단을 계속 관리할 수 있어요.",
    };
  }
  if (nextPath.startsWith("/pantry")) {
    return {
      eyebrow: "팬트리 접근",
      description: "로그인 후 내 팬트리 재료를 이어서 관리할 수 있어요.",
    };
  }
  if (nextPath.startsWith("/recipebook")) {
    return {
      eyebrow: "레시피북 접근",
      description: "로그인 후 저장한 레시피를 이어서 볼 수 있어요.",
    };
  }
  if (nextPath.startsWith("/mypage")) {
    return {
      eyebrow: "마이페이지 접근",
      description: "로그인 후 내 정보를 이어서 관리할 수 있어요.",
    };
  }
  return {
    eyebrow: "로그인 필요",
    description: "로그인하면 이전 화면으로 돌아와요.",
  };
}

export function LoginScreen({
  authError,
  lastProvider = null,
  nextPath = "/",
}: LoginScreenProps) {
  const safeErrorCopy: Record<string, string> = {
    oauth_failed: "로그인에 실패했어요. 다시 시도해 주세요.",
    email_required: "로그인하려면 이메일 제공 동의가 필요해요. 동의 항목을 확인한 뒤 다시 시도해 주세요.",
    account_conflict: "현재 계정으로 로그인할 수 없어요. 다른 로그인 방법을 시도해 주세요.",
    provider_resolution_failed: "로그인 정보를 안전하게 확인하지 못했어요. 다시 시도해 주세요.",
  };
  const safeNextPath = sanitizeInternalPath(nextPath, "/");
  const viewMode = useViewMode();
  const gateContext = resolveGateContext(safeNextPath);
  const errorCopy = authError ? safeErrorCopy[authError] : null;

  useEffect(() => {
    if (!hasSupabasePublicEnv()) {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    void supabase.auth
      .getSession()
      .then((result: { data: { session: { user?: unknown } | null } }) => {
        if (!mounted || !result.data.session) {
          return;
        }

        window.location.replace(safeNextPath);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (session) {
          window.location.replace(safeNextPath);
        }
      },
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [safeNextPath]);

  const gateBody = (
    <ContentState
      className="web-login-gate"
      description={gateContext.description}
      eyebrow={gateContext.eyebrow}
      safeBottomPadding
      title="이 화면은 로그인이 필요해요"
      titleLevel={1}
      tone="gate"
    >
      <div className="space-y-3">
        {errorCopy ? (
          <div
            className="rounded-[var(--radius-card)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-[13px] font-semibold text-[var(--danger-strong)]"
            data-testid="login-web-card"
            role="alert"
          >
            {errorCopy}
          </div>
        ) : null}
        <div data-testid="login-brand-mark">
          <SocialLoginButtonsDeferred
            lastProvider={lastProvider}
            nextPath={safeNextPath}
          />
        </div>
        <Link
          className="inline-flex min-h-[var(--control-height-md)] items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--muted)]"
          href="/"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </ContentState>
  );

  if (viewMode === "web") {
    return (
      <main className="web-login-shell web-login-fullscreen">{gateBody}</main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--surface)] text-[var(--wave1-ink)]">
      {gateBody}
    </main>
  );
}
