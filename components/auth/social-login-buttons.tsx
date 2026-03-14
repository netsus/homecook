"use client";

import React from "react";
import { useState, useTransition } from "react";

import {
  AUTH_PROVIDER_META,
  getEnabledAuthProviders,
  type AuthProviderId,
} from "@/lib/auth/providers";
import {
  type PendingRecipeAction,
  savePendingAction,
} from "@/lib/auth/pending-action";
import { hasSupabasePublicEnv } from "@/lib/supabase/env";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

interface SocialLoginButtonsProps {
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
  const providers = getEnabledAuthProviders();

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
            className={`flex w-full items-center justify-center rounded-[18px] px-4 py-4 text-sm font-semibold transition hover:translate-y-[-1px] ${provider.className}`}
            disabled={isPending}
            onClick={() => handleSignIn(providerId)}
            type="button"
          >
            {pendingProvider === providerId ? "이동 중..." : provider.label}
          </button>
        );
      })}
      <p className="text-xs text-[var(--muted)]">
        현재 테스트 가능한 로그인:{" "}
        {providers
          .map((provider) => AUTH_PROVIDER_META[provider].label)
          .join(", ")}
      </p>
      {errorMessage ? (
        <p className="text-sm text-red-600">{errorMessage}</p>
      ) : null}
    </div>
  );
}
