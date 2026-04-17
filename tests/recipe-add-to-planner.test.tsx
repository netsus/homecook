// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecipeDetailScreen } from "@/components/recipe/recipe-detail-screen";
import { MOCK_RECIPE_DETAIL, MOCK_RECIPE_ID } from "@/lib/mock/recipes";
import { PENDING_ACTION_KEY } from "@/lib/auth/pending-action";
import { useAuthGateStore } from "@/stores/ui-store";
import type { PlannerData } from "@/types/planner";
import type { MealCreateData } from "@/types/meal";

const fetchJson = vi.fn();
const fetchPlanner = vi.fn();
const createMeal = vi.fn();
const getSession = vi.fn();
const onAuthStateChange = vi.fn();
const hasSupabasePublicEnv = vi.fn();

vi.mock("@/lib/api/fetch-json", () => ({
  fetchJson: (...args: unknown[]) => fetchJson(...args),
}));

vi.mock("@/lib/api/planner", () => ({
  fetchPlanner: (...args: unknown[]) => fetchPlanner(...args),
  createDefaultPlannerRange: () => ({ startDate: "2026-04-14", endDate: "2026-04-20" }),
  isPlannerApiError: () => false,
  shiftPlannerRange: (range: { startDate: string; endDate: string }, delta: number) => {
    const start = new Date(`${range.startDate}T00:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() + delta);
    const end = new Date(`${range.endDate}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + delta);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return { startDate: fmt(start), endDate: fmt(end) };
  },
}));

vi.mock("@/lib/api/meal", () => ({
  createMeal: (...args: unknown[]) => createMeal(...args),
  isMealApiError: (error: unknown) =>
    error instanceof Error && "status" in error && "code" in error,
}));

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({
    auth: { getSession, onAuthStateChange },
  }),
}));

vi.mock("@/lib/supabase/env", () => ({
  hasSupabasePublicEnv: () => hasSupabasePublicEnv(),
}));

vi.mock("@/components/auth/social-login-buttons-deferred", () => ({
  SocialLoginButtonsDeferred: ({ nextPath }: { nextPath: string }) => (
    <div>social-buttons:{nextPath}</div>
  ),
}));

function buildPlannerData(): PlannerData {
  return {
    columns: [
      { id: "col-breakfast", name: "아침", sort_order: 1 },
      { id: "col-lunch", name: "점심", sort_order: 2 },
      { id: "col-snack", name: "간식", sort_order: 3 },
      { id: "col-dinner", name: "저녁", sort_order: 4 },
    ],
    meals: [],
  };
}

function buildMealCreateData(): MealCreateData {
  return {
    id: "meal-new-1",
    recipe_id: MOCK_RECIPE_ID,
    plan_date: "2026-04-14",
    column_id: "col-breakfast",
    planned_servings: 2,
    status: "registered",
    is_leftover: false,
    leftover_dish_id: null,
  };
}

