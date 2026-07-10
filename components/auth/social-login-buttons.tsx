"use client";

import React from "react";
import { useEffect, useRef, useState, useTransition } from "react";

import { LocalDevLoginPanel } from "@/components/auth/local-dev-login-panel";
import { createAuthProviderAttemptCookie } from "@/lib/auth/provider-cookies";
import {
  AUTH_PROVIDER_META,
  getAuthProviderDisplayName,
  getEnabledAuthProviders,
  getSupabaseAuthProvider,
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
import { readLastAuthProvider } from "@/lib/auth/provider-memory";

export interface SocialLoginButtonsProps {
  attemptedProvider?: AuthProviderId | null;
  expectedProvider?: AuthProviderId | null;
  lastProvider?: AuthProviderId | null;
  nextPath: string;
  pendingAction?: PendingRecipeAction | null;
  onStarted?: () => void;
}

export function SocialLoginButtons({
  lastProvider = null,
  nextPath,
  pendingAction,
  onStarted,
}: SocialLoginButtonsProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingProvider, setPendingProvider] = useState<string | null>(null);
  const [recentProvider, setRecentProvider] = useState<AuthProviderId | null>(lastProvider);
  const [switchTarget, setSwitchTarget] = useState<AuthProviderId | null>(null);
  const selectedButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [isPending, startTransition] = useTransition();
  const localDevAuthEnabled = isLocalDevAuthEnabled();
  const localGoogleOAuthEnabled = isLocalGoogleOAuthEnabled();
  const qaFixtureMode = isQaFixtureClientModeEnabled();
  const enabledProviders = getEnabledAuthProviders();
  const availableProviders = localDevAuthEnabled && !localGoogleOAuthEnabled
    ? []
    : (qaFixtureMode
        ? ensureFixtureProviders(enabledProviders)
        : enabledProviders
      );
  const providers = availableProviders;

  useEffect(() => { setRecentProvider(readLastAuthProvider() ?? lastProvider); }, [lastProvider]);

  useEffect(() => {
    if (!switchTarget) return;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>("button:not([disabled])");
    focusable?.[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeDialog(); return; }
      if (event.key !== "Tab" || !focusable?.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [switchTarget]);

  function closeDialog() {
    setSwitchTarget(null);
    requestAnimationFrame(() => selectedButtonRef.current?.focus());
  }

  function requestSignIn(provider: AuthProviderId, button: HTMLButtonElement) {
    if (recentProvider && recentProvider !== provider) {
      selectedButtonRef.current = button;
      setSwitchTarget(provider);
      return;
    }
    handleSignIn(provider);
  }

  const handleSignIn = (provider: AuthProviderId) => {
    startTransition(async () => {
      try {
        setErrorMessage(null);
        setPendingProvider(provider);

        if (!hasSupabasePublicEnv()) {
          throw new Error(
            "Supabase 공개 환경변수를 읽지 못했어요. .env.local 작성 후 개발 서버를 다시 시작하세요.",
          );
        }

        if (pendingAction) {
          savePendingAction(pendingAction);
        }

        document.cookie = createPostAuthNextCookie(nextPath);
        document.cookie = createAuthProviderAttemptCookie(provider);

        onStarted?.();

        const supabase = getSupabaseBrowserClient();
        const callback = new URL("/auth/callback", window.location.origin);
        callback.searchParams.set("attemptedProvider", provider);
        const authProvider = getSupabaseAuthProvider(provider);

        const { error } = await supabase.auth.signInWithOAuth({
          provider: authProvider,
          options: {
            redirectTo: callback.toString(),
          },
        });

        if (error) {
          throw error;
        }
      } catch {
        setErrorMessage("로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
      } finally {
        setPendingProvider(null);
      }
    });
  };

  return (
    <div className="space-y-3">
      {providers.map((providerId) => {
        const provider = AUTH_PROVIDER_META[providerId];
        const highlighted = recentProvider === providerId;
        const label = provider.label;

        return (
          <button
            key={providerId}
            className={`grid min-h-[52px] w-full items-center gap-2 rounded-[var(--radius-control)] px-3 py-3.5 text-[15px] font-bold transition hover:brightness-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${highlighted ? "grid-cols-[20px_minmax(0,1fr)_auto]" : "grid-cols-[20px_minmax(0,1fr)_20px]"} ${getProviderButtonClass(providerId, provider.className)}`}
            data-recent-provider={highlighted ? "true" : undefined}
            disabled={isPending}
            onClick={(event) => requestSignIn(providerId, event.currentTarget)}
            type="button"
          >
            <span
              aria-hidden="true"
              className="inline-flex h-5 w-5 items-center justify-center text-[15px] font-extrabold uppercase"
            >
              <ProviderLogoIcon providerId={providerId} />
            </span>
            <span className="min-w-0 truncate text-center leading-5">
              {pendingProvider === providerId ? `${label} 로그인 중...` : label}
            </span>
            {highlighted ? (
              <span
                aria-hidden="true"
                className="whitespace-nowrap rounded-md bg-[var(--foreground)] px-2 py-1 text-[11px] font-extrabold leading-4 text-[var(--surface)]"
              >
                최근 로그인
              </span>
            ) : (
              <span aria-hidden="true" className="h-5 w-5" />
            )}
          </button>
        );
      })}
      {recentProvider ? (
        <p className="rounded-md bg-[var(--surface-fill)] px-3 py-2 text-left text-xs font-semibold leading-5 text-[var(--text-2)]">
          최근 이 브라우저에서 {getAuthProviderDisplayName(recentProvider)}로 로그인했어요.
        </p>
      ) : null}
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
      {switchTarget && recentProvider ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay-40)] p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
          <div aria-labelledby="provider-switch-title" aria-modal="true" className="w-full max-w-sm rounded-[var(--radius-card)] bg-[var(--surface)] p-5 text-left shadow-2xl" ref={dialogRef} role="dialog">
            <h2 className="text-lg font-extrabold" id="provider-switch-title">다른 로그인 방법으로 계속할까요?</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">이 브라우저에서는 최근 {getAuthProviderDisplayName(recentProvider)}를 사용했어요. 선택한 방법으로 다른 계정에 로그인할 수도 있어요.</p>
            <div className="mt-5 space-y-2">
              <button className="min-h-11 w-full rounded-[var(--radius-control)] bg-[var(--brand)] px-4 font-bold text-[var(--text-inverse)]" onClick={() => { setSwitchTarget(null); handleSignIn(recentProvider); }} type="button">{getAuthProviderDisplayName(recentProvider)}로 로그인</button>
              <button className="min-h-11 w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] px-4 font-bold" onClick={() => { const target = switchTarget; setSwitchTarget(null); handleSignIn(target); }} type="button">{getAuthProviderDisplayName(switchTarget)}의 다른 계정으로 계속</button>
              <button className="min-h-11 w-full px-4 font-semibold text-[var(--muted)]" onClick={closeDialog} type="button">취소</button>
            </div>
          </div>
        </div>
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

function ProviderLogoIcon({ providerId }: { providerId: AuthProviderId }) {
  if (providerId === "google") {
    return <GoogleLogoIcon />;
  }

  if (providerId === "kakao") {
    return <KakaoLogoIcon />;
  }

  return <NaverLogoIcon />;
}

function KakaoLogoIcon() {
  return (
    <svg
      aria-hidden="true"
      data-testid="kakao-provider-logo"
      height="20"
      viewBox="0 0 20 20"
      width="20"
    >
      <path
        d="M10 2.8c-4.37 0-7.92 2.75-7.92 6.13 0 2.12 1.4 3.99 3.53 5.09l-.78 2.86c-.07.27.23.49.46.33l3.42-2.27c.42.06.85.09 1.29.09 4.37 0 7.92-2.74 7.92-6.1C17.92 5.55 14.37 2.8 10 2.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

function NaverLogoIcon() {
  return (
    <svg
      aria-hidden="true"
      data-testid="naver-provider-logo"
      height="20"
      viewBox="0 0 20 20"
      width="20"
    >
      <path d="M3 3.2h5.1l3.8 5.5V3.2H17v13.6h-5.1L8.1 11.3v5.5H3V3.2Z" fill="currentColor" />
    </svg>
  );
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
