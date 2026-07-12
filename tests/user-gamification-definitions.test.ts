import { describe, expect, it } from "vitest";

import {
  buildUserGamificationData,
  USER_BADGE_DEFINITIONS,
  USER_QUEST_DEFINITIONS,
} from "@/lib/server/user-gamification";
import type { UserProgressData } from "@/types/user-progress";

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
    last_updated_at: "2026-06-10T12:00:00.000Z",
    ...overrides,
  };
}

describe("user gamification definitions", () => {
  it("keeps badge and quest definitions in the non-competitive home-cooking scope", () => {
    expect(USER_BADGE_DEFINITIONS.map((badge) => badge.badge_key)).toEqual([
      "first_recipe_saved",
      "first_shopping_done",
      "first_cook_done",
      "first_custom_book_created",
      "recipe_collector",
      "kitchen_routine_starter",
      "shopping_rhythm",
      "level_5_homecook",
    ]);
    expect(USER_QUEST_DEFINITIONS.map((quest) => quest.quest_key)).toEqual([
      "first_recipe_saved",
      "first_planner_registered",
      "first_shopping_list_created",
      "first_shopping_done",
      "first_cook_done",
      "first_custom_book_created",
    ]);

    const serialized = JSON.stringify({ USER_BADGE_DEFINITIONS, USER_QUEST_DEFINITIONS });
    expect(serialized).not.toMatch(/leaderboard|rank|streak|season|loot|reward_box/i);
  });

  it("derives empty-state tutorial quests without a bootstrap gamification row", () => {
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

    expect(data.level).toEqual({
      current_level: 1,
      total_xp: 0,
      xp_to_next_level: 100,
      progress_percent: 0,
    });
    expect(data.featured_badges).toEqual([]);
    expect(data.badges.earned).toEqual([]);
    expect(data.badges.locked[0]).toMatchObject({
      badge_key: "first_recipe_saved",
      progress_current: 0,
      progress_target: 1,
    });
    expect(data.tutorial.active_steps.map((step) => step.achievement_key)).toEqual([
      "tutorial_recipe_saved",
    ]);
    expect(data.quests.active).toEqual(expect.arrayContaining([
      expect.objectContaining({
        quest_key: "first_cook_done",
        title: "첫 요리 완료하기",
      }),
    ]));
  });

  it("advances the active tutorial step after the first tutorial achievement is earned", () => {
    const data = buildUserGamificationData({
      progress: buildProgress({
        event_counts: {
          cooking_completed: 0,
          shopping_completed: 0,
          recipe_saved_distinct_ever: 1,
          custom_book_created: 0,
          planner_registered_first: 0,
          planner_registered_repeat: 0,
        },
      }),
      badgeRows: [],
      questRows: [
        {
          quest_key: "first_recipe_saved",
          quest_type: "tutorial",
          status: "completed",
          progress_current: 1,
          progress_target: 1,
          completed_at: "2026-06-10T12:00:00.000Z",
          dismissed_at: null,
          seen_at: null,
          updated_at: "2026-06-10T12:00:00.000Z",
        },
      ],
      achievementRows: [
        {
          achievement_key: "tutorial_recipe_saved",
          category_key: "tutorial",
          track_key: "tutorial",
          target_value: 1,
          achieved_value: 1,
          badge_key: "tutorial_recipe_saved",
          earned_at: "2026-06-10T12:00:00.000Z",
          seen_at: null,
        },
      ],
      activityRows: [],
      achievementCounts: {
        pantry_distinct_ingredients: 0,
        leftover_eaten_manual: 0,
        recipe_registered: 0,
        shopping_list_created: 0,
      },
      notificationRows: [],
    });

    expect(data.tutorial.completed_count).toBe(1);
    expect(data.tutorial.active_steps).toEqual([
      {
        achievement_key: "tutorial_planner_registered",
        current: 0,
        status: "active",
        target: 1,
        title: "첫 식단 등록",
      },
    ]);
  });

  it("maps earned badges, active quests, completed quests, and unseen notifications", () => {
    const data = buildUserGamificationData({
      progress: buildProgress({
        level: {
          current_level: 3,
          total_xp: 420,
          current_level_start_xp: 300,
          next_level_start_xp: 600,
          xp_into_current_level: 120,
          xp_to_next_level: 180,
          progress_ratio: 0.4,
          progress_percent: 40,
        },
        event_counts: {
          cooking_completed: 3,
          shopping_completed: 1,
          recipe_saved_distinct_ever: 4,
          custom_book_created: 0,
          planner_registered_first: 0,
          planner_registered_repeat: 0,
        },
      }),
      badgeRows: [
        {
          badge_key: "first_cook_done",
          earned_at: "2026-06-10T12:00:00.000Z",
          seen_at: null,
        },
      ],
      questRows: [
        {
          quest_key: "first_recipe_saved",
          quest_type: "tutorial",
          status: "completed",
          progress_current: 4,
          progress_target: 1,
          completed_at: "2026-06-10T12:00:00.000Z",
          dismissed_at: null,
          seen_at: null,
          updated_at: "2026-06-10T12:00:00.000Z",
        },
      ],
      achievementRows: [],
      activityRows: [],
      achievementCounts: {
        pantry_distinct_ingredients: 0,
        leftover_eaten_manual: 0,
        recipe_registered: 0,
        shopping_list_created: 0,
      },
      notificationRows: [
        {
          id: "550e8400-e29b-41d4-a716-446655440001",
          notification_type: "xp_awarded",
          payload_json: { label: "장보기 완료", xp_delta: 30 },
          priority: 4,
          delivery_channel: "toast",
          toast_eligible: true,
          group_key: "progress-event:550e8400-e29b-41d4-a716-446655440901",
          created_at: "2026-06-10T12:01:00.000Z",
          seen_at: null,
        },
      ],
    });

    expect(data.featured_badges).toEqual([
      {
        badge_key: "first_cook_done",
        label: "첫 요리 완성",
        description: "첫 요리 완료를 기록했어요.",
        category: "cooking",
        shape_key: "pot",
        locked_hint: null,
        earned_at: "2026-06-10T12:00:00.000Z",
        is_new: true,
      },
    ]);
    expect(data.quests.active).toEqual(expect.arrayContaining([
      expect.objectContaining({
        quest_key: "first_planner_registered",
        progress_current: 0,
        progress_target: 1,
        progress_percent: 0,
      }),
      expect.objectContaining({
        quest_key: "first_shopping_list_created",
        progress_current: 0,
        progress_target: 1,
        progress_percent: 0,
      }),
    ]));
    expect(data.quests.active).toHaveLength(3);
    expect(data.quests.completed_recent).toEqual([]);
    expect(data.notifications.unseen).toEqual([
      {
        id: "550e8400-e29b-41d4-a716-446655440001",
        notification_type: "xp_awarded",
        priority: 4,
        delivery_channel: "toast",
        toast_eligible: true,
        group_key: "progress-event:550e8400-e29b-41d4-a716-446655440901",
        title: "+30 XP 획득",
        body: "장보기 완료 XP",
        category: "recipe",
        payload: { label: "장보기 완료", xp_delta: 30 },
        created_at: "2026-06-10T12:01:00.000Z",
        seen_at: null,
      },
    ]);
  });
});
