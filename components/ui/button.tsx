"use client";

import React from "react";

type ButtonVariant = "primary" | "secondary" | "neutral" | "destructive";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, { base: string; hover: string; active: string; disabled: string }> = {
  primary: {
    base: "bg-[var(--brand)] text-[var(--surface)]",
    hover: "hover:bg-[var(--brand-deep)] hover:shadow-[var(--shadow-2)]",
    active: "active:bg-[var(--brand-deep)] active:shadow-[inset_0_1px_0_color-mix(in_srgb,var(--foreground)_6%,transparent)]",
    disabled: "bg-[var(--line)] text-[var(--text-4)]",
  },
  secondary: {
    base: "bg-transparent text-[var(--brand)] border border-[var(--brand)]",
    hover: "hover:bg-[var(--brand-soft)] hover:text-[var(--brand-deep)] hover:border-[var(--brand-deep)]",
    active: "active:bg-[var(--brand-soft)]",
    disabled: "border-[var(--line)] text-[var(--text-4)] bg-transparent",
  },
  neutral: {
    base: "bg-[var(--surface-fill)] text-[var(--foreground)]",
    hover: "hover:bg-[var(--surface-subtle)]",
    active: "active:bg-[var(--surface-subtle)]",
    disabled: "bg-[var(--surface-fill)] text-[var(--text-4)]",
  },
  destructive: {
    base: "bg-[color-mix(in_srgb,var(--brand),var(--surface)_10%)] text-[var(--surface)]",
    hover: "hover:bg-[color-mix(in_srgb,var(--brand-deep),var(--foreground)_20%)] hover:shadow-[var(--shadow-2)]",
    active: "active:bg-[color-mix(in_srgb,var(--brand-deep),var(--foreground)_20%)]",
    disabled: "bg-[var(--line)] text-[var(--text-4)]",
  },
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-[13px]",
  md: "h-12 px-5 text-base",
  lg: "h-14 px-6 text-[17px]",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const v = variantStyles[variant];

  return (
    <button
      className={[
        "relative inline-flex items-center justify-center rounded-[var(--radius-sm)] font-bold transition-colors",
        sizeStyles[size],
        fullWidth ? "w-full" : "",
        isDisabled ? v.disabled : [v.base, v.hover, v.active].join(" "),
        isDisabled ? "cursor-not-allowed" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={isDisabled}
      type="button"
      {...rest}
    >
      <span className={loading ? "invisible" : ""}>{children}</span>
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <svg
            className="h-4 w-4 animate-spin text-current"
            fill="none"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              fill="currentColor"
            />
          </svg>
        </span>
      ) : null}
    </button>
  );
}
