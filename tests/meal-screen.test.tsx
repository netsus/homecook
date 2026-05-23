// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MealScreen } from "@/components/planner/meal-screen";

const mockRouterPush = vi.fn();
const mockRouterReplace = vi.fn();
const navigationMocks = vi.hoisted(() => ({
  searchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
  }),
  useSearchParams: () => navigationMocks.searchParams(),
}));

const readE2EAuthOverride = vi.fn();
const fetchMeals = vi.fn();
const deleteMeal = vi.fn();
const updateMealServings = vi.fn();

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  readE2EAuthOverride: () => readE2EAuthOverride(),
}));

vi.mock("@/lib/api/meal", () => ({
  fetchMeals: (...args: unknown[]) => fetchMeals(...args),
  deleteMeal: (...args: unknown[]) => deleteMeal(...args),
  updateMealServings: (...args: unknown[]) => updateMealServings(...args),
  isMealApiError: (error: unknown) =>
    Boolean(error) && typeof error === "object" && "status" in (error as Record<string, unknown>),
}));

vi.mock("@/lib/supabase/env", () => ({
  hasSupabasePublicEnv: () => false,
}));

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      })),
    },
  }),
}));

const DEFAULT_PROPS = {
  planDate: "2026-04-18",
  columnId: "column-breakfast",
  slotName: "아침",
  initialAuthenticated: false,
} as const;

function createMealItem(overrides: Partial<{
  id: string;
  recipe_id: string;
  recipe_title: string;
  recipe_thumbnail_url: string | null;
  planned_servings: number;
  status: "registered" | "shopping_done" | "cook_done";
  is_leftover: boolean;
}> = {}) {
  return {
    id: "meal-1",
    recipe_id: "recipe-1",
    recipe_title: "김치찌개",
    recipe_thumbnail_url: null,
    planned_servings: 2,
    status: "registered" as const,
    is_leftover: false,
    ...overrides,
  };
}

