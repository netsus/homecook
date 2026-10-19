import { describe, expect, expectTypeOf, it, vi } from "vitest";
import { awardUserProgressEvent, type UserProgressDbClient, type UserProgressEventRow } from "@/lib/server/user-progress";
import { recordUserGrowthActivityEvent, type UserGrowthActivityDbClient } from "@/lib/server/user-growth-activity";
import type {
  UserGamificationDbClient, UserAchievementAwardRow, UserBadgeAwardRow,
  UserQuestProgressRow, UserGrowthActivityEventRow, UserProgressNotificationRow,
} from "@/lib/server/user-gamification";

const now = "2026-06-10T10:00:00.000Z";
type ErrorRow = { code?: string; message: string };
type Summary = {
  user_id: string; total_xp: number; current_level: number; level_curve_version?: "v1" | "v2";
  event_counts: unknown; last_event_at: string | null; last_updated_at: string;
};
function query<Row>(read: () => Row[], error: () => ErrorRow | null = () => null) {
  const result = () => ({ data: read(), error: error() });
  const q = {
    select: vi.fn((columns: string) => { void columns; return q; }),
    eq: vi.fn((column: string, value: string | boolean) => { void column; void value; return q; }),
    match: vi.fn((filters: { user_id: string }) => { void filters; return q; }),
    in: vi.fn((column: string, values: string[]) => { void column; void values; return q; }),
    is: vi.fn((column: string, value: null) => { void column; void value; return q; }),
    lt: vi.fn((column: string, value: string) => { void column; void value; return q; }),
    or: vi.fn((expression: string) => { void expression; return q; }),
    order: vi.fn((column: string, options: { ascending: boolean }) => { void column; void options; return q; }),
    limit: vi.fn((count: number) => { void count; return q; }),
    maybeSingle: vi.fn(async () => ({ data: read()[0] ?? null, error: error() })),
    then<TResult1 = ReturnType<typeof result>, TResult2 = never>(
      fulfilled?: ((value: ReturnType<typeof result>) => TResult1 | PromiseLike<TResult1>) | null,
      rejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) { return Promise.resolve(result()).then(fulfilled, rejected); },
  };
  return q;
}

