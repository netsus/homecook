// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LegacyProductPlanSection } from "@/components/planner/legacy-product-plan-section";
import type { ProductPlannerEntryData } from "@/types/product-planner-entry";

function createLegacyEntry(
  overrides: Partial<ProductPlannerEntryData> = {},
): ProductPlannerEntryData {
  return {
    basis_relations: [],
    column_id: "column-lunch",
    entry_type: "product",
    id: "legacy-product-entry-1",
    nutrition: {
      basis: { amount: 1, unit: "serving" },
      calculation_quality: "direct",
      calculation_status: "complete",
      sources: [],
      values: {
        energy_kcal: {
          amount: 105,
          display_mode: "total",
          known_amount: null,
          status: "complete",
        },
      },
      warnings: [],
    },
    plan_date: "2026-07-23",
    product_brand: "무먹 식품",
    product_id: "product-1",
    product_name: "플레인 요거트",
    product_nutrition_version_id: "version-1",
    quantity: { amount: 1, unit: "serving" },
    workflow_status: null,
    ...overrides,
  };
}

describe("legacy product plan compatibility", () => {
  afterEach(() => cleanup());

  it("shows only the selected date in a separate read-only section", () => {
    render(
      <LegacyProductPlanSection
        entries={[
          createLegacyEntry(),
          createLegacyEntry({ id: "other-date", plan_date: "2026-07-24" }),
        ]}
        isDeleting={false}
        onDelete={vi.fn()}
        selectedDate="2026-07-23"
      />,
    );

    expect(screen.getByRole("heading", { name: "기존 완제품 계획" }))
      .toBeTruthy();
    expect(screen.getByText("플레인 요거트")).toBeTruthy();
    expect(screen.queryByTestId("legacy-product-other-date"))
      .toBeNull();
    expect(screen.queryByText("완제품 추가")).toBeNull();
    expect(screen.queryByText("수정")).toBeNull();
  });

  it("opens same-screen detail and requires confirmation before delete", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <LegacyProductPlanSection
        entries={[createLegacyEntry()]}
        isDeleting={false}
        onDelete={onDelete}
        selectedDate="2026-07-23"
      />,
    );

    await user.click(screen.getByRole("button", { name: "플레인 요거트 상세 보기" }));
    expect(
      screen
        .getByRole("dialog", { name: "플레인 요거트" })
        .getAttribute("data-app-overlay-shell"),
    ).toBe("bottom-sheet");
    expect(screen.getByText("예상 열량 105 kcal")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "수정" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "계획에서 삭제" }));
    expect(screen.getByRole("dialog", { name: "완제품 계획 삭제" }))
      .toBeTruthy();
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "삭제" }));
    expect(onDelete).toHaveBeenCalledWith("legacy-product-entry-1");
  });

  it("closes the detail sheet with Escape and restores the invoking control", async () => {
    const user = userEvent.setup();
    render(
      <LegacyProductPlanSection
        entries={[createLegacyEntry()]}
        isDeleting={false}
        onDelete={vi.fn()}
        selectedDate="2026-07-23"
      />,
    );
    const invoker = screen.getByRole("button", {
      name: "플레인 요거트 상세 보기",
    });

    await user.click(invoker);
    expect(screen.getByRole("dialog", { name: "플레인 요거트" })).toBeTruthy();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "플레인 요거트" })).toBeNull();
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
    expect(document.activeElement).toBe(invoker);
  });

  it("restores the pending legacy delete action after authentication", async () => {
    const onRestoreConsumed = vi.fn();
    render(
      <LegacyProductPlanSection
        entries={[createLegacyEntry()]}
        isDeleting={false}
        onDelete={vi.fn()}
        onRestoreConsumed={onRestoreConsumed}
        restoreDeleteEntryId="legacy-product-entry-1"
        selectedDate="2026-07-23"
      />,
    );

    expect(screen.getByRole("dialog", { name: "플레인 요거트" })).toBeTruthy();
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
    expect(screen.getByRole("button", { name: "계획에서 삭제" }))
      .toBe(document.activeElement);
    expect(onRestoreConsumed).toHaveBeenCalledOnce();
  });

  it("keeps the delete confirmation open when the retained API fails", async () => {
    const user = userEvent.setup();
    render(
      <LegacyProductPlanSection
        entries={[createLegacyEntry()]}
        isDeleting={false}
        onDelete={vi.fn().mockRejectedValue(new Error("삭제 실패"))}
        selectedDate="2026-07-23"
      />,
    );

    await user.click(screen.getByRole("button", { name: "플레인 요거트 상세 보기" }));
    await user.click(screen.getByRole("button", { name: "계획에서 삭제" }));
    await user.click(screen.getByRole("button", { name: "삭제" }));

    expect(screen.getByRole("dialog", { name: "완제품 계획 삭제" }))
      .toBeTruthy();
  });

  it("blocks duplicate destructive calls while delete is pending", async () => {
    let resolveDelete!: () => void;
    const onDelete = vi.fn(() => new Promise<void>((resolve) => {
      resolveDelete = resolve;
    }));
    const user = userEvent.setup();
    render(
      <LegacyProductPlanSection
        entries={[createLegacyEntry()]}
        isDeleting={false}
        onDelete={onDelete}
        selectedDate="2026-07-23"
      />,
    );

    await user.click(screen.getByRole("button", { name: "플레인 요거트 상세 보기" }));
    await user.click(screen.getByRole("button", { name: "계획에서 삭제" }));
    const confirm = screen.getByRole("button", { name: "삭제" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    expect(onDelete).toHaveBeenCalledTimes(1);
    resolveDelete();
  });
});
