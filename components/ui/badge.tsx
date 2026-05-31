"use client";

import React from "react";

type BadgeVariant = "brand" | "danger" | "olive" | "muted";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: React.ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  brand: "bg-[var(--wave1-mint-soft)] text-[var(--wave1-mint-contrast)]",
  danger: "bg-[var(--danger-soft)] text-[var(--wave1-red-contrast)]",
  olive: "bg-[var(--brand-soft)] text-[var(--wave1-teal-contrast)]",
  muted: "bg-[var(--wave1-surface-fill)] text-[var(--wave1-text-2)]",
};

export function Badge({
  variant = "brand",
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-[var(--radius-badge)] px-2 py-0.5 text-[var(--app-text-caption)] font-semibold leading-tight",
        variantStyles[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </span>
  );
}
