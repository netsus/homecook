// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SnapshotV2CookModeScreen } from "@/components/cooking/snapshot-v2-cook-mode-screen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const cookingApi = vi.hoisted(() => ({
  cancelSnapshotV2CookingSession: vi.fn(),
  completeSnapshotV2CookingSession: vi.fn(),
  fetchSnapshotV2CookMode: vi.fn(),
}));

vi.mock("@/lib/api/cooking", () => ({
  cancelSnapshotV2CookingSession: cookingApi.cancelSnapshotV2CookingSession,
  completeSnapshotV2CookingSession: cookingApi.completeSnapshotV2CookingSession,
  fetchSnapshotV2CookMode: cookingApi.fetchSnapshotV2CookMode,
  isCookingApiError: (error: unknown) => typeof error === "object" && error !== null && "status" in error,
}));

const snapshot = {
  session_id: "11111111-1111-4111-8111-111111111111",
  contract_version: "snapshot_v2" as const,
  mode: "standalone" as const,
  status: "in_progress" as const,
  recipe: {
    id: "22222222-2222-4222-8222-222222222222",
    title: "매콤한 닭가슴살 김치찌개",
    cooking_servings: 2,
    ingredients: [{ ingredient_id: "33333333-3333-4333-8333-333333333333", standard_name: "닭가슴살", amount: 240, unit: "g", display_text: "닭가슴살 240g", ingredient_type: "QUANT" as const, scalable: true }],
    steps: [{ step_number: 1, instruction: "닭가슴살과 김치를 볶아요.", cooking_method: { code: "STIR_FRY", label: "볶기", color_key: "orange" }, ingredients_used: [], heat_level: null, duration_seconds: null, duration_text: null }],
  },
  pantry_candidates: [],
};

const completion = {
  session_id: snapshot.session_id,
  contract_version: "snapshot_v2" as const,
  mode: "standalone" as const,
  status: "completed" as const,
  cooked_batch: {
    id: "44444444-4444-4444-8444-444444444444",
    recipe_id: snapshot.recipe.id,
    recipe_title: snapshot.recipe.title,
    recipe_thumbnail_url: null,
    status: "leftover" as const,
    cooked_at: "2026-08-09T00:00:00.000Z",
    cooking_servings: 2,
    finished_weight_g: null,
    remaining_weight_g: null,
    weight_status: "missing" as const,
    batch_status: "available" as const,
    depleted_reason: null,
    revision: 1,
    nutrition_calculation_status: "partial" as const,
    current_unweighed_closure_event_id: null,
  },
  meals_updated: 0,
  pantry_removed: 0,
  cook_count: 3,
};

