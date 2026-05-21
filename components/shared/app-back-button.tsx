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
        "flex h-[var(--app-back-button-size)] w-[var(--app-back-button-size)] shrink-0 items-center justify-center rounded-[var(--app-back-button-radius)] text-[var(--app-back-button-color)] transition-colors hover:bg-[var(--app-back-button-hover-bg)] disabled:opacity-40",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <svg
        aria-hidden="true"
        className="h-[var(--app-back-button-icon-size)] w-[var(--app-back-button-icon-size)]"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
    </button>
  );
}

export function AppBackButtonSpacer({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={[
        "h-[var(--app-back-button-size)] w-[var(--app-back-button-size)] shrink-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
