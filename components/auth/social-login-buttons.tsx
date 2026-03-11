"use client";

import { useState, useTransition } from "react";

import {
  type PendingRecipeAction,
  savePendingAction,
} from "@/lib/auth/pending-action";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

const PROVIDERS = [
  {
    id: "kakao",
    label: "카카오로 시작하기",
    className: "bg-[#FEE500] text-[#181600]",
  },
  {
    id: "naver",
    label: "네이버로 시작하기",
    className: "bg-[#03C75A] text-white",
  },
  {
    id: "google",
    label: "Google로 시작하기",
    className: "border border-black/10 bg-white text-[#2c2c2c]",
  },
] as const;

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

  const handleSignIn = (provider: (typeof PROVIDERS)[number]["id"]) => {
    startTransition(async () => {
      try {
        setErrorMessage(null);
        setPendingProvider(provider);

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
      {PROVIDERS.map((provider) => (
        <button
          key={provider.id}
          className={`flex w-full items-center justify-center rounded-[18px] px-4 py-4 text-sm font-semibold transition hover:translate-y-[-1px] ${provider.className}`}
          disabled={isPending}
          onClick={() => handleSignIn(provider.id)}
          type="button"
        >
          {pendingProvider === provider.id ? "이동 중..." : provider.label}
        </button>
      ))}
      {errorMessage ? (
        <p className="text-sm text-red-600">{errorMessage}</p>
      ) : null}
    </div>
  );
}
