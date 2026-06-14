import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  buildUserGamificationData,
  USER_ACHIEVEMENT_CATEGORIES,
  USER_ACHIEVEMENT_DEFINITIONS,
  USER_QUEST_DEFINITIONS,
} from "@/lib/server/user-gamification";
import type { UserProgressData } from "@/types/user-progress";

const NOW = "2026-06-13T10:00:00.000Z";

function buildProgress(overrides: Partial<UserProgressData> = {}): UserProgressData {
  return {
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
    },
    last_updated_at: NOW,
    ...overrides,
  };
}

describe("user achievement album policy", () => {
  it("defines tutorial-only quests and long-term achievement categories", () => {
    expect(USER_QUEST_DEFINITIONS.every((quest) => quest.quest_type === "tutorial")).toBe(true);
    expect(USER_QUEST_DEFINITIONS.map((quest) => quest.quest_key)).toEqual([
      "first_recipe_saved",
      "first_planner_registered",
      "first_shopping_list_created",
      "first_shopping_done",
      "first_cook_done",
      "first_custom_book_created",
    ]);
    expect(USER_QUEST_DEFINITIONS.find((quest) => quest.quest_key === "first_shopping_list_created")).toMatchObject({
      metric: "shopping_list_created",
    });

    expect(USER_ACHIEVEMENT_CATEGORIES.map((category) => category.category_key)).toEqual([
      "tutorial",
      "recipe",
      "planner",
      "shopping",
      "cooking",
      "pantry",
      "leftovers",
      "recipebook",
    ]);
    expect(USER_ACHIEVEMENT_DEFINITIONS
      .filter((definition) => definition.category_key === "tutorial")
      .map((definition) => definition.achievement_key)).toEqual([
        "tutorial_recipe_saved",
        "tutorial_planner_registered",
        "tutorial_shopping_list_create",
        "tutorial_shopping_list_complete",
        "tutorial_cooking_complete",
        "tutorial_recipebook_created",
        "tutorial_complete",
      ]);
  });

  it("projects new-user grade, tutorial summary, and first active tutorial stamp", () => {
    const data = buildUserGamificationData({
      progress: buildProgress(),
      badgeRows: [],
      questRows: [],
      achievementRows: [],
      activityRows: [],
      achievementCounts: {
        pantry_distinct_ingredients: 0,
        leftover_eaten_manual: 0,
        recipe_registered: 0,
        shopping_list_created: 0,
      },
      notificationRows: [],
    });

    expect(data.grade).toMatchObject({
      grade_key: "clay",
      label: "Clay",
      icon_url: "/assets/growth/grades/clay-spoon-badge.png",
      character_url: "/assets/growth/grades/clay-spoon.png",
    });
    expect(data.tutorial).toMatchObject({
      category_key: "tutorial",
      completed_count: 0,
      total_count: 7,
    });
    expect(data.tutorial.active_steps[0]).toMatchObject({
      achievement_key: "tutorial_recipe_saved",
      current: 0,
      target: 1,
      status: "active",
    });
    expect(data.achievement_album.summary).toMatchObject({
      earned_count: 0,
      completed_category_count: 0,
    });
  });

  it("separates recipe saved, recipe registered, shopping created, and shopping completed counts", () => {
    const data = buildUserGamificationData({
      progress: buildProgress({
        event_counts: {
          cooking_completed: 3,
          shopping_completed: 1,
          recipe_saved_distinct_ever: 5,
          custom_book_created: 1,
          planner_registered_first: 1,
          planner_registered_repeat: 2,
        },
      }),
      badgeRows: [],
      questRows: [],
      achievementRows: [
        {
          achievement_key: "recipe_saved_5",
          category_key: "recipe",
          track_key: "recipe_saved",
          target_value: 5,
          achieved_value: 5,
          badge_key: "recipe_saved_5",
          earned_at: NOW,
          seen_at: null,
        },
      ],
      activityRows: [],
      achievementCounts: {
        pantry_distinct_ingredients: 0,
        leftover_eaten_manual: 0,
        recipe_registered: 2,
        shopping_list_created: 4,
      },
      notificationRows: [],
    });

    const recipeCategory = data.achievement_album.categories.find(
      (category) => category.category_key === "recipe",
    );
    const tutorialCategory = data.achievement_album.categories.find(
      (category) => category.category_key === "tutorial",
    );
    const shoppingCategory = data.achievement_album.categories.find(
      (category) => category.category_key === "shopping",
    );

    expect(recipeCategory?.milestones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          achievement_key: "recipe_saved_5",
          track_key: "recipe_saved",
          current: 5,
          target: 5,
          status: "earned",
        }),
        expect.objectContaining({
          achievement_key: "recipe_registered_3",
          track_key: "recipe_registered",
          current: 2,
          target: 3,
          status: "active",
        }),
      ]),
    );
    expect(tutorialCategory?.milestones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          achievement_key: "tutorial_shopping_list_create",
          current: 4,
          target: 1,
        }),
      ]),
    );
    expect(shoppingCategory?.milestones).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          achievement_key: "shopping_completed_3",
          current: 1,
          target: 3,
          status: "active",
        }),
      ]),
    );
  });

  it("keeps long-term achievement thresholds beyond tutorial one-shot milestones and progressively harder", () => {
    const definitionsByTrack = USER_ACHIEVEMENT_DEFINITIONS
      .filter((definition) => definition.category_key !== "tutorial")
      .reduce<Map<string, number[]>>((tracks, definition) => {
        const trackKey = definition.track_key ?? definition.category_key;
        tracks.set(trackKey, [...(tracks.get(trackKey) ?? []), definition.target]);
        return tracks;
      }, new Map());

    expect(definitionsByTrack.get("shopping_completed")).toEqual([
      3,
      10,
      30,
      100,
      300,
      700,
      1300,
    ]);
    expect(definitionsByTrack.get("pantry_distinct")).toEqual([
      10,
      30,
      60,
      120,
      250,
      600,
    ]);

    for (const [trackKey, thresholds] of definitionsByTrack) {
      expect(thresholds[0], `${trackKey} should not duplicate tutorial one-shot milestones`).toBeGreaterThan(1);
      const deltas = thresholds.slice(1).map((target, index) => target - thresholds[index]);
      const hasProgressivelyHarderDeltas = deltas.every(
        (delta, index) => index === 0 || delta > deltas[index - 1],
      );

      expect(
        hasProgressivelyHarderDeltas,
        `${trackKey} deltas should strictly increase: ${deltas.join(" / ")}`,
      ).toBe(true);
    }
  });

  it("adds the additive achievement award migration with idempotency and notification constraints", async () => {
    const migration = await readFile(
      "supabase/migrations/20260613220000_35b_growth_achievement_awards.sql",
      "utf8",
    );

    expect(migration).toContain("create table if not exists public.user_achievement_awards");
    expect(migration).toContain("unique (user_id, achievement_key)");
    expect(migration).toContain("unique (user_id, idempotency_key)");
    expect(migration).toContain("user_achievement_awards_user_category_earned_idx");
    expect(migration).toContain("auth.uid() = user_id");
    expect(migration).toContain("'achievement_unlocked'");
    expect(migration).toContain("'recipe_registered'");
  });
});
