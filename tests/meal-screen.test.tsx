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
  usePathname: () => "/planner/2026-04-18/column-breakfast",
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
const createShoppingList = vi.fn();
const fetchUserProfile = vi.fn();
const fetchUserProgress = vi.fn();
const fetchUserGamification = vi.fn();

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

vi.mock("@/lib/api/shopping", () => ({
  createShoppingList: (body: unknown) => createShoppingList(body),
  isShoppingApiError: (error: unknown) =>
    Boolean(error) && typeof error === "object" && "status" in (error as Record<string, unknown>),
}));

vi.mock("@/lib/api/mypage", () => ({
  fetchUserProfile: () => fetchUserProfile(),
}));

vi.mock("@/lib/api/user-progress", () => ({
  fetchUserProgress: () => fetchUserProgress(),
}));

vi.mock("@/lib/api/user-gamification", () => ({
  fetchUserGamification: () => fetchUserGamification(),
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

function mockProfileSummaryApis() {
  fetchUserProfile.mockResolvedValue({
    email: "home@example.com",
    id: "user-1",
    nickname: "김집밥",
    profile_image_url: null,
    settings: { screen_wake_lock: false },
    social_provider: "google",
  });
  fetchUserProgress.mockResolvedValue(null);
  fetchUserGamification.mockResolvedValue(null);
}

function setDesktopViewport(enabled: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: enabled && query === "(min-width: 1024px)",
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
    createShoppingList.mockReset();
    fetchUserProfile.mockReset();
    fetchUserProgress.mockReset();
    fetchUserGamification.mockReset();
    mockProfileSummaryApis();
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "matchMedia");
  });

  it.each([false, true])("returns to the meal's week and date even without explicit return context (desktop: %s)", async (desktop) => {
    setDesktopViewport(desktop);
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [createMealItem()] });
    render(<MealScreen {...DEFAULT_PROPS} planDate="2026-11-19" />);
    await screen.findByTestId("meal-recipe-link-meal-1");
    await userEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));
    expect(mockRouterReplace).toHaveBeenCalledWith("/planner?date=2026-11-19");
  });

  it("repairs an older planner return link that omitted its date", async () => {
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams({ returnTo: "/planner" }));
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [createMealItem()] });
    render(<MealScreen {...DEFAULT_PROPS} planDate="2026-11-19" />);
    await screen.findByTestId("meal-recipe-link-meal-1");
    await userEvent.click(screen.getByRole("button", { name: "뒤로 가기" }));
    expect(mockRouterReplace).toHaveBeenCalledWith("/planner?date=2026-11-19");
  });

  it("renders a stable loading skeleton that matches the meal card structure", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockReturnValue(new Promise(() => {}));

    render(<MealScreen {...DEFAULT_PROPS} />);

    const skeleton = await screen.findByTestId("meal-screen-loading-skeleton");
    expect(skeleton.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByTestId("meal-screen-loading-summary")).toBeNull();
    expect(screen.getAllByTestId("meal-screen-loading-card")).toHaveLength(2);
    expect(screen.getAllByTestId("meal-screen-loading-thumb")).toHaveLength(2);
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
    expect(recipeLink.textContent).toContain("김치찌개");

    const user = userEvent.setup();
    await user.click(recipeLink);

    expect(new URL(mockRouterPush.mock.lastCall![0], "http://local").searchParams.get("mealId")).toBe("meal-1");
  });

  it.each([false, true])("keeps focused detail without global navigation and exposes an explicit plan-only delete (desktop=%s)", async (desktop) => {
    setDesktopViewport(desktop);
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams({ mealId: "meal-1" }));
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [createMealItem()] });
    render(<MealScreen {...DEFAULT_PROPS} />);
    const deleteButton = await screen.findByRole("button", { name: "김치찌개 이 계획에서 삭제" });
    expect(deleteButton.textContent).toBe("이 계획에서 삭제");
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByTestId("meal-compact-nutrition")).toBeNull();
  });

  it("offers the action for each meal status without status selectors", async () => {
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

    const registered = within(screen.getByRole("article", { name: "김치찌개 식사 카드" }));
    const ready = within(screen.getByRole("article", { name: "파스타 식사 카드" }));
    expect(registered.getByRole("button", { name: "장보기" })).toBeTruthy();
    expect(registered.queryByRole("button", { name: "김치찌개 요리 시작" })).toBeNull();
    expect(ready.getByRole("button", { name: "파스타 요리 시작" })).toBeTruthy();
    expect(ready.queryByRole("button", { name: "장보기" })).toBeNull();
    // No status dropdown/selector
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByLabelText("상태 변경")).toBeNull();
  });

  it("matches the meal-log deletion sheet when plan deletion is requested", async () => {
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams({ mealId: "meal-1" }));
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [createMealItem()],
    });

    render(<MealScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    const deleteBtn = await screen.findByTestId("meal-delete-meal-1");
    await user.click(deleteBtn);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(screen.getByRole("heading", { name: "4월 18일 아침" })).toBeTruthy();
    expect(screen.queryByTestId("delete-confirm-icon")).toBeNull();
    expect(screen.queryByText("이 요리계획만 삭제하고 레시피는 남겨둬요.")).toBeNull();
    expect(within(dialog).getByRole("button", { name: "삭제" })).toBeTruthy();
    expect(screen.getByTestId("delete-confirm").className).toContain("bg-[var(--danger-strong)]");
  });

  it("confirms delete and removes the meal card (Wave1)", async () => {
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams({ mealId: "meal-1" }));
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
    expect(new URL(mockRouterPush.mock.lastCall![0], "http://local").searchParams.get("mealId")).toBe("meal-2");

    mockRouterPush.mockClear();
    await user.click(firstRecipeLink);
    expect(new URL(mockRouterPush.mock.lastCall![0], "http://local").searchParams.get("mealId")).toBe("meal-1");
  });

  it("shows servings directly in the whole-meal list and keeps deletion in food details", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [createMealItem()] });
    render(<MealScreen {...DEFAULT_PROPS} />);
    await screen.findByLabelText("김치찌개 식사 카드");
    expect(screen.queryByTestId("meal-delete-meal-1")).toBeNull();
    expect(screen.getByRole("group", { name: "인분 조절" })).toBeTruthy();
  });

  it("opens the exact pinned recipe with a return path to the selected planned food", async () => {
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams({ mealId: "meal-1", returnTo: "/planner?date=2026-04-18" }));
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [createMealItem(), createMealItem({ id: "meal-other", recipe_title: "다른 음식" })] });
    render(<MealScreen {...DEFAULT_PROPS} />);
    await userEvent.click(await screen.findByTestId("meal-recipe-link-meal-1"));
    const destination = new URL(mockRouterPush.mock.lastCall![0], "http://local");
    expect(destination.pathname).toBe("/meal/meal-1/recipe");
    const returnUrl = new URL(destination.searchParams.get("returnTo")!, "http://local");
    expect(returnUrl.pathname).toBe("/planner/2026-04-18/column-breakfast");
    expect(returnUrl.searchParams.get("mealId")).toBe("meal-1");
    expect(screen.queryByText("다른 음식")).toBeNull();
  });

  it("does not expose another date's food for an unavailable meal ID", async () => {
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams({ mealId: "not-in-this-meal" }));
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [createMealItem()] });
    render(<MealScreen {...DEFAULT_PROPS} />);
    expect(await screen.findByText("이 날짜에 해당 계획이 없어요.")).toBeTruthy();
    expect(screen.queryByText("김치찌개")).toBeNull();
    expect(screen.queryByTestId("meal-delete-meal-1")).toBeNull();
  });

  it("routes completed plans to cooked food instead of starting another session", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [createMealItem({ status: "cook_done" })] });
    render(<MealScreen {...DEFAULT_PROPS} />);
    await userEvent.click(await screen.findByRole("button", { name: "완성한 음식 보기" }));
    expect(new URL(mockRouterPush.mock.lastCall![0], "http://local").pathname).toBe("/leftovers");
  });

  it("creates a shopping list directly for the selected meal", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [createMealItem()],
    });
    createShoppingList.mockResolvedValue({
      id: "list-1",
      title: "6/5 장보기",
      is_completed: false,
      created_at: "2026-06-05T00:00:00.000Z",
    });

    render(<MealScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    const card = await screen.findByLabelText("김치찌개 식사 카드");
    await user.click(within(card).getByRole("button", { name: "장보기" }));

    await waitFor(() => {
      expect(createShoppingList).toHaveBeenCalledWith({
        complete_without_list: false,
        meal_configs: [{ meal_id: "meal-1", shopping_servings: 2 }],
      });
    });
    expect(mockRouterPush).toHaveBeenCalledWith(
      "/shopping/lists/list-1?returnTo=%2Fplanner%2F2026-04-18%2Fcolumn-breakfast%3Fslot%3D%25EC%2595%2584%25EC%25B9%25A8",
    );
  });

  it("lets users open an all-pantry shopping list from the all-pantry modal", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [createMealItem()],
    });
    createShoppingList.mockResolvedValue({
      id: "list-all-pantry",
      title: "4/18 장보기",
      is_completed: false,
      all_items_in_pantry: true,
      pantry_item_count: 4,
      created_at: "2026-04-18T00:00:00.000Z",
    });

    render(<MealScreen {...DEFAULT_PROPS} />);

    const user = userEvent.setup();
    const card = await screen.findByLabelText("김치찌개 식사 카드");
    await user.click(within(card).getByRole("button", { name: "장보기" }));

    const dialog = await screen.findByRole("dialog", { name: "살 재료가 없어요" });
    expect(dialog).toBeTruthy();
    expect(createShoppingList).toHaveBeenCalledWith({
      complete_without_list: false,
      meal_configs: [{ meal_id: "meal-1", shopping_servings: 2 }],
    });
    expect(
      screen.getByText("선택한 끼니의 재료가 모두 팬트리에 있어요. 그래도 목록에서 필요한 재료를 되살릴 수 있어요."),
    ).toBeTruthy();
    expect(screen.getByText("1개 끼니 · 4개 재료")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "계속 보기" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "장보기목록 만들기" }));

    expect(mockRouterPush).toHaveBeenCalledWith(
      "/shopping/lists/list-all-pantry?returnTo=%2Fplanner%2F2026-04-18%2Fcolumn-breakfast%3Fslot%3D%25EC%2595%2584%25EC%25B9%25A8",
    );
  });
});
