// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MypageGrowthProfile } from "@/components/mypage/mypage-growth-profile";
import type { UserGamificationData } from "@/types/user-gamification";
import type { UserProgressData } from "@/types/user-progress";

const mockFetchArchive = vi.fn();

vi.mock("@/lib/api/user-gamification", () => ({
  fetchUserGamificationArchive: (...args: unknown[]) => mockFetchArchive(...args),
}));

const MOCK_PROGRESS: UserProgressData = {
  level: {
    current_level: 46,
    total_xp: 7760,
    current_level_start_xp: 7000,
    next_level_start_xp: 11000,
    xp_into_current_level: 760,
    xp_to_next_level: 3240,
    progress_ratio: 0.69,
    progress_percent: 69,
  },
  event_counts: {
    cooking_completed: 327,
    shopping_completed: 214,
    recipe_saved_distinct_ever: 50,
    custom_book_created: 2,
    planner_registered_first: 1,
    planner_registered_repeat: 127,
  },
  last_updated_at: "2026-06-14T00:00:00.000Z",
};

const MOCK_GAMIFICATION: UserGamificationData = {
  level: {
    current_level: 46,
    total_xp: 7760,
    xp_to_next_level: 3240,
    progress_percent: 69,
  },
  grade: {
    grade_key: "diamond",
    label: "Diamond",
    level_min: 35,
    level_max: 49,
    icon_url: "/assets/growth/grades/diamond-spoon-badge.png",
    character_url: "/assets/growth/grades/diamond-spoon.png",
  },
  featured_badges: [
    {
      badge_key: "tutorial_recipe_saved",
      label: "첫 저장 완료",
      description: "첫 레시피를 저장했어요.",
      category: "tutorial",
      shape_key: "bookmark",
      locked_hint: null,
      earned_at: "2026-06-10T00:00:00.000Z",
      is_new: false,
    },
    {
      badge_key: "cooking_100",
      label: "요리 100회",
      description: "요리 완료를 100번 기록했어요.",
      category: "cooking",
      shape_key: "pot",
      locked_hint: null,
      earned_at: "2026-06-11T00:00:00.000Z",
      is_new: true,
    },
  ],
  badges: {
    earned: [],
    locked: [],
  },
  quests: {
    active: [],
    completed_recent: [],
  },
  tutorial: {
    category_key: "tutorial",
    completed_count: 1,
    total_count: 6,
    active_steps: [
      {
        achievement_key: "tutorial_planner_registered",
        title: "첫 식단 등록하기",
        current: 3,
        target: 5,
        status: "active",
      },
    ],
  },
  achievement_album: {
    summary: { earned_count: 2, total_count: 5, completed_category_count: 0 },
    categories: [
      {
        category_key: "tutorial",
        label: "튜토리얼",
        earned_count: 1,
        total_count: 6,
        milestones: [
          {
            achievement_key: "tutorial_recipe_saved",
            track_key: "tutorial",
            title: "첫 레시피 저장하기",
            description: "마음에 드는 레시피를 저장해 보세요.",
            current: 1,
            target: 1,
            status: "earned",
            earned_at: "2026-06-10T00:00:00.000Z",
            locked_hint: null,
            badge: { badge_key: "tutorial_recipe_saved", category: "tutorial", shape_key: "bookmark" },
          },
          {
            achievement_key: "tutorial_planner_registered",
            track_key: "tutorial",
            title: "첫 식단 등록하기",
            description: "플래너에 끼니를 등록해 보세요.",
            current: 3,
            target: 5,
            status: "active",
            earned_at: null,
            locked_hint: null,
            badge: { badge_key: "tutorial_planner_registered", category: "tutorial", shape_key: "ribbon" },
          },
          {
            achievement_key: "tutorial_shopping_complete",
            track_key: "tutorial",
            title: "첫 장보기 완료하기",
            description: "장보기 목록을 완료해 보세요.",
            current: 0,
            target: 1,
            status: "locked",
            earned_at: null,
            locked_hint: "장보기 목록을 완료하면 열려요.",
            badge: { badge_key: "tutorial_shopping_complete", category: "tutorial", shape_key: "bowl" },
          },
          {
            achievement_key: "tutorial_shopping_create",
            track_key: "tutorial",
            title: "첫 장보기 목록 만들기",
            description: "레시피로 장보기 목록을 만들어 보세요.",
            current: 0,
            target: 1,
            status: "locked",
            earned_at: null,
            locked_hint: "레시피 1개 이상으로 장보기 목록을 만들어 보세요.",
            badge: { badge_key: "tutorial_shopping_create", category: "tutorial", shape_key: "leaf" },
          },
          {
            achievement_key: "tutorial_cooking_complete",
            track_key: "tutorial",
            title: "첫 집밥 완료하기",
            description: "첫 요리 완료를 기록해 보세요.",
            current: 0,
            target: 1,
            status: "locked",
            earned_at: null,
            locked_hint: "요리 완료를 기록해 보세요.",
            badge: { badge_key: "tutorial_cooking_complete", category: "tutorial", shape_key: "pot" },
          },
          {
            achievement_key: "tutorial_recipebook_created",
            track_key: "tutorial",
            title: "첫 레시피북 만들기",
            description: "나만의 레시피북을 만들어 보세요.",
            current: 0,
            target: 1,
            status: "locked",
            earned_at: null,
            locked_hint: "나만의 레시피북을 만들어 보세요.",
            badge: { badge_key: "tutorial_recipebook_created", category: "tutorial", shape_key: "plate" },
          },
        ],
      },
      {
        category_key: "cooking",
        label: "요리",
        earned_count: 1,
        total_count: 2,
        milestones: [
          {
            achievement_key: "cooking_100",
            track_key: "cooking",
            title: "요리 100회",
            description: "요리 완료를 100번 기록했어요.",
            current: 100,
            target: 100,
            status: "earned",
            earned_at: "2026-06-11T00:00:00.000Z",
            locked_hint: null,
            badge: { badge_key: "cooking_100", category: "cooking", shape_key: "pot" },
          },
          {
            achievement_key: "cooking_300",
            track_key: "cooking",
            title: "요리 300회",
            description: "요리 완료 기록을 꾸준히 이어가요.",
            current: 120,
            target: 300,
            status: "active",
            earned_at: null,
            locked_hint: null,
            badge: { badge_key: "cooking_300", category: "cooking", shape_key: "plate" },
          },
        ],
      },
    ],
  },
  notifications: {
    unseen: [],
    priority_unseen: [],
    archive_preview: [
      {
        id: "notice-level",
        notification_type: "level_up",
        priority: 100,
        delivery_channel: "archive_only",
        toast_eligible: false,
        group_key: null,
        title: "레벨업!",
        body: "Diamond · Lv.46 달성",
        category: "cooking",
        payload: {},
        created_at: "2026-06-14T10:15:00.000Z",
        seen_at: null,
      },
      {
        id: "notice-achievement",
        notification_type: "achievement_unlocked",
        priority: 80,
        delivery_channel: "archive_only",
        toast_eligible: false,
        group_key: null,
        title: "업적 달성!",
        body: "요리 100회를 채웠어요.",
        category: "cooking",
        payload: {},
        created_at: "2026-06-14T10:06:00.000Z",
        seen_at: null,
      },
      {
        id: "notice-xp",
        notification_type: "xp_awarded",
        priority: 4,
        delivery_channel: "archive_only",
        toast_eligible: false,
        group_key: null,
        title: "+120 XP 반영",
        body: "경험치가 반영되었어요.",
        category: "recipe",
        payload: {},
        created_at: "2026-06-14T09:58:00.000Z",
        seen_at: null,
      },
    ],
  },
  last_updated_at: "2026-06-14T10:15:00.000Z",
};

