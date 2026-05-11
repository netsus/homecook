// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MenuAddScreen } from "@/components/planner/menu-add-screen";
import * as leftoversApi from "@/lib/api/leftovers";
import * as mealApi from "@/lib/api/meal";
import * as recipeApi from "@/lib/api/recipe";

const mockRouterPush = vi.fn();
const mockRouterReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
  }),
}));

vi.mock("@/lib/api/leftovers", () => ({
  fetchLeftovers: vi.fn(),
}));

vi.mock("@/lib/api/meal", () => ({
  createMealSafe: vi.fn(),
}));

vi.mock("@/lib/api/recipe", () => ({
  fetchRecipes: vi.fn(),
}));

const DEFAULT_PROPS = {
  planDate: "2026-04-18",
  columnId: "550e8400-e29b-41d4-a716-446655440050",
  slotName: "아침",
  initialAuthenticated: true,
} as const;

describe("MenuAddScreen", () => {
  beforeEach(() => {
    mockRouterPush.mockReset();
    mockRouterReplace.mockReset();
    vi.mocked(leftoversApi.fetchLeftovers).mockReset();
    vi.mocked(mealApi.createMealSafe).mockReset();
    vi.mocked(recipeApi.fetchRecipes).mockReset();
    vi.mocked(recipeApi.fetchRecipes).mockResolvedValue({
      success: true,
      data: {
        has_next: false,
        items: [],
        next_cursor: null,
      },
      error: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("opens the YouTube import screen from the current planner slot context", async () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    const youtubeButton = screen.getByTestId("menu-add-option-youtube");

    expect((youtubeButton as HTMLButtonElement).disabled).toBe(false);

    await user.click(youtubeButton);

    expect(mockRouterPush).toHaveBeenCalledWith(
      `/menu/add/youtube?date=${DEFAULT_PROPS.planDate}&columnId=${DEFAULT_PROPS.columnId}&slot=${encodeURIComponent(DEFAULT_PROPS.slotName)}`,
    );
  });

  // ─── Wave1 acceptance tests ─────────────────────────────────────────────────

  it("renders the mobile option list with correct data-testids (Wave1)", () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const grid = screen.getByTestId("menu-add-option-grid");
    expect(grid).toBeTruthy();
    expect(grid.className).toContain("flex");

    // All six Wave1 options should be present.
    expect(screen.getByTestId("menu-add-option-search")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-recipebook")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-pantry")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-leftover")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-youtube")).toBeTruthy();
    expect(screen.getByTestId("menu-add-option-manual")).toBeTruthy();
  });

  it("opens and focuses the mobile recipe search picker from the search option tile (Wave1)", async () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByTestId("menu-add-option-search"));

    expect(screen.getByRole("heading", { name: "검색으로 추가" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("레시피 검색"));
  });

  it("shows the mobile target context instead of the legacy secondary heading (Wave1)", () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    expect(screen.getByText("대상")).toBeTruthy();
    expect(screen.getByText("4/18 아침")).toBeTruthy();
    expect(screen.queryByText("다른 방법으로 추가")).toBeNull();
  });

  it("opens the requested picker when source is provided by the planner sheet", async () => {
    vi.mocked(leftoversApi.fetchLeftovers).mockResolvedValue({ items: [] });

    render(<MenuAddScreen {...DEFAULT_PROPS} initialSource="leftover" />);

    expect(await screen.findByRole("dialog", { name: "남은요리 선택" })).toBeTruthy();
    expect(leftoversApi.fetchLeftovers).toHaveBeenCalledWith("leftover");
  });

  it("renders each option with emoji, label, and subtitle (Wave1)", () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    // Check leftover option has all parts
    const leftoverBtn = screen.getByTestId("menu-add-option-leftover");
    expect(leftoverBtn.textContent).toContain("🍱");
    expect(leftoverBtn.textContent).toContain("남은요리");
    expect(leftoverBtn.textContent).toContain("남은 요리에서 추가");

    // Check manual option
    const manualBtn = screen.getByTestId("menu-add-option-manual");
    expect(manualBtn.textContent).toContain("✏️");
    expect(manualBtn.textContent).toContain("직접 등록");
    expect(manualBtn.textContent).toContain("레시피 직접 작성");
  });

  it("adds a leftover dish to the current planner slot", async () => {
    vi.mocked(leftoversApi.fetchLeftovers).mockResolvedValue({
      items: [
        {
          id: "leftover-1",
          recipe_id: "recipe-1",
          recipe_title: "김치찌개",
          recipe_thumbnail_url: null,
          status: "leftover",
          cooked_at: "2026-04-17T00:00:00.000Z",
          eaten_at: null,
        },
      ],
    });
    vi.mocked(mealApi.createMealSafe).mockResolvedValue({
      success: true,
      data: {
        id: "meal-1",
        recipe_id: "recipe-1",
        plan_date: DEFAULT_PROPS.planDate,
        column_id: DEFAULT_PROPS.columnId,
        planned_servings: 1,
        status: "registered",
        is_leftover: true,
        leftover_dish_id: "leftover-1",
      },
      error: null,
    });

    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /남은요리/ }));

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "선택" }));
    await waitFor(() => {
      expect(screen.getByText("계획 인분 입력")).toBeTruthy();
    });
    await user.click(screen.getByRole("button", { name: "추가" }));

    await waitFor(() => {
      expect(mealApi.createMealSafe).toHaveBeenCalledWith({
        recipe_id: "recipe-1",
        plan_date: DEFAULT_PROPS.planDate,
        column_id: DEFAULT_PROPS.columnId,
        planned_servings: 1,
        leftover_dish_id: "leftover-1",
      });
    });
    expect(mockRouterReplace).toHaveBeenCalledWith(
      `/planner/${DEFAULT_PROPS.planDate}/${DEFAULT_PROPS.columnId}?slot=${encodeURIComponent(DEFAULT_PROPS.slotName)}`,
    );
  });
});