describe("planner add flow", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    fetchJson.mockReset();
    fetchPlanner.mockReset();
    createMeal.mockReset();
    getSession.mockReset();
    onAuthStateChange.mockReset();
    hasSupabasePublicEnv.mockReset();
    useAuthGateStore.setState({ isOpen: false, action: null });
    window.localStorage.clear();

    fetchJson.mockResolvedValue(MOCK_RECIPE_DETAIL);
    getSession.mockResolvedValue({ data: { session: null } });
    onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    hasSupabasePublicEnv.mockReturnValue(true);
  });

  // accept-unauthorized: guest taps [플래너에 추가] → login gate opens
  it("opens the login gate when a guest taps 플래너에 추가", async () => {
    render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    await userEvent.click(
      await screen.findByRole("button", { name: "플래너에 추가" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/로그인이 필요한 작업이에요/)).toBeTruthy();
    expect(useAuthGateStore.getState().action?.type).toBe("planner");
  });

  // accept-loading: sheet shows loading state while columns are being fetched
  it("shows a loading skeleton while planner columns are loading", async () => {
    let resolveColumns!: (data: PlannerData) => void;
    fetchPlanner.mockReturnValue(
      new Promise<PlannerData>((res) => {
        resolveColumns = res;
      }),
    );

    render(
      <RecipeDetailScreen
        initialAuthenticated
        recipeId={MOCK_RECIPE_DETAIL.id}
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "플래너에 추가" }),
    );

    expect(
      await screen.findByLabelText("플래너 정보 불러오는 중"),
    ).toBeTruthy();

    // Cleanup — resolve so component can unmount cleanly
    resolveColumns(buildPlannerData());
  });

  // accept-happy-path: authenticated user submits → meal created → success toast
  it("creates a meal and shows success feedback on submit", async () => {
    fetchPlanner.mockResolvedValue(buildPlannerData());
    createMeal.mockResolvedValue(buildMealCreateData());

    render(
      <RecipeDetailScreen
        initialAuthenticated
        recipeId={MOCK_RECIPE_DETAIL.id}
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "플래너에 추가" }),
    );

    // Sheet should open with columns
    const dialog = await screen.findByRole("dialog", { name: "플래너에 추가" });
    expect(within(dialog).getByRole("button", { name: "아침" })).toBeTruthy();

    // Submit
    await userEvent.click(
      within(dialog).getByRole("button", { name: "플래너에 추가" }),
    );

    // Sheet closes, success toast appears
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "플래너에 추가" })).toBeNull();
    });
    // Toast: exact contract format "N월 D일 아침에 추가됐어요" (D3, no trailing period)
    // Date is today's selectableDates[0], built locale-independently the same way the component does
    const today = new Date();
    const m = today.getMonth() + 1;
    const d = today.getDate();
    const expectedToast = `${m}월 ${d}일 아침에 추가됐어요`;
    await waitFor(() => {
      const statusElements = screen.getAllByRole("status");
      const toast = statusElements.find((el) => el.textContent === expectedToast);
      expect(toast).toBeTruthy();
    });

    // Verify createMeal was called with correct args
    expect(createMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        recipe_id: MOCK_RECIPE_DETAIL.id,
        column_id: "col-breakfast",
        planned_servings: expect.any(Number),
      }),
    );
  });

  // accept-idempotency: submit button is disabled while submitting (no double-submit)
  it("disables the submit button and shows pending label while submitting", async () => {
    fetchPlanner.mockResolvedValue(buildPlannerData());

    let resolveMeal!: (data: MealCreateData) => void;
    createMeal.mockReturnValue(
      new Promise<MealCreateData>((res) => {
        resolveMeal = res;
      }),
    );

    render(
      <RecipeDetailScreen
        initialAuthenticated
        recipeId={MOCK_RECIPE_DETAIL.id}
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "플래너에 추가" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "플래너에 추가" });
    const submitBtn = within(dialog).getByRole("button", { name: "플래너에 추가" });
    await userEvent.click(submitBtn);

    // Button should be replaced with pending text
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "추가 중…" })).toBeTruthy();
    });
    expect(within(dialog).getByRole("button", { name: "추가 중…" }).hasAttribute("disabled")).toBe(true);

    // Cleanup
    resolveMeal(buildMealCreateData());
  });

  // accept-error: submit failure shows error inside sheet
  it("shows an error message inside the sheet when createMeal fails", async () => {
    fetchPlanner.mockResolvedValue(buildPlannerData());

    const apiError = new Error("플래너 추가에 실패했어요. 다시 시도해주세요.");
    createMeal.mockRejectedValue(apiError);

    render(
      <RecipeDetailScreen
        initialAuthenticated
        recipeId={MOCK_RECIPE_DETAIL.id}
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "플래너에 추가" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "플래너에 추가" });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "플래너에 추가" }),
    );

    // Error message appears inside dialog, sheet stays open
    await waitFor(() => {
      expect(within(dialog).getByText(/플래너 추가에 실패했어요/)).toBeTruthy();
    });
    expect(screen.getByRole("dialog", { name: "플래너에 추가" })).toBeTruthy();
  });

  // accept-return-to-action: pending "planner" action after login → sheet auto-opens
  it("auto-opens planner add sheet when returning from login gate with pending planner action", async () => {
    fetchPlanner.mockResolvedValue(buildPlannerData());

    window.localStorage.setItem(
      PENDING_ACTION_KEY,
      JSON.stringify({
        type: "planner",
        recipeId: MOCK_RECIPE_DETAIL.id,
        redirectTo: `/recipe/${MOCK_RECIPE_DETAIL.id}`,
        createdAt: Date.now(),
      }),
    );

    render(
      <RecipeDetailScreen
        initialAuthenticated
        recipeId={MOCK_RECIPE_DETAIL.id}
      />,
    );

    // Wait for recipe to load then sheet should open automatically
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "플래너에 추가" })).toBeTruthy();
    });

    // The login return feedback should be shown
    expect(screen.getByText(/로그인 완료.*플래너/)).toBeTruthy();
  });
});
