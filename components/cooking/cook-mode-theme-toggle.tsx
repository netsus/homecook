"use client";

import React from "react";

import { cn } from "@/components/web/utils";

export type CookModeColorTheme = "light" | "dark";

interface CookModeThemeToggleProps {
  theme: CookModeColorTheme;
  variant: "mobile" | "desktop";
  onToggle: () => void;
}

export function CookModeThemeToggle({
  theme,
  variant,
  onToggle,
}: CookModeThemeToggleProps) {
  const isDark = theme === "dark";

  return (
    <button
      aria-checked={isDark}
      aria-label="검은 배경"
      className={cn(
        "cook-mode-theme-toggle",
        variant === "mobile"
          ? "cook-mode-theme-toggle-mobile"
          : "web-cook-mode-theme-toggle",
        isDark
          ? "cook-mode-theme-toggle-dark"
          : "cook-mode-theme-toggle-light",
      )}
      data-testid="cook-mode-theme-toggle"
      onClick={onToggle}
      role="switch"
      type="button"
    >
      <span className="cook-mode-theme-toggle-knob" aria-hidden="true">
        {isDark ? <SunIcon /> : <MoonIcon />}
      </span>
      <span className="cook-mode-theme-toggle-label">
        {isDark ? "흰색" : "블랙"}
      </span>
    </button>
  );
}

function MoonIcon() {
  return (
    <svg fill="none" height="15" viewBox="0 0 24 24" width="15">
      <path
        d="M20 14.7A7.5 7.5 0 0 1 9.3 4a8.5 8.5 0 1 0 10.7 10.7Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg fill="none" height="15" viewBox="0 0 24 24" width="15">
      <path
        d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}
