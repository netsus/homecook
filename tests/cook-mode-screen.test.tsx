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

import type {
  CookingModeIngredient,
  CookingModeStep,
  CookingSessionCookModeData,
} from "@/types/cooking";

const readE2EAuthOverride = vi.fn();
const fetchCookMode = vi.fn();
const completeCookingSession = vi.fn();
const cancelCookingSession = vi.fn();
const fetchUserProfile = vi.fn();
const isCookingApiError = vi.fn(
  (error: unknown): error is Error & { status: number; code: string } =>
    Boolean(error) &&
    typeof error === "object" &&
    "status" in (error as Record<string, unknown>) &&
    "code" in (error as Record<string, unknown>),
);
const mockRouterPush = vi.fn();
const navigationMocks = vi.hoisted(() => ({
  searchParams: vi.fn(() => new URLSearchParams()),
}));

function installMatchMedia(matchesAppView: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 1023px)" ? matchesAppView : !matchesAppView,
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

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  readE2EAuthOverride: () => readE2EAuthOverride(),
}));

vi.mock("@/lib/api/cooking", () => ({
  fetchCookMode: (...args: unknown[]) => fetchCookMode(...args),
  completeCookingSession: (...args: unknown[]) =>
    completeCookingSession(...args),
  cancelCookingSession: (...args: unknown[]) => cancelCookingSession(...args),
  isCookingApiError: (error: unknown) => isCookingApiError(error),
}));

vi.mock("@/lib/api/mypage", () => ({
  fetchUserProfile: (...args: unknown[]) => fetchUserProfile(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
  useSearchParams: () => navigationMocks.searchParams(),
}));

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: vi.fn(),
}));

vi.mock("@/lib/supabase/env", () => ({
  hasSupabasePublicEnv: () => false,
}));

function buildIngredient(
  overrides: Partial<CookingModeIngredient> = {},
): CookingModeIngredient {
  return {
    ingredient_id: "ing-1",
    standard_name: "양파",
    amount: 1,
    unit: "개",
    display_text: "양파 1개",
    ingredient_type: "QUANT",
    scalable: true,
    ...overrides,
  };
}

function buildStep(
  overrides: Partial<CookingModeStep> = {},
): CookingModeStep {
  return {
    step_number: 1,
    instruction: "양파를 썰어주세요.",
    cooking_method: { code: "stir_fry", label: "볶기", color_key: "stir_fry" },
    ingredients_used: [],
    heat_level: null,
    duration_seconds: null,
    duration_text: null,
    ...overrides,
  };
}

function buildCookModeData(
  overrides: Partial<CookingSessionCookModeData> = {},
): CookingSessionCookModeData {
  return {
    session_id: "session-1",
    recipe: {
      id: "recipe-1",
      title: "김치찌개",
      cooking_servings: 2,
      ingredients: [
        buildIngredient({ ingredient_id: "ing-1", standard_name: "양파" }),
        buildIngredient({
          ingredient_id: "ing-2",
          standard_name: "김치",
          display_text: "김치 200g",
        }),
        buildIngredient({
          ingredient_id: "ing-3",
          standard_name: "소금",
          ingredient_type: "TO_TASTE",
          display_text: null,
        }),
      ],
      steps: [
        buildStep({ step_number: 1, instruction: "양파를 썰어주세요." }),
        buildStep({
          step_number: 2,
          instruction: "김치를 넣고 볶아주세요.",
          cooking_method: { code: "boil", label: "끓이기", color_key: "boil" },
          heat_level: "medium",
          duration_seconds: 600,
          duration_text: null,
        }),
      ],
    },
    ...overrides,
  };
}

// Dynamic imports to allow mock isolation
async function importCookModeScreen() {
  const mod = await import("@/components/cooking/cook-mode-screen");
  return mod.CookModeScreen;
}

async function importResetStore() {
  const mod = await import("@/stores/cook-mode-store");
  return mod.resetCookModeStore;
}

async function importCookModeStore() {
  const mod = await import("@/stores/cook-mode-store");
  return mod.useCookModeStore;
}

