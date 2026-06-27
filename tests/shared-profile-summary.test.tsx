// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProfileSummaryButton } from "@/components/shared/profile-summary-button";
import { HOMECOOK_GAMIFICATION_REFRESH_EVENT } from "@/lib/gamification-events";
import type { UserProfileData } from "@/lib/api/mypage";
import type { UserGamificationData } from "@/types/user-gamification";
import type { UserProgressData } from "@/types/user-progress";

const apiMocks = vi.hoisted(() => ({
  fetchUserGamificationArchive: vi.fn(),
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
  fetchUserGamificationArchive: apiMocks.fetchUserGamificationArchive,
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
    apiMocks.fetchUserGamification.mockReset();
    apiMocks.fetchUserGamificationArchive.mockReset();
    apiMocks.fetchUserProfile.mockReset();
    apiMocks.fetchUserProgress.mockReset();
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

    expect(within(dialog).getByRole("button", {
      name: "알림 기록 보기",
    })).toBeTruthy();
  });

  it("does not expose mypage navigation links from the ready summary panel", async () => {
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

    await user.click(screen.getByTestId("web-profile-summary-button"));

    const dialog = screen.getByRole("dialog", { name: "마이페이지 요약" });
    expect(within(dialog).queryByRole("link", { name: "마이페이지로 이동" })).toBeNull();
    expect(within(dialog).queryByText("마이페이지로 이동")).toBeNull();
  });

  it("does not expose mypage navigation links from guest and loading summary panels", async () => {
    const user = userEvent.setup();

    const guest = render(<ProfileSummaryButton isAuthenticated={false} variant="mobile" />);
    await user.click(screen.getByTestId("mobile-profile-summary-button"));
    expect(screen.queryByRole("link", { name: "마이페이지로 이동" })).toBeNull();
    expect(screen.queryByText("마이페이지로 이동")).toBeNull();

    guest.unmount();

    render(<ProfileSummaryButton isAuthenticated variant="mobile" />);
    await user.click(screen.getByTestId("mobile-profile-summary-button"));
    expect(screen.queryByRole("link", { name: "마이페이지로 이동" })).toBeNull();
    expect(screen.queryByText("마이페이지로 이동")).toBeNull();
  });

  it("uses the next tutorial active step for the tutorial notice instead of later active quests", async () => {
    const user = userEvent.setup();
    const gamification = {
      ...GAMIFICATION,
      notifications: {
        archive_preview: [],
        priority_unseen: [],
        unseen: [],
      },
      quests: {
        active: [
          {
            completed_at: null,
            description: "직접 쓸 레시피북을 하나 만들어보세요.",
            dismissed_at: null,
            is_new: false,
            progress_current: 0,
            progress_percent: 0,
            progress_target: 1,
            quest_key: "first_custom_book_created",
            quest_type: "tutorial",
            status: "active",
            title: "나만의 레시피북 생성하기",
          },
        ],
        completed_recent: [],
      },
      tutorial: {
        ...GAMIFICATION.tutorial,
        active_steps: [
          {
            achievement_key: "tutorial_recipe_saved",
            current: 0,
            status: "active",
            target: 1,
            title: "첫 레시피 저장",
          },
        ],
      },
    } satisfies UserGamificationData;

    render(
      <ProfileSummaryButton
        gamification={gamification}
        isAuthenticated
        profile={PROFILE}
        progress={PROGRESS}
        variant="web"
      />,
    );

    await user.click(screen.getByTestId("web-profile-summary-button"));

    const dialog = screen.getByRole("dialog", { name: "마이페이지 요약" });
    expect(within(dialog).getByText("튜토리얼 안내")).toBeTruthy();
    expect(within(dialog).getByText("마음에 드는 레시피 저장하기")).toBeTruthy();
    expect(within(dialog).getByText("레시피의 저장 버튼을 눌러 레시피를 저장해보세요.")).toBeTruthy();
    expect(within(dialog).queryByText("나만의 레시피북 생성하기")).toBeNull();
  });

  it("falls back to the next active tutorial quest when active_steps are empty after a completed tutorial", async () => {
    const user = userEvent.setup();
    const gamification = {
      ...GAMIFICATION,
      achievement_album: {
        ...GAMIFICATION.achievement_album,
        categories: [
          {
            category_key: "tutorial",
            earned_count: 1,
            label: "튜토리얼",
            milestones: [],
            total_count: 6,
          },
        ],
        summary: {
          completed_category_count: 0,
          earned_count: 1,
          total_count: 6,
        },
      },
      quests: {
        active: [
          {
            completed_at: null,
            description: "오늘 먹을 끼니를 플래너에 하나 등록해보세요.",
            dismissed_at: null,
            is_new: true,
            progress_current: 0,
            progress_percent: 0,
            progress_target: 1,
            quest_key: "first_planner_registered",
            quest_type: "tutorial",
            status: "active",
            title: "플래너에 끼니 등록하기",
          },
        ],
        completed_recent: [],
      },
      tutorial: {
        ...GAMIFICATION.tutorial,
        active_steps: [],
        completed_count: 1,
      },
    } satisfies UserGamificationData;

    render(
      <ProfileSummaryButton
        gamification={gamification}
        isAuthenticated
        profile={PROFILE}
        progress={PROGRESS}
        variant="web"
      />,
    );

    await user.click(screen.getByTestId("web-profile-summary-button"));

    const dialog = screen.getByRole("dialog", { name: "마이페이지 요약" });
    expect(within(dialog).getByText("튜토리얼 안내")).toBeTruthy();
    expect(within(dialog).getByText("플래너에 끼니 등록하기")).toBeTruthy();
    expect(within(dialog).getByText("레시피에서 플래너에 추가를 누르면 플래너에 끼니를 등록할 수 있어요.")).toBeTruthy();
    expect(within(dialog).queryByText("마음에 드는 레시피 저장하기")).toBeNull();
  });

  it("updates the tutorial notice from the shared gamification refresh event", async () => {
    const user = userEvent.setup();
    const nextGamification = {
      ...GAMIFICATION,
      quests: {
        active: [
          {
            completed_at: null,
            description: "오늘 먹을 끼니를 플래너에 하나 등록해보세요.",
            dismissed_at: null,
            is_new: true,
            progress_current: 0,
            progress_percent: 0,
            progress_target: 1,
            quest_key: "first_planner_registered",
            quest_type: "tutorial",
            status: "active",
            title: "플래너에 끼니 등록하기",
          },
        ],
        completed_recent: [],
      },
      tutorial: {
        ...GAMIFICATION.tutorial,
        active_steps: [],
        completed_count: 1,
      },
    } satisfies UserGamificationData;

    apiMocks.fetchUserGamification.mockResolvedValue(nextGamification);
    apiMocks.fetchUserProgress.mockResolvedValue(PROGRESS);

    render(
      <ProfileSummaryButton
        gamification={GAMIFICATION}
        isAuthenticated
        profile={PROFILE}
        progress={PROGRESS}
        variant="web"
      />,
    );

    await user.click(screen.getByTestId("web-profile-summary-button"));

    const dialog = screen.getByRole("dialog", { name: "마이페이지 요약" });
    expect(within(dialog).getByText("첫 레시피 저장")).toBeTruthy();

    window.dispatchEvent(new CustomEvent(HOMECOOK_GAMIFICATION_REFRESH_EVENT));

    await waitFor(() => {
      expect(apiMocks.fetchUserGamification).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(within(dialog).getByText("플래너에 끼니 등록하기")).toBeTruthy();
    });
    expect(within(dialog).queryByText("첫 레시피 저장")).toBeNull();
  });

  it("explains how to create the first shopping list in the tutorial notice", async () => {
    const user = userEvent.setup();
    const gamification = {
      ...GAMIFICATION,
      notifications: {
        archive_preview: [],
        priority_unseen: [],
        unseen: [],
      },
      quests: {
        active: [
          {
            completed_at: null,
            description: "여러 끼니를 한 번에 장보기할 수 있어요.",
            dismissed_at: null,
            is_new: true,
            progress_current: 0,
            progress_percent: 0,
            progress_target: 1,
            quest_key: "first_shopping_list_created",
            quest_type: "tutorial",
            status: "active",
            title: "첫 장보기 목록 만들기",
          },
        ],
        completed_recent: [],
      },
      tutorial: {
        ...GAMIFICATION.tutorial,
        active_steps: [
          {
            achievement_key: "tutorial_shopping_list_create",
            current: 0,
            status: "active",
            target: 1,
            title: "첫 장보기 목록 만들기",
          },
        ],
        completed_count: 2,
      },
    } satisfies UserGamificationData;

    render(
      <ProfileSummaryButton
        gamification={gamification}
        isAuthenticated
        profile={PROFILE}
        progress={PROGRESS}
        variant="web"
      />,
    );

    await user.click(screen.getByTestId("web-profile-summary-button"));

    const dialog = screen.getByRole("dialog", { name: "마이페이지 요약" });
    expect(within(dialog).getByText("첫 장보기 목록 만들기")).toBeTruthy();
    expect(
      within(dialog).getByText(
        "플래너에 등록한 끼니에서 장보기를 누르면, 장보기 목록을 만들 수 있어요.",
      ),
    ).toBeTruthy();
  });

  it.each(["web", "mobile"] as const)(
    "opens the notification archive dialog in place from the %s summary action",
    async (variant) => {
      const user = userEvent.setup();
      apiMocks.fetchUserGamificationArchive.mockResolvedValue({
        has_next: false,
        items: GAMIFICATION.notifications.archive_preview,
        next_cursor: null,
      });

      render(
        <ProfileSummaryButton
          gamification={GAMIFICATION}
          isAuthenticated
          profile={PROFILE}
          progress={PROGRESS}
          variant={variant}
        />,
      );

      await user.click(screen.getByTestId(`${variant}-profile-summary-button`));

      const summaryDialog = screen.getByRole("dialog", { name: "마이페이지 요약" });
      await user.click(within(summaryDialog).getByRole("button", { name: "알림 기록 보기" }));

      expect(screen.queryByRole("dialog", { name: "마이페이지 요약" })).toBeNull();
      expect(screen.getByRole("dialog", { name: "알림 기록" })).toBeTruthy();
      expect(apiMocks.fetchUserGamificationArchive).toHaveBeenCalledWith({
        cursor: null,
        limit: 20,
      });
    },
  );

  it.each(["web", "mobile"] as const)(
    "opens the notification archive as a body-level modal with a persistent close header from the %s summary action",
    async (variant) => {
      const user = userEvent.setup();
      apiMocks.fetchUserGamificationArchive.mockResolvedValue({
        has_next: false,
        items: GAMIFICATION.notifications.archive_preview,
        next_cursor: null,
      });

      render(
        <ProfileSummaryButton
          gamification={GAMIFICATION}
          isAuthenticated
          profile={PROFILE}
          progress={PROGRESS}
          variant={variant}
        />,
      );

      await user.click(screen.getByTestId(`${variant}-profile-summary-button`));
      await user.click(screen.getByRole("button", { name: "알림 기록 보기" }));

      const overlay = screen.getByTestId("mypage-growth-detail-overlay");
      const panel = screen.getByTestId("mypage-growth-detail-panel");
      const header = screen.getByTestId("mypage-growth-detail-header");
      const content = screen.getByTestId("mypage-growth-detail-content");

      expect(overlay.parentElement).toBe(document.body);
      expect(panel.className).toContain("overflow-hidden");
      expect(panel.className).toContain("flex");
      expect(header.className).toContain("shrink-0");
      expect(content.className).toContain("overflow-y-auto");

      await user.click(overlay);

      expect(screen.queryByRole("dialog", { name: "알림 기록" })).toBeNull();
    },
  );

  it("shows the current tutorial guide again from the notification archive system tab", async () => {
    const user = userEvent.setup();
    const gamification = {
      ...GAMIFICATION,
      notifications: {
        archive_preview: [],
        priority_unseen: [],
        unseen: [],
      },
      quests: {
        active: [
          {
            completed_at: null,
            description: "여러 끼니를 한 번에 장보기할 수 있어요.",
            dismissed_at: null,
            is_new: true,
            progress_current: 0,
            progress_percent: 0,
            progress_target: 1,
            quest_key: "first_shopping_list_created",
            quest_type: "tutorial",
            status: "active",
            title: "첫 장보기 목록 만들기",
          },
        ],
        completed_recent: [],
      },
      tutorial: {
        ...GAMIFICATION.tutorial,
        active_steps: [
          {
            achievement_key: "tutorial_shopping_list_create",
            current: 0,
            status: "active",
            target: 1,
            title: "첫 장보기 목록 만들기",
          },
        ],
        completed_count: 2,
      },
    } satisfies UserGamificationData;

    apiMocks.fetchUserGamificationArchive.mockResolvedValue({
      has_next: false,
      items: [],
      next_cursor: null,
    });

    render(
      <ProfileSummaryButton
        gamification={gamification}
        isAuthenticated
        profile={PROFILE}
        progress={PROGRESS}
        variant="web"
      />,
    );

    await user.click(screen.getByTestId("web-profile-summary-button"));
    await user.click(screen.getByRole("button", { name: "알림 기록 보기" }));

    const archiveDialog = screen.getByRole("dialog", { name: "알림 기록" });
    await waitFor(() => {
      expect(within(archiveDialog).getByText("튜토리얼 안내")).toBeTruthy();
    });
    expect(within(archiveDialog).getByText(/첫 장보기 목록 만들기/)).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "시스템" }));

    expect(within(archiveDialog).getByText("튜토리얼 안내")).toBeTruthy();
    expect(within(archiveDialog).getByText(/첫 장보기 목록 만들기/)).toBeTruthy();
    expect(
      within(archiveDialog).getByText(
        /플래너에 등록한 끼니에서 장보기를 누르면, 장보기 목록을 만들 수 있어요/,
      ),
    ).toBeTruthy();
    expect(within(archiveDialog).queryByText("아직 표시할 알림 기록이 없어요.")).toBeNull();
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

  it("opens the mobile summary as a fixed surface so sticky content cannot cover it", async () => {
    const user = userEvent.setup();

    render(
      <ProfileSummaryButton
        gamification={GAMIFICATION}
        isAuthenticated
        profile={PROFILE}
        progress={PROGRESS}
        variant="mobile"
      />,
    );

    await user.click(screen.getByTestId("mobile-profile-summary-button"));

    expect(screen.getByRole("dialog", { name: "마이페이지 요약" }).className).toContain(
      "profile-summary-popover-mobile",
    );
  });

  it("closes the web summary when clicking outside the profile surface", async () => {
    const user = userEvent.setup();

    render(
      <>
        <ProfileSummaryButton
          gamification={GAMIFICATION}
          isAuthenticated
          profile={PROFILE}
          progress={PROGRESS}
          variant="web"
        />
        <button type="button">다른 영역</button>
      </>,
    );

    await user.click(screen.getByTestId("web-profile-summary-button"));
    expect(screen.getByRole("dialog", { name: "마이페이지 요약" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "다른 영역" }));

    expect(screen.queryByRole("dialog", { name: "마이페이지 요약" })).toBeNull();
  });

  it("closes the mobile summary when tapping outside the profile surface", async () => {
    const user = userEvent.setup();

    render(
      <>
        <ProfileSummaryButton
          gamification={GAMIFICATION}
          isAuthenticated
          profile={PROFILE}
          progress={PROGRESS}
          variant="mobile"
        />
        <button type="button">다른 영역</button>
      </>,
    );

    await user.click(screen.getByTestId("mobile-profile-summary-button"));
    expect(screen.getByRole("dialog", { name: "마이페이지 요약" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "다른 영역" }));

    expect(screen.queryByRole("dialog", { name: "마이페이지 요약" })).toBeNull();
  });

  it("reuses a prior shell summary across autoload remounts to avoid nav flicker", () => {
    apiMocks.fetchUserProfile.mockResolvedValue(PROFILE);
    apiMocks.fetchUserProgress.mockResolvedValue(PROGRESS);
    apiMocks.fetchUserGamification.mockResolvedValue(GAMIFICATION);

    const first = render(
      <ProfileSummaryButton
        gamification={GAMIFICATION}
        isAuthenticated
        profile={PROFILE}
        progress={PROGRESS}
        variant="web"
      />,
    );
    expect(screen.getByLabelText("김집밥 프로필 요약 열기")).toBeTruthy();

    first.unmount();
    render(<ProfileSummaryButton autoLoad isAuthenticated variant="web" />);

    expect(screen.getByLabelText("김집밥 프로필 요약 열기")).toBeTruthy();
    expect(apiMocks.fetchUserProfile).not.toHaveBeenCalled();
    expect(apiMocks.fetchUserProgress).not.toHaveBeenCalled();
    expect(apiMocks.fetchUserGamification).not.toHaveBeenCalled();
  });

  it("can render only from cache without starting a new summary request", () => {
    const first = render(
      <ProfileSummaryButton
        gamification={GAMIFICATION}
        isAuthenticated
        profile={PROFILE}
        progress={PROGRESS}
        variant="mobile"
      />,
    );
    expect(screen.getByLabelText("김집밥 프로필 요약 열기")).toBeTruthy();

    first.unmount();
    apiMocks.fetchUserProfile.mockClear();
    apiMocks.fetchUserProgress.mockClear();
    apiMocks.fetchUserGamification.mockClear();

    render(
      <ProfileSummaryButton
        isAuthenticated
        useCachedSummary
        variant="mobile"
      />,
    );

    expect(screen.getByLabelText("김집밥 프로필 요약 열기")).toBeTruthy();
    expect(apiMocks.fetchUserProfile).not.toHaveBeenCalled();
    expect(apiMocks.fetchUserProgress).not.toHaveBeenCalled();
    expect(apiMocks.fetchUserGamification).not.toHaveBeenCalled();
  });
});
