// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CookedBatchCompletionSheet } from "@/components/cooking/cooked-batch-completion-sheet";
import type { SnapshotV2PantryCandidate } from "@/types/cooking";

const candidate: SnapshotV2PantryCandidate = {
  pantry_item_id: "11111111-1111-4111-8111-111111111111",
  ingredient_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  item_type: "food_product",
  standard_name: "닭가슴살",
  food_product_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  food_product_nutrition_version_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  name: "닭가슴살 오리지널",
  brand: "하림",
};

describe("cooked batch completion sheet", () => {
  afterEach(cleanup);

  it("requires one explicit weight action and a positive food-only finished weight", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <CookedBatchCompletionSheet
        candidates={[candidate]}
        onClose={() => undefined}
        onSubmit={onSubmit}
        serverError={null}
        submitting={false}
      />,
    );

    expect(screen.getByRole("button", { name: "완료 저장" }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("radio", { name: "음식만 무게(g)" }));
    const input = screen.getByRole("spinbutton", { name: "완성 직후 음식 전체 중량" });
    expect(input.hasAttribute("disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "완료 저장" }).hasAttribute("disabled")).toBe(true);
    await user.type(input, "640");
    expect(screen.getByRole("button", { name: "완료 저장" }).hasAttribute("disabled")).toBe(false);
    await user.click(screen.getByRole("button", { name: "완료 저장" }));

    expect(onSubmit).toHaveBeenCalledWith({
      consumed_pantry_item_ids: [],
      weight_action: "set_finished_weight",
      finished_weight_g: 640,
    });
    expect(screen.getByText(/용기·그릇 무게는 제외/)).toBeTruthy();
    expect(screen.getByText(/현재 남은 양이 아니라 완성 직후 전체 음식 무게/)).toBeTruthy();
  });

  it("scopes the active completion CTA to accessible existing color tokens", async () => {
    const user = userEvent.setup();

    render(
      <CookedBatchCompletionSheet
        candidates={[candidate]}
        onClose={() => undefined}
        onSubmit={() => undefined}
        serverError={null}
        submitting={false}
      />,
    );

    await user.click(screen.getByRole("radio", { name: "나중에 입력" }));

    const actions = screen.getByTestId("cooked-batch-completion-actions");
    expect(actions.className).toContain("[--wave1-mint-contrast:var(--brand-primary-text)]");
    expect(actions.className).toContain("[--wave1-mint-contrast-deep:var(--foreground)]");
    expect(screen.getByRole("button", { name: "완료 저장" }).hasAttribute("disabled")).toBe(false);
  });

  it("scopes both completion footer CTA labels to the official text-base button typography", () => {
    render(
      <CookedBatchCompletionSheet
        candidates={[candidate]}
        onClose={() => undefined}
        onSubmit={() => undefined}
        serverError={null}
        submitting={false}
      />,
    );

    const actions = screen.getByTestId("cooked-batch-completion-actions");
    expect(actions.className).toContain("[&_button]:text-base");
    expect(screen.getByRole("button", { name: "돌아가기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "완료 저장" })).toBeTruthy();
  });

  it("locks every action while pending and keeps one progress label", async () => {
    render(
      <CookedBatchCompletionSheet
        candidates={[candidate]}
        initialSelection={[candidate.pantry_item_id]}
        initialWeight={{ action: "set_finished_weight", finishedWeight: "640" }}
        onClose={() => undefined}
        onSubmit={() => undefined}
        serverError={null}
        submitting
      />,
    );

    expect(screen.getByRole("status").textContent).toContain("완료 결과를 기다리는 중이에요");
    expect(screen.getByRole("checkbox").hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("radio", { name: "음식만 무게(g)" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("spinbutton", { name: "완성 직후 음식 전체 중량" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "돌아가기" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "저장 중…" }).hasAttribute("disabled")).toBe(true);
  });

  it("preserves exact selection and weight input after 409/422 and moves focus to the linked error summary", async () => {
    const { rerender } = render(
      <CookedBatchCompletionSheet
        candidates={[candidate]}
        initialSelection={[candidate.pantry_item_id]}
        initialWeight={{ action: "set_finished_weight", finishedWeight: "640" }}
        onClose={() => undefined}
        onSubmit={() => undefined}
        serverError={null}
        submitting={false}
      />,
    );

    rerender(
      <CookedBatchCompletionSheet
        candidates={[candidate]}
        initialSelection={[candidate.pantry_item_id]}
        initialWeight={{ action: "set_finished_weight", finishedWeight: "640" }}
        onClose={() => undefined}
        onSubmit={() => undefined}
        serverError={{ code: "VALIDATION_ERROR", fields: [{ field: "finished_weight_g", reason: "invalid_positive_number" }], message: "음식 무게를 확인해 주세요.", status: 422 }}
        submitting={false}
      />,
    );

    const alert = screen.getByRole("alert");
    await waitFor(() => expect(document.activeElement).toBe(alert));
    expect(alert.className).toContain("text-[var(--danger-strong)]");
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true");
    expect((screen.getByRole("spinbutton", { name: "완성 직후 음식 전체 중량" }) as HTMLInputElement).value).toBe("640");
    expect(screen.getByRole("spinbutton", { name: "완성 직후 음식 전체 중량" }).getAttribute("aria-describedby")).toContain("cooked-batch-completion-error");

    rerender(
      <CookedBatchCompletionSheet
        candidates={[candidate]}
        initialSelection={[candidate.pantry_item_id]}
        initialWeight={{ action: "set_finished_weight", finishedWeight: "640" }}
        onClose={() => undefined}
        onSubmit={() => undefined}
        serverError={{ code: "CONFLICT", fields: [], message: "팬트리 항목이 변경됐어요.", status: 409 }}
        submitting={false}
      />,
    );

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("alert")));
    expect(screen.getByRole("checkbox").getAttribute("aria-checked")).toBe("true");
    expect((screen.getByRole("spinbutton", { name: "완성 직후 음식 전체 중량" }) as HTMLInputElement).value).toBe("640");
  });
});
