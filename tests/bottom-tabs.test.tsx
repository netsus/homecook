// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BottomTabs } from "@/components/layout/bottom-tabs";

afterEach(() => {
  cleanup();
});

describe("BottomTabs", () => {
  it("renders the shared Wave1 four-tab mobile navigation", () => {
    const { container } = render(<BottomTabs currentTab="planner" />);

    const nav = container.querySelector("nav");
    expect(nav?.className).toContain("bottom-[calc(8px+env(safe-area-inset-bottom))]");
    expect(nav?.className).toContain("px-4");
    expect(nav?.querySelector("[data-slot='bottom-tab-container']")?.className).toContain(
      "rounded-full",
    );
    expect(container.querySelector(".glass-panel")).toBeNull();

    expect(screen.getByRole("link", { name: "홈" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "플래너" }).getAttribute("href")).toBe("/planner");
    expect(screen.getByRole("link", { name: "팬트리" }).getAttribute("href")).toBe("/pantry");
    expect(screen.getByRole("link", { name: "마이" }).getAttribute("href")).toBe("/mypage");
    expect(screen.queryByText("현재")).toBeNull();
    expect(screen.queryByText("준비중")).toBeNull();
  });

  it("marks the active tab with the shared black selected state", () => {
    render(<BottomTabs currentTab="pantry" />);

    const activeTab = screen.getByRole("link", { current: "page" });
    expect(activeTab.textContent).toContain("팬트리");
    expect(activeTab.className).toContain("text-[#111111]");
    expect(screen.getByTestId("bottom-tab-icon-pantry-fridge")).toBeTruthy();
  });

  it("renders the planner selected icon with the white center dot and pop animation", () => {
    render(<BottomTabs currentTab="planner" />);

    const activeTab = screen.getByRole("link", { current: "page" });
    const plannerIcon = activeTab.querySelector("[data-testid='bottom-tab-icon-planner']");

    expect(plannerIcon?.getAttribute("class")).toContain("bottom-tab-active-icon");
    expect(
      activeTab.querySelector("[data-testid='bottom-tab-planner-center-dot']"),
    ).toBeTruthy();
  });
});
