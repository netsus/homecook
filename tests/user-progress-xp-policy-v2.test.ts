import { readFile } from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import {
  awardUserProgressEvent,
  buildUserProgressEventInsert,
  type UserProgressDbClient,
  USER_PROGRESS_XP_POLICY,
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

describe("user progress XP policy v2", () => {
  it("builds planner first and repeat inserts with source metadata", () => {
    const first = buildUserProgressEventInsert(
      {
        userId: "user-1",
        eventType: "planner_registered",
        sourceTable: "meals",
        sourceId: "meal-1",
        occurredAt: "2026-06-10T01:00:00.000Z",
      },
      { existingEvents: [] },
    );
    const repeat = buildUserProgressEventInsert(
      {
        userId: "user-1",
        eventType: "planner_registered",
        sourceTable: "meals",
        sourceId: "meal-2",
        occurredAt: "2026-06-10T02:00:00.000Z",
      },
      {
        existingEvents: [
          {
            event_type: "planner_registered",
            source_key: "planner_registered:first:user-1",
            xp_delta: 25,
            occurred_at: "2026-06-10T01:00:00.000Z",
            source_meta_json: { xp_kind: "first" },
          },
        ],
      },
    );

    expect(first).toMatchObject({
      event_type: "planner_registered",
      source_key: "planner_registered:first:user-1",
      xp_delta: USER_PROGRESS_XP_POLICY.planner_registered.first,
      source_meta_json: {
        xp_kind: "first",
        level_curve_version: "v2",
      },
    });
    expect(repeat).toMatchObject({
      event_type: "planner_registered",
      source_key: "planner_registered:meal-2",
      xp_delta: USER_PROGRESS_XP_POLICY.planner_registered.repeat,
      source_meta_json: {
        xp_kind: "repeat",
        level_curve_version: "v2",
      },
    });
    expect(repeat.source_meta_json).toMatchObject({
      cap_day_key: "2026-06-10",
      cap_week_key: "2026-W24",
    });
  });

  it("uses repeat XP for recipe, shopping, and cooking after each first source event", () => {
    const recipeRepeat = buildUserProgressEventInsert(
      {
        userId: "user-1",
        eventType: "recipe_saved",
        sourceTable: "recipe_book_items",
        sourceId: "recipe-book-item-2",
        recipeId: "recipe-2",
        occurredAt: "2026-06-10T03:00:00.000Z",
      },
      {
        existingEvents: [
          {
            event_type: "recipe_saved",
            source_key: "recipe_saved:user-1:recipe-1",
            xp_delta: USER_PROGRESS_XP_POLICY.recipe_saved.first,
            occurred_at: "2026-06-10T01:00:00.000Z",
            source_meta_json: { xp_kind: "first" },
          },
        ],
      },
    );
    const shoppingRepeat = buildUserProgressEventInsert(
      {
        userId: "user-1",
        eventType: "shopping_completed",
        sourceTable: "shopping_lists",
        sourceId: "shopping-list-2",
        occurredAt: "2026-06-10T03:00:00.000Z",
      },
      {
        existingEvents: [
          {
            event_type: "shopping_completed",
            source_key: "shopping_completed:shopping-list-1",
            xp_delta: USER_PROGRESS_XP_POLICY.shopping_completed.first,
            occurred_at: "2026-06-10T01:00:00.000Z",
            source_meta_json: { xp_kind: "first" },
          },
        ],
      },
    );
    const cookingRepeat = buildUserProgressEventInsert(
      {
        userId: "user-1",
        eventType: "cooking_completed",
        sourceTable: "leftover_dishes",
        sourceId: "leftover-2",
        occurredAt: "2026-06-10T03:00:00.000Z",
      },
      {
        existingEvents: [
          {
            event_type: "cooking_completed",
            source_key: "cooking_completed:leftover-1",
            xp_delta: USER_PROGRESS_XP_POLICY.cooking_completed.first,
            occurred_at: "2026-06-10T01:00:00.000Z",
            source_meta_json: { xp_kind: "first" },
          },
        ],
      },
    );

    expect(recipeRepeat).toMatchObject({
      xp_delta: USER_PROGRESS_XP_POLICY.recipe_saved.repeat,
      source_meta_json: { xp_kind: "repeat" },
    });
    expect(shoppingRepeat).toMatchObject({
      xp_delta: USER_PROGRESS_XP_POLICY.shopping_completed.repeat,
      source_meta_json: { xp_kind: "repeat" },
    });
    expect(cookingRepeat).toMatchObject({
      xp_delta: USER_PROGRESS_XP_POLICY.cooking_completed.repeat,
      source_meta_json: { xp_kind: "repeat" },
    });
  });

  it("awards first and repeat XP for manually eaten leftovers", () => {
    const first = buildUserProgressEventInsert(
      {
        userId: "user-1",
        eventType: "leftover_eaten",
        sourceTable: "leftover_dishes",
        sourceId: "leftover-1",
        occurredAt: "2026-06-10T01:00:00.000Z",
      },
      { existingEvents: [] },
    );
    const repeat = buildUserProgressEventInsert(
      {
        userId: "user-1",
        eventType: "leftover_eaten",
        sourceTable: "leftover_dishes",
        sourceId: "leftover-2",
        occurredAt: "2026-06-10T02:00:00.000Z",
      },
      {
        existingEvents: [
          {
            event_type: "leftover_eaten",
            source_key: "leftover_eaten:leftover-1",
            xp_delta: USER_PROGRESS_XP_POLICY.leftover_eaten.first,
            occurred_at: "2026-06-10T01:00:00.000Z",
            source_meta_json: { xp_kind: "first" },
          },
        ],
      },
    );

    expect(first).toMatchObject({
      event_type: "leftover_eaten",
      source_key: "leftover_eaten:leftover-1",
      xp_delta: USER_PROGRESS_XP_POLICY.leftover_eaten.first,
      source_meta_json: {
        xp_kind: "first",
        level_curve_version: "v2",
      },
    });
    expect(repeat).toMatchObject({
      event_type: "leftover_eaten",
      source_key: "leftover_eaten:leftover-2",
      xp_delta: USER_PROGRESS_XP_POLICY.leftover_eaten.repeat,
      source_meta_json: {
        xp_kind: "repeat",
        level_curve_version: "v2",
      },
    });
  });

  it("does not create a ledger row when planner daily repeat cap is exceeded", async () => {
    const existingEvents = [
      {
        event_type: "planner_registered",
        source_key: "planner_registered:first:user-1",
        xp_delta: 25,
        occurred_at: "2026-06-10T00:30:00.000Z",
        source_meta_json: { xp_kind: "first" },
      },
      ...[1, 2, 3].map((index) => ({
        event_type: "planner_registered",
        source_key: `planner_registered:meal-${index}`,
        xp_delta: 5,
        occurred_at: `2026-06-10T0${index}:00:00.000Z`,
        source_meta_json: {
          xp_kind: "repeat",
          cap_day_key: "2026-06-10",
          cap_week_key: "2026-W24",
        },
      })),
    ];
    const progressEventsTable = {
      select: vi.fn(() => createArraySelectQuery({ data: existingEvents, error: null })),
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "event-1" }, error: null })),
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
      sourceId: "meal-4",
      occurredAt: "2026-06-10T05:00:00.000Z",
    });

    expect(result).toMatchObject({ awarded: false, duplicate: false, error: null });
    expect(progressEventsTable.insert).not.toHaveBeenCalled();
    expect(progressSummaryTable.upsert).not.toHaveBeenCalled();
  });

  it("does not create a ledger row when custom book daily repeat cap is exceeded", async () => {
    const existingEvents = [
      {
        event_type: "custom_book_created",
        source_key: "custom_book_created:book-first",
        xp_delta: 25,
        occurred_at: "2026-06-10T00:30:00.000Z",
        source_meta_json: { xp_kind: "first" },
      },
      ...[1, 2].map((index) => ({
        event_type: "custom_book_created",
        source_key: `custom_book_created:book-repeat-${index}`,
        xp_delta: 10,
        occurred_at: `2026-06-10T0${index}:00:00.000Z`,
        source_meta_json: {
          xp_kind: "repeat",
          cap_day_key: "2026-06-10",
          cap_week_key: "2026-W24",
        },
      })),
    ];
    const progressEventsTable = {
      select: vi.fn(() => createArraySelectQuery({ data: existingEvents, error: null })),
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "event-1" }, error: null })),
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
      eventType: "custom_book_created",
      sourceTable: "recipe_books",
      sourceId: "book-repeat-3",
      occurredAt: "2026-06-10T05:00:00.000Z",
    });

    expect(result).toMatchObject({ awarded: false, duplicate: false, error: null });
    expect(progressEventsTable.insert).not.toHaveBeenCalled();
    expect(progressSummaryTable.upsert).not.toHaveBeenCalled();
  });

  it("does not create a ledger row when planner weekly repeat cap is exceeded", async () => {
    const existingEvents = [
      {
        event_type: "planner_registered",
        source_key: "planner_registered:first:user-1",
        xp_delta: 25,
        occurred_at: "2026-06-08T00:30:00.000Z",
        source_meta_json: { xp_kind: "first" },
      },
      ...Array.from({ length: 12 }, (_, index) => {
        const day = 8 + Math.floor(index / 3);
        const hour = 1 + (index % 3);

        return {
          event_type: "planner_registered",
          source_key: `planner_registered:meal-week-${index + 1}`,
          xp_delta: 5,
          occurred_at: `2026-06-${String(day).padStart(2, "0")}T0${hour}:00:00.000Z`,
          source_meta_json: {
            xp_kind: "repeat",
            cap_day_key: `2026-06-${String(day).padStart(2, "0")}`,
            cap_week_key: "2026-W24",
          },
        };
      }),
    ];
    const progressEventsTable = {
      select: vi.fn(() => createArraySelectQuery({ data: existingEvents, error: null })),
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "event-1" }, error: null })),
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
      sourceId: "meal-week-13",
      occurredAt: "2026-06-12T01:00:00.000Z",
    });

    expect(result).toMatchObject({ awarded: false, duplicate: false, error: null });
    expect(progressEventsTable.insert).not.toHaveBeenCalled();
    expect(progressSummaryTable.upsert).not.toHaveBeenCalled();
  });

  it("allows planner repeat XP after the KST week cap resets", async () => {
    const existingEvents = [
      {
        event_type: "planner_registered",
        source_key: "planner_registered:first:user-1",
        xp_delta: 25,
        occurred_at: "2026-06-08T00:30:00.000Z",
        source_meta_json: { xp_kind: "first" },
      },
      ...Array.from({ length: 12 }, (_, index) => ({
        event_type: "planner_registered",
        source_key: `planner_registered:meal-week-${index + 1}`,
        xp_delta: 5,
        occurred_at: `2026-06-${String(8 + Math.floor(index / 3)).padStart(2, "0")}T01:00:00.000Z`,
        source_meta_json: {
          xp_kind: "repeat",
          cap_day_key: `2026-06-${String(8 + Math.floor(index / 3)).padStart(2, "0")}`,
          cap_week_key: "2026-W24",
        },
      })),
    ];
    const nextWeekEvent = {
      event_type: "planner_registered",
      source_key: "planner_registered:meal-week-reset",
      xp_delta: 5,
      occurred_at: "2026-06-14T15:01:00.000Z",
      source_meta_json: {
        xp_kind: "repeat",
        cap_day_key: "2026-06-15",
        cap_week_key: "2026-W25",
      },
    };
    const progressEventsTable = {
      select: vi
        .fn()
        .mockReturnValueOnce(createArraySelectQuery({ data: existingEvents, error: null }))
        .mockReturnValueOnce(createArraySelectQuery({
          data: [...existingEvents, nextWeekEvent],
          error: null,
        })),
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "event-week-reset" }, error: null })),
    };
    const progressSummaryTable = {
      upsert: vi.fn(() => createMaybeSingleQuery({
        data: {
          user_id: "user-1",
          total_xp: 90,
          current_level: 1,
          level_curve_version: "v2",
          event_counts: {
            cooking_completed: 0,
            shopping_completed: 0,
            recipe_saved_distinct_ever: 0,
            custom_book_created: 0,
            planner_registered_first: 1,
            planner_registered_repeat: 13,
          },
          last_event_at: "2026-06-14T15:01:00.000Z",
          last_updated_at: "2026-06-14T15:01:00.000Z",
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
      eventType: "planner_registered",
      sourceTable: "meals",
      sourceId: "meal-week-reset",
      occurredAt: "2026-06-14T15:01:00.000Z",
    });

    expect(result).toMatchObject({ awarded: true, duplicate: false, error: null });
    expect(progressEventsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      source_key: "planner_registered:meal-week-reset",
      xp_delta: USER_PROGRESS_XP_POLICY.planner_registered.repeat,
      source_meta_json: {
        xp_kind: "repeat",
        level_curve_version: "v2",
        cap_day_key: "2026-06-15",
        cap_week_key: "2026-W25",
      },
    }));
  });

  it("allows planner repeat XP after the KST day cap resets", async () => {
    const existingEvents = [
      {
        event_type: "planner_registered",
        source_key: "planner_registered:first:user-1",
        xp_delta: 25,
        occurred_at: "2026-06-10T00:30:00.000Z",
        source_meta_json: { xp_kind: "first" },
      },
      ...[1, 2, 3].map((index) => ({
        event_type: "planner_registered",
        source_key: `planner_registered:meal-day-${index}`,
        xp_delta: 5,
        occurred_at: `2026-06-10T0${index}:00:00.000Z`,
        source_meta_json: {
          xp_kind: "repeat",
          cap_day_key: "2026-06-10",
          cap_week_key: "2026-W24",
        },
      })),
    ];
    const progressEventsTable = {
      select: vi.fn(() => createArraySelectQuery({ data: existingEvents, error: null })),
      insert: vi.fn(() => createMaybeSingleQuery({ data: { id: "event-next-day" }, error: null })),
    };
    const progressSummaryTable = {
      upsert: vi.fn(() => createMaybeSingleQuery({
        data: {
          user_id: "user-1",
          total_xp: 45,
          current_level: 1,
          level_curve_version: "v2",
          event_counts: {
            cooking_completed: 0,
            shopping_completed: 0,
            recipe_saved_distinct_ever: 0,
            custom_book_created: 0,
            planner_registered_first: 1,
            planner_registered_repeat: 4,
          },
          last_event_at: "2026-06-10T15:01:00.000Z",
          last_updated_at: "2026-06-10T15:01:00.000Z",
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
      eventType: "planner_registered",
      sourceTable: "meals",
      sourceId: "meal-next-day",
      occurredAt: "2026-06-10T15:01:00.000Z",
    });

    expect(result).toMatchObject({ awarded: true, duplicate: false, error: null });
    expect(progressEventsTable.insert).toHaveBeenCalledWith(expect.objectContaining({
      source_key: "planner_registered:meal-next-day",
      xp_delta: USER_PROGRESS_XP_POLICY.planner_registered.repeat,
      source_meta_json: {
        xp_kind: "repeat",
        level_curve_version: "v2",
        cap_day_key: "2026-06-11",
        cap_week_key: "2026-W24",
      },
    }));
  });

  it("adds 34b progress and notification migration fields", async () => {
    const migration = await readFile(
      "supabase/migrations/20260611152000_34b_growth_backend_model.sql",
      "utf8",
    );
    const leftoverProgressMigration = await readFile(
      "supabase/migrations/20260615090000_35c_leftover_eaten_progress_event.sql",
      "utf8",
    );

    expect(migration).toContain("add column if not exists source_meta_json");
    expect(migration).toContain("'planner_registered'");
    expect(leftoverProgressMigration).toContain("'leftover_eaten'");
    expect(migration).toContain("add column if not exists level_curve_version");
    expect(migration).toContain("'level_up'");
    expect(migration).toContain("add column if not exists priority");
    expect(migration).toContain("add column if not exists delivery_channel");
    expect(migration).toContain("add column if not exists toast_eligible");
    expect(migration).toContain("add column if not exists group_key");
  });
});
