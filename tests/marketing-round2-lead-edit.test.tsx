// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRound2Client } from "@/lib/marketing/round2-client";
import { Round2Landing } from "@/components/marketing/round2/round2-landing";
import { RETENTION_UNTIL, type Round2Request, type Round2SuccessData } from "@/lib/marketing-round2";

vi.mock("@/components/marketing/round2/round2.module.css", () => ({ default: {} }));
vi.mock("@/components/marketing/round2/round2-turnstile", () => ({ Round2Turnstile: ({ onToken }: { onToken: (token: string) => void }) => <button type="button" onClick={() => onToken("fresh-challenge")}>테스트 보안 확인</button> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const direct = { first_channel: "direct" as const, utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null };
function transport(failure: "NETWORK_ERROR" | "LEAD_CAPTURE_UNAVAILABLE") {
  const requests: Round2Request[] = [];
  const control = { failing: true, committed: false, generation: 1 };
  let started = false;
  let receiptId: string | null = null;
  const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const request = JSON.parse(init!.body as string) as Round2Request; requests.push(request);
    if (request.action === "activity_start" && request.activity === "lead") started = true;
    if (request.action === "lead_submit") {
      if (control.failing) {
        if (failure === "NETWORK_ERROR") throw new TypeError("fixture response lost");
        return Response.json({ success: false, data: null, error: { code: failure, message: "fixture", fields: [] } }, { status: 503 });
      }
      if (!control.committed && !request.turnstile_token) return Response.json({ success: false, data: null, error: { code: "VALIDATION_ERROR", message: "fixture", fields: ["turnstile_token"] } }, { status: 422 });
      control.committed = true; receiptId ??= request.event_id;
    }
    const data: Round2SuccessData = { round_version: "r2.1", topic: request.topic, participation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", event_id: request.event_id, revision: control.committed ? 3 : started ? 2 : 1, consent_generation: control.generation, state: { example: "not_started", survey: "not_started", lead: control.committed ? "completed" : started ? "started" : "not_started" }, receipt: control.committed ? { event_id: receiptId ?? requests.find(r => r.action === "lead_submit")!.event_id, status: "received" } : null, participation_expires_at: "2026-10-10T00:00:00Z", retention_until: RETENTION_UNTIL };
    return Response.json({ success: true, data, error: null });
  });
  return { fetcher, requests, control, leads: () => requests.filter((r): r is Extract<Round2Request, { action: "lead_submit" }> => r.action === "lead_submit") };
}
async function clientWithFailure(failure: "NETWORK_ERROR" | "LEAD_CAPTURE_UNAVAILABLE") {
  const t = transport(failure);
  const client = createRound2Client({ topic: "recording", attribution: direct, pageContext: "", preview: false, leadReady: true, indexedDB: null, now: () => Date.parse("2026-09-11T00:00:00Z"), fetch: t.fetcher });
  await client.connect(); await client.openActivity("lead");
  client.setLeadForm({ email: "first@example.com", consent: true }); client.setTurnstileToken("initial-challenge");
  expect(await client.submitLead()).toBe(false);
  return { client, ...t };
}
describe("R2-S5-001 immutable request and editable draft", () => {
  it("invalidates an edited pending request on a newer cookie generation before any old lead POST", async () => {
    const { client, leads, control } = await clientWithFailure("NETWORK_ERROR"); const original = leads()[0];
    client.setLeadForm({ email: "corrected@example.com" }); control.generation = 2; control.failing = false;
    expect(await client.retry()).toBe(false); expect(leads()).toHaveLength(1);
    expect(client.getState().leadForm).toEqual({ email: "corrected@example.com", consent: false });
    expect(client.getState().pendingLead).toBeNull(); expect(client.getState().tokenReady).toBe(false);
    client.setLeadForm({ consent: true }); client.setTurnstileToken("new-generation-challenge");
    expect(await client.submitLead()).toBe(true);
    expect(leads()[1]).toMatchObject({ email: "corrected@example.com", consent_generation: 2, turnstile_token: "new-generation-challenge" });
    expect(leads()[1].event_id).not.toBe(original.event_id); client.dispose();
  });
  for (const failure of ["NETWORK_ERROR", "LEAD_CAPTURE_UNAVAILABLE"] as const) for (const edit of ["email", "consent", "none-control"] as const) {
    it(`${failure}: ${edit} retries the original request instead of reporting a no-op success`, async () => {
      const { client, leads, requests } = await clientWithFailure(failure); const original = leads()[0];
      if (edit === "email") client.setLeadForm({ email: "corrected@example.com" });
      if (edit === "consent") { client.setLeadForm({ consent: false }); client.setLeadForm({ consent: true }); }
      expect(leads()).toHaveLength(1);
      for (let attempt = 0; attempt < 2; attempt++) {
        client.setTurnstileToken("fresh-challenge");
        expect(await client.retry()).toBe(false);
        expect(leads().at(-1)).toMatchObject({ event_id: original.event_id, email: original.email, consent_generation: original.consent_generation });
      }
      expect(leads()).toHaveLength(3);
      if (edit === "email") { expect(leads().at(-1)).not.toHaveProperty("turnstile_token"); expect(client.getState().leadForm.email).toBe("corrected@example.com"); }
      else expect(leads().at(-1)?.turnstile_token).toBe("fresh-challenge");
      expect(client.getState().error?.code).toBe(failure); expect(client.getState().snapshot?.state.lead).toBe("started");
      const count = leads().length; await client.connect(); expect(leads()).toHaveLength(count);
      expect(requests.every(r => r.action === "lead_submit" || !Object.hasOwn(r, "email"))).toBe(true); client.dispose();
    });
  }
  it("keeps the original identity through tokenless receipt check, explicit draft cancellation and fresh challenge", async () => {
    const { client, leads, control } = await clientWithFailure("NETWORK_ERROR"); const original = leads()[0];
    client.setLeadForm({ email: "corrected@example.com" }); control.failing = false;
    expect(await client.retry()).toBe(false); expect(client.getState().error?.code).toBe("VALIDATION_ERROR");
    expect(leads().at(-1)).toMatchObject({ event_id: original.event_id, email: original.email });
    expect(leads().at(-1)).not.toHaveProperty("turnstile_token");
    client.restoreLeadAttempt();
    expect(client.getState().leadForm).toEqual({ email: "first@example.com", consent: false });
    expect(client.getState().tokenReady).toBe(false);
    client.setLeadForm({ consent: true }); client.setTurnstileToken("fresh-challenge");
    expect(await client.retry()).toBe(true);
    expect(leads().at(-1)).toMatchObject({ event_id: original.event_id, email: original.email, turnstile_token: "fresh-challenge" }); client.dispose();
  });
  it("confirms a lost committed receipt without submitting the changed email or a fresh token", async () => {
    const { client, leads, control } = await clientWithFailure("NETWORK_ERROR"); const original = leads()[0];
    client.setLeadForm({ email: "corrected@example.com", consent: false }); control.failing = false; control.committed = true;
    expect(await client.retry()).toBe(true);
    expect(leads().at(-1)).toMatchObject({ event_id: original.event_id, email: original.email });
    expect(leads().at(-1)).not.toHaveProperty("turnstile_token");
    expect(client.getState().snapshot?.state.lead).toBe("completed"); client.dispose();
  });
});

describe("real R2 client connected to the lead screen", () => {
  for (const failure of ["NETWORK_ERROR", "LEAD_CAPTURE_UNAVAILABLE"] as const) for (const edit of ["email", "consent"] as const) {
    it(`${failure}: ${edit} can explicitly recover in the same form`, async () => {
      const t = transport(failure); vi.stubGlobal("fetch", t.fetcher);
      render(<Round2Landing topic="recording" attribution={direct} pageContext="" preview={false} leadReady turnstileSiteKey="fixture-public-key"/>);
      fireEvent.click(screen.getByRole("button", { name: "베타 오픈 알림 받기" }));
      fireEvent.change(screen.getByRole("textbox", { name: "이메일" }), { target: { value: "first@example.com" } });
      fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "테스트 보안 확인" }));
      await waitFor(() => expect((screen.getByRole("button", { name: "베타 오픈 알림 신청하기" }) as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(screen.getByRole("button", { name: "베타 오픈 알림 신청하기" }));
      await screen.findByRole("button", { name: "다시 시도" });
      if (edit === "email") {
        fireEvent.change(screen.getByRole("textbox", { name: "이메일" }), { target: { value: "corrected@example.com" } });
        await act(async () => { window.dispatchEvent(new Event("pageshow")); });
        expect(t.leads()).toHaveLength(1);
        fireEvent.click(await screen.findByRole("button", { name: "이전 신청 접수 확인" }));
        await waitFor(() => expect(t.leads()).toHaveLength(2));
        fireEvent.click(screen.getByRole("button", { name: "편집 취소하고 이전 입력으로 돌아가기" }));
        expect((screen.getByRole("textbox", { name: "이메일" }) as HTMLInputElement).value).toBe("first@example.com");
        expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
        fireEvent.click(screen.getByRole("checkbox"));
      } else { fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("checkbox")); }
      fireEvent.click(screen.getByRole("button", { name: "테스트 보안 확인" }));
      t.control.failing = false;
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "다시 시도" })); });
      expect(await screen.findByRole("heading", { name: "베타 오픈 알림 신청을 접수했어요" })).toBeTruthy();
      expect(new Set(t.leads().map(r => r.event_id)).size).toBe(1); expect(new Set(t.leads().map(r => r.email))).toEqual(new Set(["first@example.com"]));
    });
  }
});
