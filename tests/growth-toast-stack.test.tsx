// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GrowthToastStack } from "@/components/gamification/growth-toast-stack";
import {
  HOMECOOK_GAMIFICATION_REFRESH_EVENT,
  ONBOARDING_TUTORIAL_REFRESH_KEY,
} from "@/lib/gamification-events";

const mockNextNavigation = vi.hoisted(() => ({
  pathname: "/",
}));
const mockFetchUserGamification = vi.fn();
const mockFetchArchive = vi.fn();
const mockMarkSeen = vi.fn();
let desktopMatches = false;
let mediaListeners: Array<() => void> = [];

vi.mock("next/navigation", () => ({
  usePathname: () => mockNextNavigation.pathname,
}));

vi.mock("@/lib/api/user-gamification", () => ({
  fetchUserGamificationArchive: (...args: unknown[]) => mockFetchArchive(...args),
  fetchUserGamification: (...args: unknown[]) => mockFetchUserGamification(...args),
  markUserGamificationNotificationsSeen: (...args: unknown[]) => mockMarkSeen(...args),
}));

function makeNotification(
  overrides: Partial<Record<string, unknown>> & { id: string },
) {
  return {
    id: overrides.id,
    notification_type: overrides.notification_type ?? "xp_awarded",
    priority: overrides.priority ?? 4,
    delivery_channel: overrides.delivery_channel ?? "toast",
    toast_eligible: overrides.toast_eligible ?? true,
    group_key: overrides.group_key ?? null,
    title: overrides.title ?? "",
    body: overrides.body ?? "",
    category: overrides.category ?? "cooking",
    payload: overrides.payload ?? {},
    created_at: overrides.created_at ?? "2026-06-11T00:00:00.000Z",
    seen_at: overrides.seen_at ?? null,
  };
}

function makeGamificationWithTutorialStep(
  step: {
    achievementKey: string;
    title: string;
  },
) {
  return {
    achievement_album: {
      categories: [],
      summary: { completed_category_count: 0, earned_count: 0, total_count: 0 },
    },
    badges: { earned: [], locked: [] },
    featured_badges: [],
    grade: { grade_key: "sprout_homecook", label: "새싹 집밥러", level_min: 1, level_max: 4 },
    last_updated_at: "2026-06-21T00:00:00.000Z",
    level: { current_level: 1, progress_percent: 0, total_xp: 0, xp_to_next_level: 100 },
    notifications: {
      archive_preview: [],
      priority_unseen: [],
      unseen: [],
    },
    quests: {
      active: [],
      completed_recent: [],
    },
    tutorial: {
      active_steps: [
        {
          achievement_key: step.achievementKey,
          current: 0,
          status: "active",
          target: 1,
          title: step.title,
        },
      ],
      category_key: "tutorial",
      completed_count: 0,
      total_count: 6,
    },
  };
}

function makeGamificationAfterFirstTutorialComplete() {
  return {
    ...makeGamificationWithTutorialStep({
      achievementKey: "tutorial_recipe_saved",
      title: "첫 레시피 저장",
    }),
    achievement_album: {
      categories: [
        {
          category_key: "tutorial",
          earned_count: 1,
          label: "튜토리얼",
          milestones: [
            {
              achievement_key: "tutorial_recipe_saved",
              badge: {
                badge_key: "tutorial_recipe_saved",
                category: "tutorial",
                shape_key: "bookmark",
              },
              current: 1,
              description: "마음에 드는 레시피를 처음 저장했어요.",
              earned_at: "2026-06-21T00:01:00.000Z",
              locked_hint: null,
              status: "earned",
              target: 1,
              title: "첫 레시피 저장",
              track_key: "tutorial",
            },
          ],
          total_count: 6,
        },
      ],
      summary: { completed_category_count: 0, earned_count: 1, total_count: 6 },
    },
    last_updated_at: "2026-06-21T00:01:00.000Z",
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
      active_steps: [],
      category_key: "tutorial",
      completed_count: 1,
      total_count: 6,
    },
  };
}

function setDesktop(isDesktop: boolean) {
  desktopMatches = isDesktop;
  mediaListeners = [];
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    get matches() {
      return desktopMatches && query === "(min-width: 768px)";
    },
    media: query,
    addEventListener: vi.fn((_event: string, listener: () => void) => {
      mediaListeners.push(listener);
    }),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
}

