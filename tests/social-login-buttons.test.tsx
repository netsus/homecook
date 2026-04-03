// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SocialLoginButtons } from "@/components/auth/social-login-buttons";
import { PENDING_ACTION_KEY } from "@/lib/auth/pending-action";

const signInWithOAuth = vi.fn();
const hasSupabasePublicEnv = vi.fn();
const isLocalDevAuthEnabled = vi.fn();
const isLocalGoogleOAuthEnabled = vi.fn();

vi.mock("@/components/auth/local-dev-login-panel", () => ({
  LocalDevLoginPanel: () => <div>local-dev-panel</div>,
}));

vi.mock("@/lib/auth/local-dev-auth", () => ({
  isLocalDevAuthEnabled: () => isLocalDevAuthEnabled(),
  isLocalGoogleOAuthEnabled: () => isLocalGoogleOAuthEnabled(),
}));

vi.mock("@/lib/supabase/env", () => ({
  hasSupabasePublicEnv: () => hasSupabasePublicEnv(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      signInWithOAuth,
    },
  }),
}));

describe("social login buttons", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    signInWithOAuth.mockReset();
    hasSupabasePublicEnv.mockReset();
    isLocalDevAuthEnabled.mockReset();
    isLocalGoogleOAuthEnabled.mockReset();
    window.localStorage.clear();
    isLocalDevAuthEnabled.mockReturnValue(false);
    isLocalGoogleOAuthEnabled.mockReturnValue(false);
  });

  it("shows a consistent message when public env is missing", async () => {
    hasSupabasePublicEnv.mockReturnValue(false);

    render(<SocialLoginButtons nextPath="/recipe/mock-kimchi-jjigae" />);

    await userEvent.click(screen.getByRole("button", { name: "Google로 시작하기" }));

    expect(
      await screen.findByText(
        "Supabase 공개 환경변수를 읽지 못했습니다. .env.local 작성 후 개발 서버를 다시 시작하세요.",
      ),
    ).toBeTruthy();
  });

  it("stores pending action before starting OAuth", async () => {
    hasSupabasePublicEnv.mockReturnValue(true);
    signInWithOAuth.mockResolvedValue({ error: null });

    render(
      <SocialLoginButtons
        nextPath="/recipe/mock-kimchi-jjigae"
        pendingAction={{
          type: "save",
          recipeId: "mock-kimchi-jjigae",
          redirectTo: "/recipe/mock-kimchi-jjigae",
          createdAt: 1,
        }}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Google로 시작하기" }));

    await waitFor(() => {
      expect(signInWithOAuth).toHaveBeenCalledTimes(1);
    });
    expect(window.localStorage.getItem(PENDING_ACTION_KEY)).toContain(
      '"type":"save"',
    );
  });

  it("hides external providers and explains the local Supabase override in local dev auth mode", () => {
    isLocalDevAuthEnabled.mockReturnValue(true);

    render(<SocialLoginButtons nextPath="/planner" />);

    expect(screen.queryByRole("button", { name: "Google로 시작하기" })).toBeNull();
    expect(screen.getByText("local-dev-panel")).toBeTruthy();
    expect(
      screen.getByText(/SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID/),
    ).toBeTruthy();
  });

  it("shows both Google OAuth and local demo login options when local Google OAuth is enabled", () => {
    isLocalDevAuthEnabled.mockReturnValue(true);
    isLocalGoogleOAuthEnabled.mockReturnValue(true);

    render(<SocialLoginButtons nextPath="/planner" />);

    expect(screen.getByRole("button", { name: "Google로 시작하기" })).toBeTruthy();
    expect(screen.getByText("local-dev-panel")).toBeTruthy();
    expect(
      screen.getByText(/local Supabase에서 Google OAuth와 로컬 테스트 계정을 함께 사용할 수 있어요/),
    ).toBeTruthy();
  });
});
