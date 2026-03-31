"use client";

import React from "react";
import dynamic from "next/dynamic";

import type { SocialLoginButtonsProps } from "@/components/auth/social-login-buttons";

function SocialLoginButtonsFallback() {
  return (
    <div aria-live="polite" className="space-y-3" role="status">
      <div className="min-h-[52px] animate-pulse rounded-[12px] border border-[var(--line)] bg-white/70" />
      <p className="text-xs leading-5 text-[var(--muted)]">
        로그인 옵션을 불러오는 중...
      </p>
    </div>
  );
}

const SocialLoginButtons = dynamic(
  () =>
    import("@/components/auth/social-login-buttons").then((module) => ({
      default: module.SocialLoginButtons,
    })),
  {
    ssr: false,
    loading: () => <SocialLoginButtonsFallback />,
  },
);

export function SocialLoginButtonsDeferred(props: SocialLoginButtonsProps) {
  return <SocialLoginButtons {...props} />;
}
