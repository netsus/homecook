import { describe, expect, it } from "vitest";

import {
  buildLowerBoundUserProgressBackfillEvents,
  buildUserProgressSummary,
  calculateUserProgressLevel,
  USER_PROGRESS_XP_AWARDS,
} from "@/lib/server/user-progress";

describe("user progress level calculation", () => {
  it.each([
    {
      totalXp: 0,
      expected: {
        current_level: 1,
        total_xp: 0,
        current_level_start_xp: 0,
        next_level_start_xp: 100,
        xp_into_current_level: 0,
        xp_to_next_level: 100,
        progress_ratio: 0,
        progress_percent: 0,
      },
    },
    {
      totalXp: 99,
      expected: {
        current_level: 1,
        total_xp: 99,
        current_level_start_xp: 0,
        next_level_start_xp: 100,
        xp_into_current_level: 99,
        xp_to_next_level: 1,
        progress_ratio: 0.99,
        progress_percent: 99,
      },
    },
    {
      totalXp: 100,
      expected: {
        current_level: 2,
        total_xp: 100,
        current_level_start_xp: 100,
        next_level_start_xp: 300,
        xp_into_current_level: 0,
        xp_to_next_level: 200,
        progress_ratio: 0,
        progress_percent: 0,
      },
    },
    {
      totalXp: 420,
      expected: {
        current_level: 3,
        total_xp: 420,
        current_level_start_xp: 300,
        next_level_start_xp: 600,
        xp_into_current_level: 120,
        xp_to_next_level: 180,
        progress_ratio: 0.4,
        progress_percent: 40,
      },
    },
    {
      totalXp: 600,
      expected: {
        current_level: 4,
        total_xp: 600,
        current_level_start_xp: 600,
        next_level_start_xp: 1000,
        xp_into_current_level: 0,
        xp_to_next_level: 400,
        progress_ratio: 0,
        progress_percent: 0,
      },
    },
  ])("maps $totalXp XP to the server-authority level curve", ({ totalXp, expected }) => {
    expect(calculateUserProgressLevel(totalXp)).toEqual(expected);
  });

  it("builds a summary from ledger rows, not current source-table membership counts", () => {
    const summary = buildUserProgressSummary({
      userId: "user-1",
      events: [
        {
          event_type: "recipe_saved",
          source_key: "recipe_saved:user-1:recipe-1",
          xp_delta: USER_PROGRESS_XP_AWARDS.recipe_saved,
          occurred_at: "2026-06-10T10:00:00.000Z",
        },
        {
          event_type: "recipe_saved",
          source_key: "recipe_saved:user-1:recipe-2",
          xp_delta: USER_PROGRESS_XP_AWARDS.recipe_saved,
          occurred_at: "2026-06-10T11:00:00.000Z",
        },
        {
          event_type: "cooking_completed",
          source_key: "cooking_completed:550e8400-e29b-41d4-a716-446655440501",
          xp_delta: USER_PROGRESS_XP_AWARDS.cooking_completed,
          occurred_at: "2026-06-10T12:00:00.000Z",
        },
      ],
      now: "2026-06-10T12:30:00.000Z",
    });

    expect(summary).toMatchObject({
      user_id: "user-1",
      total_xp: 70,
      current_level: 1,
      event_counts: {
        cooking_completed: 1,
        shopping_completed: 0,
        recipe_saved_distinct_ever: 2,
        custom_book_created: 0,
      },
      last_event_at: "2026-06-10T12:00:00.000Z",
      last_updated_at: "2026-06-10T12:30:00.000Z",
    });
  });

  it("creates survivor-only lower-bound backfill drafts from supplied surviving rows", () => {
    const drafts = buildLowerBoundUserProgressBackfillEvents({
      userId: "user-1",
      rows: {
        leftoverDishes: [
          {
            id: "550e8400-e29b-41d4-a716-446655440501",
            cooked_at: "2026-06-09T10:00:00.000Z",
          },
        ],
        completedShoppingLists: [],
        savedRecipeMemberships: [
          {
            recipe_id: "550e8400-e29b-41d4-a716-446655440601",
            recipe_book_item_id: "550e8400-e29b-41d4-a716-446655440701",
            created_at: "2026-06-09T11:00:00.000Z",
          },
        ],
        customRecipeBooks: [],
      },
    });

    expect(drafts).toEqual([
      {
        userId: "user-1",
        eventType: "cooking_completed",
        sourceTable: "leftover_dishes",
        sourceId: "550e8400-e29b-41d4-a716-446655440501",
        occurredAt: "2026-06-09T10:00:00.000Z",
      },
      {
        userId: "user-1",
        eventType: "recipe_saved",
        sourceTable: "recipe_book_items",
        sourceId: "550e8400-e29b-41d4-a716-446655440701",
        recipeId: "550e8400-e29b-41d4-a716-446655440601",
        occurredAt: "2026-06-09T11:00:00.000Z",
      },
    ]);
  });
});
