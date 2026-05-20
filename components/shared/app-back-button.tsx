"use client";

import React from "react";

interface AppBackButtonProps {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  testId?: string;
}

export function AppBackButton({
  ariaLabel = "뒤로",
  className,
  disabled,
  onClick,
  testId,
}: AppBackButtonProps) {
  return (
    <button
      aria-label={ariaLabel}
      className={[
        "flex h-[var(--control-height-md)] w-11 shrink-0 items-center justify-center rounded-full text-[28px] leading-none text-[#212529] transition-colors hover:bg-[#F1F3F5] disabled:opacity-40",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span aria-hidden="true">‹</span>
    </button>
  );
}

export function AppBackButtonSpacer({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={[
        "h-[var(--control-height-md)] w-11 shrink-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
