// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import {
  PLANNER_WEEK_RETURN_CONTEXT_KEY,
  clearPlannerWeekReturnContext,
  readPlannerWeekReturnContext,
  savePlannerWeekReturnContext,
} from "@/lib/planner/planner-week-return-context";

describe("planner week safe authentication return context", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("round-trips an exact maximum-seven-day range and selected date/column", () => {
    savePlannerWeekReturnContext({
      version: 1,
      startDate: "2026-07-13",
      endDate: "2026-07-19",
      selectedDate: "2026-07-17",
      columnId: "550e8400-e29b-41d4-a716-446655440050",
      slotName: "아침",
    });

    expect(readPlannerWeekReturnContext()).toEqual({
      version: 1,
      startDate: "2026-07-13",
      endDate: "2026-07-19",
      selectedDate: "2026-07-17",
      columnId: "550e8400-e29b-41d4-a716-446655440050",
      slotName: "아침",
    });

    clearPlannerWeekReturnContext();
    expect(window.sessionStorage.getItem(PLANNER_WEEK_RETURN_CONTEXT_KEY)).toBeNull();
  });

  it.each([
    {
      version: 1,
      startDate: "2026-07-13",
      endDate: "2026-07-20",
      selectedDate: "2026-07-17",
      columnId: null,
      slotName: null,
    },
    {
      version: 1,
      startDate: "2026-07-13",
      endDate: "2026-07-19",
      selectedDate: "2026-07-20",
      columnId: null,
      slotName: null,
    },
    {
      version: 1,
      startDate: "not-a-date",
      endDate: "2026-07-19",
      selectedDate: "2026-07-17",
      columnId: null,
      slotName: null,
    },
  ])("fails closed for an invalid or over-seven-day stored range", (unsafe) => {
    window.sessionStorage.setItem(
      PLANNER_WEEK_RETURN_CONTEXT_KEY,
      JSON.stringify(unsafe),
    );

    expect(readPlannerWeekReturnContext()).toBeNull();
    expect(window.sessionStorage.getItem(PLANNER_WEEK_RETURN_CONTEXT_KEY)).toBeNull();
  });
});
