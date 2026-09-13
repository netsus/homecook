import { describe, expect, it } from "vitest";
import { parseRound2ClientRecord } from "@/lib/marketing/round2-client-storage";
const now = Date.parse("2026-09-11T00:00:00Z");
const event = { action: "activity_start", event_id: "11111111-1111-4111-8111-111111111111", topic: "recording", round_version: "r2.1", honeypot: "", activity: "example" };
const base = { version: 1, created_at: now, expires_at: now + 86400000, participation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", drafts: {}, outbox: [event] };
describe("nonPII round2 client storage boundary", () => {
  it("accepts only public nonPII actions and bounded valid drafts", () => {
    expect(parseRound2ClientRecord(base, "recording", now)?.outbox).toEqual([event]);
  });
  it.each(["email", "consent", "turnstile_token", "bootstrap_key"])("rejects %s even on an otherwise valid nonPII event", key => {
    expect(() => parseRound2ClientRecord({ ...base, outbox: [{ ...event, [key]: "secret" }] }, "recording", now)).toThrow();
  });
  it("rejects lead/bootstrap requests, cross-topic events and arbitrary draft fields", () => {
    for (const action of ["lead_submit", "bootstrap"]) expect(() => parseRound2ClientRecord({ ...base, outbox: [{ ...event, action }] }, "recording", now)).toThrow();
    expect(() => parseRound2ClientRecord({ ...base, outbox: [{ ...event, topic: "homeflow" }] }, "recording", now)).toThrow();
    expect(() => parseRound2ClientRecord({ ...base, drafts: { tab: { email: "private" } } }, "recording", now)).toThrow();
  });
  it("expires at the earlier deadline and rejects records beyond 30 days", () => {
    expect(parseRound2ClientRecord(base, "recording", base.expires_at)).toBeNull();
    expect(() => parseRound2ClientRecord({ ...base, expires_at: now + 31 * 86400000 }, "recording", now)).toThrow();
  });
});

// Actual IndexedDB transactions cannot be verified by replacing them with a Map.
// This bounded browser lane is opt-in; the normal unit lane remains browser-free.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ts from "typescript";
import { chromium } from "@playwright/test";
it.skipIf(process.env.R2_CLIENT_BROWSER !== "1")("real two-tab IDB enforces a shared 50 cap, persists drafts and removes expired records", async () => {
  const server = createServer(async (request, response) => {
    const path = (request.url ?? "/").split("?")[0];
    if (path === "/") { response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><title>r2 storage fixture</title><script type="module">import * as storage from "/lib/marketing/round2-client-storage"; import * as session from "/lib/marketing/round2-session"; import * as client from "/lib/marketing/round2-client"; window.r2Storage=storage; window.r2Session=session; window.r2Client=client;</script>'); return; }
    if (!/^\/lib\/(marketing\/(round2-client|round2-client-storage|round2-session|round2-survey)|marketing-round2)$/.test(path)) { response.writeHead(404).end(); return; }
    const source = await readFile(resolve(process.cwd(), `.${path}.ts`), "utf8");
    response.setHeader("Content-Type", "text/javascript"); response.end(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("Fixture bind failed");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext(); const [a, b] = await Promise.all([context.newPage(), context.newPage()]);
    const url = `http://127.0.0.1:${address.port}`; await Promise.all([a.goto(url), b.goto(url)]); await Promise.all([a.waitForFunction(() => !!window.r2Storage), b.waitForFunction(() => !!window.r2Storage)]);
    const args = { topic: "recording" as const, nowMs: now, attribution: { first_channel: "direct" as const, utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null }, participationId: base.participation_id, expiresAt: "2026-10-10T00:00:00Z" };
    const initial = await a.evaluate(async options => {
      const session = window.r2Session; return session.prepareRound2Bootstrap(options);
    }, args);
    expect(initial.kind).toBe("key");
    const enqueue = (page: typeof a, count: number) => page.evaluate(async ({ options, count }) => {
      const storage = window.r2Storage;
      return Promise.all(Array.from({ length: count }, () => storage.enqueueRound2Request({ ...options, request: { action: "menu_return", event_id: crypto.randomUUID(), topic: "recording", round_version: "r2.1", honeypot: "", from_activity: "example" } })));
    }, { options: args, count });
    const results = await Promise.all([enqueue(a, 25), enqueue(b, 25)]);
    expect(results.flat().filter(Boolean)).toHaveLength(49);
    const overflow = await b.evaluate(async options => {
      const session = window.r2Session; return session.prepareRound2Bootstrap({ ...options, attribution: { ...options.attribution, first_channel: "shared", utm_medium: "share" } });
    }, args);
    expect(overflow.kind).toBe("queue_full");
    const tabId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await a.evaluate(async options => {
      const storage = window.r2Storage; await storage.writeRound2ClientDraft(options);
    }, { ...args, tabId, draft: { q1: "one_two" } });
    await a.reload();
    const restored = await a.evaluate(async options => {
      return (window.r2Storage).loadRound2ClientRecord(options);
    }, args);
    expect(restored!.drafts[tabId]).toEqual({ q1: "one_two" }); expect(restored!.outbox).toHaveLength(49);
    expect(JSON.stringify(restored)).not.toMatch(/email|consent|turnstile_token|bootstrap_key/);
    const expired = await a.evaluate(async options => {
      return (window.r2Storage).loadRound2ClientRecord(options);
    }, { ...args, nowMs: Date.parse(args.expiresAt) });
    expect(expired).toBeNull();
    const failedConfirmation = await b.evaluate(async ({ now, direct }) => {
      const seen: string[] = [];
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (value, ...args) {
        if (value?.status === "confirmed") throw new DOMException("fixture quota", "QuotaExceededError");
        return put.call(this, value, ...args);
      };
      const pageContext = btoa(JSON.stringify({ topic: "homeflow", round_version: "r2.1", ...direct })) + ".fixture";
      try {
        const client = window.r2Client.createRound2Client({ topic: "homeflow", pageContext, attribution: direct, preview: false, leadReady: false, now: () => now,
          fetch: async (_input, init) => {
            const request = JSON.parse(init!.body as string); seen.push(request.bootstrap_intent);
            return new Response(JSON.stringify({ success: true, error: null, data: { round_version: "r2.1", topic: "homeflow", participation_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", event_id: request.event_id, revision: 1, consent_generation: 1, state: { example: "not_started", survey: "not_started", lead: "not_started" }, receipt: null, participation_expires_at: "2026-10-10T00:00:00Z", retention_until: "2026-11-30T15:00:00Z" } }));
          } });
        const connected = await client.connect(); return { connected, seen, blocked: client.getState().storageBlocked };
      } finally { IDBObjectStore.prototype.put = put; }
    }, { now, direct: args.attribution });
    expect(failedConfirmation).toEqual({ connected: true, seen: ["create_or_resume", "cookie_resume"], blocked: true });
    const clonedTab = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const saveOwnedDraft = (page: typeof a, answer: "none" | "one_two") => page.evaluate(async ({ now, direct, clonedTab, answer }) => {
      sessionStorage.setItem("mumeok-r2:tab-id", clonedTab);
      const pageContext = btoa(JSON.stringify({ topic: "recording", round_version: "r2.1", ...direct })) + ".fixture";
      const client = window.r2Client.createRound2Client({ topic: "recording", pageContext, attribution: direct, preview: false, leadReady: false, now: () => now,
        fetch: async (_input, init) => {
          const request = JSON.parse(init!.body as string);
          return new Response(JSON.stringify({ success: true, error: null, data: { round_version: "r2.1", topic: "recording", participation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", event_id: request.event_id, revision: 1, consent_generation: 1, state: { example: "not_started", survey: "not_started", lead: "not_started" }, receipt: null, participation_expires_at: "2026-10-10T00:00:00Z", retention_until: "2026-11-30T15:00:00Z" } }));
        } });
      if (answer === "none") { await client.saveSurveyDraft({ q1: answer }); await client.connect(); }
      else { await client.connect(); await client.saveSurveyDraft({ q1: answer }); }
    }, { now, direct: args.attribution, clonedTab, answer });
    await saveOwnedDraft(a, "none"); await saveOwnedDraft(b, "one_two");
    const separateDrafts = await a.evaluate(async options => (window.r2Storage).loadRound2ClientRecord(options), args);
    expect(Object.values(separateDrafts!.drafts)).toEqual(expect.arrayContaining([{ q1: "none" }, { q1: "one_two" }]));
    expect(Object.keys(separateDrafts!.drafts)).toHaveLength(2);
    const oldKey = await a.evaluate(async ({ now, direct }) => {
      let key = "";
      const pageContext = btoa(JSON.stringify({ topic: "homeflow", round_version: "r2.1", ...direct })) + ".fixture";
      window.r2StaleClient = window.r2Client.createRound2Client({ topic: "homeflow", pageContext, attribution: direct, preview: false, leadReady: false, now: () => now,
        fetch: async (_input, init) => {
          const request = JSON.parse(init!.body as string);
          if (request.action === "menu_return") {
            window.r2Waiting = true;
            await new Promise<void>(resolve => { window.r2ReleaseExpired = resolve; });
            return new Response(JSON.stringify({ success: false, data: null, error: { code: "PARTICIPATION_EXPIRED", message: "fixture expired", fields: [] } }), { status: 410 });
          }
          key = request.bootstrap_key;
          return new Response(JSON.stringify({ success: true, error: null, data: { round_version: "r2.1", topic: "homeflow", participation_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", event_id: request.event_id, revision: 1, consent_generation: 1, state: { example: "not_started", survey: "not_started", lead: "not_started" }, receipt: null, participation_expires_at: "2026-10-10T00:00:00Z", retention_until: "2026-11-30T15:00:00Z" } }));
        } });
      await window.r2StaleClient.connect(); return key;
    }, { now, direct: args.attribution });
    const oldResponse = a.evaluate(() => window.r2StaleClient.returnToMenu("survey")).catch(() => false);
    await a.waitForFunction(() => window.r2Waiting);
    const freshRecord = await b.evaluate(async ({ now, direct, oldKey }) => {
      const options = { topic: "homeflow" as const, nowMs: now, attribution: direct };
      await window.r2Session.markRound2ParticipationExpired({ ...options, bootstrapKey: oldKey });
      const fresh = await window.r2Session.restartRound2Bootstrap(options);
      if (fresh.kind !== "key") throw new Error("fixture restart failed");
      const owned = { ...options, participationId: "ffffffff-ffff-4fff-8fff-ffffffffffff", expiresAt: "2026-10-10T00:00:00Z" };
      await window.r2Storage.writeRound2ClientDraft({ ...owned, tabId: "ffffffff-ffff-4fff-8fff-fffffffffff1", draft: { q1: "six_plus" } });
      await window.r2Storage.enqueueRound2Request({ ...owned, request: { action: "activity_start", activity: "survey", topic: "homeflow", event_id: crypto.randomUUID(), round_version: "r2.1", honeypot: "" } });
      return { key: fresh.bootstrap_key, record: await window.r2Storage.loadRound2ClientRecord(options) };
    }, { now, direct: args.attribution, oldKey });
    expect(freshRecord.key).not.toBe(oldKey);
    const staleWrites = await a.evaluate(async options => {
      const owned = { ...options, participationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", expiresAt: "2026-10-10T00:00:00Z" };
      const results = await Promise.allSettled([
        window.r2Storage.writeRound2ClientDraft({ ...owned, tabId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", draft: { q1: "none" } }),
        window.r2Storage.enqueueRound2Request({ ...owned, request: { action: "activity_start", activity: "survey", topic: "homeflow", event_id: crypto.randomUUID(), round_version: "r2.1", honeypot: "" } }),
      ]);
      return { rejected: results.every(result => result.status === "rejected"), record: await window.r2Storage.loadRound2ClientRecord(options) };
    }, { topic: "homeflow" as const, nowMs: now });
    expect(staleWrites.rejected).toBe(true);
    expect(staleWrites.record).toEqual(freshRecord.record);
    await a.evaluate(() => window.r2ReleaseExpired());
    expect(await oldResponse).toBe(false);
    const afterOldResponse = await b.evaluate(async options => ({ record: await window.r2Storage.loadRound2ClientRecord(options), prepared: await window.r2Session.prepareRound2Bootstrap(options) }), { topic: "homeflow" as const, nowMs: now, attribution: args.attribution });
    expect(afterOldResponse.record).toEqual(freshRecord.record);
    expect(afterOldResponse.prepared).toMatchObject({ kind: "key", bootstrap_key: freshRecord.key });
    await a.evaluate(async ({ now, direct }) => {
      window.r2Calls = [];
      const pageContext = btoa(JSON.stringify({ topic: "homeflow", round_version: "r2.1", ...direct })) + ".fixture";
      window.r2StaleClient = window.r2Client.createRound2Client({ topic: "homeflow", pageContext, attribution: direct, preview: false, leadReady: true, now: () => now,
        fetch: async (_input, init) => {
          const request = JSON.parse(init!.body as string); window.r2Calls.push(request.action);
          return new Response(JSON.stringify({ success: true, error: null, data: { round_version: "r2.1", topic: "homeflow", participation_id: "ffffffff-ffff-4fff-8fff-ffffffffffff", event_id: request.event_id, revision: 2, consent_generation: 1, state: { example: "not_started", survey: "started", lead: "started" }, receipt: null, participation_expires_at: "2026-10-10T00:00:00Z", retention_until: "2026-11-30T15:00:00Z" } }));
        } });
      await window.r2StaleClient.connect(); window.r2Calls = [];
      window.r2StaleClient.setLeadForm({ email: "fixture@example.com", consent: true }); window.r2StaleClient.setTurnstileToken("fixture-token");
    }, { now, direct: args.attribution });
    await b.evaluate(async options => {
      await window.r2Session.markRound2ParticipationExpired(options);
      await window.r2Session.restartRound2Bootstrap(options);
    }, { topic: "homeflow" as const, nowMs: now, attribution: args.attribution, bootstrapKey: freshRecord.key });
    const changedKeyActions = await a.evaluate(async options => {
      const lead = await window.r2StaleClient.submitLead();
      const draft = await window.r2StaleClient.saveSurveyDraft({ q1: "none" });
      return { lead, draft, requests: window.r2Calls, record: await window.r2Storage.loadRound2ClientRecord(options) };
    }, { topic: "homeflow" as const, nowMs: now });
    expect(changedKeyActions).toEqual({ lead: false, draft: false, requests: [], record: null });
    await context.close();
  } finally { await browser.close(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}, 30_000);

declare global { interface Window { r2Calls: string[]; r2StaleClient: import("@/lib/marketing/round2-client").Round2Client; r2Waiting: boolean; r2ReleaseExpired: () => void; r2Client: typeof import("@/lib/marketing/round2-client"); r2Storage: typeof import("@/lib/marketing/round2-client-storage"); r2Session: typeof import("@/lib/marketing/round2-session"); } }
