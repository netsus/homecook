// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalDevSessionControls } from "@/components/auth/local-dev-session-controls";

const isLocalDevAuthEnabled = vi.fn();
const readE2EAuthOverride = vi.fn();

vi.mock("@/lib/auth/local-dev-auth", () => ({
  isLocalDevAuthEnabled: () => isLocalDevAuthEnabled(),
}));

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  readE2EAuthOverride: () => readE2EAuthOverride(),
}));

describe("local dev session controls", () => {
  beforeEach(() => {
    isLocalDevAuthEnabled.mockReset();
    readE2EAuthOverride.mockReset();

    isLocalDevAuthEnabled.mockReturnValue(true);
    readE2EAuthOverride.mockReturnValue(null);

    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        pathname: "/planner",
        search: "?from=test",
      },
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

    expect(screen.queryByRole("button", { name: "로컬 세션 종료" })).toBeNull();
  });
});
