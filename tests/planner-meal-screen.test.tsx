// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MealScreen } from "@/components/planner/meal-screen";

// ── Module mocks ──────────────────────────────────────────────────────────────

const readE2EAuthOverride = vi.fn();
const fetchMeals = vi.fn();
const updateMealServings = vi.fn();
const deleteMeal = vi.fn();
const createMealSafe = vi.fn();
const createCookingSession = vi.fn();
const fetchRecipes = vi.fn();
const fetchLeftovers = vi.fn();
const isMealApiError = vi.fn(
  (error: unknown): error is Error & { status: number; code: string } =>
    Boolean(error) &&
    typeof error === "object" &&
    "status" in (error as Record<string, unknown>),
);
const isCookingApiError = vi.fn(
  (error: unknown): error is Error & { status: number; code: string } =>
    Boolean(error) &&
    typeof error === "object" &&
    "status" in (error as Record<string, unknown>),
);
const mockRouterBack = vi.fn();
const mockRouterPush = vi.fn();
const mockRouterReplace = vi.fn();
const navigationMocks = vi.hoisted(() => ({
  searchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  readE2EAuthOverride: () => readE2EAuthOverride(),
}));

vi.mock("@/lib/api/meal", () => ({
  createMealSafe: (...args: unknown[]) => createMealSafe(...args),
  fetchMeals: (...args: unknown[]) => fetchMeals(...args),
  updateMealServings: (...args: unknown[]) => updateMealServings(...args),
  deleteMeal: (...args: unknown[]) => deleteMeal(...args),
  isMealApiError: (error: unknown) => isMealApiError(error),
}));

vi.mock("@/lib/api/leftovers", () => ({
  fetchLeftovers: (...args: unknown[]) => fetchLeftovers(...args),
}));

vi.mock("@/lib/api/recipe", () => ({
  fetchPantryMatchRecipes: vi.fn(),
  fetchRecipeBookRecipes: vi.fn(),
  fetchRecipeBooks: vi.fn(),
  fetchRecipes: (...args: unknown[]) => fetchRecipes(...args),
}));

vi.mock("@/lib/api/cooking", () => ({
  createCookingSession: (...args: unknown[]) => createCookingSession(...args),
  isCookingApiError: (error: unknown) => isCookingApiError(error),
}));

vi.mock("@/lib/supabase/env", () => ({
  hasSupabasePublicEnv: () => false,
}));

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: mockRouterBack,
    push: mockRouterPush,
    replace: mockRouterReplace,
  }),
  useSearchParams: () => navigationMocks.searchParams(),
}));

