import { describe, expect, it, vi } from "vitest";
import { createRecordingClient, RECORDING_CACHE_KEY } from "@/lib/marketing/recording-client";
import { RETENTION_UNTIL, parseRound2Request, type Round2Request, type Round2SuccessData } from "@/lib/marketing-round2";

const now = Date.parse("2026-09-12T00:00:00Z");
const pid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const answers = { q1: "daily", q2: "3_5", q3: "track", q4: "search" } as const;
function harness(options: { sharedResult?: "homecook-passer"; preview?: boolean; completed?: boolean; conflict?: boolean; failStart?: boolean; failSubmit?: boolean; defaultStorage?: boolean } = {}) {
  const requests: Round2Request[] = [];
  const records = new Map<string, string>();
  const storage = { getItem: vi.fn((key: string) => records.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { records.set(key, value); }), removeItem: vi.fn((key: string) => { records.delete(key); }) };
  const activities: Round2SuccessData["state"] = { survey: options.completed ? "completed" : "not_started", example: "not_started", lead: "not_started" };
  let failStart = options.failStart, failSubmit = options.failSubmit;
  const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    // The production parser validates every command, including the actual BE r2.2 tuple.
    const request = parseRound2Request(init!.body as string);
    requests.push(request);
    const fail = (code: string, status = 503) => new Response(JSON.stringify({ success: false, data: null, error: { code, message: "fixture", fields: [] } }), { status });
    if (request.action === "activity_start") {
      if (request.activity === "survey" && failStart) { failStart = false; return fail("ROUND2_UNAVAILABLE"); }
      if (activities[request.activity] !== "completed") activities[request.activity] = "started";
    }
    if (request.action === "survey_submit") {
      if (failSubmit) { failSubmit = false; return fail("ROUND2_UNAVAILABLE"); }
      activities.survey = "completed";
      if (options.conflict) return fail("ACTIVITY_ALREADY_COMPLETED", 409);
    }
    if (request.action === "example_complete") activities.example = "completed";
    if (request.action === "lead_submit") activities.lead = "completed";
    return new Response(JSON.stringify({ success: true, error: null, data: {
      round_version: "r2.1", topic: "recording", participation_id: pid, event_id: request.event_id,
      revision: requests.length, consent_generation: 1, state: { ...activities },
      participation_expires_at: "2026-10-10T00:00:00Z", retention_until: RETENTION_UNTIL,
      receipt: activities.lead === "completed" ? { status: "received", event_id: request.event_id } : null,
    } }));
  });
  const make = () => createRecordingClient({ topic: "recording", pageContext: "", preview: !!options.preview, hostname: "localhost", leadReady: true,
    attribution: { first_channel: "direct", utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null },
    sharedResult: options.sharedResult, indexedDB: null, now: () => now, fetch: fetcher, ...(options.defaultStorage ? {} : { storage }) });
  return { client: make(), make, requests, records, storage, fetcher, activities };
}
async function answerAll(client: ReturnType<typeof createRecordingClient>) {
  for (const [key, value] of Object.entries(answers)) await client.selectAnswer(key as keyof typeof answers, value);
}
describe("recording serial connection with the real R2 parser", () => {
  it("render and concurrent bootstrap never start a survey; first answer waits for both ACKs", async () => {
    const { client, requests } = harness({ failStart: true });
    expect(requests).toEqual([]);
    await Promise.all([client.connect(), client.connect()]);
    expect(requests.map(r => r.action)).toEqual(["bootstrap"]);
    await client.selectAnswer("q1", "daily");
    expect(client.getState()).toMatchObject({ question: 0, answers: { q1: "daily" } });
    const first = requests.find(r => r.action === "activity_start")!;
    await client.retry();
    expect(client.getState().question).toBe(1);
    expect(requests.filter(r => r.action === "activity_start").map(r => r.event_id)).toEqual([first.event_id, first.event_id]);
    client.back(); await client.selectAnswer("q1", "none");
    expect(requests.filter(r => r.action === "activity_start")).toHaveLength(2);
  });
  it("only the original acknowledged Q4 tuple produces its Q3 result, including explicit retry", async () => {
    const { client, requests, records } = harness({ failSubmit: true });
    await answerAll(client);
    expect(client.getState()).toMatchObject({ screen: "quiz", question: 3, result: null });
    const submitted = requests.find(r => r.action === "survey_submit")!;
    await client.selectAnswer("q3", "pass"); // A pending Q4 is locked, not replaceable.
    await client.retry();
    expect(client.getState()).toMatchObject({ screen: "result", result: "ingredient-tracker" });
    expect(requests.filter(r => r.action === "survey_submit").map(r => r.event_id)).toEqual([submitted.event_id, submitted.event_id]);
    expect(JSON.parse(records.get(RECORDING_CACHE_KEY)!)).toMatchObject({ confirmed: { eventId: submitted.event_id, answers } });
  });
  it("409 plus completed snapshot never proves the local answers", async () => {
    const { client } = harness({ conflict: true });
    await answerAll(client);
    expect(client.getState()).toMatchObject({ screen: "returning", result: null });
  });
  it("does not resubmit completed surveys without a matching complete proof", async () => {
    const { client, requests } = harness({ completed: true });
    await client.connect(); await client.selectAnswer("q1", "daily");
    expect(client.getState()).toMatchObject({ screen: "returning", result: null });
    expect(requests.every(r => r.action === "bootstrap")).toBe(true);
  });
  it("recovers only matching identity, expiry, version and confirmed original tuple", async () => {
    const { client, make, records } = harness();
    await answerAll(client); client.dispose();
    const resumed = make(); await resumed.connect();
    expect(resumed.getState()).toMatchObject({ screen: "result", result: "ingredient-tracker" }); resumed.dispose();
    const cache = JSON.parse(records.get(RECORDING_CACHE_KEY)!);
    records.set(RECORDING_CACHE_KEY, JSON.stringify({ ...cache, participationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }));
    const foreign = make(); await foreign.connect();
    expect(foreign.getState()).toMatchObject({ screen: "returning", result: null });
  });
  it("preserves incompatible drafts until an explicit local restart without new participation", async () => {
    const { client, records, requests } = harness();
    const incompatible = JSON.stringify({ version: "r2.1-recording", answers: { q1: "none" } });
    records.set(RECORDING_CACHE_KEY, incompatible);
    await client.connect();
    expect(client.getState().screen).toBe("legacy");
    expect(records.get(RECORDING_CACHE_KEY)).toBe(incompatible);
    const count = requests.length; client.restartLocal();
    expect(requests.length).toBe(count);
    expect(client.getState()).toMatchObject({ screen: "quiz", question: 0, answers: {} });
  });
  it("completes example only after five scenes, planner, packaged food and payoff", async () => {
    const { client, requests } = harness(); await answerAll(client);
    await client.next();
    expect(client.getState()).toMatchObject({ screen: "experience", step: 1 });
    for (let i = 1; i < 5; i++) await client.next();
    await client.next(); expect(client.getState().screen).toBe("planner");
    await client.next(); expect(client.getState().screen).toBe("packaged");
    await client.next(); expect(client.getState().screen).toBe("payoff");
    expect(requests.filter(r => r.action === "example_complete")).toHaveLength(0);
    await client.next(); expect(client.getState().screen).toBe("lead");
    const actions = requests.filter(r => r.action !== "bootstrap");
    expect(actions.slice(-2)).toMatchObject([{ action: "example_complete" }, { action: "activity_start", activity: "lead" }]);
  });
  it("shared result is read-only and explicit test start goes to Q1 without POST", async () => {
    const { client, requests, storage } = harness({ sharedResult: "homecook-passer" });
    await client.connect(); await client.next(); await client.retry();
    expect(client.getState()).toMatchObject({ shared: true, screen: "result", result: "homecook-passer" });
    expect(requests).toEqual([]); expect(storage.getItem).not.toHaveBeenCalled();
    client.startTest(); expect(client.getState()).toMatchObject({ shared: false, screen: "quiz", question: 0 });
    expect(requests).toEqual([]);
    await client.selectAnswer("q1", "daily");
    expect(requests.filter(r => r.action === "activity_start")).toHaveLength(1);
  });
  it("preview uses memory only and never writes a real confirmation cache", async () => {
    const { client, requests, storage } = harness({ preview: true });
    await answerAll(client);
    expect(client.getState()).toMatchObject({ screen: "result", result: "ingredient-tracker" });
    expect(requests).toEqual([]); expect(storage.setItem).not.toHaveBeenCalled();
  });
  it("acquires the normal UI cache only after explicitly leaving a shared result", async () => {
    const { client, storage, records } = harness({ sharedResult: "homecook-passer", defaultStorage: true });
    vi.stubGlobal("sessionStorage", storage);
    try {
      await client.connect(); expect(storage.getItem).not.toHaveBeenCalled();
      client.startTest(); await answerAll(client);
      expect(records.has(RECORDING_CACHE_KEY)).toBe(true);
    } finally { vi.unstubAllGlobals(); }
  });
  it("never persists email, consent or tokens in its UI cache", async () => {
    const { client, records } = harness(); await answerAll(client);
    client.setLeadForm({ email: "private@example.com", consent: true }); client.setTurnstileToken("secret-token");
    const value = records.get(RECORDING_CACHE_KEY)!;
    expect(value).not.toMatch(/private@example|secret-token|email|consent|token|pageContext|bootstrap/);
  });
  it("restores a started lead form with confirmed result but no private draft", async () => {
    const { client, make, requests } = harness(); await answerAll(client); await client.next();
    for (let i = 0; i < 8; i++) await client.next();
    client.setLeadForm({ email: "private@example.com", consent: true }); client.dispose();
    const resumed = make(); const count = requests.length; await resumed.connect();
    expect(resumed.getState()).toMatchObject({ screen: "lead", result: "ingredient-tracker", core: { leadForm: { email: "", consent: false } } });
    expect(requests.slice(count).every(r => r.action === "bootstrap")).toBe(true);
  });
  it("lets a completed applicant revisit the result and examples without another email or event", async () => {
    const { client, requests } = harness(); await answerAll(client);
    await client.next();
    for (let i = 0; i < 8; i++) await client.next();
    expect(client.getState().screen).toBe("lead");
    client.setLeadForm({ email: "fixture@example.com", consent: true }); client.setTurnstileToken("fixture");
    await client.submitLead(); expect(client.getState().screen).toBe("done");
    const count = requests.length;
    client.restartLocal(); expect(client.getState().screen).toBe("result");
    await client.next(); expect(client.getState().screen).toBe("experience");
    for (let i = 0; i < 8; i++) await client.next();
    expect(client.getState().screen).toBe("done");
    expect(requests).toHaveLength(count);
  });
});
