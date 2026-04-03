// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildLocalLogoutHref,
  LocalDevSessionControls,
} from "@/components/auth/local-dev-session-controls";

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
  });

  afterEach(() => {
    cleanup();
  });

  it("builds a logout href for the current local page", () => {
    expect(
      buildLocalLogoutHref({
        pathname: "/planner",
        search: "?from=test",
      }),
    ).toBe("/auth/logout?next=%2Fplanner%3Ffrom%3Dtest");
  });

  it("shows a logout action in local dev auth mode", () => {
    render(<LocalDevSessionControls />);

    const logoutButton = screen.getByRole("button", { name: "로컬 세션 종료" });

    expect(screen.getByText("local auth tools")).toBeTruthy();
    expect(logoutButton).toBeTruthy();
  });

  it("does not render outside local dev auth mode", () => {
    isLocalDevAuthEnabled.mockReturnValue(false);

    render(<LocalDevSessionControls />);

    expect(screen.queryByRole("button", { name: "로컬 세션 종료" })).toBeNull();
  });

  it("builds a clean logout href when there is no query string", () => {
    expect(
      buildLocalLogoutHref({
        pathname: "/recipe/mock-kimchi-jjigae",
        search: "",
      }),
    ).toBe(
      "/auth/logout?next=%2Frecipe%2Fmock-kimchi-jjigae",
    );
  });
});
