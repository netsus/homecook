// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addPantryItems } from "@/lib/api/pantry";
import { createShoppingList } from "@/lib/api/shopping";
import { eatLeftover } from "@/lib/api/leftovers";
import { HOMECOOK_GAMIFICATION_REFRESH_EVENT } from "@/lib/gamification-events";

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  withE2EAuthOverrideHeaders: (init?: RequestInit) => init ?? {},
}));

const fetchMock = vi.fn();

describe("growth source API clients", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("dispatches a gamification refresh immediately after shopping list creation", async () => {
    const listener = vi.fn();
    window.addEventListener(HOMECOOK_GAMIFICATION_REFRESH_EVENT, listener);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn(async () => ({
        success: true,
        data: {
          id: "shopping-list-1",
          title: "2026-06-14 장보기",
          items_count: 3,
        },
        error: null,
      })),
    });

    await expect(createShoppingList({
      meal_configs: [{ meal_id: "meal-1", shopping_servings: 2 }],
    })).resolves.toMatchObject({ id: "shopping-list-1" });

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(HOMECOOK_GAMIFICATION_REFRESH_EVENT, listener);
  });

  it("does not dispatch a gamification refresh when shopping list creation fails", async () => {
    const listener = vi.fn();
    window.addEventListener(HOMECOOK_GAMIFICATION_REFRESH_EVENT, listener);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: vi.fn(async () => ({
        success: false,
        data: null,
        error: { code: "CONFLICT", message: "이미 장보기 목록이 있어요.", fields: [] },
      })),
    });

    await expect(createShoppingList({
      meal_configs: [{ meal_id: "meal-1", shopping_servings: 2 }],
    })).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(HOMECOOK_GAMIFICATION_REFRESH_EVENT, listener);
  });

  it("dispatches immediate and delayed gamification refreshes after pantry ingredients are added", async () => {
    vi.useFakeTimers();
    const listener = vi.fn();
    window.addEventListener(HOMECOOK_GAMIFICATION_REFRESH_EVENT, listener);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn(async () => ({
        success: true,
        data: {
          added: 10,
          items: [],
        },
        error: null,
      })),
    });

    await expect(addPantryItems(["ing-1", "ing-2"])).resolves.toMatchObject({
      added: 10,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(listener).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3_500);
    expect(listener).toHaveBeenCalledTimes(3);
    window.removeEventListener(HOMECOOK_GAMIFICATION_REFRESH_EVENT, listener);
  });

  it("dispatches a gamification refresh immediately after a leftover is marked eaten", async () => {
    const listener = vi.fn();
    window.addEventListener(HOMECOOK_GAMIFICATION_REFRESH_EVENT, listener);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => ({
        success: true,
        data: {
          id: "leftover-1",
          status: "eaten",
          eaten_at: "2026-06-15T10:00:00.000Z",
          auto_hide_at: "2026-07-15T10:00:00.000Z",
        },
        error: null,
      })),
    });

    await expect(eatLeftover("leftover-1")).resolves.toMatchObject({
      id: "leftover-1",
      status: "eaten",
    });

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(HOMECOOK_GAMIFICATION_REFRESH_EVENT, listener);
  });

  it("does not dispatch a gamification refresh when marking a leftover eaten fails", async () => {
    const listener = vi.fn();
    window.addEventListener(HOMECOOK_GAMIFICATION_REFRESH_EVENT, listener);
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: vi.fn(async () => ({
        success: false,
        data: null,
        error: { code: "RESOURCE_NOT_FOUND", message: "남은 요리를 찾을 수 없어요.", fields: [] },
      })),
    });

    await expect(eatLeftover("missing-leftover")).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      status: 404,
    });
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener(HOMECOOK_GAMIFICATION_REFRESH_EVENT, listener);
  });
});
