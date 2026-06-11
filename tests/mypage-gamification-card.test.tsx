// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MypageGamificationCard } from "@/components/mypage/mypage-gamification-card";
import type { UserGamificationData } from "@/types/user-gamification";

const MOCK_GAMIFICATION: UserGamificationData = {
  level: {
    current_level: 6,
    total_xp: 830,
    xp_to_next_level: 170,
    progress_percent: 82,
  },
  grade: {
    grade_key: "homecook_runner",
    label: "집밥 러너",
    level_min: 4,
    level_max: 7,
  },
  featured_badges: [
    {
      badge_key: "first_cook_done",
      label: "첫 집밥 완성",
      description: "첫 요리 완료를 기록했어요.",
      category: "cooking",
      shape_key: "pot",
      locked_hint: null,
      earned_at: "2026-06-10T12:00:00.000Z",
      is_new: true,
    },
  ],
  badges: {
    earned: [],
    locked: [],
  },
  quests: {
    active: [
      {
        quest_key: "cook_three_meals",
        quest_type: "standard",
        status: "active",
        title: "요리 루틴 3번 완성",
        description: "요리 완료를 3번 기록해 보세요.",
        progress_current: 1,
        progress_target: 3,
        progress_percent: 33,
        completed_at: null,
        dismissed_at: null,
        is_new: false,
      },
    ],
    completed_recent: [],
  },
  tutorial: {
    active_steps: [
      {
        quest_key: "first_shopping_done",
        quest_type: "tutorial",
        status: "active",
        title: "첫 장보기 완료",
        description: "장보기 목록을 완료해 보세요.",
        progress_current: 0,
        progress_target: 1,
        progress_percent: 0,
        completed_at: null,
        dismissed_at: null,
        is_new: false,
      },
    ],
  },
  notifications: { unseen: [], priority_unseen: [], archive_preview: [] },
  last_updated_at: "2026-06-10T12:00:00.000Z",
};

describe("MypageGamificationCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders badge and tutorial quest data from the server response", () => {
    render(
      <MypageGamificationCard
        data={MOCK_GAMIFICATION}
        state="ready"
      />,
    );

    expect(screen.getByTestId("mypage-gamification-card")).toBeTruthy();
    expect(screen.getByText("첫 집밥 완성")).toBeTruthy();
    expect(screen.getByText("첫 장보기 완료")).toBeTruthy();
    expect(screen.getByRole("progressbar", { name: "첫 장보기 완료 진행률 0%" })).toBeTruthy();
  });

  it("opens and closes the badge guide dialog", async () => {
    const user = userEvent.setup();

    render(
      <MypageGamificationCard
        data={MOCK_GAMIFICATION}
        state="ready"
      />,
    );

    await user.click(screen.getByRole("button", { name: "안내" }));
    expect(screen.getByRole("dialog", { name: "성장 시스템 안내" })).toBeTruthy();
    expect(screen.getByText("첫 +60 XP")).toBeTruthy();
    expect(screen.getByText("플래너 등록")).toBeTruthy();
    expect(screen.getByText(/순위, 압박형 연속 출석/)).toBeTruthy();

    const closeButton = screen.getByRole("button", { name: "×" });
    expect(document.activeElement).toBe(closeButton);
    await user.keyboard("{Tab}");
    expect(document.activeElement).toBe(closeButton);

    await user.click(closeButton);
    expect(screen.queryByRole("dialog", { name: "성장 시스템 안내" })).toBeNull();
  });

  it("closes the badge guide dialog with Escape", async () => {
    const user = userEvent.setup();

    render(
      <MypageGamificationCard
        data={MOCK_GAMIFICATION}
        state="ready"
      />,
    );

    await user.click(screen.getByRole("button", { name: "안내" }));
    expect(screen.getByRole("dialog", { name: "성장 시스템 안내" })).toBeTruthy();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "성장 시스템 안내" })).toBeNull();
  });

  it("calls dismiss for tutorial quests without a reward claim button", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();

    render(
      <MypageGamificationCard
        data={MOCK_GAMIFICATION}
        state="ready"
        onDismissTutorialQuest={onDismiss}
      />,
    );

    expect(screen.queryByRole("button", { name: /claim/i })).toBeNull();
    await user.click(screen.getByRole("button", { name: "나중에" }));
    expect(onDismiss).toHaveBeenCalledWith("first_shopping_done");
  });

  it("shows local loading, empty, and soft-fail states", () => {
    const { rerender } = render(
      <MypageGamificationCard data={null} state="loading" />,
    );
    expect(screen.getByTestId("mypage-gamification-loading")).toBeTruthy();

    rerender(
      <MypageGamificationCard
        data={{
          ...MOCK_GAMIFICATION,
          featured_badges: [],
          quests: { active: [], completed_recent: [] },
          tutorial: { active_steps: [] },
        }}
        state="empty"
      />,
    );
    expect(screen.getByTestId("mypage-gamification-empty")).toBeTruthy();

    rerender(<MypageGamificationCard data={null} state="error" />);
    expect(screen.getByTestId("mypage-gamification-error").textContent).toContain(
      "성장 정보를 잠시 불러오지 못했어요",
    );
  });
});