// A typed consumer-protocol fixture, not an SDK/DB/RLS simulator.
// Every table capability is checked by direct assignment below; no blanket cast.
function fullFixture(options: { failProjection?: boolean; throwProjection?: boolean; duplicateActivity?: boolean } = {}) {
  const events: UserProgressEventRow[] = [];
  const activities: UserGrowthActivityEventRow[] = Array.from({ length: 9 }, (_, i) => ({
    activity_type: "pantry_item_added", source_id: `ingredient-${i}`,
    source_meta_json: { ingredient_id: `ingredient-${i}` },
  }));
  const summary: Summary = {
    user_id: "user-1", total_xp: 60, current_level: 1, level_curve_version: "v2",
    event_counts: { cooking_completed: 1 }, last_event_at: now, last_updated_at: now,
  };
  const projectionError = () => options.failProjection ? { code: "42501", message: "projection denied" } : null;
  const countTable = {
    select: vi.fn((columns: string, options: { count: "exact"; head: true }) => {
      void columns; void options;
      const q = {
        eq: vi.fn((column: string, value: string) => { void column; void value; return q; }),
        in: vi.fn((column: string, values: string[]) => { void column; void values; return q; }),
        then<TResult1 = { data: null; error: null; count: number }, TResult2 = never>(
          fulfilled?: ((value: { data: null; error: null; count: number }) => TResult1 | PromiseLike<TResult1>) | null,
          rejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ) { return Promise.resolve({ data: null, error: null, count: 0 }).then(fulfilled, rejected); },
      };
      return q;
    }),
  };
  const tables = {
    user_progress_events: {
      select: vi.fn((columns: string) => { void columns; return query(() => events); }),
      insert: vi.fn((row: UserProgressEventRow) => {
        events.push(row);
        return query(() => [{ id: "progress-1", ...row }]);
      }),
    },
    user_progress_summary: {
      select: vi.fn((columns: string) => { void columns; return query(() => [summary]); }),
      upsert: vi.fn((row: Summary, options: { onConflict: "user_id" }) => {
        void options; return query(() => [row]);
      }),
    },
    user_growth_activity_events: {
      select: vi.fn((columns: string) => { void columns; return query(() => activities); }),
      insert: vi.fn((row: UserGrowthActivityEventRow) => {
        if (!options.duplicateActivity) activities.push(row);
        return query(() => [{ id: "activity-1" }], () => options.duplicateActivity ? { code: "23505", message: "duplicate" } : null);
      }),
    },
    user_achievement_awards: {
      select: vi.fn((columns: string) => { void columns; return query<UserAchievementAwardRow>(() => [], projectionError); }),
      insert: vi.fn((row: Omit<UserAchievementAwardRow, "seen_at">) => query(() => [{ ...row, seen_at: null }])),
      update: vi.fn((values: { seen_at: string }) => { void values; return query<UserAchievementAwardRow>(() => []); }),
    },
    user_badge_awards: {
      select: vi.fn((columns: string) => { void columns; return query<UserBadgeAwardRow>(() => []); }),
      insert: vi.fn((row: Omit<UserBadgeAwardRow, "seen_at">) => query(() => [{ ...row, seen_at: null }])),
      update: vi.fn((values: { seen_at: string }) => { void values; return query<UserBadgeAwardRow>(() => []); }),
    },
    user_quest_progress: {
      select: vi.fn((columns: string) => { void columns; return query<UserQuestProgressRow>(() => []); }),
      upsert: vi.fn((row: Omit<UserQuestProgressRow, "seen_at">, options: { onConflict: "user_id,quest_key" }) => {
        void options; return query(() => [{ ...row, seen_at: null }]);
      }),
    },
    user_progress_notifications: {
      select: vi.fn((columns: string) => { void columns; return query<UserProgressNotificationRow>(() => []); }),
      insert: vi.fn((row: Omit<UserProgressNotificationRow, "id" | "seen_at"> & { notification_key: string; source_event_id: string | null }) => {
        void row;
        if (options.throwProjection) throw new Error("projection unavailable");
        return query(() => [{ id: "notification-1" }], projectionError);
      }),
      update: vi.fn((values: { seen_at: string }) => { void values; return query<UserProgressNotificationRow>(() => []); }),
    },
    shopping_lists: countTable,
    recipes: countTable,
  };
  const client: UserProgressDbClient & UserGamificationDbClient & UserGrowthActivityDbClient = {
    from<Table extends keyof typeof tables>(table: Table): (typeof tables)[Table] { return tables[table]; },
  };
  return { client, tables };
}

const award = {
  userId: "user-1", eventType: "cooking_completed", sourceTable: "leftover_dishes",
  sourceId: "cook-1", occurredAt: now,
} as const;
const activity = {
  userId: "user-1", activityType: "pantry_item_added", category: "pantry",
  sourceKey: "pantry_item_added:ingredient-9", sourceTable: "pantry_items",
  sourceId: "ingredient-9", sourceMeta: { ingredient_id: "ingredient-9" }, occurredAt: now,
} as const;

