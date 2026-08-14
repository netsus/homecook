// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  formatMealAddTargetLabel,
  MealAddTargetBadge,
} from "@/components/planner/meal-add-target-badge";

describe("MealAddTargetBadge", () => {
  afterEach(() => {
    cleanup();
  });

  it("centers app target chip text and icon on a stable vertical axis", () => {
    render(<MealAddTargetBadge label="6/15 저녁" />);

    const badge = screen.getByTestId("meal-add-target-badge");
    const icon = badge.querySelector("svg");
    const label = badge.querySelector("[data-meal-add-target-label]");

    expect(badge.className).toContain("min-h-7");
    expect(badge.className).toContain("py-0");
    expect(badge.className).toContain("leading-none");
    expect(badge.className).toContain("whitespace-nowrap");
    expect(icon?.className.baseVal).toContain("block");
    expect(icon?.className.baseVal).toContain("shrink-0");
    expect(label?.className).toContain("leading-none");
    expect(badge.textContent).toContain("6/15 저녁");
  });

  it("keeps the planner slot identifier in routing while localizing its display label", () => {
    expect(formatMealAddTargetLabel("2026-08-21", "dinner")).toBe("8/21 저녁");
  });
});
