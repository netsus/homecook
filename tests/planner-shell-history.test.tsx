// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Wave1MobileBottomTab } from "@/components/layout/wave1-mobile-bottom-tab";
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

  it("keeps direct plan and log links on the selected date and delegates only an explicit click", () => {
    const onTabClick = vi.fn((_tabId, event) => event.preventDefault());
    const view = render(
      <Wave1MobileBottomTab ariaLabel="플래너 하단 탭" currentTab="planner" plannerDate="2026-07-23" onTabClick={onTabClick} />,
    );
    const planLink = screen.getByRole("link", { name: "요리 계획" });
    const logLink = screen.getByRole("link", { name: "식사 기록" });
    expect(planLink.getAttribute("href")).toBe("/planner?date=2026-07-23");
    expect(logLink.getAttribute("href")).toBe("/planner?date=2026-07-23&segment=log");
    expect(screen.getByRole("link", { current: "page" })).toBe(planLink);
    logLink.focus();
    expect(onTabClick).not.toHaveBeenCalled();
    fireEvent.click(logLink);
    expect(onTabClick).toHaveBeenCalledWith("meal-log", expect.objectContaining({ defaultPrevented: true }));
    view.rerender(
      <Wave1MobileBottomTab ariaLabel="플래너 하단 탭" currentTab="meal-log" plannerDate="2026-07-23" onTabClick={onTabClick} />,
    );
    expect(screen.getByRole("link", { current: "page" })).toBe(logLink);
    expect(planLink.hasAttribute("aria-current")).toBe(false);
  });
});
