// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecipeFutureImpactDialog } from "@/components/recipe/recipe-future-impact-dialog";

const impact = {
  impact_token: "impact-token",
  expires_at: "2026-08-03T12:00:00.000Z",
  proposed_content_hash: "a".repeat(64),
  future_meal_count: 3,
  date_range: { from: "2026-08-04", to: "2026-08-10" },
  incomplete_shopping_list_count: 2,
  completed_shopping_list_count: 1,
  active_cooking_claim_count: 1,
  replace_all_allowed: false,
} as const;

describe("recipe future impact dialog", () => {
  afterEach(cleanup);

  it("shows exact impact and only the two allowed strategies", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<RecipeFutureImpactDialog impact={impact} onClose={vi.fn()} onRecheck={vi.fn()} onSave={onSave} />);

    expect(screen.getByText("미래 계획 3개")).toBeTruthy();
    expect(screen.getByText(/2026\. 8\. 4\..*2026\. 8\. 10\./)).toBeTruthy();
    expect(screen.getByText(/미완료 장보기 2개/)).toBeTruthy();
    expect(screen.getByText(/완료한 장보기 기록은 바뀌지 않아요/)).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect((screen.getByRole("radio", { name: /전체 반영/ }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "저장" }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(screen.getByRole("radio", { name: /기존 계획 유지/ }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(onSave).toHaveBeenCalledWith("keep");
  });

  it("fails closed while loading and keeps stale errors open with recheck focus", () => {
    const { rerender } = render(<RecipeFutureImpactDialog impact={null} loading onClose={vi.fn()} onRecheck={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("dialog").getAttribute("aria-busy")).toBe("true");
    expect((screen.getByRole("button", { name: "저장" }) as HTMLButtonElement).disabled).toBe(true);

    rerender(<RecipeFutureImpactDialog errorCode="RECIPE_IMPACT_STALE" impact={impact} onClose={vi.fn()} onRecheck={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "최신 영향 다시 확인" }));
  });

  it.each([
    {code:"RECIPE_PRODUCT_UNAVAILABLE",message:"지금은 선택한 제품 재료를 저장할 수 없어요. 입력 내용을 유지한 채 다시 시도해 주세요."},
    {code:"RECIPE_SOURCE_CONTRACT_REQUIRED",message:"레시피의 재료 정보를 안전하게 저장하려면 최신 레시피를 다시 열어 주세요. 입력 내용을 별도로 보관한 뒤 다시 시도해 주세요."},
  ])("explains $code without treating it as quantity errors", async ({code,message}) => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onRecheck = vi.fn();
    const onSave = vi.fn();
    render(<RecipeFutureImpactDialog errorCode={code} errorPhase="save" impact={impact}
      onClose={onClose} onRecheck={onRecheck} onSave={onSave} />);

    expect(screen.getByRole("alert").textContent).toContain(message);
    expect(screen.queryByText(/수량을 0보다 크게/)).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "저장" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "취소" }).disabled).toBe(false);
    await user.click(screen.getByRole("button", { name: "다시 확인" }));
    expect(onRecheck).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("keeps unrecognized server errors generic", () => {
    render(<RecipeFutureImpactDialog errorCode="PRIVATE_DATABASE_REASON" errorPhase="save" impact={impact}
      onClose={vi.fn()} onRecheck={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toContain("저장하지 못했어요. 수정한 내용은 유지");
    expect(screen.getByRole("alert").textContent).not.toContain("PRIVATE_DATABASE_REASON");
  });

  it("keeps the visible dialog title outside the shell-only header suppression selector", () => {
    render(<RecipeFutureImpactDialog impact={impact} onClose={vi.fn()} onRecheck={vi.fn()} onSave={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "미래 계획 반영 확인" })).toBeTruthy();
    const source = readFileSync(join(process.cwd(), "components/recipe/recipe-future-impact-dialog.tsx"), "utf8");
    expect(source).not.toContain("<header");
  });
});
