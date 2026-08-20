// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  completeCookingSession as completeLegacyPlanner,
  completeStandaloneCooking as completeLegacyStandalone,
} from "@/lib/api/cooking";
import { getCookingSessionCookModeHref } from "@/lib/cooking/session-version-dispatch";

const KEY = "550e8400-e29b-41d4-a716-446655440013";

function successResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn(async () => ({ success: true, data, error: null })),
  };
}

describe("legacy product compatibility clients", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends an optional stable key while decoding the unchanged planner v1 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse({
      session_id: "session-1",
      status: "completed",
      meals_updated: 1,
      leftover_dish_id: "leftover-1",
      pantry_removed: 2,
      cook_count: 3,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await completeLegacyPlanner(
      "session-1",
      { consumed_ingredient_ids: ["ingredient-1"] },
      KEY,
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(KEY);
    expect(result).toEqual({
      session_id: "session-1",
      status: "completed",
      meals_updated: 1,
      leftover_dish_id: "leftover-1",
      pantry_removed: 2,
      cook_count: 3,
    });
    expect(result).not.toHaveProperty("contract_version");
  });

  it("sends an optional stable key while decoding the unchanged standalone v1 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(successResponse({
      leftover_dish_id: "leftover-2",
      pantry_removed: 1,
      cook_count: 4,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await completeLegacyStandalone(
      {
        recipe_id: "recipe-1",
        cooking_servings: 2,
        consumed_ingredient_ids: ["ingredient-1"],
      },
      KEY,
    );

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(KEY);
    expect(result).toEqual({
      leftover_dish_id: "leftover-2",
      pantry_removed: 1,
      cook_count: 4,
    });
    expect(result).not.toHaveProperty("contract_version");
  });

  it.each(["current", "immediate-previous"])(
    "%s client dispatches only from the stored contract version",
    () => {
      expect(getCookingSessionCookModeHref({
        session_id: "legacy-session",
        contract_version: "legacy_v1",
      })).toBe("/cooking/sessions/legacy-session/cook-mode");
      expect(getCookingSessionCookModeHref({
        session_id: "seeded-v2-session",
        contract_version: "snapshot_v2",
      })).toBe("/cooking/session-attempts/seeded-v2-session/cook-mode");
      expect(() => getCookingSessionCookModeHref({
        session_id: "body-shaped-session",
      } as never)).toThrow(/contract_version/);
    },
  );

  it("preserves the separately activated missing-key 428 error wrapper", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 428,
      json: vi.fn(async () => ({
        success: false,
        data: null,
        error: {
          code: "IDEMPOTENCY_KEY_REQUIRED",
          message: "멱등성 키가 필요해요.",
          fields: [{ field: "Idempotency-Key", reason: "required" }],
        },
      })),
    }));

    await expect(completeLegacyPlanner(
      "session-1",
      { consumed_ingredient_ids: [] },
      KEY,
    )).rejects.toMatchObject({
      status: 428,
      code: "IDEMPOTENCY_KEY_REQUIRED",
      fields: [{ field: "Idempotency-Key", reason: "required" }],
    });
  });

});
