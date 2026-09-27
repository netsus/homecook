// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CookedBatchCompletionSheet } from "@/components/cooking/cooked-batch-completion-sheet";
import type { SnapshotV2PantryCandidate } from "@/types/cooking";

const candidate: SnapshotV2PantryCandidate = {
  pantry_item_id: "11111111-1111-4111-8111-111111111111",
  ingredient_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  item_type: "food_product", standard_name: "닭가슴살",
  food_product_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  food_product_nutrition_version_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  name: "닭가슴살 오리지널", brand: "하림",
};
const defaults = { candidates: [candidate], onClose: () => undefined, onSubmit: () => undefined, serverError: null, submitting: false };

afterEach(cleanup);

describe("cooked batch completion sheet", () => {
  it("completes with pantry selection only and leaves weight calculation to the server", async () => {
    const onSubmit = vi.fn();
    render(<CookedBatchCompletionSheet {...defaults} onSubmit={onSubmit} />);
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByText(/완성 직후|같은 원재료|무게를 확인/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "완료 저장" }));
    expect(onSubmit).toHaveBeenCalledWith({ consumed_pantry_item_ids: [], weight_action: "weigh_later", finished_weight_g: null });
  });

  it("offers one completion footer action and keeps the header close control", () => {
    render(<CookedBatchCompletionSheet {...defaults} />);
    expect(within(screen.getByTestId("cooked-batch-completion-actions")).getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "닫기" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "돌아가기" })).toBeNull();
  });

  it("selects all pantry rows, shows a mixed state after individual changes, and clears all", async () => {
    const user = userEvent.setup(); const onSubmit = vi.fn();
    const second = { ...candidate, pantry_item_id: "22222222-2222-4222-8222-222222222222" };
    render(<CookedBatchCompletionSheet {...defaults} candidates={[candidate, second]} onSubmit={onSubmit} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    await user.click(screen.getByRole("checkbox", { name: "팬트리 항목 전체 선택" }));
    await user.click(screen.getByRole("checkbox", { name: /항목 1 선택/ }));
    expect(screen.getByTestId("consumed-bulk-toggle").getAttribute("aria-checked")).toBe("mixed");
    await user.click(screen.getByRole("button", { name: "완료 저장" }));
    expect(onSubmit).toHaveBeenLastCalledWith({ consumed_pantry_item_ids: [second.pantry_item_id], weight_action: "weigh_later", finished_weight_g: null });
    await user.click(screen.getByRole("checkbox", { name: "팬트리 항목 전체 선택" }));
    await user.click(screen.getByRole("checkbox", { name: "팬트리 항목 전체 해제" }));
    expect(screen.getByTestId("consumed-selection-summary").textContent).toBe("0개 선택됨");
  });

  it("locks completion and all selection controls while the result is pending", () => {
    render(<CookedBatchCompletionSheet {...defaults} initialSelection={[candidate.pantry_item_id]} submitting />);
    expect(screen.getAllByRole("checkbox").every((row) => row.hasAttribute("disabled"))).toBe(true);
    expect(screen.getByRole("button", { name: "저장 중…" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "닫기" }).hasAttribute("disabled")).toBe(true);
  });

  it("preserves selection after server failure and focuses the error", async () => {
    const { rerender } = render(<CookedBatchCompletionSheet {...defaults} initialSelection={[candidate.pantry_item_id]} />);
    rerender(<CookedBatchCompletionSheet {...defaults} serverError={{ code: "CONFLICT", fields: [], message: "팬트리 항목이 변경됐어요.", status: 409 }} />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("alert")));
    expect(screen.getByRole("checkbox", { name: /닭가슴살 오리지널 하림 선택/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("drops vanished pantry identities without selecting a replacement row", async () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<CookedBatchCompletionSheet {...defaults} initialSelection={[candidate.pantry_item_id]} onSubmit={onSubmit} />);
    rerender(<CookedBatchCompletionSheet {...defaults} candidates={[{ ...candidate, pantry_item_id: "replacement" }]} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("button", { name: "완료 저장" }));
    expect(onSubmit).toHaveBeenCalledWith({ consumed_pantry_item_ids: [], weight_action: "weigh_later", finished_weight_g: null });
  });
});
