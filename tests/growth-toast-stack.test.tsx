// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GrowthToastStack } from "@/components/gamification/growth-toast-stack";
import {
  HOMECOOK_GAMIFICATION_OPEN_NOTIFICATIONS_EVENT,
  HOMECOOK_GAMIFICATION_REFRESH_EVENT,
} from "@/lib/gamification-events";

const mockFetchUserGamification = vi.fn();
const mockMarkSeen = vi.fn();
let desktopMatches = false;
let mediaListeners: Array<() => void> = [];

vi.mock("@/lib/api/user-gamification", () => ({
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
    mockFetchUserGamification.mockReset();
    mockMarkSeen.mockReset();
    mockMarkSeen.mockResolvedValue({ seen_notification_ids: [] });
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

  it("uses content-specific visuals for XP, achievement, badge, and quest toasts", async () => {
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
              id: "n-quest",
              notification_type: "quest_completed",
              priority: 3,
              title: "튜토리얼 완료",
              body: "튜토리얼을 마쳤어요.",
              payload: { quest_key: "tutorial_complete" },
            }),
          ],
        },
      });

    const { unmount } = render(<GrowthToastStack />);
    dispatchRefresh();

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
    dispatchRefresh();

    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("growth-toast")).toBeTruthy();

    const questToast = screen.getByTestId("growth-toast");
    expect(questToast.getAttribute("data-tone")).toBe("quest");
    expect(
      within(questToast).getByTestId("growth-toast-visual-icon").getAttribute("src"),
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
            title: "첫 집밥 완료",
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
    expect(screen.getByText("첫 집밥 완료")).toBeTruthy();
    expect(screen.getByText("요리 완료 +60 XP")).toBeTruthy();
  });

  it("keeps visible toasts on screen for the longer review window before auto dismissing", async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
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

    await waitFor(() => {
      expect(screen.getByTestId("growth-toast")).toBeTruthy();
    });

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 6000);
    setTimeoutSpy.mockRestore();
  });

  it("opens the notification panel intent when a toast body is clicked", async () => {
    const openNotifications = vi.fn();
    window.addEventListener(
      HOMECOOK_GAMIFICATION_OPEN_NOTIFICATIONS_EVENT,
      openNotifications,
    );
    mockFetchUserGamification.mockResolvedValue({
      notifications: {
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

    await waitFor(() => {
      expect(screen.getByTestId("growth-toast")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("growth-toast"));

    expect(openNotifications).toHaveBeenCalledTimes(1);
    window.removeEventListener(
      HOMECOOK_GAMIFICATION_OPEN_NOTIFICATIONS_EVENT,
      openNotifications,
    );
  });

  it("caps visible toasts at 2 on mobile and queues the rest as a collapsed summary", async () => {
    setDesktop(false);
    mockFetchUserGamification.mockResolvedValue({
      notifications: {
        unseen: [],
        priority_unseen: [
          makeNotification({ id: "n1", notification_type: "level_up", priority: 1 }),
          makeNotification({ id: "n2", notification_type: "badge_unlocked", priority: 2 }),
          makeNotification({ id: "n3", notification_type: "quest_completed", priority: 3 }),
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

  it("compresses achievement, badge, quest, and XP into one achievement toast while keeping level and grade toasts separate", async () => {
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
