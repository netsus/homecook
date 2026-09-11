import { describe, expect, it } from "vitest";
import { canonicalRound2Json, normalizeRound2Email, parseRound2Request, readRound2Body, Round2Error } from "@/lib/marketing-round2";

const common = { event_id: "11111111-1111-4111-8111-111111111111", topic: "recording", round_version: "r2.1", honeypot: "" };
const lead = { ...common, action: "lead_submit", email: " Reader+Test@EXAMPLE.COM \t", consent: true, consent_version: "mumeok-r2-beta-notice-20260911", purpose: "beta_open_notice", consent_generation: 1 };
const answers = { q1: "none", q2: "other", q3: "none", q4: "unsure" };
function error(raw: string, code: string, fields: string[] = []) {
  try { parseRound2Request(raw); throw new Error("accepted invalid request"); }
  catch (err) { expect(err).toMatchObject({ code, fields }); }
}
describe("round2 exact protocol", () => {
  it.each([
    { ...common, action: "bootstrap", bootstrap_key: "A".repeat(43), page_context: "signed", bootstrap_intent: "create_or_resume" },
    { ...common, action: "bootstrap", bootstrap_key: "A".repeat(43), page_context: "signed", bootstrap_intent: "resume" },
    { ...common, action: "bootstrap", bootstrap_intent: "cookie_resume" },
    { ...common, action: "activity_start", activity: "lead" },
    { ...common, action: "example_complete" },
    { ...common, action: "survey_submit", survey_version: "r2.1-recording", answers },
    { ...common, topic: "homeflow", action: "survey_submit", survey_version: "r2.1-homeflow", answers: { ...answers, q2: "not_managing" } },
    { ...common, action: "menu_return", from_activity: "survey" },
  ])("accepts exact action $action", (input) => expect(parseRound2Request(JSON.stringify(input))).toEqual(input));
  it("normalizes lead email and permits tokenless receipt request", () => expect(parseRound2Request(JSON.stringify(lead))).toEqual({ ...lead, email: "reader+test@example.com" }));
  it.each(["null", "[]", "1", '"text"', '{"action":"bootstrap","action":"bootstrap"}', '{"answers":{"q1":1,"q\\u0031":2}}', '{"a":{"b":{"c":{"d":{"e":{"f":{"g":{"h":{"i":1}}}}}}}}}']) ("rejects invalid/duplicate/deep JSON %s", raw => error(raw, "INVALID_JSON"));
  it("does not report unknown keys or their values", () => error(JSON.stringify({ ...lead, private_email: "hidden@example.com" }), "VALIDATION_ERROR"));
  it("rejects missing common fields", () => error(JSON.stringify({ action: "example_complete" }), "VALIDATION_ERROR", ["event_id", "honeypot", "round_version", "topic"]));
  it("rejects key/context in cookie_resume", () => error(JSON.stringify({ ...common, action: "bootstrap", bootstrap_intent: "cookie_resume", bootstrap_key: "A".repeat(43) }), "VALIDATION_ERROR"));
  it.each([
    ["event_id", "11111111-1111-1111-8111-111111111111"], ["event_id", "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"], ["topic", "RECORDING"], ["round_version", "r2"], ["honeypot", "bot"], ["consent", "true"], ["consent", false], ["consent_generation", 0], ["consent_generation", 2147483648], ["consent_generation", 1.1], ["turnstile_token", " \n\t"], ["turnstile_token", "a".repeat(2049)], ["email", "x".repeat(255)],
  ])("rejects bad %s", (field, value) => error(JSON.stringify({ ...lead, [field]: value }), "VALIDATION_ERROR", [field]));
  it("rejects topic-specific answer enum and version", () => error(JSON.stringify({ ...common, action: "survey_submit", survey_version: "r2.1-homeflow", answers: { ...answers, q2: "not_managing", q4: null } }), "VALIDATION_ERROR", ["answers.q2", "answers.q4", "survey_version"]));
  it("rejects noncanonical bootstrap base64 last bits", () => error(JSON.stringify({ ...common, action: "bootstrap", bootstrap_intent: "resume", bootstrap_key: "A".repeat(42) + "B", page_context: "signed" }), "VALIDATION_ERROR", ["bootstrap_key"]));
  it("uses actual UTF8 bytes and cancels an oversized stream", async () => {
    const request = new Request("https://localhost", { method: "POST", headers: { "content-type": "application/json", "content-length": "1" }, body: '"' + "한".repeat(2731) + '"' });
    await expect(readRound2Body(request)).rejects.toMatchObject({ code: "BODY_TOO_LARGE", status: 413 });
  });
  it("accepts exactly 8192 bytes and optional utf8 charset", async () => {
    const body = " ".repeat(8190) + "{}";
    expect(await readRound2Body(new Request("https://localhost", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" }, body }))).toBe(body);
  });
  it.each(["text/plain", "application/json; charset=latin1", "application/json; other=1", "application/json, text/plain"])("rejects media %s", async (type) => {
    await expect(readRound2Body(new Request("https://localhost", { method: "POST", headers: { "content-type": type }, body: "{}" }))).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
  });
  it("rejects invalid UTF8 rather than replacement decoding", async () => {
    await expect(readRound2Body(new Request("https://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: new Uint8Array([0xff]) }))).rejects.toMatchObject({ code: "INVALID_JSON" });
  });
  it("canonicalizes recursively with ASCII keys and preserves arrays", () => expect(canonicalRound2Json({ z: [3, { b: false, a: null }], A: "한", a: 1 })).toBe('{"A":"한","a":1,"z":[3,{"a":null,"b":false}]}'));
  it.each([NaN, Infinity, 1.5, undefined])("rejects unsupported canonical primitive %s", value => expect(() => canonicalRound2Json(value)).toThrow());
  it("redacts disallowed fields even when constructing errors", () => {
    expect(new Round2Error("VALIDATION_ERROR", ["email", "email", "private@example.com", "answers.q1"])).toMatchObject({ status: 422, message: "입력 내용을 확인해 주세요.", fields: ["answers.q1", "email"] });
    expect(new Round2Error("EVENT_CONFLICT", ["email"]).fields).toEqual([]);
  });
});
describe("round2 email normalization", () => {
  it.each(["a+b@example.com", "a.b@example.com", "!#$%&'*+/=?^_`{|}~-@example.com", "a@a-b.example"])("preserves supported address %s", email => expect(normalizeRound2Email(email)).toBe(email));
  it.each(["ä@example.com", "a@éxample.com", "\u00a0a@example.com", ".a@example.com", "a.@example.com", "a..b@example.com", "a@localhost", "a@-example.com", "a@example-.com", "a@a..com", "a b@example.com", '"a"@example.com', "a@@example.com", "a".repeat(65) + "@example.com", "a@" + "a".repeat(64) + ".com"])("rejects address %s", email => expect(() => normalizeRound2Email(email)).toThrow());
});
