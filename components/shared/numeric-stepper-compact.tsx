"use client";

import React from "react";

interface NumericStepperCompactProps {
  value: number;
  min?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** Unit label displayed small after the number, e.g. "인분" */
  unit?: string;
}

/** Compact −/value/+ stepper row. */
export function NumericStepperCompact({
  value,
  min = 1,
  onChange,
  disabled,
  unit,
}: NumericStepperCompactProps) {
  return (
    <div className="flex items-center justify-between rounded-[var(--radius-control)] border border-[var(--wave1-border)] bg-white px-3 py-2.5">
      <span className="text-sm text-[var(--wave1-text-2)]">
        {unit ? `몇 ${unit} 계획할까요?` : ""}
      </span>
      <div className="flex items-center gap-0.5">
        <button
          aria-label={`${unit ?? "값"} 줄이기`}
          className="flex h-[var(--control-height-md)] w-11 items-center justify-center disabled:opacity-40"
          disabled={disabled || value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          type="button"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--wave1-border)] bg-white text-sm font-medium text-[var(--wave1-ink)]">
            −
          </span>
        </button>
        <span
          aria-label={unit ? `${value}${unit}` : String(value)}
          aria-live="polite"
          className="w-9 text-center font-bold tabular-nums text-[var(--wave1-ink)]"
        >
          {value}
        </span>
        <button
          aria-label={`${unit ?? "값"} 늘리기`}
          className="flex h-[var(--control-height-md)] w-11 items-center justify-center disabled:opacity-40"
          disabled={disabled}
          onClick={() => onChange(value + 1)}
          type="button"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full border-none bg-[var(--wave1-ink)] text-sm font-bold text-white">
            +
          </span>
        </button>
      </div>
    </div>
  );
}
