// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ManualRecipeCreateScreen } from "@/components/recipe/manual-recipe-create-screen";
import { fetchCookingMethods } from "@/lib/api/cooking-methods";
import { fetchIngredients } from "@/lib/api/ingredients";
import { getCookingMethodColor } from "@/lib/cooking-method-colors";

const mockRouterReplace = vi.fn();
const navigationMocks = vi.hoisted(() => ({
  searchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
  useSearchParams: () => navigationMocks.searchParams(),
}));

vi.mock("@/lib/api/cooking-methods", () => ({
  fetchCookingMethods: vi.fn(),
}));

vi.mock("@/lib/api/ingredients", () => ({
  fetchIngredients: vi.fn(),
}));

vi.mock("@/lib/api/manual-recipe", () => ({
  createManualRecipe: vi.fn(),
}));

vi.mock("@/lib/api/meal", () => ({
  createMealSafe: vi.fn(),
}));

function installMatchMedia(matchesDesktop = false) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: matchesDesktop,
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

const DEFAULT_PROPS = {
  planDate: "2026-04-18",
  columnId: "column-breakfast",
  slotName: "아침",
  initialAuthenticated: true,
} as const;

describe("ManualRecipeCreateScreen", () => {
  beforeEach(() => {
    installMatchMedia(false);
    mockRouterReplace.mockReset();
    navigationMocks.searchParams.mockReset();
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams());
    vi.mocked(fetchCookingMethods).mockReset();
    vi.mocked(fetchIngredients).mockReset();
    vi.mocked(fetchCookingMethods).mockResolvedValue({
      success: true,
      data: {
        methods: [
          {
            id: "method-prep",
            code: "prep",
            label: "준비",
            color_key: "gray",
            is_system: true,
          },
        ],
      },
      error: null,
    });
    vi.mocked(fetchIngredients).mockResolvedValue({
      success: true,
      data: {
        items: [{ id: "ing-onion", standard_name: "양파", category: "채소" }],
      },
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("adds selected modal ingredients into the main form with quantity and g/ml unit controls", async () => {
    const user = userEvent.setup();
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await user.click(screen.getByRole("button", { name: "+ 재료 추가하기" }));
    await user.click(await screen.findByRole("button", { name: "양파" }));

    expect(screen.queryByLabelText("양파 수량")).toBeNull();

    await user.click(screen.getByRole("button", { name: "선택한 재료 1개 추가" }));

    const amountInput = await screen.findByLabelText("양파 수량");
    expect((amountInput as HTMLInputElement).value).toBe("100");
    expect(screen.getByRole("button", { name: "양파 g" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    await user.click(screen.getByRole("button", { name: "양파 ml" }));

    expect(screen.getByRole("button", { name: "양파 ml" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("does not show a non-interactive default step placeholder", async () => {
    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(fetchCookingMethods).toHaveBeenCalled();
    });

    expect(screen.queryByText("STEP 1")).toBeNull();
    expect(screen.getByText("조리 과정을 추가해주세요.")).toBeTruthy();
    expect(screen.getByTestId("manual-step-composer")).toBeTruthy();
    expect(screen.getByRole("button", { name: "준비" })).toBeTruthy();
  });

  it("adds cooking steps inline with the selected cooking method color", async () => {
    const user = userEvent.setup();
    vi.mocked(fetchCookingMethods).mockResolvedValue({
      success: true,
      data: {
        methods: [
          {
            id: "method-stir",
            code: "stir_fry",
            label: "볶기",
            color_key: "orange",
            is_system: true,
          },
          {
            id: "method-boil",
            code: "boil",
            label: "끓이기",
            color_key: "red",
            is_system: true,
          },
        ],
      },
      error: null,
    });

    render(<ManualRecipeCreateScreen {...DEFAULT_PROPS} />);

    const composer = await screen.findByTestId("manual-step-composer");
    await user.click(screen.getByRole("button", { name: "볶기" }));
    await user.type(
      screen.getByLabelText("조리 과정 1 설명"),
      "양파를 투명해질 때까지 볶아요",
    );
    await user.click(screen.getByRole("button", { name: "+ 조리 과정 추가" }));

    expect(composer).toBeTruthy();
    expect(screen.getByText("양파를 투명해질 때까지 볶아요")).toBeTruthy();
    expect(screen.getAllByText("볶기")[1].getAttribute("style")).toContain(
      getCookingMethodColor("orange"),
    );
    expect(screen.getByLabelText("조리 과정 2 설명")).toBeTruthy();
  });
});
