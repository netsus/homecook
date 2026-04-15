// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/app-shell";

const authState = vi.hoisted(() => ({ enabled: false }));

vi.mock("@/lib/auth/local-dev-auth", () => ({
  isLocalDevAuthEnabled: () => authState.enabled,
}));

vi.mock("@/components/auth/local-dev-session-controls", () => ({
  LocalDevSessionControls: () => <div>local-dev-controls</div>,
}));

vi.mock("@/components/layout/bottom-tabs", () => ({
  BottomTabs: ({ currentTab }: { currentTab: string }) => (
    <div>bottom-tabs:{currentTab}</div>
  ),
}));

afterEach(() => {
  cleanup();
  authState.enabled = false;
});

describe("app shell", () => {
  it("keeps only the compact brand label in the shared header", () => {
    render(
      <AppShell currentTab="home">
        <div>content</div>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Homecook" }).getAttribute("href")).toBe("/");
    expect(screen.queryByText("오늘 집밥 메뉴를 찾는 주방")).toBeNull();
    expect(screen.getByText("content")).toBeTruthy();
  });

  it("can hide the shared header when a screen integrates the brand into its own hero", () => {
    render(
      <AppShell currentTab="home" headerMode="integrated">
        <div>content</div>
      </AppShell>,
    );

    expect(screen.queryByText("Homecook")).toBeNull();
    expect(screen.getByText("content")).toBeTruthy();
  });

  it("does not surface local dev controls above integrated home content", () => {
    authState.enabled = true;

    render(
      <AppShell currentTab="home" headerMode="integrated">
        <div>content</div>
      </AppShell>,
    );

    expect(screen.queryByText("local-dev-controls")).toBeNull();
    expect(screen.getByText("content")).toBeTruthy();
  });
});
