// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginScreen } from "@/components/auth/login-screen";

const useSearchParams = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => useSearchParams(),
}));

vi.mock("@/components/auth/social-login-buttons", () => ({
  SocialLoginButtons: ({ nextPath }: { nextPath: string }) => (
    <div>social-buttons:{nextPath}</div>
  ),
}));

describe("login screen", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useSearchParams.mockReset();
    useSearchParams.mockReturnValue(new URLSearchParams());
  });

  it("shows the OAuth failure banner when authError is present", () => {
    useSearchParams.mockReturnValue(
      new URLSearchParams("authError=oauth_failed"),
    );

    render(<LoginScreen />);

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
});
