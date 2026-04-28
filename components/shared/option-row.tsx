"use client";

import React from "react";

interface OptionRowProps {
  label: string;
  isSelected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

/** Single option row for sort/column list. Prototype: ink text + checkmark when selected. */
export function OptionRow({ label, isSelected, onClick, disabled }: OptionRowProps) {
  return (
    <button
      aria-selected={isSelected}
      className={`flex min-h-14 w-full items-center rounded-[16px] px-4 py-3.5 text-left transition-colors ${
        isSelected
          ? "bg-[var(--surface)] text-[var(--foreground)] font-bold"
          : "bg-[var(--surface)] text-[var(--foreground)] font-medium"
      } border border-[var(--line)]`}
      disabled={disabled}
      onClick={onClick}
      role="option"
      type="button"
    >
      <span className="flex-1 text-[15px]">{label}</span>
      {isSelected ? (
        <svg
          className="shrink-0 text-[var(--olive)]"
          fill="none"
          height="18"
          viewBox="0 0 18 18"
          width="18"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3.5 9.5L7 13L14.5 5.5"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
      ) : null}
    </button>
  );
}
