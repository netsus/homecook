// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/layout/app-shell";

vi.mock("@/lib/auth/local-dev-auth", () => ({
  isLocalDevAuthEnabled: () => false,
}));

vi.mock("@/components/layout/bottom-tabs", () => ({
  BottomTabs: ({ currentTab }: { currentTab: string }) => (
    <div>bottom-tabs:{currentTab}</div>
  ),
}));

describe("app shell", () => {
  it("keeps only the compact brand label in the shared header", () => {
    render(
      <AppShell currentTab="home">
        <div>content</div>
      </AppShell>,
    );

    expect(screen.getByText("Homecook")).toBeTruthy();
    expect(screen.queryByText("오늘 집밥 메뉴를 찾는 주방")).toBeNull();
    expect(screen.getByText("content")).toBeTruthy();
  });
});
