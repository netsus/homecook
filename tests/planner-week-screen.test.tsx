// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlannerWeekScreen } from "@/components/planner/planner-week-screen";
import { readPlannerWeekReturnContext } from "@/lib/planner/planner-week-return-context";
import { resetPlannerStore, usePlannerStore } from "@/stores/planner-store";
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

vi.mock("@/lib/api/recipe", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api/recipe")>(),
  fetchRecipeBooks: vi.fn(async () => ({
    success: true,
    data: { books: [] },
    error: null,
  })),
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
    vi.unstubAllEnvs();
  });

  it("lets guests read meal-log preview and gates adding behind the same date login return", async () => {
    readE2EAuthOverride.mockReturnValue(false);
    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams("segment=log&date=2026-03-25"),
    );

    render(<PlannerWeekScreen />);

    expect(await screen.findByText("그릭요거트 볼")).toBeTruthy();
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(
      within(document.querySelector<HTMLElement>('[data-planner-date="2026-03-25"]')!).getByRole("button", { name: "아침에 먹은 음식 추가" }),
    );
    expect(screen.getByRole("dialog", { name: "로그인이 필요해요" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "로그인" }).getAttribute("href"))
      .toContain(encodeURIComponent("/planner?segment=log&date=2026-03-25"));
    expect(fetchPlanner).not.toHaveBeenCalled();
  });

  it("shows public plan examples without revealing cached private meals or making a private request", async () => {
    readE2EAuthOverride.mockReturnValue(false);
    usePlannerStore.setState({ ...createPlannerData(), screenState: "ready" });
    render(<PlannerWeekScreen />);
    expect(await screen.findByText("예시 플래너")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "프로필" })).toBeNull();
    expect(screen.queryByText("김치찌개")).toBeNull();
    expect(within(screen.getByTestId("planner-week-body")).getByText("그릭요거트 볼")).toBeTruthy();
    expect(fetchPlanner).not.toHaveBeenCalled();
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(
      screen.getByRole("button", { name: "3/24 아침 식사 추가" }),
    );
    expect(screen.getByRole("dialog", { name: "로그인이 필요해요" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "식사 추가" })).toBeNull();
  });

  it("unmounts personal legacy dialogs and releases their lock when the session becomes a guest", async () => {
    fetchPlanner.mockResolvedValue(createPlannerData({ productEntries: [createProductEntry()] }));
    const view = render(<PlannerWeekScreen initialAuthenticated />);
    await screen.findByRole("button", { name: "플레인 요거트 상세 보기" });
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(
      screen.getByRole("button", { name: "플레인 요거트 상세 보기" }),
    );
    expect(document.body.style.overflow).toBe("hidden");
    readE2EAuthOverride.mockReturnValue(false);
    view.rerender(<PlannerWeekScreen initialAuthenticated={false} />);
    await screen.findByText("예시 플래너");
    await waitFor(() => expect(document.body.style.overflow).not.toBe("hidden"));
    expect(screen.queryByRole("dialog", { name: "플레인 요거트" })).toBeNull();
    expect(within(screen.getByRole("navigation", { name: "플래너 하단 탭" })).getByRole("link", { name: "요리 계획" })).toBeTruthy();
  });

  it("renders the plan shell without calling or showing planner nutrition", async () => {
    render(<PlannerWeekScreen />);

    expect(within(await screen.findByRole("navigation", { name: "플래너 하단 탭" })).getByRole("link", { name: "요리 계획" })).toBeTruthy();
    expect(within(screen.getByRole("navigation", { name: "플래너 하단 탭" })).getByRole("link", { name: "식사 기록" })).toBeTruthy();
    expect(screen.queryByText(/계획 영양/)).toBeNull();
    expect(fetchPlanner).toHaveBeenCalledTimes(1);

    const rail = screen.getByTestId("planner-week-date-rail");
    expect(within(rail).getAllByRole("button")).toHaveLength(7);
    expect(screen.getAllByTestId(/^planner-day-card-/)).toHaveLength(7);
  });

  it("keeps every day of recipe meals visible with status-specific actions", async () => {
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

    expect(await within(await screen.findByTestId("planner-week-body")).findByText("김치찌개")).toBeTruthy();
    expect(within(screen.getByTestId("planner-week-body")).getByText("샐러드")).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "장보기" }).length).toBeGreaterThan(0);
    const board = within(screen.getByTestId("planner-week-body"));
    expect(board.getByRole("link", { name: "샐러드" }).getAttribute("href"))
      .toContain("/planner/2026-03-24/column-lunch");
    expect(board.queryByRole("link", { name: "장보기" })).toBeNull();
    expect(board.queryByRole("link", { name: "상세" })).toBeNull();
    expect(screen.getByRole("button", { name: "3/24 저녁 식사 추가" })).toBeTruthy();
    expect(screen.queryByText("완제품 추가")).toBeNull();
    expect(within(screen.getByTestId("planner-week-body")).getByText("다음 날 된장찌개")).toBeTruthy();
  });

  it("starts the mobile public preview at the selected day instead of earlier empty days", async () => {
    readE2EAuthOverride.mockReturnValue(false);
    const geometry = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 390, bottom: 300, width: 390, height: 300,
      toJSON: () => ({}),
    });
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
    render(<PlannerWeekScreen />);
    await screen.findByText("예시 플래너");
    await waitFor(() => expect(scrollIntoView.mock.contexts).toContain(screen.getByTestId("planner-day-card-2026-03-24")));
    geometry.mockRestore();
  });

  it("opens the real add sheet for an empty day and carries its date and column to recipe routes", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PlannerWeekScreen />);
    await within(await screen.findByTestId("planner-week-body")).findByText("김치찌개");

    await user.click(screen.getByRole("button", { name: "3/25 저녁 식사 추가" }));

    const sheet = screen.getByRole("dialog", { name: "식사 추가" });
    expect(within(sheet).getByText("3/25 저녁")).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "레시피 검색" })).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "남은 요리" })).toBeTruthy();
    expect(within(sheet).queryByRole("link", { name: "완제품" })).toBeNull();
    for (const name of ["유튜브", "직접 등록"]) {
      const href = within(sheet).getByRole("link", { name }).getAttribute("href");
      const target = new URL(href!, "http://homecook.local");
      expect(target.searchParams.get("date")).toBe("2026-03-25");
      expect(target.searchParams.get("columnId")).toBe("column-dinner");
    }
  });

  it("does not persist a return destination when the add sheet is only opened and cancelled", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PlannerWeekScreen />);
    await within(await screen.findByTestId("planner-week-body")).findByText("김치찌개");
    expect(readPlannerWeekReturnContext()).toBeNull();

    await user.click(screen.getByRole("button", { name: "3/25 저녁 식사 추가" }));
    expect(readPlannerWeekReturnContext()).toBeNull();
    await user.click(within(screen.getByRole("dialog", { name: "식사 추가" })).getByRole("button", { name: "닫기" }));

    expect(screen.queryByRole("dialog", { name: "식사 추가" })).toBeNull();
    expect(readPlannerWeekReturnContext()).toBeNull();
  });

  it.each(["유튜브", "직접 등록"])("persists the exact return destination only when following %s", async (routeName) => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PlannerWeekScreen />);
    await within(await screen.findByTestId("planner-week-body")).findByText("김치찌개");
    await user.click(screen.getByRole("button", { name: "3/25 저녁 식사 추가" }));
    const route = within(screen.getByRole("dialog", { name: "식사 추가" })).getByRole("link", { name: routeName });
    // JSDOM cannot navigate to another document; preserve the real React click handler.
    route.addEventListener("click", (event) => event.preventDefault());
    await user.click(route);

    expect(screen.queryByRole("dialog", { name: "식사 추가" })).toBeNull();
    expect(readPlannerWeekReturnContext()).toEqual({
      version: 1,
      startDate: "2026-03-24",
      endDate: "2026-03-30",
      selectedDate: "2026-03-25",
      columnId: "column-dinner",
      slotName: "저녁",
    });
  });

  it("keeps focus inside the displayed sheet when opening recipebooks and returning to add options", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<PlannerWeekScreen />);
    await within(await screen.findByTestId("planner-week-body")).findByText("김치찌개");
    await user.click(screen.getByRole("button", { name: "3/25 저녁 식사 추가" }));
    await user.click(within(screen.getByRole("dialog", { name: "식사 추가" })).getByRole("button", { name: "레시피북" }));

    const recipebooks = screen.getByRole("dialog", { name: "레시피북에서 추가" });
    await waitFor(() => expect(recipebooks.contains(document.activeElement)).toBe(true));
    await user.click(within(recipebooks).getByRole("button", { name: "뒤로 가기" }));

    const options = screen.getByRole("dialog", { name: "식사 추가" });
    await waitFor(() => expect(options.contains(document.activeElement)).toBe(true));
  });

  it.each(["refreshing", "error"] as const)(
    "releases the add sheet boundary when %s blocks adding and does not reopen it afterward",
    async (condition) => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<PlannerWeekScreen />);
      await within(await screen.findByTestId("planner-week-body")).findByText("김치찌개");
      const previousOverflow = document.body.style.overflow;
      const background = screen.getByTestId("planner-week-shell");
      await user.click(screen.getByRole("button", { name: "3/25 저녁 식사 추가" }));
      expect(screen.getByRole("dialog", { name: "식사 추가" })).toBeTruthy();
      expect(document.body.style.overflow).toBe("hidden");
      const isolatedBackground = background.closest<HTMLElement>('[aria-hidden="true"]');
      expect(isolatedBackground?.inert).toBe(true);

      act(() => usePlannerStore.setState(condition === "refreshing"
        ? { isRefreshing: true }
        : { errorMessage: "주간 계획을 갱신하지 못했어요." }));

      expect(screen.queryByRole("dialog", { name: "식사 추가" })).toBeNull();
      expect(document.body.style.overflow).toBe(previousOverflow);
      expect(isolatedBackground?.inert).not.toBe(true);
      expect(screen.getByLabelText("달력에서 날짜 선택")).toBeTruthy();

      act(() => usePlannerStore.setState({ isRefreshing: false, errorMessage: null }));
      expect(screen.queryByRole("dialog", { name: "식사 추가" })).toBeNull();
      expect(document.body.style.overflow).toBe(previousOverflow);
      await user.click(screen.getByRole("button", { name: "3/25 저녁 식사 추가" }));
      expect(screen.getByRole("dialog", { name: "식사 추가" })).toBeTruthy();
    },
  );

  it("scrolls to the chosen day while preserving plan history and avoiding a reload", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    render(<PlannerWeekScreen />);
    await within(await screen.findByTestId("planner-week-body")).findByText("김치찌개");

    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(
      screen.getByRole("button", { name: "3/26 목 선택" }),
    );

    expect(navigationMocks.push).toHaveBeenLastCalledWith("/planner?date=2026-03-26", { scroll: false });
    expect(fetchPlanner).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(scrollIntoView.mock.contexts).toContain(screen.getByTestId("planner-day-card-2026-03-26"));
  });

  it("preserves the selected card scroll position when queued date navigation reaches the router", async () => {
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams("date=2026-03-24"));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const view = render(<PlannerWeekScreen />);
    await within(await screen.findByTestId("planner-week-body")).findByText("김치찌개");
    await user.click(screen.getByRole("button", { name: "3/26 목 선택" }));
    await user.click(screen.getByRole("button", { name: "3/27 금 선택" }));
    expect(navigationMocks.push).toHaveBeenCalledTimes(1);

    navigationMocks.searchParams.mockReturnValue(new URLSearchParams("date=2026-03-26"));
    view.rerender(<PlannerWeekScreen />);

    expect(navigationMocks.push).toHaveBeenNthCalledWith(2, "/planner?date=2026-03-27", { scroll: false });
    expect(screen.getByRole("button", { name: "3/27 금 선택" }).getAttribute("aria-current")).toBe("date");
    expect(fetchPlanner).toHaveBeenCalledTimes(1);
  });

  it("keeps seven date rows and all configured columns available in the desktop weekly table", async () => {
    render(<PlannerWeekScreen />);
    await within(await screen.findByTestId("planner-week-body")).findByText("김치찌개");

    const columns = document.querySelectorAll(".web-planner-column-head");
    expect(Array.from(columns, (column) => column.textContent)).toEqual(["아침", "점심", "저녁"]);
    expect(screen.getAllByTestId(/^web-planner-date-row-/)).toHaveLength(7);
    const nextDay = screen.getByTestId("web-planner-date-row-2026-03-25");
    expect(within(nextDay).getByRole("button", { name: "3/25 점심 식사 추가" })).toBeTruthy();
  });

  it("opens desktop shopping history in the list detail route and keeps mobile history return context", async () => {
    fetchPlanner.mockResolvedValue(createPlannerData({
      meals: [{
        ...createPlannerData().meals[0]!,
        shopping_list_id: "shopping-list-1",
        shopping_list_title: "이번 주 장보기",
      }],
    }));
    render(<PlannerWeekScreen />);
    const summary = await screen.findByRole("list", { name: "장보기 기록" });

    expect(within(summary).getByRole("link", { name: "이번 주 장보기" }).getAttribute("href"))
      .toBe("/shopping/lists/shopping-list-1");
    const mobileHistory = screen.getByRole("link", { name: /이번 주 장보기 기록 1개/ });
    const destination = new URL(mobileHistory.getAttribute("href")!, "http://homecook.local");
    expect(destination.pathname).toBe("/mypage");
    expect(destination.searchParams.get("returnTo")).toBe("/planner?date=2026-03-24");
    expect(destination.searchParams.get("restore")).toBe("shopping-history-tab");
  });

  it.each(["플래너 하단 탭", "데스크탑 주요 메뉴"])("loads the meal-log segment and preserves its date when %s returns to cooking", async (navigationName) => {
    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams("segment=log&date=2026-03-24"),
    );

    render(<PlannerWeekScreen />);

    expect(await screen.findByRole("heading", { name: "3월 24일 화요일 식사 기록" }))
      .toBeTruthy();
    expect(fetchPlanner).not.toHaveBeenCalled();

    const nav = within(screen.getByRole("navigation", { name: navigationName }));
    expect(nav.getByRole("link", { current: "page" }).textContent).toBe("식사 기록");
    expect(nav.getByRole("link", { name: "요리 계획" }).getAttribute("href")).toBe("/planner?date=2026-03-24");
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(
      nav.getByRole("link", { name: "요리 계획" }),
    );
    await waitFor(() => expect(fetchPlanner).toHaveBeenCalledTimes(1));
    expect(nav.getByRole("link", { current: "page" }).textContent).toBe("요리 계획");
    expect(navigationMocks.push).toHaveBeenCalledWith("/planner?date=2026-03-24", { scroll: false });
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
      expect(screen.getAllByRole("button", { name: /^3\/24 .* 식사 추가$/ })).toHaveLength(columnCount);
      expect(screen.getAllByRole("button", { name: /식사 추가$/ })).toHaveLength(columnCount * 7);
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
    expect(await within(await screen.findByTestId("planner-week-body")).findByText("김치찌개")).toBeTruthy();
    view.unmount();
  });

  it("loads the next week when the date rail settles on its next page", async () => {
    render(<PlannerWeekScreen />);
    await within(await screen.findByTestId("planner-week-body")).findByText("김치찌개");
    const rail = screen.getByTestId("planner-week-date-rail");
    Object.defineProperty(rail, "clientWidth", { configurable: true, value: 320 });
    rail.scrollLeft = 640;

    fireEvent.scroll(rail);

    await waitFor(() => {
      expect(fetchPlanner).toHaveBeenLastCalledWith("2026-03-31", "2026-04-06");
      expect(navigationMocks.push).toHaveBeenLastCalledWith("/planner?date=2026-03-31", { scroll: false });
    });
    expect(fetchPlanner).toHaveBeenCalledTimes(2);
  });

  it("moves one week and records the destination date in browser history", async () => {
    render(<PlannerWeekScreen />);
    await within(await screen.findByTestId("planner-week-body")).findByText("김치찌개");

    fireEvent.keyDown(screen.getByTestId("planner-week-date-rail"), { key: "ArrowRight" });

    await waitFor(() => {
      expect(fetchPlanner).toHaveBeenLastCalledWith("2026-03-31", "2026-04-06");
      expect(navigationMocks.push).toHaveBeenLastCalledWith(
        "/planner?date=2026-03-31",
        { scroll: false },
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
    expect((await screen.findByRole("button", { name: "4/8 수 선택" })).getAttribute("aria-current")).toBe("date");
  });

  it("reloads the URL date week when browser Back restores an earlier range", async () => {
    const view = render(<PlannerWeekScreen />);
    await within(await screen.findByTestId("planner-week-body")).findByText("김치찌개");

    fireEvent.keyDown(screen.getByTestId("planner-week-date-rail"), { key: "ArrowRight" });
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
    expect((await screen.findByRole("button", { name: "3/24 화 선택" })).getAttribute("aria-current")).toBe("date");
    expect(within(screen.getByTestId("planner-week-body")).getByText("김치찌개")).toBeTruthy();
    expect(navigationMocks.push).toHaveBeenCalledTimes(1);
  });

  it("treats the selected date as a no-op before browser Back restores the previous week", async () => {
    const view = render(<PlannerWeekScreen />);
    await within(await screen.findByTestId("planner-week-body")).findByText("김치찌개");
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    fireEvent.keyDown(screen.getByTestId("planner-week-date-rail"), { key: "ArrowRight" });
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
    expect((await screen.findByRole("button", { name: "3/24 화 선택" })).getAttribute("aria-current")).toBe("date");
  });

  it("does not reload planner data for same-week segment and date URL changes", async () => {
    const view = render(<PlannerWeekScreen />);
    await within(await screen.findByTestId("planner-week-body")).findByText("김치찌개");

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

    expect((await screen.findByRole("button", { name: "3/26 목 선택" })).getAttribute("aria-current")).toBe("date");
    expect(fetchPlanner).toHaveBeenCalledTimes(1);
  });

  it("does not push duplicate history entries during repeated Back and Forward sync", async () => {
    const view = render(<PlannerWeekScreen />);
    await within(await screen.findByTestId("planner-week-body")).findByText("김치찌개");

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
  it("takes guest food-name clicks directly to login with the clicked food date", async () => {
    vi.stubEnv("NEXT_PUBLIC_PRELAUNCH_UI", "true");
    readE2EAuthOverride.mockReturnValue(false);
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams("segment=log&date=2026-03-25"));
    render(<PlannerWeekScreen />);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(await screen.findByRole("button", { name: /그릭요거트 볼 식사 기록 상세/ }));
    const href = navigationMocks.push.mock.calls.at(-1)?.[0];
    const location = new URL(href, "http://localhost");
    expect(location.pathname).toBe("/login");
    const next = new URL(location.searchParams.get("next")!, "http://localhost");
    expect(next.pathname).toBe("/planner");
    expect(next.searchParams.get("date")).toBe("2026-03-24");
    expect(next.searchParams.get("segment")).toBe("log");
    expect(screen.queryByRole("dialog",{name:"식사 기록 상세"})).toBeNull();
  });

  it("keeps a distant selected date during a fast log-plan-log switch while the plan is loading", async () => {
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams("segment=log&date=2026-04-08"));
    fetchPlanner.mockImplementation(() => new Promise(() => {}));
    const view = render(<PlannerWeekScreen />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const tabs = within(screen.getByRole("navigation", { name: "플래너 하단 탭" }));
    await user.click(tabs.getByRole("link", { name: "요리 계획" }));
    await waitFor(() => expect(fetchPlanner).toHaveBeenCalled());
    await user.click(tabs.getByRole("link", { name: "식사 기록" }));
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams("date=2026-04-08"));
    view.rerender(<PlannerWeekScreen />);
    await waitFor(() => expect(navigationMocks.push).toHaveBeenCalledTimes(2));
    const destination = new URL(navigationMocks.push.mock.calls.at(-1)![0], "http://localhost");
    expect(destination.searchParams.get("segment")).toBe("log");
    expect(destination.searchParams.get("date")).toBe("2026-04-08");
  });

});
