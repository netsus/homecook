// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MealPinnedNutrition } from "@/components/planner/meal-pinned-nutrition";

const nutrition = {
  plannedServings: 2,
  values: {
    energy_kcal: { amount: 487, known_amount: null, status: "complete", display_mode: "total" },
    protein_g: { amount: null, known_amount: 39, status: "partial", display_mode: "minimum" },
  },
} as const;

describe("planned recipe pinned nutrition presentation", () => {
  afterEach(cleanup);
  it("shows the pinned selected-servings values without current-recipe substitution", () => {
    render(<MealPinnedNutrition nutrition={nutrition} servings={2} title="제육볶음" />);
    expect(screen.getByText("487 kcal")).toBeTruthy();
    expect(screen.getByText("최소 39 g")).toBeTruthy();
    expect(screen.getByText(/등록한 계획 기준/)).toBeTruthy();
  });
  it("does not show values from an earlier serving quantity", () => {
    render(<MealPinnedNutrition nutrition={nutrition} servings={3} title="제육볶음" />);
    expect(screen.queryByText("487 kcal")).toBeNull();
    expect(screen.getByText(/영양 정보를 다시 확인/)).toBeTruthy();
  });
  it("distinguishes missing nutrition from refreshing a changed serving amount", () => {
    render(<MealPinnedNutrition servings={2} title="제육볶음" />);
    expect(screen.getByText("영양 정보 준비 중")).toBeTruthy();
    expect(screen.queryByText(/다시 확인/)).toBeNull();
  });
});
