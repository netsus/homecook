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
  showEyebrow?: boolean;
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
  showEyebrow = true,
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
      eyebrowClassName: "border-[var(--brand-border)] bg-[var(--brand-soft)] text-[var(--brand-contrast)]",
      titleClassName: "text-[var(--foreground)]",
    },
    loading: {
      eyebrow: eyebrow ?? "불러오는 중",
      eyebrowClassName: "border-[var(--line-strong)] bg-[var(--surface-subtle)] text-[var(--text-3)]",
      titleClassName: "text-[var(--foreground)]",
    },
  }[tone];
  const variantClassName =
    tone === "gate"
      ? "flex min-h-[min(520px,calc(100vh-176px))] items-center justify-center rounded-[var(--radius-panel)] border border-[var(--brand-border)] bg-[linear-gradient(180deg,var(--brand-alpha-08)_0%,var(--surface)_44%)] px-5 py-10 shadow-[0px_10px_28px_var(--brand-shadow-color)] md:min-h-[min(520px,calc(100vh-96px))] md:px-8 md:py-12"
      : variant === "panel"
        ? "rounded-[var(--radius-panel)] border border-[var(--line-strong)] bg-[var(--surface)] px-5 py-7 shadow-[0px_1px_3px_var(--shadow-color-subtle)] md:px-8 md:py-8"
        : "rounded-[var(--radius-card)] border border-[var(--line-strong)] bg-[var(--surface-fill)] px-5 py-6";

  return (
    <div
      className={`${variantClassName} text-center ${shellClassName} ${className ?? ""}`.trim()}
      data-state-kind="prototype-derived"
      data-state-tone={tone}
    >
      <div className="mx-auto max-w-[28rem]">
        {tone === "gate" ? (
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[20px] bg-[var(--brand-soft)] text-[var(--brand-contrast)] shadow-[0px_8px_22px_var(--brand-shadow-color)]">
            <LockIcon />
          </div>
        ) : null}
        {showEyebrow ? (
          <div
            className={`inline-flex rounded-[var(--radius-chip)] border px-3 py-1 text-[var(--app-text-caption)] font-semibold ${toneMeta.eyebrowClassName}`.trim()}
          >
            <span>{toneMeta.eyebrow}</span>
          </div>
        ) : null}
        <h2
          className={`${showEyebrow ? "mt-3" : ""} text-[22px] font-bold leading-[1.3] ${toneMeta.titleClassName}`.trim()}
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
              className="flex min-h-[var(--control-height-md)] items-center justify-center rounded-[var(--radius-control)] bg-[var(--brand-contrast)] px-5 py-3 text-[14px] font-bold text-[var(--text-inverse)]"
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

function LockIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-7 w-7"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <rect height="11" rx="2" width="18" x="3" y="11" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
