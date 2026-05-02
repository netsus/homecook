// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CookReadyListScreen } from "@/components/cooking/cook-ready-list-screen";
import { resetCookingReadyStore } from "@/stores/cooking-ready-store";
import type { CookingReadyData } from "@/types/cooking";

// ── Module mocks ──────────────────────────────────────────────────────────────

const readE2EAuthOverride = vi.fn();
const fetchCookingReady = vi.fn();
const createCookingSession = vi.fn();
const isCookingApiError = vi.fn(
  (error: unknown): error is Error & { status: number; code: string } =>
    Boolean(error) &&
    typeof error === "object" &&
    "status" in (error as Record<string, unknown>) &&
    "code" in (error as Record<string, unknown>),
);
const mockRouterPush = vi.fn();

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  readE2EAuthOverride: () => readE2EAuthOverride(),
}));

vi.mock("@/lib/api/cooking", () => ({
  fetchCookingReady: (...args: unknown[]) => fetchCookingReady(...args),
  createCookingSession: (...args: unknown[]) => createCookingSession(...args),
  isCookingApiError: (error: unknown) => isCookingApiError(error),
}));

vi.mock("@/lib/supabase/env", () => ({
  hasSupabasePublicEnv: () => false,
}));

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
}));

vi.mock("@/components/auth/social-login-buttons", () => ({
  SocialLoginButtons: ({ nextPath }: { nextPath: string }) => (
    <div data-testid="social-login-buttons" data-next-path={nextPath} />
  ),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function buildReadyData(
  overrides: Partial<CookingReadyData> = {},
): CookingReadyData {
  return {
    date_range: { start: "2026-04-27", end: "2026-05-03" },
    recipes: [
      {
        recipe_id: "recipe-1",
        recipe_title: "김치찌개",
        recipe_thumbnail_url: null,
        meal_ids: ["meal-1", "meal-2"],
        total_servings: 4,
      },
      {
        recipe_id: "recipe-2",
        recipe_title: "된장찌개",
        recipe_thumbnail_url: "https://example.com/photo.jpg",
        meal_ids: ["meal-3"],
        total_servings: 2,
      },
    ],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("CookReadyListScreen", () => {
  beforeEach(() => {
    readE2EAuthOverride.mockReset();
    fetchCookingReady.mockReset();
    createCookingSession.mockReset();
    isCookingApiError.mockClear();
    mockRouterPush.mockReset();
    resetCookingReadyStore();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Auth state ────────────────────────────────────────────────────────────

  it("shows unauthorized gate when not authenticated", async () => {
    readE2EAuthOverride.mockReturnValue(false);

    render(<CookReadyListScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("social-login-buttons")).toBeTruthy();
    });
    expect(screen.getByText("이 화면은 로그인이 필요해요")).toBeTruthy();
    expect(fetchCookingReady).not.toHaveBeenCalled();
  });

  it("passes /cooking/ready as return path to SocialLoginButtons", async () => {
    readE2EAuthOverride.mockReturnValue(false);

    render(<CookReadyListScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("social-login-buttons")).toBeTruthy();
    });
    expect(
      screen.getByTestId("social-login-buttons").getAttribute("data-next-path"),
    ).toBe("/cooking/ready");
  });

  // ── Loading state ─────────────────────────────────────────────────────────

  it("shows loading skeletons while fetching", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookingReady.mockImplementation(
      () => new Promise(() => {}), // never resolves
    );

    render(<CookReadyListScreen initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cook-ready-loading")).toBeTruthy();
    });
  });

  // ── Ready state ───────────────────────────────────────────────────────────

  it("shows recipe cards when data loads successfully", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookingReady.mockResolvedValue(buildReadyData());

    render(<CookReadyListScreen initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cook-ready-recipe-list")).toBeTruthy();
    });

    expect(screen.getByText("김치찌개")).toBeTruthy();
    expect(screen.getByText("된장찌개")).toBeTruthy();
    expect(screen.getByText("4인분")).toBeTruthy();
    expect(screen.getByText("2인분")).toBeTruthy();
  });

  it("shows date range text in ready state", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookingReady.mockResolvedValue(buildReadyData());

    render(<CookReadyListScreen initialAuthenticated />);

    await waitFor(() => {
      expect(
        screen.getByText("장보기 완료된 레시피예요"),
      ).toBeTruthy();
    });
  });

  // ── Empty state ───────────────────────────────────────────────────────────

  it("shows empty state when no recipes are ready", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookingReady.mockResolvedValue(
      buildReadyData({ recipes: [] }),
    );

    render(<CookReadyListScreen initialAuthenticated />);

    await waitFor(() => {
      expect(
        screen.getByText("장보기 완료된 레시피가 없어요"),
      ).toBeTruthy();
    });
  });

  it("navigates to planner on empty state action", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookingReady.mockResolvedValue(
      buildReadyData({ recipes: [] }),
    );

    render(<CookReadyListScreen initialAuthenticated />);

    await waitFor(() => {
      expect(
        screen.getByText("플래너로 돌아가기"),
      ).toBeTruthy();
    });

    await userEvent.click(screen.getByText("플래너로 돌아가기"));

    expect(mockRouterPush).toHaveBeenCalledWith("/planner");
  });

  // ── Error state ───────────────────────────────────────────────────────────

  it("shows error state on fetch failure", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookingReady.mockRejectedValue(new Error("네트워크 오류"));

    render(<CookReadyListScreen initialAuthenticated />);

    await waitFor(() => {
      expect(
        screen.getByText("레시피를 불러오지 못했어요"),
      ).toBeTruthy();
    });
  });

  it("retries loading on error action click", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookingReady
      .mockRejectedValueOnce(new Error("네트워크 오류"))
      .mockResolvedValue(buildReadyData());

    render(<CookReadyListScreen initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByText("다시 시도")).toBeTruthy();
    });

    await userEvent.click(screen.getByText("다시 시도"));

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });
    expect(fetchCookingReady).toHaveBeenCalledTimes(2);
  });

  // ── Session creation ──────────────────────────────────────────────────────

  it("creates session and navigates to cook-mode", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookingReady.mockResolvedValue(buildReadyData());
    createCookingSession.mockResolvedValue({
      session_id: "session-abc",
      recipe_id: "recipe-1",
      status: "in_progress",
      cooking_servings: 4,
      meals: [],
    });

    render(<CookReadyListScreen initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cook-ready-recipe-list")).toBeTruthy();
    });

    const startButtons = screen.getAllByTestId("start-session-button");
    await userEvent.click(startButtons[0]);

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith(
        "/cooking/sessions/session-abc/cook-mode",
      );
    });
    expect(startButtons[0].textContent).toBe("준비 중...");
    expect((startButtons[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it("schedules a hard navigation fallback after creating a cook session", async () => {
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookingReady.mockResolvedValue(buildReadyData());
    createCookingSession.mockResolvedValue({
      session_id: "session-abc",
      recipe_id: "recipe-1",
      status: "in_progress",
      cooking_servings: 4,
      meals: [],
    });

    render(<CookReadyListScreen initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cook-ready-recipe-list")).toBeTruthy();
    });

    fireEvent.click(screen.getAllByTestId("start-session-button")[0]);

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith(
        "/cooking/sessions/session-abc/cook-mode",
      );
    });

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 250);
  });

  it("disables all start buttons while any session creation is pending", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookingReady.mockResolvedValue(buildReadyData());

    // createCookingSession stays pending forever
    createCookingSession.mockImplementation(
      () => new Promise(() => {}),
    );

    render(<CookReadyListScreen initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cook-ready-recipe-list")).toBeTruthy();
    });

    const startButtons = screen.getAllByTestId("start-session-button");
    expect(startButtons).toHaveLength(2);

    // Click the first recipe's button
    await userEvent.click(startButtons[0]);

    // Both buttons should now be disabled
    await waitFor(() => {
      const buttons = screen.getAllByTestId("start-session-button");
      for (const btn of buttons) {
        expect((btn as HTMLButtonElement).disabled).toBe(true);
      }
    });

    // The clicked button shows "준비 중...", the other still shows "요리하기"
    expect(startButtons[0].textContent).toBe("준비 중...");
    expect(startButtons[1].textContent).toBe("요리하기");

    // Only one createCookingSession call should have been made
    expect(createCookingSession).toHaveBeenCalledTimes(1);
  });

  it("synchronous ref guard prevents double-submit on rapid same-button clicks", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookingReady.mockResolvedValue(buildReadyData());

    // createCookingSession stays pending forever
    createCookingSession.mockImplementation(
      () => new Promise(() => {}),
    );

    render(<CookReadyListScreen initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cook-ready-recipe-list")).toBeTruthy();
    });

    const startButtons = screen.getAllByTestId("start-session-button");

    // Synchronous same-tick clicks should still be guarded before React rerenders.
    fireEvent.click(startButtons[0]);
    fireEvent.click(startButtons[0]);

    // Despite two clicks, only one createCookingSession call
    expect(createCookingSession).toHaveBeenCalledTimes(1);
  });

  it("shows error toast on 409 conflict and refreshes list", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookingReady.mockResolvedValue(buildReadyData());

    const conflictError = Object.assign(new Error("Conflict"), {
      status: 409,
      code: "CONFLICT",
      fields: [],
    });
    createCookingSession.mockRejectedValue(conflictError);

    render(<CookReadyListScreen initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cook-ready-recipe-list")).toBeTruthy();
    });

    const startButtons = screen.getAllByTestId("start-session-button");
    await userEvent.click(startButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("session-error-toast")).toBeTruthy();
    });
    // Should re-fetch the ready list
    expect(fetchCookingReady).toHaveBeenCalledTimes(2);
  });

  it("shows generic session error on non-409 failure", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookingReady.mockResolvedValue(buildReadyData());

    const serverError = Object.assign(new Error("Server Error"), {
      status: 500,
      code: "INTERNAL_ERROR",
      fields: [],
    });
    createCookingSession.mockRejectedValue(serverError);

    render(<CookReadyListScreen initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cook-ready-recipe-list")).toBeTruthy();
    });

    const startButtons = screen.getAllByTestId("start-session-button");
    await userEvent.click(startButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("session-error-toast")).toBeTruthy();
    });
    expect(
      screen.getByText("요리 세션을 만들지 못했어요. 다시 시도해 주세요."),
    ).toBeTruthy();
  });

  // ── 401 during session creation → unauthorized gate ───────────────────────

  it("switches to unauthorized gate on 401 during session creation", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookingReady.mockResolvedValue(buildReadyData());

    const authError = Object.assign(new Error("Unauthorized"), {
      status: 401,
      code: "UNAUTHORIZED",
      fields: [],
    });
    createCookingSession.mockRejectedValue(authError);

    render(<CookReadyListScreen initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cook-ready-recipe-list")).toBeTruthy();
    });

    const startButtons = screen.getAllByTestId("start-session-button");
    await userEvent.click(startButtons[0]);

    await waitFor(() => {
      expect(screen.getByTestId("social-login-buttons")).toBeTruthy();
    });
  });

  // ── Thumbnail rendering ───────────────────────────────────────────────────

  it("renders thumbnail image when URL is provided", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookingReady.mockResolvedValue(buildReadyData());

    render(<CookReadyListScreen initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cook-ready-recipe-list")).toBeTruthy();
    });

    // alt="" gives role="presentation", not "img"
    const images = screen.getAllByRole("presentation");
    expect(images.length).toBeGreaterThanOrEqual(1);
  });
});
