import { describe, expect, it, vi } from "vitest";

import {
  readUserGamification,
  type UserGamificationDbClient,
} from "@/lib/server/user-gamification";
import type { UserProgressDbClient } from "@/lib/server/user-progress";

function createArrayQuery<T>(result: { data: T[] | null; error: { message: string } | null }) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    is: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    then(
      onFulfilled?: (value: typeof result) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };

  return query;
}

function createMaybeSingleQuery<T>(result: { data: T | null; error: { message: string } | null }) {
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

function createUpsertQuery<T>(result: { data: T | null; error: { message: string } | null }) {
  return {
    select: vi.fn(() => ({
      maybeSingle: vi.fn(async () => result),
    })),
  };
}

describe("user achievement silent backfill", () => {
  it("reflects legacy progress as achievement state without creating historical notifications", async () => {
    const achievementAwards: Array<{
      achievement_key: string;
      category_key: string;
      track_key: string | null;
      target_value: number;
      achieved_value: number;
      badge_key: string | null;
      earned_at: string;
      seen_at: string | null;
    }> = [];
    const achievementAwardsTable = {
      select: vi.fn(() => createArrayQuery({ data: achievementAwards, error: null })),
      insert: vi.fn((row) => createMaybeSingleQuery({
        data: (() => {
          const inserted = {
          achievement_key: row.achievement_key,
          category_key: row.category_key,
          track_key: row.track_key,
          target_value: row.target_value,
          achieved_value: row.achieved_value,
          badge_key: row.badge_key,
          earned_at: row.earned_at,
          seen_at: null,
          };
          achievementAwards.push(inserted);
          return inserted;
        })(),
        error: null,
      })),
    };
    const notificationsTable = {
      select: vi.fn(() => createArrayQuery({ data: [], error: null })),
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "notification-1" }, error: null })),
    };
    const dbClient = {
      from: vi.fn((tableName: string) => {
        if (tableName === "user_progress_summary") {
          return {
            select: vi.fn(() => createMaybeSingleQuery({
              data: {
                user_id: "user-1",
                total_xp: 60,
                current_level: 1,
                level_curve_version: "v2",
                event_counts: {
                  cooking_completed: 1,
                  shopping_completed: 1,
                  recipe_saved_distinct_ever: 1,
                  custom_book_created: 0,
                  planner_registered_first: 0,
                  planner_registered_repeat: 0,
                },
                last_event_at: "2026-06-10T10:00:00.000Z",
                last_updated_at: "2026-06-13T10:00:00.000Z",
              },
              error: null,
            })),
          };
        }
        if (tableName === "user_achievement_awards") return achievementAwardsTable;
        if (tableName === "user_badge_awards") {
          return {
            select: vi.fn(() => createArrayQuery({ data: [], error: null })),
            insert: vi.fn(() => createMaybeSingleQuery({ data: null, error: { message: "duplicate key" } })),
          };
        }
        if (tableName === "user_quest_progress") {
          return {
            select: vi.fn(() => createArrayQuery({ data: [], error: null })),
            upsert: vi.fn((values) => createUpsertQuery({ data: { ...values, seen_at: null }, error: null })),
          };
        }
        if (tableName === "user_progress_notifications") return notificationsTable;
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
    expect(achievementAwardsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      achievement_key: "tutorial_recipe_saved",
    }));
    expect(result.data?.achievement_album.summary.earned_count).toBeGreaterThan(0);
    expect(notificationsTable.insert).not.toHaveBeenCalled();
  });
});
