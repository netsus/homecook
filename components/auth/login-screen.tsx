"use client";

import React from "react";
import { useEffect } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtonsDeferred } from "@/components/auth/social-login-buttons-deferred";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";

interface LoginScreenProps {
  authError?: string | null;
  nextPath?: string;
}

export function LoginScreen({
  authError,
  nextPath = "/",
}: LoginScreenProps) {
  const showAuthError = authError === "oauth_failed";

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

        window.location.replace(nextPath);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (session) {
          window.location.replace(nextPath);
        }
      },
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [nextPath]);

  return (
    <div className="min-h-screen bg-white text-[var(--wave1-ink)]">
      <section className="mx-auto flex min-h-screen max-w-[430px] flex-col bg-white px-6 pb-[calc(116px+env(safe-area-inset-bottom))] pt-[56px] md:min-h-[720px] md:justify-center md:pb-16 md:pt-16">
        <button
          aria-label="이전 화면으로"
          className="mb-7 flex h-9 w-9 items-center justify-center rounded-full text-[var(--wave1-ink)] transition-colors hover:bg-[var(--wave1-surface-fill)]"
          onClick={() => {
            if (window.history.length > 1) {
              window.history.back();
              return;
            }

            window.location.assign(nextPath);
          }}
          type="button"
        >
          <ChevronLeftIcon />
        </button>

        <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[18px] bg-[var(--wave1-mint)] text-white shadow-[0_10px_22px_rgba(42,193,188,0.24)]">
          <span
            aria-hidden="true"
            className="text-[30px] leading-none [font-family:var(--wave1-font-brand)]"
          >
            홈
          </span>
        </div>

        <h1 className="mt-5 text-[26px] font-bold leading-[1.35] text-[var(--wave1-ink)] [font-family:var(--wave1-font-brand)]">
          홈쿡과 함께
          <br />
          오늘 뭐 먹지 정해봐요
        </h1>
        <p className="mt-4 text-[14px] font-medium leading-6 text-[var(--wave1-text-3)]">
          식단을 짜고, 장 보고, 요리한 기록을 남길 수 있어요.
        </p>

        {showAuthError ? (
          <div className="mt-7 rounded-[12px] border border-[#FFB8B4] bg-[#FFF1F0] px-4 py-3 text-[13px] font-semibold text-[#C84C48]">
            로그인에 실패했어요. 다시 시도해주세요.
          </div>
        ) : null}

        <div className={showAuthError ? "mt-4" : "mt-8"}>
          <SocialLoginButtonsDeferred nextPath={nextPath} />
        </div>

        <p className="mt-4 text-center text-[11px] font-medium leading-5 text-[var(--wave1-text-3)]">
          계속 진행하면 <span className="underline underline-offset-2">이용약관</span>과{" "}
          <span className="underline underline-offset-2">개인정보처리방침</span>에 동의합니다.
        </p>
      </section>
    </div>
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
