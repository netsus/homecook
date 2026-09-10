import { describe, expect, it } from "vitest";
import { createRound2PageContext } from "@/lib/server/marketing-round2-context";
import { buildRound2BootstrapRequest, prepareRound2Bootstrap, round2BootstrapContextUrl, type Round2BootstrapPreparation } from "@/lib/marketing/round2-session";
const now = Date.parse("2026-09-11T00:00:00Z");
const secret = "fixture-session-context-" + "x".repeat(32);
const direct = { first_channel: "direct" as const, utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null };
const prepared: Round2BootstrapPreparation = { kind: "key", topic: "recording", bootstrap_key: "A".repeat(43), event_id: "11111111-1111-4111-8111-111111111111", bootstrap_intent: "create_or_resume", attribution: direct, created_at: now };
describe("r2 bootstrap handoff without UI or network", () => {
  it("falls back to cookie_resume without creating a memory bootstrap key", async () => {
    const first = await prepareRound2Bootstrap({ topic: "recording", attribution: direct, nowMs: now, indexedDB: null });
    const again = await prepareRound2Bootstrap({ topic: "recording", attribution: direct, nowMs: now, indexedDB: null });
    expect(first).toEqual(again);
    expect(first).toMatchObject({ kind: "cookie_resume", topic: "recording", bootstrap_intent: "cookie_resume" });
    expect(Object.keys(first).sort()).toEqual(["bootstrap_intent", "event_id", "kind", "topic"]);
    expect(buildRound2BootstrapRequest(first)).toEqual({ action: "bootstrap", event_id: first.kind === "cookie_resume" ? first.event_id : "", topic: "recording", round_version: "r2.1", honeypot: "", bootstrap_intent: "cookie_resume" });
  });
  it("sends refreshed signed context while preserving semantic event identity", () => {
    const one = createRound2PageContext("recording", "", secret, now / 1000);
    const refreshed = createRound2PageContext("recording", "", secret, now / 1000 + 1800);
    expect(buildRound2BootstrapRequest(prepared, one)).toMatchObject({ event_id: prepared.kind === "key" ? prepared.event_id : "", page_context: one });
    expect(buildRound2BootstrapRequest(prepared, refreshed)).toMatchObject({ event_id: prepared.kind === "key" ? prepared.event_id : "", page_context: refreshed });
    expect(round2BootstrapContextUrl(prepared)).toBe("/beta/r2/recording");
  });
  it("refuses different attribution/topic under the pending event ID", () => {
    const different = createRound2PageContext("recording", "?utm_medium=share", secret, now / 1000);
    expect(() => buildRound2BootstrapRequest(prepared, different)).toThrow(expect.objectContaining({ code: "CONTEXT_INVALID" }));
    const otherTopic = createRound2PageContext("homeflow", "", secret, now / 1000);
    expect(() => buildRound2BootstrapRequest(prepared, otherTopic)).toThrow(expect.objectContaining({ code: "CONTEXT_INVALID" }));
  });
  it("reconstructs unknown empty attribution without leaking keys", () => {
    const item = { ...prepared, attribution: { ...direct, first_channel: "unknown" as const } } as Round2BootstrapPreparation;
    const url = round2BootstrapContextUrl(item);
    expect(url).toBe("/beta/r2/recording?utm_source=unknown");
    const token = createRound2PageContext("recording", new URL(url, "https://localhost:3443").search, secret, now / 1000);
    expect(buildRound2BootstrapRequest(item, token)).toMatchObject({ page_context: token });
    expect(url).not.toContain("AAAA");
  });
  it.each(["restart_required", "queue_full"] as const)("does not submit %s state", kind => {
    expect(() => buildRound2BootstrapRequest({ kind, topic: "recording" })).toThrow();
  });
});
