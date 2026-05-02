// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  fetchCookMode: (...args: unknown[]) => fetchCookMode(...args),
  completeCookingSession: (...args: unknown[]) =>
    completeCookingSession(...args),
  cancelCookingSession: (...args: unknown[]) => cancelCookingSession(...args),
  isCookingApiError: (error: unknown) => isCookingApiError(error),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
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
    isCookingApiError.mockClear();
    mockRouterPush.mockReset();
  });

  afterEach(async () => {
    const resetStore = await importResetStore();
    resetStore();
    cleanup();
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

  it("shows ingredients tab by default with ingredient items", async () => {
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
  });

  it("switches to steps tab and shows step cards", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("tab-steps")).toBeTruthy();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-steps"));

    await waitFor(() => {
      expect(screen.getByTestId("step-list")).toBeTruthy();
    });

    expect(screen.getByText("양파를 썰어주세요.")).toBeTruthy();
    expect(screen.getByText("김치를 넣고 볶아주세요.")).toBeTruthy();
    expect(screen.getByText("중불")).toBeTruthy();
    expect(screen.getByText("10분")).toBeTruthy();
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
      expect(screen.getByTestId("tab-steps")).toBeTruthy();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-steps"));

    await waitFor(() => {
      expect(screen.getByTestId("step-list")).toBeTruthy();
    });

    const stepItemStyle = screen.getByTestId("step-item").getAttribute("style");
    const methodBadgeStyle = screen.getByText("볶기").getAttribute("style");

    expect(stepItemStyle).toContain("var(--cook-stir)");
    expect(methodBadgeStyle).toContain("var(--cook-stir)");
  });

  it("opens consumed ingredient sheet on complete button click", async () => {
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
      expect(
        screen.getByTestId("consumed-ingredient-sheet"),
      ).toBeTruthy();
    });

    expect(
      screen.getByText("소진한 재료를 체크해주세요"),
    ).toBeTruthy();
  });

  it("sends consumed ingredient ids on confirm", async () => {
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

    await waitFor(() => {
      expect(
        screen.getByTestId("consumed-ingredient-sheet"),
      ).toBeTruthy();
    });

    // Check one ingredient
    await user.click(screen.getByTestId("consumed-check-ing-1"));
    await user.click(screen.getByTestId("consumed-confirm-button"));

    await waitFor(() => {
      expect(completeCookingSession).toHaveBeenCalledWith("session-1", {
        consumed_ingredient_ids: ["ing-1"],
      });
    });
  });

  it("sends empty array on skip", async () => {
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
      expect(screen.getByTestId("consumed-skip-button")).toBeTruthy();
    });

    await user.click(screen.getByTestId("consumed-skip-button"));

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
      expect(screen.getByTestId("consumed-skip-button")).toBeTruthy();
    });

    await user.click(screen.getByTestId("consumed-skip-button"));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/cooking/ready");
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

    await waitFor(() => {
      expect(screen.getByTestId("consumed-skip-button")).toBeTruthy();
    });

    await user.click(screen.getByTestId("consumed-skip-button"));

    // Should transition to error state with conflict message
    await waitFor(() => {
      expect(screen.getByText("다시 시도")).toBeTruthy();
    });

    expect(screen.getByText("이미 취소된 세션입니다.")).toBeTruthy();
    expect(screen.getByText("요리 준비 리스트로")).toBeTruthy();
    // Should NOT navigate away
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("swipe left on content area switches to steps tab", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cook-mode-content")).toBeTruthy();
    });

    // Start on ingredients tab
    expect(screen.getByTestId("ingredient-list")).toBeTruthy();

    const content = screen.getByTestId("cook-mode-content");

    // Simulate swipe left (finger moves from x=200 to x=100)
    fireEvent.touchStart(content, {
      touches: [{ clientX: 200, clientY: 300 }],
    });
    fireEvent.touchEnd(content, {
      changedTouches: [{ clientX: 100, clientY: 300 }],
    });

    await waitFor(() => {
      expect(screen.getByTestId("step-list")).toBeTruthy();
    });
  });

  it("swipe right on content area switches to ingredients tab", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("tab-steps")).toBeTruthy();
    });

    // Switch to steps first via tab click
    const user = userEvent.setup();
    await user.click(screen.getByTestId("tab-steps"));

    await waitFor(() => {
      expect(screen.getByTestId("step-list")).toBeTruthy();
    });

    const content = screen.getByTestId("cook-mode-content");

    // Simulate swipe right (finger moves from x=100 to x=200)
    fireEvent.touchStart(content, {
      touches: [{ clientX: 100, clientY: 300 }],
    });
    fireEvent.touchEnd(content, {
      changedTouches: [{ clientX: 200, clientY: 300 }],
    });

    await waitFor(() => {
      expect(screen.getByTestId("ingredient-list")).toBeTruthy();
    });
  });

  it("vertical-dominant gesture does not switch tabs", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchCookMode.mockResolvedValue(buildCookModeData());

    const CookModeScreen = await importCookModeScreen();
    render(<CookModeScreen sessionId="session-1" initialAuthenticated />);

    await waitFor(() => {
      expect(screen.getByTestId("cook-mode-content")).toBeTruthy();
    });

    expect(screen.getByTestId("ingredient-list")).toBeTruthy();

    const content = screen.getByTestId("cook-mode-content");

    // Simulate mostly-vertical swipe (dy=150 > dx=50)
    fireEvent.touchStart(content, {
      touches: [{ clientX: 200, clientY: 100 }],
    });
    fireEvent.touchEnd(content, {
      changedTouches: [{ clientX: 150, clientY: 250 }],
    });

    // Should still be on ingredients
    expect(screen.getByTestId("ingredient-list")).toBeTruthy();
    expect(screen.queryByTestId("step-list")).toBeNull();
  });
});
