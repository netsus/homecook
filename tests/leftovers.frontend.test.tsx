// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LeftoversScreen } from "@/components/leftovers/leftovers-screen";
import { AteListScreen } from "@/components/leftovers/ate-list-screen";
import * as leftoversApi from "@/lib/api/leftovers";
import * as mealApi from "@/lib/api/meal";
import * as plannerApi from "@/lib/api/planner";
import type { LeftoverListItemData } from "@/types/leftover";

const LEFTOVERS_DESCRIPTION =
  "요리한 음식 기록을 확인하고, 남은 음식은 다른 끼니에 추가할 수 있어요. 다 먹은 음식은 다먹음 버튼으로 정리해 주세요.";
const EATEN_DESCRIPTION =
  "다먹은 음식 기록을 확인하고, 필요하면 남은 요리로 다시 옮길 수 있어요.";

const navigationMocks = vi.hoisted(() => ({
  searchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  })),
  useSearchParams: () => navigationMocks.searchParams(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    prefetch?: boolean;
    [key: string]: unknown;
  }) => {
    void _prefetch;

    return React.createElement("a", { href, ...props }, children);
  },
}));

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: null },
      }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  }),
}));

vi.mock("@/lib/supabase/env", () => ({
  hasSupabasePublicEnv: () => false,
}));

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  readE2EAuthOverride: () => null,
  withE2EAuthOverrideHeaders: (init?: RequestInit) => init ?? {},
}));

vi.mock("@/lib/mock/qa-fixture-client", () => ({
  isQaFixtureClientModeEnabled: () => false,
}));

vi.mock("@/components/auth/social-login-buttons", () => ({
  SocialLoginButtons: ({ nextPath }: { nextPath: string }) =>
    React.createElement("div", { "data-testid": "social-login-buttons", "data-next-path": nextPath }, "소셜 로그인"),
}));

function installMatchMedia(matchesAppView: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 1023px)" ? matchesAppView : !matchesAppView,
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

const LEFTOVER_ITEMS: LeftoverListItemData[] = [
  {
    id: "ld-1",
    recipe_id: "recipe-1",
    recipe_title: "김치찌개",
    recipe_thumbnail_url: null,
    status: "leftover",
    cooked_at: "2026-04-20",
    eaten_at: null,
    cooking_servings: 2,
    source_meal_label: "저녁",
    source_planned_servings: 2,
  },
  {
    id: "ld-2",
    recipe_id: "recipe-2",
    recipe_title: "된장찌개",
    recipe_thumbnail_url: "https://img.example.com/doenjang.jpg",
    status: "leftover",
    cooked_at: "2026-04-19",
    eaten_at: null,
    cooking_servings: 1,
    source_meal_label: "점심",
    source_planned_servings: 1,
  },
];

const EATEN_ITEMS: LeftoverListItemData[] = [
  {
    id: "ld-3",
    recipe_id: "recipe-1",
    recipe_title: "김치찌개",
    recipe_thumbnail_url: null,
    status: "eaten",
    cooked_at: "2026-04-18",
    eaten_at: "2026-04-22T00:00:00.000Z",
    cooking_servings: 2,
    source_meal_label: "저녁",
    source_planned_servings: 2,
  },
];

