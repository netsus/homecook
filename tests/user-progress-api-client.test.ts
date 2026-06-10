import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchUserProgress } from "@/lib/api/user-progress";

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  withE2EAuthOverrideHeaders: (init?: RequestInit) => init ?? {},
}));

const fetchMock = vi.fn();

const MOCK_PROGRESS = {
  level: {
    current_level: 6,
    total_xp: 520,
    current_level_start_xp: 500,
    next_level_start_xp: 650,
    xp_into_current_level: 20,
    xp_to_next_level: 130,
    progress_ratio: 0.1333,
    progress_percent: 13,
  },
  event_counts: {
    cooking_completed: 3,
    shopping_completed: 2,
    recipe_saved_distinct_ever: 7,
    custom_book_created: 1,
  },
  last_updated_at: "2026-06-10T00:00:00.000Z",
};

describe("fetchUserProgress", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the server progress envelope from the dedicated endpoint", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => ({
        success: true,
        data: MOCK_PROGRESS,
        error: null,
      })),
    });

    await expect(fetchUserProgress()).resolves.toEqual(MOCK_PROGRESS);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/users/me/progress", {});
  });

  it("throws the API envelope error without falling back to /users/me", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn(async () => ({
        success: false,
        data: null,
        error: {
          code: "INTERNAL_ERROR",
          message: "진도 정보를 불러오지 못했어요.",
          fields: [],
        },
      })),
    });

    await expect(fetchUserProgress()).rejects.toMatchObject({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "진도 정보를 불러오지 못했어요.",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/users/me/progress", {});
  });

  it("throws INVALID_RESPONSE when the progress payload is not JSON", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => {
        throw new Error("invalid json");
      }),
    });

    await expect(fetchUserProgress()).rejects.toMatchObject({
      status: 200,
      code: "INVALID_RESPONSE",
      message: "서버 응답을 해석하지 못했어요.",
    });
  });
});
