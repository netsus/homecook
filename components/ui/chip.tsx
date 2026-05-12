"use client";

import React from "react";

type ChipVariant = "filter" | "selection";
type ChipSize = "compact" | "default";

interface ChipProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  label: string;
  variant?: ChipVariant;
  size?: ChipSize;
  active?: boolean;
}

export function Chip({
  label,
  variant = "filter",
  size = "default",
  active = false,
  disabled,
  className,
  ...rest
}: ChipProps) {
  const isFilter = variant === "filter";

  const sizeClass =
    size === "compact" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-[13px]";

  let stateClass: string;
  if (disabled) {
    stateClass = "bg-[var(--wave1-surface-subtle)] text-[var(--wave1-text-4)] cursor-not-allowed";
  } else if (active && isFilter) {
    stateClass =
      "bg-[var(--wave1-ink)] text-[var(--wave1-surface)] font-bold";
  } else if (active && !isFilter) {
    stateClass =
      "bg-[var(--wave1-mint-contrast)] text-[var(--wave1-surface)] font-bold";
  } else {
    stateClass =
      "bg-[var(--wave1-surface-subtle)] text-[var(--wave1-text-2)] font-medium hover:bg-[var(--wave1-surface-fill)] hover:text-[var(--wave1-ink)]";
  }

  return (
    <button
      aria-pressed={active}
      className={[
        "inline-flex min-h-[44px] shrink-0 items-center rounded-[var(--radius-full)] transition-colors",
        sizeClass,
        stateClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      type="button"
      {...rest}
    >
      {label}
    </button>
  );
}
