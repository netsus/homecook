// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LeftoversScreen } from "@/components/leftovers/leftovers-screen";
import { AteListScreen } from "@/components/leftovers/ate-list-screen";
import * as leftoversApi from "@/lib/api/leftovers";
import * as cookingApi from "@/lib/api/cooking";
import * as mealApi from "@/lib/api/meal";
import * as mealLogApi from "@/lib/api/meal-log";
import type { LeftoverListItemData } from "@/types/leftover";

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
  usePathname: () => "/leftovers",
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
    stale_reviewed_at: null,
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
    stale_reviewed_at: null,
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
    stale_reviewed_at: null,
    cooking_servings: 2,
    source_meal_label: "저녁",
    source_planned_servings: 2,
  },
];


describe("LeftoversScreen", () => {
  beforeEach(() => {
    installMatchMedia(false);
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams());
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    vi.spyOn(cookingApi, "fetchCookedBatches").mockResolvedValue({ items: [], next_cursor: null, has_next: false });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); Reflect.deleteProperty(window, "matchMedia"); });
  it("shows a login action without reading personal food", async () => {
    render(<LeftoversScreen />);
    expect(await screen.findByRole("link", { name: "로그인" })).toBeTruthy();
    expect(cookingApi.fetchCookedBatches).not.toHaveBeenCalled();
  });
  it("uses a single loading region and a single empty list", async () => {
    render(<LeftoversScreen initialAuthenticated />);
    expect(screen.getByRole("status", { name: "남은 요리 불러오는 중" })).toBeTruthy();
    expect(await screen.findByText("남은 요리가 없어요.")).toBeTruthy();
    expect(screen.queryByText("중량·잔량 기록")).toBeNull();
    expect(screen.queryByText("남은요리 관리")).toBeNull();
  });
  it("retries a failed list without also requesting the legacy list", async () => {
    const legacy = vi.spyOn(leftoversApi, "fetchLeftovers");
    vi.mocked(cookingApi.fetchCookedBatches).mockRejectedValueOnce(new Error("목록 오류"));
    render(<LeftoversScreen initialAuthenticated />);
    await userEvent.click(await screen.findByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("남은 요리가 없어요.")).toBeTruthy();
    expect(legacy).not.toHaveBeenCalled();
  });
  it("adds the chosen cooked batch to meal logging instead of creating another plan", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({ items: LEFTOVER_ITEMS });
    vi.spyOn(mealLogApi, "fetchMealLogDay").mockResolvedValue({ active_columns: [
      { id: "col-1", name: "아침", sort_order: 0 },
    ] } as never);
    vi.spyOn(mealLogApi, "fetchMealLogRecent").mockResolvedValue({ items: [], has_next: false, next_cursor: null });
    vi.mocked(cookingApi.fetchCookedBatches).mockResolvedValue({ items: [{
      id: "ld-1", recipe_id: "recipe-1", recipe_title: "김치찌개", recipe_thumbnail_url: null,
      status: "leftover", cooked_at: "2026-04-20", cooking_servings: 2,
      finished_weight_g: 500, remaining_weight_g: 500, weight_status: "known", batch_status: "available", depleted_reason: null,
      revision: 1, nutrition_calculation_status: "complete", current_unweighed_closure_event_id: null,
    }], next_cursor: null, has_next: false });
    const createLog = vi.spyOn(mealLogApi, "createMealLogEntry").mockResolvedValue({} as never);
    const createPlan = vi.spyOn(mealApi, "createMeal");
    render(<LeftoversScreen initialAuthenticated />);
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole("button", { name: "김치찌개 식사 기록" }))[0]);
    const dialog = await screen.findByRole("dialog", { name: "먹은 음식 추가" });
    const amount = await within(dialog).findByRole("textbox", { name: "먹은 양" });
    await user.clear(amount);
    await user.type(amount, "120");
    await user.click(within(dialog).getByRole("button", { name: "기록 저장" }));
    await waitFor(() => expect(createLog).toHaveBeenCalledWith(expect.objectContaining({
      source: { type: "cooked_batch", id: "ld-1" }, quantity: { amount: 120, unit: "g" }, mealPlanColumnId: "col-1",
    }), expect.any(String)));
    expect(createPlan).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "먹은 음식 추가" })).toBeNull());
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
      screen.queryByRole("link", { name: "김치찌개 레시피 보기" }),
    ).toBeNull();
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
    expect(screen.getByText("4/18 · 저녁 · 2인분 · 4/22 다먹음")).toBeTruthy();
    expect(screen.queryByText(/4\/18 요리/)).toBeNull();
    expect(screen.queryByText(/^4\/22 다먹음$/)).toBeNull();
    expect(screen.getByRole("link", { name: "김치찌개" }).getAttribute("href")).toBe(
      "/recipe/recipe-1",
    );
  });

  it("styles the mobile restore button like the web action button", async () => {
    installMatchMedia(true);
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: EATEN_ITEMS,
    });

    render(<AteListScreen initialAuthenticated={true} />);

    const restoreButton = await screen.findByTestId("uneat-button");
    expect(restoreButton.textContent?.trim()).toBe("남은 요리로");
    expect(restoreButton.className).toContain("px-4");
    expect(restoreButton.className).toContain("border-[var(--brand)]");
    expect(restoreButton.className).toContain("bg-[var(--surface)]");
    expect(restoreButton.className).toContain("text-[var(--brand)]");
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
        "완료한 요리가 여기에 모여요.",
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
    const fetchSpy = vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
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

    expect(screen.queryByText("김치찌개")).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("uses brand-colored mobile feedback after restoring an eaten item", async () => {
    installMatchMedia(true);
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

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("uneat-button"));

    const toast = await screen.findByTestId("feedback-toast");
    expect(toast.className).toContain("growth-toast-card-xp");
    expect(toast.className).toContain("border-[var(--growth-toast-xp-border)]");
    expect(toast.className).not.toContain("success");
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
