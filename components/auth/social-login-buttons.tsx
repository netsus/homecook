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
import { isQaFixtureClientModeEnabled } from "@/lib/mock/qa-fixture-client";
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
  const qaFixtureMode = isQaFixtureClientModeEnabled();
  const HIDDEN_PROVIDERS: AuthProviderId[] = ["kakao"];
  const enabledProviders = getEnabledAuthProviders();
  const providers = localDevAuthEnabled && !localGoogleOAuthEnabled
    ? []
    : (qaFixtureMode
        ? ensureFixtureProviders(enabledProviders)
        : enabledProviders
      ).filter((id) => !HIDDEN_PROVIDERS.includes(id));

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
            className={`flex min-h-[48px] w-full items-center justify-center rounded-[var(--radius-control)] px-4 py-3.5 text-[15px] font-bold transition hover:brightness-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${getProviderButtonClass(providerId, provider.className)}`}
            disabled={isPending}
            onClick={() => handleSignIn(providerId)}
            type="button"
          >
            <span
              aria-hidden="true"
              className="mr-3 inline-flex h-5 w-5 items-center justify-center text-[15px] font-black uppercase"
            >
              {providerId.slice(0, 1)}
            </span>
            {pendingProvider === providerId ? `${provider.label} 로그인 중...` : provider.label}
          </button>
        );
      })}
      {providers.length > 1 && !qaFixtureMode ? (
        <p className="text-xs leading-5 text-[var(--muted)]">
          현재 테스트 가능한 로그인:{" "}
          {providers
            .map((provider) => AUTH_PROVIDER_META[provider].label)
            .join(", ")}
        </p>
      ) : null}
      {!qaFixtureMode ? (
        <LocalDevLoginPanel
          nextPath={nextPath}
          onStarted={onStarted}
          pendingAction={pendingAction}
        />
      ) : null}
      {localDevAuthEnabled && localGoogleOAuthEnabled && !qaFixtureMode ? (
        <p className="text-xs leading-5 text-[var(--muted)]">
          local Supabase에서 Google OAuth와 로컬 테스트 계정을 함께 사용할 수 있어요.
          신규 유저 bootstrap/manual OAuth는 Google로, 데모 데이터와 소유권 확인은 로컬
          테스트 계정을 사용하세요.
        </p>
      ) : null}
      {localDevAuthEnabled && !localGoogleOAuthEnabled && !qaFixtureMode ? (
        <p className="text-xs leading-5 text-[var(--muted)]">
          local Supabase에서 Google OAuth도 쓰려면
          `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`와
          `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET`을 `.env.local` 또는 현재 셸에
          넣은 뒤 `pnpm dev:demo`를 다시 시작하세요.
        </p>
      ) : null}
      {errorMessage ? (
        <p className="rounded-[var(--radius-card)] border border-[color:rgba(255,107,107,0.2)] bg-[color:rgba(255,107,107,0.08)] px-4 py-3 text-sm text-[var(--danger)]">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}

function ensureFixtureProviders(providers: AuthProviderId[]) {
  const fixtureProviders: AuthProviderId[] = ["google", "naver"];
  return [
    ...providers,
    ...fixtureProviders.filter((provider) => !providers.includes(provider)),
  ];
}

function getProviderButtonClass(
  providerId: AuthProviderId,
  fallbackClassName: string,
) {
  if (providerId === "google") {
    return "border border-[#DEE2E6] bg-white text-[#212529]";
  }

  if (providerId === "naver") {
    return "border border-[#03C75A] bg-[#03C75A] text-white";
  }

  return fallbackClassName;
}
