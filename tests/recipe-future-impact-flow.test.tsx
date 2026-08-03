// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecipeFutureImpactSaveFlow } from "@/components/recipe/recipe-future-impact-save-flow";
import { fetchRecipeFutureImpact, patchRecipeWithFutureStrategy } from "@/lib/api/recipe-future-impact";

vi.mock("@/lib/api/recipe-future-impact", () => ({
  fetchRecipeFutureImpact: vi.fn(),
  patchRecipeWithFutureStrategy: vi.fn(),
}));

const draft = { title: "고친 김치찌개", description: null, base_servings: 2, ingredients: [], steps: [] };
const impact = {
  impact_token: "impact-token",
  expires_at: "2026-08-04T01:00:00.000Z",
  proposed_content_hash: "a".repeat(64),
  future_meal_count: 2,
  date_range: { from: "2026-08-05", to: "2026-08-07" },
  incomplete_shopping_list_count: 1,
  completed_shopping_list_count: 1,
  active_cooking_claim_count: 0,
  replace_all_allowed: true,
} as const;

describe("recipe future impact save flow", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("connects the owner draft and revision to preview before an explicit PATCH strategy", async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    vi.mocked(fetchRecipeFutureImpact).mockResolvedValue(impact);
    vi.mocked(patchRecipeWithFutureStrategy).mockResolvedValue({ id: "recipe-id", revision: 13 });

    render(<RecipeFutureImpactSaveFlow baseRecipeRevision={12} draft={draft} enabled imageObjectId={null} onSaved={onSaved} recipeId="recipe-id" />);
    await user.click(screen.getByRole("button", { name: "변경사항 저장" }));

    expect(fetchRecipeFutureImpact).toHaveBeenCalledWith("recipe-id", 12, draft);
    expect((await screen.findByRole("button", { name: "저장" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("radio", { name: /기존 계획 유지/ }));
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(patchRecipeWithFutureStrategy).toHaveBeenCalledWith("recipe-id", {
      baseRecipeRevision: 12,
      draft,
      futurePlanStrategy: "keep",
      impactToken: "impact-token",
      imageObjectId: null,
    }, expect.any(String));
    expect(onSaved).toHaveBeenCalledWith({ id: "recipe-id", revision: 13 });
  });

  it("fails closed on preview errors and keeps stale PATCH errors open on the recheck action", async () => {
    const user = userEvent.setup();
    const previewFailure = Object.assign(new Error("영향을 확인하지 못했어요."), { code: "IMPACT_PREVIEW_FAILED", status: 503 });
    vi.mocked(fetchRecipeFutureImpact).mockRejectedValueOnce(previewFailure).mockResolvedValue(impact);
    vi.mocked(patchRecipeWithFutureStrategy).mockRejectedValue(Object.assign(new Error("다시 확인"), { code: "RECIPE_IMPACT_STALE", status: 409 }));

    render(<RecipeFutureImpactSaveFlow baseRecipeRevision={12} draft={draft} enabled imageObjectId={null} onSaved={vi.fn()} recipeId="recipe-id" />);
    await user.click(screen.getByRole("button", { name: "변경사항 저장" }));
    expect((await screen.findByRole("alert")).textContent).toContain("최신 내용으로 다시 확인");
    expect(patchRecipeWithFutureStrategy).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "다시 확인" }));
    await user.click(await screen.findByRole("radio", { name: /기존 계획 유지/ }));
    await user.click(screen.getByRole("button", { name: "저장" }));

    const recheck = await screen.findByRole("button", { name: "최신 영향 다시 확인" });
    await waitFor(() => expect(document.activeElement).toBe(recheck));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("routes an expired preview session to login without replacing the draft with a generic recheck", async () => {
    const user = userEvent.setup();
    const onUnauthorized = vi.fn();
    const unauthorized = Object.assign(new Error("로그인이 필요해요."), {
      code: "UNAUTHORIZED",
      status: 401,
    });
    vi.mocked(fetchRecipeFutureImpact).mockRejectedValue(unauthorized);

    render(
      <RecipeFutureImpactSaveFlow
        baseRecipeRevision={12}
        draft={draft}
        enabled
        imageObjectId="550e8400-e29b-41d4-a716-446655440099"
        onSaved={vi.fn()}
        onUnauthorized={onUnauthorized}
        recipeId="recipe-id"
      />,
    );
    await user.click(screen.getByRole("button", { name: "변경사항 저장" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "다시 로그인하면 수정한 내용으로 저장을 계속할 수 있어요",
    );
    expect(screen.queryByRole("button", { name: "다시 확인" })).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledWith({
      base_recipe_revision: 12,
      draft,
      image_object_id: "550e8400-e29b-41d4-a716-446655440099",
    });
    expect(patchRecipeWithFutureStrategy).not.toHaveBeenCalled();
  });

  it("stays completely dark when the capability boundary is off", () => {
    render(<RecipeFutureImpactSaveFlow baseRecipeRevision={12} draft={draft} enabled={false} imageObjectId={null} onSaved={vi.fn()} recipeId="recipe-id" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
