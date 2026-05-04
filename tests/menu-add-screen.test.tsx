// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MenuAddScreen } from "@/components/planner/menu-add-screen";
import * as leftoversApi from "@/lib/api/leftovers";
import * as mealApi from "@/lib/api/meal";

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
  });

  afterEach(() => {
    cleanup();
  });

  it("opens the YouTube import screen from the current planner slot context", async () => {
    render(<MenuAddScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    const youtubeButton = screen.getByRole("button", { name: "유튜브" });

    expect((youtubeButton as HTMLButtonElement).disabled).toBe(false);

    await user.click(youtubeButton);

    expect(mockRouterPush).toHaveBeenCalledWith(
      `/menu/add/youtube?date=${DEFAULT_PROPS.planDate}&columnId=${DEFAULT_PROPS.columnId}&slot=${encodeURIComponent(DEFAULT_PROPS.slotName)}`,
    );
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
