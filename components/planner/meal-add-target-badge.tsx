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
        <CalendarGlyph />
        {label}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] bg-[var(--brand-soft)] px-3 py-1.5 text-[13px] font-bold text-[var(--brand)] ${className ?? ""}`.trim()}
      data-testid={testId}
    >
      <CalendarGlyph />
      {label}
    </span>
  );
}

function CalendarGlyph() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
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
