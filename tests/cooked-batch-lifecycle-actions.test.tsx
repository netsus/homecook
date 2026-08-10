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

const depletedReasons = [
  ["consumed", "다 먹음"],
  ["discarded", "모두 버림"],
  ["mixed", "먹음·버림으로 소진"],
  ["consumed_unweighed", "무게 없이 다 먹음"],
  ["discarded_unweighed", "무게 없이 모두 버림"],
  ["mixed_unweighed", "무게 없이 먹고 버림"],
] as const;

describe("cooked batch lifecycle presentation", () => {
  afterEach(cleanup);

  it("shows only state-eligible #11 actions and all six terminal truths", () => {
    const items = [
      batch("10000000-0000-4000-8000-000000000001", {}),
      batch("10000000-0000-4000-8000-000000000002", {
        finished_weight_g: null,
        remaining_weight_g: null,
        weight_status: "missing",
      }),
      batch("10000000-0000-4000-8000-000000000003", {
        finished_weight_g: null,
        remaining_weight_g: null,
        weight_status: "unrecoverable",
      }),
      batch("10000000-0000-4000-8000-000000000004", {
        batch_status: null,
        depleted_reason: null,
        finished_weight_g: null,
        nutrition_calculation_status: null,
        remaining_weight_g: null,
        revision: null,
        weight_status: null,
      }),
      ...depletedReasons.map(([reason], index) => batch(
        `20000000-0000-4000-8000-00000000000${index + 1}`,
        {
          batch_status: "depleted",
          depleted_reason: reason,
          remaining_weight_g: 0,
        },
      )),
      batch("30000000-0000-4000-8000-000000000001", {
        batch_status: "depleted",
        current_unweighed_closure_event_id: "40000000-0000-4000-8000-000000000001",
        depleted_reason: "mixed_unweighed",
        finished_weight_g: null,
        remaining_weight_g: null,
        weight_status: "missing",
      }),
    ];

    render(
      <CookedBatchSection
        error={null}
        hasNext={false}
        items={items}
        onAction={() => undefined}
        onLoadMore={() => undefined}
        onRetry={() => undefined}
        pagePending={false}
        state="ready"
      />,
    );

    const cards = screen.getAllByTestId("cooked-batch-card");
    expect(within(cards[0]).getByRole("button", { name: /양 조정/ })).toBeTruthy();
    expect(within(cards[0]).getByRole("button", { name: /버림/ })).toBeTruthy();
    expect(within(cards[1]).getByRole("button", { name: /완성 중량 입력/ })).toBeTruthy();
    expect(within(cards[2]).queryByRole("button", { name: /완성 중량 입력/ })).toBeNull();
    expect(within(cards[3]).queryByRole("button")).toBeNull();

    for (const [, label] of depletedReasons) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    for (const card of cards.slice(4, 10)) {
      expect(within(card).queryByRole("button")).toBeNull();
    }
    expect(within(cards.at(-1)!).getByRole("button", { name: /방금 종료 취소/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /먹은 양 기록/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /다시 열기/ })).toBeNull();
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
    expect(within(summary).getByText(/최종 잔량과 상태는 서버 응답으로 확정/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "버림 기록" }));
    expect(onSubmit).toHaveBeenCalledWith({
      action: "discard",
      discarded_g: 120,
      expected_revision: 2,
      reason: "상해서",
    });
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
    expect(screen.getByText(/그램 중량을 남기지 않아요/)).toBeTruthy();
    expect(screen.getByText(/식사 영양을 계산하지 않아요/)).toBeTruthy();
    expect(screen.getByText(/meal-log 식사 기록을 만들지 않아요/)).toBeTruthy();
    await user.click(screen.getByRole("checkbox", { name: /그램 중량.*식사 영양.*meal-log 식사 기록/ }));
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
