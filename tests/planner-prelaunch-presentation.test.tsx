// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlannerWeekBoard } from "@/components/planner/planner-week-board";
import type { PlannerMealData } from "@/types/planner";
import type { PlannerMealNutritionViewMap } from "@/types/planner-meal-nutrition";

const meal: PlannerMealData = {
  id: "meal-1",
  recipe_id: "recipe-1",
  recipe_title: "그릭요거트 볼",
  recipe_thumbnail_url: null,
  plan_date: "2026-09-06",
  column_id: "breakfast",
  planned_servings: 2,
  status: "registered",
  is_leftover: false,
};
const nutritionByMeal: PlannerMealNutritionViewMap = {
  "meal-1": {
    plannedServings: 2,
    totalWeightGrams: 500,
    values: {
      energy_kcal: { amount: 420, known_amount: 420, status: "complete", display_mode: "total" },
      protein_g: { amount: 22, known_amount: 22, status: "complete", display_mode: "total" },
      carbohydrate_g: { amount: 46, known_amount: 46, status: "complete", display_mode: "total" },
      fat_g: { amount: 14, known_amount: 14, status: "complete", display_mode: "total" },
    },
  },
};

function props() {
  return {
    dateKeys: ["2026-09-06"],
    columns: [{ id: "breakfast", name: "아침", sort_order: 0 }],
    meals: [meal],
    selectedDate: "2026-09-06",
    today: "2026-09-06",
    disabled: false,
    onAdd: vi.fn(),
    onDayRef: vi.fn(),
  };
}

afterEach(cleanup);

