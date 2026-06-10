import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  dismissUserGamificationTutorialQuest,
  fetchUserGamification,
  markUserGamificationNotificationsSeen,
} from "@/lib/api/user-gamification";

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  withE2EAuthOverrideHeaders: (init?: RequestInit) => init ?? {},
}));

const fetchMock = vi.fn();

const MOCK_GAMIFICATION = {
  level: {
    current_level: 6,
    total_xp: 830,
    xp_to_next_level: 170,
    progress_percent: 82,
  },
  featured_badges: [],
  badges: { earned: [], locked: [] },
  quests: { active: [], completed_recent: [] },
  tutorial: { active_steps: [] },
  notifications: { unseen: [] },
  last_updated_at: "2026-06-10T12:00:00.000Z",
};

describe("user gamification API client", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the dedicated gamification endpoint without changing progress", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => ({
        success: true,
        data: MOCK_GAMIFICATION,
        error: null,
      })),
    });

    await expect(fetchUserGamification()).resolves.toEqual(MOCK_GAMIFICATION);
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/users/me/gamification", {});
  });

  it("marks notification ids as seen through the documented envelope", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => ({
        success: true,
        data: { seen_notification_ids: ["550e8400-e29b-41d4-a716-446655440001"] },
        error: null,
      })),
    });

    await expect(
      markUserGamificationNotificationsSeen([
        "550e8400-e29b-41d4-a716-446655440001",
      ]),
    ).resolves.toEqual({
      seen_notification_ids: ["550e8400-e29b-41d4-a716-446655440001"],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/users/me/gamification/notifications/seen",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          notification_ids: ["550e8400-e29b-41d4-a716-446655440001"],
        }),
      },
    );
  });

  it("dismisses tutorial quests by key", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn(async () => ({
        success: true,
        data: { quest_key: "first_shopping_done", status: "dismissed" },
        error: null,
      })),
    });

    await expect(
      dismissUserGamificationTutorialQuest("first_shopping_done"),
    ).resolves.toEqual({
      quest_key: "first_shopping_done",
      status: "dismissed",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/users/me/gamification/tutorial-quests/first_shopping_done/dismiss",
      { method: "POST" },
    );
  });
});
