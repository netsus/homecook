import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  awardUserProgressEvent,
  readUserProgress,
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

function createArraySelectQuery<T>(result: QueryResult<T[]>) {
  const query = {
    eq: vi.fn(() => query),
    then(
      onFulfilled?: (value: QueryResult<T[]>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };

  return query;
}

function createSelectMaybeSingleQuery<T>(result: QueryResult<T>) {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
  };

  return query;
}

describe("user progress event writer", () => {
  it("inserts an idempotent ledger row and rebuilds the summary projection", async () => {
    const progressEventsTable = {
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "event-1" }, error: null })),
      select: vi
        .fn()
        .mockReturnValueOnce(createArraySelectQuery({ data: [], error: null }))
        .mockReturnValueOnce(createArraySelectQuery({
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
      upsert: vi.fn(() => createMaybeSingleQuery({
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
      })),
    };
    const dbClient = {
      from: vi.fn((table: string) => {
        if (table === "user_progress_events") return progressEventsTable;
        if (table === "user_progress_summary") return progressSummaryTable;
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

    expect(result).toMatchObject({ awarded: true, duplicate: false });
    expect(progressEventsTable.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      event_type: "shopping_completed",
      source_key: "shopping_completed:550e8400-e29b-41d4-a716-446655440001",
      source_table: "shopping_lists",
      source_id: "550e8400-e29b-41d4-a716-446655440001",
      xp_delta: USER_PROGRESS_XP_AWARDS.shopping_completed,
      occurred_at: "2026-06-10T10:00:00.000Z",
      source_meta_json: {
        xp_kind: "first",
        level_curve_version: "v2",
      },
    });
    expect(progressSummaryTable.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        total_xp: USER_PROGRESS_XP_AWARDS.shopping_completed,
        current_level: 1,
        event_counts: expect.objectContaining({ shopping_completed: 1 }),
      }),
      { onConflict: "user_id" },
    );
  });

  it("treats duplicate ledger inserts as no-op awards", async () => {
    const progressEventsTable = {
      insert: vi.fn(() =>
        createMaybeSingleQuery({
          data: null,
          error: { code: "23505", message: "duplicate key value violates unique constraint" },
        }),
      ),
      select: vi.fn(() => createArraySelectQuery({ data: [], error: null })),
    };
    const progressSummaryTable = {
      upsert: vi.fn(),
    };
    const dbClient = {
      from: vi.fn((table: string) => {
        if (table === "user_progress_events") return progressEventsTable;
        if (table === "user_progress_summary") return progressSummaryTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    const result = await awardUserProgressEvent(dbClient as unknown as UserProgressDbClient, {
      userId: "user-1",
      eventType: "recipe_saved",
      sourceTable: "recipe_book_items",
      sourceId: "550e8400-e29b-41d4-a716-446655440701",
      recipeId: "550e8400-e29b-41d4-a716-446655440601",
      occurredAt: "2026-06-10T10:00:00.000Z",
    });

    expect(result).toEqual({ awarded: false, duplicate: true, error: null, summary: null });
    expect(progressEventsTable.insert).toHaveBeenCalled();
    expect(progressSummaryTable.upsert).not.toHaveBeenCalled();
  });

  it("does not award the same planner meal again after it created the first planner event", async () => {
    const progressEventsTable = {
      insert: vi.fn(),
      select: vi.fn(() =>
        createArraySelectQuery({
          data: [
            {
              event_type: "planner_registered",
              source_id: "550e8400-e29b-41d4-a716-446655440901",
              source_key: "planner_registered:first:user-1",
              xp_delta: 25,
              occurred_at: "2026-06-10T10:00:00.000Z",
              source_meta_json: { xp_kind: "first", level_curve_version: "v2" },
            },
          ],
          error: null,
        }),
      ),
    };
    const progressSummaryTable = { upsert: vi.fn() };
    const dbClient = {
      from: vi.fn((table: string) => {
        if (table === "user_progress_events") return progressEventsTable;
        if (table === "user_progress_summary") return progressSummaryTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    const result = await awardUserProgressEvent(dbClient as unknown as UserProgressDbClient, {
      userId: "user-1",
      eventType: "planner_registered",
      sourceTable: "meals",
      sourceId: "550e8400-e29b-41d4-a716-446655440901",
      occurredAt: "2026-06-10T10:00:00.000Z",
    });

    expect(result).toEqual({ awarded: false, duplicate: true, error: null, summary: null });
    expect(progressEventsTable.insert).not.toHaveBeenCalled();
    expect(progressSummaryTable.upsert).not.toHaveBeenCalled();
  });

  it("reconciles a missing summary row to level 1 / 0 XP from an empty ledger", async () => {
    const summarySelectQuery = createSelectMaybeSingleQuery({
      data: null,
      error: null,
    });
    const progressEventsTable = {
      select: vi.fn(() =>
        createArraySelectQuery({
          data: [],
          error: null,
        }),
      ),
      insert: vi.fn(),
    };
    const progressSummaryTable = {
      select: vi.fn(() => summarySelectQuery),
      upsert: vi.fn(() => createMaybeSingleQuery({
        data: {
          user_id: "user-1",
          total_xp: 0,
          current_level: 1,
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
      })),
    };
    const dbClient = {
      from: vi.fn((table: string) => {
        if (table === "user_progress_events") return progressEventsTable;
        if (table === "user_progress_summary") return progressSummaryTable;
        throw new Error(`unexpected table: ${table}`);
      }),
    };

    const result = await readUserProgress(dbClient as unknown as UserProgressDbClient, "user-1");

    expect(result).toEqual({
      data: {
        level: {
          current_level: 1,
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
          leftover_eaten: 0,
        },
        last_updated_at: "2026-06-10T12:00:00.000Z",
      },
      error: null,
    });
    expect(progressSummaryTable.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        total_xp: 0,
        current_level: 1,
      }),
      { onConflict: "user_id" },
    );
  });

  it("adds dedicated progress tables with RLS and integrity constraints", async () => {
    const migration = await readFile(
      "supabase/migrations/20260610120000_33a_user_progress_foundation.sql",
      "utf8",
    );

    expect(migration).toContain("create table if not exists public.user_progress_events");
    expect(migration).toContain("create table if not exists public.user_progress_summary");
    expect(migration).toContain("unique (user_id, event_type, source_key)");
    expect(migration).toContain("check (xp_delta > 0)");
    expect(migration).toContain("alter table public.user_progress_events enable row level security");
    expect(migration).toContain("alter table public.user_progress_summary enable row level security");
    expect(migration).toContain("auth.uid() = user_id");
    expect(migration).toContain("grant all privileges on public.user_progress_events to service_role");
    expect(migration).not.toContain("operational_events");
  });
});
