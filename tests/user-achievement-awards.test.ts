import { describe, expect, it, vi } from "vitest";

import {
  projectUserGamificationAfterActivityEvent,
  projectUserGamificationAfterProgressEvent,
  type UserGamificationDbClient,
} from "@/lib/server/user-gamification";
import type { UserProgressDbClient } from "@/lib/server/user-progress";
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

  it("creates both recipebook and tutorial-complete achievement notifications on the final tutorial step", async () => {
    const existingTutorialRows = [
      "tutorial_recipe_saved",
      "tutorial_planner_registered",
      "tutorial_shopping_list_create",
      "tutorial_shopping_list_complete",
      "tutorial_cooking_complete",
    ].map((achievementKey) => ({
      achievement_key: achievementKey,
      category_key: "tutorial",
      track_key: "tutorial",
      target_value: 1,
      achieved_value: 1,
      badge_key: achievementKey,
      earned_at: "2026-06-13T09:00:00.000Z",
      seen_at: null,
    }));
    const achievementAwardsTable = {
      select: vi.fn(() => createArrayQuery({ data: existingTutorialRows, error: null })),
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
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "notification-final" }, error: null })),
    };
    const dbClient = {
      from: vi.fn((tableName: string) => {
        if (tableName === "user_achievement_awards") return achievementAwardsTable;
        if (tableName === "user_badge_awards") return badgeAwardsTable;
        if (tableName === "user_quest_progress") return questProgressTable;
        if (tableName === "user_progress_notifications") return notificationsTable;
        throw new Error(`unexpected table: ${tableName}`);
      }),
    };

    const result = await projectUserGamificationAfterProgressEvent(
      dbClient as unknown as UserGamificationDbClient,
      {
        userId: "user-1",
        progressEventId: "progress-event-recipebook",
        awardInput: {
          userId: "user-1",
          eventType: "custom_book_created",
          sourceTable: "recipe_books",
          sourceId: "recipe-book-1",
          occurredAt: "2026-06-13T10:00:00.000Z",
        },
        xpDelta: 25,
        previousLevel: 1,
        progress: {
          level: {
            current_level: 1,
            total_xp: 25,
            current_level_start_xp: 0,
            next_level_start_xp: 100,
            xp_into_current_level: 25,
            xp_to_next_level: 75,
            progress_ratio: 0.25,
            progress_percent: 25,
          },
          event_counts: {
            cooking_completed: 1,
            shopping_completed: 1,
            recipe_saved_distinct_ever: 1,
            custom_book_created: 1,
            planner_registered_first: 1,
            planner_registered_repeat: 0,
          },
          last_updated_at: "2026-06-13T10:00:00.000Z",
        },
      },
    );

    expect(result.error).toBeNull();
    expect(achievementAwardsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      achievement_key: "tutorial_recipebook_created",
      idempotency_key: "achievement:tutorial_recipebook_created:user-1",
    }));
    expect(achievementAwardsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      achievement_key: "tutorial_complete",
      idempotency_key: "achievement:tutorial_complete:user-1",
    }));
    expect(notificationsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      notification_key: "achievement:tutorial_recipebook_created:user-1",
      notification_type: "achievement_unlocked",
      group_key: "progress-event:progress-event-recipebook",
      payload_json: expect.objectContaining({
        achievement_key: "tutorial_recipebook_created",
      }),
    }));
    expect(notificationsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      notification_key: "achievement:tutorial_complete:user-1",
      notification_type: "achievement_unlocked",
      group_key: "progress-event:progress-event-recipebook",
      payload_json: expect.objectContaining({
        achievement_key: "tutorial_complete",
        title: "튜토리얼 완료",
      }),
    }));
  });

  it("does not create a separate badge notification when an achievement already awards that badge", async () => {
    const existingRows = [
      {
        achievement_key: "tutorial_cooking_complete",
        category_key: "tutorial",
        track_key: "tutorial",
        target_value: 1,
        achieved_value: 1,
        badge_key: "tutorial_cooking_complete",
        earned_at: "2026-06-13T09:00:00.000Z",
        seen_at: null,
      },
    ];
    const achievementAwardsTable = {
      select: vi.fn(() => createArrayQuery({ data: existingRows, error: null })),
      insert: vi.fn((row) => {
        if (row.achievement_key === "tutorial_cooking_complete") {
          return createMaybeSingleQuery({
            data: null,
            error: { code: "23505", message: "duplicate key" },
          });
        }

        return createMaybeSingleQuery({
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
        });
      }),
    };
    const badgeAwardsTable = {
      insert: vi.fn((row) =>
        createMaybeSingleQuery({
          data: {
            badge_key: row.badge_key,
            earned_at: row.earned_at,
            seen_at: null,
          },
          error: null,
        }),
      ),
    };
    const questProgressTable = {
      select: vi.fn(() => createArrayQuery({ data: [], error: null })),
      upsert: vi.fn((values) => createUpsertQuery({ data: { ...values, seen_at: null }, error: null })),
    };
    const notificationsTable = {
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "notification-cooking-3" }, error: null })),
    };
    const dbClient = {
      from: vi.fn((tableName: string) => {
        if (tableName === "user_achievement_awards") return achievementAwardsTable;
        if (tableName === "user_badge_awards") return badgeAwardsTable;
        if (tableName === "user_quest_progress") return questProgressTable;
        if (tableName === "user_progress_notifications") return notificationsTable;
        throw new Error(`unexpected table: ${tableName}`);
      }),
    };

    const result = await projectUserGamificationAfterProgressEvent(
      dbClient as unknown as UserGamificationDbClient,
      {
        userId: "user-1",
        progressEventId: "progress-event-cooking-3",
        awardInput: {
          userId: "user-1",
          eventType: "cooking_completed",
          sourceTable: "meals",
          sourceId: "session-3",
          occurredAt: "2026-06-13T10:00:00.000Z",
        },
        xpDelta: 45,
        previousLevel: 1,
        progress: {
          level: {
            current_level: 1,
            total_xp: 45,
            current_level_start_xp: 0,
            next_level_start_xp: 100,
            xp_into_current_level: 45,
            xp_to_next_level: 55,
            progress_ratio: 0.45,
            progress_percent: 45,
          },
          event_counts: {
            cooking_completed: 3,
            shopping_completed: 0,
            recipe_saved_distinct_ever: 0,
            custom_book_created: 0,
            planner_registered_first: 0,
            planner_registered_repeat: 0,
          },
          last_updated_at: "2026-06-13T10:00:00.000Z",
        },
      },
    );

    expect(result.error).toBeNull();
    expect(achievementAwardsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      achievement_key: "cooking_completed_3",
      badge_key: "cooking_completed_3",
    }));
    expect(badgeAwardsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      badge_key: "kitchen_routine_starter",
    }));
    expect(notificationsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      notification_key: "achievement:cooking_completed_3:user-1",
      notification_type: "achievement_unlocked",
      group_key: "progress-event:progress-event-cooking-3",
      payload_json: expect.objectContaining({
        achievement_key: "cooking_completed_3",
        title: "요리 완료 3",
      }),
    }));
    expect(notificationsTable.insert).not.toHaveBeenCalledWith(expect.objectContaining({
      notification_key: "badge:kitchen_routine_starter:user-1",
      notification_type: "badge_unlocked",
    }));
  });

  it("creates leftover cleanup achievement notifications in the same progress group as leftover XP", async () => {
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
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "notice-leftover-3" }, error: null })),
    };
    const dbClient = {
      from: vi.fn((tableName: string) => {
        if (tableName === "user_achievement_awards") return achievementAwardsTable;
        if (tableName === "user_badge_awards") return badgeAwardsTable;
        if (tableName === "user_quest_progress") return questProgressTable;
        if (tableName === "user_progress_notifications") return notificationsTable;
        throw new Error(`unexpected table: ${tableName}`);
      }),
    };

    const result = await projectUserGamificationAfterProgressEvent(
      dbClient as unknown as UserGamificationDbClient,
      {
        userId: "user-1",
        progressEventId: "progress-event-leftover-3",
        awardInput: {
          userId: "user-1",
          eventType: "leftover_eaten",
          sourceTable: "leftover_dishes",
          sourceId: "leftover-3",
          occurredAt: "2026-06-13T10:00:00.000Z",
        },
        xpDelta: 8,
        previousLevel: 1,
        progress: {
          level: {
            current_level: 1,
            total_xp: 31,
            current_level_start_xp: 0,
            next_level_start_xp: 100,
            xp_into_current_level: 31,
            xp_to_next_level: 69,
            progress_ratio: 0.31,
            progress_percent: 31,
          },
          event_counts: {
            cooking_completed: 0,
            shopping_completed: 0,
            recipe_saved_distinct_ever: 0,
            custom_book_created: 0,
            planner_registered_first: 0,
            planner_registered_repeat: 0,
            leftover_eaten: 3,
          },
          last_updated_at: "2026-06-13T10:00:00.000Z",
        },
      },
    );

    expect(result.error).toBeNull();
    expect(achievementAwardsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      achievement_key: "leftover_eaten_3",
      badge_key: "leftover_eaten_3",
      achieved_value: 3,
    }));
    expect(notificationsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      notification_key: "achievement:leftover_eaten_3:user-1",
      notification_type: "achievement_unlocked",
      group_key: "progress-event:progress-event-leftover-3",
      payload_json: expect.objectContaining({
        achievement_key: "leftover_eaten_3",
        title: "남은요리 정리 3",
      }),
    }));
  });

  it("creates a pantry achievement notification after the pantry activity reaches 10 distinct ingredients", async () => {
    const progressSummaryTable = {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: {
              user_id: "user-1",
              total_xp: 0,
              current_level: 1,
              level_curve_version: "v2",
              event_counts: {
                cooking_completed: 0,
                shopping_completed: 0,
                recipe_saved_distinct_ever: 0,
                custom_book_created: 0,
                planner_registered_first: 0,
                planner_registered_repeat: 0,
              },
              last_event_at: null,
              last_updated_at: "2026-06-13T10:00:00.000Z",
            },
            error: null,
          })),
        })),
      })),
    };
    const activityRows = Array.from({ length: 10 }, (_, index) => ({
      activity_type: "pantry_item_added",
      source_id: `pantry-${index + 1}`,
      source_meta_json: { ingredient_id: `ingredient-${index + 1}` },
    }));
    const growthActivityTable = {
      select: vi.fn(() => createArrayQuery({ data: activityRows, error: null })),
    };
    const shoppingListsTable = {
      select: vi.fn(() => createCountQuery(0)),
    };
    const recipesTable = {
      select: vi.fn(() => createCountQuery(0)),
    };
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
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "notice-1" }, error: null })),
    };
    const dbClient = {
      from: vi.fn((tableName: string) => {
        if (tableName === "user_progress_summary") return progressSummaryTable;
        if (tableName === "user_growth_activity_events") return growthActivityTable;
        if (tableName === "shopping_lists") return shoppingListsTable;
        if (tableName === "recipes") return recipesTable;
        if (tableName === "user_achievement_awards") return achievementAwardsTable;
        if (tableName === "user_badge_awards") return badgeAwardsTable;
        if (tableName === "user_quest_progress") return questProgressTable;
        if (tableName === "user_progress_notifications") return notificationsTable;
        throw new Error(`unexpected table: ${tableName}`);
      }),
    };

    const result = await projectUserGamificationAfterActivityEvent(
      dbClient as unknown as UserGamificationDbClient & UserProgressDbClient,
      {
        userId: "user-1",
        activityId: "activity-pantry-10",
        occurredAt: "2026-06-13T10:00:00.000Z",
      },
    );

    expect(result.error).toBeNull();
    expect(achievementAwardsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      achievement_key: "pantry_distinct_10",
      achieved_value: 10,
      source_activity_id: "activity-pantry-10",
    }));
    expect(notificationsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      notification_key: "achievement:pantry_distinct_10:user-1",
      notification_type: "achievement_unlocked",
      group_key: "growth-activity:activity-pantry-10",
      payload_json: expect.objectContaining({
        achievement_key: "pantry_distinct_10",
        title: "팬트리 재료 10",
      }),
    }));
  });

  it("creates a shopping-list-created achievement notification without a duplicate tutorial quest notification", async () => {
    const progressSummaryTable = {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({
            data: {
              user_id: "user-1",
              total_xp: 0,
              current_level: 1,
              level_curve_version: "v2",
              event_counts: {
                cooking_completed: 0,
                shopping_completed: 0,
                recipe_saved_distinct_ever: 0,
                custom_book_created: 0,
                planner_registered_first: 0,
                planner_registered_repeat: 0,
              },
              last_event_at: null,
              last_updated_at: "2026-06-13T10:00:00.000Z",
            },
            error: null,
          })),
        })),
      })),
    };
    const growthActivityTable = {
      select: vi.fn(() => createArrayQuery({ data: [], error: null })),
    };
    const shoppingListsTable = {
      select: vi.fn(() => createCountQuery(1)),
    };
    const recipesTable = {
      select: vi.fn(() => createCountQuery(0)),
    };
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
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "notice-shopping-created" }, error: null })),
    };
    const dbClient = {
      from: vi.fn((tableName: string) => {
        if (tableName === "user_progress_summary") return progressSummaryTable;
        if (tableName === "user_growth_activity_events") return growthActivityTable;
        if (tableName === "shopping_lists") return shoppingListsTable;
        if (tableName === "recipes") return recipesTable;
        if (tableName === "user_achievement_awards") return achievementAwardsTable;
        if (tableName === "user_badge_awards") return badgeAwardsTable;
        if (tableName === "user_quest_progress") return questProgressTable;
        if (tableName === "user_progress_notifications") return notificationsTable;
        throw new Error(`unexpected table: ${tableName}`);
      }),
    };

    const result = await projectUserGamificationAfterActivityEvent(
      dbClient as unknown as UserGamificationDbClient & UserProgressDbClient,
      {
        userId: "user-1",
        activityId: "activity-shopping-list-created",
        occurredAt: "2026-06-13T10:00:00.000Z",
      },
    );

    expect(result.error).toBeNull();
    expect(achievementAwardsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      achievement_key: "tutorial_shopping_list_create",
      source_activity_id: "activity-shopping-list-created",
    }));
    expect(questProgressTable.upsert).toHaveBeenCalledWith(expect.objectContaining({
      quest_key: "first_shopping_list_created",
      status: "completed",
    }), { onConflict: "user_id,quest_key" });
    expect(notificationsTable.insert).toHaveBeenCalledTimes(1);
    expect(notificationsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      notification_key: "achievement:tutorial_shopping_list_create:user-1",
      notification_type: "achievement_unlocked",
      group_key: "growth-activity:activity-shopping-list-created",
    }));
    expect(notificationsTable.insert).not.toHaveBeenCalledWith(expect.objectContaining({
      notification_type: "quest_completed",
    }));
  });
});
