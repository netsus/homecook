import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  awardUserProgressEvent,
  type UserProgressDbClient,
  USER_PROGRESS_XP_AWARDS,
} from "@/lib/server/user-progress";
import {
  projectUserGamificationAfterProgressEvent,
  type UserGamificationDbClient,
} from "@/lib/server/user-gamification";
import type { UserProgressData } from "@/types/user-progress";

interface QueryError {
  code?: string;
  message: string;
}

interface QueryResult<T> {
  data: T | null;
  error: QueryError | null;
}

function createMaybeSingleQuery<T>(result: QueryResult<T>) {
  return {
    select: vi.fn(() => ({
      maybeSingle: vi.fn(async () => result),
    })),
  };
}

function createUpsertQuery<T>(result: QueryResult<T>) {
  return {
    select: vi.fn(() => ({
      maybeSingle: vi.fn(async () => result),
    })),
  };
}

function createArrayQuery<T>(result: QueryResult<T[]>) {
  const query = {
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    then(
      onFulfilled?: (value: QueryResult<T[]>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };

  return query;
}

function createProgressData(currentLevel: number): UserProgressData {
  return {
    level: {
      current_level: currentLevel,
      total_xp: 0,
      current_level_start_xp: 0,
      next_level_start_xp: 100,
      xp_into_current_level: 0,
      xp_to_next_level: 100,
      progress_ratio: 0,
      progress_percent: 0,
    },
    event_counts: {
      cooking_completed: 0,
      shopping_completed: 0,
      recipe_saved_distinct_ever: 0,
      custom_book_created: 0,
      planner_registered_first: 0,
      planner_registered_repeat: 0,
    },
    last_updated_at: "2026-06-10T10:01:00.000Z",
  };
}

function createAchievementAwardsTable() {
  return {
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
}

function createGamificationProjectionDb() {
  const achievementAwardsTable = createAchievementAwardsTable();
  const badgeAwardsTable = {
    insert: vi.fn(() => createMaybeSingleQuery({ data: null, error: { code: "23505", message: "duplicate key" } })),
  };
  const questProgressTable = {
    select: vi.fn(() => createArrayQuery({ data: [], error: null })),
    upsert: vi.fn((values) =>
      createUpsertQuery({
        data: { ...values, seen_at: null },
        error: null,
      }),
    ),
  };
  const notificationsTable = {
    insert: vi.fn((row: Record<string, unknown>) => {
      void row;
      return createMaybeSingleQuery({ data: { id: "notification-1" }, error: null });
    }),
  };
  const dbClient = {
    from: vi.fn((table: string) => {
      if (table === "user_achievement_awards") return achievementAwardsTable;
      if (table === "user_badge_awards") return badgeAwardsTable;
      if (table === "user_quest_progress") return questProgressTable;
      if (table === "user_progress_notifications") return notificationsTable;
      throw new Error(`unexpected table: ${table}`);
    }),
  };

  return { dbClient, notificationsTable };
}

describe("user gamification event projection", () => {
  it("creates one level-up notification when a live XP event crosses a level boundary", async () => {
    const { dbClient, notificationsTable } = createGamificationProjectionDb();

    const result = await projectUserGamificationAfterProgressEvent(
      dbClient as unknown as UserGamificationDbClient,
      {
        userId: "user-1",
        progressEventId: "progress-event-level-2",
        awardInput: {
          userId: "user-1",
          eventType: "cooking_completed",
          sourceTable: "leftover_dishes",
          sourceId: "leftover-1",
          occurredAt: "2026-06-10T10:00:00.000Z",
        },
        xpDelta: 60,
        previousLevel: 1,
        progress: createProgressData(2),
      },
    );

    const notificationRows = notificationsTable.insert.mock.calls.map(([row]) => row);
    const levelUpRows = notificationRows.filter((row) => row.notification_type === "level_up");

    expect(result.error).toBeNull();
    expect(levelUpRows).toEqual([
      expect.objectContaining({
        notification_key: "level-up:user-1:2",
        notification_type: "level_up",
        priority: 1,
        group_key: "progress-event:progress-event-level-2",
        payload_json: expect.objectContaining({
          previous_level: 1,
          current_level: 2,
          previous_grade: expect.objectContaining({ grade_key: "clay" }),
          grade: expect.objectContaining({ grade_key: "clay" }),
        }),
      }),
    ]);
  });

  it("does not create a level-up notification when the live XP event stays on the same level", async () => {
    const { dbClient, notificationsTable } = createGamificationProjectionDb();

    const result = await projectUserGamificationAfterProgressEvent(
      dbClient as unknown as UserGamificationDbClient,
      {
        userId: "user-1",
        progressEventId: "progress-event-same-level",
        awardInput: {
          userId: "user-1",
          eventType: "recipe_saved",
          sourceTable: "recipe_book_items",
          sourceId: "recipe-book-item-1",
          recipeId: "recipe-1",
          occurredAt: "2026-06-10T10:00:00.000Z",
        },
        xpDelta: 8,
        previousLevel: 2,
        progress: createProgressData(2),
      },
    );

    const notificationRows = notificationsTable.insert.mock.calls.map(([row]) => row);

    expect(result.error).toBeNull();
    expect(notificationRows.some((row) => row.notification_type === "level_up")).toBe(false);
  });

  it("creates only the final level-up notification when one live XP event jumps multiple levels", async () => {
    const { dbClient, notificationsTable } = createGamificationProjectionDb();

    const result = await projectUserGamificationAfterProgressEvent(
      dbClient as unknown as UserGamificationDbClient,
      {
        userId: "user-1",
        progressEventId: "progress-event-level-4",
        awardInput: {
          userId: "user-1",
          eventType: "shopping_completed",
          sourceTable: "shopping_lists",
          sourceId: "shopping-list-1",
          occurredAt: "2026-06-10T10:00:00.000Z",
        },
        xpDelta: 200,
        previousLevel: 1,
        progress: createProgressData(4),
      },
    );

    const levelUpKeys = notificationsTable.insert.mock.calls
      .map(([row]) => row)
      .filter((row) => row.notification_type === "level_up")
      .map((row) => row.notification_key);

    expect(result.error).toBeNull();
    expect(levelUpKeys).toEqual(["level-up:user-1:4", "grade-up:user-1:wood"]);
  });

  it("creates separate level-up and grade-up notifications when XP crosses a grade boundary", async () => {
    const { dbClient, notificationsTable } = createGamificationProjectionDb();

    const result = await projectUserGamificationAfterProgressEvent(
      dbClient as unknown as UserGamificationDbClient,
      {
        userId: "user-1",
        progressEventId: "progress-event-grade-8",
        awardInput: {
          userId: "user-1",
          eventType: "cooking_completed",
          sourceTable: "leftover_dishes",
          sourceId: "leftover-grade",
          occurredAt: "2026-06-10T10:00:00.000Z",
        },
        xpDelta: 60,
        previousLevel: 7,
        progress: createProgressData(8),
      },
    );

    const levelRows = notificationsTable.insert.mock.calls
      .map(([row]) => row)
      .filter((row) => row.notification_type === "level_up");

    expect(result.error).toBeNull();
    expect(levelRows).toEqual([
      expect.objectContaining({
        notification_key: "level-up:user-1:8",
        payload_json: expect.objectContaining({
          grade_upgrade: false,
          previous_level: 7,
          current_level: 8,
        }),
      }),
      expect.objectContaining({
        notification_key: "grade-up:user-1:steel",
        payload_json: expect.objectContaining({
          grade_upgrade: true,
          previous_grade: expect.objectContaining({ grade_key: "wood" }),
          grade: expect.objectContaining({ grade_key: "steel" }),
        }),
      }),
    ]);
  });

  it("creates XP, badge, and quest projections after a canonical progress event", async () => {
    const progressEventsTable = {
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "progress-event-1" }, error: null })),
      select: vi
        .fn()
        .mockReturnValueOnce(createArrayQuery({ data: [], error: null }))
        .mockReturnValueOnce(createArrayQuery({
          data: [
            {
              event_type: "shopping_completed",
              source_key: "shopping_completed:550e8400-e29b-41d4-a716-446655440001",
              xp_delta: USER_PROGRESS_XP_AWARDS.shopping_completed,
              occurred_at: "2026-06-10T10:00:00.000Z",
              source_meta_json: { xp_kind: "first", level_curve_version: "v2" },
            },
          ],
          error: null,
        })),
    };
    const progressSummaryTable = {
      upsert: vi.fn(() =>
        createUpsertQuery({
          data: {
            user_id: "user-1",
            total_xp: USER_PROGRESS_XP_AWARDS.shopping_completed,
            current_level: 1,
            event_counts: {
              cooking_completed: 0,
              shopping_completed: 1,
              recipe_saved_distinct_ever: 0,
              custom_book_created: 0,
              planner_registered_first: 0,
              planner_registered_repeat: 0,
            },
            last_event_at: "2026-06-10T10:00:00.000Z",
            last_updated_at: "2026-06-10T10:01:00.000Z",
          },
          error: null,
        }),
      ),
    };
    const badgeAwardsTable = {
      insert: vi.fn(() =>
        createMaybeSingleQuery({
          data: {
            badge_key: "first_shopping_done",
            earned_at: "2026-06-10T10:01:00.000Z",
            seen_at: null,
          },
          error: null,
        }),
      ),
    };
    const achievementAwardsTable = createAchievementAwardsTable();
    const questProgressTable = {
      select: vi.fn(() => createArrayQuery({ data: [], error: null })),
      upsert: vi.fn(() =>
        createUpsertQuery({
          data: {
            quest_key: "first_shopping_done",
            quest_type: "tutorial",
            status: "completed",
            progress_current: 1,
            progress_target: 1,
            completed_at: "2026-06-10T10:01:00.000Z",
            dismissed_at: null,
            seen_at: null,
            updated_at: "2026-06-10T10:01:00.000Z",
          },
          error: null,
        }),
      ),
    };
    const notificationsTable = {
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "notification-1" }, error: null })),
    };
    const dbClient = {
      from: vi.fn((table: string) => {
        if (table === "user_progress_events") return progressEventsTable;
        if (table === "user_progress_summary") return progressSummaryTable;
        if (table === "user_achievement_awards") return achievementAwardsTable;
        if (table === "user_badge_awards") return badgeAwardsTable;
        if (table === "user_quest_progress") return questProgressTable;
        if (table === "user_progress_notifications") return notificationsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    const result = await awardUserProgressEvent(dbClient as unknown as UserProgressDbClient, {
      userId: "user-1",
      eventType: "shopping_completed",
      sourceTable: "shopping_lists",
      sourceId: "550e8400-e29b-41d4-a716-446655440001",
      occurredAt: "2026-06-10T10:00:00.000Z",
    });

    expect(result).toMatchObject({ awarded: true, duplicate: false, error: null });
    expect(badgeAwardsTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        badge_key: "first_shopping_done",
        source_event_id: "progress-event-1",
        idempotency_key: "badge:first_shopping_done:user-1",
      }),
    );
    expect(questProgressTable.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        quest_key: "first_shopping_done",
        quest_type: "tutorial",
        status: "completed",
        progress_current: 1,
        progress_target: 1,
        source_event_id: "progress-event-1",
      }),
      { onConflict: "user_id,quest_key" },
    );
    expect(notificationsTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        notification_key: "xp-toast:progress-event-1",
        notification_type: "xp_awarded",
        delivery_channel: "archive_only",
        toast_eligible: false,
        source_event_id: "progress-event-1",
        payload_json: expect.objectContaining({
          event_type: "shopping_completed",
          label: "장보기 완료",
          xp_delta: USER_PROGRESS_XP_AWARDS.shopping_completed,
        }),
      }),
    );
    expect(notificationsTable.insert).not.toHaveBeenCalledWith(
      expect.objectContaining({
        notification_key: "badge:first_shopping_done:user-1",
        notification_type: "badge_unlocked",
      }),
    );
  });

  it("projects a recipe save source event into XP and tutorial notifications without a duplicate first-badge notification", async () => {
    const progressEventsTable = {
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "progress-event-2" }, error: null })),
      select: vi
        .fn()
        .mockReturnValueOnce(createArrayQuery({ data: [], error: null }))
        .mockReturnValueOnce(createArrayQuery({
          data: [
            {
              event_type: "recipe_saved",
              source_key: "recipe_saved:user-1:550e8400-e29b-41d4-a716-446655440010",
              xp_delta: USER_PROGRESS_XP_AWARDS.recipe_saved,
              occurred_at: "2026-06-10T11:00:00.000Z",
              source_meta_json: { xp_kind: "first", level_curve_version: "v2" },
            },
          ],
          error: null,
        })),
    };
    const progressSummaryTable = {
      upsert: vi.fn(() =>
        createUpsertQuery({
          data: {
            user_id: "user-1",
            total_xp: USER_PROGRESS_XP_AWARDS.recipe_saved,
            current_level: 1,
            event_counts: {
              cooking_completed: 0,
              shopping_completed: 0,
              recipe_saved_distinct_ever: 1,
              custom_book_created: 0,
              planner_registered_first: 0,
              planner_registered_repeat: 0,
            },
            last_event_at: "2026-06-10T11:00:00.000Z",
            last_updated_at: "2026-06-10T11:01:00.000Z",
          },
          error: null,
        }),
      ),
    };
    const badgeAwardsTable = {
      insert: vi.fn(() =>
        createMaybeSingleQuery({
          data: {
            badge_key: "first_recipe_saved",
            earned_at: "2026-06-10T11:01:00.000Z",
            seen_at: null,
          },
          error: null,
        }),
      ),
    };
    const questProgressTable = {
      select: vi.fn(() => createArrayQuery({ data: [], error: null })),
      upsert: vi.fn(() =>
        createUpsertQuery({
          data: {
            quest_key: "first_recipe_saved",
            quest_type: "tutorial",
            status: "completed",
            progress_current: 1,
            progress_target: 1,
            completed_at: "2026-06-10T11:01:00.000Z",
            dismissed_at: null,
            seen_at: null,
            updated_at: "2026-06-10T11:01:00.000Z",
          },
          error: null,
        }),
      ),
    };
    const achievementAwardsTable = createAchievementAwardsTable();
    const notificationsTable = {
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "notification-2" }, error: null })),
    };
    const dbClient = {
      from: vi.fn((table: string) => {
        if (table === "user_progress_events") return progressEventsTable;
        if (table === "user_progress_summary") return progressSummaryTable;
        if (table === "user_achievement_awards") return achievementAwardsTable;
        if (table === "user_badge_awards") return badgeAwardsTable;
        if (table === "user_quest_progress") return questProgressTable;
        if (table === "user_progress_notifications") return notificationsTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    const result = await awardUserProgressEvent(dbClient as unknown as UserProgressDbClient, {
      userId: "user-1",
      eventType: "recipe_saved",
      sourceTable: "recipe_book_items",
      sourceId: "550e8400-e29b-41d4-a716-446655440011",
      recipeId: "550e8400-e29b-41d4-a716-446655440010",
      occurredAt: "2026-06-10T11:00:00.000Z",
    });

    expect(result).toMatchObject({ awarded: true, duplicate: false, error: null });
    expect(badgeAwardsTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        badge_key: "first_recipe_saved",
        source_event_id: "progress-event-2",
        idempotency_key: "badge:first_recipe_saved:user-1",
      }),
    );
    expect(questProgressTable.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        quest_key: "first_recipe_saved",
        quest_type: "tutorial",
        status: "completed",
        progress_current: 1,
        progress_target: 1,
        source_event_id: "progress-event-2",
      }),
      { onConflict: "user_id,quest_key" },
    );
    expect(notificationsTable.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        notification_key: "xp-toast:progress-event-2",
        notification_type: "xp_awarded",
        delivery_channel: "archive_only",
        toast_eligible: false,
        source_event_id: "progress-event-2",
        payload_json: expect.objectContaining({
          event_type: "recipe_saved",
          label: "레시피 저장",
          xp_delta: USER_PROGRESS_XP_AWARDS.recipe_saved,
        }),
      }),
    );
    expect(notificationsTable.insert).not.toHaveBeenCalledWith(
      expect.objectContaining({
        notification_key: "badge:first_recipe_saved:user-1",
        notification_type: "badge_unlocked",
      }),
    );
  });

  it("does not fail the source XP award when gamification projection fails", async () => {
    const progressEventsTable = {
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "progress-event-1" }, error: null })),
      select: vi.fn(() => createArrayQuery({ data: [], error: null })),
    };
    const progressSummaryTable = {
      upsert: vi.fn(() =>
        createUpsertQuery({
          data: {
            user_id: "user-1",
            total_xp: 0,
            current_level: 1,
            event_counts: {},
            last_event_at: null,
            last_updated_at: "2026-06-10T10:01:00.000Z",
          },
          error: null,
        }),
      ),
    };
    const dbClient = {
      from: vi.fn((table: string) => {
        if (table === "user_progress_events") return progressEventsTable;
        if (table === "user_progress_summary") return progressSummaryTable;
        throw new Error("gamification projection unavailable");
      }),
    };

    const result = await awardUserProgressEvent(dbClient as unknown as UserProgressDbClient, {
      userId: "user-1",
      eventType: "cooking_completed",
      sourceTable: "leftover_dishes",
      sourceId: "550e8400-e29b-41d4-a716-446655440002",
    });

    expect(result).toMatchObject({ awarded: true, duplicate: false, error: null });
  });

  it("adds dedicated gamification tables with RLS and integrity constraints", async () => {
    const migration = await readFile(
      "supabase/migrations/20260610183000_33c_user_gamification.sql",
      "utf8",
    );

    expect(migration).toContain("create table if not exists public.user_badge_awards");
    expect(migration).toContain("create table if not exists public.user_quest_progress");
    expect(migration).toContain("create table if not exists public.user_progress_notifications");
    expect(migration).toContain("unique (user_id, badge_key)");
    expect(migration).toContain("unique (user_id, idempotency_key)");
    expect(migration).toContain("unique (user_id, quest_key)");
    expect(migration).toContain("unique (user_id, notification_key)");
    expect(migration).toContain("alter table public.user_badge_awards enable row level security");
    expect(migration).toContain("alter table public.user_quest_progress enable row level security");
    expect(migration).toContain("alter table public.user_progress_notifications enable row level security");
    expect(migration).toContain("auth.uid() = user_id");
    expect(migration).toContain("grant all privileges on public.user_progress_notifications to service_role");
    expect(migration).not.toContain("operational_events");
  });

  it("removes legacy quest notification rows from the remote notification contract", async () => {
    const migration = await readFile(
      "supabase/migrations/20260615143000_35c_remove_quest_completed_notifications.sql",
      "utf8",
    );

    expect(migration).toContain(
      "delete from public.user_progress_notifications\nwhere notification_type = 'quest_completed';",
    );
    expect(migration).toContain("drop constraint if exists user_progress_notifications_type_check");
    expect(migration).toContain(
      "check (notification_type in (\n    'xp_awarded',\n    'achievement_unlocked',\n    'badge_unlocked',\n    'level_up'\n  ))",
    );
    expect(migration).not.toContain("'quest_completed',");
  });
});
