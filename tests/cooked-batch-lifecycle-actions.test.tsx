// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CookedBatchActionSheet } from "@/components/leftovers/cooked-batch-action-sheet";
import { CookedBatchSection } from "@/components/leftovers/cooked-batch-section";
import type { CookedBatchProjection } from "@/types/cooking";

function batch(
  id: string,
  overrides: Partial<CookedBatchProjection>,
): CookedBatchProjection {
  return {
    id,
    recipe_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    recipe_title: `요리 ${id.slice(-1)}`,
    recipe_thumbnail_url: null,
    status: "leftover",
    cooked_at: "2026-08-10T01:00:00.000Z",
    cooking_servings: 2,
    finished_weight_g: 800,
    remaining_weight_g: 500,
    weight_status: "known",
    batch_status: "available",
    depleted_reason: null,
    revision: 2,
    nutrition_calculation_status: "complete",
    current_unweighed_closure_event_id: null,
    ...overrides,
  };
}

describe("cooked batch lifecycle presentation", () => {
  afterEach(cleanup);

  it("shows one remaining-food card with recording and secondary management actions", async () => {
    const onRecord = vi.fn(), onAction = vi.fn();
    const known = batch("known-1", { weight_source: "estimated", revision: 1 });
    render(<CookedBatchSection error={null} hasNext={false} items={[known,
      batch("missing-2", { weight_status: "missing", finished_weight_g: null, remaining_weight_g: null }),
      batch("gone-3", { status: "eaten", batch_status: "depleted", remaining_weight_g: 0 }),
    ]} onAction={onAction} onRecord={onRecord} onLoadMore={() => undefined} onRetry={() => undefined} pagePending={false} state="ready" />);
    expect(screen.getAllByTestId("cooked-batch-card")).toHaveLength(2);
    expect(screen.queryByText("중량·잔량 기록")).toBeNull();
    expect(screen.getByText("약 500g 남음")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "요리 1 식사 기록" }));
    expect(onRecord).toHaveBeenCalledWith(known);
    const card = screen.getAllByTestId("cooked-batch-card")[0];
    expect(within(card).getByLabelText("요리 1 관리").getAttribute("aria-expanded")).toBe("false");
    await userEvent.click(within(card).getByLabelText("요리 1 관리"));
    await userEvent.click(within(card).getByRole("button", { name: "무게 수정" }));
    expect(onAction).toHaveBeenCalledWith(known, "set_finished_weight");
  });

  it("requires a second discard confirmation with amount, reason, current, and result", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const knownBatch = batch("10000000-0000-4000-8000-000000000001", {});

    render(
      <CookedBatchActionSheet
        action="discard"
        batch={knownBatch}
        error={null}
        onClose={() => undefined}
        onSubmit={onSubmit}
        pending={false}
      />,
    );

    await user.type(screen.getByRole("spinbutton", { name: "버린 양" }), "120");
    await user.type(screen.getByRole("textbox", { name: "사유" }), "상해서");
    await user.click(screen.getByRole("button", { name: "내용 확인" }));

    expect(onSubmit).not.toHaveBeenCalled();
    const summary = screen.getByRole("group", { name: "버림 내용 확인" });
    expect(within(summary).getByText("현재 남은 양").nextSibling?.textContent).toBe("500g");
    expect(within(summary).getByText("버릴 양").nextSibling?.textContent).toBe("120g");
    expect(within(summary).getByText("적용 후 안내").nextSibling?.textContent).toBe("380g");
    expect(within(summary).getByText("사유").nextSibling?.textContent).toBe("상해서");
    expect(within(summary).queryByText(/최종 잔량과 상태는 서버 응답으로 확정/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "버림 기록" }));
    expect(onSubmit).toHaveBeenCalledWith({
      action: "discard",
      discarded_g: 120,
      expected_revision: 2,
      reason: "상해서",
    });
  });

  it("scopes LEFTOVERS footer buttons to text-base without changing safe-cancel-first order", () => {
    render(
      <CookedBatchActionSheet
        action="mark_unrecoverable"
        batch={batch("10000000-0000-4000-8000-000000000001", {
          finished_weight_g: null,
          remaining_weight_g: null,
          weight_status: "missing",
        })}
        error={null}
        onClose={() => undefined}
        onSubmit={() => undefined}
        pending={false}
      />,
    );

    const actions = screen.getByTestId("cooked-batch-action-actions");
    const buttons = within(actions).getAllByRole("button");

    expect(actions.className).toContain("[&_button]:text-base");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "취소",
      "확인하고 변경",
    ]);
    expect(buttons.every((button) => button.className.includes("h-[var(--control-height-lg)]"))).toBe(true);
  });

  it("requires a second negative-adjust confirmation while positive correction stays direct", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const knownBatch = batch("10000000-0000-4000-8000-000000000001", {});

    const { unmount } = render(
      <CookedBatchActionSheet
        action="adjust"
        batch={knownBatch}
        error={null}
        onClose={() => undefined}
        onSubmit={onSubmit}
        pending={false}
      />,
    );

    await user.type(screen.getByRole("spinbutton", { name: "남은 양 조정량" }), "-20");
    await user.type(screen.getByRole("textbox", { name: "사유" }), "계량 보정");
    await user.click(screen.getByRole("button", { name: "내용 확인" }));

    const summary = screen.getByRole("group", { name: "조정 내용 확인" });
    expect(within(summary).getByText("현재 남은 양").nextSibling?.textContent).toBe("500g");
    expect(within(summary).getByText("조정량").nextSibling?.textContent).toBe("-20g");
    expect(within(summary).getByText("적용 후 안내").nextSibling?.textContent).toBe("480g");
    expect(within(summary).getByText("사유").nextSibling?.textContent).toBe("계량 보정");
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "조정 적용" }));
    expect(onSubmit).toHaveBeenCalledWith({
      action: "adjust",
      delta_g: -20,
      expected_revision: 2,
      reason: "계량 보정",
    });

    unmount();
    onSubmit.mockClear();
    render(
      <CookedBatchActionSheet
        action="adjust"
        batch={knownBatch}
        error={null}
        onClose={() => undefined}
        onSubmit={onSubmit}
        pending={false}
      />,
    );
    await user.type(screen.getByRole("spinbutton", { name: "남은 양 조정량" }), "20");
    await user.type(screen.getByRole("textbox", { name: "사유" }), "추가 계량");
    await user.click(screen.getByRole("button", { name: "조정 적용" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("requires the selected unweighed reason and explicit no-grams, no-nutrition, no-meal-log consequence", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const missingBatch = batch("10000000-0000-4000-8000-000000000002", {
      finished_weight_g: null,
      remaining_weight_g: null,
      weight_status: "missing",
    });

    render(
      <CookedBatchActionSheet
        action="close"
        batch={missingBatch}
        error={null}
        onClose={() => undefined}
        onSubmit={onSubmit}
        pending={false}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "먹고 버림" }));
    expect(screen.getByText("선택한 종료 결과").nextSibling?.textContent).toBe("먹고 버림");
    expect(screen.getByText("음식 목록만 정리하며 식사 기록은 남기지 않아요.")).toBeTruthy();


    await user.click(screen.getByRole("checkbox", { name: "식사 기록 없이 정리할게요" }));
    await user.click(screen.getByRole("button", { name: "이 상태로 종료" }));

    expect(onSubmit).toHaveBeenCalledWith({
      action: "close",
      closure_reason: "mixed",
      expected_revision: 2,
    });
  });

  it("links only official 422 fields to retained existing controls and focuses the alert summary", async () => {
    const user = userEvent.setup();
    const knownBatch = batch("10000000-0000-4000-8000-000000000001", {});
    const props = {
      action: "discard" as const,
      batch: knownBatch,
      onClose: () => undefined,
      onSubmit: vi.fn(),
      pending: false,
    };
    const { rerender } = render(<CookedBatchActionSheet {...props} error={null} />);

    const amount = screen.getByRole("spinbutton", { name: "버린 양" });
    const reason = screen.getByRole("textbox", { name: "사유" });
    await user.type(amount, "120");
    await user.type(reason, "상해서");
    await user.click(screen.getByRole("button", { name: "내용 확인" }));

    rerender(
      <CookedBatchActionSheet
        {...props}
        error={{
          code: "VALIDATION_ERROR",
          fields: [
            { field: "discarded_g", reason: "invalid_positive_number" },
            { field: "reason", reason: "required" },
            { field: "new_unofficial_field", reason: "ignored" },
          ],
          message: "버린 양과 사유를 확인해 주세요.",
          status: 422,
        }}
      />,
    );

    const alert = screen.getByRole("alert");
    const retainedAmount = screen.getByRole<HTMLInputElement>("spinbutton", { name: "버린 양" });
    const retainedReason = screen.getByRole<HTMLInputElement>("textbox", { name: "사유" });
    expect(document.activeElement).toBe(alert);
    expect(retainedAmount.value).toBe("120");
    expect(retainedReason.value).toBe("상해서");
    expect(retainedAmount.getAttribute("aria-invalid")).toBe("true");
    expect(retainedReason.getAttribute("aria-invalid")).toBe("true");
    expect(retainedAmount.getAttribute("aria-describedby")).toBe(alert.id);
    expect(retainedReason.getAttribute("aria-describedby")).toBe(alert.id);
  });
});
