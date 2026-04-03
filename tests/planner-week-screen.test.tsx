// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlannerWeekScreen } from "@/components/planner/planner-week-screen";
import { resetPlannerStore } from "@/stores/planner-store";

const readE2EAuthOverride = vi.fn();
const fetchPlanner = vi.fn();
const createPlannerColumn = vi.fn();
const updatePlannerColumn = vi.fn();
const deletePlannerColumn = vi.fn();

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  readE2EAuthOverride: () => readE2EAuthOverride(),
}));

vi.mock("@/lib/api/planner", () => ({
  createDefaultPlannerRange: () => ({
    startDate: "2026-03-24",
    endDate: "2026-04-07",
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
  createPlannerColumn: (...args: unknown[]) => createPlannerColumn(...args),
  updatePlannerColumn: (...args: unknown[]) => updatePlannerColumn(...args),
  deletePlannerColumn: (...args: unknown[]) => deletePlannerColumn(...args),
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
      { id: "column-dinner", name: "저녁", sort_order: 2 },
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

describe("planner week screen", () => {
  beforeEach(() => {
    readE2EAuthOverride.mockReset();
    fetchPlanner.mockReset();
    createPlannerColumn.mockReset();
    updatePlannerColumn.mockReset();
    deletePlannerColumn.mockReset();
    resetPlannerStore();
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

  it("loads planner data and renders meals with status badges", async () => {
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

    expect(await screen.findByText("김치찌개")).toBeTruthy();
    expect(screen.getByText("식사 등록 완료")).toBeTruthy();
    expect(
      (screen.getByRole("button", { name: "장보기" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("shows loading placeholders while planner data is pending", async () => {
    const deferred = createDeferred<ReturnType<typeof createPlannerData>>();

    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner.mockImplementation(() => deferred.promise);

    const { container } = render(<PlannerWeekScreen />);

    await waitFor(() => {
      expect(container.querySelectorAll(".animate-pulse")).toHaveLength(6);
    });

    deferred.resolve(createPlannerData({ meals: [] }));

    expect(
      await screen.findByText("아직 등록된 식사가 없어요. 끼니 컬럼을 정리하고 다음 슬라이스에서 식사를 추가할 수 있어요."),
    ).toBeTruthy();
  });

  it("shows empty state while keeping column management visible", async () => {
    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner.mockResolvedValue(createPlannerData({ meals: [] }));

    render(<PlannerWeekScreen />);

    expect(
      await screen.findByText("아직 등록된 식사가 없어요. 끼니 컬럼을 정리하고 다음 슬라이스에서 식사를 추가할 수 있어요."),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "컬럼 추가" })).toBeTruthy();
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

    expect(
      await screen.findByText("아직 등록된 식사가 없어요. 끼니 컬럼을 정리하고 다음 슬라이스에서 식사를 추가할 수 있어요."),
    ).toBeTruthy();
    expect(fetchPlanner).toHaveBeenCalledTimes(2);
  });

  it("adds a column and refreshes planner data", async () => {
    const user = userEvent.setup();

    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner
      .mockResolvedValueOnce(createPlannerData({ meals: [] }))
      .mockResolvedValueOnce({
        columns: [
          { id: "column-breakfast", name: "아침", sort_order: 0 },
          { id: "column-lunch", name: "점심", sort_order: 1 },
          { id: "column-dinner", name: "저녁", sort_order: 2 },
          { id: "column-snack", name: "간식", sort_order: 3 },
        ],
        meals: [],
      });
    createPlannerColumn.mockResolvedValue({
      id: "column-snack",
      name: "간식",
      sort_order: 3,
    });

    render(<PlannerWeekScreen />);

    const input = await screen.findByPlaceholderText("새 끼니 컬럼 이름");
    await user.type(input, "간식");
    await user.click(screen.getByRole("button", { name: "컬럼 추가" }));

    await waitFor(() => {
      expect(createPlannerColumn).toHaveBeenCalledWith({ name: "간식" });
    });
    expect(await screen.findByDisplayValue("간식")).toBeTruthy();
  });

  it("shows conflict feedback when deleting a non-empty column", async () => {
    const user = userEvent.setup();

    readE2EAuthOverride.mockReturnValue(true);
    fetchPlanner.mockResolvedValue(createPlannerData({ meals: [] }));
    deletePlannerColumn.mockRejectedValue(new Error("식사가 등록된 컬럼은 삭제할 수 없어요."));

    render(<PlannerWeekScreen />);

    const deleteButtons = await screen.findAllByRole("button", { name: "삭제" });
    await user.click(deleteButtons[0]!);

    expect(await screen.findByText("식사가 등록된 컬럼은 삭제할 수 없어요.")).toBeTruthy();
  });
});
