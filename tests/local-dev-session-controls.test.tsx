// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalDevSessionControls } from "@/components/auth/local-dev-session-controls";

const isLocalDevAuthEnabled = vi.fn();
const readE2EAuthOverride = vi.fn();
const usePathname = vi.fn();
const useSearchParams = vi.fn();

vi.mock("@/lib/auth/local-dev-auth", () => ({
  isLocalDevAuthEnabled: () => isLocalDevAuthEnabled(),
}));

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  readE2EAuthOverride: () => readE2EAuthOverride(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
  useSearchParams: () => useSearchParams(),
}));

describe("local dev session controls", () => {
  beforeEach(() => {
    isLocalDevAuthEnabled.mockReset();
    readE2EAuthOverride.mockReset();
    usePathname.mockReset();
    useSearchParams.mockReset();

    isLocalDevAuthEnabled.mockReturnValue(true);
    readE2EAuthOverride.mockReturnValue(null);
    usePathname.mockReturnValue("/planner");
    useSearchParams.mockReturnValue({
      toString: () => "from=test",
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows a logout link for the current local page", () => {
    render(<LocalDevSessionControls />);

    const logoutLink = screen.getByRole("link", { name: "로컬 세션 종료" });

    expect(screen.getByText("local auth tools")).toBeTruthy();
    expect(logoutLink.getAttribute("href")).toBe("/auth/logout?next=%2Fplanner%3Ffrom%3Dtest");
  });

  it("does not render outside local dev auth mode", () => {
    isLocalDevAuthEnabled.mockReturnValue(false);

    render(<LocalDevSessionControls />);

    expect(screen.queryByRole("link", { name: "로컬 세션 종료" })).toBeNull();
  });

  it("updates the logout link when the route changes", () => {
    usePathname.mockReturnValue("/recipe/mock-kimchi-jjigae");
    useSearchParams.mockReturnValue({
      toString: () => "",
    });

    render(<LocalDevSessionControls />);

    expect(screen.getByRole("link", { name: "로컬 세션 종료" }).getAttribute("href")).toBe(
      "/auth/logout?next=%2Frecipe%2Fmock-kimchi-jjigae",
    );
  });
});
