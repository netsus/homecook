import { describe, expect, it, vi } from "vitest";

import {
  buildUserGamificationData,
  readUserGamification,
  toNotificationData,
  USER_BADGE_METADATA,
  USER_NOTIFICATION_PRIORITIES,
} from "@/lib/server/user-gamification";
import type { UserGamificationDbClient } from "@/lib/server/user-gamification";
import type { UserProgressDbClient } from "@/lib/server/user-progress";

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

function createArrayQuery<T>(result: QueryResult<T[]>) {
  const query = {
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    in: vi.fn(() => query),
    lt: vi.fn(() => query),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    then(
      onFulfilled?: (value: QueryResult<T[]>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };

  return query;
}

function createMaybeSingleQuery<T>(result: QueryResult<T>) {
  return {
    select: vi.fn(() => ({
      maybeSingle: vi.fn(async () => result),
    })),
    eq: vi.fn(() => ({
      maybeSingle: vi.fn(async () => result),
    })),
  };
}

function createCountQuery(count: number) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    then(
      onFulfilled?: (value: { data: null; error: null; count: number }) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve({ data: null, error: null, count }).then(onFulfilled, onRejected);
    },
  };

  return query;
}

function createUpsertQuery<T>(result: QueryResult<T>) {
  return {
    select: vi.fn(() => ({
      maybeSingle: vi.fn(async () => result),
    })),
  };
}