describe("LeftoversScreen", () => {
  beforeEach(() => {
    installMatchMedia(false);
    navigationMocks.searchParams.mockReset();
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams());
    vi.spyOn(leftoversApi, "isLeftoverApiError").mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("renders unauthorized state when not authenticated", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockImplementation(
      () => new Promise(() => {}),
    );

    render(<LeftoversScreen initialAuthenticated={false} />);

    await waitFor(() => {
      expect(screen.getByText("이 화면은 로그인이 필요해요")).toBeTruthy();
    });

    expect(screen.getByTestId("social-login-buttons")).toBeTruthy();
  });

  it("renders loading state while fetching", () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockImplementation(
      () => new Promise(() => {}),
    );

    render(<LeftoversScreen initialAuthenticated={true} />);

    expect(screen.getByTestId("leftovers-loading")).toBeTruthy();
  });

  it("uses the mobile auth gate shell instead of the legacy state panel", async () => {
    installMatchMedia(true);
    vi.spyOn(leftoversApi, "fetchLeftovers").mockImplementation(
      () => new Promise(() => {}),
    );

    render(<LeftoversScreen initialAuthenticated={false} />);

    expect(await screen.findByTestId("leftovers-mobile-auth-gate")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "남은 요리" })).toBeTruthy();
  });

  it("renders leftover list after loading", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: LEFTOVER_ITEMS,
    });

    render(<LeftoversScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    expect(screen.getByText("된장찌개")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "남은 요리 2개" })).toBeTruthy();
    expect(screen.getByText(LEFTOVERS_DESCRIPTION)).toBeTruthy();
    expect(screen.getAllByTestId("leftover-card")).toHaveLength(2);
    expect(screen.getAllByTestId("eat-button")).toHaveLength(2);
    expect(screen.getAllByTestId("planner-add-button")).toHaveLength(2);
    expect(screen.getByText("< 마이페이지")).toBeTruthy();
    expect(screen.getByTestId("leftover-list").className).toContain(
      "web-leftover-grid",
    );
    expect(screen.getAllByRole("button", { name: "다 먹었어요" })).toHaveLength(
      2,
    );
    expect(screen.getAllByRole("button", { name: "플래너에 추가" })).toHaveLength(
      2,
    );
    expect(screen.getAllByRole("link", { name: "요리하기" })).toHaveLength(2);
    expect(screen.getByRole("link", { name: "김치찌개" }).getAttribute("href")).toBe(
      "/recipe/recipe-1",
    );
  });

  it("formats leftover timestamps with the Korea calendar day", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: [
        {
          ...LEFTOVER_ITEMS[0],
          cooked_at: "2026-04-20T16:30:00.000Z",
        },
      ],
    });

    render(<LeftoversScreen initialAuthenticated={true} />);

    expect(await screen.findByText("김치찌개")).toBeTruthy();
    expect(screen.getByText(/4월 21일/)).toBeTruthy();
  });

  it("renders empty state when no leftovers", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: [],
    });

    render(<LeftoversScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("남은 요리가 없어요")).toBeTruthy();
    });

    expect(
      screen.getByText("요리를 완료하면 여기에 저장돼요"),
    ).toBeTruthy();
  });

  it("renders error state on fetch failure", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockRejectedValue(
      new Error("서버 오류"),
    );

    render(<LeftoversScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(
        screen.getByText("남은 요리를 불러오지 못했어요"),
      ).toBeTruthy();
    });

    expect(screen.getByText("다시 시도")).toBeTruthy();
  });

  it("removes item from list after eat action", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: LEFTOVER_ITEMS,
    });
    vi.spyOn(leftoversApi, "eatLeftover").mockResolvedValue({
      id: "ld-1",
      status: "eaten",
      eaten_at: "2026-04-29T00:00:00.000Z",
      auto_hide_at: "2026-05-29T00:00:00.000Z",
    });

    render(<LeftoversScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    const user = userEvent.setup();
    const eatButtons = screen.getAllByTestId("eat-button");
    await user.click(eatButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("다먹음 처리됐어요")).toBeTruthy();
    });

    expect(screen.getAllByTestId("leftover-card")).toHaveLength(1);
    expect(screen.queryByText("김치찌개")).toBeNull();
  });

  it("shows error feedback when eat fails", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: LEFTOVER_ITEMS,
    });
    vi.spyOn(leftoversApi, "eatLeftover").mockRejectedValue(
      new Error("다먹음 처리에 실패했어요."),
    );

    render(<LeftoversScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    const user = userEvent.setup();
    const eatButtons = screen.getAllByTestId("eat-button");
    await user.click(eatButtons[0]);

    await waitFor(() => {
      expect(
        screen.getByText("다먹음 처리에 실패했어요."),
      ).toBeTruthy();
    });

    // Items should still be in the list
    expect(screen.getAllByTestId("leftover-card")).toHaveLength(2);
  });

  it("transitions to empty state after eating last item", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: [LEFTOVER_ITEMS[0]],
    });
    vi.spyOn(leftoversApi, "eatLeftover").mockResolvedValue({
      id: "ld-1",
      status: "eaten",
      eaten_at: "2026-04-29T00:00:00.000Z",
      auto_hide_at: "2026-05-29T00:00:00.000Z",
    });

    render(<LeftoversScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("eat-button"));

    await waitFor(() => {
      expect(screen.getByText("남은 요리가 없어요")).toBeTruthy();
    });
  });

  it("opens planner-add sheet when clicking planner add button", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: LEFTOVER_ITEMS,
    });
    vi.spyOn(plannerApi, "fetchPlanner").mockResolvedValue({
      columns: [
        { id: "col-1", name: "아침", sort_order: 0 },
        { id: "col-2", name: "점심", sort_order: 1 },
      ],
      meals: [],
    });

    render(<LeftoversScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    const user = userEvent.setup();
    const plannerButtons = screen.getAllByTestId("planner-add-button");
    await user.click(plannerButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("날짜와 끼니를 선택해 주세요")).toBeTruthy();
    });

    const dateGroup = screen.getByRole("group", { name: "날짜 선택" });
    expect(within(dateGroup).getAllByRole("button")).toHaveLength(14);
  });

  it("submits planner add with leftover_dish_id", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: LEFTOVER_ITEMS,
    });
    vi.spyOn(plannerApi, "fetchPlanner").mockResolvedValue({
      columns: [
        { id: "col-1", name: "아침", sort_order: 0 },
        { id: "col-2", name: "점심", sort_order: 1 },
      ],
      meals: [],
    });
    const createMealSpy = vi
      .spyOn(mealApi, "createMeal")
      .mockResolvedValue({
        id: "meal-1",
        plan_date: "2026-04-29",
        column_id: "col-1",
        recipe_id: "recipe-1",
        planned_servings: 1,
        status: "registered",
        is_leftover: true,
        leftover_dish_id: "ld-1",
      });

    render(<LeftoversScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    const user = userEvent.setup();
    await user.click(screen.getAllByTestId("planner-add-button")[0]);

    // Wait for sheet to be ready (identified by the sheet description)
    await waitFor(() => {
      expect(screen.getByText("날짜와 끼니를 선택해 주세요")).toBeTruthy();
    });

    // Click the confirm button inside the dialog
    const dialog = screen.getByRole("dialog");
    const confirmButtons = Array.from(dialog.querySelectorAll("button")).filter(
      (btn) => btn.textContent === "날짜 끼니에 추가",
    );
    await user.click(confirmButtons[0]);

    await waitFor(() => {
      expect(createMealSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          leftover_dish_id: "ld-1",
          recipe_id: "recipe-1",
        }),
      );
    });
  });

  it("renders the mobile planner-add action without a broken leading icon", async () => {
    installMatchMedia(true);
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: LEFTOVER_ITEMS,
    });

    render(<LeftoversScreen initialAuthenticated={true} />);

    const plannerAddButton = (await screen.findAllByTestId("planner-add-button"))[0];
    expect(plannerAddButton.textContent?.trim()).toBe("날짜 끼니에 추가");
    expect(screen.getByText(LEFTOVERS_DESCRIPTION)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "다먹음" })).toHaveLength(2);
  });

  it("has link to ate-list page", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: LEFTOVER_ITEMS,
    });

    render(<LeftoversScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    const ateListLink = screen.getByText("다먹은 요리");
    const href = ateListLink.closest("a")?.getAttribute("href") ?? "";
    expect(href).toContain("/leftovers/ate");
    expect(href).toContain("returnTo=");
    expect(href).toContain("returnSurface=leftovers.list");
  });

  it("retries loading on error action", async () => {
    const fetchSpy = vi
      .spyOn(leftoversApi, "fetchLeftovers")
      .mockRejectedValueOnce(new Error("서버 오류"))
      .mockResolvedValueOnce({ items: LEFTOVER_ITEMS });

    render(<LeftoversScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(
        screen.getByText("남은 요리를 불러오지 못했어요"),
      ).toBeTruthy();
    });

    const user = userEvent.setup();
    await user.click(screen.getByText("다시 시도"));

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("AteListScreen", () => {
  beforeEach(() => {
    installMatchMedia(false);
    navigationMocks.searchParams.mockReset();
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams());
    vi.spyOn(leftoversApi, "isLeftoverApiError").mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "matchMedia");
  });

  it("renders unauthorized state when not authenticated", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockImplementation(
      () => new Promise(() => {}),
    );

    render(<AteListScreen initialAuthenticated={false} />);

    await waitFor(() => {
      expect(screen.getByText("이 화면은 로그인이 필요해요")).toBeTruthy();
    });

    expect(screen.getByTestId("social-login-buttons")).toBeTruthy();
  });

  it("renders loading state while fetching", () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockImplementation(
      () => new Promise(() => {}),
    );

    render(<AteListScreen initialAuthenticated={true} />);

    expect(screen.getByTestId("ate-list-loading")).toBeTruthy();
  });

  it("uses the mobile auth gate shell instead of the legacy state panel", async () => {
    installMatchMedia(true);
    vi.spyOn(leftoversApi, "fetchLeftovers").mockImplementation(
      () => new Promise(() => {}),
    );

    render(<AteListScreen initialAuthenticated={false} />);

    expect(await screen.findByTestId("ate-list-mobile-auth-gate")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "다먹은 요리" })).toBeTruthy();
  });

  it("renders eaten items after loading", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: EATEN_ITEMS,
    });

    render(<AteListScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    expect(screen.getAllByTestId("ate-list-card")).toHaveLength(1);
    expect(screen.getByText("< 마이페이지")).toBeTruthy();
    expect(screen.getByTestId("ate-item-list").className).toContain(
      "web-ate-list",
    );
    expect(screen.getByTestId("ate-list-card").className).toContain(
      "web-ate-row",
    );
    expect(screen.getByTestId("uneat-button")).toBeTruthy();
    expect(screen.getByRole("button", { name: "되돌리기" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "다시 만들기" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "김치찌개 레시피 보기" }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "김치찌개" }).getAttribute("href")).toBe(
      "/recipe/recipe-1",
    );
    expect(screen.getByText(/4월 22일/)).toBeTruthy();
    expect(screen.getByText(/저녁/)).toBeTruthy();
    expect(screen.queryByText(/다먹음/)).toBeNull();
  });

  it("renders the mobile eaten-list summary and eaten date", async () => {
    installMatchMedia(true);
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: EATEN_ITEMS,
    });

    render(<AteListScreen initialAuthenticated={true} />);

    expect(await screen.findByText("다먹은 요리 1개")).toBeTruthy();
    expect(screen.getByText(EATEN_DESCRIPTION)).toBeTruthy();
    expect(screen.getByText(/4\/22 다먹음/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "김치찌개" }).getAttribute("href")).toBe(
      "/recipe/recipe-1",
    );
  });

  it("keeps long mobile eaten recipe titles from resizing the card", async () => {
    installMatchMedia(true);
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: [
        {
          ...EATEN_ITEMS[0],
          recipe_title:
            "아주 긴 레시피 이름이 들어가도 카드 높이를 과하게 늘리지 않는 김치찌개",
        },
      ],
    });

    render(<AteListScreen initialAuthenticated={true} />);

    const titleLink = await screen.findByRole("link", {
      name: "아주 긴 레시피 이름이 들어가도 카드 높이를 과하게 늘리지 않는 김치찌개",
    });
    expect(titleLink.className).toContain("truncate");
  });

  it("formats eaten timestamps with the Korea calendar day", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: [
        {
          ...EATEN_ITEMS[0],
          eaten_at: "2026-04-22T16:30:00.000Z",
        },
      ],
    });

    render(<AteListScreen initialAuthenticated={true} />);

    expect(await screen.findByText("김치찌개")).toBeTruthy();
    expect(screen.getByText(/4월 23일/)).toBeTruthy();
  });

  it("renders empty state when no eaten items", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: [],
    });

    render(<AteListScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("아직 다먹은 요리가 없어요")).toBeTruthy();
    });

    expect(
      screen.getByText(
        "요리를 완료하거나 남은 요리에서 '다 먹었어요'를 누르면 여기에 기록됩니다.",
      ),
    ).toBeTruthy();
  });

  it("renders error state on fetch failure", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockRejectedValue(
      new Error("서버 오류"),
    );

    render(<AteListScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(
        screen.getByText("다먹은 요리를 불러오지 못했어요"),
      ).toBeTruthy();
    });
  });

  it("retries ate-list loading on error action", async () => {
    const fetchSpy = vi
      .spyOn(leftoversApi, "fetchLeftovers")
      .mockRejectedValueOnce(new Error("서버 오류"))
      .mockResolvedValueOnce({ items: EATEN_ITEMS });

    render(<AteListScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(
        screen.getByText("다먹은 요리를 불러오지 못했어요"),
      ).toBeTruthy();
    });

    const user = userEvent.setup();
    await user.click(screen.getByText("다시 시도"));

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("removes item from list after uneat action", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: EATEN_ITEMS,
    });
    vi.spyOn(leftoversApi, "uneatLeftover").mockResolvedValue({
      id: "ld-3",
      status: "leftover",
      eaten_at: null,
      auto_hide_at: null,
    });

    render(<AteListScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("uneat-button"));

    await waitFor(() => {
      expect(screen.getByText("남은 요리로 복귀됐어요")).toBeTruthy();
    });
  });

  it("shows error feedback when uneat fails", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: EATEN_ITEMS,
    });
    vi.spyOn(leftoversApi, "uneatLeftover").mockRejectedValue(
      new Error("남은 요리 복귀에 실패했어요."),
    );

    render(<AteListScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("uneat-button"));

    await waitFor(() => {
      expect(
        screen.getByText("남은 요리 복귀에 실패했어요."),
      ).toBeTruthy();
    });

    // Item should still be in the list
    expect(screen.getAllByTestId("ate-list-card")).toHaveLength(1);
  });

  it("transitions to empty state after uneating last item", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: [EATEN_ITEMS[0]],
    });
    vi.spyOn(leftoversApi, "uneatLeftover").mockResolvedValue({
      id: "ld-3",
      status: "leftover",
      eaten_at: null,
      auto_hide_at: null,
    });

    render(<AteListScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("uneat-button"));

    await waitFor(() => {
      expect(screen.getByText("아직 다먹은 요리가 없어요")).toBeTruthy();
    });
  });

  it("has link to leftovers page", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: EATEN_ITEMS,
    });

    render(<AteListScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    const leftoversLink = screen.getByRole("link", { name: "남은 요리" });
    expect(leftoversLink.getAttribute("href")).toBe("/leftovers");
  });
});
