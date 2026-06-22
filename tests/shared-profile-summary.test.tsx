// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { ProfileSummaryButton } from "@/components/shared/profile-summary-button";
import type { UserProfileData } from "@/lib/api/mypage";
import type { UserGamificationData } from "@/types/user-gamification";
import type { UserProgressData } from "@/types/user-progress";

const PROFILE: UserProfileData = {
  email: "home@example.com",
  id: "user-1",
  nickname: "김집밥",
  profile_image_url: null,
  settings: { screen_wake_lock: false },
  social_provider: "google",
};

const PROGRESS: UserProgressData = {
  event_counts: {
    cooking_completed: 4,
    custom_book_created: 1,
    planner_registered_first: 2,
    planner_registered_repeat: 3,
    recipe_saved_distinct_ever: 6,
    shopping_completed: 5,
  },
  last_updated_at: "2026-06-21T00:00:00.000Z",
  level: {
    current_level: 3,
    current_level_start_xp: 100,
    next_level_start_xp: 250,
    progress_percent: 40,
    progress_ratio: 0.4,
    total_xp: 160,
    xp_into_current_level: 60,
    xp_to_next_level: 90,
  },
};

const GAMIFICATION: UserGamificationData = {
  achievement_album: {
    categories: [],
    summary: {
      completed_category_count: 0,
      earned_count: 0,
      total_count: 0,
    },
  },
  badges: { earned: [], locked: [] },
  featured_badges: [],
  grade: {
    grade_key: "sprout_homecook",
    label: "새싹 집밥러",
    level_max: 4,
    level_min: 1,
  },
  last_updated_at: "2026-06-21T00:00:00.000Z",
  level: {
    current_level: 3,
    progress_percent: 40,
    total_xp: 160,
    xp_to_next_level: 90,
  },
  notifications: {
    archive_preview: [
      {
        body: "Lv.3을 달성했어요.",
        category: "tutorial",
        created_at: "2026-06-21T00:00:00.000Z",
        delivery_channel: "archive_only",
        group_key: null,
        id: "archive-1",
        notification_type: "level_up",
        payload: {},
        priority: 20,
        seen_at: "2026-06-21T00:10:00.000Z",
        title: "레벨업!",
        toast_eligible: false,
      },
    ],
    priority_unseen: [
      {
        body: "레시피를 저장하면 첫 퀘스트가 진행돼요.",
        category: "tutorial",
        created_at: "2026-06-21T00:00:00.000Z",
        delivery_channel: "toast",
        group_key: null,
        id: "notice-1",
        notification_type: "xp_awarded",
        payload: {},
        priority: 10,
        seen_at: null,
        title: "튜토리얼 안내",
        toast_eligible: true,
      },
    ],
    unseen: [],
  },
  quests: {
    active: [
      {
        completed_at: null,
        description: "마음에 드는 레시피를 저장해 보세요.",
        dismissed_at: null,
        is_new: true,
        progress_current: 0,
        progress_percent: 0,
        progress_target: 1,
        quest_key: "first_recipe_saved",
        quest_type: "tutorial",
        status: "active",
        title: "첫 레시피 저장",
      },
    ],
    completed_recent: [],
  },
  tutorial: {
    active_steps: [
      {
        achievement_key: "first_recipe_saved",
        current: 0,
        status: "active",
        target: 1,
        title: "첫 레시피 저장",
      },
    ],
    category_key: "tutorial",
    completed_count: 0,
    total_count: 4,
  },
};

describe("ProfileSummaryButton", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens a shared summary panel with records, unread state, and notification archive entry", async () => {
    const user = userEvent.setup();

    render(
      <ProfileSummaryButton
        gamification={GAMIFICATION}
        isAuthenticated
        profile={PROFILE}
        progress={PROGRESS}
        variant="web"
      />,
    );

    const trigger = screen.getByTestId("web-profile-summary-button");
    expect(within(trigger).getByTestId("profile-summary-unread-badge")).toBeTruthy();

    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "마이페이지 요약" });
    expect(within(dialog).getByText("김집밥")).toBeTruthy();
    expect(within(dialog).getByText("새싹 집밥러")).toBeTruthy();
    expect(within(dialog).getByText("Lv.3")).toBeTruthy();
    expect(within(dialog).getByText("요리기록")).toBeTruthy();
    expect(within(dialog).getByText("플래너기록")).toBeTruthy();
    expect(within(dialog).getByText("장보기기록")).toBeTruthy();
    expect(within(dialog).getByText("튜토리얼 안내")).toBeTruthy();
    expect(within(dialog).getByText("첫 레시피 저장")).toBeTruthy();
    expect(within(dialog).getByText("최근 알림")).toBeTruthy();
    expect(within(dialog).getByText("레벨업!")).toBeTruthy();

    const archiveLink = within(dialog).getByRole("link", {
      name: "알림 기록 보기",
    }) as HTMLAnchorElement;
    expect(archiveLink.getAttribute("href")).toBe("/mypage?notifications=1");
  });

  it("tolerates older gamification payloads without priority or archive notification arrays", async () => {
    const user = userEvent.setup();
    const legacyGamification = {
      ...GAMIFICATION,
      grade: undefined,
      notifications: { unseen: [] },
    } as unknown as UserGamificationData;

    render(
      <ProfileSummaryButton
        gamification={legacyGamification}
        isAuthenticated
        profile={PROFILE}
        progress={PROGRESS}
        variant="mobile"
      />,
    );

    await user.click(screen.getByTestId("mobile-profile-summary-button"));

    const dialog = screen.getByRole("dialog", { name: "마이페이지 요약" });
    expect(within(dialog).getByText("튜토리얼 안내")).toBeTruthy();
    expect(within(dialog).queryByText("최근 알림")).toBeNull();
  });
});
