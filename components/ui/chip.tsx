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
    stateClass = "bg-[var(--surface-subtle)] text-[var(--text-4)] cursor-not-allowed";
  } else if (active && isFilter) {
    stateClass =
      "bg-[var(--foreground)] text-[var(--surface)] font-bold";
  } else if (active && !isFilter) {
    stateClass =
      "bg-[var(--brand)] text-[var(--surface)] font-bold";
  } else {
    stateClass =
      "bg-[var(--surface-subtle)] text-[var(--text-2)] font-medium hover:bg-[var(--surface-fill)] hover:text-[var(--foreground)]";
  }

  return (
    <button
      aria-pressed={active}
      className={[
        "inline-flex shrink-0 items-center rounded-[var(--radius-full)] transition-colors",
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
