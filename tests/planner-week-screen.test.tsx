// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlannerWeekScreen } from "@/components/planner/planner-week-screen";
import { resetPlannerStore } from "@/stores/planner-store";

const readE2EAuthOverride = vi.fn();
const fetchPlanner = vi.fn();
const navigationMocks = vi.hoisted(() => ({
  searchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => navigationMocks.searchParams(),
}));

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
    shopping_list_id?: string | null;
    shopping_list_title?: string | null;
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

describe("planner week screen", () => {
  beforeEach(() => {
    readE2EAuthOverride.mockReset();
    fetchPlanner.mockReset();
    navigationMocks.searchParams.mockReset();
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams());
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
      screen
        .getByRole("heading", { name: "이 화면은 로그인이 필요해요" })
        .closest("[data-state-kind='prototype-derived']")
        ?.getAttribute("data-state-tone"),
    ).toBe("gate");
    expect(
      screen.getByRole("button", { name: /Google로 시작하기|로컬 테스트 계정으로 시작/ }),
    ).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "플래너 하단 탭" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "플래너" }).getAttribute("aria-current")).toBe(
      "page",
    );
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

    expect(await screen.findByRole("heading", { name: "플래너" })).toBeTruthy();
    expect(screen.getAllByText("아침").length).toBeGreaterThan(0);
    expect(screen.getAllByText("점심").length).toBeGreaterThan(0);
    expect(screen.getAllByText("간식").length).toBeGreaterThan(0);
    expect(screen.getAllByText("저녁").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText(/식단 카드$/)).toHaveLength(7);
    expect(screen.getByText("이번 주 3월 24일 - 3월 30일")).toBeTruthy();
    expect(screen.queryByText("화면 상태")).toBeNull();
    // Wave1: week nav buttons now always visible (mobile uses icon-only)
    expect(screen.getByRole("button", { name: "이전 주" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "다음 주" })).toBeTruthy();
    expect(screen.getByText("김치찌개")).toBeTruthy();
    expect(screen.getByText("샐러드")).toBeTruthy();
    // Wave1: status badges removed; status data preserved in meal objects
    expect(screen.queryByLabelText("식사 등록 완료")).toBeNull();
    expect(screen.queryByLabelText("장보기 완료")).toBeNull();
    expect(screen.queryByRole("button", { name: "컬럼 추가" })).toBeNull();
  });

  it("keeps Wave1 mobile navigation with a floating shopping CTA", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner.mockResolvedValue(createPlannerData({ meals: [] }));

    render(<PlannerWeekScreen />);

    expect(await screen.findByRole("heading", { name: "플래너" })).toBeTruthy();

    const shoppingLink = screen.getByRole("link", { name: "장보기" }) as HTMLAnchorElement;
    const bottomTabs = screen.getByRole("navigation", { name: "플래너 하단 탭" });
    const plannerTab = within(bottomTabs).getByRole("link", { name: "플래너" });

    expect(shoppingLink.closest(".fixed")).not.toBeNull();
    expect(shoppingLink.getAttribute("href")).toBe("/shopping/flow");
    expect(plannerTab.getAttribute("aria-current")).toBe("page");
    expect(
      within(bottomTabs).getByTestId("bottom-tab-icon-pantry-fridge"),
    ).toBeTruthy();
    expect(screen.queryByRole("group", { name: "플래너 보조 작업" })).toBeNull();
  });

  it("renders the desktop planner header with the prototype's three week actions", async () => {
    const user = userEvent.setup();

    setDesktopViewport(true);
    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner
      .mockResolvedValueOnce(createPlannerData({ meals: [] }))
      .mockResolvedValueOnce(createPlannerData({ meals: [] }));

    render(<PlannerWeekScreen />);

    expect(await screen.findByRole("heading", { name: "주간 플래너" })).toBeTruthy();

    const actions = screen.getByRole("group", { name: "플래너 작업" });
    const previousWeekButton = within(actions).getByRole("button", { name: "이전 주" });
    const nextWeekButton = within(actions).getByRole("button", { name: "다음 주" });
    const shoppingPreviewLink = within(actions).getByRole("link", {
      name: "장보기 미리보기",
    }) as HTMLAnchorElement;

    expect(within(actions).getAllByRole("button")).toHaveLength(2);
    expect(within(actions).getAllByRole("link")).toHaveLength(1);
    expect(previousWeekButton.textContent?.trim()).toBe("< 이전주");
    expect(nextWeekButton.textContent?.trim()).toBe("다음 주 >");
    expect(shoppingPreviewLink.getAttribute("href")).toBe("/shopping/flow");
    expect(within(actions).queryByRole("link", { name: "요리 준비" })).toBeNull();
    expect(within(actions).queryByRole("button", { name: "이번주로" })).toBeNull();

    await user.click(nextWeekButton);

    await waitFor(() => {
      expect(fetchPlanner).toHaveBeenNthCalledWith(2, "2026-03-31", "2026-04-06");
    });
    expect(
      within(screen.getByRole("group", { name: "플래너 작업" })).queryByRole("button", {
        name: "이번주로",
      }),
    ).toBeNull();
  });

  it("opens the Wave1 meal-add sheet and preserves the selected option in links", async () => {
    const user = userEvent.setup();

    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner.mockResolvedValue(createPlannerData({ meals: [] }));

    render(<PlannerWeekScreen />);

    await screen.findByRole("heading", { name: "플래너" });
    await user.click(screen.getByRole("button", { name: "3/24 아침 식사 추가" }));

    const sheet = screen.getByTestId("planner-meal-add-sheet");
    expect(within(sheet).getByRole("heading", { name: "3/24 아침 · 식사 추가" })).toBeTruthy();

    const searchLink = within(sheet).getByRole("link", { name: /레시피 검색/ });
    const recipeBookLink = within(sheet).getByRole("link", { name: /레시피북에서 추가/ });
    const pantryLink = within(sheet).getByRole("link", { name: /팬트리 기반 추천/ });
    const leftoverLink = within(sheet).getByRole("link", { name: /남은요리에서 추가/ });
    const youtubeLink = within(sheet).getByRole("link", { name: /유튜브에서 가져오기/ });
    const manualLink = within(sheet).getByRole("link", { name: /직접 등록/ });

    expect(searchLink.getAttribute("href")).toContain("/menu-add?");
    expect(searchLink.getAttribute("href")).toContain("date=2026-03-24");
    expect(recipeBookLink.getAttribute("href")).toContain("source=recipebook");
    expect(pantryLink.getAttribute("href")).toContain("source=pantry");
    expect(leftoverLink.getAttribute("href")).toContain("source=leftover");
    expect(youtubeLink.getAttribute("href")).toContain("/menu/add/youtube?");
    expect(manualLink.getAttribute("href")).toContain("/menu/add/manual?");
  });

  it("shows a direct link back to an existing shopping list", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner.mockResolvedValue(
      createPlannerData({
        meals: [
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_title: "김치찌개",
            recipe_thumbnail_url: null,
            plan_date: "2026-04-28",
            column_id: "column-breakfast",
            planned_servings: 3,
            status: "registered",
            is_leftover: false,
            shopping_list_id: "shopping-list-1",
            shopping_list_title: "4/28 장보기",
          },
        ],
      }),
    );

    render(<PlannerWeekScreen />);

    const shoppingListLink = await screen.findByRole("link", {
      name: "4/28 장보기 보기",
    });

    expect(shoppingListLink.getAttribute("href")).toBe("/shopping/lists/shopping-list-1");
  });

  it("compresses meal slot metadata while keeping empty slots with a quieter add CTA (Wave1)", async () => {
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
    // slot rows keep the meal link compact; empty rows open the Wave1 add sheet.
    const breakfastRow = within(firstDayCard).getByText("김치찌개").closest("a");
    const dinnerButton = within(firstDayCard).getByRole("button", {
      name: "3/24 저녁 식사 추가",
    });

    expect(breakfastRow).not.toBeNull();
    expect(dinnerButton).toBeTruthy();
    expect(breakfastRow?.className).toContain("min-h-[46px]");
    expect(within(breakfastRow as HTMLElement).getByText("2인분")).toBeTruthy();
    // Wave1: status badge removed — no "등록" text
    expect(within(breakfastRow as HTMLElement).queryByText("등록")).toBeNull();
    expect(dinnerButton.textContent?.replace(/\s+/g, " ").trim()).toBe("+");
  });

  it("marks leftover meals with an explicit leftover chip", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner.mockResolvedValue(
      createPlannerData({
        meals: [
          {
            id: "meal-leftover",
            recipe_id: "recipe-1",
            recipe_title: "김치찌개",
            recipe_thumbnail_url: null,
            plan_date: "2026-03-24",
            column_id: "column-breakfast",
            planned_servings: 1,
            status: "registered",
            is_leftover: true,
          },
        ],
      }),
    );

    render(<PlannerWeekScreen />);

    const firstDayCard = await screen.findAllByLabelText(/식단 카드$/).then((cards) => cards[0]);
    const breakfastRow = within(firstDayCard).getByText("김치찌개").closest("a");

    expect(breakfastRow).not.toBeNull();
    expect(within(breakfastRow as HTMLElement).getByLabelText("남은요리 식사")).toBeTruthy();
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
    expect(
      screen
        .getByRole("heading", { name: "플래너를 불러오지 못했어요" })
        .closest("[data-state-kind='prototype-derived']")
        ?.getAttribute("data-state-tone"),
    ).toBe("error");
    expect(screen.getByText("planner failed")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByText(/아직 등록된 식사가 없어요/)).toBeTruthy();
    expect(fetchPlanner).toHaveBeenCalledTimes(2);
  });

  it("shifts planner range when the native week strip scroll settles on the next page", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner
      .mockResolvedValueOnce(createPlannerData({ meals: [] }))
      .mockResolvedValueOnce(createPlannerData({ meals: [] }))
      .mockResolvedValueOnce(createPlannerData({ meals: [] }));

    render(<PlannerWeekScreen />);

    expect(await screen.findByText(/아직 등록된 식사가 없어요/)).toBeTruthy();
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    const strip = await screen.findByTestId("planner-week-strip-viewport");
    const viewport = primeWeekStripViewport(strip);

    viewport.scrollToPage(2);
    await new Promise((resolve) => window.setTimeout(resolve, 140));

    await waitFor(() => {
      expect(fetchPlanner).toHaveBeenNthCalledWith(2, "2026-03-31", "2026-04-06");
    });

    expect(screen.queryByRole("button", { name: "이번주로" })).toBeNull();
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
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

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

  it("shows week navigation buttons on all viewports and shifts range with the next-week action (Wave1)", async () => {
    const user = userEvent.setup();

    // Wave1: buttons visible on mobile too (chevron icons); text labels visible on sm+
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
    const firstEmptySlot = screen.getByRole("button", { name: "3/24 아침 식사 추가" });
    expect(firstEmptySlot.textContent?.trim()).toBe("+");
    expect(screen.queryByPlaceholderText("새 끼니 컬럼 이름")).toBeNull();
  });

  it("scrolls to the selected day card when a current-week date chip is tapped", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner.mockResolvedValue(createPlannerData({ meals: [] }));

    render(<PlannerWeekScreen />);

    await screen.findByRole("heading", { name: "플래너" });
    await user.click(screen.getByRole("button", { name: "3/26 목 식단으로 이동" }));

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(screen.getByTestId("planner-day-card-2026-03-26").className).toContain(
      "border-2",
    );
    expect(screen.getByTestId("planner-day-card-2026-03-26").className).toContain(
      "scroll-mt",
    );
  });

  // ─── Wave1 acceptance tests ─────────────────────────────────────────────────

  it("renders slot column names as text only without emoji (Wave1 SLOT_EMOJI removal)", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner.mockResolvedValue(
      createPlannerData({
        meals: [
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_title: "비빔밥",
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
    const breakfastSlot = within(firstDayCard).getByText("비빔밥").closest("a");

    expect(breakfastSlot).not.toBeNull();
    // Slot name rendered as text — no emoji characters present
    const slotNameEl = within(firstDayCard).getByText("아침");
    expect(slotNameEl).toBeTruthy();
    expect(slotNameEl.textContent).toBe("아침");
    // Verify no emoji in the slot area (previously had 🌅 🌞 🍪 🌙)
    const slotAreaText = firstDayCard.textContent ?? "";
    expect(slotAreaText).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
  });

  it("does not render status badges on filled meal slots (Wave1 STATUS_META removal)", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner.mockResolvedValue(
      createPlannerData({
        meals: [
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_title: "된장찌개",
            recipe_thumbnail_url: null,
            plan_date: "2026-03-24",
            column_id: "column-breakfast",
            planned_servings: 1,
            status: "registered",
            is_leftover: false,
          },
          {
            id: "meal-2",
            recipe_id: "recipe-2",
            recipe_title: "파스타",
            recipe_thumbnail_url: null,
            plan_date: "2026-03-24",
            column_id: "column-dinner",
            planned_servings: 1,
            status: "shopping_done",
            is_leftover: false,
          },
        ],
      }),
    );

    render(<PlannerWeekScreen />);

    const firstDayCard = await screen.findAllByLabelText(/식단 카드$/).then((cards) => cards[0]);
    // Check meal slot rows specifically — no status badge text inside the slot rows
    const breakfastRow = within(firstDayCard).getByText("된장찌개").closest("a");
    const dinnerRow = within(firstDayCard).getByText("파스타").closest("a");

    expect(breakfastRow).not.toBeNull();
    expect(dinnerRow).not.toBeNull();
    // No status badge labels within meal slot rows
    expect(within(breakfastRow as HTMLElement).queryByText("등록")).toBeNull();
    expect(within(dinnerRow as HTMLElement).queryByText("장보기 완료")).toBeNull();
    // No aria labels for status badges
    expect(screen.queryByLabelText("식사 등록 완료")).toBeNull();
    expect(screen.queryByLabelText("장보기 완료")).toBeNull();
    expect(screen.queryByLabelText("요리 완료")).toBeNull();
  });

  it("shows '+' button on filled slots and quieter add CTAs on empty slots (Wave1)", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner.mockResolvedValue(
      createPlannerData({
        meals: [
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_title: "김밥",
            recipe_thumbnail_url: null,
            plan_date: "2026-03-24",
            column_id: "column-breakfast",
            planned_servings: 1,
            status: "registered",
            is_leftover: false,
          },
        ],
      }),
    );

    render(<PlannerWeekScreen />);

    const firstDayCard = await screen.findAllByLabelText(/식단 카드$/).then((cards) => cards[0]);
    const filledAddButton = within(firstDayCard).getByRole("button", {
      name: "3/24 아침 식사 추가",
    });
    const emptyAddButtons = within(firstDayCard).getAllByRole("button", {
      name: /3\/24 .* 식사 추가/,
    });

    expect(filledAddButton.textContent?.trim()).toBe("+");
    expect(emptyAddButtons.filter((button) => button !== filledAddButton)).toHaveLength(3);
  });

  it("uses the floating shopping CTA from the Wave1 mobile reference", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner.mockResolvedValue(createPlannerData({ meals: [] }));

    render(<PlannerWeekScreen />);

    await screen.findByText(/아직 등록된 식사가 없어요/);

    const shoppingLinks = screen.getAllByRole("link", { name: "장보기" });
    expect(shoppingLinks).toHaveLength(1);
    const fixedShoppingCta = shoppingLinks.find(
      (link) => link.closest(".fixed") !== null,
    );
    expect(fixedShoppingCta).toBeTruthy();
    expect(fixedShoppingCta?.getAttribute("href")).toBe("/shopping/flow");
    expect(fixedShoppingCta?.textContent?.trim()).toBe("장보기");
    expect(shoppingLinks[0]?.textContent).not.toContain("🛒");
  });

  it("shows empty-thumbnail placeholder with first character of column name instead of emoji (Wave1)", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner.mockResolvedValue(
      createPlannerData({
        meals: [
          {
            id: "meal-1",
            recipe_id: "recipe-1",
            recipe_title: "불고기",
            recipe_thumbnail_url: null,
            plan_date: "2026-03-24",
            column_id: "column-dinner",
            planned_servings: 1,
            status: "registered",
            is_leftover: false,
          },
        ],
      }),
    );

    render(<PlannerWeekScreen />);

    const firstDayCard = await screen.findAllByLabelText(/식단 카드$/).then((cards) => cards[0]);
    const dinnerRow = within(firstDayCard).getByText("불고기").closest("a");

    expect(dinnerRow).not.toBeNull();
    // The empty-thumbnail placeholder should show "저" (first char of "저녁"), not the moon emoji
    const placeholderTexts = within(dinnerRow as HTMLElement).getAllByText("저");
    // At least one element shows "저" as thumbnail placeholder (the slot name "저녁" also starts with "저")
    expect(placeholderTexts.length).toBeGreaterThanOrEqual(1);
  });
});