const NEW_USER_GAMIFICATION: UserGamificationData = {
  level: {
    current_level: 1,
    total_xp: 0,
    xp_to_next_level: 30,
    progress_percent: 0,
  },
  grade: {
    grade_key: "clay",
    label: "Clay",
    level_min: 1,
    level_max: 3,
    icon_url: "/assets/growth/grades/clay-spoon-badge.png",
    character_url: "/assets/growth/grades/clay-spoon.png",
  },
  featured_badges: [],
  badges: {
    earned: [],
    locked: [],
  },
  quests: {
    active: [],
    completed_recent: [],
  },
  tutorial: {
    category_key: "tutorial",
    completed_count: 0,
    total_count: 1,
    active_steps: [
      {
        achievement_key: "tutorial_recipe_saved",
        title: "첫 레시피 저장하기",
        current: 0,
        target: 1,
        status: "active",
      },
    ],
  },
  achievement_album: {
    summary: { earned_count: 0, total_count: 1, completed_category_count: 0 },
    categories: [
      {
        category_key: "tutorial",
        label: "튜토리얼",
        earned_count: 0,
        total_count: 1,
        milestones: [
          {
            achievement_key: "tutorial_recipe_saved",
            track_key: "tutorial",
            title: "첫 레시피 저장하기",
            description: "마음에 드는 레시피를 저장해 보세요.",
            current: 0,
            target: 1,
            status: "active",
            earned_at: null,
            locked_hint: null,
            badge: { badge_key: "tutorial_recipe_saved", category: "tutorial", shape_key: "bookmark" },
          },
        ],
      },
    ],
  },
  notifications: {
    unseen: [],
    priority_unseen: [],
    archive_preview: [],
  },
  last_updated_at: "2026-06-14T10:15:00.000Z",
};

