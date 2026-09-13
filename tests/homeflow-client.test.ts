import { describe, expect, it, vi } from "vitest";
import { readHomeflowCache, writeHomeflowCache, reconcileHomeflowCache, mergeHomeflowServerState, postHomeflowRequest, HOMEFLOW_CACHE_KEY } from "@/lib/marketing/homeflow-client";
import type { HomeflowUiState } from "@/lib/marketing/homeflow-client";
import type { Round2SuccessData } from "@/lib/marketing-round2";

const now = Date.parse("2026-09-11T01:00:00Z");
const server = (overrides: Partial<Round2SuccessData> = {}): Round2SuccessData => ({ round_version: "r2.1", topic: "homeflow", participation_id: "11111111-1111-4111-8111-111111111111", event_id: "22222222-2222-4222-8222-222222222222", revision: 2, consent_generation: 1, state: { survey: "completed", example: "not_started", lead: "not_started" }, receipt: null, participation_expires_at: "2026-10-01T00:00:00Z", retention_until: "2026-11-30T15:00:00Z", ...overrides });
const storage = () => { const data = new Map<string,string>(); return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key,value); }, removeItem: (key: string) => { data.delete(key); } }; };
const draft = (): HomeflowUiState => ({ version: "r2.2-homeflow" as const, participationId: server().participation_id, expiresAt: server().participation_expires_at, screen: "result" as const, question: 3, step: 1, answers: { q1: "one_two", q2: "once", q3: "mental", q4: "shopping" }, confirmedSurveyEventId: server().event_id, demo: { purchased: [], excluded: ["sugar", "chili", "soy"], recorded: false, shoppingCompleted: false }, pending: null });

describe("homeflow client recovery", () => {
  it("restores a matching version and participation but never invents lost result answers", () => {
    const s = storage(); expect(writeHomeflowCache(s, draft())).toBe(true);
    const saved = readHomeflowCache(s, now); expect(saved?.answers.q3).toBe("mental");
    expect(reconcileHomeflowCache(saved, server()).screen).toBe("result");
    expect(reconcileHomeflowCache(null, server()).screen).toBe("returning");
    expect(reconcileHomeflowCache(saved, server({ participation_id: "33333333-3333-4333-8333-333333333333" })).answers).toEqual({});
  });
  it("only server acknowledgement can restore successful lead and completed survey", () => {
    const saved = { ...draft(), screen: "done" as const };
    expect(reconcileHomeflowCache(saved, server()).screen).not.toBe("done");
    expect(reconcileHomeflowCache(draft(), server({ state: { survey: "not_started", example: "not_started", lead: "not_started" } })).screen).toBe("quiz");
    expect(reconcileHomeflowCache(null, server({ state: { survey: "completed", example: "completed", lead: "completed" }, receipt: { event_id: server().event_id, status: "received" } })).screen).toBe("done");
  });
  it("rejects expired, malformed and foreign cache without retaining PII", () => {
    const s = storage(); writeHomeflowCache(s, draft()); expect(readHomeflowCache(s, Date.parse("2026-10-02"))).toBeNull();
    s.setItem(HOMEFLOW_CACHE_KEY, JSON.stringify({ ...draft(), email: "private@example.com" })); expect(readHomeflowCache(s, now)).toBeNull();
    expect(writeHomeflowCache(s, { ...draft(), pending: { action: "lead_submit", email: "private@example.com" } })).toBe(false);
    expect(s.getItem(HOMEFLOW_CACHE_KEY)).toBeNull();
  });
  it("keeps an anonymous uncertain request identity for reload retries", () => {
    const pending = { action: "survey_submit", event_id: server().event_id, topic: "homeflow", round_version: "r2.1", honeypot: "", survey_version: "r2.2-homeflow", answers: draft().answers };
    const s = storage(); expect(writeHomeflowCache(s, { ...draft(), pending })).toBe(true);
    expect(readHomeflowCache(s, now)?.pending).toEqual(pending);
  });
  it("does not turn another tab's completed survey into this tab's unacknowledged result", () => {
    const unsent = { ...draft(), confirmedSurveyEventId: null };
    expect(reconcileHomeflowCache(unsent, server()).screen).toBe("returning");
  });
  it("ignores stale revisions for the current participation only", () => {
    const current = server({ revision: 7 });
    expect(mergeHomeflowServerState(current, server({ revision: 3 }))).toBe(current);
    expect(() => mergeHomeflowServerState(current, server({ participation_id: "33333333-3333-4333-8333-333333333333" }))).toThrow();
  });
  it("fails safely on storage denial and malformed API success", async () => {
    const blocked = { getItem: () => { throw Error(); }, setItem: () => { throw Error(); }, removeItem: () => {} };
    expect(readHomeflowCache(blocked, now)).toBeNull(); expect(writeHomeflowCache(blocked, draft())).toBe(false);
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { state: { lead: "completed" } } }) });
    await expect(postHomeflowRequest({ action: "example_complete", event_id: server().event_id, topic: "homeflow", round_version: "r2.1", honeypot: "" }, fetcher)).rejects.toThrow();
  });
});
