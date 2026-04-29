// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LeftoversScreen } from "@/components/leftovers/leftovers-screen";
import { AteListScreen } from "@/components/leftovers/ate-list-screen";
import * as leftoversApi from "@/lib/api/leftovers";
import * as mealApi from "@/lib/api/meal";
import * as plannerApi from "@/lib/api/planner";
import type { LeftoverListItemData } from "@/types/leftover";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  })),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) =>
    React.createElement("a", { href, ...props }, children),
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

const LEFTOVER_ITEMS: LeftoverListItemData[] = [
  {
    id: "ld-1",
    recipe_id: "recipe-1",
    recipe_title: "김치찌개",
    recipe_thumbnail_url: null,
    status: "leftover",
    cooked_at: "2026-04-20",
    eaten_at: null,
  },
  {
    id: "ld-2",
    recipe_id: "recipe-2",
    recipe_title: "된장찌개",
    recipe_thumbnail_url: "https://img.example.com/doenjang.jpg",
    status: "leftover",
    cooked_at: "2026-04-19",
    eaten_at: null,
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
  },
];

describe("LeftoversScreen", () => {
  beforeEach(() => {
    vi.spyOn(leftoversApi, "isLeftoverApiError").mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
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

  it("renders leftover list after loading", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: LEFTOVER_ITEMS,
    });

    render(<LeftoversScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    expect(screen.getByText("된장찌개")).toBeTruthy();
    expect(screen.getAllByTestId("leftover-card")).toHaveLength(2);
    expect(screen.getAllByTestId("eat-button")).toHaveLength(2);
    expect(screen.getAllByTestId("planner-add-button")).toHaveLength(2);
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
        screen.getByText("남은요리를 불러오지 못했어요"),
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
      (btn) => btn.textContent === "플래너에 추가",
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

  it("has link to ate-list page", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: LEFTOVER_ITEMS,
    });

    render(<LeftoversScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    const ateListLink = screen.getByText("다먹은 목록");
    expect(ateListLink.closest("a")?.getAttribute("href")).toBe(
      "/leftovers/ate",
    );
  });

  it("retries loading on error action", async () => {
    const fetchSpy = vi
      .spyOn(leftoversApi, "fetchLeftovers")
      .mockRejectedValueOnce(new Error("서버 오류"))
      .mockResolvedValueOnce({ items: LEFTOVER_ITEMS });

    render(<LeftoversScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(
        screen.getByText("남은요리를 불러오지 못했어요"),
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
    vi.spyOn(leftoversApi, "isLeftoverApiError").mockReturnValue(false);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
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

  it("renders eaten items after loading", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: EATEN_ITEMS,
    });

    render(<AteListScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    expect(screen.getAllByTestId("ate-list-card")).toHaveLength(1);
    expect(screen.getByTestId("uneat-button")).toBeTruthy();
  });

  it("renders empty state when no eaten items", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: [],
    });

    render(<AteListScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("다먹은 기록이 없어요")).toBeTruthy();
    });

    expect(
      screen.getByText(
        "남은요리에서 다먹음 처리하면 여기에 기록돼요",
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
        screen.getByText("다먹은 목록을 불러오지 못했어요"),
      ).toBeTruthy();
    });
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
      expect(screen.getByText("남은요리로 복귀됐어요")).toBeTruthy();
    });
  });

  it("shows error feedback when uneat fails", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: EATEN_ITEMS,
    });
    vi.spyOn(leftoversApi, "uneatLeftover").mockRejectedValue(
      new Error("덜먹음 처리에 실패했어요."),
    );

    render(<AteListScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    const user = userEvent.setup();
    await user.click(screen.getByTestId("uneat-button"));

    await waitFor(() => {
      expect(
        screen.getByText("덜먹음 처리에 실패했어요."),
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
      expect(screen.getByText("다먹은 기록이 없어요")).toBeTruthy();
    });
  });

  it("has back link to leftovers page", async () => {
    vi.spyOn(leftoversApi, "fetchLeftovers").mockResolvedValue({
      items: EATEN_ITEMS,
    });

    render(<AteListScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("김치찌개")).toBeTruthy();
    });

    const backLink = screen.getByLabelText("뒤로가기");
    expect(backLink.getAttribute("href")).toBe("/leftovers");
  });
});