describe("user gamification notification priority", () => {
  it("keeps achievement unlocked at the same priority as badge unlocked", () => {
    expect(USER_NOTIFICATION_PRIORITIES).toMatchObject({
      level_up: 1,
      achievement_unlocked: 2,
      badge_unlocked: 2,
      quest_completed: 3,
      xp_awarded: 4,
    });
  });

  it("keeps server-side priority and additive notification metadata", () => {
    expect(toNotificationData({
      id: "n1",
      notification_type: "level_up",
      priority: 1,
      delivery_channel: "toast",
      toast_eligible: true,
      group_key: "progress-event:e1",
      payload_json: { level: 3 },
      created_at: "2026-06-10T10:00:00.000Z",
      seen_at: null,
    })).toEqual({
      id: "n1",
      notification_type: "level_up",
      priority: 1,
      delivery_channel: "toast",
      toast_eligible: true,
      group_key: "progress-event:e1",
      payload: { level: 3 },
      title: "레벨 3 달성",
      body: "새로운 레벨에 도달했어요.",
      category: "cooking",
      created_at: "2026-06-10T10:00:00.000Z",
      seen_at: null,
    });
  });

  it("adds grade, badge shape metadata, locked hints, priority unseen, and archive preview", () => {
    const data = buildUserGamificationData({
      progress: {
        level: {
          current_level: 8,
          total_xp: 2380,
          current_level_start_xp: 2380,
          next_level_start_xp: 2960,
          xp_into_current_level: 0,
          xp_to_next_level: 580,
          progress_ratio: 0,
          progress_percent: 0,
        },
        event_counts: {
          cooking_completed: 0,
          shopping_completed: 0,
          recipe_saved_distinct_ever: 0,
          custom_book_created: 0,
          planner_registered_first: 1,
          planner_registered_repeat: 2,
        },
        last_updated_at: "2026-06-10T10:00:00.000Z",
      },
      badgeRows: [],
      questRows: [],
      achievementRows: [],
      activityRows: [],
      achievementCounts: {
        pantry_distinct_ingredients: 0,
        leftover_eaten_manual: 0,
        recipe_registered: 0,
        shopping_list_created: 0,
      },
      notificationRows: [
        {
          id: "xp",
          notification_type: "xp_awarded",
          priority: 4,
          delivery_channel: "toast",
          toast_eligible: true,
          group_key: "progress-event:e1",
          payload_json: {},
          created_at: "2026-06-10T10:00:00.000Z",
          seen_at: null,
        },
        {
          id: "level",
          notification_type: "level_up",
          priority: 1,
          delivery_channel: "toast",
          toast_eligible: true,
          group_key: "progress-event:e1",
          payload_json: {},
          created_at: "2026-06-10T10:00:00.000Z",
          seen_at: null,
        },
        {
          id: "silent",
          notification_type: "xp_awarded",
          priority: 4,
          delivery_channel: "silent",
          toast_eligible: false,
          group_key: "progress-event:e2",
          payload_json: {},
          created_at: "2026-06-10T10:05:00.000Z",
          seen_at: null,
        },
        {
          id: "archive-only",
          notification_type: "quest_completed",
          priority: 3,
          delivery_channel: "archive_only",
          toast_eligible: false,
          group_key: "progress-event:e3",
          payload_json: {},
          created_at: "2026-06-10T10:04:00.000Z",
          seen_at: "2026-06-10T10:05:00.000Z",
        },
      ],
    });

    expect(data.grade).toMatchObject({ grade_key: "steel", label: "Steel" });
    expect(data.badges.locked[0]).toMatchObject({
      category: USER_BADGE_METADATA.first_recipe_saved.category,
      shape_key: USER_BADGE_METADATA.first_recipe_saved.shape_key,
      locked_hint: expect.any(String),
    });
    expect(data.notifications.priority_unseen.map((item) => item.id)).toEqual(["level", "xp"]);
    expect(data.notifications.unseen.map((item) => item.id)).not.toContain("silent");
    expect(data.notifications.archive_preview.map((item) => item.id)).toEqual([
      "archive-only",
      "xp",
      "level",
    ]);
  });

  it("keeps older unseen toast rows even when the latest archive page is already seen", async () => {
    const oldUnseen = {
      id: "550e8400-e29b-41d4-a716-446655440001",
      notification_type: "xp_awarded" as const,
      priority: 4,
      delivery_channel: "toast" as const,
      toast_eligible: true,
      group_key: "progress-event:e1",
      payload_json: { event_type: "planner_registered", xp_delta: 5, label: "플래너 등록" },
      created_at: "2026-06-10T09:00:00.000Z",
      seen_at: null,
    };
    const newestSeenRows = Array.from({ length: 5 }, (_, index) => ({
      id: `550e8400-e29b-41d4-a716-44665544000${index + 2}`,
      notification_type: "xp_awarded" as const,
      priority: 4,
      delivery_channel: "toast" as const,
      toast_eligible: true,
      group_key: `progress-event:e${index + 2}`,
      payload_json: { event_type: "recipe_saved", xp_delta: 8, label: "레시피 저장" },
      created_at: `2026-06-10T10:0${index}:00.000Z`,
      seen_at: "2026-06-10T11:00:00.000Z",
    }));
    const unseenNotificationQuery = createArrayQuery({ data: [oldUnseen], error: null });
    const archiveNotificationQuery = createArrayQuery({ data: newestSeenRows, error: null });
    const progressSummaryQuery = createMaybeSingleQuery({
      data: {
        user_id: "user-1",
        total_xp: 0,
        current_level: 1,
        level_curve_version: "v2" as const,
        event_counts: {
          cooking_completed: 0,
          shopping_completed: 0,
          recipe_saved_distinct_ever: 0,
          custom_book_created: 0,
          planner_registered_first: 0,
          planner_registered_repeat: 0,
        },
        last_event_at: null,
        last_updated_at: "2026-06-10T12:00:00.000Z",
      },
      error: null,
    });
    const questReadQuery = createArrayQuery({ data: [], error: null });
    const badgeReadQuery = createArrayQuery({ data: [], error: null });
    const questUpsert = vi.fn((values) => createUpsertQuery({
      data: { ...values, seen_at: null },
      error: null,
    }));
    const notificationSelect = vi
      .fn()
      .mockReturnValueOnce(unseenNotificationQuery)
      .mockReturnValueOnce(archiveNotificationQuery);
    const dbClient = {
      from: vi.fn((tableName: string) => {
        if (tableName === "user_progress_summary") {
          return { select: vi.fn(() => progressSummaryQuery) };
        }
        if (tableName === "user_quest_progress") {
          return {
            select: vi.fn(() => questReadQuery),
            upsert: questUpsert,
          };
        }
        if (tableName === "user_badge_awards") {
          return {
            select: vi.fn(() => badgeReadQuery),
            insert: vi.fn(),
          };
        }
        if (tableName === "user_progress_notifications") {
          return {
            select: notificationSelect,
            insert: vi.fn(),
          };
        }
        if (tableName === "user_achievement_awards") {
          return {
            select: vi.fn(() => createArrayQuery({ data: [], error: null })),
            insert: vi.fn(() => createMaybeSingleQuery({ data: null, error: { message: "duplicate key" } })),
          };
        }
        if (tableName === "user_growth_activity_events") {
          return { select: vi.fn(() => createArrayQuery({ data: [], error: null })) };
        }
        if (tableName === "shopping_lists") {
          return { select: vi.fn(() => createCountQuery(0)) };
        }
        if (tableName === "recipes") {
          return { select: vi.fn(() => createCountQuery(0)) };
        }
        throw new Error(`unexpected table: ${tableName}`);
      }),
    };

    const result = await readUserGamification(
      dbClient as unknown as UserGamificationDbClient & UserProgressDbClient,
      "user-1",
    );

    expect(result.error).toBeNull();
    expect(result.data?.notifications.unseen.map((item) => item.id)).toContain(oldUnseen.id);
    expect(result.data?.notifications.priority_unseen.map((item) => item.id)).toContain(oldUnseen.id);
    expect(unseenNotificationQuery.is).toHaveBeenCalledWith("seen_at", null);
  });
});
