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
const isQaFixtureClientModeEnabled = vi.fn();

vi.mock("@/components/auth/local-dev-login-panel", () => ({
  LocalDevLoginPanel: () => <div>local-dev-panel</div>,
}));

vi.mock("@/lib/auth/local-dev-auth", () => ({
  isLocalDevAuthEnabled: () => isLocalDevAuthEnabled(),
  isLocalGoogleOAuthEnabled: () => isLocalGoogleOAuthEnabled(),
}));

vi.mock("@/lib/mock/qa-fixture-client", () => ({
  isQaFixtureClientModeEnabled: () => isQaFixtureClientModeEnabled(),
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
    isQaFixtureClientModeEnabled.mockReset();
    window.localStorage.clear();
    document.cookie = "homecook-post-auth-next=; Path=/; Max-Age=0";
    document.cookie = "homecook-auth-provider-attempt=; Path=/; Max-Age=0";
    isLocalDevAuthEnabled.mockReturnValue(false);
    isLocalGoogleOAuthEnabled.mockReturnValue(false);
    isQaFixtureClientModeEnabled.mockReturnValue(false);
  });

  it("shows a safe consistent message when public env is missing", async () => {
    hasSupabasePublicEnv.mockReturnValue(false);

    render(<SocialLoginButtons nextPath="/recipe/mock-kimchi-jjigae" />);

    await userEvent.click(screen.getByRole("button", { name: "Google로 시작하기" }));

    expect(
      await screen.findByText("로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요."),
    ).toBeTruthy();
  });

  it("does not expose a raw OAuth provider error message", async () => {
    hasSupabasePublicEnv.mockReturnValue(true);
    signInWithOAuth.mockResolvedValue({
      error: new Error("provider payload contained user@example.com and token=secret"),
    });

    render(<SocialLoginButtons nextPath="/" />);
    await userEvent.click(screen.getByRole("button", { name: "Google로 시작하기" }));

    expect(await screen.findByText("로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.")).toBeTruthy();
    expect(screen.queryByText(/user@example\.com|token=secret/)).toBeNull();
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

  it("passes the attempted provider to the OAuth callback and stores the sanitized return path in a cookie", async () => {
    hasSupabasePublicEnv.mockReturnValue(true);
    signInWithOAuth.mockResolvedValue({ error: null });

    render(<SocialLoginButtons nextPath="/planner?date=2026-06-17" />);

    await userEvent.click(screen.getByRole("button", { name: "Google로 시작하기" }));

    await waitFor(() => {
      expect(signInWithOAuth).toHaveBeenCalledTimes(1);
    });

    const redirectTo = signInWithOAuth.mock.calls[0][0].options.redirectTo;
    const callbackUrl = new URL(redirectTo);
    expect(callbackUrl.pathname).toBe("/auth/callback");
    expect(callbackUrl.searchParams.get("attemptedProvider")).toBe("google");
    expect(callbackUrl.searchParams.get("next")).toBeNull();
    expect(document.cookie).toContain(
      "homecook-post-auth-next=%2Fplanner%3Fdate%3D2026-06-17",
    );
    expect(document.cookie).toContain("homecook-auth-provider-attempt=google");
  });

  it("labels the recent provider without relying on a colored outline", () => {
    render(<SocialLoginButtons lastProvider="naver" nextPath="/" />);
    expect(screen.getByText("최근 이 브라우저에서 네이버로 로그인했어요.")).toBeTruthy();
    const recentProviderButton = screen.getByRole("button", { name: "네이버로 시작하기" });
    const recentLoginBadge = screen.getByText("최근 로그인");

    expect(recentLoginBadge.closest("button")).toBe(recentProviderButton);
    expect(recentLoginBadge.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getAllByText("최근 로그인")).toHaveLength(1);
    expect(recentProviderButton.className).not.toContain("ring-2");
    expect(recentProviderButton.querySelector(".truncate")).toBeTruthy();
  });

  it("opens confirmation before a different provider and starts no OAuth on cancel", async () => {
    hasSupabasePublicEnv.mockReturnValue(true);
    render(<SocialLoginButtons lastProvider="google" nextPath="/" />);
    const naver = screen.getByRole("button", { name: "네이버로 시작하기" });
    await userEvent.click(naver);
    expect(signInWithOAuth).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "다른 로그인 방법으로 계속할까요?" })).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(signInWithOAuth).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(naver));
  });

  it("starts Kakao login through the Supabase built-in provider", async () => {
    const originalProviders = process.env.NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS;
    const originalKakaoProvider = process.env.NEXT_PUBLIC_KAKAO_SUPABASE_PROVIDER;
    process.env.NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS = "kakao";
    delete process.env.NEXT_PUBLIC_KAKAO_SUPABASE_PROVIDER;

    try {
      hasSupabasePublicEnv.mockReturnValue(true);
      signInWithOAuth.mockResolvedValue({ error: null });

      render(<SocialLoginButtons nextPath="/mypage" />);

      await userEvent.click(screen.getByRole("button", { name: "카카오로 시작하기" }));

      await waitFor(() => {
        expect(signInWithOAuth).toHaveBeenCalledTimes(1);
      });
      expect(signInWithOAuth.mock.calls[0][0]).toMatchObject({
        provider: "kakao",
        options: {
          redirectTo: "http://localhost:3000/auth/callback?attemptedProvider=kakao",
        },
      });
    } finally {
      if (originalProviders === undefined) {
        delete process.env.NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS;
      } else {
        process.env.NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS = originalProviders;
      }

      if (originalKakaoProvider === undefined) {
        delete process.env.NEXT_PUBLIC_KAKAO_SUPABASE_PROVIDER;
      } else {
        process.env.NEXT_PUBLIC_KAKAO_SUPABASE_PROVIDER = originalKakaoProvider;
      }
    }
  });

  it("starts Naver login through the configured Supabase custom provider", async () => {
    const originalProviders = process.env.NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS;
    const originalNaverProvider = process.env.NEXT_PUBLIC_NAVER_SUPABASE_PROVIDER;
    process.env.NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS = "naver";
    delete process.env.NEXT_PUBLIC_NAVER_SUPABASE_PROVIDER;

    try {
      hasSupabasePublicEnv.mockReturnValue(true);
      signInWithOAuth.mockResolvedValue({ error: null });

      render(<SocialLoginButtons nextPath="/mypage" />);

      await userEvent.click(screen.getByRole("button", { name: "네이버로 시작하기" }));

      await waitFor(() => {
        expect(signInWithOAuth).toHaveBeenCalledTimes(1);
      });
      expect(signInWithOAuth.mock.calls[0][0]).toMatchObject({
        provider: "custom:naver",
        options: {
          redirectTo: "http://localhost:3000/auth/callback?attemptedProvider=naver",
        },
      });
    } finally {
      if (originalProviders === undefined) {
        delete process.env.NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS;
      } else {
        process.env.NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS = originalProviders;
      }

      if (originalNaverProvider === undefined) {
        delete process.env.NEXT_PUBLIC_NAVER_SUPABASE_PROVIDER;
      } else {
        process.env.NEXT_PUBLIC_NAVER_SUPABASE_PROVIDER = originalNaverProvider;
      }
    }
  });

  it("allows the Naver Supabase provider id to be overridden", async () => {
    const originalProviders = process.env.NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS;
    const originalNaverProvider = process.env.NEXT_PUBLIC_NAVER_SUPABASE_PROVIDER;
    process.env.NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS = "naver";
    process.env.NEXT_PUBLIC_NAVER_SUPABASE_PROVIDER = "custom:naver-login";

    try {
      hasSupabasePublicEnv.mockReturnValue(true);
      signInWithOAuth.mockResolvedValue({ error: null });

      render(<SocialLoginButtons nextPath="/" />);

      await userEvent.click(screen.getByRole("button", { name: "네이버로 시작하기" }));

      await waitFor(() => {
        expect(signInWithOAuth).toHaveBeenCalledTimes(1);
      });
      expect(signInWithOAuth.mock.calls[0][0].provider).toBe("custom:naver-login");
    } finally {
      if (originalProviders === undefined) {
        delete process.env.NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS;
      } else {
        process.env.NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS = originalProviders;
      }

      if (originalNaverProvider === undefined) {
        delete process.env.NEXT_PUBLIC_NAVER_SUPABASE_PROVIDER;
      } else {
        process.env.NEXT_PUBLIC_NAVER_SUPABASE_PROVIDER = originalNaverProvider;
      }
    }
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

  it("renders the Google provider with the official multicolor logo", () => {
    render(<SocialLoginButtons nextPath="/planner" />);

    expect(screen.getByRole("button", { name: "Google로 시작하기" })).toBeTruthy();
    expect(screen.getByTestId("google-provider-logo")).toBeTruthy();
    expect(screen.queryByText("G")).toBeNull();
  });

  it("keeps fixture login providers while hiding dev-only helpers", () => {
    isLocalDevAuthEnabled.mockReturnValue(true);
    isLocalGoogleOAuthEnabled.mockReturnValue(false);
    isQaFixtureClientModeEnabled.mockReturnValue(true);

    render(<SocialLoginButtons nextPath="/planner" />);

    expect(screen.getByRole("button", { name: "Google로 시작하기" })).toBeTruthy();
    expect(screen.queryByText("local-dev-panel")).toBeNull();
    expect(screen.queryByText(/현재 지원 로그인/)).toBeNull();
    expect(
      screen.queryByText(/local Supabase에서 Google OAuth와 로컬 테스트 계정을 함께 사용할 수 있어요/),
    ).toBeNull();
  });

  it("shows every configured provider when all three are enabled", () => {
    const original = process.env.NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS;
    process.env.NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS = "kakao,naver,google";

    try {
      hasSupabasePublicEnv.mockReturnValue(true);
      render(<SocialLoginButtons nextPath="/" />);

      expect(screen.getByRole("button", { name: "카카오로 시작하기" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "네이버로 시작하기" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Google로 시작하기" })).toBeTruthy();
      expect(screen.getByText(/현재 지원 로그인/).textContent).toContain("카카오로 시작하기");
    } finally {
      if (original === undefined) {
        delete process.env.NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS;
      } else {
        process.env.NEXT_PUBLIC_ENABLED_AUTH_PROVIDERS = original;
      }
    }
  });
});
