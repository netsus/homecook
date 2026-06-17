import { afterEach, describe, expect, it, vi } from "vitest";

import {
  markUserGamificationNotificationsSeen,
  type UserGamificationDbClient,
} from "@/lib/server/user-gamification";
import type { UserGamificationNotificationType } from "@/types/user-gamification";

interface UpdateCall {
  columns: string;
  filters: Array<{
    column: string;
    type: "eq" | "in";
    value: string | string[];
  }>;
  table: string;
  values: Record<string, string>;
}

interface SeenNotificationRow {
  id: string;
  notification_type: UserGamificationNotificationType;
  payload_json: Record<string, unknown>;
}

function createUpdateQuery<T>(
  table: string,
  values: Record<string, string>,
  data: T[],
  updateCalls: UpdateCall[],
) {
  const filters: UpdateCall["filters"] = [];
  const query = {
    eq: vi.fn((column: string, value: string) => {
      filters.push({ column, type: "eq", value });
      return query;
    }),
    in: vi.fn((column: string, value: string[]) => {
      filters.push({ column, type: "in", value });
      return query;
    }),
    select: vi.fn((columns: string) => {
      updateCalls.push({ columns, filters: [...filters], table, values });
      return Promise.resolve({ data, error: null });
    }),
  };

  return query;
}

function createSeenDb(rows: SeenNotificationRow[]) {
  const updateCalls: UpdateCall[] = [];
  const from = vi.fn((table: string) => {
    if (table === "user_progress_notifications") {
      return {
        update: vi.fn((values: Record<string, string>) =>
          createUpdateQuery(table, values, rows, updateCalls),
        ),
      };
    }

    if (table === "user_achievement_awards") {
      return {
        update: vi.fn((values: Record<string, string>) =>
          createUpdateQuery(
            table,
            values,
            [{ achievement_key: "shopping_completed_1" }],
            updateCalls,
          ),
        ),
      };
    }

    if (table === "user_badge_awards") {
      return {
        update: vi.fn((values: Record<string, string>) =>
          createUpdateQuery(
            table,
            values,
            [{ badge_key: "first_shopping_done" }],
            updateCalls,
          ),
        ),
      };
    }

    throw new Error(`unexpected table: ${table}`);
  });

  return {
    dbClient: { from } as unknown as UserGamificationDbClient,
    updateCalls,
  };
}

describe("markUserGamificationNotificationsSeen", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks linked achievement and badge awards as seen when notification rows are confirmed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-17T00:00:00.000Z"));

    const { dbClient, updateCalls } = createSeenDb([
      {
        id: "550e8400-e29b-41d4-a716-446655440001",
        notification_type: "achievement_unlocked",
        payload_json: {
          achievement_key: "shopping_completed_1",
          badge_key: "first_shopping_done",
        },
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440002",
        notification_type: "badge_unlocked",
        payload_json: {
          badge_key: "shopping_rhythm",
        },
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440003",
        notification_type: "xp_awarded",
        payload_json: { xp_delta: 30 },
      },
    ]);

    const result = await markUserGamificationNotificationsSeen(dbClient, "user-1", [
      "550e8400-e29b-41d4-a716-446655440001",
      "550e8400-e29b-41d4-a716-446655440002",
      "550e8400-e29b-41d4-a716-446655440003",
    ]);

    expect(result).toEqual({
      data: {
        seen_notification_ids: [
          "550e8400-e29b-41d4-a716-446655440001",
          "550e8400-e29b-41d4-a716-446655440002",
          "550e8400-e29b-41d4-a716-446655440003",
        ],
      },
      error: null,
    });
    expect(updateCalls).toEqual([
      {
        columns: "id, notification_type, payload_json",
        filters: [
          { column: "user_id", type: "eq", value: "user-1" },
          {
            column: "id",
            type: "in",
            value: [
              "550e8400-e29b-41d4-a716-446655440001",
              "550e8400-e29b-41d4-a716-446655440002",
              "550e8400-e29b-41d4-a716-446655440003",
            ],
          },
        ],
        table: "user_progress_notifications",
        values: { seen_at: "2026-06-17T00:00:00.000Z" },
      },
      {
        columns: "achievement_key",
        filters: [
          { column: "user_id", type: "eq", value: "user-1" },
          {
            column: "achievement_key",
            type: "in",
            value: ["shopping_completed_1"],
          },
        ],
        table: "user_achievement_awards",
        values: { seen_at: "2026-06-17T00:00:00.000Z" },
      },
      {
        columns: "badge_key",
        filters: [
          { column: "user_id", type: "eq", value: "user-1" },
          {
            column: "badge_key",
            type: "in",
            value: ["first_shopping_done", "shopping_rhythm"],
          },
        ],
        table: "user_badge_awards",
        values: { seen_at: "2026-06-17T00:00:00.000Z" },
      },
    ]);
  });

  it("does not write when the seen request has no notification ids", async () => {
    const { dbClient, updateCalls } = createSeenDb([]);

    await expect(
      markUserGamificationNotificationsSeen(dbClient, "user-1", []),
    ).resolves.toEqual({
      data: { seen_notification_ids: [] },
      error: null,
    });
    expect(updateCalls).toEqual([]);
  });
});
