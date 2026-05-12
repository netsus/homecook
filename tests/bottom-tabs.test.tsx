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
    expect(nav?.className).toContain("border-[var(--wave1-border)]");
    expect(nav?.className).toContain("bg-[var(--wave1-surface)]");
    expect(nav?.className).toContain("env(safe-area-inset-bottom)");
    expect(container.querySelector(".glass-panel")).toBeNull();

    expect(screen.getByRole("link", { name: "홈" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "플래너" }).getAttribute("href")).toBe("/planner");
    expect(screen.getByRole("link", { name: "팬트리" }).getAttribute("href")).toBe("/pantry");
    expect(screen.getByRole("link", { name: "마이" }).getAttribute("href")).toBe("/mypage");
    expect(screen.queryByText("현재")).toBeNull();
    expect(screen.queryByText("준비중")).toBeNull();
  });

  it("marks the active tab with the Wave1 mint state", () => {
    render(<BottomTabs currentTab="pantry" />);

    const activeTab = screen.getByRole("link", { current: "page" });
    expect(activeTab.textContent).toContain("팬트리");
    expect(activeTab.className).toContain("text-[var(--wave1-mint-contrast)]");
  });
});
