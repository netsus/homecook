// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
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
    const tabContainer = nav?.querySelector("[data-slot='bottom-tab-container']");

    expect(tabContainer?.className).toContain("rounded-full");
    expect(tabContainer?.className).toContain("bg-[var(--wave1-surface)]");
    expect(tabContainer?.className).not.toContain("backdrop");
    expect(container.querySelector(".glass-panel")).toBeNull();

    expect(screen.getByRole("link", { name: "홈" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "플래너" }).getAttribute("href")).toBe("/planner");
    expect(screen.getByRole("link", { name: "팬트리" }).getAttribute("href")).toBe("/pantry");
    expect(screen.getByRole("link", { name: "마이" }).getAttribute("href")).toBe("/mypage");
    expect(screen.queryByText("현재")).toBeNull();
    expect(screen.queryByText("준비중")).toBeNull();
  });

  it("marks the active tab with the shared token selected state", () => {
    render(<BottomTabs currentTab="pantry" />);

    const activeTab = screen.getByRole("link", { current: "page" });
    expect(activeTab.textContent).toContain("팬트리");
    expect(activeTab.className).toContain("bottom-tab-link");
    expect(activeTab.className).toContain("text-[var(--brand)]");
    expect(screen.getByTestId("bottom-tab-icon-pantry-fridge")).toBeTruthy();
  });

  it("renders the planner selected icon with a stable selected icon class", () => {
    render(<BottomTabs currentTab="planner" />);

    const activeTab = screen.getByRole("link", { current: "page" });
    const plannerIcon = activeTab.querySelector("[data-testid='bottom-tab-icon-planner']");

    expect(plannerIcon?.getAttribute("class")).toContain("bottom-tab-active-icon");
    expect(plannerIcon?.getAttribute("class")).toContain("bottom-tab-icon");
    expect(
      activeTab.querySelector("[data-testid='bottom-tab-planner-center-dot']"),
    ).toBeTruthy();
  });

  it("keeps press feedback from resizing bottom tab icons", () => {
    const globalsCss = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const activeRule = globalsCss.match(
      /\.bottom-tab-link:active \.bottom-tab-icon \{[^}]+\}/,
    )?.[0];

    expect(activeRule).toContain("opacity");
    expect(activeRule).not.toContain("scale(");
    expect(activeRule).not.toContain("transform");
  });
});
