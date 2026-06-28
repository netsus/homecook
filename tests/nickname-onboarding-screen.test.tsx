// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NicknameOnboardingScreen } from "@/components/auth/nickname-onboarding-screen";
import { ONBOARDING_TUTORIAL_REFRESH_KEY } from "@/lib/gamification-events";

const fetchUserProfile = vi.fn();
const updateNickname = vi.fn();
const navigationMocks = vi.hoisted(() => {
  const replace = vi.fn();

  return {
    replace,
    router: { replace },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => navigationMocks.router,
}));

vi.mock("@/lib/api/mypage", () => ({
  fetchUserProfile: (...args: unknown[]) => fetchUserProfile(...args),
  isMypageApiError: (error: unknown) =>
    error instanceof Error && "status" in error,
  updateNickname: (...args: unknown[]) => updateNickname(...args),
}));

function installMatchMedia(webView = false) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: webView && query === "(min-width: 1024px)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

const EMPTY_PROFILE = {
  id: "user-1",
  nickname: "",
  email: "user@example.com",
  profile_image_url: null,
  social_provider: "google" as const,
  settings: { screen_wake_lock: false },
};

describe("nickname onboarding screen", () => {
  beforeEach(() => {
    fetchUserProfile.mockReset();
    updateNickname.mockReset();
    navigationMocks.replace.mockReset();
    window.sessionStorage.clear();
    installMatchMedia(false);
  });

  afterEach(() => {
    cleanup();
  });

  it("uses a quiet skeleton while checking the signed-in profile", () => {
    fetchUserProfile.mockImplementation(() => new Promise(() => undefined));

    render(<NicknameOnboardingScreen nextPath="/planner" />);

    expect(screen.getByTestId("nickname-onboarding-skeleton")).toBeTruthy();
    expect(screen.queryByText("내 정보를 확인하고 있어요")).toBeNull();
  });

  it("collects a nickname for a newly signed-in user and returns to the saved next path", async () => {
    const user = userEvent.setup();
    fetchUserProfile.mockResolvedValue(EMPTY_PROFILE);
    updateNickname.mockResolvedValue({
      ...EMPTY_PROFILE,
      nickname: "집밥러",
    });

    render(<NicknameOnboardingScreen nextPath="/planner" />);

    expect(await screen.findByRole("heading", { name: "닉네임을 정해 주세요" })).toBeTruthy();
    const description = screen.getByTestId("nickname-onboarding-description");
    const descriptionLines = Array.from(description.querySelectorAll("span")).map(
      (line) => line.textContent,
    );
    expect(descriptionLines).toEqual([
      "레시피와 플래너에서 사용할 이름이에요.",
      "나중에 마이페이지에서 바꿀 수 있어요.",
    ]);

    fireEvent.change(screen.getByLabelText("닉네임"), {
      target: { value: "  집밥러  " },
    });
    await user.click(screen.getByRole("button", { name: "시작하기" }));

    await waitFor(() => {
      expect(updateNickname).toHaveBeenCalledWith("집밥러");
    });
    expect(window.sessionStorage.getItem(ONBOARDING_TUTORIAL_REFRESH_KEY)).toBe("pending");
    expect(navigationMocks.replace).toHaveBeenCalledWith("/planner");
  });

  it("blocks nickname submission until the value is at least two characters", async () => {
    const user = userEvent.setup();
    fetchUserProfile.mockResolvedValue(EMPTY_PROFILE);

    render(<NicknameOnboardingScreen nextPath="/planner" />);

    await screen.findByRole("heading", { name: "닉네임을 정해 주세요" });
    fireEvent.change(screen.getByLabelText("닉네임"), {
      target: { value: "김" },
    });
    await user.click(screen.getByRole("button", { name: "시작하기" }));

    expect(updateNickname).not.toHaveBeenCalled();
    expect(await screen.findByText("닉네임은 2~30자로 입력해 주세요.")).toBeTruthy();
  });

  it("skips onboarding when the profile already has a nickname", async () => {
    fetchUserProfile.mockResolvedValue({
      ...EMPTY_PROFILE,
      nickname: "집밥러",
    });

    render(<NicknameOnboardingScreen nextPath="/planner" />);

    await waitFor(() => {
      expect(navigationMocks.replace).toHaveBeenCalledWith("/planner");
    });
    expect(screen.queryByRole("heading", { name: "닉네임을 정해 주세요" })).toBeNull();
  });
});