const NEW_USER_PROGRESS: UserProgressData = {
  level: {
    current_level: 1,
    total_xp: 0,
    current_level_start_xp: 0,
    next_level_start_xp: 30,
    xp_into_current_level: 0,
    xp_to_next_level: 30,
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
  last_updated_at: "2026-06-14T10:15:00.000Z",
};

describe("MYPAGE achievement album UI", () => {
  beforeEach(() => {
    mockFetchArchive.mockResolvedValue({
      items: MOCK_GAMIFICATION.notifications.archive_preview,
      next_cursor: null,
      has_next: false,
    });
  });

  afterEach(() => {
    cleanup();
    mockFetchArchive.mockReset();
  });

  it("keeps grade, XP, record stats, and detail buttons inside one profile header", () => {
    render(
      <MypageGrowthProfile
        gamification={MOCK_GAMIFICATION}
        gamificationState="ready"
        profile={{
          id: "user-1",
          nickname: "김지은",
          email: "user@example.com",
          profile_image_url: null,
          social_provider: "kakao",
          settings: { screen_wake_lock: false },
        }}
        providerLabel="카카오 로그인"
        progress={MOCK_PROGRESS}
        progressState="ready"
        recordStats={{ cooking: 327, planner: 128, shopping: 214 }}
        variant="desktop"
      />,
    );

    const header = screen.getByTestId("mypage-growth-profile");
    expect(within(header).getByText("김지은")).toBeTruthy();
    expect(within(header).getByText("Diamond · Lv.46")).toBeTruthy();
    expect(within(header).getByText("7,760 XP")).toBeTruthy();
    expect(within(header).getByText("요리기록")).toBeTruthy();
    expect(within(header).getByText("327")).toBeTruthy();
    expect(within(header).getByText("플래너 기록")).toBeTruthy();
    expect(within(header).getByText("128")).toBeTruthy();
    expect(within(header).getByText("장보기 기록")).toBeTruthy();
    expect(within(header).getByText("214")).toBeTruthy();

    expect(within(header).getByRole("button", { name: "등급 보기" })).toBeTruthy();
    expect(within(header).getByRole("button", { name: "업적 보기" })).toBeTruthy();
    expect(within(header).getByRole("button", { name: "튜토리얼 보기" })).toBeTruthy();
    expect(within(header).getByRole("button", { name: "알림 보기" })).toBeTruthy();
  });

  it("opens the grade modal with seven spoon grades and the current grade highlighted", async () => {
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

    await user.click(screen.getByRole("button", { name: "등급 보기" }));

    const dialog = screen.getByRole("dialog", { name: "전체 등급" });
    expect(within(dialog).getAllByTestId("mypage-grade-row")).toHaveLength(7);
    expect(within(dialog).getByTestId("mypage-grade-row-diamond").textContent).toContain("Diamond");
    expect(within(dialog).getByText("현재 등급")).toBeTruthy();
    expect(within(dialog).getByText("Titanium")).toBeTruthy();
    expect(within(dialog).queryByText(/rank|leaderboard|streak|claim/i)).toBeNull();
  });

  it("opens the achievement album as category tabs and stamp cards without reward claims", async () => {
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

    await user.click(screen.getByRole("button", { name: "업적 보기" }));

    const dialog = screen.getByRole("dialog", { name: "업적 앨범" });
    expect(within(dialog).getByText("2 / 5")).toBeTruthy();
    expect(within(dialog).getByRole("tab", { name: "튜토리얼" })).toBeTruthy();
    expect(within(dialog).getByRole("tab", { name: "요리" })).toBeTruthy();
    expect(within(dialog).getByTestId("achievement-stamp-tutorial_recipe_saved").textContent).toContain(
      "획득",
    );
    expect(within(dialog).getByTestId("achievement-stamp-tutorial_planner_registered").textContent).toContain(
      "3 / 5",
    );
    expect(within(dialog).getByTestId("achievement-stamp-tutorial_shopping_complete").textContent).toContain(
      "장보기 목록을 완료하면 열려요.",
    );

    await user.click(within(dialog).getByRole("tab", { name: "요리" }));
    expect(within(dialog).getByText("요리 300회")).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /받기|수령|claim/i })).toBeNull();
  });

  it("opens tutorial and notification panels from the profile buttons", async () => {
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

    await user.click(screen.getByRole("button", { name: "튜토리얼 보기" }));
    const tutorialDialog = screen.getByRole("dialog", { name: "튜토리얼 퀘스트" });
    expect(within(tutorialDialog).getByText("1 / 6")).toBeTruthy();
    expect(within(tutorialDialog).getByText("첫 식단 등록하기")).toBeTruthy();
    expect(within(tutorialDialog).queryByRole("button", { name: /받기|수령|claim/i })).toBeNull();

    await user.click(within(tutorialDialog).getByRole("button", { name: "닫기" }));
    await user.click(screen.getByRole("button", { name: "알림 보기" }));

    const notificationDialog = screen.getByRole("dialog", { name: "알림 기록" });
    await waitFor(() => {
      expect(mockFetchArchive).toHaveBeenCalledWith({ limit: 20, cursor: null });
    });
    expect(within(notificationDialog).getByText("레벨업!")).toBeTruthy();

    await user.click(within(notificationDialog).getByRole("tab", { name: "업적" }));
    expect(within(notificationDialog).getByText("업적 달성!")).toBeTruthy();
    expect(within(notificationDialog).queryByText("+120 XP 반영")).toBeNull();
  });

  it("keeps the new user state at Clay level 1 with the first tutorial active", async () => {
    const user = userEvent.setup();

    render(
      <MypageGrowthProfile
        gamification={NEW_USER_GAMIFICATION}
        gamificationState="ready"
        profile={{
          id: "user-new",
          nickname: "처음집밥",
          email: "new@example.com",
          profile_image_url: null,
          social_provider: "kakao",
          settings: { screen_wake_lock: false },
        }}
        providerLabel="카카오 로그인"
        progress={NEW_USER_PROGRESS}
        progressState="ready"
        variant="mobile"
      />,
    );

    const header = screen.getByTestId("mypage-growth-profile");
    expect(within(header).getByText("Clay · Lv.1")).toBeTruthy();
    expect(within(header).getByText("0 XP")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "튜토리얼 보기" }));

    const tutorialDialog = screen.getByRole("dialog", { name: "튜토리얼 퀘스트" });
    expect(within(tutorialDialog).getAllByText("0 / 1").length).toBeGreaterThan(0);
    expect(within(tutorialDialog).getByText("첫 레시피 저장하기")).toBeTruthy();
  });

  it("isolates archive fetch failure inside the notification panel", async () => {
    const user = userEvent.setup();
    mockFetchArchive.mockRejectedValueOnce(new Error("archive unavailable"));

    render(
      <MypageGrowthProfile
        gamification={{
          ...MOCK_GAMIFICATION,
          notifications: {
            ...MOCK_GAMIFICATION.notifications,
            archive_preview: [],
          },
        }}
        gamificationState="ready"
        progress={MOCK_PROGRESS}
        progressState="ready"
        variant="mobile"
      />,
    );

    await user.click(screen.getByRole("button", { name: "알림 보기" }));

    const notificationDialog = screen.getByRole("dialog", { name: "알림 기록" });
    await waitFor(() => {
      expect(within(notificationDialog).getByTestId("mypage-notification-archive-error")).toBeTruthy();
    });
    expect(screen.getByTestId("mypage-growth-profile")).toBeTruthy();
  });
});
