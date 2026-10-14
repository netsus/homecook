// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/cooking/cook-mode-layout.module.css", () => ({ default: {} }));
import { CookedBatchCompletionSheet } from "@/components/cooking/cooked-batch-completion-sheet";

const defaults = { candidates: [], onClose: () => undefined, onSubmit: () => undefined, serverError: null, submitting: false, weightEvidenceEnabled: true };
afterEach(cleanup);
describe("optional explicit whole-dish measurement", () => {
  it("offers exactly one blank optional number and completes when skipped", async () => {
    const onSubmit = vi.fn();
    render(<CookedBatchCompletionSheet {...defaults} onSubmit={onSubmit} />);
    expect(screen.getAllByRole("spinbutton")).toHaveLength(1);
    expect(screen.getByRole("spinbutton").getAttribute("value")).toBe("");
    expect(screen.getByRole("spinbutton").hasAttribute("required")).toBe(false);
    expect(screen.getByText(/용기 무게를 빼고, 먹을 국물은 포함/)).toBeTruthy();
    expect(screen.getByText(/추정하지 못했어요/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "완료 저장" }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ consumed_pantry_item_ids: [], weight_action: "weigh_later", finished_weight_g: null });
  });
  it("never prefills an estimate and marks even the same explicit value by its input path", async () => {
    const user = userEvent.setup(); const onSubmit = vi.fn();
    render(<CookedBatchCompletionSheet {...defaults} onSubmit={onSubmit} weightPrediction={{ source: "conditional_estimate", predicted_g: 300.123, model_version: "bounded-weight-v1", reason_codes: [] }} />);
    expect(screen.getByRole("spinbutton").getAttribute("value")).toBe("");
    expect(screen.getByText(/약 300g.*실측값이 아니에요/)).toBeTruthy();
    await user.type(screen.getByRole("spinbutton"), "300.123");
    await user.click(screen.getByRole("button", { name: "완료 저장" }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ consumed_pantry_item_ids: [], weight_action: "set_finished_weight", finished_weight_g: 300.123, weight_input_source: "reported_measured" });
  });
  it("keeps invalid input local, focuses it, and allows clearing it to skip", async () => {
    const user = userEvent.setup(); const onSubmit = vi.fn();
    render(<CookedBatchCompletionSheet {...defaults} onSubmit={onSubmit} />);
    await user.type(screen.getByRole("spinbutton"), "-1");
    await user.click(screen.getByRole("button", { name: "완료 저장" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("spinbutton"));
    expect(screen.getByRole("alert").textContent).toContain("빈칸으로 건너뛰어");
    await user.clear(screen.getByRole("spinbutton"));
    await user.click(screen.getByRole("button", { name: "완료 저장" }));
    expect(onSubmit).toHaveBeenCalledWith({ consumed_pantry_item_ids: [], weight_action: "weigh_later", finished_weight_g: null });
  });
  it("preserves the same explicit draft and source after failure and locks while saving", async () => {
    const user = userEvent.setup(); const onSubmit = vi.fn();
    const { rerender } = render(<CookedBatchCompletionSheet {...defaults} onSubmit={onSubmit} />);
    await user.type(screen.getByRole("spinbutton"), "200");
    await user.click(screen.getByRole("button", { name: "완료 저장" }));
    rerender(<CookedBatchCompletionSheet {...defaults} onSubmit={onSubmit} serverError={{ code: "CONFLICT", fields: [], message: "다시 확인해 주세요.", status: 409 }} />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("alert")));
    await user.click(screen.getByRole("button", { name: "완료 저장" }));
    expect(onSubmit.mock.calls[1][0]).toEqual(onSubmit.mock.calls[0][0]);
    rerender(<CookedBatchCompletionSheet {...defaults} onSubmit={onSubmit} submitting />);
    expect(screen.getByRole("spinbutton").hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "닫기" }).hasAttribute("disabled")).toBe(true);
  });
  it("keeps the production default OFF", () => {
    render(<CookedBatchCompletionSheet {...defaults} weightEvidenceEnabled={false} />);
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });
});
