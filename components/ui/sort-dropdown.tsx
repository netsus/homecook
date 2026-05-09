"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

interface SortOption {
  value: string;
  label: string;
}

interface SortDropdownProps {
  options: SortOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function SortDropdown({
  options,
  value,
  onChange,
  label = "정렬",
  disabled = false,
  className,
}: SortDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  const handleSelect = useCallback(
    (optionValue: string) => {
      onChange(optionValue);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div
      className={`relative inline-block ${className ?? ""}`.trim()}
      onKeyDown={handleKeyDown}
      ref={containerRef}
    >
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${label}: ${selectedOption?.label ?? ""}`}
        className={[
          "inline-flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-full)] border px-4 py-2 text-sm font-semibold transition-colors",
          open
            ? "border-[var(--olive)] bg-[color-mix(in_srgb,var(--olive)_8%,transparent)] text-[var(--olive)]"
            : "border-[var(--line)] bg-[var(--surface)] text-[var(--text-2)] hover:border-[var(--olive)] hover:text-[var(--olive)]",
          disabled ? "cursor-not-allowed opacity-60" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        ref={triggerRef}
        type="button"
      >
        <span>{selectedOption?.label ?? label}</span>
        <svg
          aria-hidden="true"
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M19 9l-7 7-7-7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open ? (
        <ul
          aria-label={`${label} 옵션`}
          className="absolute left-0 z-40 mt-1 min-w-[160px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-2)]"
          role="listbox"
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <li
                aria-selected={isSelected}
                className={[
                  "flex min-h-[44px] w-full cursor-pointer items-center whitespace-nowrap px-4 py-2.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--olive)] focus:ring-inset",
                  isSelected
                    ? "font-bold text-[var(--olive)]"
                    : "font-medium text-[var(--foreground)] hover:bg-[var(--surface-fill)]",
                ].join(" ")}
                key={option.value}
                onClick={() => handleSelect(option.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    handleSelect(option.value);
                  }
                }}
                role="option"
                tabIndex={0}
              >
                <span className="flex-1 text-left">{option.label}</span>
                {isSelected ? (
                  <svg
                    aria-hidden="true"
                    className="ml-2 h-4 w-4 shrink-0 text-[var(--olive)]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M5 13l4 4L19 7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
