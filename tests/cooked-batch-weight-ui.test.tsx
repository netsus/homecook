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
  it.each([
    [["unquantified_ingredient", "quantity_conversion_missing"], "적당량처럼 양이 정해지지 않은 재료"],
    [["invalid_quantity"], "일부 재료의 양을 확인하지 못해"],
    [["quantity_conversion_missing"], "무게 환산 근거가 없어"],
    [["invalid_grams_evidence"], "무게 환산 근거가 없어"],
    [["boundary_unconfirmed"], "조리 조건을 확인할 근거가 부족해"],
    [["future_reason"], "조리 조건을 확인할 근거가 부족해"],
  ])("explains the available reason without requiring another input: %j", async (reason_codes, expected) => {
    const onSubmit = vi.fn();
    render(<CookedBatchCompletionSheet {...defaults} onSubmit={onSubmit} weightPrediction={{ source: "unavailable", predicted_g: null, model_version: "bounded-weight-v2", reason_codes }} />);
    expect(screen.getByText(new RegExp(expected))).toBeTruthy();
    expect(screen.getAllByRole("spinbutton")).toHaveLength(1);
    expect(screen.getByRole("spinbutton").getAttribute("value")).toBe("");
    await userEvent.click(screen.getByRole("button", { name: "완료 저장" }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ consumed_pantry_item_ids: [], weight_action: "weigh_later", finished_weight_g: null });
  });
  it("offers exactly one blank optional number and completes when skipped", async () => {
    const onSubmit = vi.fn();
    render(<CookedBatchCompletionSheet {...defaults} onSubmit={onSubmit} />);
    expect(screen.getAllByRole("spinbutton")).toHaveLength(1);
    expect(screen.getByRole("spinbutton").getAttribute("value")).toBe("");
    expect(screen.getByRole("spinbutton").hasAttribute("required")).toBe(false);
    expect(screen.getByText(/용기를 뺀 음식 전체무게/)).toBeTruthy();
    await userEvent.click(screen.getByText("무게 재는 방법"));
    expect(screen.getByText(/먹을 국물은 포함/)).toBeTruthy();
    expect(screen.getByText(/추정하지 못했어요/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "완료 저장" }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ consumed_pantry_item_ids: [], weight_action: "weigh_later", finished_weight_g: null });
  });
  it("discloses the mass fallback separately and lets a measured weight override it", async () => {
    const user=userEvent.setup();const onSubmit=vi.fn();
    render(<CookedBatchCompletionSheet {...defaults} onSubmit={onSubmit} weightPrediction={{source:"conditional_estimate",predicted_g:225,model_version:"ingredient-mass-75-v1",reason_codes:["missing_segments"],assumption_codes:["ingredient_mass_seventy_five_percent"]}} />);
    expect(screen.getByText(/재료량 75% 추정/)).toBeTruthy();
    expect(screen.getByText(/재료 무게 합계의 75%/)).toBeTruthy();
    expect(screen.queryByText(/가열 없는 섞기/)).toBeNull();
    expect(screen.getByRole("spinbutton").getAttribute("value")).toBe("225");
    expect(screen.getByRole("spinbutton").hasAttribute("readonly")).toBe(true);
    await user.click(screen.getByRole("button",{name:"실측값 입력"}));
    expect(screen.getByRole<HTMLInputElement>("spinbutton").value).toBe("");
    await user.type(screen.getByRole("spinbutton"),"190");await user.click(screen.getByRole("button",{name:"완료 저장"}));
    expect(onSubmit).toHaveBeenCalledWith({consumed_pantry_item_ids:[],weight_action:"set_finished_weight",finished_weight_g:190,weight_input_source:"reported_measured"});
  });
  it("prefills the full estimate without promoting it to a measurement", async () => {
    const user = userEvent.setup(); const onSubmit = vi.fn();
    const prediction = { source: "conditional_estimate" as const, predicted_g: 300.123, model_version: "bounded-weight-v2", reason_codes: [] };
    const { rerender } = render(<CookedBatchCompletionSheet {...defaults} onSubmit={onSubmit} weightPrediction={prediction} />);
    const input = screen.getByRole<HTMLInputElement>("spinbutton", { name: "완성 음식 전체무게 (자동 추정, g)" });
    expect(input.value).toBe("300.123"); expect(input.readOnly).toBe(true);
    await user.click(screen.getByRole("button", { name: "완료 저장" }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ consumed_pantry_item_ids: [], weight_action: "weigh_later", finished_weight_g: null });
    rerender(<CookedBatchCompletionSheet {...defaults} onSubmit={onSubmit} weightPrediction={{ ...prediction, predicted_g: 350.456 }} />);
    expect(input.value).toBe("350.456");
  });
  it("records an identical numeric value as measured only after explicit measurement entry", async () => {
    const user = userEvent.setup(); const onSubmit = vi.fn();
    render(<CookedBatchCompletionSheet {...defaults} onSubmit={onSubmit} weightPrediction={{ source: "conditional_estimate", predicted_g: 300.123, model_version: "bounded-weight-v1", reason_codes: [] }} />);
    expect(screen.getByRole("spinbutton").getAttribute("value")).toBe("300.123");
    expect(screen.getByText(/약 300g.*실측값이 아니에요/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "실측값 입력" }));
    expect(screen.getByRole<HTMLInputElement>("spinbutton").value).toBe("");
    await user.type(screen.getByRole("spinbutton"), "300.123");
    await user.click(screen.getByRole("button", { name: "완료 저장" }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ consumed_pantry_item_ids: [], weight_action: "set_finished_weight", finished_weight_g: 300.123, weight_input_source: "reported_measured" });
  });
  it("retains an entered measurement when a refreshed estimate becomes available", async () => {
    const user = userEvent.setup(); const onSubmit = vi.fn();
    const { rerender } = render(<CookedBatchCompletionSheet {...defaults} onSubmit={onSubmit} />);
    await user.type(screen.getByRole("spinbutton"), "190");
    rerender(<CookedBatchCompletionSheet {...defaults} onSubmit={onSubmit} weightPrediction={{ source: "conditional_estimate", predicted_g: 300, model_version: "bounded-weight-v2", reason_codes: [] }} />);
    expect(screen.getByRole<HTMLInputElement>("spinbutton").value).toBe("190");
    await user.click(screen.getByRole("button", { name: "완료 저장" }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ consumed_pantry_item_ids: [], weight_action: "set_finished_weight", finished_weight_g: 190, weight_input_source: "reported_measured" });
  });
  it("discards the measured draft when returning to automatic weight and never resurrects it", async () => {
    const user = userEvent.setup(); const onSubmit = vi.fn();
    const { rerender } = render(<CookedBatchCompletionSheet {...defaults} onSubmit={onSubmit} weightPrediction={{ source: "conditional_estimate", predicted_g: 300, model_version: "bounded-weight-v2", reason_codes: [] }} />);
    await user.click(screen.getByRole("button", { name: "실측값 입력" }));
    await user.type(screen.getByRole("spinbutton"), "190");
    await user.click(screen.getByRole("button", { name: "자동 추정값 사용" }));
    expect(screen.getByRole<HTMLInputElement>("spinbutton").value).toBe("300");
    rerender(<CookedBatchCompletionSheet {...defaults} onSubmit={onSubmit} weightPrediction={{ source: "unavailable", predicted_g: null, model_version: "bounded-weight-v2", reason_codes: ["invalid_quantity"] }} />);
    expect(screen.getByRole<HTMLInputElement>("spinbutton").value).toBe("");
    await user.click(screen.getByRole("button", { name: "완료 저장" }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ consumed_pantry_item_ids: [], weight_action: "weigh_later", finished_weight_g: null });
  });
  it("rounds a coarse mass proxy in the visible field while leaving the server estimate authoritative", async () => {
    const onSubmit=vi.fn();render(<CookedBatchCompletionSheet {...defaults} onSubmit={onSubmit} weightPrediction={{source:"conditional_estimate",predicted_g:3119.7,model_version:"recipe-mass-proxy-v1",reason_codes:[],assumption_codes:["raw_ingredient_mass_proxy"]}} />);
    expect(screen.getByText(/약 3.1kg.*실측값이 아니에요/)).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>("spinbutton").value).toBe("3100");
    await userEvent.click(screen.getByRole("button",{name:"완료 저장"}));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({consumed_pantry_item_ids:[],weight_action:"weigh_later",finished_weight_g:null});
  });
  it("saves an edited estimate explicitly as manual and never requests measurement attestation", async () => {
    const user = userEvent.setup(); const onSubmit = vi.fn();
    const prediction = { source: "conditional_estimate" as const, predicted_g: 3119.7, model_version: "recipe-mass-proxy-v1", reason_codes: [], assumption_codes: ["raw_ingredient_mass_proxy", "cooking_loss_unmodelled"] };
    const { rerender } = render(<CookedBatchCompletionSheet {...defaults} onSubmit={onSubmit} weightPrediction={prediction} />);
    expect(screen.getByText(/증발·조리손실을 보정하지 않아/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "추정값 수정" }));
    const input = screen.getByRole<HTMLInputElement>("spinbutton", { name: "직접 수정한 추정 전체무게 (g)" });
    expect(input.value).toBe("3100"); expect(input.readOnly).toBe(false);
    await user.clear(input); await user.type(input, "2800");
    rerender(<CookedBatchCompletionSheet {...defaults} onSubmit={onSubmit} weightPrediction={{...prediction,predicted_g:3200}} />);
    expect(input.value).toBe("2800");
    expect(screen.queryByText(/개인 확인/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "완료 저장" }));
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({consumed_pantry_item_ids:[],weight_action:"set_finished_weight",finished_weight_g:2800,weight_input_source:"manual_estimate"});
    await user.click(screen.getByRole("button", { name: "자동 추정값 사용" }));
    expect(input.value).toBe("3200");
    await user.click(screen.getByRole("button", { name: "실측값 입력" }));
    expect(input.value).toBe(""); await user.type(input,"2700");
    await user.click(screen.getByRole("button", { name: "완료 저장" }));
    expect(onSubmit).toHaveBeenLastCalledWith({consumed_pantry_item_ids:[],weight_action:"set_finished_weight",finished_weight_g:2700,weight_input_source:"reported_measured"});
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
