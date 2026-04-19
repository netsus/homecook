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
const isMealApiError = vi.fn(
  (error: unknown): error is Error & { status: number; code: string } =>
    Boolean(error) &&
    typeof error === "object" &&
    "status" in (error as Record<string, unknown>),
);
const mockRouterBack = vi.fn();
const mockRouterPush = vi.fn();

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  readE2EAuthOverride: () => readE2EAuthOverride(),
}));

vi.mock("@/lib/api/meal", () => ({
  fetchMeals: (...args: unknown[]) => fetchMeals(...args),
  updateMealServings: (...args: unknown[]) => updateMealServings(...args),
  deleteMeal: (...args: unknown[]) => deleteMeal(...args),
  isMealApiError: (error: unknown) => isMealApiError(error),
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
  }),
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

// ── Test suite ────────────────────────────────────────────────────────────────

describe("MealScreen", () => {
  beforeEach(() => {
    readE2EAuthOverride.mockReset();
    fetchMeals.mockReset();
    updateMealServings.mockReset();
    deleteMeal.mockReset();
    mockRouterBack.mockReset();
    mockRouterPush.mockReset();
    isMealApiError.mockImplementation(
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

  it("renders meal cards with recipe title and status badge", async () => {
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
    expect(screen.getByLabelText("식사 등록 완료")).toBeTruthy();
    expect(screen.getByLabelText("장보기 완료")).toBeTruthy();
    expect(screen.getByLabelText("요리 완료")).toBeTruthy();
  });

  it("shows the app bar title heading", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [] });

    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    });
  });

  it("calls router.back() on back button tap", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [buildMeal()] });

    const user = userEvent.setup();
    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "뒤로 가기" }));
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
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

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("이 식사를 삭제하시겠어요?")).toBeTruthy();
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

  // ── Sticky CTA ───────────────────────────────────────────────────────────

  it("renders the 식사 추가 CTA on ready state", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchMeals.mockResolvedValue({ items: [buildMeal()] });

    render(<MealScreen {...DEFAULT_PROPS} />);

    await waitFor(() => {
      expect(screen.getByTestId("meal-screen-add-cta")).toBeTruthy();
    });
  });
});
