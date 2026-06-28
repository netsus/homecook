// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { GrowthGradeMark } from "@/components/mypage/growth-grade-mark";
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
  quests: {
    active: [
      {
        quest_key: "shopping_three_lists",
        quest_type: "standard",
        status: "active",
        title: "장보기 3회",
        description: "리스트를 만들고 장보기를 완료해요.",
        progress_current: 2,
        progress_target: 3,
        progress_percent: 67,
        completed_at: null,
        dismissed_at: null,
        is_new: false,
      },
    ],
    completed_recent: [],
  },
  tutorial: {
    category_key: "tutorial",
    completed_count: 0,
    total_count: 7,
    active_steps: [],
  },
  achievement_album: {
    summary: { earned_count: 0, total_count: 0, completed_category_count: 0 },
    categories: [],
  },
  notifications: { unseen: [], priority_unseen: [], archive_preview: [] },
  last_updated_at: "2026-06-11T00:00:00.000Z",
};

describe("MypageGrowthProfile", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders server grade and progress without showing featured badges on MYPAGE", () => {
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
    expect(screen.queryByTestId("mypage-growth-featured-badges")).toBeNull();
    expect(screen.queryByText("나만의 책")).toBeNull();
  });

  it("keeps grade when progress fails softly without exposing badge rows", () => {
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
    expect(screen.queryByText("첫 저장")).toBeNull();
    expect(screen.queryByTestId("mypage-growth-featured-badges")).toBeNull();
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

  it("combines profile identity, growth, and detail actions in one header", () => {
    render(
      <MypageGrowthProfile
        gamification={MOCK_GAMIFICATION}
        gamificationState="ready"
        onEditProfile={() => undefined}
        profile={{
          id: "user-1",
          nickname: "김집밥",
          email: "user@example.com",
          profile_image_url: null,
          social_provider: "kakao",
          settings: { screen_wake_lock: false },
        }}
        providerLabel="카카오 로그인"
        progress={MOCK_PROGRESS}
        progressState="ready"
        variant="desktop"
      />,
    );

    const header = screen.getByTestId("mypage-growth-profile");
    expect(within(header).getByText("김집밥")).toBeTruthy();
    const gradeRow = within(header).getByTestId("mypage-profile-grade-row");
    expect(within(gradeRow).getByText("서버 등급명")).toBeTruthy();
    expect(within(gradeRow).getByText("Lv.9")).toBeTruthy();
    expect(within(header).queryByTestId("mypage-gamification-card")).toBeNull();
    expect(within(header).queryByTestId("mypage-growth-quest-summary")).toBeNull();
    expect(within(header).getByRole("button", { name: "등급 보기" })).toBeTruthy();
    expect(within(header).getByRole("button", { name: "업적 보기" })).toBeTruthy();
    expect(within(header).getByRole("button", { name: "알림 보기" })).toBeTruthy();
    expect(within(header).getByRole("button", { name: "경험치 안내" })).toBeTruthy();
    expect(within(header).queryByRole("button", { name: "튜토리얼 보기" })).toBeNull();
  });

  it("opens a simplified XP guide from the growth profile without first/repeat policy cards", () => {
    render(
      <MypageGrowthProfile
        gamification={MOCK_GAMIFICATION}
        gamificationState="ready"
        progress={MOCK_PROGRESS}
        progressState="ready"
        variant="mobile"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "경험치 안내" }));

    const dialog = screen.getByRole("dialog", { name: "경험치 안내" });
    expect(within(dialog).getByText("경험치는 이렇게 쌓여요")).toBeTruthy();
    expect(within(dialog).getByText("레시피 저장")).toBeTruthy();
    expect(within(dialog).getByText("식단 계획")).toBeTruthy();
    expect(within(dialog).getByText("장보기와 요리")).toBeTruthy();
    expect(within(dialog).getByText("보관 정리")).toBeTruthy();
    expect(dialog.textContent).toContain("실제 적립된 XP는 알림과 토스트로 바로 알려드려요.");
    expect(dialog.textContent).not.toContain("처음");
    expect(dialog.textContent).not.toContain("반복");
    expect(dialog.textContent).not.toContain("+15 XP");
    expect(within(dialog).queryByTestId("mypage-xp-guide-item-recipe_saved")).toBeNull();
  });
});

describe("GrowthGradeMark", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps runner distinct from sprout and artisan distinct from a plain pot", () => {
    render(
      <>
        <GrowthGradeMark gradeKey="sprout_homecook" />
        <GrowthGradeMark gradeKey="homecook_runner" />
        <GrowthGradeMark gradeKey="homecook_artisan" />
      </>,
    );

    expect(
      screen.getByTestId("growth-grade-mark-sprout_homecook").getAttribute("data-grade-motif"),
    ).toBe("sprout-soil");
    expect(
      screen.getByTestId("growth-grade-mark-homecook_runner").getAttribute("data-grade-motif"),
    ).toBe("bowl-motion-timer");
    expect(
      screen.getByTestId("growth-grade-mark-homecook_artisan").getAttribute("data-grade-motif"),
    ).toBe("seal-tool-steam");
  });
});
