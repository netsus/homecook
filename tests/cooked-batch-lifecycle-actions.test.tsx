// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

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
});
