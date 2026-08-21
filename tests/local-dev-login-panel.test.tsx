// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalDevLoginPanel } from "@/components/auth/local-dev-login-panel";
import type { PendingRecipeAction } from "@/lib/auth/pending-action";

const isLocalDevAuthEnabled = vi.fn();
const getLocalDevAuthAccounts = vi.fn();
const getLocalDevAuthCredentials = vi.fn();
const hasSupabasePublicEnv = vi.fn();
const savePendingAction = vi.fn();
const signInWithPassword = vi.fn();
const signUp = vi.fn();
const bootstrapLocalDevSessionAction = vi.fn();

vi.mock("@/lib/auth/local-dev-auth", () => ({
  isLocalDevAuthEnabled: () => isLocalDevAuthEnabled(),
  getLocalDevAuthAccounts: () => getLocalDevAuthAccounts(),
  getLocalDevAuthCredentials: (accountId?: string) => getLocalDevAuthCredentials(accountId),
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

vi.mock("@/app/login/local-dev-session-bootstrap-action", () => ({
  bootstrapLocalDevSessionAction: () => bootstrapLocalDevSessionAction(),
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
    getLocalDevAuthAccounts.mockReset();
    getLocalDevAuthCredentials.mockReset();
    hasSupabasePublicEnv.mockReset();
    savePendingAction.mockReset();
    signInWithPassword.mockReset();
    signUp.mockReset();
    bootstrapLocalDevSessionAction.mockReset();

    isLocalDevAuthEnabled.mockReturnValue(true);
    getLocalDevAuthAccounts.mockReturnValue([
      {
        id: "main",
        email: "local-tester@homecook.local",
        password: "homecook-local-dev",
        nickname: "로컬 테스트 계정",
        buttonLabel: "로컬 테스트 계정으로 시작",
        helperText: "메인 계정",
      },
      {
        id: "other",
        email: "local-other@homecook.local",
        password: "homecook-local-peer",
        nickname: "로컬 다른 유저",
        buttonLabel: "다른 테스트 계정으로 시작",
        helperText: "보조 계정",
      },
    ]);
    getLocalDevAuthCredentials.mockReturnValue({
      email: "local-tester@homecook.local",
      password: "homecook-local-dev",
      nickname: "로컬 테스트 계정",
    });
    hasSupabasePublicEnv.mockReturnValue(true);
    bootstrapLocalDevSessionAction.mockResolvedValue({ ok: true });

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
    const onLocalPasswordBootstrapPendingChange = vi.fn();

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
        onLocalPasswordBootstrapPendingChange={onLocalPasswordBootstrapPendingChange}
        onStarted={onStarted}
        pendingAction={pendingAction}
      />,
    );

    await user.click(screen.getByRole("button", { name: "로컬 테스트 계정으로 시작" }));

    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledTimes(2);
    });
    expect(bootstrapLocalDevSessionAction).toHaveBeenCalledTimes(1);
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
    expect(onLocalPasswordBootstrapPendingChange).toHaveBeenCalledWith(true);
    expect(onStarted).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/recipe/recipe-1");
    expect(onLocalPasswordBootstrapPendingChange.mock.invocationCallOrder[0]).toBeLessThan(
      signInWithPassword.mock.invocationCallOrder[0],
    );
    expect(
      signInWithPassword.mock.invocationCallOrder[
        signInWithPassword.mock.invocationCallOrder.length - 1
      ],
    ).toBeLessThan(bootstrapLocalDevSessionAction.mock.invocationCallOrder[0]);
    expect(bootstrapLocalDevSessionAction.mock.invocationCallOrder[0]).toBeLessThan(
      assign.mock.invocationCallOrder[0],
    );
  });

  it("can sign in with the secondary demo account", async () => {
    const user = userEvent.setup();

    getLocalDevAuthCredentials.mockImplementation((accountId?: string) => (
      accountId === "other"
        ? {
            email: "local-other@homecook.local",
            password: "homecook-local-peer",
            nickname: "로컬 다른 유저",
          }
        : {
            email: "local-tester@homecook.local",
            password: "homecook-local-dev",
            nickname: "로컬 테스트 계정",
          }
    ));
    signInWithPassword.mockResolvedValue({
      data: { session: { access_token: "token" }, user: { id: "user-2" } },
      error: null,
    });

    render(<LocalDevLoginPanel nextPath="/planner" />);

    await user.click(screen.getByRole("button", { name: "다른 테스트 계정으로 시작" }));

    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: "local-other@homecook.local",
        password: "homecook-local-peer",
      });
    });
    expect(bootstrapLocalDevSessionAction).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/planner");
  });

  it("blocks navigation when the server bootstrap rejects the local session", async () => {
    const user = userEvent.setup();
    const onStarted = vi.fn();
    const onLocalPasswordBootstrapPendingChange = vi.fn();

    signInWithPassword.mockResolvedValue({
      data: { session: { access_token: "token" }, user: { id: "user-1" } },
      error: null,
    });
    bootstrapLocalDevSessionAction.mockResolvedValue({
      ok: false,
      message: "로컬 세션 준비를 완료하지 못했어요. 다시 로그인해 주세요.",
    });

    render(
      <LocalDevLoginPanel
        nextPath="/planner"
        onLocalPasswordBootstrapPendingChange={onLocalPasswordBootstrapPendingChange}
        onStarted={onStarted}
      />,
    );

    await user.click(screen.getByRole("button", { name: "로컬 테스트 계정으로 시작" }));

    await waitFor(() => {
      expect(bootstrapLocalDevSessionAction).toHaveBeenCalledTimes(1);
    });
    expect(assign).not.toHaveBeenCalled();
    expect(onStarted).not.toHaveBeenCalled();
    expect(onLocalPasswordBootstrapPendingChange).toHaveBeenNthCalledWith(1, true);
    expect(onLocalPasswordBootstrapPendingChange).toHaveBeenNthCalledWith(2, false);
    expect(onLocalPasswordBootstrapPendingChange.mock.invocationCallOrder[0]).toBeLessThan(
      signInWithPassword.mock.invocationCallOrder[0],
    );
    expect(bootstrapLocalDevSessionAction.mock.invocationCallOrder[0]).toBeLessThan(
      onLocalPasswordBootstrapPendingChange.mock.invocationCallOrder[1],
    );
    expect(
      screen.getByText("로컬 세션 준비를 완료하지 못했어요. 다시 로그인해 주세요."),
    ).not.toBeNull();
  });
});
