// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecipeDetailScreen } from "@/components/recipe/recipe-detail-screen";
import { PlannerAddSheet } from "@/components/recipe/planner-add-sheet";
import { ActionConfirmation } from "@/components/shared/action-confirmation";
import { MOCK_RECIPE_DETAIL, MOCK_RECIPE_ID } from "@/lib/mock/recipes";
import { PENDING_ACTION_KEY, savePendingAction } from "@/lib/auth/pending-action";
import { useActionConfirmationStore, useAuthGateStore } from "@/stores/ui-store";
import type { PlannerData } from "@/types/planner";
import type { MealCreateData } from "@/types/meal";

const fetchJson = vi.fn();
const fetchPlanner = vi.fn();
const createMeal = vi.fn();
const getSession = vi.fn();
const onAuthStateChange = vi.fn();
const hasSupabasePublicEnv = vi.fn();
const mockRouterPush = vi.fn();
const mockRouterReplace = vi.fn();
const navigationMocks = vi.hoisted(() => ({
  searchParams: vi.fn(() => new URLSearchParams()),
}));
const globalsCss = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function ruleBody(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = globalsCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]+)\\}`));

  return match?.[1] ?? "";
}

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

vi.mock("next/navigation", () => ({
  usePathname: () => `/recipe/${MOCK_RECIPE_ID}`,
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
  useSearchParams: () => navigationMocks.searchParams(),
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
    product_entries: [],
  };
}

function buildPlannerDataWithColumns(names: string[]): PlannerData {
  return {
    columns: names.map((name, index) => ({
      id: `col-${index}`,
      name,
      sort_order: index + 1,
    })),
    meals: [],
    product_entries: [],
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
    recipe_nutrition_snapshot_id: null,
  };
}

function buildSelectedDateLabel(date: Date) {
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return `${weekday} ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function buildLocalDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function installMatchMedia(matchesDesktop: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(min-width: 1024px)" ? matchesDesktop : !matchesDesktop,
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

describe("planner add flow", () => {
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    Reflect.deleteProperty(window, "matchMedia");
  });

  beforeEach(() => {
    installMatchMedia(false);
    fetchJson.mockReset();
    fetchPlanner.mockReset();
    createMeal.mockReset();
    getSession.mockReset();
    onAuthStateChange.mockReset();
    hasSupabasePublicEnv.mockReset();
    mockRouterPush.mockReset();
    mockRouterReplace.mockReset();
    navigationMocks.searchParams.mockReset();
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams());
    useActionConfirmationStore.getState().dismiss();
    useAuthGateStore.setState({ isOpen: false, action: null });
    window.localStorage.clear();
    window.sessionStorage.clear();

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

    const dialog = await screen.findByRole("dialog", {
      name: "로그인이 필요한 작업이에요",
    });
    expect(dialog.getAttribute("data-app-overlay-shell")).toBe("bottom-sheet");
    expect(within(dialog).getByText(/로그인이 필요한 작업이에요/)).toBeTruthy();
    expect(
      within(dialog).queryByText(/플래너 추가 기능은 로그인 후 이용할 수 있어요/),
    ).toBeNull();
    expect(
      within(dialog).getByText("로그인하면 원래 하려던 작업으로 자동 이동해요."),
    ).toBeTruthy();
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

  // accept-happy-path: authenticated user submits → meal created → confirmation dialog
  it.each([false, true])("keeps cancellation and failed submission focus without creating a success owner (desktop=%s)", async (desktop) => {
    installMatchMedia(desktop);
    fetchPlanner.mockResolvedValue(buildPlannerData());
    createMeal.mockRejectedValue(new Error("추가 시험 실패"));
    const user = userEvent.setup();
    render(<><RecipeDetailScreen initialAuthenticated recipeId={MOCK_RECIPE_DETAIL.id} /><ActionConfirmation /></>);
    const opener = (await screen.findAllByRole("button", { name: "플래너에 추가" }))[0]!;
    await user.click(opener);
    await screen.findByRole("dialog", { name: "플래너에 추가" });
    await user.keyboard("{Escape}{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(opener));
    expect(createMeal).not.toHaveBeenCalled();
    expect(useActionConfirmationStore.getState().fallbackFocusRef).toBeNull();

    await user.click(opener);
    const planner = await screen.findByRole("dialog", { name: "플래너에 추가" });
    await user.click(within(planner).getByRole("button", { name: desktop ? /저녁에 추가$/ : "플래너에 추가" }));
    expect(await within(planner).findByText("추가 시험 실패")).toBeTruthy();
    expect(createMeal).toHaveBeenCalledTimes(1);
    expect(useActionConfirmationStore.getState().message).toBeNull();
    expect(useActionConfirmationStore.getState().fallbackFocusRef).toBeNull();
    await user.click(within(planner).getByRole("button", { name: desktop ? "취소" : "닫기" }));
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it.each(["unmount", "pathname"])("ignores a pending success after its owner leaves by %s", async (leaveBy) => {
    fetchPlanner.mockResolvedValue(buildPlannerData());
    let finishMeal!: (data: MealCreateData) => void;
    createMeal.mockReturnValue(new Promise<MealCreateData>((resolve) => { finishMeal = resolve; }));
    const previousPath = window.location.pathname;
    const user = userEvent.setup();
    const view = render(<><RecipeDetailScreen initialAuthenticated recipeId={MOCK_RECIPE_DETAIL.id} /><ActionConfirmation /></>);
    await user.click((await screen.findAllByRole("button", { name: "플래너에 추가" }))[0]!);
    const planner = await screen.findByRole("dialog", { name: "플래너에 추가" });
    await user.click(within(planner).getByRole("button", { name: "플래너에 추가" }));
    if (leaveBy === "unmount") view.rerender(<><button>새 페이지 작업</button><ActionConfirmation /></>);
    else window.history.replaceState({}, "", "/planner/after-submit");
    try {
      await act(async () => finishMeal(buildMealCreateData()));
      expect(useActionConfirmationStore.getState().message).toBeNull();
      expect(useActionConfirmationStore.getState().fallbackFocusRef).toBeNull();
      expect(screen.queryByRole("dialog", { name: /추가됐어요$/ })).toBeNull();
      expect(createMeal).toHaveBeenCalledTimes(1);
    } finally {
      window.history.replaceState({}, "", previousPath);
    }
  });

  it.each([
    { desktop: false, closeWith: "confirm" },
    { desktop: false, closeWith: "escape" },
    { desktop: true, closeWith: "confirm" },
    { desktop: true, closeWith: "escape" },
  ])("restores the actual planner opener after success (desktop=$desktop, close=$closeWith)", async ({ desktop, closeWith }) => {
    installMatchMedia(desktop);
    fetchPlanner.mockResolvedValue(buildPlannerData());
    createMeal.mockResolvedValue(buildMealCreateData());
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { frames.set(++frameId, callback); return frameId; });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => { frames.delete(id); });
    const flushFrames = () => act(() => {
      while (frames.size) {
        const pending = Array.from(frames.entries());
        frames.clear();
        for (const [, callback] of pending) callback(0);
      }
    });
    const user = userEvent.setup();
    try {
      render(<><RecipeDetailScreen initialAuthenticated recipeId={MOCK_RECIPE_DETAIL.id} /><ActionConfirmation /></>);
      const opener = (await screen.findAllByRole("button", { name: "플래너에 추가" }))[0]!;
      await user.click(opener);
      const planner = await screen.findByRole("dialog", { name: "플래너에 추가" });
      await user.click(within(planner).getByRole("button", { name: desktop ? /저녁에 추가$/ : "플래너에 추가" }));
      const confirmation = await screen.findByRole("dialog", { name: /저녁에 추가됐어요$/ });
      flushFrames();
      expect(confirmation.contains(document.activeElement)).toBe(true);
      expect(useActionConfirmationStore.getState().fallbackFocusRef?.current).toBe(opener);
      if (closeWith === "escape") await user.keyboard("{Escape}");
      else await user.click(within(confirmation).getByRole("button", { name: "확인" }));
      flushFrames();
      expect(document.activeElement).toBe(opener);
      expect(useActionConfirmationStore.getState().fallbackFocusRef).toBeNull();
    } finally {
      cleanup();
      vi.restoreAllMocks();
    }
  });

  it("creates a meal and shows success feedback on submit", async () => {
    fetchPlanner.mockResolvedValue(buildPlannerData());
    const createdMeal = buildMealCreateData();
    createMeal.mockResolvedValue(createdMeal);
    const expectedPlanDate = buildLocalDateKey(new Date());

    render(
      <>
        <RecipeDetailScreen
          initialAuthenticated
          recipeId={MOCK_RECIPE_DETAIL.id}
        />
        <ActionConfirmation />
      </>,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "플래너에 추가" }),
    );

    // Sheet should open with columns
    const dialog = await screen.findByRole("dialog", { name: "플래너에 추가" });
    expect(dialog.getAttribute("data-app-overlay-shell")).toBe("bottom-sheet");
    expect(within(dialog).getByRole("button", { name: "아침" })).toBeTruthy();
    expect(
      within(dialog)
        .getByRole("button", { name: "인분 줄이기" })
        .getAttribute("data-app-stepper-control"),
    ).toBe("decrement");
    expect(
      within(dialog)
        .getByRole("button", { name: "인분 늘리기" })
        .getAttribute("data-app-stepper-control"),
    ).toBe("increment");

    // Submit
    await userEvent.click(
      within(dialog).getByRole("button", { name: "플래너에 추가" }),
    );

    // Sheet closes, the returned meal is reflected in the recipe summary, and
    // the root-level confirmation dialog presents the exact selected target.
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "플래너에 추가" })).toBeNull();
    });
    expect(createMeal).toHaveBeenCalledTimes(1);
    const createBody = createMeal.mock.calls[0]?.[0] as {
      recipe_id: string;
      plan_date: string;
      column_id: string;
      planned_servings: number;
    };
    expect(createBody).toEqual({
      recipe_id: MOCK_RECIPE_DETAIL.id,
      plan_date: expectedPlanDate,
      column_id: "col-dinner",
      planned_servings: MOCK_RECIPE_DETAIL.base_servings,
    });
    expect(await createMeal.mock.results[0]?.value).toEqual(createdMeal);
    expect(await screen.findByText("플래너등록 53")).toBeTruthy();

    const [, month, day] = expectedPlanDate.split("-").map(Number);
    const expectedConfirmation = `${month}월 ${day}일 저녁에 추가됐어요`;
    expect(
      await screen.findByRole("dialog", { name: expectedConfirmation }),
    ).toBeTruthy();
  });

  it.each([
    { viewport: "mobile", desktop: false },
    { viewport: "desktop", desktop: true },
  ])("keeps detail servings through planner cancellation and submission on $viewport", async ({ desktop }) => {
    installMatchMedia(desktop);
    fetchPlanner.mockResolvedValue(buildPlannerData());
    createMeal.mockResolvedValue({ ...buildMealCreateData(), planned_servings: 3 });

    render(<RecipeDetailScreen initialAuthenticated recipeId={MOCK_RECIPE_DETAIL.id} />);

    await userEvent.click(await screen.findByRole("button", { name: "인분 늘리기" }));
    await userEvent.click(screen.getAllByRole("button", { name: "플래너에 추가" })[0]!);

    let dialog = await screen.findByRole("dialog", { name: "플래너에 추가" });
    expect(within(dialog).getByText(/선택 3인분/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "인분 늘리기" }));
    expect(within(dialog).getByText(/선택 4인분/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "닫기" }));

    await userEvent.click(screen.getAllByRole("button", { name: "플래너에 추가" })[0]!);
    dialog = await screen.findByRole("dialog", { name: "플래너에 추가" });
    expect(within(dialog).getByText(/선택 3인분/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", {
      name: desktop ? /저녁에 추가$/ : "플래너에 추가",
    }));

    await waitFor(() => expect(createMeal).toHaveBeenCalledTimes(1));
    expect(createMeal).toHaveBeenCalledWith(expect.objectContaining({
      recipe_id: MOCK_RECIPE_DETAIL.id,
      planned_servings: 3,
    }));
  });

  it("keeps the minimum serving at one in detail and planner submission", async () => {
    fetchPlanner.mockResolvedValue(buildPlannerData());
    createMeal.mockResolvedValue({ ...buildMealCreateData(), planned_servings: 1 });
    render(<RecipeDetailScreen initialAuthenticated recipeId={MOCK_RECIPE_DETAIL.id} />);

    await userEvent.click(await screen.findByRole("button", { name: "인분 줄이기" }));
    const detailDecrement = screen.getByRole("button", { name: "인분 줄이기" });
    expect(detailDecrement.hasAttribute("disabled")).toBe(true);
    await userEvent.click(detailDecrement);
    await userEvent.click(screen.getByRole("button", { name: "플래너에 추가" }));

    const dialog = await screen.findByRole("dialog", { name: "플래너에 추가" });
    const plannerDecrement = within(dialog).getByRole("button", { name: "인분 줄이기" });
    expect(plannerDecrement.hasAttribute("disabled")).toBe(true);
    await userEvent.click(plannerDecrement);
    await userEvent.click(within(dialog).getByRole("button", { name: "플래너에 추가" }));

    await waitFor(() => expect(createMeal).toHaveBeenCalledTimes(1));
    expect(createMeal).toHaveBeenCalledWith(expect.objectContaining({ planned_servings: 1 }));
  });

  it("restores selected servings after the guest login action remounts detail", async () => {
    fetchPlanner.mockResolvedValue(buildPlannerData());
    createMeal.mockResolvedValue({ ...buildMealCreateData(), planned_servings: 3 });
    const guest = render(<RecipeDetailScreen recipeId={MOCK_RECIPE_DETAIL.id} />);

    await userEvent.click(await screen.findByRole("button", { name: "인분 늘리기" }));
    await userEvent.click(screen.getByRole("button", { name: "플래너에 추가" }));
    const pendingAction = useAuthGateStore.getState().action;
    expect(pendingAction).toEqual(expect.objectContaining({ type: "planner", plannedServings: 3 }));
    if (!pendingAction) throw new Error("Missing guest planner intent");
    expect(savePendingAction(pendingAction)).toBe(true);
    guest.unmount();
    useAuthGateStore.getState().close();

    render(<RecipeDetailScreen initialAuthenticated recipeId={MOCK_RECIPE_DETAIL.id} />);
    let dialog = await screen.findByRole("dialog", { name: "플래너에 추가" });
    expect(within(dialog).getByText(/선택 3인분/)).toBeTruthy();
    expect(window.sessionStorage.getItem(PENDING_ACTION_KEY)).toBeNull();
    await userEvent.click(within(dialog).getByRole("button", { name: "닫기" }));
    expect(screen.getByText("3인분")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "플래너에 추가" }));
    dialog = await screen.findByRole("dialog", { name: "플래너에 추가" });
    expect(within(dialog).getByText(/선택 3인분/)).toBeTruthy();
    await userEvent.click(within(dialog).getByRole("button", { name: "플래너에 추가" }));

    await waitFor(() => expect(createMeal).toHaveBeenCalledTimes(1));
    expect(createMeal).toHaveBeenCalledWith(expect.objectContaining({ planned_servings: 3 }));
  });

  it("uses a lighter sheet heading and keeps the selected date as chip state only", async () => {
    fetchPlanner.mockResolvedValue(buildPlannerData());

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

    const todayLabel = buildSelectedDateLabel(new Date());
    expect(within(dialog).queryByText(todayLabel)).toBeNull();
    expect(
      within(dialog).getByRole("heading", { name: "플래너에 추가" }),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole("button", { name: "플래너에 추가" }),
    ).toBeTruthy();
  });

  it("renders desktop recipe-detail planner dates as a horizontal date rail", () => {
    installMatchMedia(true);
    const selectableDates = [
      "2026-05-21",
      "2026-05-22",
      "2026-05-23",
      "2026-05-24",
      "2026-05-25",
      "2026-05-26",
      "2026-05-27",
      "2026-05-28",
      "2026-05-29",
      "2026-05-30",
      "2026-05-31",
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
    ];

    render(
      <PlannerAddSheet
        columns={buildPlannerData().columns}
        errorMessage={null}
        isOpen
        onChangeServings={vi.fn()}
        onClose={vi.fn()}
        onRetryLoad={vi.fn()}
        onSelectColumn={vi.fn()}
        onSelectDate={vi.fn()}
        onSubmit={vi.fn()}
        selectableDates={selectableDates}
        selectedColumnId="col-dinner"
        selectedDate="2026-05-21"
        servings={2}
        sheetState="ready"
        variant="recipe-detail"
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "플래너에 추가" });
    const dateGroup = within(dialog).getByRole("group", { name: "날짜 선택" });
    const dateButtons = within(dateGroup).getAllByRole("button");

    expect(dateGroup.className).toContain("web-planner-date-grid");
    expect(dateGroup.className).not.toContain("web-modal-chip-grid");
    expect(dateButtons).toHaveLength(14);
    expect(dateButtons[0].className).toContain("web-planner-date-cell");
    expect(dateButtons[0].className).toContain("web-chip-active");
    expect(dateButtons[0].querySelector(".web-planner-date-weekday")?.textContent).toBe("목");
    expect(dateButtons[0].querySelector(".web-planner-date-day")?.textContent).toBe("5/21");
    expect(dateButtons[0].querySelector(".web-planner-date-today")?.textContent).toBe("오늘");
    expect(dateButtons[1].querySelector(".web-planner-date-today")).toBeNull();
    expect(dateButtons[7].querySelector(".web-planner-date-day")?.textContent).toBe("5/28");
  });

  it("keeps the desktop planner add header clean while preserving selected target in the submit action", () => {
    installMatchMedia(true);

    render(
      <PlannerAddSheet
        columns={buildPlannerData().columns}
        errorMessage={null}
        isOpen
        onChangeServings={vi.fn()}
        onClose={vi.fn()}
        onRetryLoad={vi.fn()}
        onSelectColumn={vi.fn()}
        onSelectDate={vi.fn()}
        onSubmit={vi.fn()}
        recipePreview={{
          background: "#eef8ff",
          emoji: "🍳",
          imageSrc: "https://img.example.com/recipe-detail.jpg",
          meta: "25분 · 선택 2인분",
          title: "긴 이름의 레시피",
        }}
        selectableDates={["2026-05-21"]}
        selectedColumnId="col-dinner"
        selectedDate="2026-05-21"
        servings={2}
        sheetState="ready"
        variant="recipe-detail"
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "플래너에 추가" });
    const imageShell = within(dialog).getByTestId("planner-add-recipe-preview-image");
    const image = imageShell.querySelector("img");

    expect(within(dialog).queryByText("대상 · 5/21 저녁")).toBeNull();
    expect(imageShell.className).toContain("web-modal-preview-thumb");
    expect(image?.getAttribute("src")).toContain("recipe-detail.jpg");
    expect(image?.className).toContain("web-modal-preview-thumb-image");
    expect(
      Array.from(dialog.querySelectorAll(".web-planner-add-section-label")).map(
        (element) => element.textContent,
      ),
    ).toEqual(["날짜", "끼니", "인분"]);
    expect(dialog.querySelector(".web-planner-servings-copy")?.textContent).toBe(
      "인분 조절",
    );
    expect(ruleBody(".web-planner-add-section-label")).toContain("font-weight: 700;");
    expect(ruleBody(".web-planner-servings-copy")).toContain("font-weight: 700;");
    expect(ruleBody(".web-planner-servings-copy")).toContain("color: var(--web-text-1);");
    expect(
      within(dialog).getByRole("button", { name: "5/21 저녁에 추가" }),
    ).toBeTruthy();
    expect(within(dialog).queryByText("날짜와 끼니를 선택해 주세요")).toBeNull();
  });

  it("keeps four meal columns in one row and scrolls when there are five or more", async () => {
    fetchPlanner.mockResolvedValueOnce(
      buildPlannerDataWithColumns(["아침", "점심", "간식", "저녁"]),
    );

    const { unmount } = render(
      <RecipeDetailScreen
        initialAuthenticated
        recipeId={MOCK_RECIPE_DETAIL.id}
      />,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "플래너에 추가" }),
    );

    let dialog = await screen.findByRole("dialog", { name: "플래너에 추가" });
    let mealGroup = within(dialog).getByRole("group", { name: "끼니 선택" });

    expect(mealGroup.className).toContain("grid-cols-4");
    expect(mealGroup.className).not.toContain("overflow-x-auto");

    unmount();
    cleanup();

    fetchPlanner.mockResolvedValueOnce(
      buildPlannerDataWithColumns(["아침", "점심", "간식", "저녁", "야식"]),
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

    dialog = await screen.findByRole("dialog", { name: "플래너에 추가" });
    mealGroup = within(dialog).getByRole("group", { name: "끼니 선택" });

    expect(mealGroup.className).toContain("overflow-x-auto");
    expect(within(mealGroup).getByRole("button", { name: "야식" }).className).toContain(
      "min-w-[76px]",
    );
  });

  it("keeps the planner confirmation open until the user acknowledges it", async () => {
    fetchPlanner.mockResolvedValue(buildPlannerData());
    createMeal.mockResolvedValue(buildMealCreateData());
    const expectedPlanDate = buildLocalDateKey(new Date());

    render(
      <>
        <RecipeDetailScreen
          initialAuthenticated
          recipeId={MOCK_RECIPE_DETAIL.id}
        />
        <ActionConfirmation />
      </>,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "플래너에 추가" }),
    );

    const dialog = await screen.findByRole("dialog", { name: "플래너에 추가" });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "플래너에 추가" }),
    );

    expect(createMeal).toHaveBeenCalledWith(
      expect.objectContaining({ plan_date: expectedPlanDate }),
    );
    const [, month, day] = expectedPlanDate.split("-").map(Number);
    const expectedConfirmation = `${month}월 ${day}일 저녁에 추가됐어요`;
    const confirmationDialog = await screen.findByRole("dialog", {
      name: expectedConfirmation,
    });

    expect(useActionConfirmationStore.getState().message).toBe(expectedConfirmation);
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 4100));
    });
    expect(
      screen.getByRole("dialog", { name: expectedConfirmation }),
    ).toBeTruthy();
    expect(useActionConfirmationStore.getState().message).toBe(expectedConfirmation);

    await userEvent.click(
      within(confirmationDialog).getByRole("button", { name: "확인" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: expectedConfirmation }),
      ).toBeNull();
    });
    expect(useActionConfirmationStore.getState().message).toBeNull();
  }, 10000);

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

    const apiError = new Error("플래너 추가에 실패했어요. 다시 시도해 주세요.");
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
  it("uses no guessed caller ref for a successful planner action resumed after login", async () => {
    fetchPlanner.mockResolvedValue(buildPlannerData());
    createMeal.mockResolvedValue(buildMealCreateData());
    expect(savePendingAction({
      type: "planner",
      recipeId: MOCK_RECIPE_DETAIL.id,
      redirectTo: `/recipe/${MOCK_RECIPE_DETAIL.id}`,
      createdAt: Date.now(),
    })).toBe(true);
    render(<><RecipeDetailScreen initialAuthenticated recipeId={MOCK_RECIPE_DETAIL.id} /><ActionConfirmation /></>);
    const dialog = await screen.findByRole("dialog", { name: "플래너에 추가" });
    await userEvent.click(within(dialog).getByRole("button", { name: "플래너에 추가" }));
    expect(await screen.findByRole("dialog", { name: /저녁에 추가됐어요$/ })).toBeTruthy();
    expect(useActionConfirmationStore.getState().fallbackFocusRef).toBeNull();
    expect(useActionConfirmationStore.getState().returnFocusPath).toBeNull();
  });

  it("auto-opens planner add sheet when returning from login gate with pending planner action", async () => {
    fetchPlanner.mockResolvedValue(buildPlannerData());

    expect(savePendingAction({
      type: "planner",
      recipeId: MOCK_RECIPE_DETAIL.id,
      redirectTo: `/recipe/${MOCK_RECIPE_DETAIL.id}`,
      createdAt: Date.now(),
    })).toBe(true);
    expect(window.sessionStorage.getItem(PENDING_ACTION_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(PENDING_ACTION_KEY)).toBeNull();

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
    const dialog = screen.getByRole("dialog", { name: "플래너에 추가" });
    expect(within(dialog).getByText(/선택 2인분/)).toBeTruthy();
    expect(window.sessionStorage.getItem(PENDING_ACTION_KEY)).toBeNull();
  });

  it("does not resume a planner action copied through cross-tab local storage", async () => {
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

    expect(await screen.findByRole("button", { name: "플래너에 추가" })).toBeTruthy();
    await waitFor(() => {
      expect(window.localStorage.getItem(PENDING_ACTION_KEY)).toBeNull();
    });
    expect(window.sessionStorage.getItem(PENDING_ACTION_KEY)).toBeNull();
    expect(screen.queryByRole("dialog", { name: "플래너에 추가" })).toBeNull();
    expect(screen.queryByText(/로그인 완료.*플래너/)).toBeNull();
  });
});
