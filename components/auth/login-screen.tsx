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
    <div className="mx-auto max-w-3xl">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="glass-panel overflow-hidden rounded-[20px]">
          <div className="relative h-full px-6 py-7">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,108,60,0.22),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(46,166,122,0.18),transparent_40%)]" />
            <div className="relative">
              <div className="inline-flex rounded-full bg-[color:rgba(255,108,60,0.12)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--brand-deep)]">
                Homecook
              </div>
              <div className="mt-6 flex h-28 w-28 items-center justify-center rounded-[20px] bg-[var(--surface)] text-4xl shadow-[var(--shadow)]">
                집밥
              </div>
              <p className="mt-6 text-sm font-semibold uppercase tracking-[0.22em] text-[var(--olive)]">
                집밥하는 모든 과정을 함께
              </p>
              <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] text-[var(--foreground)]">
                오늘의 레시피 흐름을
                <br />
                같은 자리에서 이어갑니다
              </h1>
              <ul className="mt-6 space-y-3 text-sm leading-6 text-[var(--muted)]">
                <li>보호 액션은 로그인 후 원래 레시피로 복귀합니다.</li>
                <li>카카오, 네이버, 구글 OAuth 흐름을 같은 기준으로 맞춥니다.</li>
                <li>Slice 01에서는 로그인 게이트와 복귀 경험까지 닫습니다.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-[20px] px-6 py-7">
          {showAuthError ? (
            <div className="rounded-[12px] border border-[color:rgba(255,108,60,0.2)] bg-[color:rgba(255,108,60,0.08)] px-4 py-3 text-sm font-medium text-[var(--foreground)]">
              로그인에 실패했어요. 다시 시도해주세요.
            </div>
          ) : null}

          <p
            className={`text-xs font-semibold uppercase tracking-[0.24em] text-[var(--olive)] ${
              showAuthError ? "mt-4" : "mt-1"
            }`}
          >
            Login
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.03em] text-[var(--foreground)]">
            소셜 로그인으로 이어서 진행하세요
          </h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            로그인 후에는 원래 보고 있던 레시피나 액션 위치로 자연스럽게 돌아옵니다.
          </p>

          <div className="mt-7">
            <SocialLoginButtonsDeferred nextPath={nextPath} />
          </div>

          <div className="mt-8 grid gap-3 rounded-[16px] border border-[var(--line)] bg-white/70 p-4 text-sm text-[var(--muted)]">
            <div className="flex items-center justify-between gap-3">
              <span>복귀 경로</span>
              <strong className="font-semibold text-[var(--foreground)]">
                {nextPath === "/" ? "HOME 또는 원래 레시피" : nextPath}
              </strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>지원 방식</span>
              <strong className="font-semibold text-[var(--foreground)]">
                OAuth + return-to-action
              </strong>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3 text-xs font-medium text-[var(--muted)]">
            <span>이용약관</span>
            <span>개인정보처리방침</span>
          </div>
        </section>
      </div>
    </div>
  );
}
