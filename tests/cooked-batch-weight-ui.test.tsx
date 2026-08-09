// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CookedBatchCompletionSheet } from "@/components/cooking/cooked-batch-completion-sheet";

describe("cooked batch food-only completion", () => {
  afterEach(cleanup);

  it("keeps tare inputs local and submits only the positive food-only result", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <CookedBatchCompletionSheet
        candidates={[]}
        onClose={() => undefined}
        onSubmit={onSubmit}
        serverError={null}
        submitting={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: "용기 무게 계산 도움" }));
    await user.type(screen.getByRole("spinbutton", { name: "음식과 용기를 합친 무게" }), "1800");
    await user.type(screen.getByRole("spinbutton", { name: "빈 용기 무게" }), "320");

    expect(screen.getByRole("status", { name: "계산한 음식만 무게" }).textContent).toContain("1,480g");
    await user.click(screen.getByRole("button", { name: "계산한 음식만 무게 사용" }));
    await user.click(screen.getByRole("button", { name: "완료 저장" }));

    expect(onSubmit).toHaveBeenCalledWith({
      consumed_pantry_item_ids: [],
      weight_action: "set_finished_weight",
      finished_weight_g: 1480,
    });
    expect(JSON.stringify(onSubmit.mock.calls[0])).not.toContain("1800");
    expect(JSON.stringify(onSubmit.mock.calls[0])).not.toContain("320");
  });
});