describe("progress/activity projection capability", () => {
  it("declares the projection capabilities already invoked by each writer", () => {
    expectTypeOf<Parameters<typeof awardUserProgressEvent>[0]>().toMatchTypeOf<UserGamificationDbClient>();
    expectTypeOf<Parameters<typeof recordUserGrowthActivityEvent>[0]>().toMatchTypeOf<UserGamificationDbClient & UserProgressDbClient>();
  });

  it("reaches notification, achievement, badge and quest writes after the canonical XP event", async () => {
    const { client, tables } = fullFixture();
    const result = await awardUserProgressEvent(client, award);
    expect(result).toMatchObject({ awarded: true, duplicate: false, error: null, summary: { event_counts: { cooking_completed: 1 } } });
    expect(tables.user_progress_events.insert).toHaveBeenCalledOnce();
    expect(tables.user_progress_summary.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-1", total_xp: 60 }), { onConflict: "user_id" });
    expect(tables.user_progress_notifications.insert).toHaveBeenCalledWith(expect.objectContaining({
      notification_key: "xp-toast:progress-1", source_event_id: "progress-1",
      notification_type: "xp_awarded", payload_json: expect.objectContaining({ event_type: "cooking_completed", xp_delta: 60 }),
    }));
    expect(tables.user_achievement_awards.insert).toHaveBeenCalledWith(expect.objectContaining({ achievement_key: "tutorial_cooking_complete", source_event_id: "progress-1" }));
    expect(tables.user_badge_awards.insert).toHaveBeenCalledWith(expect.objectContaining({ badge_key: "first_cook_done", source_event_id: "progress-1" }));
    expect(tables.user_quest_progress.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-1", source_event_id: "progress-1" }), { onConflict: "user_id,quest_key" });
    const writes = tables.user_progress_notifications.insert.mock.calls.length;
    expect(await awardUserProgressEvent(client, award)).toMatchObject({ awarded: false, duplicate: true, error: null });
    expect(tables.user_progress_events.insert).toHaveBeenCalledOnce();
    expect(tables.user_progress_notifications.insert).toHaveBeenCalledTimes(writes);
  });

  it("reads existing progress and activity metrics before the activity achievement projection", async () => {
    const { client, tables } = fullFixture();
    expect(await recordUserGrowthActivityEvent(client, activity)).toEqual({ recorded: true, duplicate: false, error: null });
    expect(tables.user_growth_activity_events.select).toHaveBeenCalledWith("activity_type, source_id, source_meta_json");
    expect(tables.user_progress_summary.select).toHaveBeenCalledOnce();
    expect(tables.shopping_lists.select).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(tables.user_achievement_awards.insert).toHaveBeenCalledWith(expect.objectContaining({ category_key: "pantry", achieved_value: 10, source_activity_id: "activity-1" }));
    expect(tables.user_progress_notifications.insert).toHaveBeenCalledWith(expect.objectContaining({ notification_type: "achievement_unlocked", group_key: "growth-activity:activity-1" }));
    expect(tables.user_badge_awards.insert).toHaveBeenCalledWith(expect.objectContaining({ badge_key: "first_cook_done" }));
    expect(tables.user_quest_progress.upsert).toHaveBeenCalled();
  });

  it.each([{ failProjection: true }, { throwProjection: true }])("retains canonical XP success when projection fails: %j", async (options) => {
    const { client, tables } = fullFixture(options);
    expect(await awardUserProgressEvent(client, award)).toMatchObject({ awarded: true, duplicate: false, error: null });
    expect(tables.user_progress_notifications.insert).toHaveBeenCalledOnce();
    expect(tables.user_progress_events.insert).toHaveBeenCalledOnce();
    expect(tables.user_quest_progress.upsert).not.toHaveBeenCalled();
  });

  it("retains activity success after a projection read failure", async () => {
    const { client, tables } = fullFixture({ failProjection: true });
    expect(await recordUserGrowthActivityEvent(client, activity)).toEqual({ recorded: true, duplicate: false, error: null });
    expect(tables.user_achievement_awards.select).toHaveBeenCalledOnce();
    expect(tables.user_achievement_awards.insert).not.toHaveBeenCalled();
    expect(tables.user_quest_progress.upsert).not.toHaveBeenCalled();
  });

  it("does not read progress or project after a duplicate activity insert", async () => {
    const { client, tables } = fullFixture({ duplicateActivity: true });
    expect(await recordUserGrowthActivityEvent(client, activity)).toEqual({ recorded: false, duplicate: true, error: null });
    expect(tables.user_progress_summary.select).not.toHaveBeenCalled();
    expect(tables.user_progress_notifications.insert).not.toHaveBeenCalled();
  });
});
