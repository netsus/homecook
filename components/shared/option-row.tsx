"use client";

import React from "react";

interface OptionRowProps {
  label: string;
  isSelected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

/** Single option row for sort/column list. D1: olive tint when selected. */
export function OptionRow({ label, isSelected, onClick, disabled }: OptionRowProps) {
  return (
    <button
      aria-selected={isSelected}
      className={`flex min-h-14 w-full items-center rounded-[16px] px-4 py-3 text-left text-sm font-semibold transition-colors ${
        isSelected
          ? "bg-[color:rgba(46,166,122,0.12)] text-[var(--olive)]"
          : "border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]"
      }`}
      disabled={disabled}
      onClick={onClick}
      role="option"
      type="button"
    >
      {label}
    </button>
  );
}
