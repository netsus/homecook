// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginScreen } from "@/components/auth/login-screen";
import { WEB_VIEW_MEDIA_QUERY } from "@/components/shared/view-mode";

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

function installMatchMedia(matchesDesktop: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === WEB_VIEW_MEDIA_QUERY ? matchesDesktop : !matchesDesktop,
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
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("shows the OAuth failure banner when authError is present", () => {
    render(<LoginScreen authError="oauth_failed" />);

    expect(screen.getByText("로그인에 실패했어요. 다시 시도해주세요.")).toBeTruthy();
    expect(screen.getByText("social-buttons:/")).toBeTruthy();
  });

  it("renders the Wave1 mobile login copy by default", () => {
    render(<LoginScreen />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "이 화면은 로그인이 필요해요",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByTestId("login-brand-mark")).toBeTruthy();
    expect(screen.getByText("로그인 필요")).toBeTruthy();
    expect(screen.getAllByText("로그인 후 이전 화면으로 돌아갑니다.")).toHaveLength(1);
    expect(
      screen.queryByText("저장한 레시피, 플래너, 팬트리를 같은 계정으로 관리합니다."),
    ).toBeNull();
  });

  it("uses the provided nextPath for login actions", () => {
    render(<LoginScreen nextPath="/planner" />);

    expect(screen.getByText("social-buttons:/planner")).toBeTruthy();
  });

  it("renders the desktop web login panel at 1024px and above", () => {
    installMatchMedia(true);

    render(<LoginScreen nextPath="/planner" />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "이 화면은 로그인이 필요해요",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByTestId("login-brand-mark")).toBeTruthy();
    expect(screen.getByText("플래너 접근")).toBeTruthy();
    expect(
      screen.getAllByText("로그인 후 보던 주간 범위로 돌아와 식단을 계속 관리할 수 있어요."),
    ).toHaveLength(1);
    expect(screen.getByText("social-buttons:/planner")).toBeTruthy();
    expect(
      screen
        .getByRole("heading", { name: "이 화면은 로그인이 필요해요" })
        .closest("[data-state-kind='prototype-derived']")
        ?.getAttribute("data-state-tone"),
    ).toBe("gate");
    expect(
      screen
        .getByRole("heading", { name: "이 화면은 로그인이 필요해요" })
        .closest(".web-login-gate"),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", {
        name: "홈쿡과 함께오늘 뭐 먹지 정해봐요",
      }),
    ).toBeNull();
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
