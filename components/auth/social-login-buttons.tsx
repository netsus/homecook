"use client";

import React from "react";
import { useState, useTransition } from "react";

import { LocalDevLoginPanel } from "@/components/auth/local-dev-login-panel";
import {
  AUTH_PROVIDER_META,
  getEnabledAuthProviders,
  type AuthProviderId,
} from "@/lib/auth/providers";
import {
  isLocalDevAuthEnabled,
  isLocalGoogleOAuthEnabled,
} from "@/lib/auth/local-dev-auth";
import { createPostAuthNextCookie } from "@/lib/auth/post-auth-next";
import {
  type PendingRecipeAction,
  savePendingAction,
} from "@/lib/auth/pending-action";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export interface SocialLoginButtonsProps {
  nextPath: string;
  pendingAction?: PendingRecipeAction | null;
  onStarted?: () => void;
}

export function SocialLoginButtons({
  nextPath,
  pendingAction,
  onStarted,
}: SocialLoginButtonsProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const localDevAuthEnabled = isLocalDevAuthEnabled();
  const localGoogleOAuthEnabled = isLocalGoogleOAuthEnabled();
  const providers = localDevAuthEnabled && !localGoogleOAuthEnabled
    ? []
    : getEnabledAuthProviders();

  const handleSignIn = (provider: AuthProviderId) => {
    startTransition(async () => {
      try {
        setErrorMessage(null);
        setPendingProvider(provider);

        if (!hasSupabasePublicEnv()) {
          throw new Error(
            "Supabase 공개 환경변수를 읽지 못했습니다. .env.local 작성 후 개발 서버를 다시 시작하세요.",
          );
        }

        if (pendingAction) {
          savePendingAction(pendingAction);
        }

        document.cookie = createPostAuthNextCookie(nextPath);

        onStarted?.();

        const supabase = getSupabaseBrowserClient();
        const callback = new URL("/auth/callback", window.location.origin);
        callback.searchParams.set("next", nextPath);

        const { error } = await supabase.auth.signInWithOAuth({
          provider: provider as never,
          options: {
            redirectTo: callback.toString(),
          },
        });

        if (error) {
          throw error;
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "로그인을 시작하지 못했어요.",
        );
      } finally {
        setPendingProvider(null);
      }
    });
  };

  return (
    <div className="space-y-3">
      {providers.map((providerId) => {
        const provider = AUTH_PROVIDER_META[providerId];

        return (
          <button
            key={providerId}
            className={`flex min-h-[52px] w-full items-center justify-center rounded-[12px] px-4 py-4 text-base font-semibold transition hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-60 ${provider.className}`}
            disabled={isPending}
            onClick={() => handleSignIn(providerId)}
            type="button"
          >
            <span
              aria-hidden="true"
              className="mr-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-xs font-bold uppercase"
            >
              {providerId.slice(0, 1)}
            </span>
            {pendingProvider === providerId ? `${provider.label} 로그인 중...` : provider.label}
          </button>
        );
      })}
      {providers.length > 0 ? (
        <p className="text-xs leading-5 text-[var(--muted)]">
          현재 테스트 가능한 로그인:{" "}
          {providers
            .map((provider) => AUTH_PROVIDER_META[provider].label)
            .join(", ")}
        </p>
      ) : null}
      <LocalDevLoginPanel
        nextPath={nextPath}
        onStarted={onStarted}
        pendingAction={pendingAction}
      />
      {localDevAuthEnabled && localGoogleOAuthEnabled ? (
        <p className="text-xs leading-5 text-[var(--muted)]">
          local Supabase에서 Google OAuth와 로컬 테스트 계정을 함께 사용할 수 있어요.
          신규 유저 bootstrap/manual OAuth는 Google로, 데모 데이터와 소유권 확인은 로컬
          테스트 계정을 사용하세요.
        </p>
      ) : null}
      {localDevAuthEnabled && !localGoogleOAuthEnabled ? (
        <p className="text-xs leading-5 text-[var(--muted)]">
          local Supabase에서 Google OAuth도 쓰려면
          `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`와
          `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET`을 `.env.local` 또는 현재 셸에
          넣은 뒤 `pnpm dev:demo`를 다시 시작하세요.
        </p>
      ) : null}
      {errorMessage ? (
        <p className="rounded-[12px] border border-[color:rgba(255,108,60,0.2)] bg-[color:rgba(255,108,60,0.08)] px-4 py-3 text-sm text-[var(--brand-deep)]">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
