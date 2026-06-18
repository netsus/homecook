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
  const enabledProviders = getEnabledAuthProviders();
  const providers = localDevAuthEnabled && !localGoogleOAuthEnabled
    ? []
    : (qaFixtureMode
        ? ensureFixtureProviders(enabledProviders)
        : enabledProviders
      );

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
              className="mr-3 inline-flex h-5 w-5 items-center justify-center text-[15px] font-extrabold uppercase"
            >
              {providerId === "google" ? (
                <GoogleLogoIcon />
              ) : (
                providerId.slice(0, 1)
              )}
            </span>
            {pendingProvider === providerId ? `${provider.label} 로그인 중...` : provider.label}
          </button>
        );
      })}
      {providers.length > 0 && !qaFixtureMode ? (
        <p className="text-xs leading-5 text-[var(--muted)]">
          현재 지원 로그인:{" "}
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
        <p className="rounded-[var(--radius-card)] border border-[color:var(--danger-border)] bg-[color:var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
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
    return "border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--foreground)]";
  }

  if (providerId === "naver") {
    return "border border-[var(--social-naver)] bg-[var(--social-naver)] text-[var(--text-inverse)]";
  }

  return fallbackClassName;
}

function GoogleLogoIcon() {
  return (
    <svg
      aria-hidden="true"
      data-testid="google-provider-logo"
      height="20"
      viewBox="0 0 20 20"
      width="20"
    >
      <path
        d="M19.6 10.23c0-.7-.06-1.37-.18-2.02H10v3.82h5.38a4.6 4.6 0 0 1-2 3.02v2.47h3.24c1.89-1.72 2.98-4.25 2.98-7.29Z"
        fill="var(--google-brand-blue)"
      />
      <path
        d="M10 20c2.7 0 4.97-.88 6.62-2.39l-3.24-2.47c-.9.59-2.04.94-3.38.94-2.6 0-4.8-1.72-5.59-4.04H1.07v2.55A10 10 0 0 0 10 20Z"
        fill="var(--google-brand-green)"
      />
      <path
        d="M4.41 12.04a5.9 5.9 0 0 1 0-3.78V5.71H1.07a9.83 9.83 0 0 0 0 8.88l3.34-2.55Z"
        fill="var(--google-brand-yellow)"
      />
      <path
        d="M10 3.96c1.47 0 2.8.5 3.84 1.46l2.86-2.81A9.76 9.76 0 0 0 10 0a10 10 0 0 0-8.93 5.71l3.34 2.55C5.2 5.94 7.4 3.96 10 3.96Z"
        fill="var(--google-brand-red)"
      />
    </svg>
  );
}
