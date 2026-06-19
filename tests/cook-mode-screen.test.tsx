// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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

function buildPrototypeCookModeData(
  overrides: Partial<CookingSessionCookModeData> = {},
): CookingSessionCookModeData {
  return buildCookModeData({
    session_id: "session-1",
    recipe: {
      id: "recipe-1",
      title: "돼지고기 김치찌개",
      cooking_servings: 3,
      ingredients: [
        buildIngredient({
          ingredient_id: "ing-kimchi",
          standard_name: "배추김치",
          amount: 300,
          unit: "g",
          display_text: "배추김치 300g",
          component_label: "찌개",
        }),
        buildIngredient({
          ingredient_id: "ing-pork",
          standard_name: "돼지고기",
          amount: 250,
          unit: "g",
          display_text: "돼지고기 250g",
          component_label: "찌개",
        }),
        buildIngredient({
          ingredient_id: "ing-onion",
          standard_name: "양파",
          amount: 0.5,
          unit: "개",
          display_text: "양파 0.5개",
          component_label: "찌개",
        }),
        buildIngredient({
          ingredient_id: "ing-water",
          standard_name: "물",
          amount: 650,
          unit: "ml",
          display_text: "물 650ml",
          component_label: "국물",
        }),
      ],
      steps: [
        buildStep({
          step_number: 1,
          instruction: "김치와 양파를 한입 크기로 썰어주세요.",
          component_label: "재료 손질",
          cooking_method: { code: "prep", label: "준비", color_key: "green" },
          duration_seconds: 120,
          duration_text: "2분",
          ingredients_used: [
            {
              ingredient_id: "ing-kimchi",
              amount: 300,
              unit: "g",
              cut_size: "한입 크기",
            },
            {
              ingredient_id: "ing-onion",
              amount: 0.5,
              unit: "개",
              cut_size: "채썰기",
            },
          ],
        }),
        buildStep({
          step_number: 2,
          instruction: "냄비에 고기와 김치를 넣고 중불에서 충분히 볶아주세요.",
          component_label: "고기 볶기",
          cooking_method: { code: "stir_fry", label: "볶기", color_key: "orange" },
          heat_level: "medium",
          duration_seconds: 300,
          duration_text: "5분",
          ingredients_used: [
            {
              ingredient_id: "ing-pork",
              amount: 250,
              unit: "g",
              cut_size: "먼저 넣기",
            },
            {
              ingredient_id: "ing-kimchi",
              amount: 300,
              unit: "g",
              cut_size: "같이 볶기",
            },
          ],
        }),
        buildStep({
          step_number: 3,
          instruction: "물을 붓고 끓어오르면 간을 맞춰주세요.",
          component_label: "국물 내기",
          cooking_method: { code: "boil", label: "끓이기", color_key: "red" },
          heat_level: "high",
          duration_seconds: 720,
          duration_text: "12분",
          ingredients_used: [
            {
              ingredient_id: "ing-water",
              amount: 650,
              unit: "ml",
              cut_size: "한 번에",
            },
          ],
        }),
      ],
    },
    ...overrides,
  });
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
    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams({
        returnTo: "/planner/2026-04-18/column-1?slot=%EC%95%84%EC%B9%A8",
      }),
    );
    fetchCookMode.mockResolvedValue(buildCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cook-mode-title")).toBeTruthy();
    });

    expect(screen.getByRole("heading", { name: "요리모드" })).toBeTruthy();
    expect(screen.getByText("김치찌개")).toBeTruthy();
    expect(screen.getByText("2인분")).toBeTruthy();
    expect(screen.getByText("4/18 아침")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "전체 재료" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "전체 조리순서" }),
    ).toBeTruthy();
    const firstIngredient = screen.getAllByTestId("ingredient-item")[0]!;
    expect(within(firstIngredient).getByText("양파")).toBeTruthy();
    expect(within(firstIngredient).getByText("1개")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "소진된 재료" })).toBeNull();
    expect(screen.queryByText("장보기 완료")).toBeNull();
    expect(screen.queryByText("플래너 끼니")).toBeNull();
    expect(screen.queryByText("차감할 재료")).toBeNull();
    expect(screen.getByRole("button", { name: "요리 완료" })).toBeTruthy();
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

  it("does not bounce back to planner when a previous session left completed state behind", async () => {
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
    expect(mockRouterPush).not.toHaveBeenCalledWith("/planner");

    await waitFor(() => {
      expect(screen.getByTestId("cook-mode-title")).toBeTruthy();
    });
  });

  it("renders the desktop whole-board with all ingredients and all steps", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildPrototypeCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    const wholeBoard = await screen.findByTestId("cook-mode-whole-board");
    const ingredientList = screen.getByTestId("ingredient-list");
    const stepList = screen.getByTestId("step-list");

    expect(screen.getByRole("heading", { name: "전체 재료" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "전체 조리순서" })).toBeTruthy();
    expect(screen.getAllByText("집밥")).toHaveLength(1);
    expect(within(ingredientList).getByText("배추김치")).toBeTruthy();
    expect(within(ingredientList).getByText("300g")).toBeTruthy();
    expect(within(ingredientList).getByText("돼지고기")).toBeTruthy();
    expect(within(ingredientList).getByText("250g")).toBeTruthy();
    expect(within(stepList).getByText("재료 손질")).toBeTruthy();
    expect(within(stepList).getByText("고기 볶기")).toBeTruthy();
    expect(within(stepList).getByText("국물 내기")).toBeTruthy();
    expect(within(stepList).getByTestId("cook-mode-step-number-1")).toBeTruthy();
    expect(within(stepList).getByTestId("cook-mode-step-number-2")).toBeTruthy();
    expect(within(stepList).getByTestId("cook-mode-step-number-3")).toBeTruthy();
    expect(within(stepList).getByTestId("cook-mode-step-copy-1").textContent).toBe(
      "김치와 양파를 한입 크기로 썰어주세요.",
    );
    expect(within(stepList).getByTestId("cook-mode-step-copy-2").textContent).toBe(
      "냄비에 고기와 김치를 넣고 중불에서 충분히 볶아주세요.",
    );
    expect(within(wholeBoard).queryByText(/STEP/i)).toBeNull();
    expect(screen.queryByTestId("cook-mode-current-step")).toBeNull();
    expect(screen.queryByTestId("cook-mode-current-amount-board")).toBeNull();
    expect(screen.queryByTestId("cook-mode-prev-step")).toBeNull();
    expect(screen.queryByTestId("cook-mode-next-step")).toBeNull();
    expect(screen.queryByText("10분")).not.toBeTruthy();
    expect(screen.queryByTestId("cook-mode-tabs")).not.toBeTruthy();
  });

  it("shows all ingredients even when step usage data is empty", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(
      buildCookModeData({
        recipe: {
          ...buildCookModeData().recipe,
          ingredients: [
            buildIngredient({
              ingredient_id: "ing-onion",
              standard_name: "양파",
              display_text: "양파 1개",
            }),
            buildIngredient({
              ingredient_id: "ing-kimchi",
              standard_name: "김치",
              display_text: "김치 200g",
            }),
            buildIngredient({
              ingredient_id: "ing-salt",
              standard_name: "소금",
              amount: null,
              unit: null,
              display_text: "소금 약간",
              ingredient_type: "TO_TASTE",
            }),
          ],
          steps: [
            buildStep({
              step_number: 1,
              instruction: "김치를 냄비에 넣고 중불에서 볶아주세요.",
              ingredients_used: [],
            }),
          ],
        },
      }),
    );

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    const ingredientList = await screen.findByTestId("ingredient-list");

    expect(within(ingredientList).getByText("김치")).toBeTruthy();
    expect(within(ingredientList).getByText("양파")).toBeTruthy();
    expect(within(ingredientList).getByText("소금")).toBeTruthy();
    expect(within(ingredientList).getByText("적당량")).toBeTruthy();
    expect(screen.queryByTestId("cook-mode-current-amount-board")).toBeNull();
  });

  it("keeps component sections while showing the full ingredient board", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(
      buildCookModeData({
        recipe: {
          ...buildCookModeData().recipe,
          title: "딸기 우유 푸딩과 딸기 콩포트를 같이 만드는 아주 긴 레시피",
          ingredients: [
            buildIngredient({
              ingredient_id: "ing-pudding-strawberry",
              standard_name: "딸기",
              amount: 270,
              unit: "g",
              display_text: "딸기 우유 푸딩 딸기 270g",
              component_label: "딸기 우유 푸딩",
            }),
            buildIngredient({
              ingredient_id: "ing-pudding-sugar",
              standard_name: "설탕",
              amount: 75,
              unit: "g",
              display_text: "딸기 우유 푸딩 설탕 75g",
              component_label: "딸기 우유 푸딩",
            }),
            buildIngredient({
              ingredient_id: "ing-pudding-salt",
              standard_name: "소금",
              amount: 1,
              unit: "g",
              display_text: "딸기 우유 푸딩 소금 1g",
              component_label: "딸기 우유 푸딩",
            }),
            buildIngredient({
              ingredient_id: "ing-pudding-starch",
              standard_name: "옥수수전분",
              amount: 60,
              unit: "g",
              display_text: "딸기 우유 푸딩 옥수수전분 60g",
              component_label: "딸기 우유 푸딩",
            }),
            buildIngredient({
              ingredient_id: "ing-compote-strawberry",
              standard_name: "딸기",
              amount: 230,
              unit: "g",
              display_text: "딸기 콩포트 딸기 230g",
              component_label: "딸기 콩포트",
            }),
            buildIngredient({
              ingredient_id: "ing-compote-sugar",
              standard_name: "설탕",
              amount: 45,
              unit: "g",
              display_text: "딸기 콩포트 설탕 45g",
              component_label: "딸기 콩포트",
            }),
            buildIngredient({
              ingredient_id: "ing-compote-starch",
              standard_name: "옥수수전분",
              amount: 3,
              unit: "g",
              display_text: "딸기 콩포트 옥수수전분 3g",
              component_label: "딸기 콩포트",
            }),
          ],
          steps: [
            buildStep({
              step_number: 1,
              instruction:
                "설탕과 소금, 옥수수전분을 넣고 완전히 섞은 다음 중약불에 올려 끓여 주세요.",
              component_label: "딸기 우유 푸딩",
              cooking_method: { code: "boil", label: "끓이기", color_key: "red" },
              ingredients_used: [
                { ingredient_id: "ing-pudding-strawberry", amount: 270, unit: "g" },
                { ingredient_id: "ing-pudding-sugar", amount: 75, unit: "g" },
                { ingredient_id: "ing-pudding-salt", amount: 1, unit: "g" },
                { ingredient_id: "ing-pudding-starch", amount: 60, unit: "g" },
                { ingredient_id: "ing-compote-strawberry", amount: 230, unit: "g" },
                { ingredient_id: "ing-compote-sugar", amount: 45, unit: "g" },
                { ingredient_id: "ing-compote-starch", amount: 3, unit: "g" },
              ],
            }),
          ],
        },
      }),
    );

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    const ingredientList = await screen.findByTestId("ingredient-list");
    const stepList = screen.getByTestId("step-list");

    expect(within(ingredientList).getByText("딸기 우유 푸딩")).toBeTruthy();
    expect(within(ingredientList).getByText("딸기 콩포트")).toBeTruthy();
    expect(within(ingredientList).getByText("270g")).toBeTruthy();
    expect(within(ingredientList).getByText("75g")).toBeTruthy();
    expect(within(ingredientList).getByText("1g")).toBeTruthy();
    expect(within(ingredientList).getByText("60g")).toBeTruthy();
    expect(within(ingredientList).getByText("230g")).toBeTruthy();
    expect(within(ingredientList).getByText("45g")).toBeTruthy();
    expect(within(ingredientList).getByText("3g")).toBeTruthy();
    expect(within(stepList).getByText("딸기 우유 푸딩")).toBeTruthy();
    expect(screen.queryByTestId("cook-mode-current-amount-board")).toBeNull();
  });

  it("renders the mobile prototype as a whole-board without step navigation", async () => {
    installMatchMedia(true);
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildPrototypeCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    const wholeBoard = await screen.findByTestId("cook-mode-whole-board");
    const layoutShell = screen.getByTestId("cook-mode-screen")
      .firstElementChild as HTMLElement;
    const ingredientList = screen.getByTestId("ingredient-list");
    const stepList = screen.getByTestId("step-list");

    expect(screen.queryByTestId("mobile-ingredient-summary")).toBeNull();
    expect(layoutShell.className).toContain("h-dvh");
    expect(layoutShell.className).toContain("pb-[92px]");
    expect(screen.getByTestId("cook-mode-content").firstElementChild).toBe(wholeBoard);
    expect(screen.getByTestId("cook-mode-servings").textContent).toContain(
      "3인분",
    );
    expect(screen.queryByText("3단계 중")).toBeNull();
    expect(within(ingredientList).getByText("배추김치")).toBeTruthy();
    expect(within(ingredientList).getByText("300g")).toBeTruthy();
    expect(within(stepList).getByText("재료 손질")).toBeTruthy();
    expect(within(stepList).getByText("고기 볶기")).toBeTruthy();
    expect(within(stepList).getByText("국물 내기")).toBeTruthy();
    expect(within(stepList).getByTestId("cook-mode-step-copy-1").textContent).toBe(
      "김치와 양파를 한입 크기로 썰어주세요.",
    );
    expect(within(stepList).getByTestId("cook-mode-step-copy-2").textContent).toBe(
      "냄비에 고기와 김치를 넣고 중불에서 충분히 볶아주세요.",
    );
    expect(screen.queryByTestId("cook-mode-current-step")).toBeNull();
    expect(screen.queryByTestId("cook-mode-current-amount-board")).toBeNull();
    expect(screen.queryByTestId("cook-mode-next-step")).toBeNull();
  });

  it("defaults mobile cook mode to the service dark cooking board", async () => {
    installMatchMedia(true);
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await screen.findByTestId("cook-mode-whole-board");
    const screenRoot = screen.getByTestId("cook-mode-screen");
    expect(screenRoot.getAttribute("data-cook-theme")).toBe("dark");
    expect(screen.queryByTestId("cook-mode-theme-toggle")).toBeNull();
  });

  it("defaults desktop cook mode to the service dark cooking board", async () => {
    installMatchMedia(false);
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await screen.findByTestId("cook-mode-whole-board");
    const screenRoot = screen.getByTestId("cook-mode-screen");
    expect(screenRoot.getAttribute("data-cook-theme")).toBe("dark");
    expect(screen.queryByTestId("cook-mode-theme-toggle")).toBeNull();
  });

  it("uses numeric mobile step number boxes without the duplicated STEP label", async () => {
    installMatchMedia(true);
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildPrototypeCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    const stepList = await screen.findByTestId("step-list");

    expect(within(stepList).queryByText(/STEP/i)).toBeNull();
    expect(within(stepList).getByTestId("cook-mode-step-number-1")).toBeTruthy();
    expect(within(stepList).getByTestId("cook-mode-step-number-2")).toBeTruthy();
    expect(within(stepList).getByTestId("cook-mode-step-number-3")).toBeTruthy();
  });

  it("keeps component labels as mobile whole-board section headings", async () => {
    installMatchMedia(true);
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(
      buildCookModeData({
        recipe: {
          ...buildCookModeData().recipe,
          ingredients: [
            buildIngredient({
              ingredient_id: "ing-bread-flour",
              standard_name: "강력분",
              display_text: "강력분 170g",
              component_label: "빵 반죽",
            }),
            buildIngredient({
              ingredient_id: "ing-sugar",
              standard_name: "설탕",
              display_text: "설탕 15g",
              component_label: "빵 반죽",
            }),
            buildIngredient({
              ingredient_id: "ing-yolk",
              standard_name: "달걀노른자",
              display_text: "달걀노른자 2개",
              component_label: "커스터드 크림",
            }),
          ],
          steps: [
            buildStep({
              step_number: 1,
              instruction: "밀가루와 설탕을 섞어 주세요.",
              component_label: "빵 반죽",
              ingredients_used: [
                { ingredient_id: "ing-bread-flour", amount: 170, unit: "g" },
                { ingredient_id: "ing-sugar", amount: 15, unit: "g" },
              ],
            }),
            buildStep({
              step_number: 2,
              instruction: "노른자와 설탕을 섞어 주세요.",
              component_label: "커스터드 크림",
              ingredients_used: [
                { ingredient_id: "ing-yolk", amount: 2, unit: "개" },
              ],
            }),
          ],
        },
      }),
    );

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    const ingredientList = await screen.findByTestId("ingredient-list");
    const stepList = screen.getByTestId("step-list");

    expect(within(ingredientList).getByText("빵 반죽")).toBeTruthy();
    expect(within(ingredientList).getByText("커스터드 크림")).toBeTruthy();
    expect(within(stepList).getByText("빵 반죽")).toBeTruthy();
    expect(within(stepList).getByText("커스터드 크림")).toBeTruthy();
    expect(within(ingredientList).getByText("강력분")).toBeTruthy();
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
    const methodBadgeStyle = screen
      .getAllByText("볶기")
      .find((element) =>
        element.getAttribute("style")?.includes("var(--cook-stir)"),
      )
      ?.getAttribute("style");

    expect(stepItemStyle).toBeNull();
    expect(methodBadgeStyle).toContain("var(--cook-stir)");
  });

  it("shows desktop ingredients before steps and opens the consumed ingredient sheet on complete", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("ingredient-list")).toBeTruthy();
    });

    const content = screen.getByTestId("cook-mode-content");
    const orderedSections = Array.from(
      content.querySelectorAll(
        '[data-testid="ingredient-list"], [data-testid="step-list"]',
      ),
    ).map((element) => element.getAttribute("data-testid"));

    expect(orderedSections).toEqual(["ingredient-list", "step-list"]);
    expect(screen.queryByTestId("consumed-check-ing-1")).toBeNull();
    expect(screen.queryByTestId("consumed-ingredient-sheet")).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("complete-button"));

    expect(await screen.findByTestId("consumed-ingredient-sheet")).toBeTruthy();
  });

  it("opens the desktop consumed sheet and sends checked ingredient ids on confirm", async () => {
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
    await user.click(screen.getByTestId("complete-button"));
    await screen.findByTestId("consumed-ingredient-sheet");
    await user.click(screen.getByTestId("consumed-check-ing-2"));
    await user.click(screen.getByTestId("consumed-check-ing-3"));
    await user.click(screen.getByTestId("consumed-confirm-button"));

    await waitFor(() => {
      expect(completeCookingSession).toHaveBeenCalledWith("session-1", {
        consumed_ingredient_ids: ["ing-1"],
      });
    });
  });

  it("toggles all consumed ingredients at once and keeps the selected count in sync", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());
    completeCookingSession.mockResolvedValue({
      session_id: "session-1",
      status: "completed",
      meals_updated: 1,
      leftover_dish_id: "session-1",
      pantry_removed: 3,
      cook_count: 1,
    });

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("complete-button")).toBeTruthy();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("complete-button"));
    await screen.findByTestId("consumed-ingredient-sheet");

    const bulkToggle = screen.getByTestId("consumed-bulk-toggle");
    expect(bulkToggle.textContent).toContain("전체 해제");
    expect(bulkToggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("consumed-selection-summary").textContent).toBe(
      "3개 선택됨",
    );
    expect(screen.getByTestId("consumed-confirm-button").textContent).toBe(
      "확인 (3개)",
    );

    await user.click(bulkToggle);

    expect(bulkToggle.textContent).toContain("전체 선택");
    expect(bulkToggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId("consumed-selection-summary").textContent).toBe(
      "0개 선택됨",
    );
    expect(screen.getByTestId("consumed-confirm-button").textContent).toBe(
      "확인 (0개)",
    );

    await user.click(screen.getByTestId("consumed-check-ing-1"));

    expect(bulkToggle.textContent).toContain("전체 선택");
    expect(bulkToggle.getAttribute("aria-checked")).toBe("mixed");
    expect(screen.getByTestId("consumed-selection-summary").textContent).toBe(
      "1개 선택됨",
    );

    await user.click(bulkToggle);
    await user.click(screen.getByTestId("consumed-confirm-button"));

    await waitFor(() => {
      expect(completeCookingSession).toHaveBeenCalledWith("session-1", {
        consumed_ingredient_ids: ["ing-1", "ing-2", "ing-3"],
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
    await user.click(screen.getByTestId("complete-button"));
    await screen.findByTestId("consumed-ingredient-sheet");
    await user.click(screen.getByTestId("consumed-check-ing-1"));
    await user.click(screen.getByTestId("consumed-check-ing-2"));
    await user.click(screen.getByTestId("consumed-check-ing-3"));
    await user.click(screen.getByTestId("consumed-confirm-button"));

    await waitFor(() => {
      expect(completeCookingSession).toHaveBeenCalledWith("session-1", {
        consumed_ingredient_ids: [],
      });
    });
  });

  it("navigates to planner fallback after successful completion", async () => {
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
    await screen.findByTestId("consumed-ingredient-sheet");
    await user.click(screen.getByTestId("consumed-confirm-button"));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/planner");
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
    await screen.findByTestId("consumed-ingredient-sheet");
    await user.click(screen.getByTestId("consumed-confirm-button"));

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
      expect(mockRouterPush).toHaveBeenCalledWith("/planner");
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

    expect(within(screen.getByTestId("ingredient-list")).getByText("적당량")).toBeTruthy();
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
    await screen.findByTestId("consumed-ingredient-sheet");
    await user.click(screen.getByTestId("consumed-confirm-button"));

    // Should transition to error state with conflict message
    await waitFor(() => {
      expect(screen.getByText("다시 시도")).toBeTruthy();
    });

    expect(screen.getByText("이미 취소된 세션입니다.")).toBeTruthy();
    expect(screen.getByText("플래너로 돌아가기")).toBeTruthy();
    // Should NOT navigate away
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("renders the whole-board without step navigation, timer, memo, or tab controls", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildPrototypeCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cook-mode-content")).toBeTruthy();
    });

    expect(screen.getByTestId("ingredient-list")).toBeTruthy();
    expect(screen.getByTestId("step-list")).toBeTruthy();
    expect(screen.queryByTestId("cook-mode-prev-step")).toBeNull();
    expect(screen.queryByTestId("cook-mode-next-step")).toBeNull();
    expect(screen.queryByTestId("cook-mode-current-step")).toBeNull();
    expect(screen.queryByTestId("cook-mode-current-amount-board")).toBeNull();
    expect(screen.queryByText(/타이머|메모|일시정지/)).not.toBeTruthy();
    expect(screen.queryByTestId("tab-steps")).not.toBeTruthy();
    expect(screen.queryByTestId("tab-ingredients")).not.toBeTruthy();
  });

  it("keeps desktop cancel and complete available in the whole-board header", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cancel-button")).toBeTruthy();
    });

    const cancelButton = screen.getByTestId("cancel-button");
    const completeButton = screen.getByTestId("complete-button");
    const content = screen.getByTestId("cook-mode-content");

    expect(cancelButton.textContent).toBe("취소");
    expect(completeButton.textContent).toBe("요리 완료");
    expect(content.contains(cancelButton)).toBe(true);
    expect(content.contains(completeButton)).toBe(true);
    expect(screen.queryByTestId("cook-mode-step-nav")).toBeNull();
  });

  it("removes per-step ingredient helper notes and method-colored copy borders", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildPrototypeCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    const stepCopy = (await screen.findAllByTestId("step-item"))[0]!;

    expect(screen.queryByText(/총량은 왼쪽에서 고정/)).toBeNull();
    expect(stepCopy.className).toContain("cook-whole-step");
    expect(stepCopy.getAttribute("style") ?? "").not.toContain("border-color");
    expect(screen.queryByTestId("cook-mode-current-amount-board")).toBeNull();
  });

  it("emphasizes ingredients inside step instructions without adding helper notes", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(
      buildCookModeData({
        recipe: {
          ...buildCookModeData().recipe,
          ingredients: [
            buildIngredient({ ingredient_id: "ing-onion", standard_name: "양파" }),
            buildIngredient({ ingredient_id: "ing-kimchi", standard_name: "김치" }),
          ],
          steps: [
            buildStep({
              step_number: 1,
              instruction: "양파와 김치를 넣고 볶아주세요.",
              ingredients_used: [
                { ingredient_id: "ing-onion", amount: 1, unit: "개" },
                { ingredient_id: "ing-kimchi", amount: 200, unit: "g" },
              ],
            }),
            buildStep({
              step_number: 2,
              instruction: "충분히 끓여주세요.",
              ingredients_used: [],
            }),
          ],
        },
      }),
    );

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    const firstStepCopy = await screen.findByTestId("cook-mode-step-copy-1");
    const secondStepCopy = screen.getByTestId("cook-mode-step-copy-2");
    const highlights = within(firstStepCopy).getAllByTestId(
      "cook-mode-step-ingredient-highlight",
    );

    expect(highlights.map((highlight) => highlight.textContent)).toEqual([
      "양파",
      "김치",
    ]);
    expect(highlights.every((highlight) => highlight.tagName === "STRONG")).toBe(
      true,
    );
    expect(secondStepCopy.querySelectorAll(".cook-whole-step-ingredient")).toHaveLength(
      0,
    );
    expect(screen.queryByText(/총량은 왼쪽에서 고정/)).toBeNull();
    expect(firstStepCopy.textContent).not.toMatch(/200g|1개/);
  });

  it("keeps component labels in the desktop whole-board sections", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(
      buildCookModeData({
        recipe: {
          ...buildCookModeData().recipe,
          ingredients: [
            buildIngredient({
              ingredient_id: "ing-bread-flour",
              standard_name: "강력분",
              component_label: "빵 반죽",
            }),
            buildIngredient({
              ingredient_id: "ing-yolk",
              standard_name: "달걀노른자",
              component_label: "커스터드 크림",
            }),
          ],
          steps: [
            buildStep({
              step_number: 1,
              instruction: "반죽을 만들어 주세요.",
              component_label: "빵 반죽",
              ingredients_used: [
                { ingredient_id: "ing-bread-flour", amount: 170, unit: "g" },
              ],
            }),
            buildStep({
              step_number: 2,
              instruction: "커스터드를 만들어 주세요.",
              component_label: "커스터드 크림",
              ingredients_used: [
                { ingredient_id: "ing-yolk", amount: 2, unit: "개" },
              ],
            }),
          ],
        },
      }),
    );

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    const ingredientList = await screen.findByTestId("ingredient-list");
    const stepList = screen.getByTestId("step-list");

    expect(within(ingredientList).getByText("빵 반죽")).toBeTruthy();
    expect(within(ingredientList).getByText("커스터드 크림")).toBeTruthy();
    expect(within(stepList).getByText("빵 반죽")).toBeTruthy();
    expect(within(stepList).getByText("커스터드 크림")).toBeTruthy();
    expect(screen.queryByTestId("cook-mode-timeline-step-2")).toBeNull();
  });

  it("keeps mobile cancel and complete in the fixed bottom bar without step controls", async () => {
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
    const fixedBottomBar = completeButton.closest(".fixed");

    expect(cancelButton.textContent).toBe("취소");
    expect(fixedBottomBar).not.toBeNull();
    expect(fixedBottomBar?.contains(cancelButton)).toBe(true);
    expect(fixedBottomBar?.contains(completeButton)).toBe(true);
    expect(screen.queryByTestId("cook-mode-next-step")).toBeNull();
  });

  it("uses compact two-column mobile consumed ingredient cards without duplicate names", async () => {
    installMatchMedia(true);
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(
      buildCookModeData({
        recipe: {
          ...buildCookModeData().recipe,
          title: "정말 이름이 긴 김치찌개 레시피입니다 한 줄로 줄여야 해요",
        },
      }),
    );

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
    const recipeTitle = screen.getByTestId("consumed-sheet-recipe-title");
    const ingredientList = screen.getByTestId("consumed-ingredient-list");
    const firstIngredient = screen.getAllByTestId("consumed-ingredient-item")[0]!;
    const checkVisual = screen
      .getByTestId("consumed-check-ing-1")
      .querySelector('[aria-hidden="true"]');
    const bulkToggle = screen.getByTestId("consumed-bulk-toggle");
    const firstCheck = screen.getByTestId("consumed-check-ing-1");

    expect(helperText.className).toContain("text-[13px]");
    expect(helperText.className).toContain("font-normal");
    expect(recipeTitle.className).toContain("truncate");
    expect(bulkToggle.textContent).toContain("전체 해제");
    expect(bulkToggle.getAttribute("role")).toBe("checkbox");
    expect(bulkToggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("consumed-selection-summary").textContent).toBe(
      "3개 선택됨",
    );
    expect(firstCheck.getAttribute("role")).toBe("checkbox");
    expect(firstCheck.getAttribute("aria-checked")).toBe("true");
    expect(ingredientList.className).toContain("grid-cols-2");
    expect(within(firstIngredient).getByText("양파")).toBeTruthy();
    expect(within(firstIngredient).getByText("1개")).toBeTruthy();
    expect(firstIngredient.textContent).toBe("양파1개");
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