function resizeToDesktop(isDesktop: boolean) {
  desktopMatches = isDesktop;
  act(() => {
    for (const listener of mediaListeners) {
      listener();
    }
  });
}

function dispatchRefresh() {
  act(() => {
    window.dispatchEvent(new CustomEvent(HOMECOOK_GAMIFICATION_REFRESH_EVENT));
  });
}

describe("GrowthToastStack", () => {
  beforeEach(() => {
    mockFetchArchive.mockReset();
    mockFetchUserGamification.mockReset();
    mockMarkSeen.mockReset();
    window.sessionStorage.clear();
    mockFetchArchive.mockResolvedValue({ items: [], next_cursor: null, has_next: false });
    mockMarkSeen.mockResolvedValue({ seen_notification_ids: [] });
    mockNextNavigation.pathname = "/";
    setDesktop(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("renders priority_unseen toasts in server order without reordering", async () => {
    setDesktop(true); // desktop visible max 3
    mockFetchUserGamification.mockResolvedValue({
      notifications: {
        unseen: [],
        priority_unseen: [
          makeNotification({ id: "n-level", notification_type: "level_up", priority: 1, title: "레벨 2 달성", body: "축하해요" }),
          makeNotification({ id: "n-badge", notification_type: "badge_unlocked", priority: 2, title: "새 배지", body: "획득" }),
          makeNotification({ id: "n-xp", notification_type: "xp_awarded", priority: 4, title: "요리 완료 +60 XP", body: "반영됨" }),
        ],
      },
    });

    render(<GrowthToastStack />);
    dispatchRefresh();

    await waitFor(() => {
      expect(screen.getAllByTestId("growth-toast")).toHaveLength(3);
    });
    const toasts = screen.getAllByTestId("growth-toast");
    expect(toasts[0].getAttribute("data-notification-type")).toBe("level_up");
    expect(toasts[1].getAttribute("data-notification-type")).toBe("badge_unlocked");
    expect(toasts[2].getAttribute("data-notification-type")).toBe("xp_awarded");
    // level_up이 가장 강한 tone
    expect(toasts[0].getAttribute("data-tone")).toBe("level-up");
    expect(toasts[0].className).toContain("growth-toast-card-level-up");
    expect(
      within(toasts[0]).getByTestId("growth-toast-visual").getAttribute("data-visual-kind"),
    ).toBe("level");
    expect(within(toasts[0]).getByTestId("growth-toast-priority-rank").textContent).toBe("1");
    expect(within(toasts[1]).getByTestId("growth-toast-priority-rank").textContent).toBe("2");
    expect(within(toasts[2]).getByTestId("growth-toast-priority-rank").textContent).toBe("3");
  });

  it("does not fetch gamification while the global stack is mounted for a guest", async () => {
    const GuestGrowthToastStack = GrowthToastStack as React.ComponentType<{
      initialAuthenticated: boolean;
    }>;
    const { rerender } = render(<GuestGrowthToastStack initialAuthenticated={false} />);

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockFetchUserGamification).not.toHaveBeenCalled();

    mockNextNavigation.pathname = "/login";
    rerender(<GuestGrowthToastStack initialAuthenticated={false} />);
    dispatchRefresh();

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockFetchUserGamification).not.toHaveBeenCalled();
    expect(screen.queryByTestId("growth-toast")).toBeNull();
  });

  it("shows the first tutorial quest as a toast on initial load when there are no notification rows", async () => {
    mockFetchUserGamification.mockResolvedValue(
      makeGamificationWithTutorialStep({
        achievementKey: "tutorial_recipe_saved",
        title: "첫 레시피 저장",
      }),
    );

    render(<GrowthToastStack />);

    await waitFor(() => {
      expect(screen.getByTestId("growth-toast")).toBeTruthy();
    });

    const toast = screen.getByTestId("growth-toast");
    expect(toast.textContent).toContain("튜토리얼 안내");
    expect(toast.textContent).toContain("마음에 드는 레시피 저장하기");
    expect(toast.textContent).toContain("레시피의 저장 버튼을 눌러 레시피를 저장해보세요.");
  });

  it("delays the first tutorial quest toast until the nickname onboarding route has changed", async () => {
    const firstTutorialGamification = makeGamificationWithTutorialStep({
      achievementKey: "tutorial_recipe_saved",
      title: "첫 레시피 저장",
    });
    mockNextNavigation.pathname = "/onboarding/nickname";
    mockFetchUserGamification.mockResolvedValue(firstTutorialGamification);

    const { rerender } = render(<GrowthToastStack />);

    await waitFor(() => {
      expect(mockFetchUserGamification).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("growth-toast")).toBeNull();

    mockFetchUserGamification.mockResolvedValue(firstTutorialGamification);
    mockNextNavigation.pathname = "/";
    rerender(<GrowthToastStack />);

    await waitFor(() => {
      expect(screen.getByTestId("growth-toast").textContent).toContain(
        "마음에 드는 레시피 저장하기",
      );
    });
  });

  it("retries the first tutorial guide on the first service route after nickname onboarding", async () => {
    const firstTutorialGamification = makeGamificationWithTutorialStep({
      achievementKey: "tutorial_recipe_saved",
      title: "첫 레시피 저장",
    });
    mockNextNavigation.pathname = "/mypage";
    window.sessionStorage.setItem(ONBOARDING_TUTORIAL_REFRESH_KEY, "pending");
    mockFetchUserGamification.mockResolvedValue(firstTutorialGamification);

    render(<GrowthToastStack />);

    await waitFor(() => {
      expect(screen.getByTestId("growth-toast").textContent).toContain(
        "마음에 드는 레시피 저장하기",
      );
    });
    expect(window.sessionStorage.getItem(ONBOARDING_TUTORIAL_REFRESH_KEY)).toBeNull();
  });

  it("shows the next tutorial quest as a toast after the prior tutorial step is completed", async () => {
    mockFetchUserGamification.mockResolvedValue(
      makeGamificationWithTutorialStep({
        achievementKey: "tutorial_planner_registered",
        title: "플래너에 끼니 등록하기",
      }),
    );

    render(<GrowthToastStack />);

    await waitFor(() => {
      expect(screen.getByTestId("growth-toast")).toBeTruthy();
    });

    const toast = screen.getByTestId("growth-toast");
    expect(toast.textContent).toContain("튜토리얼 안내");
    expect(toast.textContent).toContain("플래너에 끼니 등록하기");
    expect(toast.textContent).toContain("레시피에서 플래너에 추가를 누르면 플래너에 끼니를 등록할 수 있어요.");
    expect(toast.textContent).not.toContain("마음에 드는 레시피 저장하기");
  });

  it("shows the second tutorial quest after refreshing from the first completed tutorial quest", async () => {
    mockFetchUserGamification
      .mockResolvedValueOnce(
        makeGamificationWithTutorialStep({
          achievementKey: "tutorial_recipe_saved",
          title: "첫 레시피 저장",
        }),
      )
      .mockResolvedValueOnce(makeGamificationAfterFirstTutorialComplete());

    render(<GrowthToastStack />);

    await waitFor(() => {
      expect(screen.getByTestId("growth-toast").textContent).toContain(
        "마음에 드는 레시피 저장하기",
      );
    });

    dispatchRefresh();

    await waitFor(() => {
      expect(screen.getByText(/플래너에 끼니 등록하기/)).toBeTruthy();
    });
    expect(screen.getByText(/레시피에서 플래너에 추가를 누르면 플래너에 끼니를 등록할 수 있어요/)).toBeTruthy();
  });

  it("runs a pending refresh after a source action fires during an existing refresh", async () => {
    let resolveInitialRefresh:
      | ((value: { notifications: { priority_unseen: unknown[]; unseen: unknown[] } }) => void)
      | null = null;
    const initialRefresh = new Promise<{
      notifications: { priority_unseen: unknown[]; unseen: unknown[] };
    }>((resolve) => {
      resolveInitialRefresh = resolve;
    });

    mockFetchUserGamification
      .mockReturnValueOnce(initialRefresh)
      .mockResolvedValueOnce({
        notifications: {
          unseen: [],
          priority_unseen: [
            makeNotification({
              id: "first-recipe-save",
              notification_type: "achievement_unlocked",
              group_key: "progress-event:recipe-save",
              title: "업적 달성!",
              body: "첫 레시피 저장 배지를 획득했어요. +15 XP",
              payload: {
                achievement_key: "first_recipe_saved",
                badge_key: "first_recipe_saved",
              },
            }),
          ],
        },
        quests: { active: [] },
        tutorial: { active_steps: [] },
      });

    render(<GrowthToastStack />);
    dispatchRefresh();

    await act(async () => {
      resolveInitialRefresh?.({
        notifications: {
          priority_unseen: [],
          unseen: [],
        },
      });
      await initialRefresh;
    });

    await waitFor(() => {
      expect(mockFetchUserGamification).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByTestId("growth-toast").textContent).toContain("+15 XP");
    });
  });

  it("does not send synthetic tutorial guide toasts to the seen API", async () => {
    mockFetchUserGamification.mockResolvedValue(
      makeGamificationWithTutorialStep({
        achievementKey: "tutorial_recipe_saved",
        title: "첫 레시피 저장",
      }),
    );

    render(<GrowthToastStack />);

    await waitFor(() => {
      expect(screen.getByTestId("growth-toast")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "알림 닫기" }));

    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it("uses a grade acquisition visual only when level-up crosses into a new grade", async () => {
    setDesktop(true);
    mockFetchUserGamification.mockResolvedValue({
      notifications: {
        unseen: [],
        priority_unseen: [
          makeNotification({
            id: "n-grade",
            notification_type: "level_up",
            priority: 1,
            title: "등급 획득!",
            body: "Steel 등급 획득, Lv.8 달성",
            payload: {
              previous_level: 7,
              current_level: 8,
              grade_upgrade: true,
              previous_grade: { grade_key: "wood", label: "Wood" },
              grade: {
                grade_key: "steel",
                label: "Steel",
                icon_url: "/assets/growth/grades/steel-spoon-badge.png",
              },
            },
          }),
          makeNotification({
            id: "n-level",
            notification_type: "level_up",
            priority: 1,
            title: "레벨업!",
            body: "Lv.9 달성",
            payload: {
              previous_level: 8,
              current_level: 9,
              previous_grade: { grade_key: "steel", label: "Steel" },
              grade: { grade_key: "steel", label: "Steel" },
            },
          }),
        ],
      },
    });

    render(<GrowthToastStack />);
    dispatchRefresh();

    await waitFor(() => {
      expect(screen.getAllByTestId("growth-toast")).toHaveLength(2);
    });

    const [gradeToast, levelToast] = screen.getAllByTestId("growth-toast");
    expect(gradeToast.getAttribute("data-tone")).toBe("grade-up");
    expect(gradeToast.getAttribute("role")).toBe("alert");
    expect(gradeToast.className).toContain("growth-toast-card-grade-up");
    expect(gradeToast.className).toContain("overflow-visible");
    expect(within(gradeToast).getByTestId("growth-toast-priority-rank").textContent).toBe("1");
    expect(
      within(gradeToast).getByTestId("growth-toast-visual").getAttribute("data-visual-kind"),
    ).toBe("grade");
    expect(
      within(gradeToast)
        .getByTestId("growth-toast-visual-icon")
        .getAttribute("src"),
    ).toContain("/assets/growth/grades/steel-spoon-badge.png");
    expect(gradeToast.textContent).toContain("Steel 등급 획득, Lv.8 달성");

    expect(levelToast.getAttribute("data-tone")).toBe("level-up");
    expect(
      within(levelToast).getByTestId("growth-toast-visual").getAttribute("data-visual-kind"),
    ).toBe("level");
    expect(within(levelToast).queryByTestId("growth-toast-visual-icon")).toBeNull();
  });

  it("uses content-specific visuals for XP, achievement, and badge toasts", async () => {
    setDesktop(true);
    mockFetchUserGamification
      .mockResolvedValueOnce({
        notifications: {
          unseen: [],
          priority_unseen: [
            makeNotification({
              id: "n-xp",
              notification_type: "xp_awarded",
              priority: 4,
              category: "shopping",
              title: "장보기 완료",
              body: "40 XP를 얻었어요.",
              payload: {
                event_type: "shopping_completed",
                label: "장보기 완료",
                xp_delta: 40,
              },
            }),
            makeNotification({
              id: "n-achievement",
              notification_type: "achievement_unlocked",
              priority: 2,
              title: "장보기 700회",
              body: "꾸준한 장보기 업적을 달성했어요.",
              payload: {
                achievement_key: "shopping_completed_700",
                badge_key: "shopping_completed_700",
              },
            }),
            makeNotification({
              id: "n-badge",
              notification_type: "badge_unlocked",
              priority: 2,
              category: "recipe",
              title: "첫 레시피 저장",
              body: "레시피 배지를 획득했어요.",
              payload: { badge_key: "tutorial_recipe_saved" },
            }),
          ],
        },
      })
      .mockResolvedValueOnce({
        notifications: {
          unseen: [],
          priority_unseen: [
            makeNotification({
              id: "n-next-achievement",
              notification_type: "achievement_unlocked",
              priority: 2,
              title: "튜토리얼 완료",
              body: "튜토리얼을 마쳤어요.",
              payload: { achievement_key: "tutorial_complete" },
            }),
          ],
        },
      });

    const { unmount } = render(<GrowthToastStack />);

    await waitFor(() => {
      expect(screen.getAllByTestId("growth-toast")).toHaveLength(3);
    });

    const [xpToast, achievementToast, badgeToast] = screen.getAllByTestId("growth-toast");
    expect(xpToast.getAttribute("data-tone")).toBe("xp");
    expect(
      within(xpToast).getByTestId("growth-toast-visual-icon").getAttribute("src"),
    ).toContain("/assets/growth/achievement-icons-v3-4/shopping_completed_3.png");

    expect(achievementToast.getAttribute("data-tone")).toBe("achievement");
    expect(
      within(achievementToast).getByTestId("growth-toast-visual-icon").getAttribute("src"),
    ).toContain("/assets/growth/achievement-icons-v3-4/shopping_completed_700.png");

    expect(badgeToast.getAttribute("data-tone")).toBe("badge");
    expect(
      within(badgeToast).getByTestId("growth-toast-visual-icon").getAttribute("src"),
    ).toContain("/assets/growth/achievement-icons-v3-4/tutorial_recipe_saved.png");

    unmount();
    render(<GrowthToastStack />);

    await waitFor(() => {
      expect(screen.getByTestId("growth-toast")).toBeTruthy();
    });

    const nextAchievementToast = screen.getByTestId("growth-toast");
    expect(nextAchievementToast.getAttribute("data-tone")).toBe("achievement");
    expect(
      within(nextAchievementToast).getByTestId("growth-toast-visual-icon").getAttribute("src"),
    ).toContain("/assets/growth/achievement-icons-v3-4/tutorial_complete.png");
  });

  it("does not rely on the toast layer to hide obsolete one-shot achievement rows", async () => {
    setDesktop(true);
    mockFetchUserGamification.mockResolvedValue({
      notifications: {
        unseen: [],
        priority_unseen: [
          makeNotification({
            id: "legacy-cooking-one",
            notification_type: "achievement_unlocked",
            priority: 2,
            title: "요리 완료 1",
            body: "튜토리얼과 겹치는 오래된 1회 업적이에요.",
            category: "cooking",
            payload: {
              achievement_key: "cooking_completed_1",
              category_key: "cooking",
              track_key: "cooking_completed",
            },
          }),
          makeNotification({
            id: "tutorial-cooking",
            notification_type: "achievement_unlocked",
            priority: 2,
            title: "첫 요리 완성",
            body: "튜토리얼 업적을 달성했어요.",
            category: "tutorial",
            payload: {
              achievement_key: "tutorial_cooking_complete",
              category_key: "tutorial",
            },
          }),
          makeNotification({
            id: "xp-live",
            notification_type: "xp_awarded",
            priority: 4,
            title: "요리 완료 +60 XP",
            body: "경험치가 반영됐어요.",
          }),
        ],
      },
    });

    render(<GrowthToastStack />);
    dispatchRefresh();

    await waitFor(() => {
      expect(screen.getAllByTestId("growth-toast")).toHaveLength(3);
    });
    expect(screen.getByText("요리 완료 1")).toBeTruthy();
    expect(screen.getByText("첫 요리 완성")).toBeTruthy();
    expect(screen.getByText("요리 완료 +60 XP")).toBeTruthy();
  });

  it("keeps visible toasts on screen for the longer review window before auto dismissing", async () => {
    vi.useFakeTimers();
    mockFetchUserGamification.mockResolvedValue({
      notifications: {
        unseen: [],
        priority_unseen: [
          makeNotification({
            id: "long-toast",
            notification_type: "xp_awarded",
            title: "경험치 획득",
            body: "+40 XP",
          }),
        ],
      },
    });

    render(<GrowthToastStack />);
    dispatchRefresh();

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId("growth-toast")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(5999);
    });
    expect(screen.getByTestId("growth-toast")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByTestId("growth-toast")).toBeNull();
  });

  it("opens the notification archive dialog in place when a growth toast is activated by keyboard", async () => {
    mockFetchUserGamification.mockResolvedValue({
      notifications: {
        archive_preview: [],
        unseen: [],
        priority_unseen: [
          makeNotification({
            id: "open-toast",
            notification_type: "xp_awarded",
            title: "경험치 획득",
            body: "+40 XP",
          }),
        ],
      },
    });

    render(<GrowthToastStack />);
    dispatchRefresh();

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("growth-toast")).toBeTruthy();
    fireEvent.keyDown(screen.getByTestId("growth-toast"), { key: "Enter" });

    expect(screen.getByRole("dialog", { name: "알림 기록" })).toBeTruthy();
  });

  it("opens the notification archive dialog in place when a growth toast is clicked", async () => {
    mockFetchArchive.mockResolvedValue({
      has_next: false,
      items: [
        makeNotification({
          id: "open-toast",
          notification_type: "xp_awarded",
          title: "경험치 획득",
          body: "+40 XP",
        }),
      ],
      next_cursor: null,
    });
    mockFetchUserGamification.mockResolvedValue({
      notifications: {
        archive_preview: [],
        unseen: [],
        priority_unseen: [
          makeNotification({
            id: "open-toast",
            notification_type: "xp_awarded",
            title: "경험치 획득",
            body: "+40 XP",
          }),
        ],
      },
    });

    render(<GrowthToastStack />);
    dispatchRefresh();

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("growth-toast")).toBeTruthy();
    fireEvent.click(screen.getByTestId("growth-toast"));

    const dialog = screen.getByRole("dialog", { name: "알림 기록" });
    await waitFor(() => {
      expect(mockFetchArchive).toHaveBeenCalledWith({ limit: 20, cursor: null });
    });
    expect(await within(dialog).findByText("경험치 획득")).toBeTruthy();
  });

  it("keeps the notification archive dialog open after the clicked toast auto-dismisses", async () => {
    vi.useFakeTimers();
    mockFetchArchive.mockResolvedValue({
      has_next: false,
      items: [
        makeNotification({
          id: "auto-dismiss-toast",
          notification_type: "achievement_unlocked",
          title: "업적 달성!",
          body: "첫 요리 완료 배지를 획득했어요.",
        }),
      ],
      next_cursor: null,
    });
    mockFetchUserGamification.mockResolvedValue({
      notifications: {
        archive_preview: [],
        unseen: [],
        priority_unseen: [
          makeNotification({
            id: "auto-dismiss-toast",
            notification_type: "achievement_unlocked",
            title: "업적 달성!",
            body: "첫 요리 완료 배지를 획득했어요.",
          }),
        ],
      },
    });

    render(<GrowthToastStack />);
    dispatchRefresh();

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("growth-toast")).toBeTruthy();
    fireEvent.click(screen.getByTestId("growth-toast"));
    expect(screen.getByRole("dialog", { name: "알림 기록" })).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(6000);
    });

    expect(screen.queryByTestId("growth-toast")).toBeNull();
    expect(screen.getByRole("dialog", { name: "알림 기록" })).toBeTruthy();
  });

  it("caps visible toasts at 2 on mobile and queues the rest as a collapsed summary", async () => {
    setDesktop(false);
    mockFetchUserGamification.mockResolvedValue({
      notifications: {
        unseen: [],
        priority_unseen: [
          makeNotification({ id: "n1", notification_type: "level_up", priority: 1 }),
          makeNotification({ id: "n2", notification_type: "badge_unlocked", priority: 2 }),
          makeNotification({ id: "n3", notification_type: "achievement_unlocked", priority: 2 }),
          makeNotification({ id: "n4", notification_type: "xp_awarded", priority: 4 }),
        ],
      },
    });

    render(<GrowthToastStack />);
    dispatchRefresh();

    await waitFor(() => {
      expect(screen.getAllByTestId("growth-toast")).toHaveLength(2);
    });
    const collapsed = screen.getByTestId("growth-toast-collapsed");
    expect(collapsed.textContent).toContain("+2");
  });

  it("does not mark queued (unrendered) notifications as seen", async () => {
    setDesktop(false);
    mockFetchUserGamification.mockResolvedValue({
      notifications: {
        unseen: [],
        priority_unseen: [
          makeNotification({ id: "n1", priority: 1, notification_type: "level_up" }),
          makeNotification({ id: "n2", priority: 2, notification_type: "badge_unlocked" }),
          makeNotification({ id: "n3", priority: 4, notification_type: "xp_awarded" }),
        ],
      },
    });

    render(<GrowthToastStack />);
    dispatchRefresh();

    await waitFor(() => {
      expect(screen.getAllByTestId("growth-toast")).toHaveLength(2);
    });
    // n3은 queue에만 있으므로 seen 처리되면 안 된다.
    const seenIds = mockMarkSeen.mock.calls.flatMap((call) => call[0] as string[]);
    expect(seenIds).not.toContain("n3");
  });

  it("marks queued notifications seen only after the collapsed summary is confirmed", async () => {
    setDesktop(false);
    mockFetchUserGamification.mockResolvedValue({
      notifications: {
        unseen: [],
        priority_unseen: [
          makeNotification({ id: "n1", priority: 1, notification_type: "level_up" }),
          makeNotification({ id: "n2", priority: 2, notification_type: "badge_unlocked" }),
          makeNotification({ id: "n3", priority: 4, notification_type: "xp_awarded" }),
        ],
      },
    });

    render(<GrowthToastStack />);
    dispatchRefresh();

    await waitFor(() => {
      expect(screen.getAllByTestId("growth-toast")).toHaveLength(2);
    });
    expect(mockMarkSeen).not.toHaveBeenCalledWith(["n3"]);

    fireEvent.click(screen.getByTestId("growth-toast-collapsed"));

    await waitFor(() => {
      const seenIds = mockMarkSeen.mock.calls.flatMap((call) => call[0] as string[]);
      expect(seenIds).toContain("n3");
    });
    expect(screen.queryByTestId("growth-toast-collapsed")).toBeNull();
  });

  it("clears timers for toasts that move back into the queue after a viewport shrink", async () => {
    setDesktop(true);
    mockFetchUserGamification.mockResolvedValue({
      notifications: {
        unseen: [],
        priority_unseen: [
          makeNotification({ id: "n1", priority: 1, notification_type: "level_up" }),
          makeNotification({ id: "n2", priority: 2, notification_type: "badge_unlocked" }),
          makeNotification({ id: "n3", priority: 4, notification_type: "xp_awarded" }),
        ],
      },
    });

    render(<GrowthToastStack />);
    dispatchRefresh();

    await waitFor(() => {
      expect(screen.getAllByTestId("growth-toast")).toHaveLength(3);
    });

    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    resizeToDesktop(false);

    expect(screen.getAllByTestId("growth-toast")).toHaveLength(2);
    expect(screen.getByTestId("growth-toast-collapsed").textContent).toContain(
      "+1",
    );

    const seenIds = mockMarkSeen.mock.calls.flatMap((call) => call[0] as string[]);
    expect(seenIds).not.toContain("n3");
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    clearTimeoutSpy.mockRestore();
  });

  it("excludes silent notifications from the toast stack", async () => {
    mockFetchUserGamification.mockResolvedValue({
      notifications: {
        unseen: [],
        priority_unseen: [
          makeNotification({ id: "n-silent", delivery_channel: "silent", toast_eligible: false }),
        ],
      },
    });

    render(<GrowthToastStack />);
    dispatchRefresh();

    await waitFor(() => {
      expect(mockFetchUserGamification).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("growth-toast-stack")).toBeNull();
  });

  it("renders nothing and marks nothing when there are no unseen notifications (no backfill burst)", async () => {
    mockFetchUserGamification.mockResolvedValue({
      notifications: { unseen: [], priority_unseen: [] },
    });

    render(<GrowthToastStack />);
    dispatchRefresh();

    await waitFor(() => {
      expect(mockFetchUserGamification).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("growth-toast")).toBeNull();
    expect(mockMarkSeen).not.toHaveBeenCalled();
  });

  it("degrades to unseen when priority_unseen is absent", async () => {
    mockFetchUserGamification.mockResolvedValue({
      notifications: {
        unseen: [makeNotification({ id: "legacy", title: "장보기 완료 +40 XP", body: "반영됨" })],
      },
    });

    render(<GrowthToastStack />);
    dispatchRefresh();

    await waitFor(() => {
      expect(screen.getByTestId("growth-toast").textContent).toContain(
        "장보기 완료 +40 XP",
      );
    });
  });

  it("compresses achievement, badge, and XP into one achievement toast while keeping level and grade toasts separate", async () => {
    setDesktop(true);
    mockFetchUserGamification.mockResolvedValue({
      notifications: {
        unseen: [],
        priority_unseen: [
          makeNotification({
            id: "a-level",
            priority: 1,
            notification_type: "level_up",
            group_key: "g-a",
            title: "레벨업!",
            body: "Lv.8 달성",
            payload: {
              previous_level: 7,
              current_level: 8,
              grade_upgrade: false,
            },
          }),
          makeNotification({
            id: "a-xp",
            priority: 4,
            notification_type: "xp_awarded",
            group_key: "g-a",
            title: "+40 XP 획득",
            body: "장보기 완료 XP",
            payload: { event_type: "shopping_completed", xp_delta: 40 },
          }),
          makeNotification({
            id: "a-achievement",
            priority: 2,
            notification_type: "achievement_unlocked",
            group_key: "g-a",
            title: "업적 달성!",
            body: "첫 장보기 완료 배지를 획득했어요.",
            payload: { achievement_key: "tutorial_shopping_list_complete" },
          }),
          makeNotification({
            id: "a-badge",
            priority: 2,
            notification_type: "badge_unlocked",
            group_key: "g-a",
            title: "새 배지 획득!",
            body: "마이페이지에서 새 배지를 확인해 보세요.",
            payload: { badge_key: "tutorial_shopping_list_complete" },
          }),
          makeNotification({
            id: "a-grade",
            priority: 1,
            notification_type: "level_up",
            group_key: "g-a",
            title: "등급 획득!",
            body: "Steel 등급 획득, Lv.8 달성",
            payload: {
              current_level: 8,
              grade_upgrade: true,
              previous_grade: { grade_key: "wood", label: "Wood" },
              grade: { grade_key: "steel", label: "Steel" },
            },
          }),
          makeNotification({
            id: "b-xp",
            priority: 4,
            notification_type: "xp_awarded",
            group_key: "g-b",
            title: "+20 XP 획득",
            body: "요리 완료 XP",
            payload: { event_type: "cooking_completed", xp_delta: 20 },
          }),
        ],
      },
    });

    render(<GrowthToastStack />);
    dispatchRefresh();

    await waitFor(() => {
      expect(screen.getAllByTestId("growth-toast")).toHaveLength(3);
    });
    const ids = screen
      .getAllByTestId("growth-toast")
      .map((node) => node.getAttribute("data-notification-id"));
    expect(ids).toEqual(["a-achievement", "a-level", "a-grade"]);
    const [achievementToast, levelToast, gradeToast] = screen.getAllByTestId("growth-toast");
    expect(achievementToast.getAttribute("data-group-key")).toBe("g-a");
    expect(achievementToast.getAttribute("data-tone")).toBe("achievement");
    expect(achievementToast.textContent).toContain("업적 달성!");
    expect(achievementToast.textContent).toContain("첫 장보기 완료 배지를 획득했어요.");
    expect(achievementToast.textContent).toContain("+40 XP");
    expect(achievementToast.textContent).not.toContain("새 배지 획득");
    expect(levelToast.getAttribute("data-tone")).toBe("level-up");
    expect(levelToast.textContent).toContain("레벨업");
    expect(levelToast.textContent).not.toContain("+40 XP");
    expect(gradeToast.getAttribute("data-tone")).toBe("grade-up");
    expect(gradeToast.textContent).toContain("등급 획득");
    expect(gradeToast.textContent).toContain("Steel 등급 획득, Lv.8 달성");
    expect(screen.queryByText("+20 XP 획득")).toBeNull();
    expect(screen.queryByText("같은 활동")).toBeNull();
  });

  it("swallows refresh failures because source actions are authoritative", async () => {
    mockFetchUserGamification.mockRejectedValue(new Error("network"));

    render(<GrowthToastStack />);
    dispatchRefresh();

    await waitFor(() => {
      expect(mockFetchUserGamification).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("growth-toast")).toBeNull();
  });
});
