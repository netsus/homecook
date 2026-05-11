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
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
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

    function updatePlacement() {
      const triggerBounds = triggerRef.current?.getBoundingClientRect();
      if (!triggerBounds) return;

      const listHeight = listRef.current?.offsetHeight ?? options.length * 44;
      const spaceBelow = window.innerHeight - triggerBounds.bottom;
      const spaceAbove = triggerBounds.top;

      setPlacement(
        spaceBelow < listHeight + 8 && spaceAbove > spaceBelow
          ? "top"
          : "bottom",
      );
    }

    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);

    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [open, options.length]);

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
          "inline-flex min-h-[44px] items-center gap-1 whitespace-nowrap rounded-none border-0 bg-transparent px-0 py-1 text-[13px] font-semibold text-[#495057] transition-colors",
          open ? "text-[#212529]" : "hover:text-[#212529]",
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
          className={`h-3 w-3 text-[#868E96] transition-transform ${open ? "rotate-180" : ""}`}
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
          className={[
            "absolute right-0 z-40 min-w-[140px] overflow-hidden rounded-[10px] border border-[#DEE2E6] bg-white shadow-[0px_4px_12px_rgba(0,0,0,0.10)]",
            placement === "top" ? "bottom-full mb-1" : "top-full mt-1",
          ].join(" ")}
          ref={listRef}
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
                    ? "bg-[#F1F3F5] font-bold text-[#212529]"
                    : "bg-white font-medium text-[#212529] hover:bg-[#F8F9FA]",
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
                    className="ml-2 h-4 w-4 shrink-0 text-[#2AC1BC]"
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
