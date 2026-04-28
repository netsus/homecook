"use client";

import React from "react";

interface SelectionChip {
  value: string;
  /** Single-line pill mode (e.g. category names). Renders rounded-full pill. */
  label?: string;
  /** Two-line chip mode — small label on top (e.g. weekday). Requires bottomLabel. */
  topLabel?: string;
  /** Two-line chip mode — larger label below (e.g. "4/17"). Requires topLabel. */
  bottomLabel?: string;
}

interface SelectionChipRailProps {
  chips: SelectionChip[];
  selectedValue: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

/**
 * Horizontal scrollable chip rail with scrollbar-hide.
 * D1: olive fill/tint when selected.
 * Two render modes:
 *  - pill (label only): rounded-full, single line — for category filters
 *  - two-line (topLabel + bottomLabel): rounded-[14px] — for date chips (D4)
 */
export function SelectionChipRail({
  chips,
  selectedValue,
  onSelect,
  disabled,
  ariaLabel,
}: SelectionChipRailProps) {
  return (
    <div
      aria-label={ariaLabel}
      className="-mx-1 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide"
      role="group"
    >
      {chips.map(({ value, label, topLabel, bottomLabel }) => {
        const isSelected = value === selectedValue;
        const isPill = label !== undefined;

        if (isPill) {
          return (
            <button
              aria-pressed={isSelected}
              className={[
                "min-h-11 shrink-0 rounded-[var(--radius-full)] border px-4 py-2 text-sm font-semibold transition-colors",
                isSelected
                  ? "border-[var(--olive)] bg-[color-mix(in_srgb,var(--olive)_12%,transparent)] text-[var(--olive)]"
                  : "border-[var(--line)] bg-[var(--surface)] text-[var(--text-2)] hover:border-[var(--olive)] hover:text-[var(--olive)]",
                disabled ? "opacity-60" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={disabled}
              key={value}
              onClick={() => onSelect(value)}
              type="button"
            >
              {label}
            </button>
          );
        }

        return (
          <button
            aria-pressed={isSelected}
            className={[
              "shrink-0 rounded-[var(--radius-full)] border px-3 py-2 text-[13px] transition-colors",
              isSelected
                ? "border-[var(--foreground)] bg-[var(--foreground)] font-bold text-white"
                : "border-[var(--line)] bg-white font-medium text-[var(--text-2)]",
              disabled ? "opacity-60" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={disabled}
            key={value}
            onClick={() => onSelect(value)}
            type="button"
          >
            {topLabel} {bottomLabel}
          </button>
        );
      })}
    </div>
  );
}
