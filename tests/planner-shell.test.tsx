// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MealLogUnavailableState,
  PlannerSegmentTabs,
} from "@/components/planner/planner-shell-segments";

describe("planner shell segments", () => {
  afterEach(() => cleanup());

  it("provides the exact two segments and exposes only the selected tab in the roving order", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(<PlannerSegmentTabs activeSegment="plan" onSelect={onSelect} />);

    const planTab = screen.getByRole("tab", { name: "요리 계획" });
    const logTab = screen.getByRole("tab", { name: "식사 기록" });

    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(planTab.getAttribute("aria-selected")).toBe("true");
    expect(planTab.getAttribute("tabindex")).toBe("0");
    expect(logTab.getAttribute("aria-selected")).toBe("false");
    expect(logTab.getAttribute("tabindex")).toBe("-1");
    expect(planTab.className).toContain("min-h-11");

    await user.click(logTab);
    expect(onSelect).toHaveBeenCalledWith("log");
  });

  it("marks meal log as unavailable without inventing a producer or status", () => {
    render(<MealLogUnavailableState />);

    expect(
      screen.getByRole("heading", { name: "식사 기록은 준비 중이에요" }),
    ).toBeTruthy();
    expect(screen.getByText("현재는 요리 계획만 사용할 수 있어요."))
      .toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
