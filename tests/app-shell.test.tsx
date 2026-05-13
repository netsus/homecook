// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/app-shell";

vi.mock("@/components/layout/bottom-tabs", () => ({
  BottomTabs: ({ currentTab }: { currentTab: string }) => (
    <div>bottom-tabs:{currentTab}</div>
  ),
}));

afterEach(() => {
  cleanup();
});

describe("app shell", () => {
  it("uses the shared brand header without MVP or local-dev badges", () => {
    render(
      <AppShell currentTab="home">
        <div>content</div>
      </AppShell>,
    );

    const brandLink = screen.getByRole("link", { name: "Homecook" });
    expect(brandLink.getAttribute("href")).toBe("/");
    expect(brandLink.textContent).toBe("homecook_");
    expect(brandLink.className).toContain("text-[22px]");
    expect(brandLink.className).not.toContain("uppercase");
    expect(screen.queryByText("오늘 집밥 메뉴를 찾는 주방")).toBeNull();
    expect(screen.queryByText("MVP Slice 01")).toBeNull();
    expect(screen.queryByText("local-dev-controls")).toBeNull();
    expect(screen.getByText("content")).toBeTruthy();
  });

  it("can hide the shared header when a screen needs its own hero header", () => {
    render(
      <AppShell currentTab="home" headerMode="hidden">
        <div>content</div>
      </AppShell>,
    );

    expect(screen.queryByText("Homecook")).toBeNull();
    expect(screen.getByText("content")).toBeTruthy();
  });

  it("can render the shared header only at the web breakpoint", () => {
    const { container } = render(
      <AppShell currentTab="home" headerMode="desktop-only">
        <div>content</div>
      </AppShell>,
    );

    const wrapper = container.querySelector(".hidden.lg\\:block");
    expect(wrapper).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "데스크탑 주요 메뉴" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "홈" }).getAttribute("aria-current")).toBe("page");
  });


  it("applies bottom-safe class when shared bottom tabs are visible", () => {
    const { container } = render(
      <AppShell currentTab="planner">
        <div>content</div>
      </AppShell>,
    );

    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).toContain("bottom-safe");
    expect(screen.getByText("bottom-tabs:planner")).toBeTruthy();
  });

  it("omits bottom-safe class when bottom tabs are hidden", () => {
    const { container } = render(
      <AppShell bottomTabsMode="hidden" currentTab="home">
        <div>content</div>
      </AppShell>,
    );

    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).not.toContain("bottom-safe");
    expect(screen.queryByText(/bottom-tabs:/)).toBeNull();
  });

  it("supports combined hidden header and hidden bottom tabs", () => {
    const { container } = render(
      <AppShell bottomTabsMode="hidden" currentTab="home" headerMode="hidden">
        <div>content</div>
      </AppShell>,
    );

    const shell = container.firstElementChild as HTMLElement;
    expect(shell.className).not.toContain("bottom-safe");
    expect(screen.queryByText("Homecook")).toBeNull();
    expect(screen.queryByText(/bottom-tabs:/)).toBeNull();
    expect(screen.getByText("content")).toBeTruthy();
  });
});
