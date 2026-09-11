import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createRound2PageContext, expireRound2Cookie, normalizeRound2Attribution, readRound2Cookie, resolveRound2Topic, round2BootstrapDigest, round2Hmac, serializeRound2Cookie, signRound2Cookie, verifyRound2PageContext } from "@/lib/server/marketing-round2-context";
const secret = "test-page-only-" + "p".repeat(32);
const cookieSecret = "test-cookie-only-" + "c".repeat(32);
const now = Date.parse("2026-09-11T00:00:00Z") / 1000;
const claims = { v: 1 as const, pid: "11111111-1111-4111-8111-111111111111", topic: "recording" as const, round_version: "r2.1" as const, iat: now, exp: now + 30 * 86400 };
const cookieName = "__Secure-mumeok_r2_recording";
const sign = (payload: unknown, prefix = "r2-page-v1.", key = secret) => Buffer.from(JSON.stringify(payload)).toString("base64url") + "." + createHmac("sha256", key).update(prefix + JSON.stringify(Object.fromEntries(Object.entries(payload as Record<string, unknown>).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)))).digest("base64url");
const basePage = { v: 1, topic: "recording", round_version: "r2.1", first_channel: "direct", utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null, iat: now, exp: now + 1800 };

describe("round2 page authority", () => {
  it("resolves only exact topic paths", () => {
    expect(resolveRound2Topic("/beta/r2/recording")).toBe("recording"); expect(resolveRound2Topic("/beta/r2/homeflow")).toBe("homeflow");
    for (const path of ["/beta", "/beta/r2/recording/", "/beta/r2/RECORDING", "/beta/r2/recording/extra", "/beta/r2/%72ecording"]) expect(resolveRound2Topic(path)).toBeNull();
  });
  it("signs normalized context without retaining ignored URL input", () => {
    const token = createRound2PageContext("recording", "?email=hidden@example.com&utm_source=ig&utm_medium=paid_social&utm_campaign=mumeok_r2&utm_content=video_recording_v2", secret, now);
    const page = verifyRound2PageContext(token, "recording", secret, now);
    expect(page).toEqual({ ...basePage, first_channel: "ad_tagged", utm_source: "instagram", utm_medium: "paid_social", utm_campaign: "mumeok_r2", utm_content: "video_recording_v2" });
    expect(JSON.stringify(page)).not.toContain("hidden");
  });
  it("uses canonical payload for signature despite key order/JSON escapes", () => expect(verifyRound2PageContext(sign({ ...basePage, topic: "recording" }), "recording", secret, now)).toEqual(basePage));
  it.each([
    [{ ...basePage, extra: "private" }, "CONTEXT_INVALID"], [{ ...basePage, v: 2 }, "CONTEXT_INVALID"], [{ ...basePage, topic: "homeflow" }, "CONTEXT_INVALID"], [{ ...basePage, round_version: "r3" }, "CONTEXT_INVALID"], [{ ...basePage, iat: now + 31 }, "CONTEXT_INVALID"], [{ ...basePage, iat: now + 0.5 }, "CONTEXT_INVALID"], [{ ...basePage, iat: now - 1800, exp: now }, "CONTEXT_EXPIRED"], [{ ...basePage, exp: now + 1801 }, "CONTEXT_INVALID"], [{ ...basePage, first_channel: "ad_tagged" }, "CONTEXT_INVALID"],
  ])("rejects signed invalid claims %j", (payload, code) => expect(() => verifyRound2PageContext(sign(payload), "recording", secret, now)).toThrow(expect.objectContaining({ code })));
  it("clips page expiry to campaign end and accepts 30s clock skew", () => {
    const end = Date.parse("2026-10-31T15:00:00Z") / 1000;
    const token = createRound2PageContext("homeflow", "", secret, end - 1);
    expect(verifyRound2PageContext(token, "homeflow", secret, end - 1).exp).toBe(end);
    expect(verifyRound2PageContext(sign({ ...basePage, iat: now + 30, exp: now + 1800 }), "recording", secret, now).iat).toBe(now + 30);
  });
  it("rejects padding, extra segments, tampering and non32byte MAC", () => {
    const token = sign(basePage);
    for (const bad of [token + "=", token + ".extra", token.slice(0, -1), token.split(".")[0] + "." + Buffer.alloc(31).toString("base64url"), sign(basePage, "r2-cookie-v1.")]) {
      expect(() => verifyRound2PageContext(bad, "recording", secret, now)).toThrow(expect.objectContaining({ code: "CONTEXT_INVALID" }));
    }
  });
});
describe("round2 attribution", () => {
  it.each([
    ["", "direct"], ["?email=private@example.com", "direct"], ["?utm_term=ignored", "unknown"], ["?utm_source=fb&utm_medium=social_profile&utm_content=profile_link", "profile_tagged"], ["?utm_medium=share", "shared"], ["?utm_source=instagram&utm_medium=paid_social&utm_campaign=mumeok_r2&utm_content=video_homeflow_v1", "unknown"], ["?utm_source=ig&utm_medium=paid_social&utm_campaign=mumeok_r2&utm_content=video_recording_v2", "ad_tagged"],
  ])("classifies %s as %s", (search, channel) => expect(normalizeRound2Attribution(search, "recording").first_channel).toBe(channel));
  it.each(["?utm_source=ig&utm_source=ig", "?utm_source=ig&%75tm_source=fb", "?utm_source=%E0%A4%A", "?utm_source=ig%00", "?utm_source=" + "a".repeat(129)])("nulls invalid individual key %s", search => expect(normalizeRound2Attribution(search, "recording").utm_source).toBeNull());
  it("preserves allowed wrong-topic creative without changing topic", () => expect(normalizeRound2Attribution("?utm_source=fb&utm_medium=paid_social&utm_campaign=mumeok_r2&utm_content=video_homeflow_v1", "recording")).toMatchObject({ first_channel: "unknown", utm_content: "video_homeflow_v1" }));
});
describe("round2 signed topic cookies", () => {
  it("signs cookie claims and restores only the selected topic", () => {
    const token = signRound2Cookie(claims, cookieSecret);
    expect(readRound2Cookie(`mumeok_validation_session=untouched; __Secure-mumeok_r2_homeflow=not-read; ${cookieName}=${token}`, "recording", cookieSecret, now)).toEqual(claims);
    expect(readRound2Cookie("mumeok_validation_session=untouched", "recording", cookieSecret, now)).toBeNull();
  });
  it("uses fixed original expiry and does not extend resume", () => {
    const serialized = serializeRound2Cookie(claims, cookieSecret, now + 90.9);
    expect(serialized).toContain("Max-Age=2591909"); expect(serialized).toContain("Path=/api/v1/marketing/round2; HttpOnly; Secure; SameSite=Lax"); expect(serialized).not.toContain("Domain=");
  });
  it("deletes only the selected secure topic cookie with identical attributes", () => expect(expireRound2Cookie("recording")).toBe(`${cookieName}=; Path=/api/v1/marketing/round2; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`));
  it("rejects duplicate, unsigned, padded and wrongly signed cookies with 401", () => {
    const token = signRound2Cookie(claims, cookieSecret);
    for (const header of [`${cookieName}=${token}; ${cookieName}=${token}`, `${cookieName}=garbage`, `${cookieName}=${token}=`, `${cookieName}=${sign(claims)}`]) expect(() => readRound2Cookie(header, "recording", cookieSecret, now)).toThrow(expect.objectContaining({ code: "PARTICIPATION_REQUIRED" }));
  });
  it("checks signature before expiry and distinguishes mismatch", () => {
    const expired = sign(claims, "r2-cookie-v1.", cookieSecret);
    expect(() => readRound2Cookie(`${cookieName}=${expired}`, "recording", cookieSecret, claims.exp)).toThrow(expect.objectContaining({ code: "PARTICIPATION_EXPIRED" }));
    expect(() => readRound2Cookie(`${cookieName}=${expired}`, "recording", "wrong".repeat(10), claims.exp)).toThrow(expect.objectContaining({ code: "PARTICIPATION_REQUIRED" }));
    for (const payload of [{ ...claims, topic: "homeflow" }, { ...claims, round_version: "r3" }]) expect(() => readRound2Cookie(`${cookieName}=${sign(payload, "r2-cookie-v1.", cookieSecret)}`, "recording", cookieSecret, now)).toThrow(expect.objectContaining({ code: "CONTEXT_INVALID" }));
  });
  it("matches specified HMAC and bootstrap domain separation", () => {
    expect(round2Hmac(secret, "payload")).toBe(createHmac("sha256", secret).update("payload").digest("hex"));
    expect(round2BootstrapDigest(secret, "recording", "A".repeat(43))).toBe(createHmac("sha256", secret).update("r2.1:recording:" + "A".repeat(43)).digest("hex"));
    expect(round2BootstrapDigest(secret, "homeflow", "A".repeat(43))).not.toBe(round2BootstrapDigest(secret, "recording", "A".repeat(43)));
  });
});
