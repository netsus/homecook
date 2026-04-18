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

/** Compact −/value/+ stepper row in a frosted pill container. */
export function NumericStepperCompact({
  value,
  min = 1,
  onChange,
  disabled,
  unit,
}: NumericStepperCompactProps) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] bg-white/60 px-4 py-3">
      <button
        aria-label={`${unit ?? "값"} 줄이기`}
        className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-[var(--line)] bg-white text-lg font-medium disabled:opacity-40"
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        type="button"
      >
        −
      </button>
      <span
        aria-label={unit ? `${value}${unit}` : String(value)}
        aria-live="polite"
        className="min-w-16 text-center"
      >
        <span className="text-lg font-semibold">{value}</span>
        {unit ? (
          <span className="ml-0.5 text-sm text-[var(--muted)]">{unit}</span>
        ) : null}
      </span>
      <button
        aria-label={`${unit ?? "값"} 늘리기`}
        className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-[var(--line)] bg-white text-lg font-medium disabled:opacity-40"
        disabled={disabled}
        onClick={() => onChange(value + 1)}
        type="button"
      >
        +
      </button>
    </div>
  );
}
