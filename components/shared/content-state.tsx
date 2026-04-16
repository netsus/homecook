import React from "react";

interface ContentStateProps {
  title: string;
  description: string;
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
      eyebrowClassName:
        "border-[color:rgba(46,166,122,0.18)] bg-[color:rgba(46,166,122,0.1)] text-[var(--olive)]",
      titleClassName: "text-[var(--foreground)]",
    },
    error: {
      eyebrow: eyebrow ?? "문제가 생겼어요",
      eyebrowClassName:
        "border-[color:rgba(255,108,60,0.18)] bg-[color:rgba(255,108,60,0.1)] text-[var(--brand-deep)]",
      titleClassName: "text-[var(--foreground)]",
    },
    empty: {
      eyebrow: eyebrow ?? "비어 있어요",
      eyebrowClassName:
        "border-[color:rgba(46,166,122,0.18)] bg-[color:rgba(46,166,122,0.1)] text-[var(--olive)]",
      titleClassName: "text-[var(--foreground)]",
    },
    gate: {
      eyebrow: eyebrow ?? "보호된 화면",
      eyebrowClassName:
        "border-[color:rgba(30,30,30,0.08)] bg-[color:rgba(30,30,30,0.06)] text-[var(--foreground)]",
      titleClassName: "text-[var(--foreground)]",
    },
    loading: {
      eyebrow: eyebrow ?? "불러오는 중",
      eyebrowClassName:
        "border-[color:rgba(30,30,30,0.08)] bg-[color:rgba(30,30,30,0.06)] text-[var(--muted)]",
      titleClassName: "text-[var(--foreground)]",
    },
  }[tone];
  const variantClassName =
    variant === "panel"
      ? "glass-panel rounded-[28px] px-5 py-7 md:px-8 md:py-8"
      : "rounded-[20px] border border-[var(--line)] bg-white/72 px-5 py-6";

  return (
    <div
      className={`${variantClassName} text-center ${shellClassName} ${className ?? ""}`.trim()}
    >
      <div className="mx-auto max-w-[28rem]">
        <div
          className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.06em] ${toneMeta.eyebrowClassName}`.trim()}
        >
          <span>{toneMeta.eyebrow}</span>
        </div>
        <h2
          className={`mt-3 text-[1.45rem] font-extrabold tracking-[-0.03em] ${toneMeta.titleClassName} md:text-[1.65rem]`.trim()}
        >
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)] md:text-[15px]">
          {description}
        </p>
        {children ? <div className="mt-5">{children}</div> : null}
        {actionLabel && onAction ? (
          <div className="mt-5 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            <button
              className="flex min-h-11 items-center justify-center rounded-full bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-[var(--foreground)]"
              onClick={onAction}
              type="button"
            >
              {actionLabel}
            </button>
            {secondaryActionLabel && onSecondaryAction ? (
              <button
                className="flex min-h-11 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--muted)]"
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
