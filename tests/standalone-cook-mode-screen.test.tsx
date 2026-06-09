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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CookingModeIngredient,
  CookingModeStep,
  CookingStandaloneCookModeData,
} from "@/types/cooking";

const readE2EAuthOverride = vi.fn();
const fetchStandaloneCookMode = vi.fn();
const completeStandaloneCooking = vi.fn();
const fetchUserProfile = vi.fn();
const isCookingApiError = vi.fn(
  (error: unknown): error is Error & { status: number; code: string } =>
    Boolean(error) &&
    typeof error === "object" &&
    "status" in (error as Record<string, unknown>) &&
    "code" in (error as Record<string, unknown>),
);
const mockRouterPush = vi.fn();
const mockRouterReplace = vi.fn();
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
  fetchStandaloneCookMode: (...args: unknown[]) => fetchStandaloneCookMode(...args),
  completeStandaloneCooking: (...args: unknown[]) =>
    completeStandaloneCooking(...args),
  isCookingApiError: (error: unknown) => isCookingApiError(error),
}));

vi.mock("@/lib/api/mypage", () => ({
  fetchUserProfile: (...args: unknown[]) => fetchUserProfile(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
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

function buildStandaloneCookModeData(
  overrides: Partial<CookingStandaloneCookModeData> = {},
): CookingStandaloneCookModeData {
  return {
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
      ],
      steps: [
        buildStep(),
        buildStep({
          step_number: 2,
          instruction: "김치를 넣고 끓여주세요.",
          cooking_method: { code: "boil", label: "끓이기", color_key: "boil" },
        }),
      ],
    },
    ...overrides,
  };
}

function buildPrototypeStandaloneCookModeData(
  overrides: Partial<CookingStandaloneCookModeData> = {},
): CookingStandaloneCookModeData {
  return buildStandaloneCookModeData({
    recipe: {
      id: "recipe-1",
      title: "제육볶음",
      cooking_servings: 2,
      ingredients: [
        buildIngredient({
          ingredient_id: "ing-pork",
          standard_name: "돼지고기",
          amount: 300,
          unit: "g",
          display_text: "돼지고기 300g",
        }),
        buildIngredient({
          ingredient_id: "ing-sauce",
          standard_name: "양념장",
          amount: 3,
          unit: "큰술",
          display_text: "양념장 3큰술",
        }),
        buildIngredient({
          ingredient_id: "ing-onion",
          standard_name: "양파",
          amount: 1,
          unit: "개",
          display_text: "양파 1개",
        }),
      ],
      steps: [
        buildStep({
          step_number: 1,
          instruction: "고기와 양념장을 골고루 버무려 주세요.",
          component_label: "고기 재우기",
          cooking_method: { code: "mix", label: "무치기", color_key: "green" },
          duration_seconds: 180,
          duration_text: "3분",
          ingredients_used: [
            {
              ingredient_id: "ing-pork",
              amount: 300,
              unit: "g",
              cut_size: "한입 크기",
            },
            {
              ingredient_id: "ing-sauce",
              amount: 3,
              unit: "큰술",
              cut_size: "골고루",
            },
          ],
        }),
        buildStep({
          step_number: 2,
          instruction: "팬을 달군 뒤 양파와 고기를 센불에 볶아주세요.",
          component_label: "센불 볶기",
          cooking_method: { code: "stir_fry", label: "볶기", color_key: "orange" },
          heat_level: "high",
          duration_seconds: 300,
          duration_text: "5분",
          ingredients_used: [
            {
              ingredient_id: "ing-onion",
              amount: 1,
              unit: "개",
              cut_size: "채썰기",
            },
            {
              ingredient_id: "ing-pork",
              amount: 300,
              unit: "g",
              cut_size: "같이 볶기",
            },
          ],
        }),
      ],
    },
    ...overrides,
  });
}

async function importScreen() {
  const mod = await import("@/components/cooking/standalone-cook-mode-screen");
  return mod.StandaloneCookModeScreen;
}

async function importResetStore() {
  const mod = await import("@/stores/standalone-cook-mode-store");
  return mod.resetStandaloneCookModeStore;
}

describe("StandaloneCookModeScreen", () => {
  beforeEach(() => {
    vi.resetModules();
    readE2EAuthOverride.mockReset();
    fetchStandaloneCookMode.mockReset();
    completeStandaloneCooking.mockReset();
    fetchUserProfile.mockReset();
    fetchUserProfile.mockResolvedValue({
      id: "user-1",
      nickname: "집밥러",
      email: "cook@example.com",
      profile_image_url: null,
      social_provider: "google",
      settings: { screen_wake_lock: false },
    });
    mockRouterPush.mockReset();
    mockRouterReplace.mockReset();
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

  it("loads and displays recipe data (public, no auth needed for viewing)", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchStandaloneCookMode.mockResolvedValue(buildStandaloneCookModeData());

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    await waitFor(() => {
      expect(screen.getByTestId("standalone-cook-mode-title")).toBeTruthy();
    });

    expect(screen.getByText("김치찌개")).toBeTruthy();
    expect(screen.getByText("2인분")).toBeTruthy();
    expect(screen.getByTestId("ingredient-list")).toBeTruthy();
    expect(screen.getByTestId("step-list")).toBeTruthy();
    expect(screen.queryByTestId("standalone-cook-mode-tabs")).not.toBeTruthy();
    expect(screen.getAllByTestId("ingredient-item")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "요리모드" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "전체 재료" })).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "전체 조리순서" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "소진된 재료" })).toBeNull();
    expect(screen.queryByText("차감할 재료")).toBeNull();
  });

  it("requests a screen wake lock in standalone cook mode when the user setting is enabled", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchUserProfile.mockResolvedValue({
      id: "user-1",
      nickname: "집밥러",
      email: "cook@example.com",
      profile_image_url: null,
      social_provider: "google",
      settings: { screen_wake_lock: true },
    });
    fetchStandaloneCookMode.mockResolvedValue(buildStandaloneCookModeData());
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

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    await waitFor(() => {
      expect(screen.getByTestId("standalone-cook-mode-title")).toBeTruthy();
    });

    await waitFor(() => {
      expect(request).toHaveBeenCalledWith("screen");
    });
  });

  it("retries a rejected standalone screen wake lock request after a user gesture", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchUserProfile.mockResolvedValue({
      id: "user-1",
      nickname: "집밥러",
      email: "cook@example.com",
      profile_image_url: null,
      social_provider: "google",
      settings: { screen_wake_lock: true },
    });
    fetchStandaloneCookMode.mockResolvedValue(buildStandaloneCookModeData());
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

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    await waitFor(() => {
      expect(screen.getByTestId("standalone-cook-mode-title")).toBeTruthy();
    });
    await waitFor(() => {
      expect(request).toHaveBeenCalledTimes(1);
    });

    fireEvent.pointerDown(screen.getByTestId("standalone-cook-mode-screen"));

    await waitFor(() => {
      expect(request).toHaveBeenCalledTimes(2);
    });
  });

  it("allows unauthenticated users to view cook-mode data", async () => {
    readE2EAuthOverride.mockReturnValue(false);
    fetchStandaloneCookMode.mockResolvedValue(buildStandaloneCookModeData());

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    await waitFor(() => {
      expect(screen.getByTestId("standalone-cook-mode-title")).toBeTruthy();
    });

    expect(screen.getByTestId("ingredient-list")).toBeTruthy();
  });

  it("shows login gate when unauthenticated user clicks complete", async () => {
    readE2EAuthOverride.mockReturnValue(false);
    fetchStandaloneCookMode.mockResolvedValue(buildStandaloneCookModeData());

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    await waitFor(() => {
      expect(screen.getByTestId("standalone-complete-button")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("standalone-complete-button"));

    expect(screen.getByText("로그인이 필요해요")).toBeTruthy();
  });

  it("opens a desktop consumed ingredient sheet for authenticated users", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchStandaloneCookMode.mockResolvedValue(buildStandaloneCookModeData());

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    await waitFor(() => {
      expect(screen.getByTestId("ingredient-list")).toBeTruthy();
    });

    expect(screen.queryByTestId("consumed-check-ing-1")).toBeNull();
    expect(screen.queryByTestId("consumed-ingredient-sheet")).toBeNull();

    fireEvent.click(screen.getByTestId("standalone-complete-button"));

    await waitFor(() => {
      expect(screen.getByTestId("consumed-ingredient-sheet")).toBeTruthy();
    });
  });

  it("uses cooking method color keys from recipe data on step cards", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchStandaloneCookMode.mockResolvedValue(
      buildStandaloneCookModeData({
        recipe: {
          ...buildStandaloneCookModeData().recipe,
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

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    await waitFor(() => {
      expect(screen.getByTestId("step-list")).toBeTruthy();
    });

    const stepItemStyle = screen.getByTestId("step-item").getAttribute("style");
    const methodBadge = screen
      .getAllByText("볶기")
      .find((element) =>
        element.getAttribute("style")?.includes("var(--cook-stir)"),
      );
    const methodBadgeStyle = methodBadge?.getAttribute("style");

    expect(stepItemStyle).toBeNull();
    expect(methodBadge?.getAttribute("aria-label")).toBe("팬/기름 조리 · 볶기");
    expect(methodBadge?.getAttribute("title")).toBe("팬/기름 조리 · 볶기");
    expect(methodBadgeStyle).toContain("var(--cook-stir)");
  });

  it("submits standalone complete with consumed ingredient ids", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchStandaloneCookMode.mockResolvedValue(buildStandaloneCookModeData());
    completeStandaloneCooking.mockResolvedValue({
      leftover_dish_id: "ld-1",
      pantry_removed: 1,
      cook_count: 5,
    });

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    await waitFor(() => {
      expect(screen.getByTestId("standalone-complete-button")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("standalone-complete-button"));
    await waitFor(() => {
      expect(screen.getByTestId("consumed-ingredient-sheet")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("consumed-check-ing-2"));
    fireEvent.click(screen.getByTestId("consumed-confirm-button"));

    await waitFor(() => {
      expect(completeStandaloneCooking).toHaveBeenCalledWith({
        recipe_id: "recipe-1",
        cooking_servings: 2,
        consumed_ingredient_ids: ["ing-1"],
      });
    });
  });

  it("navigates to recipe detail after successful completion", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchStandaloneCookMode.mockResolvedValue(buildStandaloneCookModeData());
    completeStandaloneCooking.mockResolvedValue({
      leftover_dish_id: "ld-1",
      pantry_removed: 0,
      cook_count: 5,
    });

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    await waitFor(() => {
      expect(screen.getByTestId("standalone-complete-button")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("standalone-complete-button"));
    await waitFor(() => {
      expect(screen.getByTestId("consumed-ingredient-sheet")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("consumed-confirm-button"));

    await waitFor(() => {
      expect(mockRouterReplace).toHaveBeenCalledWith("/recipe/recipe-1");
    });
  });

  it("prevents duplicate submit during completion", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchStandaloneCookMode.mockResolvedValue(buildStandaloneCookModeData());

    let resolveComplete: ((value: unknown) => void) | null = null;
    completeStandaloneCooking.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveComplete = resolve;
        }),
    );

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    await waitFor(() => {
      expect(screen.getByTestId("standalone-complete-button")).toBeTruthy();
    });

    const completeButton = screen.getByTestId("standalone-complete-button");
    fireEvent.click(completeButton);
    await waitFor(() => {
      expect(screen.getByTestId("consumed-ingredient-sheet")).toBeTruthy();
    });
    const confirmButton = screen.getByTestId("consumed-confirm-button");
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    // Only one call should have been made
    await waitFor(() => {
      expect(completeStandaloneCooking).toHaveBeenCalledTimes(1);
    });

    // Resolve to complete the flow
    resolveComplete!({
      leftover_dish_id: "ld-1",
      pantry_removed: 0,
      cook_count: 1,
    });
  });

  it("navigates back to recipe detail on cancel (no API call)", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchStandaloneCookMode.mockResolvedValue(buildStandaloneCookModeData());

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    await waitFor(() => {
      expect(screen.getByTestId("standalone-cancel-button")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("standalone-cancel-button"));

    expect(mockRouterReplace).toHaveBeenCalledWith("/recipe/recipe-1");
  });

  it("shows error state when API fails", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchStandaloneCookMode.mockRejectedValue(new Error("Network error"));

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    await waitFor(() => {
      expect(screen.getAllByText("문제가 생겼어요").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows not_found state for 404 responses", async () => {
    const apiError = Object.assign(new Error("레시피를 찾을 수 없어요."), {
      status: 404,
      code: "RESOURCE_NOT_FOUND",
      fields: [],
    });
    readE2EAuthOverride.mockReturnValue(true);
    fetchStandaloneCookMode.mockRejectedValue(apiError);
    isCookingApiError.mockReturnValue(true);

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    await waitFor(() => {
      expect(screen.getByText("레시피를 찾을 수 없어요")).toBeTruthy();
    });
  });

  it("renders standalone cook mode as a whole-board without tabs or step controls", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchStandaloneCookMode.mockResolvedValue(
      buildPrototypeStandaloneCookModeData(),
    );

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    await waitFor(() => {
      expect(screen.getByTestId("standalone-cook-mode-content")).toBeTruthy();
    });

    expect(screen.getByTestId("ingredient-list")).toBeTruthy();
    expect(screen.getByTestId("step-list")).toBeTruthy();
    expect(screen.getByText("고기 재우기")).toBeTruthy();
    expect(screen.getByText("센불 볶기")).toBeTruthy();
    expect(
      screen.getByText("고기와 양념장을 골고루 버무려 주세요."),
    ).toBeTruthy();
    expect(
      screen.getByText("팬을 달군 뒤 양파와 고기를 센불에 볶아주세요."),
    ).toBeTruthy();
    expect(within(screen.getByTestId("ingredient-list")).getByText("돼지고기")).toBeTruthy();
    expect(screen.queryByTestId("cook-mode-current-step")).toBeNull();
    expect(screen.queryByTestId("cook-mode-current-amount-board")).toBeNull();
    expect(screen.queryByTestId("cook-mode-prev-step")).toBeNull();
    expect(screen.queryByTestId("cook-mode-next-step")).toBeNull();
    expect(screen.queryByTestId("tab-steps")).not.toBeTruthy();
    expect(screen.queryByTestId("tab-ingredients")).not.toBeTruthy();
    expect(screen.queryByText("10분")).not.toBeTruthy();
    expect(screen.queryByText(/타이머|메모|일시정지/)).not.toBeTruthy();
  });

  it("displays servings as read-only (no stepper UI)", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchStandaloneCookMode.mockResolvedValue(buildStandaloneCookModeData());

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    await waitFor(() => {
      expect(screen.getByTestId("standalone-cook-mode-servings")).toBeTruthy();
    });

    // No stepper buttons exist in standalone cook mode
    const container = screen.getByTestId("standalone-cook-mode-screen");
    expect(container.querySelector("[data-testid='servings-stepper']")).toBeNull();
  });

  it("login gate shows return path and can be dismissed", async () => {
    readE2EAuthOverride.mockReturnValue(false);
    fetchStandaloneCookMode.mockResolvedValue(buildStandaloneCookModeData());

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    await waitFor(() => {
      expect(screen.getByTestId("standalone-complete-button")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("standalone-complete-button"));

    expect(screen.getByText("로그인이 필요해요")).toBeTruthy();

    // Dismiss login gate
    fireEvent.click(screen.getByTestId("login-gate-back"));

    await waitFor(() => {
      expect(screen.queryByText("로그인이 필요해요")).toBeNull();
    });
  });

  it("does not render bottom tabs in the mobile fullscreen standalone cook mode", async () => {
    installMatchMedia(true);
    readE2EAuthOverride.mockReturnValue(true);
    fetchStandaloneCookMode.mockResolvedValue(buildStandaloneCookModeData());

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    await waitFor(() => {
      expect(screen.getByTestId("standalone-cook-mode-content")).toBeTruthy();
    });

    expect(
      screen.queryByRole("navigation", { name: "요리모드 하단 탭" }),
    ).toBeNull();
  });

  it("defaults standalone mobile cook mode to the service dark cooking board", async () => {
    installMatchMedia(true);
    readE2EAuthOverride.mockReturnValue(true);
    fetchStandaloneCookMode.mockResolvedValue(buildStandaloneCookModeData());

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    await screen.findByTestId("cook-mode-whole-board");
    const screenRoot = screen.getByTestId("standalone-cook-mode-screen");
    expect(screenRoot.getAttribute("data-cook-theme")).toBe("dark");
    expect(screen.queryByTestId("cook-mode-theme-toggle")).toBeNull();
  });

  it("defaults standalone desktop cook mode to the service dark cooking board", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchStandaloneCookMode.mockResolvedValue(buildStandaloneCookModeData());

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    await screen.findByTestId("cook-mode-whole-board");
    const screenRoot = screen.getByTestId("standalone-cook-mode-screen");
    expect(screenRoot.getAttribute("data-cook-theme")).toBe("dark");
    expect(screen.queryByTestId("cook-mode-theme-toggle")).toBeNull();
  });

  it("uses a desktop web shell for standalone cook loading states", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchStandaloneCookMode.mockReturnValue(new Promise(() => {}));

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    const screenRoot = await screen.findByTestId("standalone-cook-mode-screen");
    expect(screenRoot.className).toContain("web-cook-mode-screen");
    expect(screenRoot.className).not.toContain("min-h-dvh");
    expect(screen.getByRole("link", { name: "홈" })).toBeTruthy();
  });

  it("keeps the Wave1 white surface for mobile standalone cook loading states", async () => {
    installMatchMedia(true);
    readE2EAuthOverride.mockReturnValue(true);
    fetchStandaloneCookMode.mockReturnValue(new Promise(() => {}));

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    const screenRoot = await screen.findByTestId("standalone-cook-mode-screen");
    expect(screenRoot.className).toContain("bg-[var(--wave1-surface)]");
  });
});
