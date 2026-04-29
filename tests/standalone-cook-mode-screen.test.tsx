// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CookingModeIngredient,
  CookingModeStep,
  CookingStandaloneCookModeData,
} from "@/types/cooking";

const readE2EAuthOverride = vi.fn();
const fetchStandaloneCookMode = vi.fn();
const completeStandaloneCooking = vi.fn();
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
  fetchStandaloneCookMode: (...args: unknown[]) => fetchStandaloneCookMode(...args),
  completeStandaloneCooking: (...args: unknown[]) =>
    completeStandaloneCooking(...args),
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
    mockRouterPush.mockReset();
  });

  afterEach(async () => {
    const resetStore = await importResetStore();
    resetStore();
    cleanup();
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
    expect(screen.getAllByTestId("ingredient-item")).toHaveLength(2);
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

  it("shows consumed ingredient sheet when authenticated user clicks complete", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchStandaloneCookMode.mockResolvedValue(buildStandaloneCookModeData());

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    await waitFor(() => {
      expect(screen.getByTestId("standalone-complete-button")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("standalone-complete-button"));

    expect(screen.getByTestId("consumed-ingredient-sheet")).toBeTruthy();
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

    // Check an ingredient
    const checkbox = screen.getByTestId("consumed-check-ing-1");
    fireEvent.click(checkbox);

    // Click confirm
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
    fireEvent.click(screen.getByTestId("consumed-skip-button"));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/recipe/recipe-1");
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

    fireEvent.click(screen.getByTestId("standalone-complete-button"));
    fireEvent.click(screen.getByTestId("consumed-skip-button"));

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

    expect(mockRouterPush).toHaveBeenCalledWith("/recipe/recipe-1");
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

  it("switches between ingredients and steps tabs with swipe", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchStandaloneCookMode.mockResolvedValue(buildStandaloneCookModeData());

    const Screen = await importScreen();
    render(<Screen recipeId="recipe-1" servings={2} />);

    await waitFor(() => {
      expect(screen.getByTestId("standalone-cook-mode-content")).toBeTruthy();
    });

    const content = screen.getByTestId("standalone-cook-mode-content");

    // Swipe left to switch to steps
    fireEvent.touchStart(content, {
      touches: [{ clientX: 200, clientY: 100 }],
    });
    fireEvent.touchEnd(content, {
      changedTouches: [{ clientX: 100, clientY: 100 }],
    });

    await waitFor(() => {
      expect(screen.getByTestId("step-list")).toBeTruthy();
    });

    // Swipe right to switch back to ingredients
    fireEvent.touchStart(content, {
      touches: [{ clientX: 100, clientY: 100 }],
    });
    fireEvent.touchEnd(content, {
      changedTouches: [{ clientX: 200, clientY: 100 }],
    });

    await waitFor(() => {
      expect(screen.getByTestId("ingredient-list")).toBeTruthy();
    });
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
});