describe("CookModeScreen", () => {
  beforeEach(() => {
    readE2EAuthOverride.mockReset();
    fetchCookMode.mockReset();
    completeCookingSession.mockReset();
    cancelCookingSession.mockReset();
    fetchUserProfile.mockReset();
    fetchUserProfile.mockResolvedValue({
      id: "user-1",
      nickname: "집밥러",
      email: "cook@example.com",
      profile_image_url: null,
      social_provider: "google",
      settings: { screen_wake_lock: false },
    });
    isCookingApiError.mockClear();
    mockRouterPush.mockReset();
    navigationMocks.searchParams.mockReset();
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams());
    installMatchMedia(false);
  });

  afterEach(async () => {
    const resetStore = await importResetStore();
    resetStore();
    cleanup();
    Reflect.deleteProperty(window, "matchMedia");
    Reflect.deleteProperty(navigator, "wakeLock");
  });

  it("shows unauthorized state when not authenticated", async () => {
    readE2EAuthOverride.mockReturnValue(false);

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" />);

    await waitFor(() => {
      expect(screen.getByText("로그인이 필요해요")).toBeTruthy();
    });
  });

  it("shows loading then recipe data after authentication", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cook-mode-title")).toBeTruthy();
    });

    expect(screen.getByText("김치찌개")).toBeTruthy();
    expect(screen.getByText("2인분")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "소진된 재료" })).toBeTruthy();
    expect(
      screen.getByText("체크된 재료는 팬트리에서 자동으로 빠져요."),
    ).toBeTruthy();
    expect(screen.queryByText("차감할 재료")).toBeNull();
    expect(screen.getByRole("button", { name: "✓ 요리 완료 (3개 소진)" })).toBeTruthy();
  });

  it("requests a screen wake lock in cook mode when the user setting is enabled", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchUserProfile.mockResolvedValue({
      id: "user-1",
      nickname: "집밥러",
      email: "cook@example.com",
      profile_image_url: null,
      social_provider: "google",
      settings: { screen_wake_lock: true },
    });
    fetchCookMode.mockResolvedValue(buildCookModeData());
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({
      released: false,
      release,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request },
    });

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cook-mode-title")).toBeTruthy();
    });

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith("screen");
    });
  });

  it("retries a rejected screen wake lock request after a user gesture", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchUserProfile.mockResolvedValue({
      id: "user-1",
      nickname: "집밥러",
      email: "cook@example.com",
      profile_image_url: null,
      social_provider: "google",
      settings: { screen_wake_lock: true },
    });
    fetchCookMode.mockResolvedValue(buildCookModeData());
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi
      .fn()
      .mockRejectedValueOnce(
        new DOMException("User activation required", "NotAllowedError"),
      )
      .mockResolvedValueOnce({
        released: false,
        release,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request },
    });

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cook-mode-title")).toBeTruthy();
    });
    await waitFor(() => {
      expect(request).toHaveBeenCalledTimes(1);
    });

    fireEvent.pointerDown(screen.getByTestId("cook-mode-screen"));

    await waitFor(() => {
      expect(request).toHaveBeenCalledTimes(2);
    });
  });

  it("does not bounce back to ready when a previous session left completed state behind", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(
      buildCookModeData({ session_id: "session-new" }),
    );

    const useCookModeStore = await importCookModeStore();
    useCookModeStore.setState({
      screenState: "completed",
      sessionId: "session-old",
      data: null,
      errorMessage: null,
      errorCode: null,
    });

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-new" initialAuthenticated />);

    await waitFor(() => {
      expect(fetchCookMode).toHaveBeenCalledWith("session-new");
    });
    expect(mockRouterPush).not.toHaveBeenCalledWith("/cooking/ready");

    await waitFor(() => {
      expect(screen.getByTestId("cook-mode-title")).toBeTruthy();
    });
  });

  it("shows ingredients and all steps in one scroll view", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("ingredient-list")).toBeTruthy();
    });

    expect(screen.getByText("양파")).toBeTruthy();
    expect(screen.getByText("김치")).toBeTruthy();
    expect(screen.getByText("소금")).toBeTruthy();
    expect(screen.getByText("양파를 썰어주세요.")).toBeTruthy();
    expect(screen.getByText("김치를 넣고 볶아주세요.")).toBeTruthy();
    expect(screen.getByText("중불")).toBeTruthy();
    expect(screen.queryByText("10분")).not.toBeTruthy();
    expect(screen.queryByTestId("cook-mode-tabs")).not.toBeTruthy();
  });

  it("keeps ingredients close to a single step on mobile", async () => {
    installMatchMedia(true);
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(
      buildCookModeData({
        recipe: {
          ...buildCookModeData().recipe,
          steps: [
            buildStep({
              step_number: 1,
              instruction: "양념장을 섞어주세요.",
            }),
          ],
        },
      }),
    );

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    const ingredientSummary = await screen.findByTestId(
      "mobile-ingredient-summary",
    );

    expect(ingredientSummary.className).not.toContain("mt-[520px]");
    expect(screen.getByTestId("cook-mode-servings").textContent).toBe("2인분");
    expect(screen.getByTestId("cook-mode-content").firstElementChild).toBe(
      ingredientSummary,
    );
  });

  it("places a compact ingredient summary directly before mobile steps", async () => {
    installMatchMedia(true);
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    const ingredientSummary = await screen.findByTestId(
      "mobile-ingredient-summary",
    );
    const stepList = screen.getByTestId("step-list");
    const orderedSections = Array.from(
      screen
        .getByTestId("cook-mode-content")
        .querySelectorAll(
          '[data-testid="mobile-ingredient-summary"], [data-testid="step-list"]',
        ),
    ).map((element) => element.getAttribute("data-testid"));

    expect(orderedSections).toEqual([
      "mobile-ingredient-summary",
      "step-list",
    ]);
    expect(ingredientSummary.compareDocumentPosition(stepList)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByText("김치 200g")).toBeTruthy();
    expect(screen.getByText("적당량")).toBeTruthy();
  });

  it("uses cooking method color keys from recipe data on step cards", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(
      buildCookModeData({
        recipe: {
          ...buildCookModeData().recipe,
          steps: [
            buildStep({
              cooking_method: {
                code: "stir_fry",
                label: "볶기",
                color_key: "orange",
              },
            }),
          ],
        },
      }),
    );

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("step-list")).toBeTruthy();
    });

    const stepItemStyle = screen.getByTestId("step-item").getAttribute("style");
    const methodBadgeStyle = screen.getByText("볶기").getAttribute("style");

    expect(stepItemStyle).toContain("var(--cook-stir)");
    expect(methodBadgeStyle).toContain("var(--cook-stir)");
  });

  it("renders a desktop inline consumed ingredient checklist", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("ingredient-list")).toBeTruthy();
    });

    expect(screen.getByTestId("consumed-check-ing-1")).toBeTruthy();
    expect(screen.queryByTestId("consumed-ingredient-sheet")).toBeNull();
    expect(screen.getByText("3개 중 3개 선택")).toBeTruthy();
  });

  it("sends checked desktop consumed ingredient ids on complete", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());
    completeCookingSession.mockResolvedValue({
      session_id: "session-1",
      status: "completed",
      meals_updated: 1,
      leftover_dish_id: "session-1",
      pantry_removed: 1,
      cook_count: 1,
    });

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("complete-button")).toBeTruthy();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("consumed-check-ing-2"));
    await user.click(screen.getByTestId("consumed-check-ing-3"));
    await user.click(screen.getByTestId("complete-button"));

    await waitFor(() => {
      expect(completeCookingSession).toHaveBeenCalledWith("session-1", {
        consumed_ingredient_ids: ["ing-1"],
      });
    });
  });

  it("sends empty array when all desktop ingredients are unchecked", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());
    completeCookingSession.mockResolvedValue({
      session_id: "session-1",
      status: "completed",
      meals_updated: 1,
      leftover_dish_id: "session-1",
      pantry_removed: 0,
      cook_count: 1,
    });

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("complete-button")).toBeTruthy();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("consumed-check-ing-1"));
    await user.click(screen.getByTestId("consumed-check-ing-2"));
    await user.click(screen.getByTestId("consumed-check-ing-3"));
    await user.click(screen.getByTestId("complete-button"));

    await waitFor(() => {
      expect(completeCookingSession).toHaveBeenCalledWith("session-1", {
        consumed_ingredient_ids: [],
      });
    });
  });

  it("navigates to /cooking/ready after successful completion", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());
    completeCookingSession.mockResolvedValue({
      session_id: "session-1",
      status: "completed",
      meals_updated: 1,
      leftover_dish_id: "session-1",
      pantry_removed: 0,
      cook_count: 1,
    });

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("complete-button")).toBeTruthy();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("complete-button"));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/cooking/ready");
    });
  });

  it("returns to the originating meal screen after direct meal cooking completion", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams({
        returnTo: "/planner/2026-04-18/column-1?slot=%EC%95%84%EC%B9%A8",
      }),
    );
    fetchCookMode.mockResolvedValue(buildCookModeData());
    completeCookingSession.mockResolvedValue({
      session_id: "session-1",
      status: "completed",
      meals_updated: 1,
      leftover_dish_id: "session-1",
      pantry_removed: 0,
      cook_count: 1,
    });

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("complete-button")).toBeTruthy();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("complete-button"));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith(
        "/planner/2026-04-18/column-1?slot=%EC%95%84%EC%B9%A8",
      );
    });
  });

  it("shows cancel confirmation dialog and cancels session", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());
    cancelCookingSession.mockResolvedValue({
      session_id: "session-1",
      status: "cancelled",
    });

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cancel-button")).toBeTruthy();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("cancel-button"));

    await waitFor(() => {
      expect(screen.getByTestId("cancel-confirm-overlay")).toBeTruthy();
    });

    expect(screen.getByText("요리를 취소할까요?")).toBeTruthy();

    await user.click(screen.getByTestId("cancel-confirm-yes"));

    await waitFor(() => {
      expect(cancelCookingSession).toHaveBeenCalledWith("session-1");
    });

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/cooking/ready");
    });
  });

  it("shows error state when cook mode data fails to load", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockRejectedValue(new Error("네트워크 오류"));

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByText("다시 시도")).toBeTruthy();
    });

    expect(screen.getByText("네트워크 오류")).toBeTruthy();
  });

  it("shows not-found state for 404 error", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    const error404 = Object.assign(new Error("요리 세션을 찾을 수 없어요."), {
      status: 404,
      code: "RESOURCE_NOT_FOUND",
      fields: [],
    });
    fetchCookMode.mockRejectedValue(error404);

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByText("세션을 찾을 수 없어요")).toBeTruthy();
    });
  });

  it("shows TO_TASTE ingredient with 적당량", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("ingredient-list")).toBeTruthy();
    });

    expect(screen.getByText("적당량")).toBeTruthy();
  });

  it("shows servings as read-only", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cook-mode-servings")).toBeTruthy();
    });

    expect(screen.getByTestId("cook-mode-servings").textContent).toBe("2인분");
  });

  it("shows error state when complete returns 409 conflict", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());

    const error409 = Object.assign(
      new Error("이미 취소된 세션입니다."),
      { status: 409, code: "CONFLICT", fields: [] },
    );
    completeCookingSession.mockRejectedValue(error409);

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("complete-button")).toBeTruthy();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("complete-button"));

    // Should transition to error state with conflict message
    await waitFor(() => {
      expect(screen.getByText("다시 시도")).toBeTruthy();
    });

    expect(screen.getByText("이미 취소된 세션입니다.")).toBeTruthy();
    expect(screen.getByText("요리 준비 리스트로")).toBeTruthy();
    // Should NOT navigate away
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("does not render timer or step navigation controls", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cook-mode-content")).toBeTruthy();
    });

    expect(screen.getByTestId("ingredient-list")).toBeTruthy();
    expect(screen.getByTestId("step-list")).toBeTruthy();
    expect(screen.queryByText(/타이머|메모|일시정지|이전|다음/)).not.toBeTruthy();
    expect(screen.queryByTestId("tab-steps")).not.toBeTruthy();
    expect(screen.queryByTestId("tab-ingredients")).not.toBeTruthy();
  });

  it("keeps cancel and complete buttons in the desktop action rail", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cancel-button")).toBeTruthy();
    });

    const cancelButton = screen.getByTestId("cancel-button");
    const completeButton = screen.getByTestId("complete-button");
    const actionRail = screen.getByTestId("cook-mode-action-rail");

    expect(actionRail.contains(cancelButton)).toBe(true);
    expect(actionRail.contains(completeButton)).toBe(true);
    expect(actionRail.className).toContain("web-cook-checklist-panel");
  });

  it("keeps cancel and complete buttons in the mobile fixed bottom bar", async () => {
    installMatchMedia(true);
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cancel-button")).toBeTruthy();
    });

    const cancelButton = screen.getByTestId("cancel-button");
    const completeButton = screen.getByTestId("complete-button");
    const fixedBottomBar = cancelButton.closest(".fixed");

    expect(cancelButton.textContent).toBe("나가기");
    expect(fixedBottomBar).not.toBeNull();
    expect(fixedBottomBar?.contains(completeButton)).toBe(true);
  });

  it("uses square mobile check controls and lighter helper copy in the consumed sheet", async () => {
    installMatchMedia(true);
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("complete-button")).toBeTruthy();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("complete-button"));

    await waitFor(() => {
      expect(screen.getByTestId("consumed-ingredient-sheet")).toBeTruthy();
    });

    const helperText = screen.getByText(/체크된 재료는 팬트리에서 자동으로 빠져요/);
    const checkVisual = screen
      .getByTestId("consumed-check-ing-1")
      .querySelector('[aria-hidden="true"]');

    expect(helperText.className).toContain("text-[13px]");
    expect(helperText.className).toContain("font-normal");
    expect(checkVisual?.className).toContain("rounded-[4px]");
  });

  it("does not render bottom tabs in the mobile fullscreen cook mode", async () => {
    installMatchMedia(true);
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cook-mode-content")).toBeTruthy();
    });

    expect(
      screen.queryByRole("navigation", { name: "요리모드 하단 탭" }),
    ).toBeNull();
  });

  it("uses the Wave1 white surface for cook mode loading states", async () => {
    installMatchMedia(true);
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockReturnValue(new Promise(() => {}));

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    const screenRoot = await screen.findByTestId("cook-mode-screen");
    expect(screenRoot.className).toContain("bg-[var(--wave1-surface)]");
  });

  it("keeps desktop cook-mode loading inside the web cooking shell", async () => {
    installMatchMedia(false);
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockReturnValue(new Promise(() => {}));

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    const loading = await screen.findByTestId("cook-mode-loading");
    expect(loading.closest(".web-cooking-shell")).toBeTruthy();
    expect(loading.closest(".web-cook-mode-state-card")).toBeTruthy();
  });
});
