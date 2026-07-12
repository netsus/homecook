// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MypageProgressCard } from "@/components/mypage/mypage-progress-card";
import type { UserProgressData } from "@/types/user-progress";

const MOCK_PROGRESS: UserProgressData = {
  level: {
    current_level: 6,
    total_xp: 520,
    current_level_start_xp: 500,
    next_level_start_xp: 650,
    xp_into_current_level: 20,
    xp_to_next_level: 130,
    progress_ratio: 0.1333,
    progress_percent: 13,
  },
  event_counts: {
    cooking_completed: 3,
    shopping_completed: 2,
    recipe_saved_distinct_ever: 7,
    custom_book_created: 1,
    planner_registered_first: 1,
    planner_registered_repeat: 4,
  },
  last_updated_at: "2026-06-10T00:00:00.000Z",
};

const ZERO_PROGRESS: UserProgressData = {
  level: {
    current_level: 1,
    total_xp: 0,
    current_level_start_xp: 0,
    next_level_start_xp: 100,
    xp_into_current_level: 0,
    xp_to_next_level: 100,
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
  last_updated_at: "2026-06-10T00:00:00.000Z",
};

describe("MypageProgressCard", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders level, remaining XP, total XP, and progress from server fields", () => {
    render(<MypageProgressCard progress={MOCK_PROGRESS} state="ready" />);

    expect(screen.getByTestId("mypage-progress-card")).toBeTruthy();
    expect(screen.getByText("Lv.6")).toBeTruthy();
    expect(screen.getByText("13%")).toBeTruthy();
    expect(screen.getByText("다음 레벨까지 130 XP")).toBeTruthy();
    expect(screen.getByText("누적 520 XP")).toBeTruthy();

    const bar = screen.getByRole("progressbar", {
      name: "Lv.6, 다음 레벨까지 130 XP, 진행률 13%",
    });
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(bar.getAttribute("aria-valuenow")).toBe("13");
    expect(screen.getByTestId("mypage-progress-fill").style.width).toBe("13%");
  });

  it("treats zero progress as a normal starting state", () => {
    render(<MypageProgressCard progress={ZERO_PROGRESS} state="ready" />);

    expect(screen.getByText("Lv.1")).toBeTruthy();
    expect(screen.getByText("첫 끼니 기록을 시작해 보세요")).toBeTruthy();
    expect(screen.getByText("누적 0 XP")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
  });

  it("shows a local loading skeleton while progress loads", () => {
    render(<MypageProgressCard progress={null} state="loading" />);

    expect(screen.getByTestId("mypage-progress-loading")).toBeTruthy();
    expect(screen.queryByTestId("mypage-progress-card")).toBeNull();
  });

  it("shows only a soft-fail message when progress fails", () => {
    render(<MypageProgressCard progress={null} state="error" />);

    expect(screen.getByTestId("mypage-progress-error").textContent).toContain(
      "성장 기록을 잠시 불러오지 못했어요",
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("soft-fails instead of throwing when progress shape is invalid", () => {
    render(
      <MypageProgressCard
        progress={{} as UserProgressData}
        state="ready"
      />,
    );

    expect(screen.getByTestId("mypage-progress-error").textContent).toContain(
      "성장 기록을 잠시 불러오지 못했어요",
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
