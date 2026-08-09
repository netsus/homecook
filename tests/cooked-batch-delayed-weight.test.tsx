// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CookedBatchActionSheet } from "@/components/leftovers/cooked-batch-action-sheet";
import type { CookedBatchProjection } from "@/types/cooking";

const missingBatch: CookedBatchProjection = {
  id: "11111111-1111-4111-8111-111111111111",
  recipe_id: "22222222-2222-4222-8222-222222222222",
  recipe_title: "닭볶음탕",
  recipe_thumbnail_url: null,
  status: "leftover",
  cooked_at: "2026-08-10T01:00:00.000Z",
  cooking_servings: 3,
  finished_weight_g: null,
  remaining_weight_g: null,
  weight_status: "missing",
  batch_status: "available",
  depleted_reason: null,
  revision: 4,
  nutrition_calculation_status: "unavailable",
  current_unweighed_closure_event_id: null,
};

describe("cooked batch delayed weight", () => {
  afterEach(cleanup);

  it("requires the no-eating confirmation and sends the exact existing request", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <CookedBatchActionSheet
        action="set_finished_weight"
        batch={missingBatch}
        error={null}
        onClose={() => undefined}
        onSubmit={onSubmit}
        pending={false}
      />,
    );

    await user.type(screen.getByRole("spinbutton", { name: "음식만의 원래 전체 중량" }), "920");
    expect(screen.getByRole("button", { name: "중량 저장" }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: /먹거나 버린 적이 없고/ }));
    await user.click(screen.getByRole("button", { name: "중량 저장" }));

    expect(onSubmit).toHaveBeenCalledWith({
      action: "set_finished_weight",
      finished_weight_g: 920,
      expected_revision: 4,
    });
  });
});
