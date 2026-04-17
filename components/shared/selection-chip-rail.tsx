"use client";

import React from "react";

interface SelectionChip {
  value: string;
  /** Small label on top (e.g. weekday) */
  topLabel: string;
  /** Larger label below (e.g. "4/17") */
  bottomLabel: string;
}

interface SelectionChipRailProps {
  chips: SelectionChip[];
  selectedValue: string;
  onSelect: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

/** Horizontal scrollable two-line chip rail. D1: olive fill when selected. D4: M/D date format. */
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
      {chips.map(({ value, topLabel, bottomLabel }) => {
        const isSelected = value === selectedValue;

        return (
          <button
            aria-pressed={isSelected}
            className={[
              "flex min-w-[52px] flex-col items-center rounded-[14px] px-2.5 py-2.5 text-center transition-colors",
              isSelected
                ? "bg-[var(--olive)] text-white"
                : "bg-white/60 text-[var(--foreground)] hover:bg-white/80",
              disabled ? "opacity-60" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={disabled}
            key={value}
            onClick={() => onSelect(value)}
            type="button"
          >
            <span className="text-[10px] font-medium leading-tight">{topLabel}</span>
            <span className="mt-0.5 text-xs font-semibold leading-tight">{bottomLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
