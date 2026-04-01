"use client";

import React from "react";
import { useState, useTransition } from "react";

import {
  getLocalDevAuthCredentials,
  isLocalDevAuthEnabled,
} from "@/lib/auth/local-dev-auth";
import {
  savePendingAction,
  type PendingRecipeAction,
} from "@/lib/auth/pending-action";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";

interface LocalDevLoginPanelProps {
  nextPath: string;
  pendingAction?: PendingRecipeAction | null;
  onStarted?: () => void;
}

function isAlreadyRegisteredError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return message.includes("already registered") || message.includes("already been registered");
}

export function LocalDevLoginPanel({
  nextPath,
  pendingAction,
  onStarted,
}: LocalDevLoginPanelProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!isLocalDevAuthEnabled()) {
    return null;
  }

  const handleLocalLogin = () => {
    startTransition(async () => {
      try {
        setErrorMessage(null);

        if (!hasSupabasePublicEnv()) {
          throw new Error("로컬 Supabase 환경변수를 읽지 못했어요. local Supabase 실행 상태를 확인해주세요.");
        }

        if (pendingAction) {
          savePendingAction(pendingAction);
        }

        const credentials = getLocalDevAuthCredentials();
        const supabase = getSupabaseBrowserClient();
        let signInResult = await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        });

        if (signInResult.error) {
          const signUpResult = await supabase.auth.signUp({
            email: credentials.email,
            password: credentials.password,
            options: {
              data: {
                nickname: credentials.nickname,
              },
            },
          });

          if (signUpResult.error && !isAlreadyRegisteredError(signUpResult.error)) {
            throw signUpResult.error;
          }

          signInResult = await supabase.auth.signInWithPassword({
            email: credentials.email,
            password: credentials.password,
          });
        }

        if (signInResult.error) {
          throw signInResult.error;
        }

        onStarted?.();
        window.location.assign(nextPath);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "로컬 테스트 계정 로그인을 시작하지 못했어요.",
        );
      }
    });
  };

  return (
    <div className="rounded-[16px] border border-[color:rgba(46,166,122,0.18)] bg-[color:rgba(46,166,122,0.08)] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--olive)]">
        Local Supabase
      </p>
      <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">
        mock 없이 로컬 Supabase DB를 바로 테스트할 수 있도록, 개발 전용 계정으로 로그인합니다.
      </p>
      <button
        className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-[12px] bg-[var(--olive)] px-4 py-4 text-base font-semibold text-white transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        onClick={handleLocalLogin}
        type="button"
      >
        {isPending ? "로컬 테스트 계정 로그인 중..." : "로컬 테스트 계정으로 시작"}
      </button>
      <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
        첫 로그인에서는 계정을 만들고, 이후에는 같은 계정과 같은 local DB를 계속 사용합니다.
      </p>
      {errorMessage ? (
        <p className="mt-3 rounded-[12px] border border-[color:rgba(255,108,60,0.2)] bg-[color:rgba(255,108,60,0.08)] px-4 py-3 text-sm text-[var(--brand-deep)]">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
