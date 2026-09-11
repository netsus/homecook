import { describe, expect, it, vi } from "vitest";
import { createRound2Client } from "@/lib/marketing/round2-client";
import { RETENTION_UNTIL, type Round2Request, type Round2SuccessData } from "@/lib/marketing-round2";
const now = Date.parse("2026-09-11T00:00:00Z");
const direct = { first_channel: "direct" as const, utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null };
const pid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
function snapshot(request: Round2Request, revision = 1, extra: Partial<Round2SuccessData> = {}): Round2SuccessData {
  return { round_version: "r2.1", topic: request.topic, participation_id: pid, event_id: request.event_id, revision, consent_generation: 1, state: { example: "not_started", survey: "not_started", lead: "not_started" }, receipt: null, participation_expires_at: "2026-10-10T00:00:00Z", retention_until: RETENTION_UNTIL, ...extra };
}
const ok = (data: Round2SuccessData) => new Response(JSON.stringify({ success: true, data, error: null }));
const fail = (code: string, status: number, retry?: number) => new Response(JSON.stringify({ success: false, data: null, error: { code, message: "fixture", fields: [] } }), { status, headers: retry ? { "Retry-After": `${retry}` } : undefined });
function harness(handler: (request: Round2Request) => Response | Promise<Response>) {
  const requests: Round2Request[] = [];
  const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => { const request = JSON.parse(init!.body as string) as Round2Request; requests.push(request); return handler(request); });
  const client = createRound2Client({ topic: "recording", pageContext: "", attribution: direct, preview: false, leadReady: true, indexedDB: null, now: () => now, fetch: fetcher });
  return { client, requests, fetcher };
}
describe("round2 client authoritative state and explicit recovery", () => {
  it("starts unknown and permits storage-blocked existing cookie resume only", async () => {
    const { client, requests } = harness(r => ok(snapshot(r)));
    expect(client.getState().snapshot).toBeNull();
    expect(await client.connect()).toBe(true);
    expect(requests[0]).toMatchObject({ action: "bootstrap", bootstrap_intent: "cookie_resume" });
    expect(requests[0]).not.toHaveProperty("bootstrap_key");
    expect(client.getState().storageBlocked).toBe(true);
    expect(client.getState().connection).toBe("ready");
  });
  it("never creates a memory participation when cookie resume is unauthorized", async () => {
    const { client, requests } = harness(() => fail("PARTICIPATION_REQUIRED", 401));
    expect(await client.connect()).toBe(false);
    await client.openActivity("survey");
    expect(requests.every(r => r.action === "bootstrap" && r.bootstrap_intent === "cookie_resume")).toBe(true);
    expect(client.getState().snapshot).toBeNull();
  });
  it("serializes start before completion and never reports failed completion", async () => {
    let active = 0; let max = 0;
    const { client, requests } = harness(async r => { active++; max = Math.max(max, active); await Promise.resolve(); active--; return r.action === "example_complete" ? fail("ROUND2_UNAVAILABLE", 503) : ok(snapshot(r)); });
    await client.connect();
    await Promise.all([client.openActivity("example"), client.completeExample()]);
    expect(requests.map(r => r.action)).toEqual(["bootstrap", "bootstrap", "activity_start", "bootstrap", "example_complete"]);
    expect(max).toBe(1);
    expect(client.getState().snapshot!.state.example).toBe("not_started");
    const failedId = requests.at(-1)!.event_id;
    await client.retry();
    expect(requests.at(-1)!.event_id).toBe(failedId);
  });
  it("ignores lower revision and rejects a response for another participation", async () => {
    let counter = 0;
    const { client } = harness(r => { if (r.action === "bootstrap") counter++; return ok(snapshot(r, counter === 1 ? 9 : 2, counter === 3 ? { participation_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } : {})); });
    await client.connect(); await client.returnToMenu("survey");
    expect(client.getState().snapshot!.revision).toBe(9);
    expect(await client.connect()).toBe(false);
    expect(client.getState().snapshot!.participation_id).toBe(pid);
  });
  it("clears participation on 410 and requires explicit restart", async () => {
    const { client, requests } = harness(r => r.action === "bootstrap" ? ok(snapshot(r)) : fail("PARTICIPATION_EXPIRED", 410));
    await client.connect(); await client.openActivity("example");
    expect(client.getState().connection).toBe("restart_required");
    expect(client.getState().snapshot).toBeNull();
    const count = requests.length; await client.connect(); expect(requests.length).toBe(count);
  });
  it("holds all retries until Retry-After", async () => {
    const { client, requests } = harness(() => fail("RATE_LIMITED", 429, 60));
    await client.connect(); await client.retry();
    expect(requests).toHaveLength(1);
    expect(client.getState().error!.retryAt).toBe(now + 60_000);
  });
  it("does not resend email in background and consumes tokens immediately", async () => {
    const { client, requests } = harness(r => r.action === "lead_submit" ? fail("LEAD_CAPTURE_UNAVAILABLE", 503) : ok(snapshot(r)));
    await client.connect(); await client.openActivity("lead");
    client.setLeadForm({ email: "reader@example.com", consent: true }); client.setTurnstileToken("fixture");
    await client.submitLead();
    expect(client.getState().tokenReady).toBe(false);
    const leadId = requests.at(-1)!.event_id;
    await client.connect();
    expect(requests.filter(r => r.action === "lead_submit")).toHaveLength(1);
    client.setTurnstileToken("fresh"); await client.retry();
    expect(requests.at(-1)).toMatchObject({ event_id: leadId, turnstile_token: "fresh" });
  });
  it("invalidates consent and challenge when generation changes", async () => {
    let generation = 1;
    const { client } = harness(r => ok(snapshot(r, generation, { consent_generation: generation })));
    await client.connect(); client.setLeadForm({ email: "reader@example.com", consent: true }); client.setTurnstileToken("fixture");
    generation = 2; await client.connect();
    expect(client.getState().leadForm).toEqual({ email: "reader@example.com", consent: false });
    expect(client.getState().tokenReady).toBe(false);
  });
  it("preview uses only memory and fixture email, with no requests/storage", async () => {
    const fetcher = vi.fn(); const open = vi.fn();
    const client = createRound2Client({ topic: "recording", attribution: direct, pageContext: "", preview: true, hostname: "localhost", leadReady: true, fetch: fetcher, indexedDB: { open } as unknown as IDBFactory, now: () => now });
    await client.connect(); await client.openActivity("lead");
    client.setLeadForm({ email: "personal@example.com", consent: true });
    expect(client.getState().leadForm.email).toBe("preview@example.com");
    expect(await client.submitLead()).toBe(true);
    expect(client.getState().snapshot!.state.lead).toBe("completed");
    expect(fetcher).not.toHaveBeenCalled(); expect(open).not.toHaveBeenCalled();
  });
  it("refuses preview outside exact loopback without a network fallback", async () => {
    const fetcher = vi.fn();
    const client = createRound2Client({ topic: "recording", attribution: direct, pageContext: "", preview: true, hostname: "app.mumeok.kr", leadReady: true, fetch: fetcher, indexedDB: null, now: () => now });
    expect(await client.connect()).toBe(false); expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("round2 client edge recovery regression", () => {
  it("preview works with a real millisecond clock", async () => {
    const client = createRound2Client({ topic: "recording", attribution: direct, pageContext: "", preview: true, hostname: "localhost", leadReady: true, indexedDB: null, now: () => now + 123 });
    expect(await client.connect()).toBe(true);
  });
  it("a lower revision cannot roll back consent generation", async () => {
    let count = 0;
    const { client } = harness(r => ok(snapshot(r, ++count === 1 ? 9 : 2, { consent_generation: count === 1 ? 2 : 1 })));
    await client.connect(); client.setLeadForm({ email: "reader@example.com", consent: true });
    await client.connect();
    expect(client.getState().leadForm.consent).toBe(true);
    expect(client.getState().snapshot!.consent_generation).toBe(2);
  });
  it("refreshes consent snapshot after a generation error without resubmitting email", async () => {
    let generation = 1;
    const { client, requests } = harness(r => r.action === "lead_submit" ? fail("CONSENT_REFRESH_REQUIRED", 409) : ok(snapshot(r, generation, { consent_generation: generation })));
    await client.connect(); await client.openActivity("lead"); client.setLeadForm({ email: "reader@example.com", consent: true }); client.setTurnstileToken("fixture");
    await client.submitLead(); generation = 2; await client.retry();
    expect(client.getState().snapshot!.consent_generation).toBe(2);
    expect(client.getState().leadForm.consent).toBe(false);
    expect(requests.filter(r => r.action === "lead_submit")).toHaveLength(1);
  });
  it("restores a first submission from another tab instead of replaying conflicting survey forever", async () => {
    let completed = false;
    const { client, requests } = harness(r => {
      if (r.action === "survey_submit") { completed = true; return fail("ACTIVITY_ALREADY_COMPLETED", 409); }
      return ok(snapshot(r, completed ? 5 : 1, { state: { example: "not_started", survey: completed ? "completed" : "started", lead: "not_started" } }));
    });
    await client.connect();
    await client.submitSurvey({ q1: "none", q2: "no_record", q3: "none", q4: "no" });
    await client.retry();
    expect(client.getState().snapshot!.state.survey).toBe("completed");
    expect(requests.filter(r => r.action === "survey_submit")).toHaveLength(1);
  });
  it("campaign closure clears state and never becomes an explicit restart action", async () => {
    const { client, requests } = harness(r => r.action === "bootstrap" ? ok(snapshot(r)) : fail("CAMPAIGN_ENDED", 410));
    await client.connect(); await client.openActivity("survey"); await client.restart();
    expect(client.getState().connection).toBe("campaign_ended"); expect(client.getState().snapshot).toBeNull(); expect(requests).toHaveLength(3);
  });
});

describe("round2 completion and timeout safety", () => {
  it("does not show a DONE state when the success snapshot has not confirmed that action", async () => {
    const { client } = harness(r => ok(snapshot(r)));
    await client.connect();
    expect(await client.completeExample()).toBe(false);
    expect(await client.submitSurvey({ q1: "none", q2: "no_record", q3: "none", q4: "no" })).toBe(false);
  });
  it("returns an unsaved error after a bounded network wait and preserves the event for retry", async () => {
    vi.useFakeTimers();
    try {
      const requests: Round2Request[] = [];
      const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const request = JSON.parse(init!.body as string) as Round2Request; requests.push(request);
        if (request.action === "bootstrap") return ok(snapshot(request));
        return new Promise<Response>((_resolve, reject) => init!.signal?.addEventListener("abort", () => reject(new Error("fixture timeout")), { once: true }));
      });
      const client = createRound2Client({ topic: "recording", pageContext: "", attribution: direct, preview: false, leadReady: true, indexedDB: null, now: () => now, fetch: fetcher });
      await client.connect(); const pending = client.openActivity("example");
      await vi.advanceTimersByTimeAsync(15_001);
      expect(await pending).toBe(false); expect(client.getState().error?.code).toBe("NETWORK_ERROR");
      expect(requests).toHaveLength(3);
      expect(client.getState().error?.message).toBe("저장 결과를 확인하지 못했어요. 연결을 확인한 뒤 같은 요청을 다시 시도해 주세요.");
    } finally { vi.useRealTimers(); }
  });
});

const orders = [["example", "survey", "lead"], ["example", "lead", "survey"], ["survey", "example", "lead"], ["survey", "lead", "example"], ["lead", "example", "survey"], ["lead", "survey", "example"], ["example"], ["survey"], ["lead"]] as const;
describe.each(["recording", "homeflow"] as const)("%s independent activities", topic => {
  it.each(orders.map(order => [order.join(" → "), order] as const))("confirms only explicit selected activities: %s", async (_name, order) => {
    let data: Round2SuccessData | null = null;
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(init!.body as string) as Round2Request;
      const states: Round2SuccessData["state"] = { ...(data?.state ?? { example: "not_started", survey: "not_started", lead: "not_started" }) };
      if (request.action === "activity_start") states[request.activity] = "started";
      if (request.action === "example_complete") states.example = "completed";
      if (request.action === "survey_submit") states.survey = "completed";
      if (request.action === "lead_submit") states.lead = "completed";
      data = snapshot(request, (data?.revision ?? 0) + 1, { state: states, receipt: request.action === "lead_submit" ? { event_id: request.event_id, status: "received" } : data?.receipt ?? null });
      return ok(data);
    });
    const client = createRound2Client({ topic, attribution: direct, pageContext: "", preview: false, leadReady: true, indexedDB: null, fetch: fetcher, now: () => now });
    await client.connect();
    for (const activity of order) {
      expect(await client.openActivity(activity)).toBe(true);
      if (activity === "example") expect(await client.completeExample()).toBe(true);
      if (activity === "survey") expect(await client.submitSurvey({ q1: "none", q2: topic === "recording" ? "no_record" : "not_managing", q3: "none", q4: "no" })).toBe(true);
      if (activity === "lead") { client.setLeadForm({ email: "reader@example.com", consent: true }); client.setTurnstileToken("fixture"); expect(await client.submitLead()).toBe(true); }
      expect(await client.returnToMenu(activity)).toBe(true);
    }
    for (const activity of ["example", "survey", "lead"] as const) expect(client.getState().snapshot!.state[activity]).toBe((order as readonly string[]).includes(activity) ? "completed" : "not_started");
  });
});

