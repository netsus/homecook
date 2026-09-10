import { describe, expect, it, vi } from "vitest";
import { createMarketingRound2Handler } from "@/lib/server/marketing-round2";
import { createRound2PageContext, serializeRound2Cookie } from "@/lib/server/marketing-round2-context";
import { Round2Error } from "@/lib/marketing-round2";
import type { MarketingRound2InternalClient } from "@/types/marketing-round2";

const origin = "https://localhost:3443";
const body = { action: "example_complete", event_id: "11111111-1111-4111-8111-111111111111", topic: "recording", round_version: "r2.1", honeypot: "" };
const request = (data: unknown = body, headers = {}, method = "POST") => new Request(`${origin}/api/v1/marketing/round2`, {
  method, headers: { origin, host: "localhost:3443", "content-type": "application/json", ...headers },
  ...(method === "POST" ? { body: typeof data === "string" ? data : JSON.stringify(data) } : {}),
});
const secrets = { page: "1".repeat(64), cookie: "2".repeat(64), bootstrap: "3".repeat(64), event: "4".repeat(64), email: "5".repeat(64), receipt: "6".repeat(64), rate: "7".repeat(64) };
const now = Date.parse("2026-09-11T01:00:00Z");
const pid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const claims = { v: 1 as const, pid, topic: "recording" as const, round_version: "r2.1" as const, iat: now / 1000, exp: now / 1000 + 86400 };
const data = { round_version: "r2.1", topic: "recording", participation_id: pid, event_id: body.event_id, revision: 1, consent_generation: 1,
  state: { example: "not_started", survey: "not_started", lead: "not_started" }, receipt: null,
  participation_expires_at: new Date(claims.exp * 1000).toISOString().replace(".000Z", "Z"), retention_until: "2026-11-30T15:00:00Z" };
