// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/components/cooking/cook-mode-layout.module.css", () => ({ default: {} }));
const api = vi.hoisted(() => ({ context: vi.fn(), retract: vi.fn(), profile: vi.fn(), auth: vi.fn(), publicEnv: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/api/cooking", async original => ({ ...await original<typeof import("@/lib/api/cooking")>(), fetchWeightAttestationContext: api.context, retractWeightAttestation: api.retract, fetchCookedBatches: api.list }));
vi.mock("@/lib/api/mypage", () => ({ fetchUserProfile: api.profile }));
vi.mock("@/lib/supabase/env", () => ({ hasSupabasePublicEnv: api.publicEnv }));
vi.mock("@/lib/supabase/browser", () => ({ getSupabaseBrowserClient: () => ({ auth: { onAuthStateChange: api.auth } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/leftovers" }));
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import { canReadWeightAttestation } from "@/components/leftovers/cooked-batch-state";
import { LeftoversScreen } from "@/components/leftovers/leftovers-screen";
import { CookedBatchCompletionSheet } from "@/components/cooking/cooked-batch-completion-sheet";
import { CookedBatchActionSheet } from "@/components/leftovers/cooked-batch-action-sheet";
import { useWeightAttestationContext } from "@/components/cooking/use-weight-attestation-context";
import { WEIGHT_ATTESTATION_SCHEMA, WEIGHT_ATTESTATION_STATEMENT, WEIGHT_ATTESTATION_TEXT, type WeightAttestationContext, type WeightAttestationRecord } from "@/types/cooked-weight-attestation";
import type { CookedBatchProjection } from "@/types/cooking";
const id = (n: number) => `91000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const subject = { owner_uuid: id(1), account_generation: 3 };
const context = (target: "session" | "batch" = "session", targetId = id(2)): WeightAttestationContext => ({ schema_version: WEIGHT_ATTESTATION_SCHEMA,
  statement_version: WEIGHT_ATTESTATION_STATEMENT, subject, target_kind: target, target_id: targetId, context_fingerprint: "a".repeat(64),
  recipe_content_snapshot_id: id(3), cooking_servings: 3, can_attest: true, record: null });
const record: WeightAttestationRecord = { id: id(4), revision: 1, status: "attested" as const, statement_version: WEIGHT_ATTESTATION_STATEMENT, measurement_evidence_id: id(5),
  measurement_original_revision: 1, recipe_content_snapshot_id: id(3), context_fingerprint: "b".repeat(64), observed_at: "2026-10-14T09:00:00Z", row_count: 2,
  measured_g: 180, provenance: "user_attested" as const, physical_verification: "not_verified" as const, record_usage: "qa_personal_record" as const };
const batch: CookedBatchProjection = { id: id(2), recipe_id: id(6), recipe_title: "확인 요리", recipe_thumbnail_url: null, status: "leftover", cooked_at: "2026-10-14T09:00:00Z",
  cooking_servings: 3, finished_weight_g: null, remaining_weight_g: null, weight_status: "missing", batch_status: "available", depleted_reason: null,
  revision: 4, nutrition_calculation_status: "unavailable", current_unweighed_closure_event_id: null, weight_evidence_enabled: true };
const completion = { candidates: [], sessionId: id(2), weightEvidenceEnabled: true, onClose: vi.fn(), onSubmit: vi.fn(), serverError: null, submitting: false };
const action = { action: "set_finished_weight" as const, batch, error: null, onClose: vi.fn(), onSubmit: vi.fn(), pending: false };
beforeEach(() => { vi.clearAllMocks(); api.publicEnv.mockReturnValue(false); api.profile.mockResolvedValue({ id: id(1), account_generation: 3 });
  api.context.mockImplementation(async (target, targetId) => context(target, targetId)); api.list.mockResolvedValue({ items: [], has_next: false, next_cursor: null }); });
afterEach(cleanup);
describe("optional personal weight attestation", () => {
  it("defaults unchecked and preserves blank/skip/unchecked measurement requests", async () => {
    const user = userEvent.setup(); render(<CookedBatchCompletionSheet {...completion} />);
    const check = await screen.findByRole<HTMLInputElement>("checkbox", { name: WEIGHT_ATTESTATION_TEXT });
    expect(check.checked).toBe(false); expect(check.disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "완료 저장" }));
    expect(completion.onSubmit).toHaveBeenLastCalledWith({ consumed_pantry_item_ids: [], weight_action: "weigh_later", finished_weight_g: null });
    await user.type(screen.getByRole("spinbutton"), "180");
    await user.click(screen.getByRole("button", { name: "완료 저장" }));
    expect(completion.onSubmit).toHaveBeenLastCalledWith({ consumed_pantry_item_ids: [], weight_action: "set_finished_weight", finished_weight_g: 180, weight_input_source: "reported_measured" });
    expect(api.context).toHaveBeenCalledExactlyOnceWith("session", id(2));
  });
  it("sends only the explicit personal statement when checked and cancels it when the weight is cleared", async () => {
    const user = userEvent.setup(); render(<CookedBatchCompletionSheet {...completion} />);
    await screen.findByRole("checkbox", { name: WEIGHT_ATTESTATION_TEXT });
    await user.type(screen.getByRole("spinbutton"), "180"); await user.click(screen.getByRole("checkbox", { name: WEIGHT_ATTESTATION_TEXT }));
    await user.click(screen.getByRole("button", { name: "완료 저장" }));
    expect(completion.onSubmit.mock.calls[0][0]).toMatchObject({ weight_attestation: { checked: true, statement_version: WEIGHT_ATTESTATION_STATEMENT,
      expected_subject: subject, expected_context_fingerprint: "a".repeat(64) } });
    expect(JSON.stringify(completion.onSubmit.mock.calls[0][0])).not.toMatch(/physical_verified|qa_false|consent/);
    await user.clear(screen.getByRole("spinbutton"));
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: WEIGHT_ATTESTATION_TEXT }).checked).toBe(false);
    await user.click(screen.getByRole("button", { name: "완료 저장" }));
    expect(completion.onSubmit.mock.calls[1][0]).not.toHaveProperty("weight_attestation");
  });
  it.each(["off", "error"])("keeps ordinary measurement and skip available when context is %s", async mode => {
    if (mode === "off") api.context.mockResolvedValue({ ...context(), can_attest: false }); else api.context.mockRejectedValue(new Error("read error"));
    const user = userEvent.setup(); render(<CookedBatchCompletionSheet {...completion} />);
    await screen.findByText(/확인 없이/);
    await user.type(screen.getByRole("spinbutton"), "180"); await user.click(screen.getByRole("button", { name: "완료 저장" }));
    expect(completion.onSubmit.mock.calls[0][0]).not.toHaveProperty("weight_attestation");
  });
  it("keeps the delayed-weight required action checkbox separate from the optional statement", async () => {
    const user = userEvent.setup(); render(<CookedBatchActionSheet {...action} />);
    await screen.findByRole("checkbox", { name: WEIGHT_ATTESTATION_TEXT }); await user.type(screen.getByRole("spinbutton"), "180");
    await user.click(screen.getByRole("checkbox", { name: WEIGHT_ATTESTATION_TEXT }));
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "중량 저장" }).disabled).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: "아직 먹거나 버리지 않은 전체 무게예요" }));
    await user.click(screen.getByRole("button", { name: "중량 저장" }));
    expect(action.onSubmit.mock.calls[0][0]).toMatchObject({ action: "set_finished_weight", finished_weight_g: 180, expected_revision: 4, weight_attestation: { expected_subject: subject } });
  });
  it("reads and retracts the original record even after depletion, using the record fingerprint and retry key", async () => {
    const ctx = { ...context("batch"), can_attest: false, record };
    api.context.mockResolvedValue(ctx); api.retract.mockRejectedValueOnce(new Error("network failed"))
      .mockResolvedValueOnce({ ...ctx, record: { ...record, revision: 2, status: "retracted" } });
    const user = userEvent.setup(); render(<CookedBatchActionSheet {...action} action="view_weight_attestation" batch={{ ...batch, batch_status: "depleted", weight_status: "known", finished_weight_g: 999 }} />);
    await screen.findByText(/당시 실측.*180g/); expect(screen.queryByText(/당시 실측.*999g/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "확인 기록 철회" })); await screen.findByText(/철회하지 못했어요/);
    await user.click(screen.getByRole("button", { name: "확인 기록 철회" })); await screen.findByText("철회한 개인 확인 기록이에요.");
    expect(api.retract.mock.calls[0]).toEqual(api.retract.mock.calls[1]);
    expect(api.retract).toHaveBeenCalledWith(batch.id, { expected_subject: subject, expected_record_id: record.id, expected_revision: 1,
      expected_context_fingerprint: record.context_fingerprint }, expect.any(String));
    expect(action.onSubmit).not.toHaveBeenCalled(); expect(screen.queryByRole("spinbutton")).toBeNull();
  });
});
describe("weight attestation context read boundaries", () => {
  it("ignores a late result after target change", async () => {
    let resolve!: (value: WeightAttestationContext) => void;
    api.context.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const { result, rerender } = renderHook(({ targetId }) => useWeightAttestationContext("session", targetId, true), { initialProps: { targetId: id(2) } });
    await waitFor(() => expect(api.context).toHaveBeenCalledTimes(1)); rerender({ targetId: id(8) });
    await waitFor(() => expect(result.current.context?.target_id).toBe(id(8)));
    await act(async () => resolve(context())); expect(result.current.context?.target_id).toBe(id(8));
  });
  it("rejects owner/generation changes between context and profile reads", async () => {
    api.profile.mockResolvedValueOnce({ id: id(1), account_generation: 3 }).mockResolvedValueOnce({ id: id(1), account_generation: 4 });
    const { result } = renderHook(() => useWeightAttestationContext("session", id(2), true));
    await waitFor(() => expect(result.current.error).not.toBeNull()); expect(result.current.context).toBeNull();
  });
  it("invalidates a checked context on auth change and ignores the old response", async () => {
    let listener!: (event: string) => void; let resolve!: (value: WeightAttestationContext) => void;
    api.publicEnv.mockReturnValue(true); api.auth.mockImplementation(fn => { listener = fn; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    api.context.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const { result } = renderHook(() => useWeightAttestationContext("session", id(2), true));
    await waitFor(() => expect(api.context).toHaveBeenCalledTimes(1)); act(() => listener("SIGNED_OUT"));
    await act(async () => resolve(context())); expect(result.current.context).toBeNull(); expect(result.current.error).toContain("계정 상태");
  });
});


describe("attestation UI lifecycle", () => {
  it("provides the owner record entry after C01 writing is OFF and depletion, and rereads it after reopening", async () => {
    const ctx = { ...context("batch"), can_attest: false, record }; api.context.mockResolvedValue(ctx);
    api.list.mockResolvedValue({ items: [{ ...batch, status: "eaten", weight_status: "known", batch_status: "depleted", finished_weight_g: 999, weight_evidence_enabled: false, weight_evidence: { source: "reported_measured", predicted_g: null, model_version: null, reason_codes: [] } }], has_next: false, next_cursor: null });
    const user = userEvent.setup(); render(<LeftoversScreen initialAuthenticated />);
    await user.click(await screen.findByText("개인 확인 기록"));
    await user.click(screen.getByRole("button", { name: /확인 요리 개인 확인 기록/ }));
    await screen.findByText("당시 실측 180g");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "개인 확인 기록" })).toBeNull());
    await user.click(screen.getByRole("button", { name: /확인 요리 개인 확인 기록/ })); await screen.findByText("당시 실측 180g");
    expect(api.context).toHaveBeenCalledTimes(2); expect(api.retract).not.toHaveBeenCalled();
    api.retract.mockResolvedValueOnce({ ...ctx, record: { ...record, revision: 2, status: "retracted" } });
    await user.click(screen.getByRole("button", { name: "확인 기록 철회" })); await screen.findByText("철회한 개인 확인 기록이에요.");
  });
  it("clears the optional check on foreground refresh without clearing the entered grams", async () => {
    const user = userEvent.setup(); render(<CookedBatchCompletionSheet {...completion} />);
    await screen.findByRole("checkbox", { name: WEIGHT_ATTESTATION_TEXT }); await user.type(screen.getByRole("spinbutton"), "180");
    await user.click(screen.getByRole("checkbox", { name: WEIGHT_ATTESTATION_TEXT })); act(() => window.dispatchEvent(new Event("focus")));
    const check = await screen.findByRole<HTMLInputElement>("checkbox", { name: WEIGHT_ATTESTATION_TEXT }); expect(check.checked).toBe(false);
    expect(screen.getByRole<HTMLInputElement>("spinbutton").value).toBe("180");
    await user.click(screen.getByRole("button", { name: "완료 저장" })); expect(completion.onSubmit.mock.calls[0][0]).not.toHaveProperty("weight_attestation");
  });
  it("clears a checked statement after an auth change and permits only the ordinary measurement path", async () => {
    let listener!: (event: string) => void; api.publicEnv.mockReturnValue(true);
    api.auth.mockImplementation(fn => { listener = fn; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
    const user = userEvent.setup(); render(<CookedBatchCompletionSheet {...completion} />);
    await screen.findByRole("checkbox", { name: WEIGHT_ATTESTATION_TEXT }); await user.type(screen.getByRole("spinbutton"), "180"); await user.click(screen.getByRole("checkbox", { name: WEIGHT_ATTESTATION_TEXT }));
    act(() => listener("SIGNED_OUT")); expect(screen.queryByRole("checkbox", { name: WEIGHT_ATTESTATION_TEXT })).toBeNull();
    await user.click(screen.getByRole("button", { name: "완료 저장" })); expect(completion.onSubmit.mock.calls[0][0]).not.toHaveProperty("weight_attestation");
  });
  it("starts unchecked after closing and reopening, without submitting from cancel", async () => {
    const user = userEvent.setup(); const first = render(<CookedBatchCompletionSheet {...completion} />);
    await screen.findByRole("checkbox", { name: WEIGHT_ATTESTATION_TEXT }); await user.type(screen.getByRole("spinbutton"), "180"); await user.click(screen.getByRole("checkbox", { name: WEIGHT_ATTESTATION_TEXT }));
    await user.keyboard("{Escape}"); expect(completion.onClose).toHaveBeenCalledTimes(1); expect(completion.onSubmit).not.toHaveBeenCalled(); first.unmount();
    render(<CookedBatchCompletionSheet {...completion} />); expect((await screen.findByRole<HTMLInputElement>("checkbox", { name: WEIGHT_ATTESTATION_TEXT })).checked).toBe(false);
    expect(screen.getByRole<HTMLInputElement>("spinbutton").value).toBe("");
  });
  it("blocks duplicate retraction and closing while pending, and ignores the result after a target switch", async () => {
    const old = { ...context("batch"), can_attest: false, record }; let resolve!: (value: WeightAttestationContext) => void;
    api.context.mockResolvedValueOnce(old); api.retract.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const user = userEvent.setup(); const { rerender } = render(<CookedBatchActionSheet {...action} action="view_weight_attestation" />);
    await screen.findByText("당시 실측 180g"); await user.dblClick(screen.getByRole("button", { name: "확인 기록 철회" }));
    expect(api.retract).toHaveBeenCalledTimes(1); expect(screen.getAllByRole<HTMLButtonElement>("button", { name: "닫기" }).every(button => button.disabled)).toBe(true);
    await user.keyboard("{Escape}"); expect(action.onClose).not.toHaveBeenCalled();
    rerender(<CookedBatchActionSheet {...action} action="view_weight_attestation" batch={{ ...batch, id: id(8) }} />);
    await screen.findByText("개인 확인 기록이 없어요. 기존 실측 무게는 그대로예요.");
    await act(async () => resolve({ ...old, record: { ...record, revision: 2, status: "retracted" } }));
    expect(screen.queryByText("철회한 개인 확인 기록이에요.")).toBeNull(); expect(api.retract).toHaveBeenCalledTimes(1);
  });
  it("does not read attestation context in the old measurement flow", async () => {
    const user = userEvent.setup(); render(<CookedBatchCompletionSheet {...completion} weightEvidenceEnabled={false} />);
    await user.click(screen.getByRole("button", { name: "완료 저장" })); expect(api.context).not.toHaveBeenCalled(); expect(api.profile).not.toHaveBeenCalled();
  });
  it("does not read a target without a verified positive generation", async () => {
    api.profile.mockResolvedValue({ id: id(1) }); const { result } = renderHook(() => useWeightAttestationContext("session", id(2), true));
    await waitFor(() => expect(result.current.error).not.toBeNull()); expect(api.context).not.toHaveBeenCalled();
  });
});


describe("read capability is separate from weight writing", () => {
  it("offers history only for server-reported measurement evidence, preserving no-attestation empty", () => {
    const measured = { ...batch, weight_status: "known" as const, weight_evidence_enabled: false, weight_evidence: { source: "reported_measured" as const, predicted_g: null, model_version: null, reason_codes: [] } };
    expect(canReadWeightAttestation(measured)).toBe(true);
    for (const source of ["conditional_estimate", "unavailable", "historical_estimate", "manual_estimate", "legacy_unknown"] as const) {
      expect(canReadWeightAttestation({ ...measured, weight_evidence: { ...measured.weight_evidence, source } })).toBe(false);
    }
    expect(canReadWeightAttestation({ ...batch, weight_status: "known", weight_source: "measured" })).toBe(false);
  });
});


it("keeps a tiny positive original measurement distinct from zero in the record display", async () => {
  api.context.mockResolvedValue({ ...context("batch"), can_attest: false, record: { ...record, measured_g: 0.000001 } });
  render(<CookedBatchActionSheet {...action} action="view_weight_attestation" />);
  await screen.findByText("당시 실측 <0.001g"); expect(api.retract).not.toHaveBeenCalled();
});

describe("explicit context retry keyboard focus", () => {
  function openRetry(kind: "completion" | "delayed" | "history") {
    return kind === "completion" ? render(<CookedBatchCompletionSheet {...completion} />)
      : render(<CookedBatchActionSheet {...action} action={kind === "history" ? "view_weight_attestation" : "set_finished_weight"} />);
  }
  it.each(["completion", "delayed", "history"] as const)("keeps the same retry button focused during loading and failure (%s)", async kind => {
    let reject!: (error: Error) => void;
    api.context.mockRejectedValueOnce(new Error("initial read failed")).mockImplementationOnce(() => new Promise((_done, fail) => { reject = fail; }));
    const user = userEvent.setup(); openRetry(kind);
    const retry = await screen.findByRole<HTMLButtonElement>("button", { name: "개인 확인 정보 다시 불러오기" });
    await user.click(retry); await waitFor(() => expect(api.context).toHaveBeenCalledTimes(2));
    expect(retry.isConnected).toBe(true); expect(document.activeElement).toBe(retry);
    expect(retry.getAttribute("aria-disabled")).toBe("true");
    await user.keyboard("{Enter}"); expect(api.context).toHaveBeenCalledTimes(2);
    await act(async () => reject(new Error("read failed again")));
    await waitFor(() => expect(retry.getAttribute("aria-disabled")).not.toBe("true"));
    expect(screen.getByRole("button", { name: "개인 확인 정보 다시 불러오기" })).toBe(retry);
    expect(document.activeElement).toBe(retry);
  });
  it.each(["completion", "delayed", "history"] as const)("moves focus to the live input or record heading only after successful retry (%s)", async kind => {
    let resolve!: (value: WeightAttestationContext) => void;
    api.context.mockRejectedValueOnce(new Error("initial read failed")).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const user = userEvent.setup(); openRetry(kind);
    const retry = await screen.findByRole("button", { name: "개인 확인 정보 다시 불러오기" }); await user.click(retry);
    await waitFor(() => expect(api.context).toHaveBeenCalledTimes(2));
    await act(async () => resolve(context(kind === "completion" ? "session" : "batch")));
    await waitFor(() => expect(document.activeElement).toBe(kind === "history" ? screen.getByRole("heading", { name: "개인 확인 기록" }) : screen.getByRole("spinbutton")));
    expect(screen.queryByRole("button", { name: "개인 확인 정보 다시 불러오기" })).toBeNull();
  });
  it("keeps the user's different focus and the delayed-weight draft after a retry succeeds", async () => {
    let resolve!: (value: WeightAttestationContext) => void;
    api.context.mockRejectedValueOnce(new Error("initial read failed")).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const user = userEvent.setup(); render(<CookedBatchActionSheet {...action} />);
    const retry = await screen.findByRole("button", { name: "개인 확인 정보 다시 불러오기" }); await user.type(screen.getByRole("spinbutton"), "210");
    await user.click(retry); await waitFor(() => expect(api.context).toHaveBeenCalledTimes(2));
    const required = screen.getByRole<HTMLInputElement>("checkbox", { name: "아직 먹거나 버리지 않은 전체 무게예요" }); await user.click(required);
    await act(async () => resolve(context("batch"))); await screen.findByRole("checkbox", { name: WEIGHT_ATTESTATION_TEXT });
    expect(document.activeElement).toBe(required); expect(required.checked).toBe(true);
    expect(screen.getByRole<HTMLInputElement>("spinbutton").value).toBe("210");
  });
  it("does not restore an old retry into a closed or changed target", async () => {
    let resolve!: (value: WeightAttestationContext) => void;
    api.context.mockRejectedValueOnce(new Error("initial read failed")).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const user = userEvent.setup(); const view = render(<CookedBatchActionSheet {...action} />);
    await user.click(await screen.findByRole("button", { name: "개인 확인 정보 다시 불러오기" })); await waitFor(() => expect(api.context).toHaveBeenCalledTimes(2));
    view.unmount();
    render(<CookedBatchActionSheet {...action} action="view_weight_attestation" batch={{ ...batch, id: id(8) }} />);
    const heading = screen.getByRole("heading", { name: "개인 확인 기록" }); heading.focus();
    await act(async () => resolve(context("batch")));
    expect(document.activeElement).toBe(heading); expect(screen.queryByRole("spinbutton")).toBeNull();
  });
});


function NewerRetryDialog() {
  const panel = React.useRef<HTMLDivElement | null>(null), heading = React.useRef<HTMLHeadingElement | null>(null);
  useDialogBoundary({ dialogRef: panel, initialFocusRef: heading, onClose: () => undefined });
  return <div aria-modal="true" ref={panel} role="dialog"><h2 ref={heading} tabIndex={-1}>새 대화상자</h2></div>;
}

describe("context retry focus ownership", () => {
  it("supports keyboard retry and restores the unchanged210g input with the required checkbox retained", async () => {
    let resolve!: (value: WeightAttestationContext) => void;
    api.context.mockRejectedValueOnce(new Error("initial read failed")).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const user = userEvent.setup(); render(<CookedBatchActionSheet {...action} />);
    const retry = await screen.findByRole("button", { name: "개인 확인 정보 다시 불러오기" });
    const amount = screen.getByRole<HTMLInputElement>("spinbutton"), required = screen.getByRole<HTMLInputElement>("checkbox", { name: "아직 먹거나 버리지 않은 전체 무게예요" });
    await user.type(amount, "210"); await user.click(required); retry.focus(); await user.keyboard("{Enter}");
    await waitFor(() => expect(api.context).toHaveBeenCalledTimes(2)); expect(document.activeElement).toBe(retry);
    await act(async () => resolve(context("batch"))); await waitFor(() => expect(document.activeElement).toBe(amount));
    expect(amount.value).toBe("210"); expect(required.checked).toBe(true); expect(action.onSubmit).not.toHaveBeenCalled();
  });
  it("keeps a newer dialog's focus instead of restoring the old retry", async () => {
    let resolve!: (value: WeightAttestationContext) => void;
    api.context.mockRejectedValueOnce(new Error("initial read failed")).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const user = userEvent.setup(); render(<CookedBatchCompletionSheet {...completion} />);
    await user.click(await screen.findByRole("button", { name: "개인 확인 정보 다시 불러오기" })); await waitFor(() => expect(api.context).toHaveBeenCalledTimes(2));
    render(<NewerRetryDialog />); const heading = screen.getByRole("heading", { name: "새 대화상자" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    await act(async () => resolve(context())); await waitFor(() => expect(api.profile).toHaveBeenCalledTimes(3));
    expect(document.activeElement).toBe(heading);
  });
  it("does not move focus back into a retry's old path", async () => {
    let resolve!: (value: WeightAttestationContext) => void; const oldPath = window.location.pathname;
    api.context.mockRejectedValueOnce(new Error("initial read failed")).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const user = userEvent.setup(); render(<CookedBatchCompletionSheet {...completion} />);
    await user.click(await screen.findByRole("button", { name: "개인 확인 정보 다시 불러오기" })); await waitFor(() => expect(api.context).toHaveBeenCalledTimes(2));
    try {
      window.history.replaceState({}, "", "/retry-path-changed");
      await act(async () => resolve(context())); await screen.findByRole("checkbox", { name: WEIGHT_ATTESTATION_TEXT });
      await act(async () => new Promise<void>(done => requestAnimationFrame(() => done())));
      expect(document.activeElement).not.toBe(screen.getByRole("spinbutton"));
    } finally { window.history.replaceState({}, "", oldPath); }
  });
});
