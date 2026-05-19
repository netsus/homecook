"use client";

import React from "react";

interface SelectionChip {
  value: string;
  /** Single-line chip mode (e.g. category names). */
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
 * Uses Wave1 fixed prototype tint/fill states when selected.
 * Two render modes:
 *  - chip (label only): rounded-[var(--radius-chip)], single line — for category filters
 *  - two-line (topLabel + bottomLabel): rounded-[var(--radius-card)] — for date chips (D4)
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
      className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-hide"
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
                "min-h-[var(--control-height-md)] shrink-0 rounded-[var(--radius-chip)] border px-4 py-2 text-sm font-semibold transition-colors",
                isSelected
                  ? "border-[var(--wave1-mint)] bg-[var(--wave1-mint-soft)] text-[var(--wave1-mint-contrast)]"
                  : "border-[var(--wave1-border)] bg-[var(--wave1-surface)] text-[var(--wave1-text-2)] hover:border-[var(--wave1-mint-contrast)] hover:text-[var(--wave1-mint-contrast)]",
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
              "min-h-[var(--control-height-md)] shrink-0 rounded-[var(--radius-card)] border px-3 py-2 text-[13px] transition-colors",
              isSelected
                ? "border-[var(--wave1-ink)] bg-[var(--wave1-ink)] font-bold text-white"
                : "border-[var(--wave1-border)] bg-white font-medium text-[var(--wave1-text-2)]",
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
