import React from "react";

interface ContentStateProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  children?: React.ReactNode;
  tone?: "default" | "error" | "empty" | "gate" | "loading";
  variant?: "panel" | "subtle";
  className?: string;
  safeBottomPadding?: boolean;
}

export function ContentState({
  title,
  description,
  eyebrow,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  children,
  tone = "default",
  variant = "panel",
  className,
  safeBottomPadding = false,
}: ContentStateProps) {
  const shellClassName =
    (actionLabel && onAction) || safeBottomPadding
      ? "action-safe-bottom-panel"
      : "";
  const toneMeta = {
    default: {
      eyebrow: eyebrow ?? "안내",
      eyebrowClassName: "border-[var(--line-strong)] bg-[var(--surface-fill)] text-[var(--text-2)]",
      titleClassName: "text-[var(--foreground)]",
    },
    error: {
      eyebrow: eyebrow ?? "문제가 생겼어요",
      eyebrowClassName: "border-[var(--danger-soft)] bg-[var(--danger-soft)] text-[var(--danger-strong)]",
      titleClassName: "text-[var(--foreground)]",
    },
    empty: {
      eyebrow: eyebrow ?? "비어 있어요",
      eyebrowClassName: "border-[var(--brand-soft)] bg-[var(--brand-soft)] text-[var(--brand)]",
      titleClassName: "text-[var(--foreground)]",
    },
    gate: {
      eyebrow: eyebrow ?? "보호된 화면",
      eyebrowClassName: "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text-2)]",
      titleClassName: "text-[var(--foreground)]",
    },
    loading: {
      eyebrow: eyebrow ?? "불러오는 중",
      eyebrowClassName: "border-[var(--line-strong)] bg-[var(--surface-subtle)] text-[var(--text-3)]",
      titleClassName: "text-[var(--foreground)]",
    },
  }[tone];
  const variantClassName =
    variant === "panel"
      ? "rounded-[var(--radius-panel)] border border-[var(--line-strong)] bg-[var(--surface)] px-5 py-7 shadow-[0px_1px_3px_var(--shadow-color-subtle)] md:px-8 md:py-8"
      : "rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-fill)] px-5 py-6";

  return (
    <div
      className={`${variantClassName} text-center ${shellClassName} ${className ?? ""}`.trim()}
      data-state-kind="prototype-derived"
      data-state-tone={tone}
    >
      <div className="mx-auto max-w-[28rem]">
        <div
          className={`inline-flex rounded-[var(--radius-chip)] border px-3 py-1 text-[var(--app-text-caption)] font-semibold ${toneMeta.eyebrowClassName}`.trim()}
        >
          <span>{toneMeta.eyebrow}</span>
        </div>
        <h2
          className={`mt-3 text-[22px] font-bold leading-[1.3] ${toneMeta.titleClassName}`.trim()}
        >
          {title}
        </h2>
        {description ? (
          <p className="mt-2 text-[14px] font-medium leading-[1.5] text-[var(--text-2)]">
            {description}
          </p>
        ) : null}
        {children ? <div className="mt-5">{children}</div> : null}
        {actionLabel && onAction ? (
          <div className="mt-5 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            <button
              className="flex min-h-[var(--control-height-md)] items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand)] px-5 py-3 text-[14px] font-bold text-[var(--text-inverse)]"
              onClick={onAction}
              type="button"
            >
              {actionLabel}
            </button>
            {secondaryActionLabel && onSecondaryAction ? (
              <button
                className="flex min-h-[var(--control-height-md)] items-center justify-center rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-5 py-3 text-[14px] font-bold text-[var(--text-2)]"
                onClick={onSecondaryAction}
                type="button"
              >
                {secondaryActionLabel}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
