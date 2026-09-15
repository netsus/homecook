// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProfileSummaryButton } from "@/components/shared/profile-summary-button";
import { HOMECOOK_GAMIFICATION_REFRESH_EVENT } from "@/lib/gamification-events";
import type { UserProfileData } from "@/lib/api/mypage";
import type { UserGamificationData } from "@/types/user-gamification";
import type { UserProgressData } from "@/types/user-progress";

const apiMocks = vi.hoisted(() => ({
  fetchUserGamification: vi.fn(),
  fetchUserProfile: vi.fn(),
  fetchUserProgress: vi.fn(),
}));

vi.mock("@/lib/api/mypage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/mypage")>();

  return {
    ...actual,
    fetchUserProfile: apiMocks.fetchUserProfile,
  };
});

vi.mock("@/lib/api/user-progress", () => ({
  fetchUserProgress: apiMocks.fetchUserProgress,
}));

vi.mock("@/lib/api/user-gamification", () => ({
  fetchUserGamification: apiMocks.fetchUserGamification,
}));

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
    archive_preview: [],
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
    active_steps: [],
    category_key: "tutorial",
    completed_count: 0,
    total_count: 4,
  },
};

describe("ProfileSummaryButton", () => {
  afterEach(() => {
    cleanup();
    apiMocks.fetchUserGamification.mockReset();
    apiMocks.fetchUserProfile.mockReset();
    apiMocks.fetchUserProgress.mockReset();
  });

  it(
    "renders the web profile control as a mypage link",
    () => {
      render(
        <ProfileSummaryButton
          gamification={GAMIFICATION}
          isAuthenticated
          profile={PROFILE}
          progress={PROGRESS}
          variant="web"
        />,
      );

      const link = screen.getByTestId("web-profile-summary-button");
      expect(link.tagName).toBe("A");
      expect(link.getAttribute("href")).toBe("/mypage");
      expect(link.getAttribute("aria-label")).toBe("마이페이지");
      expect(screen.queryByRole("dialog", { name: "마이페이지 요약" })).toBeNull();
    },
  );

  it("omits the redundant mobile profile control", () => {
    render(<ProfileSummaryButton isAuthenticated profile={PROFILE} variant="mobile" />);
    expect(screen.queryByTestId("mobile-profile-summary-button")).toBeNull();
  });

  it("leaves unread state to the notification control", () => {
    render(
      <ProfileSummaryButton
        gamification={GAMIFICATION}
        isAuthenticated
        profile={PROFILE}
        progress={PROGRESS}
        variant="web"
      />,
    );

    const link = screen.getByTestId("web-profile-summary-button");
    expect(within(link).queryByTestId("profile-summary-unread-badge")).toBeNull();
  });

  it("reuses cached profile data without duplicate summary requests", () => {
    apiMocks.fetchUserProfile.mockResolvedValue(PROFILE);
    apiMocks.fetchUserProgress.mockResolvedValue(PROGRESS);
    apiMocks.fetchUserGamification.mockResolvedValue(GAMIFICATION);

    render(<ProfileSummaryButton autoLoad isAuthenticated variant="web" />);

    expect(apiMocks.fetchUserProfile).not.toHaveBeenCalled();
    expect(apiMocks.fetchUserProgress).not.toHaveBeenCalled();
    expect(apiMocks.fetchUserGamification).not.toHaveBeenCalled();

    const link = screen.getByTestId("web-profile-summary-button");
    expect(link.getAttribute("href")).toBe("/mypage");
    expect(screen.queryByRole("dialog", { name: "마이페이지 요약" })).toBeNull();
  });

  it("does not duplicate growth refreshes owned by the notification control", async () => {
    apiMocks.fetchUserProgress.mockResolvedValue(PROGRESS);
    apiMocks.fetchUserGamification.mockResolvedValue({
      ...GAMIFICATION,
      notifications: {
        archive_preview: [],
        priority_unseen: [],
        unseen: [],
      },
      quests: {
        active: [],
        completed_recent: [],
      },
    } satisfies UserGamificationData);

    render(
      <ProfileSummaryButton
        gamification={GAMIFICATION}
        isAuthenticated
        profile={PROFILE}
        progress={PROGRESS}
        variant="web"
      />,
    );

    expect(screen.queryByTestId("profile-summary-unread-badge")).toBeNull();

    window.dispatchEvent(new CustomEvent(HOMECOOK_GAMIFICATION_REFRESH_EVENT));

    expect(apiMocks.fetchUserProgress).not.toHaveBeenCalled();
    expect(apiMocks.fetchUserGamification).not.toHaveBeenCalled();
  });
});
