// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SnapshotV2CookModeScreen } from "@/components/cooking/snapshot-v2-cook-mode-screen";

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
    await user.click(screen.getByRole("radio", { name: "나중에 입력" }));
    const save = screen.getByRole("button", { name: "완료 저장" });
    await user.dblClick(save);

    await waitFor(() => expect(cookingApi.completeSnapshotV2CookingSession).toHaveBeenCalledTimes(1));
    expect(cookingApi.completeSnapshotV2CookingSession).toHaveBeenCalledWith(
      snapshot.session_id,
      { consumed_pantry_item_ids: [], weight_action: "weigh_later", finished_weight_g: null },
      expect.any(String),
    );

    expect(await screen.findByText("저장된 완료 결과를 확인했어요.")).toBeTruthy();
    expect(screen.getByText("팬트리 항목 0개를 반영했어요.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "요리 완료" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "요리 완료" })).toBeNull();
  });
});
