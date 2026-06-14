// @vitest-environment jsdom

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GrowthToastStack } from "@/components/gamification/growth-toast-stack";
import { HOMECOOK_GAMIFICATION_REFRESH_EVENT } from "@/lib/gamification-events";

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
    expect(within(toasts[0]).getByTestId("growth-toast-visual-icon")).toBeTruthy();
    expect(within(toasts[0]).getByTestId("growth-toast-priority-rank").textContent).toBe("1");
    expect(within(toasts[1]).getByTestId("growth-toast-priority-rank").textContent).toBe("2");
    expect(within(toasts[2]).getByTestId("growth-toast-priority-rank").textContent).toBe("3");
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

  it("keeps server order even when group_key values are interleaved", async () => {
    setDesktop(true);
    mockFetchUserGamification.mockResolvedValue({
      notifications: {
        unseen: [],
        priority_unseen: [
          makeNotification({ id: "a-level", priority: 1, notification_type: "level_up", group_key: "g-a" }),
          makeNotification({ id: "b-xp", priority: 4, notification_type: "xp_awarded", group_key: "g-b" }),
          makeNotification({ id: "a-xp", priority: 4, notification_type: "xp_awarded", group_key: "g-a" }),
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
    expect(ids).toEqual(["a-level", "b-xp", "a-xp"]);
    expect(screen.getAllByTestId("growth-toast")[0].getAttribute("data-group-key")).toBe("g-a");
    expect(screen.getAllByTestId("growth-toast-group-chip")).toHaveLength(2);
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
