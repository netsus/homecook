// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlannerWeekNavigation } from "@/components/planner/planner-week-navigation";

function createProps() {
  return {
    startDate: "2026-03-23",
    endDate: "2026-03-29",
    selectedDate: "2026-03-24",
    today: "2026-03-24",
    isCurrentWeek: true,
    onDateSelect: vi.fn(),
    onShiftWeek: vi.fn(),
    onCurrentWeek: vi.fn(),
  };
}

function scrollToPage(rail: HTMLElement, page: number) {
  rail.scrollLeft = 320 * page;
  fireEvent.scroll(rail);
}

describe("planner week navigation restoration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(320);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("exposes only the current week's seven dates to keyboard and accessibility users", () => {
    const props = createProps();
    render(<PlannerWeekNavigation {...props} />);

    const rail = screen.getByTestId("planner-week-date-rail");
    expect(within(rail).getAllByRole("button")).toHaveLength(7);
    fireEvent.click(screen.getByRole("button", { name: "3/26 목 선택" }));
    expect(props.onDateSelect).toHaveBeenCalledWith("2026-03-26");
  });

  it.each([
    [0, -7],
    [2, 7],
  ])("commits page %i once and ignores its recentering scroll events", (page, delta) => {
    const props = createProps();
    const view = render(<PlannerWeekNavigation {...props} />);
    act(() => vi.advanceTimersByTime(500));
    const rail = screen.getByTestId("planner-week-date-rail");

    scrollToPage(rail, page);
    fireEvent.scroll(rail);
    act(() => vi.advanceTimersByTime(500));

    expect(props.onShiftWeek).toHaveBeenCalledTimes(1);
    expect(props.onShiftWeek).toHaveBeenCalledWith(delta);

    view.rerender(<PlannerWeekNavigation {...props}
      startDate={delta > 0 ? "2026-03-30" : "2026-03-16"}
      endDate={delta > 0 ? "2026-04-05" : "2026-03-22"}
      selectedDate={delta > 0 ? "2026-03-31" : "2026-03-17"}
      isCurrentWeek={false}
    />);
    act(() => vi.advanceTimersByTime(500));
    expect(rail.scrollLeft).toBe(320);
    fireEvent.scroll(rail);
    act(() => vi.advanceTimersByTime(500));
    expect(props.onShiftWeek).toHaveBeenCalledTimes(1);

    // A separate deliberate gesture still moves exactly one more week.
    scrollToPage(rail, page);
    act(() => vi.advanceTimersByTime(500));
    expect(props.onShiftWeek).toHaveBeenCalledTimes(2);
  });

  it.each(["resolve", "reject"] as const)(
    "allows a new swipe when the week request finishes with %s without changing the date range",
    async (outcome) => {
      let resolveRequest!: () => void;
      let rejectRequest!: (reason: Error) => void;
      const request = new Promise<void>((resolve, reject) => {
        resolveRequest = resolve;
        rejectRequest = reject;
      });
      const props = createProps();
      props.onShiftWeek.mockReturnValueOnce(request);
      render(<PlannerWeekNavigation {...props} />);
      act(() => vi.advanceTimersByTime(500));
      const rail = screen.getByTestId("planner-week-date-rail");
      scrollToPage(rail, 2);
      act(() => vi.advanceTimersByTime(500));
      expect(props.onShiftWeek).toHaveBeenCalledTimes(1);

      await act(async () => {
        if (outcome === "resolve") resolveRequest();
        else rejectRequest(new Error("주간 계획을 불러오지 못했어요."));
        await Promise.resolve();
      });
      expect(rail.scrollLeft).toBe(320);
      fireEvent.scroll(rail);
      act(() => vi.advanceTimersByTime(500));
      expect(props.onShiftWeek).toHaveBeenCalledTimes(1);

      scrollToPage(rail, 2);
      act(() => vi.advanceTimersByTime(500));
      expect(props.onShiftWeek).toHaveBeenCalledTimes(2);
      expect(props.onShiftWeek).toHaveBeenLastCalledWith(7);
    },
  );

  it("ignores an unfinished swipe that returns to the current page", () => {
    const props = createProps();
    render(<PlannerWeekNavigation {...props} />);
    act(() => vi.advanceTimersByTime(500));
    const rail = screen.getByTestId("planner-week-date-rail");

    scrollToPage(rail, 2);
    act(() => vi.advanceTimersByTime(40));
    scrollToPage(rail, 1);
    act(() => vi.advanceTimersByTime(500));

    expect(props.onShiftWeek).not.toHaveBeenCalled();
  });

  it("supports left, right, and current-week keyboard shortcuts", () => {
    const props = { ...createProps(), isCurrentWeek: false };
    render(<PlannerWeekNavigation {...props} />);
    const rail = screen.getByTestId("planner-week-date-rail");

    fireEvent.keyDown(rail, { key: "ArrowLeft" });
    expect(props.onShiftWeek).toHaveBeenLastCalledWith(-7);
    fireEvent.keyDown(rail, { key: "ArrowRight" });
    expect(props.onShiftWeek).toHaveBeenLastCalledWith(7);
    fireEvent.keyDown(rail, { key: "Home" });
    expect(props.onCurrentWeek).toHaveBeenCalledTimes(1);
  });
  it("keeps keyboard focus on the rail when week navigation starts from a date", () => {
    const props = createProps();
    render(<PlannerWeekNavigation {...props} />);
    const date = screen.getByRole("button", { name: "3/26 목 선택" });
    date.focus();
    fireEvent.keyDown(date, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByTestId("planner-week-date-rail"));
    expect(props.onShiftWeek).toHaveBeenCalledWith(7);
  });

});
