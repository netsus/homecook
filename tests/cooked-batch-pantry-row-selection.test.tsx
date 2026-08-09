// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CookedBatchCompletionSheet } from "@/components/cooking/cooked-batch-completion-sheet";
import type { SnapshotV2PantryCandidate } from "@/types/cooking";

const candidates: SnapshotV2PantryCandidate[] = [
  {
    pantry_item_id: "11111111-1111-4111-8111-111111111111",
    ingredient_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    item_type: "food_product",
    standard_name: "닭가슴살",
    food_product_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    food_product_nutrition_version_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    name: "닭가슴살 오리지널",
    brand: "하림",
  },
  {
    pantry_item_id: "22222222-2222-4222-8222-222222222222",
    ingredient_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    item_type: "food_product",
    standard_name: "닭가슴살",
    food_product_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    food_product_nutrition_version_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    name: "담백 닭가슴살",
    brand: null,
  },
  {
    pantry_item_id: "33333333-3333-4333-8333-333333333333",
    ingredient_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    item_type: "ingredient",
    standard_name: "양파",
    food_product_id: null,
    food_product_nutrition_version_id: null,
    name: "양파",
    brand: null,
  },
];

describe("cooked batch pantry row selection", () => {
  afterEach(cleanup);

  it("shows actual product and brand identity without auto-selecting equivalent rows or exposing UUIDs", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <CookedBatchCompletionSheet
        candidates={candidates}
        onClose={() => undefined}
        onSubmit={onSubmit}
        serverError={null}
        submitting={false}
      />,
    );

    const rows = screen.getAllByRole("checkbox");
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.getAttribute("aria-checked") === "false")).toBe(true);
    expect(screen.getByText("닭가슴살 오리지널")).toBeTruthy();
    expect(screen.getByText("하림 · 제품 팬트리 항목 1")).toBeTruthy();
    expect(screen.getByText("담백 닭가슴살")).toBeTruthy();
    expect(screen.getByText("무브랜드 · 제품 팬트리 항목 2")).toBeTruthy();
    expect(screen.getByText("일반 재료 · 팬트리 항목 1")).toBeTruthy();
    expect(screen.getByText(/실제로 사용한 팬트리 항목만 선택/)).toBeTruthy();
    expect(document.body.textContent).not.toContain(candidates[0].pantry_item_id);

    await user.click(screen.getByRole("checkbox", { name: /닭가슴살 오리지널.*하림/ }));
    expect(screen.getByRole("checkbox", { name: /닭가슴살 오리지널.*하림/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("checkbox", { name: /담백 닭가슴살.*무브랜드/ }).getAttribute("aria-checked")).toBe("false");

    await user.click(screen.getByRole("radio", { name: "나중에 입력" }));
    await user.click(screen.getByRole("button", { name: "완료 저장" }));

    expect(onSubmit).toHaveBeenCalledWith({
      consumed_pantry_item_ids: [candidates[0].pantry_item_id],
      weight_action: "weigh_later",
      finished_weight_g: null,
    });
  });

  it("keeps an empty candidate list as an explicit empty array and enables completion after a weight action", async () => {
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

    const empty = screen.getByTestId("cooked-batch-pantry-empty");
    expect(within(empty).getByText("사용할 팬트리 항목이 없어요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "완료 저장" }).hasAttribute("disabled")).toBe(true);

    await user.click(screen.getByRole("radio", { name: "나중에 입력" }));
    expect(screen.getByRole("button", { name: "완료 저장" }).hasAttribute("disabled")).toBe(false);
    await user.click(screen.getByRole("button", { name: "완료 저장" }));

    expect(onSubmit).toHaveBeenCalledWith({
      consumed_pantry_item_ids: [],
      weight_action: "weigh_later",
      finished_weight_g: null,
    });
  });
});
