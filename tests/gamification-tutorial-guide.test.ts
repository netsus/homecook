import { describe, expect, it } from "vitest";

import {
  createTutorialGuideHistoryNotifications,
  getNextTutorialGuide,
} from "@/lib/gamification-tutorial-guide";
import type {
  UserGamificationAchievementMilestoneData,
  UserGamificationData,
} from "@/types/user-gamification";

const GUIDE_EXPECTATIONS = [
  {
    achievementKey: "tutorial_recipe_saved",
    body: "레시피의 저장 버튼을 눌러 레시피를 저장해보세요.",
    questKey: "first_recipe_saved",
    title: "마음에 드는 레시피 저장하기",
  },
  {
    achievementKey: "tutorial_planner_registered",
    body: "레시피에서 플래너에 추가를 누르면 플래너에 끼니를 등록할 수 있어요.",
    questKey: "first_planner_registered",
    title: "플래너에 끼니 등록하기",
  },
  {
    achievementKey: "tutorial_shopping_list_create",
    body: "플래너에 등록한 끼니에서 장보기를 누르면, 장보기 목록을 만들 수 있어요.",
    questKey: "first_shopping_list_created",
    title: "첫 장보기 목록 만들기",
  },
  {
    achievementKey: "tutorial_shopping_list_complete",
    body: "장보기 목록에서 구매한 재료는 장보기를 완료하면 팬트리에 반영할 수 있어요.",
    questKey: "first_shopping_done",
    title: "첫 장보기 완료하기",
  },
  {
    achievementKey: "tutorial_cooking_complete",
    body: "장보기 완료한 끼니에서 요리하기를 누르면 요리모드에 들어갈 수 있어요.",
    questKey: "first_cook_done",
    title: "첫 요리 완료하기",
  },
  {
    achievementKey: "tutorial_recipebook_created",
    body: "마이페이지에서 나만의 새 레시피북을 만들어보세요.",
    questKey: "first_custom_book_created",
    title: "나만의 레시피북 생성하기",
  },
] as const;

function makeGamification(
  achievementKey: string,
  questKey: string,
): UserGamificationData {
  return {
    achievement_album: {
      categories: [],
      summary: { completed_category_count: 0, earned_count: 0, total_count: 0 },
    },
    badges: { earned: [], locked: [] },
    featured_badges: [],
    grade: { grade_key: "clay", label: "흙", level_max: 3, level_min: 1 },
    last_updated_at: "2026-06-23T00:00:00.000Z",
    level: {
      current_level: 1,
      progress_percent: 0,
      total_xp: 0,
      xp_to_next_level: 100,
    },
    notifications: { archive_preview: [], priority_unseen: [], unseen: [] },
    quests: {
      active: [
        {
          completed_at: null,
          description: "서버 기본 설명",
          dismissed_at: null,
          is_new: true,
          progress_current: 0,
          progress_percent: 0,
          progress_target: 1,
          quest_key: questKey,
          quest_type: "tutorial",
          status: "active",
          title: "서버 기본 제목",
        },
      ],
      completed_recent: [],
    },
    tutorial: {
      active_steps: [
        {
          achievement_key: achievementKey,
          current: 0,
          status: "active",
          target: 1,
          title: "업적 기본 제목",
        },
      ],
      category_key: "tutorial",
      completed_count: 0,
      total_count: 6,
    },
  };
}

function makeTutorialMilestone(
  achievementKey: string,
  current: number,
  status: UserGamificationAchievementMilestoneData["status"],
): UserGamificationAchievementMilestoneData {
  const guide = GUIDE_EXPECTATIONS.find((item) => item.achievementKey === achievementKey);

  return {
    achievement_key: achievementKey,
    badge: { badge_key: achievementKey, category: "tutorial", shape_key: "bookmark" },
    current,
    description: guide?.body ?? "튜토리얼 단계",
    earned_at: status === "earned" ? "2026-06-20T00:00:00.000Z" : null,
    locked_hint: status === "earned" ? null : "튜토리얼을 진행해 보세요.",
    status,
    target: 1,
    title: guide?.title ?? "튜토리얼 단계",
    track_key: "tutorial",
  };
}

describe("gamification tutorial guide", () => {
  it("uses concise action-oriented guide copy for every tutorial quest", () => {
    for (const expected of GUIDE_EXPECTATIONS) {
      const guide = getNextTutorialGuide(
        makeGamification(expected.achievementKey, expected.questKey),
      );

      expect(guide).toMatchObject(expected);
      expect(guide?.body.length).toBeLessThanOrEqual(45);
      expect(guide?.body).not.toBe("서버 기본 설명");
    }
  });

  it("keeps previous tutorial guide rows when the active tutorial advances without award rows", () => {
    const notifications = createTutorialGuideHistoryNotifications(
      makeGamification("tutorial_planner_registered", "first_planner_registered"),
    );

    expect(notifications.map((item) => item.body)).toEqual([
      expect.stringContaining("플래너에 끼니 등록하기"),
      expect.stringContaining("마음에 드는 레시피 저장하기"),
    ]);
    expect(
      notifications.find((item) => item.body.includes("마음에 드는 레시피 저장하기"))?.payload
        .tutorial_guide_status,
    ).toBe("completed");
  });

  it("restores completed tutorial guide rows from completed progress when awards are missing", () => {
    const gamification = makeGamification(
      "tutorial_shopping_list_create",
      "first_shopping_list_created",
    );
    gamification.achievement_album.categories = [
      {
        category_key: "tutorial",
        earned_count: 0,
        label: "튜토리얼",
        milestones: [
          makeTutorialMilestone("tutorial_recipe_saved", 1, "active"),
          makeTutorialMilestone("tutorial_planner_registered", 1, "locked"),
          makeTutorialMilestone("tutorial_shopping_list_create", 0, "active"),
        ],
        total_count: 3,
      },
    ];

    const notifications = createTutorialGuideHistoryNotifications(gamification);

    expect(notifications.map((item) => item.body)).toEqual([
      expect.stringContaining("첫 장보기 목록 만들기"),
      expect.stringContaining("플래너에 끼니 등록하기"),
      expect.stringContaining("마음에 드는 레시피 저장하기"),
    ]);
  });
});
