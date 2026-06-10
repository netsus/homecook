// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GamificationToastProvider } from "@/components/gamification/gamification-toast-provider";
import { HOMECOOK_GAMIFICATION_REFRESH_EVENT } from "@/lib/gamification-events";

const mockFetchUserGamification = vi.fn();
const mockMarkSeen = vi.fn();

vi.mock("@/lib/api/user-gamification", () => ({
  fetchUserGamification: (...args: unknown[]) => mockFetchUserGamification(...args),
  markUserGamificationNotificationsSeen: (...args: unknown[]) => mockMarkSeen(...args),
}));

describe("GamificationToastProvider", () => {
  beforeEach(() => {
    mockFetchUserGamification.mockReset();
    mockMarkSeen.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows XP toast after a source action refresh event and marks notifications seen", async () => {
    mockFetchUserGamification.mockResolvedValue({
      notifications: {
        unseen: [
          {
            id: "550e8400-e29b-41d4-a716-446655440001",
            notification_type: "xp_awarded",
            payload: {
              label: "요리 완료",
              xp_delta: 50,
            },
            created_at: "2026-06-10T12:00:00.000Z",
          },
        ],
      },
    });
    mockMarkSeen.mockResolvedValue({
      seen_notification_ids: ["550e8400-e29b-41d4-a716-446655440001"],
    });

    render(<GamificationToastProvider />);
    window.dispatchEvent(new CustomEvent(HOMECOOK_GAMIFICATION_REFRESH_EVENT));

    await waitFor(() => {
      expect(screen.getByTestId("gamification-xp-toast").textContent).toContain(
        "요리 완료 +50 XP",
      );
    });
    expect(mockMarkSeen).toHaveBeenCalledWith([
      "550e8400-e29b-41d4-a716-446655440001",
    ]);
  });

  it("swallows refresh failures because source actions are authoritative", async () => {
    mockFetchUserGamification.mockRejectedValue(new Error("network"));

    render(<GamificationToastProvider />);
    window.dispatchEvent(new CustomEvent(HOMECOOK_GAMIFICATION_REFRESH_EVENT));

    await waitFor(() => {
      expect(mockFetchUserGamification).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("gamification-xp-toast")).toBeNull();
  });

  it("keeps the XP toast visible when seen marking fails", async () => {
    mockFetchUserGamification.mockResolvedValue({
      notifications: {
        unseen: [
          {
            id: "550e8400-e29b-41d4-a716-446655440002",
            notification_type: "xp_awarded",
            payload: {
              label: "장보기 완료",
              xp_delta: 30,
            },
            created_at: "2026-06-10T12:00:00.000Z",
          },
        ],
      },
    });
    mockMarkSeen.mockRejectedValue(new Error("network"));

    render(<GamificationToastProvider />);
    window.dispatchEvent(new CustomEvent(HOMECOOK_GAMIFICATION_REFRESH_EVENT));

    await waitFor(() => {
      expect(screen.getByTestId("gamification-xp-toast").textContent).toContain(
        "장보기 완료 +30 XP",
      );
    });
    expect(mockMarkSeen).toHaveBeenCalledWith([
      "550e8400-e29b-41d4-a716-446655440002",
    ]);
  });
});
