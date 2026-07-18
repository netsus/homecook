// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MealScreen } from "@/components/planner/meal-screen";
import { PRODUCT_PLANNER_RETURN_CONTEXT_KEY } from "@/lib/planner/product-planner-return-context";

// ── Module mocks ──────────────────────────────────────────────────────────────

const readE2EAuthOverride = vi.fn();
const fetchMeals = vi.fn();
const fetchPlannerNutrition = vi.fn();
const updateMealServings = vi.fn();
const deleteMeal = vi.fn();
const createMealSafe = vi.fn();
const createCookingSession = vi.fn();
const fetchRecipes = vi.fn();
const fetchLeftovers = vi.fn();
const updateProductPlannerEntryQuantity = vi.fn();
const deleteProductPlannerEntry = vi.fn();
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
  withE2EAuthOverrideHeaders: (init?: RequestInit) => init ?? {},
}));

vi.mock("@/lib/api/planner-nutrition", () => ({
  fetchPlannerNutrition: (...args: unknown[]) => fetchPlannerNutrition(...args),
  isPlannerNutritionApiError: (error: unknown) =>
    Boolean(error) && typeof error === "object" && "status" in (error as object),
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

vi.mock("@/lib/api/product-planner-entry", () => ({
  updateProductPlannerEntryQuantity: (...args: unknown[]) => updateProductPlannerEntryQuantity(...args),
  deleteProductPlannerEntry: (...args: unknown[]) => deleteProductPlannerEntry(...args),
  isProductPlannerEntryApiError: (error: unknown) =>
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

function buildProductEntry(id: string) {
  return {
    entry_type: "product" as const,
    id,
    product_id: "product-1",
    product_name: "플레인 요거트",
    product_brand: null,
    quantity: { amount: 1, unit: "serving" as const },
    workflow_status: null,
    product_nutrition_version_id: "version-1",
    basis_relations: [],
    nutrition: {
      basis: { amount: 1, unit: "serving" as const },
      values: {
        energy_kcal: {
          amount: 105,
          known_amount: null,
          status: "complete" as const,
          display_mode: "total" as const,
        },
      },
      calculation_status: "complete" as const,
      calculation_quality: "direct" as const,
      warnings: [],
      sources: [],
    },
  };
}

function buildProductEntryWithQuantity({
  amount = 1,
  basisAmount = amount,
  basisUnit,
  id,
  quantityUnit,
  relation,
}: {
  id: string;
  amount?: number;
  basisAmount?: number;
  basisUnit: "g" | "ml" | "serving" | "package";
  quantityUnit: "g" | "ml" | "serving" | "package";
  relation?: {
    from: { amount: number; unit: "g" | "ml" | "serving" | "package" };
    to: { amount: number; unit: "g" | "ml" | "serving" | "package" };
  };
}) {
  return {
    ...buildProductEntry(id),
    quantity: { amount, unit: quantityUnit },
    basis_relations: relation ? [relation] : [],
    nutrition: {
      ...buildProductEntry(id).nutrition,
      basis: { amount: basisAmount, unit: basisUnit },
    },
  };
}

function createMealApiError(status: number, message = "오류가 발생했어요.") {
  const error = new Error(message) as Error & { status: number; code: string };
  error.status = status;
  error.code = "ERROR";
  return error;
}

function createPlannerNutritionData() {
  const nutrition = {
    basis: { amount: 1 as const, unit: "range" as const },
    values: {
      energy_kcal: { amount: 640, known_amount: null, status: "complete" as const, display_mode: "total" as const },
      carbohydrate_g: { amount: 72, known_amount: null, status: "complete" as const, display_mode: "total" as const },
      protein_g: { amount: 31, known_amount: null, status: "complete" as const, display_mode: "total" as const },
      fat_g: { amount: 18, known_amount: null, status: "complete" as const, display_mode: "total" as const },
      sodium_mg: { amount: 890, known_amount: null, status: "complete" as const, display_mode: "total" as const },
    },
    calculation_status: "complete" as const,
    calculation_quality: "direct" as const,
    incomplete_entry_count: 0,
    warnings: [],
    sources: [],
  };

  return {
    range: { start_date: DEFAULT_PROPS.planDate, end_date: DEFAULT_PROPS.planDate },
    summary: { nutrition, recipe_entry_count: 1, product_entry_count: 0 },
    days: [
      {
        plan_date: DEFAULT_PROPS.planDate,
        nutrition,
        columns: [{ column_id: DEFAULT_PROPS.columnId, nutrition }],
      },
    ],
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
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
    fetchPlannerNutrition.mockReset();
    fetchPlannerNutrition.mockResolvedValue(createPlannerNutritionData());
    updateMealServings.mockReset();
    deleteMeal.mockReset();
    createMealSafe.mockReset();
    createCookingSession.mockReset();
    fetchRecipes.mockReset();
    fetchLeftovers.mockReset();
    updateProductPlannerEntryQuantity.mockReset();
    deleteProductPlannerEntry.mockReset();
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
    window.sessionStorage.clear();
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

  it.each([
    ["loading", () => new Promise<never>(() => {})],
    ["error", () => Promise.reject(createMealApiError(500))],
  ])(
    "keeps ready nutrition visible while the meal list is %s",
    async (_listState, fetchMealsResult) => {
      readE2EAuthOverride.mockReturnValue(true);
      fetchMeals.mockImplementation(fetchMealsResult);

      render(<MealScreen {...DEFAULT_PROPS} />);

      expect(await screen.findByText("640 kcal")).toBeTruthy();
      expect(screen.queryByText("계획 영양 정보 없음")).toBeNull();
    },
  );

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

  it("shows mobile meal actions only for the current meal status", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [
        buildMeal({ id: "meal-1", recipe_title: "등록식사", status: "registered" }),
        buildMeal({ id: "meal-2", recipe_title: "장보기식사", status: "shopping_done" }),
        buildMeal({ id: "meal-3", recipe_title: "완료식사", status: "cook_done" }),
      ],
    });

    render(<MealScreen {...DEFAULT_PROPS} />);

    const registeredCard = await screen.findByLabelText("등록식사 식사 카드");
    const shoppingDoneCard = screen.getByLabelText("장보기식사 식사 카드");
    const cookedCard = screen.getByLabelText("완료식사 식사 카드");

    expect(within(registeredCard).getByRole("button", { name: "장보기" })).toBeTruthy();
    expect(within(registeredCard).queryByRole("button", { name: "등록식사 요리하기" })).toBeNull();
    expect(within(shoppingDoneCard).queryByRole("button", { name: "장보기" })).toBeNull();
    expect(within(shoppingDoneCard).getByRole("button", { name: "장보기식사 요리하기" })).toBeTruthy();
    expect(within(cookedCard).queryByRole("button", { name: "장보기" })).toBeNull();
    expect(within(cookedCard).queryByRole("button", { name: "완료식사 요리하기" })).toBeNull();
  });

  it("shows desktop meal actions only for the current meal status", async () => {
    setDesktopViewport(true);
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [
        buildMeal({ id: "meal-1", recipe_title: "등록식사", status: "registered" }),
        buildMeal({ id: "meal-2", recipe_title: "장보기식사", status: "shopping_done" }),
        buildMeal({ id: "meal-3", recipe_title: "완료식사", status: "cook_done" }),
      ],
    });

    render(<MealScreen {...DEFAULT_PROPS} />);

    const registeredCard = await screen.findByLabelText("등록식사 끼니 음식");
    const shoppingDoneCard = screen.getByLabelText("장보기식사 끼니 음식");
    const cookedCard = screen.getByLabelText("완료식사 끼니 음식");

    expect(within(registeredCard).getByRole("button", { name: "장보기" })).toBeTruthy();
    expect(within(registeredCard).queryByRole("button", { name: "등록식사 요리하기" })).toBeNull();
    expect(within(shoppingDoneCard).queryByRole("button", { name: "장보기" })).toBeNull();
    expect(within(shoppingDoneCard).getByRole("button", { name: "장보기식사 요리하기" })).toBeTruthy();
    expect(within(cookedCard).queryByRole("button", { name: "장보기" })).toBeNull();
    expect(within(cookedCard).queryByRole("button", { name: "완료식사 요리하기" })).toBeNull();
  });

  it("renders the desktop meal screen as a meal list with per-food actions", async () => {
    setDesktopViewport(true);
    readE2EAuthOverride.mockReturnValue(true);
    const longRecipeTitle = "봄나물 된장 크림 리조또와 바삭한 두부 스테이크";
    fetchMeals.mockResolvedValue({
      items: [
        buildMeal({
          id: "meal-1",
          recipe_id: "recipe-1",
          recipe_title: longRecipeTitle,
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
    const firstCard = screen.getByLabelText(`${longRecipeTitle} 끼니 음식`);

    expect(screen.getByRole("heading", { name: "4월 18일 아침 식사" })).toBeTruthy();
    expect(within(summary).getByRole("heading", { name: "4월 18일 아침" })).toBeTruthy();
    expect(within(summary).getByText("음식")).toBeTruthy();
    expect(within(summary).getByText("2개")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "4월 18일 · 아침" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "끼니 음식 2개" })).toBeNull();
    expect(list.className).toContain("web-meal-row-list");
    expect(firstCard.className).toContain("web-meal-row-card");
    expect(firstCard.querySelector(".web-meal-list-body")).toBeTruthy();
    expect(firstCard.querySelector(".web-meal-list-actions-panel")).toBeTruthy();
    expect(firstCard.querySelector(".web-meal-list-footer")).toBeNull();
    expect(within(list).getByText(longRecipeTitle)).toBeTruthy();
    expect(within(list).getByText("파스타")).toBeTruthy();
    expect(screen.queryByLabelText(`${longRecipeTitle} 레시피 보기`)).toBeNull();
    expect(within(list).queryByText("집밥")).toBeNull();
    expect(within(list).queryByText("간단")).toBeNull();
    expect(within(list).queryByText("플래너")).toBeNull();
    expect(within(list).getByRole("button", { name: `${longRecipeTitle} 요리하기` })).toBeTruthy();
    expect(within(list).getAllByRole("button", { name: "장보기" })).toHaveLength(1);
    expect(within(list).getAllByRole("button", { name: "인분 증가" })).toHaveLength(2);
    expect(within(list).getAllByRole("button", { name: "인분 감소" })[0]?.className).toContain(
      "web-meal-stepper-decrease",
    );
    expect(within(list).getAllByRole("button", { name: "인분 증가" })[0]?.className).toContain(
      "web-meal-stepper-increase",
    );
    expect(list.querySelectorAll(".web-meal-list-footer")).toHaveLength(0);
    expect(list.querySelectorAll(".web-meal-list-actions-panel")).toHaveLength(2);
    expect(list.querySelectorAll(".web-meal-list-delete .web-meal-delete-button")).toHaveLength(2);
    const addCta = screen.getByTestId("meal-screen-add-cta");
    expect(addCta.className).toContain("web-meal-add-link");
  });

  it("lets a single desktop meal card use the main column width", async () => {
    setDesktopViewport(true);
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({
      items: [
        buildMeal({
          id: "meal-1",
          recipe_title: "긴 이름의 단일 식사 카드가 화면 가운데에서 작게 떠 보이지 않는 메뉴",
          status: "registered",
        }),
      ],
    });

    render(<MealScreen {...DEFAULT_PROPS} />);

    const list = await screen.findByTestId("web-meal-list");
    const card = screen.getByLabelText("긴 이름의 단일 식사 카드가 화면 가운데에서 작게 떠 보이지 않는 메뉴 끼니 음식");

    expect(list.className).toContain("web-meal-row-list");
    expect(card.className).toContain("web-meal-row-card");
    expect(list.querySelectorAll(".web-meal-row-card")).toHaveLength(1);
    expect(card.querySelector(".web-meal-list-actions-panel")).toBeTruthy();
  });

  // ── Stepper — registered (no modal) ────────────────────────────────────

  it("calls updateMealServings directly for registered meals on stepper tap", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [buildMeal({ planned_servings: 2, status: "registered" })] });
    updateMealServings.mockResolvedValue({ id: "meal-1", planned_servings: 3, status: "registered" });
    const pendingNutritionRefresh = createDeferred<ReturnType<typeof createPlannerNutritionData>>();
    fetchPlannerNutrition
      .mockReset()
      .mockResolvedValueOnce(createPlannerNutritionData())
      .mockReturnValueOnce(pendingNutritionRefresh.promise);

    const user = userEvent.setup();
    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "인분 증가" }));

    await waitFor(() => {
      expect(updateMealServings).toHaveBeenCalledWith("meal-1", 3);
    });
    await waitFor(() => expect(fetchPlannerNutrition).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/3인분 · \d+분/)).toBeTruthy();
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
    const pendingNutritionRefresh = createDeferred<ReturnType<typeof createPlannerNutritionData>>();
    fetchPlannerNutrition
      .mockReset()
      .mockResolvedValueOnce(createPlannerNutritionData())
      .mockReturnValueOnce(pendingNutritionRefresh.promise);

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
    await waitFor(() => expect(fetchPlannerNutrition).toHaveBeenCalledTimes(2));
    expect(screen.getByText("계획 영양 정보 없음")).toBeTruthy();
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

  it("refreshes nutrition without blocking the list after an inline recipe meal is added", async () => {
    const existingMeal = buildMeal({ id: "meal-existing", recipe_title: "된장찌개" });
    const addedMeal = buildMeal({ id: "meal-added", recipe_title: "김치찌개", planned_servings: 1 });
    const pendingNutritionRefresh = createDeferred<ReturnType<typeof createPlannerNutritionData>>();
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals
      .mockResolvedValueOnce({ items: [existingMeal], product_entries: [] })
      .mockResolvedValueOnce({ items: [existingMeal, addedMeal], product_entries: [] });
    fetchPlannerNutrition
      .mockReset()
      .mockResolvedValueOnce(createPlannerNutritionData())
      .mockReturnValueOnce(pendingNutritionRefresh.promise);
    fetchLeftovers.mockResolvedValue({
      items: [
        {
          id: "leftover-1",
          recipe_id: "recipe-1",
          recipe_title: "김치찌개",
          recipe_thumbnail_url: null,
          status: "leftover",
          cooked_at: "2026-04-17T00:00:00.000Z",
          eaten_at: null,
          cooking_servings: 1,
          source_meal_label: "저녁",
          source_planned_servings: 1,
        },
      ],
    });
    createMealSafe.mockResolvedValue({
      success: true,
      data: {
        id: "meal-added",
        recipe_id: "recipe-1",
        plan_date: DEFAULT_PROPS.planDate,
        column_id: DEFAULT_PROPS.columnId,
        planned_servings: 1,
        status: "registered",
        is_leftover: true,
        leftover_dish_id: "leftover-1",
        recipe_nutrition_snapshot_id: null,
      },
      error: null,
    });

    render(<MealScreen {...DEFAULT_PROPS} />);
    await userEvent.click(await screen.findByTestId("meal-screen-add-cta"));
    await userEvent.click(
      within(screen.getByTestId("meal-screen-meal-add-sheet")).getByTestId(
        "meal-add-option-leftover",
      ),
    );
    await userEvent.click(await screen.findByRole("button", { name: "추가" }));
    const servingsDialog = await screen.findByRole("dialog", { name: "계획 인분 입력" });
    await userEvent.click(within(servingsDialog).getByRole("button", { name: "추가하기" }));

    await waitFor(() => expect(fetchMeals).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(fetchPlannerNutrition).toHaveBeenCalledTimes(2));
    expect(screen.getByText("김치찌개")).toBeTruthy();
    expect(screen.getByTestId("meal-screen-add-cta")).toBeTruthy();
  });

  it("links the YouTube option directly to the full-screen import route from the app CTA", async () => {
    const user = userEvent.setup();
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [buildMeal()] });

    render(<MealScreen {...DEFAULT_PROPS} />);

    await user.click(await screen.findByTestId("meal-screen-add-cta"));

    const youtubeLink = screen.getByRole("link", { name: "유튜브" });
    expect(youtubeLink.getAttribute("href")).toContain("/menu/add/youtube?");
    expect(
      screen.queryByRole("dialog", { name: "유튜브 가져오기" }),
    ).toBeNull();
  });

  it.each([false, true])("uses the merge adapter in the real %s render and removes duplicate product response rows", async (desktop) => {
    setDesktopViewport(desktop);
    readE2EAuthOverride.mockReturnValue(true);
    const productEntry = {
      entry_type: "product" as const,
      id: "entry-duplicate",
      product_id: "product-1",
      product_name: "플레인 요거트",
      product_brand: null,
      quantity: { amount: 1, unit: "serving" as const },
      workflow_status: null,
      product_nutrition_version_id: "version-1",
      basis_relations: [],
      nutrition: {
        basis: { amount: 1, unit: "serving" as const },
        values: { energy_kcal: { amount: 105, known_amount: null, status: "complete" as const, display_mode: "total" as const } },
        calculation_status: "complete" as const,
        calculation_quality: "direct" as const,
        warnings: [],
        sources: [],
      },
    };
    fetchMeals.mockResolvedValue({ items: [buildMeal()], product_entries: [productEntry, productEntry] });

    render(<MealScreen {...DEFAULT_PROPS} />);

    expect(await screen.findAllByTestId("product-planner-entry-entry-duplicate")).toHaveLength(1);
  });

  it("moves PATCH 401 into the existing unauthorized return gate with the entry edit context", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    const productEntry = {
      entry_type: "product" as const,
      id: "entry-auth",
      product_id: "product-1",
      product_name: "플레인 요거트",
      product_brand: null,
      quantity: { amount: 1, unit: "serving" as const },
      workflow_status: null,
      product_nutrition_version_id: "version-1",
      basis_relations: [],
      nutrition: {
        basis: { amount: 1, unit: "serving" as const },
        values: { energy_kcal: { amount: 105, known_amount: null, status: "complete" as const, display_mode: "total" as const } },
        calculation_status: "complete" as const,
        calculation_quality: "direct" as const,
        warnings: [], sources: [],
      },
    };
    fetchMeals.mockResolvedValue({ items: [], product_entries: [productEntry] });
    updateProductPlannerEntryQuantity.mockRejectedValue(Object.assign(new Error("로그인이 필요해요."), { status: 401, code: "UNAUTHORIZED" }));

    render(<MealScreen {...DEFAULT_PROPS} />);
    await userEvent.click(await screen.findByRole("button", { name: "수량 변경" }));
    await userEvent.clear(screen.getByRole("spinbutton", { name: "완제품 변경 수량" }));
    await userEvent.type(screen.getByRole("spinbutton", { name: "완제품 변경 수량" }), "2");
    await userEvent.click(screen.getAllByRole("button", { name: "수량 변경" }).at(-1)!);

    const login = await screen.findByTestId("social-login-buttons");
    expect(decodeURIComponent(login.getAttribute("data-next-path") ?? "")).toContain("productEntryId=entry-auth");
    expect(decodeURIComponent(login.getAttribute("data-next-path") ?? "")).toContain("productAction=edit");
  });

  it.each([
    {
      expectedMin: "1",
      expectedStep: "1",
      name: "g quantity entries",
      productEntry: buildProductEntryWithQuantity({
        id: "entry-g-step",
        amount: 100,
        basisAmount: 100,
        basisUnit: "g",
        quantityUnit: "g",
        relation: { from: { amount: 1, unit: "serving" }, to: { amount: 100, unit: "g" } },
      }),
    },
    {
      expectedMin: "1",
      expectedStep: "1",
      name: "ml quantity entries",
      productEntry: buildProductEntryWithQuantity({
        id: "entry-ml-step",
        amount: 100,
        basisAmount: 100,
        basisUnit: "ml",
        quantityUnit: "ml",
        relation: { from: { amount: 1, unit: "package" }, to: { amount: 100, unit: "ml" } },
      }),
    },
    {
      expectedMin: "0.01",
      expectedStep: "any",
      name: "serving quantity entries",
      productEntry: buildProductEntryWithQuantity({
        id: "entry-serving-step",
        basisUnit: "serving",
        quantityUnit: "serving",
        relation: { from: { amount: 1, unit: "serving" }, to: { amount: 100, unit: "g" } },
      }),
    },
    {
      expectedMin: "0.01",
      expectedStep: "any",
      name: "package quantity entries",
      productEntry: buildProductEntryWithQuantity({
        id: "entry-package-step",
        basisUnit: "package",
        quantityUnit: "package",
        relation: { from: { amount: 1, unit: "package" }, to: { amount: 100, unit: "ml" } },
      }),
    },
  ])("uses browser-valid min and step semantics for $name", async ({ expectedMin, expectedStep, productEntry }) => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [], product_entries: [productEntry] });

    render(<MealScreen {...DEFAULT_PROPS} />);
    await userEvent.click(await screen.findByRole("button", { name: "수량 변경" }));

    const dialog = screen.getByRole("dialog", { name: "완제품 수량 변경" });
    const quantityInput = within(dialog).getByRole("spinbutton", { name: "완제품 변경 수량" }) as HTMLInputElement;

    expect(quantityInput.getAttribute("min")).toBe(expectedMin);
    expect(quantityInput.getAttribute("step")).toBe(expectedStep);
    expect(quantityInput.validity.stepMismatch).toBe(false);
    expect(quantityInput.validity.rangeUnderflow).toBe(false);
    expect(quantityInput.validity.valid).toBe(true);
  });

  it.each([
    {
      fromUnit: "serving",
      switchToUnit: "g",
      productEntry: buildProductEntryWithQuantity({
        id: "entry-serving-switch-step",
        basisUnit: "serving",
        quantityUnit: "serving",
        relation: { from: { amount: 1, unit: "serving" }, to: { amount: 100, unit: "g" } },
      }),
    },
    {
      fromUnit: "package",
      switchToUnit: "ml",
      productEntry: buildProductEntryWithQuantity({
        id: "entry-package-switch-step",
        basisUnit: "package",
        quantityUnit: "package",
        relation: { from: { amount: 1, unit: "package" }, to: { amount: 100, unit: "ml" } },
      }),
    },
  ])("updates the input min and step immediately when the unit changes from $fromUnit to $switchToUnit", async ({ productEntry, switchToUnit }) => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [], product_entries: [productEntry] });

    render(<MealScreen {...DEFAULT_PROPS} />);
    await userEvent.click(await screen.findByRole("button", { name: "수량 변경" }));

    const dialog = screen.getByRole("dialog", { name: "완제품 수량 변경" });
    const quantityInput = within(dialog).getByRole("spinbutton", {
      name: "완제품 변경 수량",
    }) as HTMLInputElement;
    const unitSelect = within(dialog).getByRole("combobox", { name: "완제품 변경 수량 단위" });

    expect(quantityInput.getAttribute("min")).toBe("0.01");
    expect(quantityInput.getAttribute("step")).toBe("any");
    expect(quantityInput.validity.stepMismatch).toBe(false);
    expect(quantityInput.validity.valid).toBe(true);

    await userEvent.selectOptions(unitSelect, switchToUnit);
    expect(quantityInput.getAttribute("min")).toBe("1");
    expect(quantityInput.getAttribute("step")).toBe("1");
    expect(quantityInput.validity.stepMismatch).toBe(false);
    expect(quantityInput.validity.rangeUnderflow).toBe(false);
    expect(quantityInput.validity.valid).toBe(true);
  });

  it("clears restored product edit context when the header close button dismisses the dialog", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    const productEntry = buildProductEntry("entry-restored-close");
    fetchMeals.mockResolvedValue({ items: [], product_entries: [productEntry] });
    window.sessionStorage.setItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY, JSON.stringify({
      version: 1,
      kind: "meal-entry",
      planDate: DEFAULT_PROPS.planDate,
      columnId: DEFAULT_PROPS.columnId,
      slotName: DEFAULT_PROPS.slotName,
      entryId: productEntry.id,
      action: "edit",
      quantityAmount: "2",
      quantityUnit: "serving",
    }));

    const view = render(<MealScreen {...DEFAULT_PROPS} />);
    const restoredDialog = await screen.findByRole("dialog", { name: "완제품 수량 변경" });
    await userEvent.click(within(restoredDialog).getByRole("button", { name: "닫기" }));

    expect(window.sessionStorage.getItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY)).toBeNull();
    expect(screen.queryByRole("dialog", { name: "완제품 수량 변경" })).toBeNull();
    view.unmount();

    render(<MealScreen {...DEFAULT_PROPS} />);
    await screen.findByTestId(`product-planner-entry-${productEntry.id}`);
    expect(screen.queryByRole("dialog", { name: "완제품 수량 변경" })).toBeNull();
  });

  it("allows only one product quantity PATCH while the first request is in flight", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    const productEntry = buildProductEntry("entry-patch-guard");
    const pendingPatch = createDeferred<typeof productEntry>();
    fetchMeals.mockResolvedValue({ items: [], product_entries: [productEntry] });
    updateProductPlannerEntryQuantity.mockReturnValue(pendingPatch.promise);
    const pendingNutritionRefresh = createDeferred<ReturnType<typeof createPlannerNutritionData>>();
    fetchPlannerNutrition
      .mockReset()
      .mockResolvedValueOnce(createPlannerNutritionData())
      .mockReturnValueOnce(pendingNutritionRefresh.promise);

    render(<MealScreen {...DEFAULT_PROPS} />);
    await userEvent.click(await screen.findByRole("button", { name: "수량 변경" }));
    const dialog = screen.getByRole("dialog", { name: "완제품 수량 변경" });
    const input = within(dialog).getByRole("spinbutton", { name: "완제품 변경 수량" });
    const confirm = within(dialog).getByRole("button", { name: "수량 변경" });
    await userEvent.clear(input);
    await userEvent.type(input, "2");
    fireEvent.click(confirm);
    fireEvent.change(input, { target: { value: "3" } });
    fireEvent.click(confirm);

    expect(updateProductPlannerEntryQuantity).toHaveBeenCalledTimes(1);
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect((input as HTMLInputElement).disabled).toBe(true);

    pendingPatch.resolve({ ...productEntry, quantity: { amount: 2, unit: "serving" } });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "완제품 수량 변경" })).toBeNull());
    await waitFor(() => expect(fetchPlannerNutrition).toHaveBeenCalledTimes(2));
    expect(screen.getByText(/2회/)).toBeTruthy();
  });

  it("cleans only product edit query fields after a restored PATCH succeeds", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    const productEntry = buildProductEntry("entry-success-cleanup");
    const restoredParams = new URLSearchParams({
      slot: DEFAULT_PROPS.slotName,
      productAction: "edit",
      productEntryId: productEntry.id,
      productAmount: "2",
      productUnit: "serving",
      returnTo: "/planner?week=next",
      returnSurface: "planner-week",
      restore: "meal-card",
      keep: "unrelated",
    });
    navigationMocks.searchParams.mockReturnValue(restoredParams);
    fetchMeals.mockResolvedValue({ items: [], product_entries: [productEntry] });
    updateProductPlannerEntryQuantity.mockResolvedValue({
      ...productEntry,
      quantity: { amount: 2, unit: "serving" },
    });
    window.sessionStorage.setItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY, JSON.stringify({
      version: 1,
      kind: "meal-entry",
      planDate: DEFAULT_PROPS.planDate,
      columnId: DEFAULT_PROPS.columnId,
      slotName: DEFAULT_PROPS.slotName,
      entryId: productEntry.id,
      action: "edit",
      quantityAmount: "2",
      quantityUnit: "serving",
    }));

    render(<MealScreen {...DEFAULT_PROPS} />);
    const dialog = await screen.findByRole("dialog", { name: "완제품 수량 변경" });
    await userEvent.click(within(dialog).getByRole("button", { name: "수량 변경" }));

    await waitFor(() => expect(mockRouterReplace).toHaveBeenCalledTimes(1));
    const expectedParams = new URLSearchParams(restoredParams);
    for (const key of ["productAction", "productEntryId", "productAmount", "productUnit"]) {
      expectedParams.delete(key);
    }
    expect(mockRouterReplace).toHaveBeenCalledWith(
      `/planner/${DEFAULT_PROPS.planDate}/${DEFAULT_PROPS.columnId}?${expectedParams.toString()}`,
    );
    expect(window.sessionStorage.getItem(PRODUCT_PLANNER_RETURN_CONTEXT_KEY)).toBeNull();
  });

  it("maps PATCH basis mismatch to the official UI copy and keeps the edit dialog open", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    const productEntry = {
      entry_type: "product" as const,
      id: "entry-mismatch",
      product_id: "product-1",
      product_name: "플레인 요거트",
      product_brand: null,
      quantity: { amount: 1, unit: "serving" as const },
      workflow_status: null,
      product_nutrition_version_id: "version-1",
      basis_relations: [],
      nutrition: {
        basis: { amount: 1, unit: "serving" as const },
        values: { energy_kcal: { amount: 105, known_amount: null, status: "complete" as const, display_mode: "total" as const } },
        calculation_status: "complete" as const,
        calculation_quality: "direct" as const,
        warnings: [], sources: [],
      },
    };
    fetchMeals.mockResolvedValue({ items: [], product_entries: [productEntry] });
    updateProductPlannerEntryQuantity.mockRejectedValue(Object.assign(
      new Error("이 수량 단위로 영양을 계산할 수 없어요."),
      { status: 422, code: "NUTRITION_BASIS_MISMATCH" },
    ));

    render(<MealScreen {...DEFAULT_PROPS} />);
    await userEvent.click(await screen.findByRole("button", { name: "수량 변경" }));
    const dialog = screen.getByRole("dialog", { name: "완제품 수량 변경" });
    await userEvent.click(screen.getAllByRole("button", { name: "수량 변경" }).at(-1)!);

    expect(await screen.findByText("이 기준으로는 수량을 바꿀 수 없어요")).toBeTruthy();
    expect(screen.queryByText("이 수량 단위로 영양을 계산할 수 없어요.")).toBeNull();
    expect(dialog.isConnected).toBe(true);
  });

  it("keeps a failed product delete visible and retries it from the same dialog", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    const productEntry = {
      entry_type: "product" as const,
      id: "entry-delete-retry",
      product_id: "product-1",
      product_name: "플레인 요거트",
      product_brand: null,
      quantity: { amount: 1, unit: "serving" as const },
      workflow_status: null,
      product_nutrition_version_id: "version-1",
      basis_relations: [],
      nutrition: {
        basis: { amount: 1, unit: "serving" as const },
        values: { energy_kcal: { amount: 105, known_amount: null, status: "complete" as const, display_mode: "total" as const } },
        calculation_status: "complete" as const,
        calculation_quality: "direct" as const,
        warnings: [], sources: [],
      },
    };
    const firstDelete = createDeferred<unknown>();
    fetchMeals.mockResolvedValue({ items: [], product_entries: [productEntry] });
    deleteProductPlannerEntry
      .mockReturnValueOnce(firstDelete.promise)
      .mockResolvedValueOnce({ deleted: true, entry_id: productEntry.id });
    const pendingNutritionRefresh = createDeferred<ReturnType<typeof createPlannerNutritionData>>();
    fetchPlannerNutrition
      .mockReset()
      .mockResolvedValueOnce(createPlannerNutritionData())
      .mockReturnValueOnce(pendingNutritionRefresh.promise);

    render(<MealScreen {...DEFAULT_PROPS} />);
    const card = await screen.findByTestId("product-planner-entry-entry-delete-retry");
    await userEvent.click(within(card).getByRole("button", { name: /완제품 계획 삭제/ }));
    const dialog = screen.getByRole("dialog", { name: "완제품 계획 삭제" });
    const confirm = within(dialog).getByTestId("product-delete-confirm");
    await userEvent.click(confirm);

    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(card.isConnected).toBe(true);
    expect(dialog.isConnected).toBe(true);
    firstDelete.reject(createMealApiError(500, "삭제 서버 오류가 발생했어요."));

    expect((await within(dialog).findByRole("alert")).textContent).toBe("삭제 서버 오류가 발생했어요.");
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    expect(card.isConnected).toBe(true);
    await userEvent.click(confirm);

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "완제품 계획 삭제" })).toBeNull());
    expect(screen.queryByTestId("product-planner-entry-entry-delete-retry")).toBeNull();
    expect(deleteProductPlannerEntry).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(fetchPlannerNutrition).toHaveBeenCalledTimes(2));
    expect(screen.getByText("계획 영양 정보 없음")).toBeTruthy();
  });
});
