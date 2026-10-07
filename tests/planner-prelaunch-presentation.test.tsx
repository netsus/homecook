// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlannerWeekBoard } from "@/components/planner/planner-week-board";
import { PlannerWeekOverview } from "@/components/planner/planner-week-overview";
import type { PlannerMealData } from "@/types/planner";

const meal: PlannerMealData = {
  id: "meal-1", recipe_id: "recipe-1", recipe_title: "그릭요거트 볼", recipe_thumbnail_url: null,
  plan_date: "2026-09-06", column_id: "breakfast", planned_servings: 2, status: "registered", is_leftover: false,
};
function props() {
  return { columns: [{ id: "breakfast", name: "아침", sort_order: 0 }], meals: [meal], selectedDate: "2026-09-06", today: "2026-09-06", disabled: false, onAdd: vi.fn(), onDayRef: vi.fn() };
}
afterEach(cleanup);

describe("planner A presentation", () => {
  it("expands only the selected day and independently identifies today", () => {
    const view = render(<PlannerWeekBoard {...props()} selectedDate="2026-09-05" />);
    expect(screen.getByRole("heading", { name: "9/5 (토)" }).getAttribute("aria-current")).toBeNull();
    expect(screen.queryByText(meal.recipe_title)).toBeNull();
    view.rerender(<PlannerWeekBoard {...props()} />);
    expect(screen.getByRole("heading", { name: "9/6 (일)" }).getAttribute("aria-current")).toBe("date");
    expect(screen.getAllByRole("article")).toHaveLength(1);
  });

  it.each([
    ["registered", "등록"], ["shopping_done", "장보기 완료"], ["cook_done", "요리 완료"],
  ] as const)("opens the exact planned recipe for %s while the heading opens the whole meal", (status, label) => {
    render(<PlannerWeekBoard {...props()} meals={[{ ...meal, status }]} />);
    expect(screen.getByText(label)).toBeTruthy();
    const food = new URL(screen.getByRole("link", { name: meal.recipe_title }).getAttribute("href")!, "http://homecook.local");
    const heading = new URL(screen.getByRole("link", { name: /아침/ }).getAttribute("href")!, "http://homecook.local");
    expect(food.pathname).toBe("/planner/2026-09-06/breakfast");
    expect(food.searchParams.get("mealId")).toBe(meal.id);
    expect(food.searchParams.get("returnTo")).toBe("/planner?date=2026-09-06");
    expect(heading.searchParams.has("mealId")).toBe(false);
    expect(screen.queryByRole("link", { name: "장보기" })).toBeNull();
    expect(screen.queryByRole("link", { name: "요리하기" })).toBeNull();
  });

  it("distinguishes an existing shopping list from an unlinked registered meal", () => {
    render(<PlannerWeekBoard {...props()} meals={[{ ...meal, shopping_list_id: "list-1" }]} />);
    expect(screen.getByText("장보기 중")).toBeTruthy();
    expect(screen.queryByText("등록")).toBeNull();
  });

  it("intercepts the guest recipe action while retaining an independent add action", () => {
    const boardProps = { ...props(), onMealOpen: vi.fn() };
    render(<PlannerWeekBoard {...boardProps} />);
    fireEvent.click(screen.getByRole("button", { name: meal.recipe_title }));
    expect(boardProps.onMealOpen).toHaveBeenCalledWith(meal);
    expect(screen.queryByRole("link", { name: meal.recipe_title })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "9/6 아침 식사 추가" }));
    expect(boardProps.onAdd).toHaveBeenCalledWith("2026-09-06", boardProps.columns[0]);
  });

  it("shows servings and status without repeating nutrition charts in the planner list", () => {
    render(<PlannerWeekBoard {...props()} />);
    expect(screen.getByText("2인분")).toBeTruthy();
    expect(screen.getByText("등록")).toBeTruthy();
    expect(screen.queryByRole("img", { name: /탄단지/ })).toBeNull();
    expect(screen.queryByText(/영양 정보 준비 중|열량 정보 준비 중|kcal/)).toBeNull();
  });

  it("keeps every configured empty meal heading and an independent disabled add button", () => {
    const onAdd = vi.fn();
    render(<PlannerWeekBoard {...props()} disabled meals={[]} columns={[...props().columns, { id: "snack", name: "간식", sort_order: 1 }]} onAdd={onAdd} />);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2);
    expect(screen.queryByText("계획 없음")).toBeNull();
    const add = screen.getByRole("button", { name: "9/6 간식 식사 추가" }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.click(add);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("selects an empty overview day instead of directly opening an add dialog", () => {
    const onSelect = vi.fn();
    render(<PlannerWeekOverview dateKeys={["2026-09-05", "2026-09-06"]} meals={[meal]} selectedDate="2026-09-06" today="2026-09-06" loading={false} onSelect={onSelect} onShiftWeek={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "9/5 토 선택" }));
    expect(onSelect).toHaveBeenCalledWith("2026-09-05");
    expect(screen.queryByText("계획 없음")).toBeNull();
    expect(screen.getByText("1개")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps date controls available without claiming unknown loading days are empty", () => {
    render(<PlannerWeekOverview dateKeys={["2026-09-05", "2026-09-06"]} meals={[]} selectedDate="2026-09-06" today="2026-09-06" loading onSelect={vi.fn()} onShiftWeek={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: /선택$/ })).toHaveLength(2);
    expect(screen.queryByText("계획 없음")).toBeNull();
  });
});
