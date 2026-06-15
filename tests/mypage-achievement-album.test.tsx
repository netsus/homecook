// @vitest-environment jsdom

import React from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MypageGrowthProfile } from "@/components/mypage/mypage-growth-profile";
import { HOMECOOK_GAMIFICATION_OPEN_NOTIFICATIONS_EVENT } from "@/lib/gamification-events";
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
      badge_key: "cooking_completed_100",
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
    completed_count: 3,
    total_count: 7,
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
    summary: { earned_count: 4, total_count: 9, completed_category_count: 0 },
    categories: [
      {
        category_key: "tutorial",
        label: "튜토리얼",
        earned_count: 3,
        total_count: 7,
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
            achievement_key: "tutorial_shopping_list_complete",
            track_key: "tutorial",
            title: "첫 장보기 완료하기",
            description: "장보기 목록을 완료해 보세요.",
            current: 0,
            target: 1,
            status: "locked",
            earned_at: null,
            locked_hint: "장보기 목록을 완료하면 열려요.",
            badge: { badge_key: "tutorial_shopping_list_complete", category: "tutorial", shape_key: "bowl" },
          },
          {
            achievement_key: "tutorial_shopping_list_create",
            track_key: "tutorial",
            title: "첫 장보기 목록 만들기",
            description: "레시피로 장보기 목록을 만들어 보세요.",
            current: 0,
            target: 1,
            status: "earned",
            earned_at: "2026-06-12T00:00:00.000Z",
            locked_hint: "레시피 1개 이상으로 장보기 목록을 만들어 보세요.",
            badge: { badge_key: "tutorial_shopping_list_create", category: "tutorial", shape_key: "leaf" },
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
          {
            achievement_key: "tutorial_complete",
            track_key: "tutorial_complete",
            title: "튜토리얼 완료",
            description: "집밥의 기본 흐름을 모두 경험해 보세요.",
            current: 6,
            target: 6,
            status: "earned",
            earned_at: "2026-06-12T00:00:00.000Z",
            locked_hint: null,
            badge: { badge_key: "tutorial_complete", category: "tutorial", shape_key: "ribbon" },
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
            achievement_key: "cooking_completed_100",
            track_key: "cooking_completed",
            title: "요리 100회",
            description: "요리 완료를 100번 기록했어요.",
            current: 100,
            target: 100,
            status: "earned",
            earned_at: "2026-06-11T00:00:00.000Z",
            locked_hint: null,
            badge: { badge_key: "cooking_completed_100", category: "cooking", shape_key: "pot" },
          },
          {
            achievement_key: "cooking_completed_300",
            track_key: "cooking_completed",
            title: "요리 300회",
            description: "요리 완료 기록을 꾸준히 이어가요.",
            current: 120,
            target: 300,
            status: "active",
            earned_at: null,
            locked_hint: null,
            badge: { badge_key: "cooking_completed_300", category: "cooking", shape_key: "plate" },
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
        id: "notice-grade",
        notification_type: "level_up",
        priority: 100,
        delivery_channel: "archive_only",
        toast_eligible: false,
        group_key: null,
        title: "등급 획득!",
        body: "Diamond 등급 획득, Lv.46 달성",
        category: "cooking",
        payload: {
          current_level: 46,
          grade_upgrade: true,
          grade: {
            grade_key: "diamond",
            label: "Diamond",
            icon_url: "/assets/growth/grades/diamond-spoon-badge.png",
          },
        },
        created_at: "2026-06-14T10:16:00.000Z",
        seen_at: null,
      },
      {
        id: "notice-level",
        notification_type: "level_up",
        priority: 100,
        delivery_channel: "archive_only",
        toast_eligible: false,
        group_key: null,
        title: "레벨업!",
        body: "Lv.46 달성",
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
        body: "요리 100회 배지를 획득했어요.",
        category: "cooking",
        payload: {},
        created_at: "2026-06-14T10:06:00.000Z",
        seen_at: null,
      },
      {
        id: "notice-tutorial-achievement",
        notification_type: "achievement_unlocked",
        priority: 2,
        delivery_channel: "archive_only",
        toast_eligible: false,
        group_key: null,
        title: "업적 달성!",
        body: "튜토리얼 완료 배지를 획득했어요.",
        category: "tutorial",
        payload: { achievement_key: "tutorial_recipe_saved" },
        created_at: "2026-06-14T10:02:00.000Z",
        seen_at: null,
      },
      {
        id: "notice-xp",
        notification_type: "xp_awarded",
        priority: 4,
        delivery_channel: "archive_only",
        toast_eligible: false,
        group_key: null,
        title: "+120 XP 획득",
        body: "레시피 XP",
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

  it("keeps identity, grade row, XP, record stats, and detail buttons inside one profile header", () => {
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
    const identity = within(header).getByTestId("mypage-profile-identity");
    expect(within(identity).getByText("김지은")).toBeTruthy();
    expect(within(identity).queryByText("카카오 로그인")).toBeNull();
    expect(within(identity).queryByTestId("mypage-profile-grade-row")).toBeNull();

    const gradeDivider = within(header).getByTestId("mypage-profile-grade-divider");
    const gradeRow = within(header).getByTestId("mypage-profile-grade-row");
    const gradeAsset = within(gradeRow).getByTestId("mypage-profile-grade-image-diamond");
    expect(gradeAsset.className).toContain("rounded-full");
    expect(gradeAsset.className).toContain("bg-[var(--surface)]");
    expect(gradeAsset.style.width).toBe("54px");
    expect(within(gradeRow).getByText("Diamond")).toBeTruthy();
    expect(within(gradeRow).getByText("Lv.46")).toBeTruthy();
    expect(within(gradeRow).getByText("Diamond").parentElement?.className).toContain("gap-1");
    expect(within(gradeRow).getByText("Diamond").parentElement?.className).not.toContain("gap-6");
    expect(
      identity.compareDocumentPosition(gradeDivider) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      gradeDivider.compareDocumentPosition(gradeRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(header).getByText("다음 레벨까지 3,240 XP")).toBeTruthy();
    expect(within(header).getByText("760 / 4,000 XP")).toBeTruthy();

    const actionBar = within(header).getByTestId("mypage-profile-action-bar");
    expect(within(actionBar).getAllByRole("button")).toHaveLength(3);
    expect(within(actionBar).getByRole("button", { name: "등급 보기" })).toBeTruthy();
    expect(within(actionBar).getByRole("button", { name: "업적 보기" })).toBeTruthy();
    expect(within(actionBar).getByRole("button", { name: "알림 보기" })).toBeTruthy();
    expect(within(actionBar).queryByRole("button", { name: "튜토리얼 보기" })).toBeNull();

    const progressBar = within(header).getByRole("progressbar", {
      name: "Lv.46, 다음 레벨까지 3,240 XP, 진행률 69%",
    });
    expect(within(progressBar).getByText("69%")).toBeTruthy();
    expect(within(gradeRow).getByText("Lv.46").className).toContain("text-[var(--brand)]");
    expect(within(header).queryByTestId("mypage-growth-featured-badges")).toBeNull();

    const stats = within(header).getByLabelText("마이페이지 통계");
    expect(
      identity.compareDocumentPosition(progressBar) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      progressBar.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(within(header).getByText("요리기록")).toBeTruthy();
    const cookingIcon = within(header).getByTestId("record-stat-cooking-icon");
    expect(cookingIcon.className).toContain("h-12");
    expect(cookingIcon.className).not.toContain("rounded-full");
    expect(cookingIcon.className).not.toContain("bg-[var(--surface-fill)]");
    expect(cookingIcon.querySelector("svg")?.getAttribute("class")).toContain("h-11");
    expect(cookingIcon.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 32 32");
    expect(cookingIcon.querySelector("svg")?.getAttribute("stroke-width")).toBe("1.45");
    const cookingPaths = Array.from(cookingIcon.querySelectorAll("path")).map((path) =>
      path.getAttribute("d") ?? "",
    );
    expect(cookingPaths).toEqual([
      "M13.6 8.6c0-1 .8-1.8 1.8-1.8h1.2c1 0 1.8.8 1.8 1.8v.5",
      "M9.4 12.6c1.1-2.2 3.7-3.5 6.6-3.5s5.5 1.3 6.6 3.5",
      "M8.5 13.2h15v9.5a2.9 2.9 0 0 1-2.9 2.9h-9.2a2.9 2.9 0 0 1-2.9-2.9v-9.5Z",
      "M8.5 16H5.8a1.7 1.7 0 0 0 0 3.4h2.7M23.5 16h2.7a1.7 1.7 0 0 1 0 3.4h-2.7",
    ]);
    const cookingCopy = within(header).getByTestId("record-stat-cooking-copy");
    expect(within(cookingCopy).getByText("요리기록").className).toContain("text-[11px]");
    expect(
      within(cookingCopy).getByText("요리기록").compareDocumentPosition(
        within(cookingCopy).getByText("327"),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(cookingCopy).getByText("327").className).toContain("text-[22px]");
    expect(within(header).getByText("327")).toBeTruthy();
    expect(within(header).getByText("플래너기록")).toBeTruthy();
    const plannerIcon = within(header).getByTestId("record-stat-planner-icon");
    expect(plannerIcon.className).toContain("h-12");
    expect(plannerIcon.querySelector("svg")?.getAttribute("class")).toContain("h-11");
    expect(plannerIcon.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 32 32");
    expect(plannerIcon.querySelector("svg")?.getAttribute("stroke-width")).toBe("1.45");
    expect(
      within(header).getByTestId("record-stat-planner-copy").textContent,
    ).toMatch(/^플래너기록128$/);
    expect(within(header).getByText("128")).toBeTruthy();
    expect(within(header).getByText("장보기기록")).toBeTruthy();
    const shoppingIcon = within(header).getByTestId("record-stat-shopping-icon");
    expect(shoppingIcon.className).toContain("h-12");
    expect(shoppingIcon.querySelector("svg")?.getAttribute("class")).toContain("h-11");
    expect(shoppingIcon.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 32 32");
    expect(shoppingIcon.querySelector("svg")?.getAttribute("stroke-width")).toBe("1.45");
    const shoppingPaths = Array.from(shoppingIcon.querySelectorAll("path")).map((path) =>
      path.getAttribute("d") ?? "",
    );
    expect(shoppingPaths[1]).toContain("C");
    expect(shoppingPaths[1]).not.toContain("l3.2");
    expect(
      within(header).getByTestId("record-stat-shopping-copy").textContent,
    ).toMatch(/^장보기기록214$/);
    expect(within(header).getByText("214")).toBeTruthy();
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
    const diamondRow = within(dialog).getByTestId("mypage-grade-row-diamond");
    expect(diamondRow.textContent).toContain("Diamond");
    const diamondAsset = within(diamondRow).getByTestId("grade-panel-grade-asset-diamond");
    const diamondImage = within(diamondRow).getByTestId("grade-panel-grade-image-diamond");
    expect(diamondAsset.style.width).toBe("124px");
    expect(diamondAsset.style.height).toBe("124px");
    expect(diamondAsset.className).toContain("overflow-hidden");
    expect(diamondAsset.className).toContain("rounded-full");
    expect(diamondAsset.className).toContain("bg-[var(--surface)]");
    expect(diamondImage.tagName).toBe("IMG");
    expect(diamondImage.className).toContain("scale-[1.24]");
    expect(diamondImage.getAttribute("src")).toBe("/assets/growth/grades/diamond-spoon-badge.png");
    expect(within(diamondRow).queryByTestId("growth-grade-mark-diamond")).toBeNull();
    expect(within(dialog).getByText("현재 등급")).toBeTruthy();
    expect(within(dialog).getByText("Titanium")).toBeTruthy();
    expect(within(dialog).queryByText(/rank|leaderboard|streak|claim/i)).toBeNull();
  });

  it("places mobile detail buttons above the record stats", () => {
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
        progress={MOCK_PROGRESS}
        progressState="ready"
        recordStats={{ cooking: 327, planner: 128, shopping: 214 }}
        variant="mobile"
      />,
    );

    const header = screen.getByTestId("mypage-growth-profile");
    const progressBar = within(header).getByRole("progressbar", {
      name: "Lv.46, 다음 레벨까지 3,240 XP, 진행률 69%",
    });
    const actionBar = within(header).getByTestId("mypage-profile-action-bar");
    const stats = within(header).getByLabelText("마이페이지 통계");

    expect(within(actionBar).getByText("등급")).toBeTruthy();
    expect(within(actionBar).getByText("업적")).toBeTruthy();
    expect(within(actionBar).getByText("알림")).toBeTruthy();
    expect(within(actionBar).queryByText("튜토리얼")).toBeNull();
    expect(
      progressBar.compareDocumentPosition(actionBar) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      actionBar.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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
    expect(screen.getByTestId("mypage-growth-detail-panel").className).toContain("overflow-x-hidden");
    const grid = within(dialog).getByTestId("achievement-track-grid");
    expect(grid.className).not.toContain("md:grid-cols-2");
    expect(within(dialog).getByText("4 / 9")).toBeTruthy();
    expect(within(dialog).getByRole("tab", { name: "튜토리얼" })).toBeTruthy();
    expect(within(dialog).getByRole("tab", { name: "식단·장보기·요리" })).toBeTruthy();
    expect(within(dialog).queryByRole("tab", { name: "요리" })).toBeNull();
    expect(within(dialog).getByTestId("achievement-track-tutorial").textContent).toContain(
      "획득",
    );
    expect(within(dialog).getAllByText("획득 3 / 7")).toHaveLength(1);
    expect(within(dialog).getByTestId("achievement-track-tutorial").textContent).toContain(
      "장보기 목록을 완료하면 열려요.",
    );
    expect(within(dialog).getByTestId("achievement-track-tutorial").textContent).toContain(
      "완료",
    );
    expect(
      within(dialog).getByTestId("achievement-badge-row-tutorial").children,
    ).toHaveLength(7);
    const tutorialTrack = within(dialog).getByTestId("achievement-track-tutorial");
    expect(
      within(tutorialTrack).getByTestId("achievement-track-progress-fill-tutorial").style.width,
    ).toBe("43%");
    expect(tutorialTrack.textContent).toContain("3 / 7");
    expect(
      within(tutorialTrack)
        .getByTestId("growth-badge-image-tutorial_complete")
        .closest('[data-testid="growth-badge-shape-ribbon"]'),
    ).toBeTruthy();
    expect(within(tutorialTrack).getByText("튜토리얼 완료")).toBeTruthy();
    const tutorialCompleteListItem = within(tutorialTrack)
      .getByTestId("growth-badge-image-tutorial_complete")
      .closest("li");
    expect(tutorialCompleteListItem).toBeTruthy();
    expect(
      within(tutorialCompleteListItem as HTMLElement).getByTestId("growth-badge-new-label").textContent,
    ).toBe("NEW");

    await user.click(within(dialog).getByRole("tab", { name: "식단·장보기·요리" }));
    const cookingTrack = within(dialog).getByTestId("achievement-track-cooking");
    expect(cookingTrack.textContent).toContain("요리");
    expect(cookingTrack.textContent).toContain("100회");
    expect(cookingTrack.textContent).toContain("300회");
    const cookingBadgeRow = within(cookingTrack).getByTestId("achievement-badge-row-cooking");
    expect(cookingBadgeRow.className).toContain("overflow-x-auto");
    expect(cookingBadgeRow.className).toContain("pt-2");
    const earnedCookingImage = within(cookingTrack).getByTestId(
      "growth-badge-image-cooking_completed_100",
    );
    expect(earnedCookingImage.tagName).toBe("IMG");
    expect(earnedCookingImage.getAttribute("src")).toBe(
      "/assets/growth/achievement-icons-v3-4/cooking_completed_100.png",
    );
    expect(
      earnedCookingImage.closest('[data-testid="growth-badge-shape-pot"]')?.className,
    ).toContain("bg-[radial-gradient");
    expect(
      within(cookingTrack).getByTestId("growth-badge-image-cooking_completed_300"),
    ).toBeTruthy();
    expect(within(cookingTrack).getByTestId("growth-badge-new-label").textContent).toBe("NEW");
    expect(
      within(cookingTrack).getByTestId("achievement-track-progress-fill-cooking").className,
    ).toContain("bg-[var(--brand)]");
    expect(
      within(cookingTrack).getByTestId("achievement-track-progress-fill-cooking").className,
    ).not.toContain("bg-[var(--text-3)]");
    expect(within(cookingTrack).getByTestId("growth-badge-lock")).toBeTruthy();
    expect(within(dialog).queryByTestId("achievement-stamp-cooking_completed_300")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /받기|수령|claim/i })).toBeNull();
  });

  it("opens tutorial achievements through the album and notifications from the profile buttons", async () => {
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

    expect(screen.queryByRole("button", { name: "튜토리얼 보기" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "업적 보기" }));
    const achievementDialog = screen.getByRole("dialog", { name: "업적 앨범" });
    await user.click(within(achievementDialog).getByRole("tab", { name: "튜토리얼" }));
    expect(within(achievementDialog).getByText("첫 식단 등록하기")).toBeTruthy();
    expect(within(achievementDialog).queryByRole("button", { name: /받기|수령|claim/i })).toBeNull();

    await user.click(within(achievementDialog).getByRole("button", { name: "닫기" }));
    await user.click(screen.getByRole("button", { name: "알림 보기" }));

    const notificationDialog = screen.getByRole("dialog", { name: "알림 기록" });
    await waitFor(() => {
      expect(mockFetchArchive).toHaveBeenCalledWith({ limit: 20, cursor: null });
    });
    expect(within(notificationDialog).getByText("레벨업!")).toBeTruthy();
    expect(within(notificationDialog).getByText("Diamond 등급 획득, Lv.46 달성")).toBeTruthy();
    expect(within(notificationDialog).getByText("Lv.46 달성")).toBeTruthy();
    expect(within(notificationDialog).getByText("등급 획득!")).toBeTruthy();
    const gradeNoticeIcon = within(notificationDialog)
      .getByTestId("mypage-notification-visual-notice-grade")
      .querySelector("img");
    expect(gradeNoticeIcon?.getAttribute("src")).toBe("/assets/growth/grades/diamond-spoon-badge.png");
    expect(
      within(notificationDialog)
        .getByTestId("mypage-notification-visual-notice-grade")
        .getAttribute("data-visual-kind"),
    ).toBe("grade");
    expect(within(notificationDialog).getByText("2026-06-14 10:15")).toBeTruthy();
    expect(
      within(notificationDialog).getByTestId("mypage-notification-item-notice-level").className,
    ).toContain("border-[var(--growth-toast-level-border)]");
    expect(
      within(notificationDialog)
        .getByTestId("mypage-notification-visual-notice-achievement")
        .getAttribute("data-visual-kind"),
    ).toBe("achievement");

    await user.click(within(notificationDialog).getByRole("tab", { name: "업적" }));
    expect(within(notificationDialog).getAllByText("업적 달성!")).toHaveLength(2);
    expect(within(notificationDialog).getByText("2026-06-14 10:06")).toBeTruthy();
    expect(within(notificationDialog).getByText("튜토리얼 완료 배지를 획득했어요.")).toBeTruthy();
    expect(within(notificationDialog).getByText("2026-06-14 10:02")).toBeTruthy();
    expect(within(notificationDialog).queryByText("+120 XP 획득")).toBeNull();
  });

  it("opens the notification archive when the global toast open event is dispatched", async () => {
    render(
      <MypageGrowthProfile
        gamification={MOCK_GAMIFICATION}
        gamificationState="ready"
        progress={MOCK_PROGRESS}
        progressState="ready"
        variant="mobile"
      />,
    );

    act(() => {
      window.dispatchEvent(new CustomEvent(HOMECOOK_GAMIFICATION_OPEN_NOTIFICATIONS_EVENT));
    });

    const notificationDialog = screen.getByRole("dialog", { name: "알림 기록" });
    await waitFor(() => {
      expect(mockFetchArchive).toHaveBeenCalledWith({ limit: 20, cursor: null });
    });
    expect(within(notificationDialog).getByText("레벨업!")).toBeTruthy();
  });

  it("loads older notification archive pages from the notification dialog", async () => {
    const user = userEvent.setup();
    mockFetchArchive
      .mockResolvedValueOnce({
        items: MOCK_GAMIFICATION.notifications.archive_preview.slice(0, 1),
        next_cursor: "older-cursor",
        has_next: true,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "notice-leftover-old",
            notification_type: "achievement_unlocked",
            priority: 2,
            delivery_channel: "archive_only",
            toast_eligible: false,
            group_key: "progress-event:leftover-old",
            title: "업적 달성!",
            body: "남은요리 정리 3 배지를 획득했어요. +8 XP",
            category: "leftovers",
            payload: {
              achievement_key: "leftover_eaten_3",
              badge_key: "leftover_eaten_3",
            },
            created_at: "2026-06-12T08:00:00.000Z",
            seen_at: "2026-06-12T08:30:00.000Z",
          },
        ],
        next_cursor: null,
        has_next: false,
      });

    render(
      <MypageGrowthProfile
        gamification={MOCK_GAMIFICATION}
        gamificationState="ready"
        progress={MOCK_PROGRESS}
        progressState="ready"
        variant="mobile"
      />,
    );

    await user.click(screen.getByRole("button", { name: "알림 보기" }));
    const notificationDialog = screen.getByRole("dialog", { name: "알림 기록" });

    await waitFor(() => {
      expect(mockFetchArchive).toHaveBeenCalledWith({ limit: 20, cursor: null });
    });

    await user.click(within(notificationDialog).getByRole("button", { name: "더 보기" }));

    await waitFor(() => {
      expect(mockFetchArchive).toHaveBeenCalledWith({ limit: 20, cursor: "older-cursor" });
    });
    expect(within(notificationDialog).getByText("남은요리 정리 3 배지를 획득했어요. +8 XP")).toBeTruthy();
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
    const gradeRow = within(header).getByTestId("mypage-profile-grade-row");
    expect(within(gradeRow).getByText("Clay")).toBeTruthy();
    expect(within(gradeRow).getByText("Lv.1")).toBeTruthy();
    expect(within(header).getByText("다음 레벨까지 30 XP")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "튜토리얼 보기" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "업적 보기" }));

    const achievementDialog = screen.getByRole("dialog", { name: "업적 앨범" });
    await user.click(within(achievementDialog).getByRole("tab", { name: "튜토리얼" }));
    expect(within(achievementDialog).getAllByText("0 / 1").length).toBeGreaterThan(0);
    expect(within(achievementDialog).getByText("첫 레시피 저장하기")).toBeTruthy();
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
