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

    expect(screen.getByRole("link", { name: "Homecook" }).getAttribute("href")).toBe("/");
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
});
