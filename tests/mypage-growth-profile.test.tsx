// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { MypageGrowthProfile } from "@/components/mypage/mypage-growth-profile";
import type { UserGamificationData } from "@/types/user-gamification";
import type { UserProgressData } from "@/types/user-progress";

const MOCK_PROGRESS: UserProgressData = {
  level: {
    current_level: 9,
    total_xp: 1240,
    current_level_start_xp: 1100,
    next_level_start_xp: 1450,
    xp_into_current_level: 140,
    xp_to_next_level: 210,
    progress_ratio: 0.4,
    progress_percent: 40,
  },
  event_counts: {
    cooking_completed: 4,
    shopping_completed: 3,
    recipe_saved_distinct_ever: 8,
    custom_book_created: 1,
    planner_registered_first: 1,
    planner_registered_repeat: 2,
  },
  last_updated_at: "2026-06-11T00:00:00.000Z",
};

const FEATURED_BADGES: UserGamificationData["featured_badges"] = [
  {
    badge_key: "first_recipe_saved",
    label: "첫 저장",
    description: "첫 레시피를 저장했어요.",
    category: "recipe",
    shape_key: "bookmark",
    locked_hint: null,
    earned_at: "2026-06-10T00:00:00.000Z",
    is_new: false,
  },
  {
    badge_key: "first_shopping_done",
    label: "장보기 첫걸음",
    description: "첫 장보기를 완료했어요.",
    category: "shopping",
    shape_key: "leaf",
    locked_hint: null,
    earned_at: "2026-06-10T00:00:00.000Z",
    is_new: true,
  },
  {
    badge_key: "first_cook_done",
    label: "첫 집밥 완성",
    description: "첫 요리 완료를 기록했어요.",
    category: "cooking",
    shape_key: "pot",
    locked_hint: null,
    earned_at: "2026-06-10T00:00:00.000Z",
    is_new: false,
  },
  {
    badge_key: "first_custom_book_created",
    label: "나만의 책",
    description: "커스텀 레시피북을 만들었어요.",
    category: "recipebook",
    shape_key: "plate",
    locked_hint: null,
    earned_at: "2026-06-10T00:00:00.000Z",
    is_new: false,
  },
];

const MOCK_GAMIFICATION: UserGamificationData = {
  level: {
    current_level: 9,
    total_xp: 1240,
    xp_to_next_level: 210,
    progress_percent: 40,
  },
  grade: {
    grade_key: "kitchen_explorer",
    label: "서버 등급명",
    level_min: 8,
    level_max: 12,
  },
  featured_badges: FEATURED_BADGES,
  badges: {
    earned: FEATURED_BADGES.slice(0, 3),
    locked: [
      {
        badge_key: "shopping_rhythm",
        label: "장보기 리듬",
        description: "장보기 완료를 꾸준히 기록해요.",
        category: "shopping",
        shape_key: "shield",
        locked_hint: "장보기 완료를 한 번 더 기록해 보세요.",
        earned_at: null,
        is_new: false,
        progress_current: 1,
        progress_target: 3,
        progress_percent: 33,
      },
    ],
  },
  quests: { active: [], completed_recent: [] },
  tutorial: { active_steps: [] },
  notifications: { unseen: [], priority_unseen: [], archive_preview: [] },
  last_updated_at: "2026-06-11T00:00:00.000Z",
};

describe("MypageGrowthProfile", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders server grade, progress, and only three mobile featured badges", async () => {
    const user = userEvent.setup();

    render(
      <MypageGrowthProfile
        gamification={MOCK_GAMIFICATION}
        gamificationState="ready"
        progress={MOCK_PROGRESS}
        progressState="ready"
        variant="mobile"
      />,
    );

    expect(screen.getByTestId("mypage-growth-profile").textContent).toContain(
      "서버 등급명 · Lv.9",
    );
    expect(screen.getByRole("progressbar", {
      name: "Lv.9, 다음 레벨까지 210 XP, 진행률 40%",
    })).toBeTruthy();

    const badgeRow = screen.getByTestId("mypage-growth-featured-badges");
    expect(within(badgeRow).getAllByRole("button")).toHaveLength(3);
    expect(within(badgeRow).queryByText("나만의 책")).toBeNull();

    await user.click(within(badgeRow).getByRole("button", { name: /첫 저장/ }));
    expect(screen.getByRole("dialog", { name: "배지 안내" })).toBeTruthy();
    expect(screen.getByText("장보기 완료를 한 번 더 기록해 보세요.")).toBeTruthy();
  });

  it("keeps grade and badges when progress fails softly", () => {
    render(
      <MypageGrowthProfile
        gamification={MOCK_GAMIFICATION}
        gamificationState="ready"
        progress={null}
        progressState="error"
        variant="mobile"
      />,
    );

    expect(screen.getByText("서버 등급명")).toBeTruthy();
    expect(screen.getByText("첫 저장")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByTestId("mypage-growth-progress-error").textContent).toContain(
      "XP를 잠시 불러오지 못했어요",
    );
  });

  it("keeps progress when gamification fails softly", () => {
    render(
      <MypageGrowthProfile
        gamification={null}
        gamificationState="error"
        progress={MOCK_PROGRESS}
        progressState="ready"
        variant="desktop"
      />,
    );

    expect(screen.getByText("Lv.9")).toBeTruthy();
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.queryByText("서버 등급명")).toBeNull();
    expect(screen.getByTestId("mypage-growth-gamification-error").textContent).toContain(
      "배지 정보를 잠시 불러오지 못했어요",
    );
  });
});
