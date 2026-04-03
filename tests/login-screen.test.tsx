// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginScreen } from "@/components/auth/login-screen";

const hasSupabasePublicEnv = vi.fn();
const getSession = vi.fn();
const onAuthStateChange = vi.fn();

vi.mock("@/components/auth/social-login-buttons-deferred", () => ({
  SocialLoginButtonsDeferred: ({ nextPath }: { nextPath: string }) => (
    <div>social-buttons:{nextPath}</div>
  ),
}));

vi.mock("@/lib/supabase/env", () => ({
  hasSupabasePublicEnv: () => hasSupabasePublicEnv(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession,
      onAuthStateChange,
    },
  }),
}));

describe("login screen", () => {
  const replace = vi.fn();

  beforeEach(() => {
    hasSupabasePublicEnv.mockReset();
    getSession.mockReset();
    onAuthStateChange.mockReset();
    replace.mockReset();

    hasSupabasePublicEnv.mockReturnValue(true);
    getSession.mockResolvedValue({ data: { session: null } });
    onAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    });

    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        replace,
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the OAuth failure banner when authError is present", () => {
    render(<LoginScreen authError="oauth_failed" />);

    expect(screen.getByText("로그인에 실패했어요. 다시 시도해주세요.")).toBeTruthy();
    expect(screen.getByText("social-buttons:/")).toBeTruthy();
  });

  it("renders the step 1 social login copy by default", () => {
    render(<LoginScreen />);

    expect(
      screen.getByRole("heading", { name: "소셜 로그인으로 이어서 진행하세요" }),
    ).toBeTruthy();
    expect(screen.getByText("집밥하는 모든 과정을 함께")).toBeTruthy();
  });

  it("uses the provided nextPath for login actions", () => {
    render(<LoginScreen nextPath="/planner" />);

    expect(screen.getByText("social-buttons:/planner")).toBeTruthy();
    expect(screen.getByText("/planner")).toBeTruthy();
  });

  it("redirects authenticated users away from the login screen", async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          user: {
            id: "user-1",
          },
        },
      },
    });

    render(<LoginScreen nextPath="/planner" />);

    await vi.waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/planner");
    });
  });
});
