import { createHmac, timingSafeEqual } from "node:crypto";
import {
  CAMPAIGN_END, CAMPAIGN_START, ROUND2_BOOTSTRAP_KEY_PATTERN, ROUND2_UUID_PATTERN,
  ROUND2_VERSION, Round2Error, canonicalRound2Json, parseRound2Json,
  type Round2ErrorCode, type Round2Topic,
} from "../marketing-round2";

export type Round2Attribution = {
  first_channel: "direct" | "ad_tagged" | "profile_tagged" | "shared" | "unknown";
  utm_source: "instagram" | "facebook" | null;
  utm_medium: "paid_social" | "social_profile" | "share" | null;
  utm_campaign: "mumeok_r2" | null;
  utm_content: "video_recording_v2" | "video_homeflow_v1" | "profile_link" | null;
};
export type Round2PageContext = Round2Attribution & {
  v: 1; topic: Round2Topic; round_version: typeof ROUND2_VERSION; iat: number; exp: number;
};
export type Round2CookieClaims = {
  v: 1; pid: string; topic: Round2Topic; round_version: typeof ROUND2_VERSION; iat: number; exp: number;
};
const START = Date.parse(CAMPAIGN_START) / 1000;
const END = Date.parse(CAMPAIGN_END) / 1000;
const COOKIE_PATH = "/api/v1/marketing/round2";
const ATTRIBUTION_KEYS = ["first_channel", "utm_source", "utm_medium", "utm_campaign", "utm_content"];
const COOKIE_KEYS = ["v", "pid", "topic", "round_version", "iat", "exp"];
const PAGE_KEYS = ["v", "topic", "round_version", "iat", "exp", ...ATTRIBUTION_KEYS];
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export function resolveRound2Topic(pathname: string): Round2Topic | null {
  if (pathname === "/beta/r2/recording") return "recording";
  if (pathname === "/beta/r2/homeflow") return "homeflow";
  return null;
}
export function normalizeRound2Attribution(rawSearch: string, topic: Round2Topic): Round2Attribution {
  const values = new Map<string, (string | null)[]>();
  let anyUtm = false;
  for (const pair of rawSearch.replace(/^\?/, "").split("&")) {
    const split = pair.indexOf("=");
    const rawKey = split < 0 ? pair : pair.slice(0, split);
    const rawValue = split < 0 ? "" : pair.slice(split + 1);
    let key: string;
    try { key = decodeURIComponent(rawKey.replace(/\+/g, " ")); }
    catch { if (rawKey.startsWith("utm_")) anyUtm = true; continue; }
    if (key.startsWith("utm_")) anyUtm = true;
    if (!["utm_source", "utm_medium", "utm_campaign", "utm_content"].includes(key)) continue;
    let value: string | null;
    try {
      value = decodeURIComponent(rawValue.replace(/\+/g, " "));
      if (value.length > 128 || /[\x00-\x1f\x7f]/.test(value)) value = null;
    } catch { value = null; }
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  const one = (key: string) => values.get(key)?.length === 1 ? values.get(key)![0] : null;
  const source = one("utm_source");
  const medium = one("utm_medium");
  const content = one("utm_content");
  const result: Round2Attribution = {
    first_channel: anyUtm ? "unknown" : "direct",
    utm_source: source === "ig" || source === "instagram" ? "instagram" : source === "fb" || source === "facebook" ? "facebook" : null,
    utm_medium: medium === "paid_social" || medium === "social_profile" || medium === "share" ? medium : null,
    utm_campaign: one("utm_campaign") === "mumeok_r2" ? "mumeok_r2" : null,
    utm_content: content === "video_recording_v2" || content === "video_homeflow_v1" || content === "profile_link" ? content : null,
  };
  const expectedContent = topic === "recording" ? "video_recording_v2" : "video_homeflow_v1";
  if (result.utm_source && result.utm_medium === "paid_social" && result.utm_campaign === "mumeok_r2" && result.utm_content === expectedContent) result.first_channel = "ad_tagged";
  else if (result.utm_source && result.utm_medium === "social_profile" && result.utm_content === "profile_link") result.first_channel = "profile_tagged";
  else if (result.utm_medium === "share") result.first_channel = "shared";
  return result;
}
function keyBytes(secret: string): Buffer {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) throw new Round2Error("ROUND2_UNAVAILABLE");
  return Buffer.from(secret, "utf8");
}
export function round2Hmac(secret: string, value: string): string {
  return createHmac("sha256", keyBytes(secret)).update(value, "utf8").digest("hex");
}
export function round2BootstrapDigest(secret: string, topic: Round2Topic, key: string): string {
  if (!ROUND2_BOOTSTRAP_KEY_PATTERN.test(key)) throw new Round2Error("VALIDATION_ERROR", ["bootstrap_key"]);
  return round2Hmac(secret, `${ROUND2_VERSION}:${topic}:${key}`);
}
function sign(payload: Round2PageContext | Round2CookieClaims, secret: string, prefix: string): string {
  const canonical = canonicalRound2Json(payload);
  const mac = createHmac("sha256", keyBytes(secret)).update(prefix + canonical, "utf8").digest("base64url");
  return `${Buffer.from(canonical, "utf8").toString("base64url")}.${mac}`;
}
function readSigned(token: string, secret: string, prefix: string, code: Round2ErrorCode): Record<string, unknown> {
  const key = keyBytes(secret);
  try {
    if (typeof token !== "string" || token.length > 2048) throw new Error();
    const parts = token.split(".");
    if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error();
    const bytes = Buffer.from(parts[0], "base64url");
    const mac = Buffer.from(parts[1], "base64url");
    if (bytes.toString("base64url") !== parts[0] || mac.toString("base64url") !== parts[1] || mac.length !== 32) throw new Error();
    const payload = parseRound2Json(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));
    const expected = createHmac("sha256", key).update(prefix + canonicalRound2Json(payload), "utf8").digest();
    if (!timingSafeEqual(expected, mac)) throw new Error();
    return payload;
  } catch { throw new Round2Error(code); }
}
function validAttribution(value: Record<string, unknown>, topic: Round2Topic): boolean {
  const allowed = (field: string, strings: string[]) => value[field] === null || (typeof value[field] === "string" && strings.includes(value[field] as string));
  if (!allowed("utm_source", ["instagram", "facebook"]) || !allowed("utm_medium", ["paid_social", "social_profile", "share"]) || !allowed("utm_campaign", ["mumeok_r2"]) || !allowed("utm_content", ["video_recording_v2", "video_homeflow_v1", "profile_link"])) return false;
  const source = value.utm_source !== null;
  switch (value.first_channel) {
    case "direct": return ["utm_source", "utm_medium", "utm_campaign", "utm_content"].every(key => value[key] === null);
    case "ad_tagged": return source && value.utm_medium === "paid_social" && value.utm_campaign === "mumeok_r2" && value.utm_content === (topic === "recording" ? "video_recording_v2" : "video_homeflow_v1");
    case "profile_tagged": return source && value.utm_medium === "social_profile" && value.utm_content === "profile_link";
    case "shared": return value.utm_medium === "share";
    case "unknown": return true;
    default: return false;
  }
}
export function createRound2PageContext(topic: Round2Topic, rawSearch: string, secret: string, nowSeconds: number): string {
  const iat = Math.floor(nowSeconds);
  if (!Number.isSafeInteger(iat) || iat < START || iat >= END) throw new Round2Error("CAMPAIGN_ENDED");
  return sign({ v: 1, topic, round_version: ROUND2_VERSION, ...normalizeRound2Attribution(rawSearch, topic), iat, exp: Math.min(iat + 1800, END) }, secret, "r2-page-v1.");
}
export function verifyRound2PageContext(token: string, topic: Round2Topic, secret: string, nowSeconds: number): Round2PageContext {
  const value = readSigned(token, secret, "r2-page-v1.", "CONTEXT_INVALID");
  if (!exactKeys(value, PAGE_KEYS) || value.v !== 1 || value.topic !== topic || value.round_version !== ROUND2_VERSION || !validAttribution(value, topic) ||
      !Number.isSafeInteger(value.iat) || !Number.isSafeInteger(value.exp) || (value.iat as number) < START || (value.iat as number) > nowSeconds + 30 ||
      (value.exp as number) <= (value.iat as number) || (value.exp as number) > Math.min((value.iat as number) + 1800, END)) throw new Round2Error("CONTEXT_INVALID");
  if ((value.exp as number) <= nowSeconds) throw new Round2Error("CONTEXT_EXPIRED");
  return value as Round2PageContext;
}
export function signRound2Cookie(claims: Round2CookieClaims, secret: string): string {
  return sign(claims, secret, "r2-cookie-v1.");
}
export function readRound2Cookie(header: string | null, topic: Round2Topic, secret: string, nowSeconds: number): Round2CookieClaims | null {
  const name = `__Secure-mumeok_r2_${topic}`;
  const found = (header ?? "").split(";").map(part => part.trim()).filter(part => part === name || part.startsWith(`${name}=`));
  if (found.length === 0) return null;
  if (found.length !== 1 || !found[0].startsWith(`${name}=`)) throw new Round2Error("PARTICIPATION_REQUIRED");
  const value = readSigned(found[0].slice(name.length + 1), secret, "r2-cookie-v1.", "PARTICIPATION_REQUIRED");
  if (value.topic !== topic || value.round_version !== ROUND2_VERSION) throw new Round2Error("CONTEXT_INVALID");
  if (!exactKeys(value, COOKIE_KEYS) || value.v !== 1 || typeof value.pid !== "string" || !ROUND2_UUID_PATTERN.test(value.pid) ||
      !Number.isSafeInteger(value.iat) || !Number.isSafeInteger(value.exp) || (value.iat as number) < START || (value.iat as number) > nowSeconds + 30 ||
      (value.exp as number) <= (value.iat as number) || (value.exp as number) > Math.min((value.iat as number) + 30 * 86400, END)) throw new Round2Error("PARTICIPATION_REQUIRED");
  if ((value.exp as number) <= nowSeconds) throw new Round2Error("PARTICIPATION_EXPIRED");
  return value as Round2CookieClaims;
}
export function serializeRound2Cookie(claims: Round2CookieClaims, secret: string, nowSeconds: number): string {
  const token = signRound2Cookie(claims, secret);
  const maxAge = Math.max(0, Math.floor(claims.exp - nowSeconds));
  return `__Secure-mumeok_r2_${claims.topic}=${token}; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
export function expireRound2Cookie(topic: Round2Topic): string {
  return `__Secure-mumeok_r2_${topic}=; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
