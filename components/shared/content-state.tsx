interface ContentStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function ContentState({
  title,
  description,
  actionLabel,
  onAction,
}: ContentStateProps) {
  return (
    <div className="glass-panel rounded-[28px] px-5 py-8 text-center md:px-8">
      <p className="display text-2xl text-[var(--brand-deep)]">{title}</p>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
        {description}
      </p>
      {actionLabel && onAction ? (
        <button
          className="mt-5 rounded-full bg-[var(--brand)] px-5 py-3 text-sm font-semibold text-white"
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
