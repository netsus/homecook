import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  awardUserProgressEvent,
  type UserProgressDbClient,
  USER_PROGRESS_XP_AWARDS,
} from "@/lib/server/user-progress";

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

describe("user gamification event projection", () => {
  it("creates XP, badge, and quest projections after a canonical progress event", async () => {
    const progressEventsTable = {
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "progress-event-1" }, error: null })),
      select: vi.fn(() =>
        createArrayQuery({
          data: [
            {
              event_type: "shopping_completed",
              source_key: "shopping_completed:550e8400-e29b-41d4-a716-446655440001",
              xp_delta: USER_PROGRESS_XP_AWARDS.shopping_completed,
              occurred_at: "2026-06-10T10:00:00.000Z",
            },
          ],
          error: null,
        }),
      ),
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
        source_event_id: "progress-event-1",
        payload_json: expect.objectContaining({
          event_type: "shopping_completed",
          label: "장보기 완료",
          xp_delta: USER_PROGRESS_XP_AWARDS.shopping_completed,
        }),
      }),
    );
  });

  it("projects a recipe save source event into XP, badge, and tutorial quest notifications", async () => {
    const progressEventsTable = {
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "progress-event-2" }, error: null })),
      select: vi.fn(() =>
        createArrayQuery({
          data: [
            {
              event_type: "recipe_saved",
              source_key: "recipe_saved:user-1:550e8400-e29b-41d4-a716-446655440010",
              xp_delta: USER_PROGRESS_XP_AWARDS.recipe_saved,
              occurred_at: "2026-06-10T11:00:00.000Z",
            },
          ],
          error: null,
        }),
      ),
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
    const notificationsTable = {
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "notification-2" }, error: null })),
    };
    const dbClient = {
      from: vi.fn((table: string) => {
        if (table === "user_progress_events") return progressEventsTable;
        if (table === "user_progress_summary") return progressSummaryTable;
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
        source_event_id: "progress-event-2",
        payload_json: expect.objectContaining({
          event_type: "recipe_saved",
          label: "레시피 저장",
          xp_delta: USER_PROGRESS_XP_AWARDS.recipe_saved,
        }),
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
});