it("remembers activities opened while bootstrap is unavailable and confirms start before later completion", async () => {
  let available = false;
  const { client, requests } = harness(r => !available ? fail("ROUND2_UNAVAILABLE", 503) : ok(snapshot(r, 2, { state: { example: r.action === "example_complete" ? "completed" : "started", survey: "not_started", lead: "not_started" } })));
  expect(await client.openActivity("example")).toBe(false);
  available = true; expect(await client.retry()).toBe(true);
  expect(requests.map(r => r.action)).toEqual(["bootstrap", "bootstrap", "bootstrap", "activity_start"]);
  expect(await client.completeExample()).toBe(true);
});

it("cookie-only recovery refuses old form actions after another tab replaces the cookie participation", async () => {
  let replaced = false;
  const { client, requests } = harness(r => ok(snapshot(r, 1, replaced ? { participation_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" } : {})));
  await client.connect(); replaced = true;
  expect(await client.openActivity("lead")).toBe(false);
  expect(requests.every(r => r.action === "bootstrap")).toBe(true);
  expect(client.getState().error?.code).toBe("BOOTSTRAP_CONFLICT");
});

it("cookie verification invalidates an old lead payload if consent generation changed before dispatch", async () => {
  let generation = 1;
  const { client, requests } = harness(r => ok(snapshot(r, generation, { consent_generation: generation })));
  await client.connect(); client.setLeadForm({ email: "fixture@example.com", consent: true }); client.setTurnstileToken("fixture-token");
  generation = 2;
  expect(await client.submitLead()).toBe(false);
  expect(requests.every(r => r.action === "bootstrap")).toBe(true);
  expect(client.getState().leadForm.consent).toBe(false);
});
