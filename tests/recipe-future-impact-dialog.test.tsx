// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecipeFutureImpactDialog } from "@/components/recipe/recipe-future-impact-dialog";

const impact = {
  impact_token: "impact-token",
  expires_at: "2026-08-03T12:00:00.000Z",
  proposed_content_hash: "a".repeat(64),
  future_meal_count: 3,
  date_range: { from: "2026-08-04", to: "2026-08-10" },
  incomplete_shopping_list_count: 2,
  completed_shopping_list_count: 1,
  active_cooking_claim_count: 1,
  replace_all_allowed: false,
} as const;

describe("recipe future impact dialog", () => {
  afterEach(cleanup);

  it("shows exact impact and only the two allowed strategies", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<RecipeFutureImpactDialog impact={impact} onClose={vi.fn()} onRecheck={vi.fn()} onSave={onSave} />);

    expect(screen.getByText("미래 계획 3개")).toBeTruthy();
    expect(screen.getByText(/2026\. 8\. 4\..*2026\. 8\. 10\./)).toBeTruthy();
    expect(screen.getByText(/미완료 장보기 2개/)).toBeTruthy();
    expect(screen.getByText(/완료한 장보기 기록은 바뀌지 않아요/)).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: /전체 반영/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: /기존 계획 유지/ }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(onSave).toHaveBeenCalledWith("keep");
  });

  it("fails closed while loading and keeps stale errors open with recheck focus", () => {
    const { rerender } = render(<RecipeFutureImpactDialog impact={null} loading onClose={vi.fn()} onRecheck={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();

    rerender(<RecipeFutureImpactDialog errorCode="RECIPE_IMPACT_STALE" impact={impact} onClose={vi.fn()} onRecheck={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("button", { name: "최신 영향 다시 확인" })).toHaveFocus();
  });
});
