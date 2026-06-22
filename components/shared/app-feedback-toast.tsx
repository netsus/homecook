"use client";

import React from "react";

type AppFeedbackTone = "success" | "error";
type AppFeedbackPosition = "bottom" | "mobileTop" | "inline";

interface AppFeedbackToastProps {
  className?: string;
  message: string;
  position?: AppFeedbackPosition;
  testId?: string;
  tone: AppFeedbackTone;
}

function positionClass(position: AppFeedbackPosition) {
  if (position === "mobileTop") {
    return "pointer-events-none fixed left-1/2 top-[calc(var(--control-height-xl)+12px+env(safe-area-inset-top))] z-50 w-[calc(100vw-40px)] max-w-[360px] -translate-x-1/2";
  }

  if (position === "inline") {
    return "w-full";
  }

  return "fixed inset-x-4 bottom-8 z-50 mx-auto max-w-md";
}

function toneClass(tone: AppFeedbackTone) {
  if (tone === "error") {
    return "app-feedback-toast-error border-[var(--feedback-danger-border)] bg-[var(--feedback-danger-soft)] text-[var(--danger)] shadow-[var(--growth-toast-xp-shadow)]";
  }

  return "growth-toast-card-xp border-[var(--growth-toast-xp-border)] [background:var(--growth-toast-xp-bg)] text-[var(--foreground)] shadow-[var(--growth-toast-xp-shadow)]";
}

export function AppFeedbackToast({
  className,
  message,
  position = "bottom",
  testId = "app-feedback-toast",
  tone,
}: AppFeedbackToastProps) {
  return (
    <div
      className={[
        positionClass(position),
        "rounded-[var(--radius-card)] border px-4 py-3 text-center text-[13px] font-extrabold leading-[1.35]",
        toneClass(tone),
        className ?? "",
      ].join(" ")}
      data-feedback-tone={tone}
      data-testid={testId}
      role={tone === "error" ? "alert" : "status"}
    >
      {message}
    </div>
  );
}
