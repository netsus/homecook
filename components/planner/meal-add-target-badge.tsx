import React from "react";

export interface MealAddTargetBadgeProps {
  /** Pre-formatted target label, e.g. "6/1 아침". */
  label?: string;
  /** Visual surface the badge renders on. */
  tone?: "app" | "web";
  className?: string;
  testId?: string;
}

/** `YYYY-MM-DD` + slot -> meal-add target label used across planner entry surfaces. */
export function formatMealAddTargetLabel(planDate: string, slotName: string) {
  if (!planDate && !slotName) return "플래너";

  const [, m, d] = planDate.split("-").map(Number);
  const dateLabel = Number.isFinite(m) && Number.isFinite(d) ? `${m}/${d}` : "날짜 미지정";

  return slotName ? `${dateLabel} ${slotName}` : dateLabel;
}

/**
 * Single source of truth for how the target date·끼니 is shown across every
 * "식사 추가" option (search / recipebook / pantry / leftover / youtube / manual)
 * on both app and web. Keeps the format identical everywhere.
 */
export function MealAddTargetBadge({
  label,
  tone = "app",
  className,
  testId = "meal-add-target-badge",
}: MealAddTargetBadgeProps) {
  if (!label) return null;

  if (tone === "web") {
    return (
      <span className={`web-meal-add-target ${className ?? ""}`.trim()}>
        <CalendarGlyph className="block h-3.5 w-3.5 shrink-0" />
        <span>{label}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-chip)] bg-[var(--brand-soft)] px-3 py-0 text-[13px] font-bold leading-none text-[var(--brand)] ${className ?? ""}`.trim()}
      data-testid={testId}
    >
      <CalendarGlyph className="block h-3.5 w-3.5 shrink-0" />
      <span className="leading-none" data-meal-add-target-label>
        {label}
      </span>
    </span>
  );
}

function CalendarGlyph({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.2"
      viewBox="0 0 24 24"
    >
      <rect height="16" rx="2.5" width="18" x="3" y="5" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  );
}
