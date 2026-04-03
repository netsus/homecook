// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalDevSessionControls } from "@/components/auth/local-dev-session-controls";

const isLocalDevAuthEnabled = vi.fn();
const hasSupabasePublicEnv = vi.fn();
const getSession = vi.fn();
const onAuthStateChange = vi.fn();
const signOut = vi.fn();

vi.mock("@/lib/auth/local-dev-auth", () => ({
  isLocalDevAuthEnabled: () => isLocalDevAuthEnabled(),
}));

vi.mock("@/lib/supabase/env", () => ({
  hasSupabasePublicEnv: () => hasSupabasePublicEnv(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession,
      onAuthStateChange,
      signOut,
    },
  }),
}));

describe("local dev session controls", () => {
  const assign = vi.fn();

  beforeEach(() => {
    isLocalDevAuthEnabled.mockReset();
    hasSupabasePublicEnv.mockReset();
    getSession.mockReset();
    onAuthStateChange.mockReset();
    signOut.mockReset();
    assign.mockReset();

    isLocalDevAuthEnabled.mockReturnValue(true);
    hasSupabasePublicEnv.mockReturnValue(true);
    getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            email: "cook@example.com",
          },
        },
      },
    });
    onAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    });
    signOut.mockResolvedValue({ error: null });

    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        pathname: "/planner",
        search: "?from=test",
        assign,
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the current local session and signs out back to the current page", async () => {
    const user = userEvent.setup();

    render(<LocalDevSessionControls />);

    expect(await screen.findByText("local session: cook@example.com")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "로컬 세션 종료" }));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledTimes(1);
    });
    expect(assign).toHaveBeenCalledWith("/planner?from=test");
  });

  it("does not render outside local dev auth mode", () => {
    isLocalDevAuthEnabled.mockReturnValue(false);

    render(<LocalDevSessionControls />);

    expect(screen.queryByRole("button", { name: "로컬 세션 종료" })).toBeNull();
  });
});
