"use client";

import React from "react";
import { useEffect } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

import { SocialLoginButtonsDeferred } from "@/components/auth/social-login-buttons-deferred";
import { useViewMode } from "@/components/shared/use-view-mode";
import { sanitizeInternalPath } from "@/lib/navigation/return-context";
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
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
          <section className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-1)]">
            <div className="h-full px-6 py-7">
              <div>
                <div className="inline-flex rounded-full bg-[var(--surface-fill)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand)]">
                  Homecook
                </div>
                <div className="mt-6 flex h-28 w-28 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--surface-fill)] text-4xl shadow-[var(--shadow-1)]">
                  집밥
                </div>
                <p className="mt-6 text-sm font-semibold tracking-[-0.3px] text-[var(--brand)]">
                  집밥하는 모든 과정을 함께
                </p>
                <h1 className="mt-3 text-3xl font-extrabold tracking-[-0.3px] text-[var(--foreground)]">
                  오늘의 레시피 흐름을
                  <br />
                  같은 자리에서 이어갑니다
                </h1>
                <ul className="mt-6 space-y-3 text-sm leading-6 text-[var(--muted)]">
                  <li>보호 액션은 로그인 후 원래 레시피로 복귀합니다.</li>
                  <li>네이버, 구글 OAuth 흐름을 같은 기준으로 맞춥니다.</li>
                  <li>Slice 01에서는 로그인 게이트와 복귀 경험까지 닫습니다.</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] px-6 py-7 shadow-[var(--shadow-1)]">
            {showAuthError ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-fill)] px-4 py-3 text-sm font-medium text-[var(--foreground)]">
                로그인에 실패했어요. 다시 시도해주세요.
              </div>
            ) : null}

            <p
              className={`text-xs font-semibold uppercase tracking-[0.16em] text-[var(--brand)] ${
                showAuthError ? "mt-4" : "mt-1"
              }`}
            >
              Login
            </p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-[-0.3px] text-[var(--foreground)]">
              소셜 로그인으로 이어서 진행하세요
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              로그인 후에는 원래 보고 있던 레시피나 액션 위치로 자연스럽게 돌아옵니다.
            </p>

            <div className="mt-7">
              <SocialLoginButtonsDeferred nextPath={safeNextPath} />
            </div>

            <div className="mt-8 grid gap-3 rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface-fill)] p-4 text-sm text-[var(--muted)]">
              <div className="flex items-center justify-between gap-3">
                <span>복귀 경로</span>
                <strong className="font-semibold text-[var(--foreground)]">
                  {safeNextPath === "/" ? "HOME 또는 원래 레시피" : safeNextPath}
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

  return (
    <div className="min-h-screen bg-white text-[var(--wave1-ink)]">
      <section className="mx-auto flex min-h-screen max-w-[430px] flex-col bg-white px-6 pb-[calc(40px+env(safe-area-inset-bottom))] pt-[56px] md:min-h-[720px] md:justify-center md:pb-16 md:pt-16">
        <button
          aria-label="이전 화면으로"
          className="mb-7 flex h-9 w-9 items-center justify-center rounded-full text-[var(--wave1-ink)] transition-colors hover:bg-[var(--wave1-surface-fill)]"
          onClick={() => {
            window.location.assign(safeNextPath);
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
