"use client";

import React from "react";
import { useEffect } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtonsDeferred } from "@/components/auth/social-login-buttons-deferred";
import { useViewMode } from "@/components/shared/use-view-mode";
import { WebShell, WebTopNav } from "@/components/web";
import { sanitizeInternalPath } from "@/lib/navigation/return-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";

interface LoginScreenProps {
  authError?: string | null;
  nextPath?: string;
}

const WEB_NAV_ITEMS = [
  { id: "home", href: "/", label: "홈" },
  { id: "planner", href: "/planner", label: "플래너" },
  { id: "pantry", href: "/pantry", label: "팬트리" },
  { id: "mypage", href: "/mypage", label: "마이페이지" },
] as const;

export function LoginScreen({
  authError,
  nextPath = "/",
}: LoginScreenProps) {
  const showAuthError = authError === "oauth_failed";
  const safeNextPath = sanitizeInternalPath(nextPath, "/");
  const viewMode = useViewMode();

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

  if (viewMode === "web") {
    return (
      <WebShell className="web-login-shell">
        <WebTopNav activeId="login" items={WEB_NAV_ITEMS} />
        <div className="web-login-screen">
          <section className="web-login-card" data-testid="login-web-card">
            {showAuthError ? (
              <div className="web-login-alert">
                로그인에 실패했어요. 다시 시도해주세요.
              </div>
            ) : null}

            <div className="web-login-mark" data-testid="login-brand-mark">
              <LoginMarkIcon />
            </div>
            <p className={showAuthError ? "web-login-brand web-login-brand-offset" : "web-login-brand"}>
              HOMECOOK
            </p>
            <h1 className="web-login-title">
              로그인이 필요해요
            </h1>
            <p className="web-login-description">
              로그인 후 이전 화면으로 돌아갑니다.
            </p>

            <div className="web-login-provider-list">
              <SocialLoginButtonsDeferred nextPath={safeNextPath} />
            </div>

            <div className="web-login-divider">
              <span>또는</span>
            </div>

            <a className="web-login-browse" href={safeNextPath}>
              로그인 없이 둘러보기
            </a>
          </section>
        </div>
      </WebShell>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface)] text-[var(--wave1-ink)]">
      <section className="relative mx-auto flex min-h-screen max-w-[430px] flex-col justify-center bg-[var(--surface)] px-6 pb-[calc(40px+env(safe-area-inset-bottom))] pt-[calc(32px+env(safe-area-inset-top))] text-center md:min-h-[720px] md:pb-16 md:pt-16">
        <button
          aria-label="이전 화면으로"
          className="absolute left-5 top-[calc(18px+env(safe-area-inset-top))] flex h-9 w-9 items-center justify-center rounded-full text-[var(--wave1-ink)] transition-colors hover:bg-[var(--wave1-surface-fill)]"
          onClick={() => {
            window.location.assign(safeNextPath);
          }}
          type="button"
        >
          <ChevronLeftIcon />
        </button>

        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--brand-soft)] text-[var(--brand)] shadow-[var(--shadow-1)]"
          data-testid="login-brand-mark"
        >
          <LoginMarkIcon />
        </div>
        <div className="mx-auto mt-4 inline-flex rounded-[var(--radius-full)] bg-[var(--brand-soft)] px-3 py-1 text-[12px] font-extrabold tracking-[0.08em] text-[var(--brand)]">
          HOMECOOK
        </div>

        <h1 className="mt-5 text-[26px] font-bold leading-[1.35] text-[var(--wave1-ink)]">
          로그인이 필요해요
        </h1>
        <p className="mx-auto mt-3 max-w-[300px] text-[14px] font-medium leading-6 text-[var(--wave1-text-3)]">
          로그인 후 이전 화면으로 돌아갑니다.
        </p>

        {showAuthError ? (
          <div className="mt-7 rounded-[var(--radius-card)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-[13px] font-semibold text-[var(--danger-strong)]">
            로그인에 실패했어요. 다시 시도해주세요.
          </div>
        ) : null}

        <div className={showAuthError ? "mt-4" : "mt-6"}>
          <SocialLoginButtonsDeferred nextPath={safeNextPath} />
        </div>

        <p className="mt-4 text-center text-[11px] font-medium leading-5 text-[var(--wave1-text-3)]">
          계속 진행하면 <span className="underline underline-offset-2">이용약관</span>과{" "}
          <span className="underline underline-offset-2">개인정보처리방침</span>에 동의합니다.
        </p>
      </section>
    </div>
  );
}

function LoginMarkIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <path d="M7 10V8a5 5 0 0 1 10 0v2" />
      <rect height="10" rx="2.5" width="14" x="5" y="10" />
      <path d="M12 14v2.5" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-7 w-7"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.4"
      viewBox="0 0 24 24"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}
