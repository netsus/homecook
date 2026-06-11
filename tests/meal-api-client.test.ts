// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMeal } from "@/lib/api/meal";
import { HOMECOOK_GAMIFICATION_REFRESH_EVENT } from "@/lib/gamification-events";

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  withE2EAuthOverrideHeaders: (init?: RequestInit) => init ?? {},
}));

const fetchMock = vi.fn();

const createBody = {
  recipe_id: "recipe-1",
  plan_date: "2026-06-11",
  column_id: "column-dinner",
  planned_servings: 2,
};

const createData = {
  id: "meal-1",
  recipe_id: "recipe-1",
  plan_date: "2026-06-11",
  column_id: "column-dinner",
  planned_servings: 2,
  status: "registered",
  is_leftover: false,
  leftover_dish_id: null,
};

describe("meal API client", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("dispatches a gamification refresh after successful planner registration", async () => {
    const listener = vi.fn();
    window.addEventListener(HOMECOOK_GAMIFICATION_REFRESH_EVENT, listener);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn(async () => ({
        success: true,
        data: createData,
        error: null,
      })),
    });

    await expect(createMeal(createBody)).resolves.toEqual(createData);

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/meals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(createBody),
    });
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(HOMECOOK_GAMIFICATION_REFRESH_EVENT, listener);
  });

  it("does not dispatch a gamification refresh when planner registration fails", async () => {
    const listener = vi.fn();
    window.addEventListener(HOMECOOK_GAMIFICATION_REFRESH_EVENT, listener);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: vi.fn(async () => ({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_ERROR",
          message: "식사 등록 값을 확인해 주세요.",
          fields: [],
        },
      })),
    });

    await expect(createMeal(createBody)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 422,
    });
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(HOMECOOK_GAMIFICATION_REFRESH_EVENT, listener);
  });
});
