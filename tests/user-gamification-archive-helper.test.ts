import { describe, expect, it, vi } from "vitest";

import {
  decodeArchiveCursor,
  readUserGamificationArchive,
  type UserGamificationDbClient,
  type UserProgressNotificationRow,
} from "@/lib/server/user-gamification";

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

function createArchiveQuery(result: QueryResult<UserProgressNotificationRow[]>) {
  const query = {
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    lt: vi.fn(() => query),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    then(
      onFulfilled?: (value: QueryResult<UserProgressNotificationRow[]>) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };

  return query;
}

describe("readUserGamificationArchive", () => {
  it("uses limit+1 pagination, excludes silent delivery rows by query, and round-trips the cursor", async () => {
    const rows: UserProgressNotificationRow[] = [
      {
        id: "550e8400-e29b-41d4-a716-446655440003",
        notification_type: "xp_awarded",
        priority: 4,
        delivery_channel: "toast",
        toast_eligible: true,
        group_key: "progress-event:e3",
        payload_json: { event_type: "recipe_saved", xp_delta: 8, label: "레시피 저장" },
        created_at: "2026-06-10T12:00:00.000Z",
        seen_at: null,
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440002",
        notification_type: "badge_unlocked",
        priority: 2,
        delivery_channel: "archive_only",
        toast_eligible: false,
        group_key: "progress-event:e2",
        payload_json: { badge_key: "first_recipe_saved", label: "첫 레시피 저장" },
        created_at: "2026-06-10T11:00:00.000Z",
        seen_at: "2026-06-10T11:30:00.000Z",
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440001",
        notification_type: "xp_awarded",
        priority: 4,
        delivery_channel: "toast",
        toast_eligible: true,
        group_key: "progress-event:e1",
        payload_json: { event_type: "shopping_completed", xp_delta: 25, label: "장보기 완료" },
        created_at: "2026-06-10T10:00:00.000Z",
        seen_at: null,
      },
    ];
    const query = createArchiveQuery({ data: rows, error: null });
    const dbClient = {
      from: vi.fn((tableName: string) => {
        if (tableName === "user_progress_notifications") {
          return { select: vi.fn(() => query) };
        }
        throw new Error(`unexpected table: ${tableName}`);
      }),
    };

    const result = await readUserGamificationArchive(
      dbClient as unknown as UserGamificationDbClient,
      "user-1",
      { limit: 2, cursor: null },
    );

    expect(result.error).toBeNull();
    expect(result.data?.items.map((item) => item.id)).toEqual([
      "550e8400-e29b-41d4-a716-446655440003",
      "550e8400-e29b-41d4-a716-446655440002",
    ]);
    expect(result.data?.has_next).toBe(true);
    expect(decodeArchiveCursor(result.data?.next_cursor ?? "")).toEqual({
      createdAt: "2026-06-10T11:00:00.000Z",
      id: "550e8400-e29b-41d4-a716-446655440002",
    });
    expect(query.in).toHaveBeenCalledWith("delivery_channel", ["toast", "archive_only"]);
    expect(query.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(query.order).toHaveBeenCalledWith("id", { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(3);
  });

  it("applies the archive cursor predicate when a cursor is supplied", async () => {
    const cursor = Buffer.from(
      "2026-06-10T11:00:00.000Z|550e8400-e29b-41d4-a716-446655440002",
      "utf8",
    ).toString("base64url");
    const query = createArchiveQuery({ data: [], error: null });
    const dbClient = {
      from: vi.fn((tableName: string) => {
        if (tableName === "user_progress_notifications") {
          return { select: vi.fn(() => query) };
        }
        throw new Error(`unexpected table: ${tableName}`);
      }),
    };

    const result = await readUserGamificationArchive(
      dbClient as unknown as UserGamificationDbClient,
      "user-1",
      { limit: 20, cursor },
    );

    expect(result.error).toBeNull();
    expect(query.or).toHaveBeenCalledWith(
      "created_at.lt.2026-06-10T11:00:00.000Z,and(created_at.eq.2026-06-10T11:00:00.000Z,id.lt.550e8400-e29b-41d4-a716-446655440002)",
    );
  });
});
