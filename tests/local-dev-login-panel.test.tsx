// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalDevLoginPanel } from "@/components/auth/local-dev-login-panel";
import type { PendingRecipeAction } from "@/lib/auth/pending-action";

const isLocalDevAuthEnabled = vi.fn();
const getLocalDevAuthCredentials = vi.fn();
const hasSupabasePublicEnv = vi.fn();
const savePendingAction = vi.fn();
const signInWithPassword = vi.fn();
const signUp = vi.fn();

vi.mock("@/lib/auth/local-dev-auth", () => ({
  isLocalDevAuthEnabled: () => isLocalDevAuthEnabled(),
  getLocalDevAuthCredentials: () => getLocalDevAuthCredentials(),
}));

vi.mock("@/lib/auth/pending-action", () => ({
  savePendingAction: (action: PendingRecipeAction) => savePendingAction(action),
}));

vi.mock("@/lib/supabase/env", () => ({
  hasSupabasePublicEnv: () => hasSupabasePublicEnv(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signInWithPassword,
      signUp,
    },
  }),
}));

describe("local dev login panel", () => {
  const assign = vi.fn();
  const pendingAction: PendingRecipeAction = {
    type: "save",
    recipeId: "recipe-1",
    redirectTo: "/recipe/recipe-1",
    createdAt: 1,
  };

  beforeEach(() => {
    isLocalDevAuthEnabled.mockReset();
    getLocalDevAuthCredentials.mockReset();
    hasSupabasePublicEnv.mockReset();
    savePendingAction.mockReset();
    signInWithPassword.mockReset();
    signUp.mockReset();

    isLocalDevAuthEnabled.mockReturnValue(true);
    getLocalDevAuthCredentials.mockReturnValue({
      email: "local-tester@homecook.local",
      password: "homecook-local-dev",
      nickname: "로컬 테스트 계정",
    });
    hasSupabasePublicEnv.mockReturnValue(true);

    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...window.location,
        assign,
      },
    });
    assign.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("does not render when local dev auth is disabled", () => {
    isLocalDevAuthEnabled.mockReturnValue(false);

    render(<LocalDevLoginPanel nextPath="/" />);

    expect(screen.queryByRole("button", { name: "로컬 테스트 계정으로 시작" })).toBeNull();
  });

  it("creates a local account on first use, keeps the pending action, and redirects", async () => {
    const user = userEvent.setup();
    const onStarted = vi.fn();

    signInWithPassword
      .mockResolvedValueOnce({
        data: { session: null, user: null },
        error: new Error("Invalid login credentials"),
      })
      .mockResolvedValueOnce({
        data: { session: { access_token: "token" }, user: { id: "user-1" } },
        error: null,
      });
    signUp.mockResolvedValue({
      data: { session: null, user: { id: "user-1" } },
      error: null,
    });

    render(
      <LocalDevLoginPanel
        nextPath="/recipe/recipe-1"
        onStarted={onStarted}
        pendingAction={pendingAction}
      />,
    );

    await user.click(screen.getByRole("button", { name: "로컬 테스트 계정으로 시작" }));

    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledTimes(2);
    });
    expect(signUp).toHaveBeenCalledWith({
      email: "local-tester@homecook.local",
      password: "homecook-local-dev",
      options: {
        data: {
          nickname: "로컬 테스트 계정",
        },
      },
    });
    expect(savePendingAction).toHaveBeenCalledWith(pendingAction);
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/recipe/recipe-1");
  });
});
