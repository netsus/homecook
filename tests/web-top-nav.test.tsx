// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WebTopNav } from "@/components/web/web-top-nav";

describe("WebTopNav service name", () => {
  afterEach(cleanup);

  it("keeps the default non-HOME brand on the short service name only", () => {
    render(<WebTopNav activeId="planner" />);

    const brand = screen.getByRole("link", { name: "무먹" });
    expect(brand.textContent).toBe("무먹");
    expect(screen.queryByText("무엇을 먹든")).toBeNull();

    const symbol = brand.querySelector("img");
    expect(symbol).not.toBeNull();
    expect(symbol?.getAttribute("src")).toContain(
      "/brand/mumeok-symbol-192.png",
    );
    expect(symbol?.getAttribute("alt")).toBe("");
    expect(symbol?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders an optional supporting service name below the primary name", () => {
    render(
      <WebTopNav
        activeId="home"
        brandSupportingLabel="무엇을 먹든"
      />,
    );

    const brand = screen.getByRole("link", {
      name: "무먹, 무엇을 먹든",
    });
    const primary = within(brand).getByText("무먹");
    const supporting = within(brand).getByText("무엇을 먹든");

    expect(primary.className).toContain("web-topnav-brand-primary");
    expect(supporting.className).toContain("web-topnav-brand-supporting");
    expect(
      primary.compareDocumentPosition(supporting) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const symbol = brand.querySelector("img");
    expect(symbol).not.toBeNull();
    expect(symbol?.getAttribute("src")).toContain(
      "/brand/mumeok-symbol-192.png",
    );
    expect(symbol?.getAttribute("alt")).toBe("");
  });
});


describe("planner destinations", () => {
  afterEach(cleanup);
  it("keeps both dated planner destinations and delegates in-screen segment changes", () => {
    const onSelect = vi.fn();
    render(<WebTopNav activeId="planner" plannerDate="2026-09-06" plannerSegment="log" onPlannerSegmentSelect={onSelect} />);
    const plan = screen.getByRole("link", { name: "요리 계획" });
    const log = screen.getByRole("link", { name: "식사 기록" });
    expect(plan.getAttribute("href")).toBe("/planner?date=2026-09-06");
    expect(log.getAttribute("href")).toBe("/planner?date=2026-09-06&segment=log");
    expect(log.getAttribute("aria-current")).toBe("page");
    expect(plan.getAttribute("aria-current")).toBeNull();
    expect(screen.queryByRole("link", { name: "마이페이지" })).toBeNull();
    fireEvent.click(plan);
    expect(onSelect).toHaveBeenCalledWith("plan");
  });
});
