// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlannerWeekScreen } from "@/components/planner/planner-week-screen";
import { resetPlannerStore } from "@/stores/planner-store";

const readE2EAuthOverride = vi.fn();
const fetchPlanner = vi.fn();

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  readE2EAuthOverride: () => readE2EAuthOverride(),
}));

vi.mock("@/lib/api/planner", () => ({
  createDefaultPlannerRange: () => ({
    startDate: "2026-03-24",
    endDate: "2026-03-30",
  }),
  shiftPlannerRange: (
    range: { startDate: string; endDate: string },
    dayDelta: number,
  ) => {
    const start = new Date(`${range.startDate}T00:00:00.000Z`);
    const end = new Date(`${range.endDate}T00:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() + dayDelta);
    end.setUTCDate(end.getUTCDate() + dayDelta);

    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  },
  fetchPlanner: (...args: unknown[]) => fetchPlanner(...args),
  isPlannerApiError: (error: unknown) =>
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

function createPlannerData({
  meals = [],
}: {
  meals?: Array<{
    id: string;
    recipe_id: string;
    recipe_title: string;
    recipe_thumbnail_url: string | null;
    plan_date: string;
    column_id: string;
    planned_servings: number;
    status: "registered" | "shopping_done" | "cook_done";
    is_leftover: boolean;
  }>;
}) {
  return {
    columns: [
      { id: "column-breakfast", name: "아침", sort_order: 0 },
      { id: "column-lunch", name: "점심", sort_order: 1 },
      { id: "column-snack", name: "간식", sort_order: 2 },
      { id: "column-dinner", name: "저녁", sort_order: 3 },
    ],
    meals,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

function primeWeekStripViewport(strip: HTMLElement) {
  let scrollLeft = 320;

  Object.defineProperty(strip, "clientWidth", {
    configurable: true,
    get: () => 320,
  });
  Object.defineProperty(strip, "scrollLeft", {
    configurable: true,
    get: () => scrollLeft,
    set: (value: number) => {
      scrollLeft = value;
    },
  });

  return {
    scrollToPage(pageIndex: number) {
      scrollLeft = 320 * pageIndex;
      fireEvent.scroll(strip);
    },
  };
}

function setDesktopViewport(enabled: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: enabled && query === "(min-width: 768px)",
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

describe("planner week screen", () => {
  beforeEach(() => {
    readE2EAuthOverride.mockReset();
    fetchPlanner.mockReset();
    resetPlannerStore();
    setDesktopViewport(false);
  });

  afterEach(() => {
    cleanup();
  });

  it("shows unauthorized state and login options for guests", async () => {
    readE2EAuthOverride.mockReturnValue(false);

    render(<PlannerWeekScreen />);

    expect(await screen.findByText("이 화면은 로그인이 필요해요")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Google로 시작하기|로컬 테스트 계정으로 시작/ }),
    ).toBeTruthy();
  });

  it("reserves bottom-tab safe area for guest actions on small screens", async () => {
    readE2EAuthOverride.mockReturnValue(false);

    render(<PlannerWeekScreen />);

    const heading = await screen.findByRole("heading", {
      name: "이 화면은 로그인이 필요해요",
    });
    const authGate = heading.closest(".action-safe-bottom-panel");

    expect(authGate).not.toBeNull();
  });

  it("loads planner data into four fixed slots inside the same day card", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner.mockResolvedValue(
      createPlannerData({
        meals: [
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_title: "김치찌개",
            recipe_thumbnail_url: null,
            plan_date: "2026-03-24",
            column_id: "column-breakfast",
            planned_servings: 2,
            status: "registered",
            is_leftover: false,
          },
          {
            id: "meal-2",
            recipe_id: "recipe-2",
            recipe_title: "샐러드",
            recipe_thumbnail_url: null,
            plan_date: "2026-03-24",
            column_id: "column-lunch",
            planned_servings: 1,
            status: "shopping_done",
            is_leftover: false,
          },
        ],
      }),
    );

    render(<PlannerWeekScreen />);

    expect(await screen.findByRole("heading", { name: "식단 플래너" })).toBeTruthy();
    expect(screen.getAllByText("아침").length).toBeGreaterThan(0);
    expect(screen.getAllByText("점심").length).toBeGreaterThan(0);
    expect(screen.getAllByText("간식").length).toBeGreaterThan(0);
    expect(screen.getAllByText("저녁").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/식단 카드$/)).toHaveLength(7);
    expect(screen.getAllByText("3월 24일 ~ 3월 30일")).toHaveLength(1);
    expect(screen.queryByText("화면 상태")).toBeNull();
    expect(screen.queryByRole("button", { name: "이전 주" })).toBeNull();
    expect(screen.queryByRole("button", { name: "다음 주" })).toBeNull();
    expect(screen.getByText("김치찌개")).toBeTruthy();
    expect(screen.getByText("샐러드")).toBeTruthy();
    expect(screen.getByLabelText("식사 등록 완료")).toBeTruthy();
    expect(screen.getByLabelText("장보기 완료")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "컬럼 추가" })).toBeNull();
  });

  it("enables the shopping CTA while keeping later planner CTAs disabled", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner.mockResolvedValue(createPlannerData({ meals: [] }));

    render(<PlannerWeekScreen />);

    expect(await screen.findByRole("heading", { name: "식단 플래너" })).toBeTruthy();

    const toolbar = screen.getByRole("group", { name: "플래너 보조 작업" });
    const shoppingLink = within(toolbar).getByRole("link", { name: "장보기" }) as HTMLAnchorElement;
    const cookButton = within(toolbar).getByRole("button", { name: "요리하기" }) as HTMLButtonElement;
    const leftoverButton = within(toolbar).getByRole("button", { name: "남은요리" }) as HTMLButtonElement;

    expect(toolbar.className).toContain("grid-cols-3");
    expect(toolbar.className).toContain("rounded-[var(--radius-lg)]");
    expect(shoppingLink.getAttribute("href")).toBe("/shopping/flow");
    expect(cookButton.disabled).toBe(true);
    expect(leftoverButton.disabled).toBe(true);
  });

  it("compresses meal slot metadata into compact chips while keeping empty slots lightweight", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner.mockResolvedValue(
      createPlannerData({
        meals: [
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_title: "김치찌개",
            recipe_thumbnail_url: null,
            plan_date: "2026-03-24",
            column_id: "column-breakfast",
            planned_servings: 2,
            status: "registered",
            is_leftover: false,
          },
        ],
      }),
    );

    render(<PlannerWeekScreen />);

    const firstDayCard = await screen.findAllByLabelText(/식단 카드$/).then((cards) => cards[0]);
    // slot rows are links with min-h-[44px]; find the breakfast row via meal title
    const breakfastRow = within(firstDayCard).getByText("김치찌개").closest("a");
    // find the dinner row via its 끼니명 label
    const dinnerRow = within(firstDayCard).getByText("저녁").closest("a");

    expect(breakfastRow).not.toBeNull();
    expect(dinnerRow).not.toBeNull();
    expect(breakfastRow?.className).toContain("min-h-[44px]");
    expect(within(breakfastRow as HTMLElement).getByText("2인분")).toBeTruthy();
    expect(within(breakfastRow as HTMLElement).getByText("등록")).toBeTruthy();
    expect(within(dinnerRow as HTMLElement).getByText(/비어 있음/).tagName).toBe("SPAN");
  });

  it("uses the server-authenticated flag when browser session is not hydrated yet", async () => {
    fetchPlanner.mockResolvedValue(createPlannerData({ meals: [] }));

    render(<PlannerWeekScreen initialAuthenticated />);

    expect(await screen.findByText(/아직 등록된 식사가 없어요/)).toBeTruthy();
    expect(fetchPlanner).toHaveBeenCalledTimes(1);
  });

  it("shows loading placeholders while planner data is pending", async () => {
    const deferred = createDeferred<ReturnType<typeof createPlannerData>>();

    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner.mockImplementation(() => deferred.promise);

    const { container } = render(<PlannerWeekScreen />);

    await waitFor(() => {
      expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    });

    deferred.resolve(createPlannerData({ meals: [] }));

    expect(await screen.findByText(/아직 등록된 식사가 없어요/)).toBeTruthy();
  });

  it("shows fetch error UI and retries planner loading", async () => {
    const user = userEvent.setup();

    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner
      .mockRejectedValueOnce(new Error("planner failed"))
      .mockResolvedValueOnce(createPlannerData({ meals: [] }));

    render(<PlannerWeekScreen />);

    expect(await screen.findByText("플래너를 불러오지 못했어요")).toBeTruthy();
    expect(screen.getByText("planner failed")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByText(/아직 등록된 식사가 없어요/)).toBeTruthy();
    expect(fetchPlanner).toHaveBeenCalledTimes(2);
  });

  it("shifts planner range when the native week strip scroll settles on the next page and keeps current-week reset as a secondary action", async () => {
    const user = userEvent.setup();

    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner
      .mockResolvedValueOnce(createPlannerData({ meals: [] }))
      .mockResolvedValueOnce(createPlannerData({ meals: [] }))
      .mockResolvedValueOnce(createPlannerData({ meals: [] }));

    render(<PlannerWeekScreen />);

    expect(await screen.findByText(/아직 등록된 식사가 없어요/)).toBeTruthy();

    const strip = await screen.findByTestId("planner-week-strip-viewport");
    const viewport = primeWeekStripViewport(strip);

    viewport.scrollToPage(2);
    await new Promise((resolve) => window.setTimeout(resolve, 140));

    await waitFor(() => {
      expect(fetchPlanner).toHaveBeenNthCalledWith(2, "2026-03-31", "2026-04-06");
    });

    const resetButton = screen.getByRole("button", { name: "이번주로 가기" });
    await user.click(resetButton);

    await waitFor(() => {
      expect(fetchPlanner).toHaveBeenNthCalledWith(3, "2026-03-24", "2026-03-30");
    });
  });

  it("renders the week strip as a sticky native horizontal scroller with hidden scrollbar", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner.mockResolvedValue(
      createPlannerData({
        meals: [
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_title: "김치찌개",
            recipe_thumbnail_url: null,
            plan_date: "2026-03-24",
            column_id: "column-breakfast",
            planned_servings: 2,
            status: "registered",
            is_leftover: false,
          },
        ],
      }),
    );

    render(<PlannerWeekScreen />);

    const strip = await screen.findByTestId("planner-week-strip-viewport");
    const stickyShell = screen.getByTestId("planner-week-shell");
    const plannerBody = screen.getByTestId("planner-week-body");

    expect(strip.className).toContain("overflow-x-auto");
    expect(strip.className).toContain("snap-x");
    expect(strip.className).toContain("scrollbar-hide");
    expect(strip.className).toContain("touch-pan-x");
    expect(stickyShell.className).toContain("sticky");
    expect(screen.getByTestId("planner-week-strip-page-prev").textContent ?? "").toContain("17");
    expect(screen.getByTestId("planner-week-strip-page-current").textContent ?? "").toContain("24");
    expect(screen.getByTestId("planner-week-strip-page-next").textContent ?? "").toContain("31");
    expect(plannerBody.getAttribute("style")).toContain("translateX(0px)");
  });

  it("keeps the previous planner content visible while the next week is refreshing", async () => {
    const firstLoad = createDeferred<ReturnType<typeof createPlannerData>>();
    const secondLoad = createDeferred<ReturnType<typeof createPlannerData>>();

    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner
      .mockImplementationOnce(() => firstLoad.promise)
      .mockImplementationOnce(() => secondLoad.promise);

    render(<PlannerWeekScreen />);

    firstLoad.resolve(
      createPlannerData({
        meals: [
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_title: "김치찌개",
            recipe_thumbnail_url: null,
            plan_date: "2026-03-24",
            column_id: "column-breakfast",
            planned_servings: 2,
            status: "registered",
            is_leftover: false,
          },
        ],
      }),
    );

    expect(await screen.findByText("김치찌개")).toBeTruthy();
    await waitFor(() => {
      expect(fetchPlanner).toHaveBeenCalledTimes(1);
    });

    const strip = screen.getByTestId("planner-week-strip-viewport");
    const viewport = primeWeekStripViewport(strip);

    viewport.scrollToPage(2);
    await new Promise((resolve) => window.setTimeout(resolve, 140));

    await waitFor(() => {
      expect(fetchPlanner).toHaveBeenNthCalledWith(2, "2026-03-31", "2026-04-06");
    });

    expect(screen.getByText("김치찌개")).toBeTruthy();
    expect(document.querySelectorAll(".animate-pulse").length).toBe(0);

    secondLoad.resolve(
      createPlannerData({
        meals: [
          {
            id: "meal-2",
            recipe_id: "recipe-2",
            recipe_title: "오므라이스",
            recipe_thumbnail_url: null,
            plan_date: "2026-03-31",
            column_id: "column-breakfast",
            planned_servings: 1,
            status: "shopping_done",
            is_leftover: false,
          },
        ],
      }),
    );

    expect(await screen.findByText("오므라이스")).toBeTruthy();
  });

  it("shows desktop week navigation buttons and shifts range with the next-week action", async () => {
    const user = userEvent.setup();

    setDesktopViewport(true);
    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner
      .mockResolvedValueOnce(createPlannerData({ meals: [] }))
      .mockResolvedValueOnce(createPlannerData({ meals: [] }));

    render(<PlannerWeekScreen />);

    expect(await screen.findByText(/아직 등록된 식사가 없어요/)).toBeTruthy();

    const previousWeekButton = screen.getByRole("button", { name: "이전 주" });
    const nextWeekButton = screen.getByRole("button", { name: "다음 주" });

    expect(previousWeekButton).toBeTruthy();
    expect(nextWeekButton).toBeTruthy();

    await user.click(nextWeekButton);

    await waitFor(() => {
      expect(fetchPlanner).toHaveBeenNthCalledWith(2, "2026-03-31", "2026-04-06");
    });
  });

  it("keeps empty state within the fixed four-slot card instead of showing column management", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner.mockResolvedValue(createPlannerData({ meals: [] }));

    render(<PlannerWeekScreen />);

    expect(await screen.findByText(/아직 등록된 식사가 없어요/)).toBeTruthy();
    expect(screen.getAllByText(/비어 있음/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByPlaceholderText("새 끼니 컬럼 이름")).toBeNull();
  });
});
