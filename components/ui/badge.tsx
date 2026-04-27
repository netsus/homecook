"use client";

import React from "react";

type BadgeVariant = "brand" | "danger" | "olive" | "muted";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  children: React.ReactNode;
}

const variantStyles: Record<BadgeVariant, string> = {
  brand: "bg-[var(--brand-soft)] text-[var(--brand-deep)]",
  danger: "bg-[var(--brand-soft)] text-[color-mix(in_srgb,var(--brand-deep),var(--foreground)_20%)]",
  olive: "bg-[color-mix(in_srgb,var(--olive)_12%,transparent)] text-[var(--olive)]",
  muted: "bg-[var(--surface-fill)] text-[var(--text-3)]",
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
        "inline-flex items-center rounded-[var(--radius-full)] px-2 py-0.5 text-[11px] font-semibold leading-tight",
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
