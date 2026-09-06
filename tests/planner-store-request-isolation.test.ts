import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchPlanner } from "@/lib/api/planner";
import { resetPlannerStore, usePlannerStore } from "@/stores/planner-store";
import type { PlannerData } from "@/types/planner";

vi.mock("@/lib/api/planner", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api/planner")>(),
  fetchPlanner: vi.fn(),
}));

const firstRange = { startDate: "2026-09-07", endDate: "2026-09-13" };
const secondRange = { startDate: "2026-09-14", endDate: "2026-09-20" };

function deferredPlanner() {
  let resolve!: (data: PlannerData) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<PlannerData>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function plannerData(id: string, date: string): PlannerData {
  return {
    columns: [{ id: "column-dinner", name: "저녁", sort_order: 0 }],
    meals: [{
      id,
      column_id: "column-dinner",
      is_leftover: false,
      plan_date: date,
      planned_servings: 1,
      recipe_id: `recipe-${id}`,
      recipe_thumbnail_url: null,
      recipe_title: `비공개 요리 ${id}`,
      status: "registered",
    }],
    product_entries: [],
  };
}

function apiError(status: number) {
  return Object.assign(new Error("플래너 요청 실패"), {
    status,
    code: status === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR",
    fields: [],
  });
}

describe("planner store request isolation", () => {
  beforeEach(() => {
    resetPlannerStore();
    vi.mocked(fetchPlanner).mockReset();
  });

  it("does not restore private meals when a request resolves after resetting the store", async () => {
    const pending = deferredPlanner();
    vi.mocked(fetchPlanner).mockReturnValueOnce(pending.promise);
    const load = usePlannerStore.getState().loadPlanner(firstRange);
    resetPlannerStore();
    const clearedState = usePlannerStore.getState();

    pending.resolve(plannerData("old-private", firstRange.startDate));
    await load;

    expect(usePlannerStore.getState()).toEqual(clearedState);
    expect(usePlannerStore.getState().meals).toEqual([]);
    expect(usePlannerStore.getState().columns).toEqual([]);
    expect(usePlannerStore.getState().productEntries).toEqual([]);
  });

  it("keeps the latest requested week when older responses arrive last", async () => {
    const first = deferredPlanner();
    const second = deferredPlanner();
    vi.mocked(fetchPlanner).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const firstLoad = usePlannerStore.getState().loadPlanner(firstRange);
    const secondLoad = usePlannerStore.getState().loadPlanner(secondRange);
    const latestData = plannerData("latest", secondRange.startDate);
    second.resolve(latestData);
    await secondLoad;
    first.resolve(plannerData("stale", firstRange.startDate));
    await firstLoad;

    expect(usePlannerStore.getState()).toMatchObject({
      rangeStartDate: secondRange.startDate,
      rangeEndDate: secondRange.endDate,
      meals: latestData.meals,
      screenState: "ready",
      isRefreshing: false,
      errorMessage: null,
    });
  });

  it.each([401, 500])("ignores a stale %i error after reset without reopening the old login gate", async (status) => {
    const pending = deferredPlanner();
    vi.mocked(fetchPlanner).mockReturnValueOnce(pending.promise);
    const load = usePlannerStore.getState().loadPlanner(firstRange);
    resetPlannerStore();
    const clearedState = usePlannerStore.getState();

    pending.reject(apiError(status));

    await expect(load).resolves.toBeUndefined();
    expect(usePlannerStore.getState()).toEqual(clearedState);
  });

  it("does not let a superseded unauthorized response interrupt a newer loading request", async () => {
    const first = deferredPlanner();
    const second = deferredPlanner();
    const visibleData = plannerData("visible", firstRange.startDate);
    usePlannerStore.setState({ columns: visibleData.columns, meals: visibleData.meals, screenState: "ready" });
    vi.mocked(fetchPlanner).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const firstLoad = usePlannerStore.getState().loadPlanner(firstRange);
    const secondLoad = usePlannerStore.getState().loadPlanner(secondRange);
    first.reject(apiError(401));

    await expect(firstLoad).resolves.toBeUndefined();
    expect(usePlannerStore.getState().isRefreshing).toBe(true);
    second.resolve(plannerData("latest", secondRange.startDate));
    await secondLoad;
    expect(usePlannerStore.getState().meals[0]?.id).toBe("latest");
  });

  it("continues to reject the latest unauthorized request so the current login gate can handle it", async () => {
    const error = apiError(401);
    vi.mocked(fetchPlanner).mockRejectedValueOnce(error);

    await expect(usePlannerStore.getState().loadPlanner(firstRange)).rejects.toBe(error);
    expect(usePlannerStore.getState().isRefreshing).toBe(false);
  });

  it("continues to display the latest non-authentication error", async () => {
    const error = apiError(500);
    vi.mocked(fetchPlanner).mockRejectedValueOnce(error);

    await usePlannerStore.getState().loadPlanner(firstRange);

    expect(usePlannerStore.getState()).toMatchObject({
      screenState: "error",
      errorMessage: error.message,
      isRefreshing: false,
    });
  });
});