describe("MealScreen", () => {
  beforeEach(() => {
    mockRouterPush.mockReset();
    mockRouterReplace.mockReset();
    navigationMocks.searchParams.mockReset();
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams());
    readE2EAuthOverride.mockReset();
    fetchMeals.mockReset();
    deleteMeal.mockReset();
    updateMealServings.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders a stable loading skeleton that matches the meal card structure", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockReturnValue(new Promise(() => {}));

    render(<MealScreen {...DEFAULT_PROPS} />);

    const skeleton = await screen.findByTestId("meal-screen-loading-skeleton");
    expect(skeleton.getAttribute("aria-busy")).toBe("true");
    expect(screen.getByTestId("meal-screen-loading-summary")).toBeTruthy();
    expect(screen.getAllByTestId("meal-screen-loading-card")).toHaveLength(2);
    expect(screen.getAllByTestId("meal-screen-loading-thumb")).toHaveLength(2);
    expect(screen.getAllByTestId("meal-screen-loading-stepper")).toHaveLength(2);
    expect(screen.getAllByTestId("meal-screen-loading-action")).toHaveLength(2);
  });

  it("renders recipe title as a clickable button that routes to RECIPE_DETAIL (Wave1)", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [createMealItem()],
    });

    render(<MealScreen {...DEFAULT_PROPS} />);

    const recipeLink = await screen.findByTestId("meal-recipe-link-meal-1");
    expect(recipeLink).toBeTruthy();
    expect(recipeLink.tagName).toBe("BUTTON");
    expect(recipeLink.textContent).toBe("김치찌개");

    const user = userEvent.setup();
    await user.click(recipeLink);

    expect(mockRouterPush).toHaveBeenCalledWith("/recipe/recipe-1");
  });

  it("renders a trash icon button for delete instead of text button (Wave1)", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [createMealItem()],
    });

    render(<MealScreen {...DEFAULT_PROPS} />);

    const deleteBtn = await screen.findByTestId("meal-delete-meal-1");
    expect(deleteBtn).toBeTruthy();
    expect(deleteBtn.tagName).toBe("BUTTON");
    expect(deleteBtn.getAttribute("aria-label")).toBe("김치찌개 삭제");
    // Should contain an SVG icon, not text "삭제"
    expect(deleteBtn.querySelector("svg")).toBeTruthy();
    expect(deleteBtn.textContent?.trim()).toBe("");
    // Wave1 fixed reference uses a compact 32px circular icon button.
    expect(deleteBtn.className).toContain("h-8");
    expect(deleteBtn.className).toContain("w-8");
    expect(deleteBtn.className).toContain("rounded-full");
  });

  it("does not render status badges or status selectors on meal cards (Wave1)", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [
        createMealItem({ id: "meal-1", status: "registered" }),
        createMealItem({ id: "meal-2", recipe_id: "recipe-2", recipe_title: "파스타", status: "shopping_done" }),
      ],
    });

    render(<MealScreen {...DEFAULT_PROPS} />);

    await screen.findByText("김치찌개");
    await screen.findByText("파스타");

    // No status badge text should appear
    expect(screen.queryByText("등록")).toBeNull();
    expect(screen.queryByText("장보기 완료")).toBeNull();
    expect(screen.queryByText("요리 완료")).toBeNull();
    // No status dropdown/selector
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByLabelText("상태 변경")).toBeNull();
  });

  it("opens delete confirmation modal when trash icon is clicked (Wave1)", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [createMealItem()],
    });

    render(<MealScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    const deleteBtn = await screen.findByTestId("meal-delete-meal-1");
    await user.click(deleteBtn);

    // Modal should appear
    expect(screen.getByText("식사 삭제")).toBeTruthy();
    expect(screen.getByText("이 식사를 삭제하시겠어요?")).toBeTruthy();
    expect(screen.getByTestId("delete-confirm")).toBeTruthy();
  });

  it("confirms delete and removes the meal card (Wave1)", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [createMealItem()],
    });
    deleteMeal.mockResolvedValue(undefined);

    render(<MealScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    const deleteBtn = await screen.findByTestId("meal-delete-meal-1");
    await user.click(deleteBtn);

    const confirmBtn = screen.getByTestId("delete-confirm");
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(deleteMeal).toHaveBeenCalledWith("meal-1");
    });

    // Meal should be removed — empty state shown
    await waitFor(() => {
      expect(screen.queryByText("김치찌개")).toBeNull();
    });
  });

  it("navigates to recipe detail page when recipe title is clicked for multiple meals (Wave1)", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [
        createMealItem({ id: "meal-1", recipe_id: "recipe-1", recipe_title: "김치찌개" }),
        createMealItem({ id: "meal-2", recipe_id: "recipe-2", recipe_title: "된장찌개" }),
      ],
    });

    render(<MealScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();

    const firstRecipeLink = await screen.findByTestId("meal-recipe-link-meal-1");
    const secondRecipeLink = screen.getByTestId("meal-recipe-link-meal-2");

    await user.click(secondRecipeLink);
    expect(mockRouterPush).toHaveBeenCalledWith("/recipe/recipe-2");

    mockRouterPush.mockClear();
    await user.click(firstRecipeLink);
    expect(mockRouterPush).toHaveBeenCalledWith("/recipe/recipe-1");
  });

  it("shows meal card with relative positioning for absolute trash icon (Wave1)", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [createMealItem()],
    });

    render(<MealScreen {...DEFAULT_PROPS} />);

    const card = await screen.findByLabelText("김치찌개 식사 카드");
    expect(card.className).toContain("relative");

    // Trash icon should be absolute positioned
    const deleteBtn = within(card).getByTestId("meal-delete-meal-1");
    expect(deleteBtn.className).toContain("absolute");
    expect(deleteBtn.className).toContain("right-3");
    expect(deleteBtn.className).toContain("top-3");
  });
});
