// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlannerWeekScreen } from "@/components/planner/planner-week-screen";
import { resetPlannerStore } from "@/stores/planner-store";
import type { PlannerData } from "@/types/planner";
import type { ProductPlannerEntryData } from "@/types/product-planner-entry";

const readE2EAuthOverride = vi.fn();
const fetchPlanner = vi.fn();
const deleteProductPlannerEntry = vi.fn();
const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  searchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: navigationMocks.push,
    replace: navigationMocks.replace,
  }),
  useSearchParams: () => navigationMocks.searchParams(),
}));

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  readE2EAuthOverride: () => readE2EAuthOverride(),
  withE2EAuthOverrideHeaders: (init?: RequestInit) => init ?? {},
}));

vi.mock("@/lib/api/planner", () => ({
  createDefaultPlannerRange: () => ({
    endDate: "2026-03-30",
    startDate: "2026-03-24",
  }),
  fetchPlanner: (...args: unknown[]) => fetchPlanner(...args),
  isPlannerApiError: (error: unknown) =>
    Boolean(error) && typeof error === "object" && "status" in (error as object),
  shiftPlannerRange: (
    range: { endDate: string; startDate: string },
    dayDelta: number,
  ) => {
    const start = new Date(`${range.startDate}T00:00:00.000Z`);
    const end = new Date(`${range.endDate}T00:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() + dayDelta);
    end.setUTCDate(end.getUTCDate() + dayDelta);
    return {
      endDate: end.toISOString().slice(0, 10),
      startDate: start.toISOString().slice(0, 10),
    };
  },
}));

vi.mock("@/lib/api/product-planner-entry", () => ({
  deleteProductPlannerEntry: (...args: unknown[]) =>
    deleteProductPlannerEntry(...args),
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

vi.mock("@/components/auth/social-login-buttons", () => ({
  SocialLoginButtons: ({ nextPath }: { nextPath: string }) => (
    <div data-next-path={nextPath} data-testid="social-login-buttons" />
  ),
}));

vi.mock("@/components/shared/profile-summary-button", () => ({
  ProfileSummaryButton: () => <button type="button">프로필</button>,
}));

function createProductEntry(
  overrides: Partial<ProductPlannerEntryData> = {},
): ProductPlannerEntryData {
  return {
    basis_relations: [],
    column_id: "column-lunch",
    entry_type: "product",
    id: "legacy-product-1",
    nutrition: {
      basis: { amount: 1, unit: "serving" },
      calculation_quality: "direct",
      calculation_status: "complete",
      sources: [],
      values: {
        energy_kcal: {
          amount: 105,
          display_mode: "total",
          known_amount: null,
          status: "complete",
        },
      },
      warnings: [],
    },
    plan_date: "2026-03-24",
    product_brand: "무먹 식품",
    product_id: "product-1",
    product_name: "플레인 요거트",
    product_nutrition_version_id: "version-1",
    quantity: { amount: 1, unit: "serving" },
    workflow_status: null,
    ...overrides,
  };
}

function createPlannerData({
  columns = [
    { id: "column-breakfast", name: "아침", sort_order: 0 },
    { id: "column-lunch", name: "점심", sort_order: 1 },
    { id: "column-dinner", name: "저녁", sort_order: 2 },
  ],
  meals = [
    {
      column_id: "column-breakfast",
      id: "meal-registered",
      is_leftover: false,
      plan_date: "2026-03-24",
      planned_servings: 2,
      recipe_id: "recipe-1",
      recipe_thumbnail_url: null,
      recipe_title: "김치찌개",
      status: "registered" as const,
    },
    {
      column_id: "column-lunch",
      id: "meal-shopping-done",
      is_leftover: false,
      plan_date: "2026-03-24",
      planned_servings: 1,
      recipe_id: "recipe-2",
      recipe_thumbnail_url: null,
      recipe_title: "샐러드",
      status: "shopping_done" as const,
    },
  ],
  productEntries = [],
}: {
  columns?: PlannerData["columns"];
  meals?: PlannerData["meals"];
  productEntries?: PlannerData["product_entries"];
} = {}): PlannerData {
  return { columns, meals, product_entries: productEntries };
}

describe("planner week screen Stage 4", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-03-24T03:00:00.000Z"));
    readE2EAuthOverride.mockReset();
    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner.mockReset();
    fetchPlanner.mockResolvedValue(createPlannerData());
    deleteProductPlannerEntry.mockReset();
    deleteProductPlannerEntry.mockResolvedValue({
      deleted: true,
      entry_id: "legacy-product-1",
    });
    navigationMocks.push.mockReset();
    navigationMocks.replace.mockReset();
    navigationMocks.searchParams.mockReset();
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams());
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
    window.sessionStorage.clear();
    resetPlannerStore();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("preserves the exact segment/date deep link in the guest login return", async () => {
    readE2EAuthOverride.mockReturnValue(false);
    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams("segment=log&date=2026-03-25"),
    );

    render(<PlannerWeekScreen />);

    expect(await screen.findByRole("heading", { name: "이 화면은 로그인이 필요해요" }))
      .toBeTruthy();
    expect(screen.getByTestId("social-login-buttons").getAttribute("data-next-path"))
      .toBe("/planner?segment=log&date=2026-03-25");
    expect(fetchPlanner).not.toHaveBeenCalled();
  });

  it("renders the plan shell without calling or showing planner nutrition", async () => {
    render(<PlannerWeekScreen />);

    expect(await screen.findByRole("tab", { name: "요리 계획" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "식사 기록" })).toBeTruthy();
    expect(screen.queryByText(/계획 영양/)).toBeNull();
    expect(fetchPlanner).toHaveBeenCalledTimes(1);

    const rail = screen.getByTestId("planner-week-date-rail");
    expect(within(rail).getAllByRole("button")).toHaveLength(7);
    expect(screen.getByTestId("planner-two-day-overview").children).toHaveLength(2);
  });

  it("keeps recipe meals in the selected-day detail with status-specific actions", async () => {
    fetchPlanner.mockResolvedValue(
      createPlannerData({
        meals: [
          ...createPlannerData().meals,
          {
            column_id: "column-dinner",
            id: "meal-next-day",
            is_leftover: false,
            plan_date: "2026-03-25",
            planned_servings: 2,
            recipe_id: "recipe-3",
            recipe_thumbnail_url: null,
            recipe_title: "다음 날 된장찌개",
            status: "cook_done",
          },
        ],
      }),
    );
    render(<PlannerWeekScreen />);

    expect(await screen.findByText("김치찌개")).toBeTruthy();
    expect(screen.getByText("샐러드")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "장보기" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "요리하기" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "상세" })).toHaveLength(2);
    expect(screen.getByText("비어 있음")).toBeTruthy();
    expect(screen.queryByText("식사 추가")).toBeNull();
    expect(screen.queryByText("완제품 추가")).toBeNull();
    expect(screen.getByText("등록 1 · 장보기 완료 1 · 요리 완료 0"))
      .toBeTruthy();
    expect(screen.queryByText("다음 날 된장찌개")).toBeNull();
  });

  it("loads the meal-log segment without requesting private planner data", async () => {
    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams("segment=log&date=2026-03-24"),
    );

    render(<PlannerWeekScreen />);

    expect(await screen.findByRole("heading", { name: "3월 24일 화요일 식사 기록" }))
      .toBeTruthy();
    expect(fetchPlanner).not.toHaveBeenCalled();

    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(
      screen.getByRole("tab", { name: "요리 계획" }),
    );
    await waitFor(() => expect(fetchPlanner).toHaveBeenCalledTimes(1));
    expect(navigationMocks.push).toHaveBeenCalledWith("/planner?date=2026-03-24");
  });

  it.each([1, 3, 5])(
    "keeps %i configured meal columns associated with their empty slots",
    async (columnCount) => {
      const columns = Array.from({ length: columnCount }, (_, index) => ({
        id: `column-${index}`,
        name: index === columnCount - 1
          ? "아주 긴 사용자 지정 브런치 이름"
          : `끼니 ${index + 1}`,
        sort_order: index,
      }));
      fetchPlanner.mockResolvedValue(createPlannerData({ columns, meals: [] }));

      render(<PlannerWeekScreen />);

      expect(
        (await screen.findAllByText("아주 긴 사용자 지정 브런치 이름")).length,
      ).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("비어 있음")).toHaveLength(columnCount);
    },
  );

  it("keeps legacy products separate and supports detail/delete only", async () => {
    const withProduct = createPlannerData({
      productEntries: [createProductEntry()],
    });
    fetchPlanner
      .mockResolvedValueOnce(withProduct)
      .mockResolvedValueOnce(createPlannerData());
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<PlannerWeekScreen />);

    expect(await screen.findByRole("heading", { name: "기존 완제품 계획" }))
      .toBeTruthy();
    expect(screen.queryByTestId("planner-meal-legacy-product-1")).toBeNull();
    expect(screen.queryByText("수정")).toBeNull();

    await user.click(screen.getByRole("button", { name: "플레인 요거트 상세 보기" }));
    await user.click(screen.getByRole("button", { name: "계획에서 삭제" }));
    await user.click(screen.getByRole("button", { name: "삭제" }));

    await waitFor(() => {
      expect(deleteProductPlannerEntry).toHaveBeenCalledWith("legacy-product-1");
      expect(fetchPlanner).toHaveBeenCalledTimes(2);
    });
  });

  it("preserves loading geometry and exposes a scoped retry on load error", async () => {
    let rejectRequest!: (reason: unknown) => void;
    fetchPlanner.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      }),
    );
    const view = render(<PlannerWeekScreen />);

    expect(await screen.findByTestId("planner-loading-state")).toBeTruthy();
    rejectRequest(new Error("플래너 연결 실패"));
    expect(await screen.findByRole("heading", { name: "플래너를 불러오지 못했어요" }))
      .toBeTruthy();

    fetchPlanner.mockResolvedValueOnce(createPlannerData());
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(
      screen.getByRole("button", { name: "다시 시도" }),
    );
    expect(await screen.findByText("김치찌개")).toBeTruthy();
    view.unmount();
  });

  it("moves one week and records the destination date in browser history", async () => {
    render(<PlannerWeekScreen />);
    await screen.findByText("김치찌개");

    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(
      screen.getByRole("button", { name: "다음 주" }),
    );

    await waitFor(() => {
      expect(fetchPlanner).toHaveBeenLastCalledWith("2026-03-31", "2026-04-06");
      expect(navigationMocks.push).toHaveBeenLastCalledWith(
        "/planner?date=2026-03-31",
      );
    });
  });

  it("loads the week containing an out-of-range date on a cold deep link", async () => {
    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams("segment=plan&date=2026-04-08"),
    );

    render(<PlannerWeekScreen />);

    await waitFor(() => {
      expect(fetchPlanner).toHaveBeenCalledTimes(1);
      expect(fetchPlanner).toHaveBeenLastCalledWith("2026-04-06", "2026-04-12");
    });
    expect(await screen.findByRole("heading", { name: "수 4월 8일" })).toBeTruthy();
  });

  it("reloads the URL date week when browser Back restores an earlier range", async () => {
    const view = render(<PlannerWeekScreen />);
    await screen.findByText("김치찌개");

    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(
      screen.getByRole("button", { name: "다음 주" }),
    );
    await waitFor(() => {
      expect(fetchPlanner).toHaveBeenCalledTimes(2);
      expect(fetchPlanner).toHaveBeenLastCalledWith("2026-03-31", "2026-04-06");
    });

    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams("date=2026-03-24"),
    );
    view.rerender(<PlannerWeekScreen />);

    await waitFor(() => {
      expect(fetchPlanner).toHaveBeenCalledTimes(3);
      expect(fetchPlanner).toHaveBeenLastCalledWith("2026-03-23", "2026-03-29");
    });
    expect(await screen.findByRole("heading", { name: "화 3월 24일" })).toBeTruthy();
    expect(screen.getByText("김치찌개")).toBeTruthy();
    expect(navigationMocks.push).toHaveBeenCalledTimes(1);
  });

  it("treats the selected date as a no-op before browser Back restores the previous week", async () => {
    const view = render(<PlannerWeekScreen />);
    await screen.findByText("김치찌개");
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.click(screen.getByRole("button", { name: "다음 주" }));
    await waitFor(() => {
      expect(fetchPlanner).toHaveBeenCalledTimes(2);
      expect(fetchPlanner).toHaveBeenLastCalledWith("2026-03-31", "2026-04-06");
    });

    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams("date=2026-03-31"),
    );
    view.rerender(<PlannerWeekScreen />);
    await user.click(screen.getByRole("button", { name: "3/31 화 선택" }));

    expect(navigationMocks.push).toHaveBeenCalledTimes(1);
    expect(fetchPlanner).toHaveBeenCalledTimes(2);

    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams("date=2026-03-24"),
    );
    view.rerender(<PlannerWeekScreen />);

    await waitFor(() => {
      expect(fetchPlanner).toHaveBeenCalledTimes(3);
      expect(fetchPlanner).toHaveBeenLastCalledWith("2026-03-23", "2026-03-29");
    });
    expect(await screen.findByRole("heading", { name: "화 3월 24일" })).toBeTruthy();
  });

  it("does not reload planner data for same-week segment and date URL changes", async () => {
    const view = render(<PlannerWeekScreen />);
    await screen.findByText("김치찌개");

    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams("segment=log&date=2026-03-25"),
    );
    view.rerender(<PlannerWeekScreen />);
    expect(await screen.findByRole("heading", { name: "3월 25일 수요일 식사 기록" }))
      .toBeTruthy();

    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams("date=2026-03-26"),
    );
    view.rerender(<PlannerWeekScreen />);

    expect(await screen.findByRole("heading", { name: "목 3월 26일" })).toBeTruthy();
    expect(fetchPlanner).toHaveBeenCalledTimes(1);
  });

  it("does not push duplicate history entries during repeated Back and Forward sync", async () => {
    const view = render(<PlannerWeekScreen />);
    await screen.findByText("김치찌개");

    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams("date=2026-04-01"),
    );
    view.rerender(<PlannerWeekScreen />);
    await waitFor(() => {
      expect(fetchPlanner).toHaveBeenCalledTimes(2);
      expect(fetchPlanner).toHaveBeenLastCalledWith("2026-03-30", "2026-04-05");
    });

    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams("date=2026-03-24"),
    );
    view.rerender(<PlannerWeekScreen />);
    await waitFor(() => {
      expect(fetchPlanner).toHaveBeenCalledTimes(3);
      expect(fetchPlanner).toHaveBeenLastCalledWith("2026-03-23", "2026-03-29");
    });

    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams("date=2026-04-01"),
    );
    view.rerender(<PlannerWeekScreen />);
    await waitFor(() => {
      expect(fetchPlanner).toHaveBeenCalledTimes(4);
      expect(fetchPlanner).toHaveBeenLastCalledWith("2026-03-30", "2026-04-05");
    });

    expect(navigationMocks.push).not.toHaveBeenCalled();
    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });
});
