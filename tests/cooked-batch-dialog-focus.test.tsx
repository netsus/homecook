// @vitest-environment jsdom

import React, { useRef } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SnapshotV2CookModeScreen } from "@/components/cooking/snapshot-v2-cook-mode-screen";
import { LeftoversScreen } from "@/components/leftovers/leftovers-screen";
import { useDialogBoundary } from "@/components/shared/use-dialog-boundary";
import type { CookedBatchProjection, SnapshotV2CookModeData } from "@/types/cooking";

vi.mock("@/components/cooking/cook-mode-layout.module.css", () => ({ default: {} }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => window.location.pathname,
}));
vi.mock("@/lib/supabase/env", () => ({ hasSupabasePublicEnv: () => false }));
vi.mock("@/lib/auth/e2e-auth-override", () => ({ readE2EAuthOverride: () => null }));

const api = vi.hoisted(() => ({
  fetchSnapshotV2CookMode: vi.fn(), completeSnapshotV2CookingSession: vi.fn(),
  fetchCookedBatches: vi.fn(), updateCookedBatchWeight: vi.fn(),
}));
vi.mock("@/lib/api/cooking", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api/cooking")>(), ...api,
}));

const snapshot: SnapshotV2CookModeData = {
  session_id: "11111111-1111-4111-8111-111111111111", contract_version: "snapshot_v2",
  mode: "standalone", status: "in_progress", pantry_candidates: [],
  recipe: {
    id: "22222222-2222-4222-8222-222222222222", title: "초점 확인 요리", cooking_servings: 2,
    ingredients: [], steps: [],
  },
};
const estimated: CookedBatchProjection = {
  id: "33333333-3333-4333-8333-333333333333", recipe_id: snapshot.recipe.id,
  recipe_title: snapshot.recipe.title, recipe_thumbnail_url: null, cooked_at: "2026-10-14T00:00:00Z",
  cooking_servings: 2, status: "leftover", finished_weight_g: 180, remaining_weight_g: 180,
  weight_status: "known", weight_source: "estimated", weight_evidence_enabled: true,
  batch_status: "available", depleted_reason: null, revision: 1,
  nutrition_calculation_status: "unavailable", current_unweighed_closure_event_id: null,
};
const measured = { ...estimated, weight_source: "measured" as const, revision: 2, finished_weight_g: 200, remaining_weight_g: 200 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

let frames: Map<number, FrameRequestCallback>;
let frameId: number;
function flushFrames() {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  });
}

function NewDialog() {
  const ref = useRef<HTMLDivElement>(null);
  useDialogBoundary({ dialogRef: ref, priority: 120, onClose: () => undefined });
  return <div ref={ref} role="dialog" aria-label="새 확인창"><button type="button">새 확인</button></div>;
}

beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset());
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  frames = new Map(); frameId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  window.history.replaceState(null, "", "/cooking/session-attempts/fixture/cook-mode");
  api.fetchSnapshotV2CookMode.mockResolvedValue(snapshot);
  api.fetchCookedBatches.mockResolvedValue({ items: [estimated], has_next: false, next_cursor: null });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

async function openCompletion() {
  const refresh = deferred<SnapshotV2CookModeData>();
  api.fetchSnapshotV2CookMode.mockResolvedValueOnce(snapshot).mockReturnValueOnce(refresh.promise);
  const view = render(<SnapshotV2CookModeScreen initialAuthenticated sessionId={snapshot.session_id} />);
  const opener = await screen.findByRole("button", { name: "요리 완료" });
  await userEvent.click(opener);
  expect(opener.hasAttribute("disabled")).toBe(true);
  // Browser blur during asynchronous preparation is explicit; jsdom does not model disabled focus loss.
  document.body.tabIndex = -1;
  document.body.focus();
  document.body.removeAttribute("tabindex");
  expect(document.activeElement).toBe(document.body);
  await act(async () => refresh.resolve(snapshot));
  await screen.findByRole("dialog", { name: "요리 완료" });
  return { opener, view };
}