const attribution = { first_channel: "direct", utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null };
const inspected = { kind: "inspected", data, bootstrap: { participation_id: pid, created_at: "2026-09-11T01:00:00Z", expires_at: data.participation_expires_at, first_attribution: attribution }, replay: "absent", needs_turnstile: false };
const cookieHeader = () => serializeRound2Cookie(claims, secrets.cookie, now / 1000).split(";")[0];
function setup(overrides = {}) {
  const execute = vi.fn<MarketingRound2InternalClient["execute"]>(async command => ({ status: 200, error: null, data: command.op === "inspect" ? inspected : { kind: "applied", data, cookie_claims: null } }));
  const release = vi.fn(async () => {});
  const readControl = vi.fn(async () => ({ version: 1 as const, collection_enabled: true, lead_enabled: true, consent_generation: 1 }));
  const deps = { now: () => Date.parse("2026-09-11T01:00:00Z"), config: { enabled: true, leadsEnabled: false, localPreview: false, origin, hostname: "localhost" as const, secrets },
    readControl: vi.fn(async () => ({ version: 1 as const, collection_enabled: true, lead_enabled: false, consent_generation: 1 })),
    consumeRate: vi.fn(async () => {}), trustedIp: vi.fn(async () => "127.0.0.1"), leadReadiness: vi.fn(async () => {}),
    acquireControlLease: vi.fn(async () => ({ release, readControl })), execute, verifyTurnstile: vi.fn(async () => new Date(now).toISOString()), ...overrides };
  return { deps, handle: createMarketingRound2Handler(deps) };
}
describe("r2 HTTP boundary before persistence", () => {
  it("rejects methods with the exact envelope and no persistence", async () => {
    const { handle, deps } = setup();
    const response = await handle(request(undefined, {}, "GET"));
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(await response.json()).toEqual({ success: false, data: null, error: { code: "METHOD_NOT_ALLOWED", message: "지원하지 않는 요청 방식이에요.", fields: [] } });
    expect(deps.execute).not.toHaveBeenCalled();
  });
  it.each([{ origin: "https://evil.example" }, { host: "localhost:3000" }, { "sec-fetch-site": "cross-site" }, { origin: "null" }])("rejects untrusted origins before persistence", async (headers) => {
    const { handle, deps } = setup();
    expect((await handle(request(body, headers))).status).toBe(403);
    expect(deps.execute).not.toHaveBeenCalled();
  });
  it("keeps preview disabled without touching storage or provider", async () => {
    const { handle, deps } = setup({ config: { enabled: true, localPreview: true, origin, hostname: "localhost", secrets } });
    const response = await handle(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe("ROUND2_DISABLED");
    expect(deps.readControl).not.toHaveBeenCalled();
    expect(deps.execute).not.toHaveBeenCalled();
  });
  it("requires a signed participation cookie", async () => {
    const { handle, deps } = setup();
    const response = await handle(request());
    expect(response.status).toBe(401);
    expect(deps.execute).not.toHaveBeenCalled();
  });
  it("bounds the body before parsing or persisting", async () => {
    const { handle, deps } = setup();
    expect((await handle(request(" ".repeat(8193)))).status).toBe(413);
    expect(deps.execute).not.toHaveBeenCalled();
  });
  it("rejects unknown keys without reflecting private input", async () => {
    const { handle } = setup();
    const response = await handle(request({ ...body, "secret@example.com": "private" }));
    expect(response.status).toBe(422);
    expect(await response.text()).not.toContain("secret@example.com");
  });
});

describe("r2 authoritative apply and lost responses", () => {
  it("counts cookie-less confirmed key restoration against its existing participation", async () => {
    const { handle, deps } = setup();
    deps.execute.mockImplementation(async command => ({ status: 200, error: null, data: command.op === "inspect" ? inspected : { kind: "applied", data, cookie_claims: claims } }));
    await handle(request({ ...body, action: "bootstrap", bootstrap_intent: "resume", bootstrap_key: "A".repeat(43), page_context: createRound2PageContext("recording", "", secrets.page, now / 1000) }));
    expect(deps.consumeRate).toHaveBeenCalledWith({ ip: "127.0.0.1", participationId: pid, buckets: ["participation"] });
  });
  it("rejects a non-string state even if it stringifies to a valid enum", async () => {
    const { handle, deps } = setup();
    deps.execute.mockImplementation(async command => ({ status: 200, error: null, data: command.op === "inspect" ? inspected : { kind: "applied", data: { ...data, state: { ...data.state, example: ["completed"] } }, cookie_claims: null } }));
    expect((await handle(request(body, { cookie: cookieHeader() }))).status).toBe(503);
  });
  it("reconstructs a command and only returns the apply snapshot", async () => {
    const { handle, deps } = setup();
    const response = await handle(request(body, { cookie: cookieHeader() }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data, error: null });
    expect(deps.execute.mock.calls.map(call => call[0].op)).toEqual(["inspect", "apply"]);
    const command = deps.execute.mock.calls[1][0];
    expect(Object.keys(command).sort()).toEqual("op action event_id topic round_version participation_id bootstrap_intent bootstrap_digest activity payload payload_digest lead control".split(" ").sort());
    expect(JSON.stringify(command)).not.toContain("__Secure-");
    expect((await deps.acquireControlLease()).release).toHaveBeenCalledOnce();
  });
  it("bootstraps with one apply and sets only the topic cookie", async () => {
    const { handle, deps } = setup();
    deps.execute.mockImplementation(async command => ({ status: 200, error: null, data: command.op === "inspect" ? { ...inspected, data: null, bootstrap: null } : { kind: "applied", data, cookie_claims: claims } }));
    const response = await handle(request({ ...body, action: "bootstrap", bootstrap_intent: "create_or_resume", bootstrap_key: "A".repeat(43), page_context: createRound2PageContext("recording", "", secrets.page, now / 1000) }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("__Secure-mumeok_r2_recording=");
    expect(response.headers.get("set-cookie")).not.toContain("mumeok_validation_session");
  });
  it("never signs a DB cookie with an impossible future creation time", async () => {
    const { handle, deps } = setup();
    deps.execute.mockImplementation(async command => ({ status: 200, error: null, data: command.op === "inspect" ? { ...inspected, data: null, bootstrap: null } : { kind: "applied", data, cookie_claims: { ...claims, iat: now / 1000 + 60 } } }));
    const response = await handle(request({ ...body, action: "bootstrap", bootstrap_intent: "create_or_resume", bootstrap_key: "A".repeat(43), page_context: createRound2PageContext("recording", "", secrets.page, now / 1000) }));
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("expires only the verified deleted/expired topic cookie", async () => {
    const { handle, deps } = setup();
    deps.execute.mockResolvedValue({ status: 410, error: { code: "PT410", message: "PARTICIPATION_EXPIRED" }, data: null });
    const response = await handle(request(body, { cookie: cookieHeader() }));
    expect(response.status).toBe(410);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("set-cookie")).not.toContain("homeflow");
  });
  it("holds the control lease if the apply outcome cannot be established", async () => {
    const { handle, deps } = setup();
    deps.execute.mockImplementation(async command => { if(command.op === "apply") throw new Error("lost response"); return { status: 200, error: null, data: inspected }; });
    expect((await handle(request(body, { cookie: cookieHeader() }))).status).toBe(503);
    expect((await deps.acquireControlLease()).release).not.toHaveBeenCalled();
  });
  it("releases an unknown outcome only after same-event commit proof", async () => {
    const { handle, deps } = setup();
    deps.execute.mockResolvedValueOnce({ status: 200, error: null, data: inspected });
    deps.execute.mockRejectedValueOnce(new Error("lost response"));
    deps.execute.mockResolvedValueOnce({ status: 200, error: null, data: { ...inspected, replay: "same" } });
    expect((await handle(request(body, { cookie: cookieHeader() }))).status).toBe(503);
    expect((await deps.acquireControlLease()).release).toHaveBeenCalledOnce();
  });
  it("rechecks control under the lease before any apply", async () => {
    const { handle, deps } = setup();
    (await deps.acquireControlLease()).readControl.mockResolvedValue({ version: 1, collection_enabled: false, lead_enabled: false, consent_generation: 1 });
    expect((await handle(request(body, { cookie: cookieHeader() }))).status).toBe(503);
    expect(deps.execute).toHaveBeenCalledOnce();
    expect((await deps.acquireControlLease()).release).toHaveBeenCalledOnce();
  });
  it("maps only exact SQLSTATE/code pairs and does not leak unknown SQL", async () => {
    const { handle, deps } = setup();
    deps.execute.mockResolvedValue({ status: 409, error: { code: "23505", message: "EVENT_CONFLICT secret@example.com" }, data: null });
    const response = await handle(request(body, { cookie: cookieHeader() }));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret@example.com");
  });
  it("does not treat a non-success RPC HTTP status as a successful commit", async () => {
    const { handle, deps } = setup();
    deps.execute.mockImplementation(async command => ({ status: 503, error: null, data: command.op === "inspect" ? inspected : { kind: "applied", data, cookie_claims: null } }));
    expect((await handle(request(body, { cookie: cookieHeader() }))).status).toBe(503);
    expect(deps.acquireControlLease).not.toHaveBeenCalled();
  });
  it("keeps rate failures public and bounded without dispatch", async () => {
    const { handle, deps } = setup({ consumeRate: vi.fn(async () => { throw new Round2Error("RATE_LIMITED", [], 42); }) });
    const response = await handle(request(body, { cookie: cookieHeader() }));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(deps.execute).not.toHaveBeenCalled();
  });
});

describe("r2 lead receipts still obey current gates", () => {
  const leadBody = { ...body, action: "lead_submit", email: " User@Example.com ", consent: true, consent_version: "mumeok-r2-beta-notice-20260911", purpose: "beta_open_notice", consent_generation: 1 };
  const leadData = { ...data, state: { ...data.state, lead: "completed" }, receipt: { event_id: body.event_id, status: "received" } };
  function leadSetup() {
    const result = setup();
    result.deps.config.leadsEnabled = true;
    result.deps.readControl.mockResolvedValue({ version: 1, collection_enabled: true, lead_enabled: true, consent_generation: 1 });
    result.deps.execute.mockImplementation(async command => ({ status: 200, error: null, data: command.op === "inspect" ? { ...inspected, data: leadData, replay: "same" } : { kind: "applied", data: leadData, cookie_claims: null } }));
    return result;
  }
  it("replays the same normalized receipt without verifying or storing a token", async () => {
    const { handle, deps } = leadSetup();
    const response = await handle(request(leadBody, { cookie: cookieHeader() }));
    expect(response.status).toBe(200);
    expect((await response.json()).data.receipt).toEqual(leadData.receipt);
    expect(deps.verifyTurnstile).not.toHaveBeenCalled();
    expect(deps.leadReadiness).toHaveBeenCalledTimes(2);
    expect(deps.execute.mock.calls[0][0].lead?.email_normalized).toBe("user@example.com");
    expect(deps.execute.mock.calls[0][0].payload).toEqual({});
  });
  it("requires a new token when no successful same-event receipt exists", async () => {
    const { handle, deps } = leadSetup();
    deps.execute.mockResolvedValue({ status: 200, error: null, data: { ...inspected, needs_turnstile: true } });
    const response = await handle(request(leadBody, { cookie: cookieHeader() }));
    expect(response.status).toBe(422);
    expect((await response.json()).error.fields).toEqual(["turnstile_token"]);
    expect(deps.acquireControlLease).not.toHaveBeenCalled();
  });
  it("does external verification before acquiring the control lease", async () => {
    const { handle, deps } = leadSetup();
    deps.execute.mockResolvedValueOnce({ status: 200, error: null, data: { ...inspected, needs_turnstile: true } });
    expect((await handle(request({ ...leadBody, turnstile_token: "test-provider-token" }, { cookie: cookieHeader() }))).status).toBe(200);
    expect(deps.verifyTurnstile.mock.invocationCallOrder[0]).toBeLessThan(deps.acquireControlLease.mock.invocationCallOrder[0]);
    expect(deps.execute.mock.calls[1][0].lead?.turnstile_verified_at).toBe(new Date(now).toISOString());
    expect(JSON.stringify(deps.execute.mock.calls)).not.toContain("test-provider-token");
  });
  it("counts stale consent attempts in lead limits before returning the gate error", async () => {
    const { handle, deps } = leadSetup();
    deps.readControl.mockResolvedValue({ version: 1, collection_enabled: true, lead_enabled: true, consent_generation: 2 });
    const response = await handle(request(leadBody, { cookie: cookieHeader() }));
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("CONSENT_REFRESH_REQUIRED");
    expect(deps.consumeRate).toHaveBeenCalledWith({ ip: "127.0.0.1", participationId: pid, buckets: ["lead_ip", "lead_participation"] });
    expect(deps.execute).not.toHaveBeenCalled();
  });
});
