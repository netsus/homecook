// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlannerSegmentTabs } from "@/components/planner/planner-shell-segments";
import {
  buildPlannerShellHref,
  readPlannerShellLocation,
} from "@/lib/planner/planner-shell-navigation";

describe("planner shell history contract", () => {
  afterEach(() => cleanup());

  it("round-trips segment and selected date while preserving unrelated planner query state", () => {
    const current = new URLSearchParams(
      "segment=log&date=2026-07-23&restore=meal-add-modal&columnId=lunch",
    );

    expect(readPlannerShellLocation(current, "2026-07-20")).toEqual({
      date: "2026-07-23",
      segment: "log",
    });
    expect(
      buildPlannerShellHref(current, {
        date: "2026-07-24",
        segment: "plan",
      }),
    ).toBe(
      "/planner?date=2026-07-24&restore=meal-add-modal&columnId=lunch",
    );
  });

  it("falls back safely for unknown or malformed deep-link values", () => {
    expect(
      readPlannerShellLocation(
        new URLSearchParams("segment=future&date=23-07-2026"),
        "2026-07-20",
      ),
    ).toEqual({ date: "2026-07-20", segment: "plan" });
  });

  it("moves focus and selection with Arrow, Home, and End keys", () => {
    const onSelect = vi.fn();
    render(<PlannerSegmentTabs activeSegment="plan" onSelect={onSelect} />);

    const planTab = screen.getByRole("tab", { name: "요리 계획" });
    const logTab = screen.getByRole("tab", { name: "식사 기록" });
    planTab.focus();

    fireEvent.keyDown(planTab, { key: "ArrowRight" });
    expect(document.activeElement).toBe(logTab);
    expect(onSelect).toHaveBeenLastCalledWith("log");

    fireEvent.keyDown(logTab, { key: "Home" });
    expect(document.activeElement).toBe(planTab);
    expect(onSelect).toHaveBeenLastCalledWith("plan");

    fireEvent.keyDown(planTab, { key: "End" });
    expect(document.activeElement).toBe(logTab);
    expect(onSelect).toHaveBeenLastCalledWith("log");
  });
});