describe("cooked batch dialog caller focus", () => {
  it.each(["close", "Escape"])("restores the actual completion opener after deferred refresh and %s", async (close) => {
    const { opener } = await openCompletion();
    if (close === "Escape") fireEvent.keyDown(document, { key: "Escape" });
    else await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "닫기" }));
    flushFrames();
    expect(document.activeElement).toBe(opener);
    expect(opener.hasAttribute("disabled")).toBe(false);
    expect(api.completeSnapshotV2CookingSession).not.toHaveBeenCalled();
  });

  it("does not restore completion focus after the path changes", async () => {
    const { opener } = await openCompletion();
    window.history.replaceState(null, "", "/planner");
    fireEvent.keyDown(document, { key: "Escape" });
    flushFrames();
    expect(document.activeElement).not.toBe(opener);
  });

  it("keeps a newer dialog's focus when an old completion close frame runs", async () => {
    const { opener } = await openCompletion();
    fireEvent.keyDown(document, { key: "Escape" });
    render(<NewDialog />);
    const current = screen.getByRole("button", { name: "새 확인" });
    flushFrames();
    expect(document.activeElement).toBe(current);
    expect(document.activeElement).not.toBe(opener);
  });

  it("blocks completion close while saving", async () => {
    const saving = deferred<never>();
    api.completeSnapshotV2CookingSession.mockReturnValueOnce(saving.promise);
    const { opener } = await openCompletion();
    await userEvent.click(screen.getByRole("button", { name: "완료 저장" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "요리 완료" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "닫기" }).hasAttribute("disabled")).toBe(true);
    expect(document.activeElement).not.toBe(opener);
  });

  it.each(["same", "new-path", "new-dialog"])("resolves measured-result focus without stealing a newer context (%s)", async (context) => {
    window.history.replaceState(null, "", "/leftovers");
    const other = { ...estimated, id: "44444444-4444-4444-8444-444444444444" };
    api.fetchCookedBatches.mockResolvedValue({ items: [other, estimated], has_next: false, next_cursor: null });
    const saving = deferred<{ batch: CookedBatchProjection }>();
    api.updateCookedBatchWeight.mockReturnValueOnce(saving.promise);
    render(<LeftoversScreen initialAuthenticated />);
    const cards = await screen.findAllByTestId("cooked-batch-card");
    const otherManager = within(cards[0]).getByRole("button", { name: "초점 확인 요리 관리" });
    const manager = within(cards[1]).getByRole("button", { name: "초점 확인 요리 관리" });
    await userEvent.click(manager);
    const opener = within(cards[1]).getByRole("button", { name: "무게 수정" });
    await userEvent.click(opener);
    await userEvent.type(screen.getByRole("spinbutton", { name: "저울로 잰 전체무게" }), "200");
    await userEvent.click(screen.getByRole("checkbox", { name: /먹거나 버리지/ }));
    await userEvent.click(screen.getByRole("button", { name: "중량 저장" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    if (context === "new-path") window.history.replaceState(null, "", "/planner");
    await act(async () => saving.resolve({ batch: measured }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    if (context === "new-dialog") render(<NewDialog />);
    flushFrames();
    expect(opener.isConnected).toBe(false);
    if (context === "same") expect(document.activeElement).toBe(manager);
    else if (context === "new-dialog") expect(document.activeElement).toBe(screen.getByRole("button", { name: "새 확인" }));
    else expect(document.activeElement).not.toBe(manager);
    expect(document.activeElement).not.toBe(otherManager);
    expect(api.updateCookedBatchWeight).toHaveBeenCalledExactlyOnceWith(estimated.id,
      { action: "set_finished_weight", finished_weight_g: 200, expected_revision: 1, weight_input_source: "reported_measured" }, expect.any(String));
  });

  it.each([false, true])("restores an unchanged batch action on cancel unless the path has changed (%s)", async (pathChanged) => {
    window.history.replaceState(null, "", "/leftovers");
    render(<LeftoversScreen initialAuthenticated />);
    await userEvent.click(await screen.findByRole("button", { name: "초점 확인 요리 관리" }));
    const opener = screen.getByRole("button", { name: "무게 수정" });
    await userEvent.click(opener);
    if (pathChanged) window.history.replaceState(null, "", "/planner");
    await userEvent.click(screen.getByRole("button", { name: "취소" }));
    flushFrames();
    if (pathChanged) expect(document.activeElement).not.toBe(opener);
    else expect(document.activeElement).toBe(opener);
    expect(api.updateCookedBatchWeight).not.toHaveBeenCalled();
  });
});
