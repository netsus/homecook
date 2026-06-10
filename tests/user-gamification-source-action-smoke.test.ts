import { describe, expect, it, vi } from "vitest";

import {
  awardUserProgressEvent,
  type UserProgressDbClient,
  USER_PROGRESS_XP_AWARDS,
} from "@/lib/server/user-progress";

function createMaybeSingleQuery<T>(data: T | null, error: { message: string; code?: string } | null = null) {
  return {
    select: vi.fn(() => ({
      maybeSingle: vi.fn(async () => ({ data, error })),
    })),
  };
}

function createArrayQuery<T>(data: T[]) {
  const query = {
    eq: vi.fn(() => query),
    then(onFulfilled?: (value: { data: T[]; error: null }) => unknown) {
      return Promise.resolve({ data, error: null }).then(onFulfilled);
    },
  };

  return query;
}

describe("source action gamification smoke", () => {
  it("keeps canonical source actions successful when the 33c outbox is unavailable", async () => {
    const dbClient = {
      from: vi.fn((table: string) => {
        if (table === "user_progress_events") {
          return {
            insert: vi.fn(() => createMaybeSingleQuery({ id: "event-1" })),
            select: vi.fn(() =>
              createArrayQuery([
                {
                  event_type: "recipe_saved",
                  source_key: "recipe_saved:user-1:550e8400-e29b-41d4-a716-446655440010",
                  xp_delta: USER_PROGRESS_XP_AWARDS.recipe_saved,
                  occurred_at: "2026-06-10T12:00:00.000Z",
                },
              ]),
            ),
          };
        }

        if (table === "user_progress_summary") {
          return {
            upsert: vi.fn(() =>
              createMaybeSingleQuery({
                user_id: "user-1",
                total_xp: USER_PROGRESS_XP_AWARDS.recipe_saved,
                current_level: 1,
                event_counts: {
                  cooking_completed: 0,
                  shopping_completed: 0,
                  recipe_saved_distinct_ever: 1,
                  custom_book_created: 0,
                },
                last_event_at: "2026-06-10T12:00:00.000Z",
                last_updated_at: "2026-06-10T12:00:01.000Z",
              }),
            ),
          };
        }

        throw new Error("33c projection table is temporarily unavailable");
      }),
    };

    const result = await awardUserProgressEvent(dbClient as unknown as UserProgressDbClient, {
      userId: "user-1",
      eventType: "recipe_saved",
      sourceTable: "recipe_book_items",
      sourceId: "550e8400-e29b-41d4-a716-446655440011",
      recipeId: "550e8400-e29b-41d4-a716-446655440010",
      occurredAt: "2026-06-10T12:00:00.000Z",
    });

    expect(result).toMatchObject({
      awarded: true,
      duplicate: false,
      error: null,
      summary: {
        event_counts: {
          recipe_saved_distinct_ever: 1,
        },
      },
    });
  });
});