vi.mock("@/components/auth/social-login-buttons", () => ({
  SocialLoginButtons: ({ nextPath }: { nextPath: string }) => (
    <div data-testid="social-login-buttons" data-next-path={nextPath} />
  ),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

function buildMeal(overrides: Partial<{
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

function createMealApiError(status: number, message = "오류가 발생했어요.") {
  const error = new Error(message) as Error & { status: number; code: string };
  error.status = status;
  error.code = "ERROR";
  return error;
}

const DEFAULT_PROPS = {
  planDate: "2026-04-18",
  columnId: "550e8400-e29b-41d4-a716-446655440050",
  slotName: "아침",
  initialAuthenticated: false,
} as const;

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

// ── Test suite ────────────────────────────────────────────────────────────────

describe("MealScreen", () => {
  beforeEach(() => {
    readE2EAuthOverride.mockReset();
    fetchMeals.mockReset();
    updateMealServings.mockReset();
    deleteMeal.mockReset();
    createMealSafe.mockReset();
    createCookingSession.mockReset();
    fetchRecipes.mockReset();
    fetchLeftovers.mockReset();
    fetchRecipes.mockResolvedValue({
      success: true,
      data: {
        has_next: false,
        items: [],
        next_cursor: null,
      },
      error: null,
    });
    mockRouterBack.mockReset();
    mockRouterPush.mockReset();
    mockRouterReplace.mockReset();
    navigationMocks.searchParams.mockReset();
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams());
    setDesktopViewport(false);
    isMealApiError.mockImplementation(
      (error: unknown): error is Error & { status: number; code: string } =>
        Boolean(error) &&
        typeof error === "object" &&
        "status" in (error as Record<string, unknown>),
    );
    isCookingApiError.mockImplementation(
      (error: unknown): error is Error & { status: number; code: string } =>
        Boolean(error) &&
        typeof error === "object" &&
        "status" in (error as Record<string, unknown>),
    );
  });

  afterEach(() => {
    cleanup();
  });

  // ── Auth states ─────────────────────────────────────────────────────────

  it("shows unauthorized gate when not authenticated", async () => {
    readE2EAuthOverride.mockReturnValue(false);

    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByTestId("social-login-buttons")).toBeTruthy();
    });
    expect(fetchMeals).not.toHaveBeenCalled();
  });

  it("passes the return path to SocialLoginButtons", async () => {
    readE2EAuthOverride.mockReturnValue(false);

    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      const buttons = screen.getByTestId("social-login-buttons");
      expect(buttons.getAttribute("data-next-path")).toBe(
        `/planner/2026-04-18/550e8400-e29b-41d4-a716-446655440050?slot=${encodeURIComponent("아침")}`,
      );
    });
  });

  // ── Loading state ───────────────────────────────────────────────────────

  it("shows loading skeleton while fetching meals", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockReturnValue(new Promise(() => {}));

    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByLabelText("식사 목록 불러오는 중")).toBeTruthy();
    });
    expect(screen.queryByTestId("meal-screen-loading-summary")).toBeNull();
    expect(screen.getAllByTestId("meal-screen-loading-card")).toHaveLength(2);
    expect(screen.getAllByTestId("meal-screen-loading-thumb")).toHaveLength(2);
    expect(screen.getAllByTestId("meal-screen-loading-stepper")).toHaveLength(2);
    expect(screen.getAllByTestId("meal-screen-loading-action")).toHaveLength(2);
  });

  it("uses the final desktop meal layout for loading skeletons", async () => {
    setDesktopViewport(true);
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockReturnValue(new Promise(() => {}));

    render(<MealScreen {...DEFAULT_PROPS} />);

    const skeleton = await screen.findByTestId("web-meal-loading-skeleton");
    expect(skeleton.className).toContain("web-meal-list-layout");
    expect(within(skeleton).getAllByTestId("web-meal-loading-card")).toHaveLength(2);
    expect(within(skeleton).getAllByTestId("web-meal-loading-thumb")).toHaveLength(2);
    expect(screen.getByTestId("web-meal-loading-summary")).toBeTruthy();
    expect(screen.queryByTestId("web-meal-list")).toBeNull();
  });

  // ── Error state ─────────────────────────────────────────────────────────

  it("shows error state when fetchMeals fails", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockRejectedValue(createMealApiError(500, "서버 오류가 발생했어요."));

    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByTestId("meal-screen-error")).toBeTruthy();
    });
    expect(screen.getByText("서버 오류가 발생했어요.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeTruthy();
  });

  it("retries fetch when 다시 시도 is clicked", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals
      .mockRejectedValueOnce(createMealApiError(500))
      .mockResolvedValueOnce({ items: [buildMeal()] });

    const user = userEvent.setup();
    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByTestId("meal-screen-error")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });
    expect(fetchMeals).toHaveBeenCalledTimes(2);
  });

  // ── Empty state ─────────────────────────────────────────────────────────

  it("shows empty state when no meals are returned", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [] });

    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByTestId("meal-screen-empty")).toBeTruthy();
    });
    expect(screen.getByText("이 끼니에 등록된 식사가 없어요.")).toBeTruthy();
    expect(screen.getByTestId("meal-screen-add-cta")).toBeTruthy();
  });

  // ── Meal cards ──────────────────────────────────────────────────────────

  it("renders mobile meal cards with status tags, stronger titles, and swapped meta order", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [
        buildMeal({ id: "meal-1", recipe_title: "김치찌개", status: "registered" }),
        buildMeal({ id: "meal-2", recipe_title: "미역국", status: "shopping_done" }),
        buildMeal({ id: "meal-3", recipe_title: "시금치볶음", status: "cook_done" }),
      ],
    });

    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });
    expect(screen.getByText("미역국")).toBeTruthy();
    expect(screen.getByText("시금치볶음")).toBeTruthy();
    expect(screen.getByText("등록")).toBeTruthy();
    expect(screen.getByText("장보기 완료")).toBeTruthy();
    expect(screen.getByText("요리 완료")).toBeTruthy();

    const firstCard = screen.getByLabelText("김치찌개 식사 카드");
    const titleButton = within(firstCard).getByText("김치찌개");
    expect(titleButton.className).toContain("font-extrabold");
    expect(titleButton.getAttribute("style") ?? "").toContain("font-weight: 800");
    expect(within(firstCard).getByText(/2인분 · \d+분/)).toBeTruthy();
    expect(within(firstCard).queryByText(/\d+분 · 2인분/)).toBeNull();
    expect(within(firstCard).getByRole("button", { name: "장보기" }).querySelector("svg")).toBeTruthy();
    expect(screen.queryByText(/등록된 음식/)).toBeNull();
    expect(screen.queryByText(/개 음식/)).toBeNull();
    expect(screen.queryByText(/총 \d+인분 계획/)).toBeNull();
  });

  it("shows the app bar title as date and meal slot", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [] });

    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "4월 18일 · 아침" })).toBeTruthy();
    });
    expect(screen.queryByText(/아침 음식/)).toBeNull();
    expect(screen.queryByText("한 끼에 여러 음식을 같이 먹어요")).toBeNull();
  });

  it("returns to planner on back button tap", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [buildMeal()] });

    const user = userEvent.setup();
    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "뒤로 가기" }));
    expect(mockRouterReplace).toHaveBeenCalledWith("/planner");
    expect(mockRouterBack).not.toHaveBeenCalled();
  });

  it("starts a planner cooking session for a shopping_done meal and returns to the meal screen", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [buildMeal({ id: "meal-1", planned_servings: 2, status: "shopping_done" })],
    });
    createCookingSession.mockResolvedValue({
      session_id: "session-abc",
      recipe_id: "recipe-1",
      status: "in_progress",
      cooking_servings: 2,
      meals: [{ meal_id: "meal-1", is_cooked: false }],
    });

    const user = userEvent.setup();
    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "김치찌개 요리하기" }));

    await waitFor(() => {
      expect(createCookingSession).toHaveBeenCalledWith({
        recipe_id: "recipe-1",
        meal_ids: ["meal-1"],
        cooking_servings: 2,
      });
    });

    const pushedHref = mockRouterPush.mock.calls.at(-1)?.[0] as string;
    const pushedUrl = new URL(pushedHref, "http://homecook.local");
    expect(pushedUrl.pathname).toBe("/cooking/sessions/session-abc/cook-mode");
    expect(pushedUrl.searchParams.get("returnTo")).toBe(
      `/planner/${DEFAULT_PROPS.planDate}/${DEFAULT_PROPS.columnId}?slot=${encodeURIComponent(DEFAULT_PROPS.slotName)}`,
    );
  });

  it("uses only the selected shopping_done meal servings when the same recipe appears more than once", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [
        buildMeal({
          id: "meal-1",
          planned_servings: 2,
          status: "shopping_done",
        }),
        buildMeal({
          id: "meal-2",
          planned_servings: 3,
          status: "shopping_done",
        }),
      ],
    });
    createCookingSession.mockResolvedValue({
      session_id: "session-selected",
      recipe_id: "recipe-1",
      status: "in_progress",
      cooking_servings: 3,
      meals: [{ meal_id: "meal-2", is_cooked: false }],
    });

    const user = userEvent.setup();
    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getAllByText("김치찌개")).toHaveLength(2);
    });

    const cookButtons = screen.getAllByRole("button", {
      name: "김치찌개 요리하기",
    });
    await user.click(cookButtons[1]);

    await waitFor(() => {
      expect(createCookingSession).toHaveBeenCalledWith({
        recipe_id: "recipe-1",
        meal_ids: ["meal-2"],
        cooking_servings: 3,
      });
    });
  });

  it("does not show direct cook action for registered meals", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [buildMeal({ status: "registered" })],
    });

    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    expect(screen.queryByRole("button", { name: "김치찌개 요리하기" })).toBeNull();
    expect(createCookingSession).not.toHaveBeenCalled();
  });

  it("renders the desktop meal screen as a meal list with per-food actions", async () => {
    setDesktopViewport(true);
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [
        buildMeal({
          id: "meal-1",
          recipe_id: "recipe-1",
          recipe_title: "김치찌개",
          status: "shopping_done",
          planned_servings: 2,
        }),
        buildMeal({
          id: "meal-2",
          recipe_id: "recipe-2",
          recipe_title: "파스타",
          status: "registered",
          planned_servings: 1,
        }),
      ],
    });

    render(<MealScreen {...DEFAULT_PROPS} />);

    const list = await screen.findByTestId("web-meal-list");
    const summary = screen.getByTestId("web-meal-summary");

    expect(screen.getByRole("heading", { name: "4월 18일 아침 식사" })).toBeTruthy();
    expect(within(summary).getByRole("heading", { name: "4월 18일 아침" })).toBeTruthy();
    expect(within(summary).getByText("음식")).toBeTruthy();
    expect(within(summary).getByText("2개")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "4월 18일 · 아침" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "끼니 음식 2개" })).toBeNull();
    expect(within(list).getByText("김치찌개")).toBeTruthy();
    expect(within(list).getByText("파스타")).toBeTruthy();
    expect(screen.queryByLabelText("김치찌개 레시피 보기")).toBeNull();
    expect(within(list).queryByText("집밥")).toBeNull();
    expect(within(list).queryByText("간단")).toBeNull();
    expect(within(list).queryByText("플래너")).toBeNull();
    expect(within(list).getByRole("button", { name: "김치찌개 요리하기" })).toBeTruthy();
    expect(within(list).getAllByRole("button", { name: "장보기" })).toHaveLength(2);
    expect(within(list).getAllByRole("button", { name: "인분 증가" })).toHaveLength(2);
    expect(within(list).getAllByRole("button", { name: "인분 감소" })[0]?.className).toContain(
      "web-meal-stepper-decrease",
    );
    expect(within(list).getAllByRole("button", { name: "인분 증가" })[0]?.className).toContain(
      "web-meal-stepper-increase",
    );
    expect(list.querySelectorAll(".web-meal-list-footer")).toHaveLength(2);
    expect(list.querySelectorAll(".web-meal-list-delete .web-meal-delete-button")).toHaveLength(2);
    const addCta = screen.getByTestId("meal-screen-add-cta");
    expect(addCta.className).toContain("web-meal-add-link");
  });

  // ── Stepper — registered (no modal) ────────────────────────────────────

  it("calls updateMealServings directly for registered meals on stepper tap", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [buildMeal({ planned_servings: 2, status: "registered" })] });
    updateMealServings.mockResolvedValue({ id: "meal-1", planned_servings: 3, status: "registered" });

    const user = userEvent.setup();
    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "인분 증가" }));

    await waitFor(() => {
      expect(updateMealServings).toHaveBeenCalledWith("meal-1", 3);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not decrement below 1 serving — minus button is disabled", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [buildMeal({ planned_servings: 1, status: "registered" })] });

    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    const decBtn = screen.getByRole("button", { name: "인분 감소" });
    expect((decBtn as HTMLButtonElement).disabled).toBe(true);
    expect(updateMealServings).not.toHaveBeenCalled();
  });

  // ── Stepper — shopping_done / cook_done (modal required) ───────────────

  it("shows serving-change modal for shopping_done meal before API call", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [buildMeal({ planned_servings: 2, status: "shopping_done" })],
    });

    const user = userEvent.setup();
    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "인분 증가" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(updateMealServings).not.toHaveBeenCalled();
  });

  it("shows serving-change modal for cook_done meal before API call", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [buildMeal({ planned_servings: 2, status: "cook_done" })],
    });

    const user = userEvent.setup();
    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "인분 감소" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(updateMealServings).not.toHaveBeenCalled();
  });

  it("calls updateMealServings after serving-change modal confirmation", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [buildMeal({ id: "meal-1", planned_servings: 2, status: "shopping_done" })],
    });
    updateMealServings.mockResolvedValue({ id: "meal-1", planned_servings: 3, status: "shopping_done" });

    const user = userEvent.setup();
    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "인분 증가" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    await user.click(screen.getByTestId("serving-change-confirm"));

    await waitFor(() => {
      expect(updateMealServings).toHaveBeenCalledWith("meal-1", 3);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cancels serving-change modal without calling API", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [buildMeal({ planned_servings: 2, status: "shopping_done" })],
    });

    const user = userEvent.setup();
    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "인분 증가" }));

    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "취소" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(updateMealServings).not.toHaveBeenCalled();
  });

  // ── Delete ───────────────────────────────────────────────────────────────

  it("shows delete confirmation modal on delete tap", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [buildMeal({ recipe_title: "김치찌개" })] });

    const user = userEvent.setup();
    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "김치찌개 삭제" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(screen.getByRole("heading", { name: "이 식사를 삭제하시겠어요?" })).toBeTruthy();
    expect(screen.getByTestId("delete-confirm-icon")).toBeTruthy();
    expect(screen.getByTestId("delete-confirm").className).toContain("bg-[var(--danger)]");
    expect(screen.getByTestId("delete-confirm").className).toContain("min-w-[104px]");
    expect(deleteMeal).not.toHaveBeenCalled();
  });

  it("calls deleteMeal and removes card after confirmation", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [buildMeal({ id: "meal-1", recipe_title: "김치찌개" })] });
    deleteMeal.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "김치찌개 삭제" }));
    await user.click(screen.getByTestId("delete-confirm"));

    await waitFor(() => {
      expect(deleteMeal).toHaveBeenCalledWith("meal-1");
    });
    await waitFor(() => {
      expect(screen.queryByText("김치찌개")).toBeNull();
    });
  });

  it("cancels delete modal without calling deleteMeal", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [buildMeal({ recipe_title: "김치찌개" })] });

    const user = userEvent.setup();
    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "김치찌개 삭제" }));

    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "취소" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deleteMeal).not.toHaveBeenCalled();
    expect(screen.getByText("김치찌개")).toBeTruthy();
  });

  it("transitions to empty state after last meal is deleted", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [buildMeal({ id: "meal-1", recipe_title: "김치찌개" })] });
    deleteMeal.mockResolvedValue(undefined);

    const user = userEvent.setup();
    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "김치찌개 삭제" }));
    await user.click(screen.getByTestId("delete-confirm"));

    await waitFor(() => {
      expect(screen.getByTestId("meal-screen-empty")).toBeTruthy();
    });
  });

  // ── 409 conflict inline error ────────────────────────────────────────────

  it("shows inline 409 error on card when updateMealServings returns 409", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [buildMeal({ status: "registered" })] });
    updateMealServings.mockRejectedValue(createMealApiError(409, "서버 충돌"));

    const user = userEvent.setup();
    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "인분 증가" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(screen.getByRole("alert").textContent).toContain(
      "변경 중 충돌이 발생했어요. 새로고침 후 다시 시도해 주세요.",
    );
  });

  it("shows inline error on card when deleteMeal returns 409", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [buildMeal({ id: "meal-1" })] });
    deleteMeal.mockRejectedValue(createMealApiError(409, "충돌"));

    const user = userEvent.setup();
    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "김치찌개 삭제" }));
    await user.click(screen.getByTestId("delete-confirm"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeTruthy();
    });
    expect(screen.getByText("김치찌개")).toBeTruthy();
  });

  it("folds long ingredient chips into a compact +N summary", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [buildMeal({ recipe_title: "김치볶음밥" })],
    });

    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText("김치볶음밥")).toBeTruthy();
    });

    expect(screen.getByText("묵은지")).toBeTruthy();
    expect(screen.getByText("찬밥")).toBeTruthy();
    expect(screen.getByText("대파")).toBeTruthy();
    expect(screen.queryByText("계란")).toBeNull();
    expect(screen.getByText("+2")).toBeTruthy();
  });

  // ── Sticky CTA ───────────────────────────────────────────────────────────

  it("renders the 식사 추가 CTA on ready state", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [buildMeal()] });

    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByTestId("meal-screen-add-cta")).toBeTruthy();
    });
  });

  it("opens the meal-add option sheet from the app CTA instead of navigating to menu-add", async () => {
    const user = userEvent.setup();
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [buildMeal()] });

    render(<MealScreen {...DEFAULT_PROPS} />);

    await user.click(await screen.findByTestId("meal-screen-add-cta"));

    expect(mockRouterPush).not.toHaveBeenCalledWith(expect.stringContaining("/menu-add"));
    const sheet = screen.getByTestId("meal-screen-meal-add-sheet");
    expect(sheet).toBeTruthy();
    expect(within(sheet).getByRole("heading", { name: "식사 추가" })).toBeTruthy();
    expect(within(sheet).getByTestId("meal-add-target-badge").textContent).toContain(
      "4/18 아침",
    );

    await user.click(screen.getByRole("button", { name: /레시피 검색/ }));

    const searchDialog = await screen.findByRole("dialog", { name: "검색으로 추가" });
    expect(searchDialog.getAttribute("data-app-overlay-shell")).toBe("bottom-sheet");
    expect(screen.queryByTestId("meal-screen-meal-add-sheet")).toBeNull();
  });

  it("links the YouTube option directly to the full-screen import route from the app CTA", async () => {
    const user = userEvent.setup();
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [buildMeal()] });

    render(<MealScreen {...DEFAULT_PROPS} />);

    await user.click(await screen.findByTestId("meal-screen-add-cta"));

    const youtubeLink = screen.getByRole("link", { name: /유튜브 가져오기/ });
    expect(youtubeLink.getAttribute("href")).toContain("/menu/add/youtube?");
    expect(
      screen.queryByRole("dialog", { name: "유튜브 가져오기" }),
    ).toBeNull();
  });
});
