import { describe, expect, it, vi } from "vitest";

import {
  projectUserGamificationAfterProgressEvent,
  type UserGamificationDbClient,
} from "@/lib/server/user-gamification";
import type { UserProgressData } from "@/types/user-progress";

function createArrayQuery<T>(result: { data: T[] | null; error: { message: string } | null }) {
  const query = {
    eq: vi.fn(() => query),
    then(
      onFulfilled?: (value: typeof result) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };

  return query;
}

function createMaybeSingleQuery<T>(result: { data: T | null; error: { code?: string; message: string } | null }) {
  return {
    select: vi.fn(() => ({
      maybeSingle: vi.fn(async () => result),
    })),
  };
}

function createUpsertQuery<T>(result: { data: T | null; error: { message: string } | null }) {
  return {
    select: vi.fn(() => ({
      maybeSingle: vi.fn(async () => result),
    })),
  };
}

function progressWithRecipeSaved(): UserProgressData {
  return {
    level: {
      current_level: 1,
      total_xp: 15,
      current_level_start_xp: 0,
      next_level_start_xp: 100,
      xp_into_current_level: 15,
      xp_to_next_level: 85,
      progress_ratio: 0.15,
      progress_percent: 15,
    },
    event_counts: {
      cooking_completed: 0,
      shopping_completed: 0,
      recipe_saved_distinct_ever: 1,
      custom_book_created: 0,
      planner_registered_first: 0,
      planner_registered_repeat: 0,
    },
    last_updated_at: "2026-06-13T10:00:00.000Z",
  };
}

describe("user achievement awards", () => {
  it("creates achievement awards and achievement notifications without awarding extra XP", async () => {
    const achievementAwardsTable = {
      select: vi.fn(() => createArrayQuery({ data: [], error: null })),
      insert: vi.fn((row) =>
        createMaybeSingleQuery({
          data: {
            achievement_key: row.achievement_key,
            category_key: row.category_key,
            track_key: row.track_key,
            target_value: row.target_value,
            achieved_value: row.achieved_value,
            badge_key: row.badge_key,
            earned_at: row.earned_at,
            seen_at: null,
          },
          error: null,
        }),
      ),
    };
    const badgeAwardsTable = {
      insert: vi.fn(() => createMaybeSingleQuery({ data: null, error: { code: "23505", message: "duplicate key" } })),
    };
    const questProgressTable = {
      select: vi.fn(() => createArrayQuery({ data: [], error: null })),
      upsert: vi.fn((values) => createUpsertQuery({ data: { ...values, seen_at: null }, error: null })),
    };
    const notificationsTable = {
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "notification-1" }, error: null })),
    };
    const progressEventsTable = {
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "unexpected-xp-event" }, error: null })),
    };
    const dbClient = {
      from: vi.fn((tableName: string) => {
        if (tableName === "user_achievement_awards") return achievementAwardsTable;
        if (tableName === "user_badge_awards") return badgeAwardsTable;
        if (tableName === "user_quest_progress") return questProgressTable;
        if (tableName === "user_progress_notifications") return notificationsTable;
        if (tableName === "user_progress_events") return progressEventsTable;
        throw new Error(`unexpected table: ${tableName}`);
      }),
    };

    const result = await projectUserGamificationAfterProgressEvent(
      dbClient as unknown as UserGamificationDbClient,
      {
        userId: "user-1",
        progressEventId: "progress-event-1",
        awardInput: {
          userId: "user-1",
          eventType: "recipe_saved",
          sourceTable: "recipe_book_items",
          sourceId: "recipe-book-item-1",
          recipeId: "recipe-1",
          occurredAt: "2026-06-13T10:00:00.000Z",
        },
        xpDelta: 15,
        previousLevel: 1,
        progress: progressWithRecipeSaved(),
      },
    );

    expect(result.error).toBeNull();
    expect(achievementAwardsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: "user-1",
      achievement_key: "tutorial_recipe_saved",
      category_key: "tutorial",
      target_value: 1,
      achieved_value: 1,
      source_event_id: "progress-event-1",
      idempotency_key: "achievement:tutorial_recipe_saved:user-1",
    }));
    expect(notificationsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      notification_type: "achievement_unlocked",
      priority: 2,
      group_key: "progress-event:progress-event-1",
      payload_json: expect.objectContaining({
        achievement_key: "tutorial_recipe_saved",
      }),
    }));
    expect(progressEventsTable.insert).not.toHaveBeenCalled();
  });
});