describe("planner prelaunch meal presentation", () => {
  it("keeps today identified independently from the date followed while scrolling", () => {
    render(<PlannerWeekBoard {...props()} dateKeys={["2026-09-05", "2026-09-06"]} selectedDate="2026-09-05" />);
    expect(screen.getByRole("heading", { name: /오늘.*9\/6/ }).getAttribute("aria-current")).toBe("date");
    expect(screen.getByRole("heading", { name: "9/5 (토)" }).getAttribute("aria-current")).toBeNull();
  });

  it.each(["registered", "shopping_done", "cook_done"] as const)(
    "keeps a single meal-detail action without redundant controls for %s",
    (status) => {
      render(<PlannerWeekBoard {...props()} meals={[{ ...meal, status }]} />);
      expect(screen.queryByRole("link", { name: "장보기" })).toBeNull();
      expect(screen.queryByRole("link", { name: "요리하기" })).toBeNull();
      expect(screen.queryByRole("link", { name: "상세" })).toBeNull();
      expect(screen.getByRole("link", { name: meal.recipe_title }).getAttribute("href"))
        .toBe("/planner/2026-09-06/breakfast?slot=%EC%95%84%EC%B9%A8");
    },
  );

  it("intercepts the guest meal card and retains the independent add action", () => {
    const onMealOpen = vi.fn();
    const boardProps = { ...props(), onMealOpen };
    render(<PlannerWeekBoard {...boardProps} />);
    fireEvent.click(screen.getByRole("button", { name: meal.recipe_title }));
    expect(onMealOpen).toHaveBeenCalledWith(meal);
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "9/6 아침 식사 추가" }));
    expect(boardProps.onAdd).toHaveBeenCalledWith("2026-09-06", boardProps.columns[0]);
  });

  it("shows total weight and planned total nutrition without per-serving labels", () => {
    render(<PlannerWeekBoard {...props()} nutritionByMeal={nutritionByMeal} />);
    expect(screen.getByRole("link", { name: meal.recipe_title }).getAttribute("title")).toContain("500 g · 420 kcal · 탄수화물 46 g · 단백질 22 g · 지방 14 g");
    expect(screen.getByText("500 g")).toBeTruthy();
    expect(screen.getByText("420 kcal")).toBeTruthy();
    expect(screen.queryByText(/인분/)).toBeNull();
    expect(screen.getByText("등록").className).toContain("sr-only");
    const bar = screen.getByRole("img", { name: /탄단지 열량 비율/ });
    const portions = Array.from(bar.children).map((child) => Number.parseFloat((child as HTMLElement).style.width));
    expect(portions[0]).toBeCloseTo(46 * 4 / (46 * 4 + 22 * 4 + 14 * 9) * 100);
    expect(portions.reduce((sum, part) => sum + part, 0)).toBeCloseTo(100);
  });

  it.each([undefined, null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])("does not invent missing or invalid total weight: %s", (totalWeightGrams) => {
    render(<PlannerWeekBoard {...props()} nutritionByMeal={{ "meal-1": { ...nutritionByMeal["meal-1"], totalWeightGrams } }} />);
    expect(screen.getByText("무게 계산 준비 중")).toBeTruthy();
    expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
  });

  it("shows a partial prepared value as a minimum", () => {
    const boardProps = {
      ...props(),
      nutritionByMeal: {
        "meal-1": {
          ...nutritionByMeal["meal-1"],
          values: {
            ...nutritionByMeal["meal-1"].values,
            energy_kcal: { amount: null, known_amount: 210, status: "partial" as const, display_mode: "minimum" as const },
          },
        },
      },
    };
    render(<PlannerWeekBoard {...boardProps} />);
    expect(screen.getByRole("link", { name: meal.recipe_title }).getAttribute("title")).toContain("최소 210 kcal · 탄수화물 46 g · 단백질 22 g · 지방 14 g");
    expect(screen.getByText("최소 210 kcal")).toBeTruthy();
  });

  it.each([undefined, { "meal-1": { ...nutritionByMeal["meal-1"], plannedServings: 1 } }])(
    "does not replace missing or stale prepared values with zero or recipe defaults",
    (preparedValues) => {
      const boardProps = { ...props(), nutritionByMeal: preparedValues };
      render(<PlannerWeekBoard {...boardProps} />);
      expect(screen.getByRole("link", { name: meal.recipe_title }).getAttribute("title")).toContain("영양 정보 준비 중");
      expect(screen.queryByText(/420 kcal|22 g|0 kcal/)).toBeNull();
      expect(screen.getByText("열량 정보 준비 중")).toBeTruthy();
    },
  );
  it("does not invent energy from an unavailable value", () => {
    render(<PlannerWeekBoard {...props()} nutritionByMeal={{ "meal-1": { plannedServings: 2, values: { energy_kcal: { status: "unavailable", amount: null, known_amount: null, display_mode: null } } } }} />);
    expect(screen.getByText("열량 정보 준비 중")).toBeTruthy();
    expect(screen.queryByText(/1인분당/)).toBeNull();
  });

  it.each([
    ["carbohydrate_g", "탄"],
    ["protein_g", "단"],
    ["fat_g", "지"],
  ] as const)("keeps minimum, unavailable and missing %s distinct from zero", (code, label) => {
    const values = nutritionByMeal["meal-1"].values;
    const { rerender } = render(<PlannerWeekBoard {...props()} nutritionByMeal={{ "meal-1": { plannedServings: 2, values: { ...values, [code]: { amount: null, known_amount: 9, status: "partial", display_mode: "minimum" } } } }} />);
    expect(screen.getByText(`${label} 최소 9 g`)).toBeTruthy();
    expect(screen.queryByRole("img", { name: /탄단지 열량 비율/ })).toBeNull();
    rerender(<PlannerWeekBoard {...props()} nutritionByMeal={{ "meal-1": { plannedServings: 2, values: { ...values, [code]: { amount: null, known_amount: null, status: "unavailable", display_mode: null } } } }} />);
    expect(screen.getByText(`${label} 정보 준비 중`)).toBeTruthy();
    expect(screen.queryByText(`${label} 0 g`)).toBeNull();
    const missingValues = { ...values };
    delete missingValues[code];
    rerender(<PlannerWeekBoard {...props()} nutritionByMeal={{ "meal-1": { plannedServings: 2, values: missingValues } }} />);
    expect(screen.getByText(`${label} 정보 준비 중`)).toBeTruthy();
  });

  it("does not show total nutrition for invalid planned servings", () => {
    render(<PlannerWeekBoard {...props()} meals={[{ ...meal, planned_servings: 0 }]} nutritionByMeal={{ "meal-1": { ...nutritionByMeal["meal-1"], plannedServings: 0 } }} />);
    expect(screen.getByText("열량 정보 준비 중")).toBeTruthy();
    expect(screen.queryByText(/Infinity|NaN/)).toBeNull();
  });
});