describe("cooked batch completion replay", () => {
  beforeEach(() => {
    cookingApi.cancelSnapshotV2CookingSession.mockReset();
    cookingApi.completeSnapshotV2CookingSession.mockReset();
    cookingApi.fetchSnapshotV2CookMode.mockReset();
    cookingApi.fetchSnapshotV2CookMode.mockResolvedValue(snapshot);
    cookingApi.completeSnapshotV2CookingSession.mockResolvedValue(completion);
  });

  afterEach(cleanup);

  it("dedupes duplicate submit, consumes the stored result once, and never recreates completion controls", async () => {
    const user = userEvent.setup();
    render(<SnapshotV2CookModeScreen initialAuthenticated sessionId={snapshot.session_id} />);

    await user.click(await screen.findByRole("button", { name: "요리 완료" }));
    const save = screen.getByRole("button", { name: "완료 저장" });
    await user.dblClick(save);

    await waitFor(() => expect(cookingApi.completeSnapshotV2CookingSession).toHaveBeenCalledTimes(1));
    expect(cookingApi.completeSnapshotV2CookingSession).toHaveBeenCalledWith(
      snapshot.session_id,
      { consumed_pantry_item_ids: [], weight_action: "weigh_later", finished_weight_g: null },
      expect.any(String),
    );

    await screen.findByRole("link", { name: "식사 기록하기" });
    expect(screen.queryByTestId("cooking-completion-notice")).toBeNull();
    expect(screen.queryByRole("button", { name: "요리 완료" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "요리 완료" })).toBeNull();
    expect(screen.getByRole("link", { name: "식사 기록하기" }).getAttribute("href")).toBe("/planner?segment=log");
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "돌아가기" })).toBeNull();
  });
  it("retains pantry deduction and the retry key without showing a completion popup", async () => {
    const user = userEvent.setup();
    const candidate = { pantry_item_id: "pantry-a", ingredient_id: snapshot.recipe.ingredients[0].ingredient_id, item_type: "ingredient", standard_name: "닭가슴살", name: "닭가슴살", brand: null, food_product_id: null, food_product_nutrition_version_id: null };
    cookingApi.fetchSnapshotV2CookMode.mockResolvedValue({ ...snapshot, pantry_candidates: [candidate] });
    cookingApi.completeSnapshotV2CookingSession.mockRejectedValueOnce(new Error("연결 실패")).mockResolvedValueOnce({ ...completion, pantry_removed: 1 });
    render(<SnapshotV2CookModeScreen initialAuthenticated sessionId={snapshot.session_id} />);
    await user.click(await screen.findByRole("button", { name: "요리 완료" }));
    await user.click(screen.getByRole("checkbox", { name: "닭가슴살 선택" }));
    await user.click(screen.getByRole("button", { name: "완료 저장" }));
    await screen.findByText("요리 완료를 저장하지 못했어요.");
    expect(screen.queryByTestId("cooking-completion-notice")).toBeNull();
    await user.dblClick(screen.getByRole("button", { name: "완료 저장" }));
    await screen.findByRole("link", { name: "식사 기록하기" });
    expect(screen.queryByTestId("cooking-completion-notice")).toBeNull();
    expect(cookingApi.completeSnapshotV2CookingSession.mock.calls[1][1].consumed_pantry_item_ids).toEqual(["pantry-a"]);
    expect(cookingApi.completeSnapshotV2CookingSession).toHaveBeenCalledTimes(2);
    expect(cookingApi.completeSnapshotV2CookingSession.mock.calls[0][2]).toBe(cookingApi.completeSnapshotV2CookingSession.mock.calls[1][2]);
  });
  it("refreshes pantry candidates when opening completion and removes stale selections after a rejected deduction", async () => {
    const candidate = { pantry_item_id: "new-pantry", ingredient_id: snapshot.recipe.ingredients[0].ingredient_id, item_type: "ingredient", standard_name: "닭가슴살", name: "새 팬트리 닭가슴살", brand: null, food_product_id: null, food_product_nutrition_version_id: null };
    cookingApi.fetchSnapshotV2CookMode.mockResolvedValueOnce(snapshot).mockResolvedValueOnce({ ...snapshot, pantry_candidates: [candidate] }).mockResolvedValue(snapshot);
    cookingApi.completeSnapshotV2CookingSession.mockRejectedValueOnce(Object.assign(new Error("팬트리 항목이 없어졌어요."), { status: 404, code: "RESOURCE_NOT_FOUND", fields: [] })).mockResolvedValueOnce(completion);
    render(<SnapshotV2CookModeScreen initialAuthenticated sessionId={snapshot.session_id} />);
    await userEvent.click(await screen.findByRole("button", { name: "요리 완료" }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "새 팬트리 닭가슴살 선택" }));
    await userEvent.click(screen.getByRole("button", { name: "완료 저장" }));
    await screen.findByText("팬트리 항목이 없어졌어요.");
    expect(screen.queryByRole("checkbox", { name: "새 팬트리 닭가슴살 선택" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "완료 저장" }));
    await screen.findByRole("link", { name: "식사 기록하기" });
    expect(cookingApi.completeSnapshotV2CookingSession.mock.calls[1][1].consumed_pantry_item_ids).toEqual([]);
  });

  it("does not emit a fresh completion notice when reopening a completed session", async () => {
    cookingApi.fetchSnapshotV2CookMode.mockResolvedValue({ ...snapshot, status: "completed" });
    render(<SnapshotV2CookModeScreen initialAuthenticated sessionId={snapshot.session_id} />);
    await screen.findByRole("link", { name: "식사 기록하기" });
    expect(screen.queryByTestId("cooking-completion-notice")).toBeNull();
    expect(cookingApi.completeSnapshotV2CookingSession).not.toHaveBeenCalled();
  });

});
