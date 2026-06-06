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
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
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
      <span className="cook-mode-theme-toggle-knob" aria-hidden="true" />
      <span
        className={cn(
          "cook-mode-theme-toggle-label",
          !isDark && "cook-mode-theme-toggle-label-active",
        )}
      >
        라이트
      </span>
      <span
        className={cn(
          "cook-mode-theme-toggle-label",
          isDark && "cook-mode-theme-toggle-label-active",
        )}
      >
        다크
      </span>
    </button>
  );
}
