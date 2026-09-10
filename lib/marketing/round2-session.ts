import { CAMPAIGN_END, CAMPAIGN_START, ROUND2_BOOTSTRAP_KEY_PATTERN, ROUND2_UUID_PATTERN, ROUND2_VERSION, Round2Error, canonicalRound2Json, parseRound2Json, parseRound2Request, type Round2Request, type Round2Topic } from "../marketing-round2";
import type { Round2Attribution } from "../server/marketing-round2-context";

/** Bootstrap capability storage only. Screens, survey drafts and the activity queue belong to Stage4. */
export const ROUND2_SESSION_DATABASE = "mumeok-r2";
const STORE = "bootstrap";
const VERSION = 1;
const MAX_PENDING = 50;
const THIRTY_DAYS = 30 * 86400000;
const END = Date.parse(CAMPAIGN_END);
const START = Date.parse(CAMPAIGN_START);
const fallbackEvents = new Map<Round2Topic, string>();
type StorageOptions = { indexedDB?: IDBFactory | null; nowMs?: number };
export type Round2BootstrapOptions = StorageOptions & { topic: Round2Topic; attribution: Round2Attribution };
type KeyPreparation = {
  kind: "key"; topic: Round2Topic; bootstrap_key: string; event_id: string;
  bootstrap_intent: "create_or_resume" | "resume"; attribution: Round2Attribution; created_at: number;
};
export type Round2BootstrapPreparation = KeyPreparation
  | { kind: "cookie_resume"; topic: Round2Topic; event_id: string; bootstrap_intent: "cookie_resume" }
  | { kind: "restart_required"; topic: Round2Topic }
  | { kind: "queue_full"; topic: Round2Topic };
type Pending = { event_id: string; attribution: Round2Attribution };
type Session = {
  version: 1; status: "pending" | "confirmed"; bootstrap_key: string; event_id: string;
  created_at: number; expires_at: number; first_attribution: Round2Attribution; pending: Pending[];
};
type RestartMarker = { version: 1; status: "restart_required" };
const restartMarker = (): RestartMarker => ({ version: 1, status: "restart_required" });
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function attribution(value: unknown): Round2Attribution {
  if (!isRecord(value) || Object.keys(value).length !== 5) throw new Error("Invalid bootstrap attribution");
  const nullable = (key: string, allowed: string[]) => value[key] === null || (typeof value[key] === "string" && allowed.includes(value[key] as string));
  if (!["direct", "ad_tagged", "profile_tagged", "shared", "unknown"].includes(value.first_channel as string) ||
      !nullable("utm_source", ["instagram", "facebook"]) || !nullable("utm_medium", ["paid_social", "social_profile", "share"]) ||
      !nullable("utm_campaign", ["mumeok_r2"]) || !nullable("utm_content", ["video_recording_v2", "video_homeflow_v1", "profile_link"])) throw new Error("Invalid bootstrap attribution");
  return { first_channel: value.first_channel, utm_source: value.utm_source, utm_medium: value.utm_medium, utm_campaign: value.utm_campaign, utm_content: value.utm_content } as Round2Attribution;
}
function session(value: unknown): Session | RestartMarker | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || value.version !== VERSION) throw new Error("Unreadable bootstrap storage");
  if (value.status === "restart_required" && Object.keys(value).length === 2) return restartMarker();
  if (Object.keys(value).length !== 8 || !["pending", "confirmed"].includes(value.status as string) ||
      typeof value.bootstrap_key !== "string" || !ROUND2_BOOTSTRAP_KEY_PATTERN.test(value.bootstrap_key) ||
      typeof value.event_id !== "string" || !ROUND2_UUID_PATTERN.test(value.event_id) ||
      !Number.isSafeInteger(value.created_at) || !Number.isSafeInteger(value.expires_at) || (value.created_at as number) < START ||
      (value.expires_at as number) <= (value.created_at as number) || (value.expires_at as number) > Math.min((value.created_at as number) + THIRTY_DAYS, END) ||
      !Array.isArray(value.pending) || value.pending.length > MAX_PENDING) throw new Error("Unreadable bootstrap storage");
  attribution(value.first_attribution);
  for (const item of value.pending) {
    if (!isRecord(item) || Object.keys(item).length !== 2 || typeof item.event_id !== "string" || !ROUND2_UUID_PATTERN.test(item.event_id)) throw new Error("Unreadable bootstrap storage");
    attribution(item.attribution);
  }
  return value as Session;
}
function storage(options: StorageOptions): IDBFactory {
  const factory = Object.hasOwn(options, "indexedDB") ? options.indexedDB : globalThis.indexedDB;
  if (!factory) throw new Error("Bootstrap storage unavailable");
  return factory;
}
function open(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(ROUND2_SESSION_DATABASE, VERSION);
    let failed = false;
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onerror = request.onblocked = () => { failed = true; reject(new Error("Bootstrap storage unavailable")); };
    request.onsuccess = () => {
      if (failed) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
/** No awaits inside the read callback: key generation and write share the same active transaction. */
async function transaction<T>(topic: Round2Topic, options: StorageOptions, mutate: (current: Session | RestartMarker | undefined, save: (next: Session | RestartMarker) => void) => T): Promise<T> {
  const db = await open(storage(options));
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const key = `${ROUND2_VERSION}:${topic}`;
      const read = store.get(key);
      let result: T;
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(new Error("Bootstrap storage transaction failed"));
      read.onsuccess = () => {
        try { result = mutate(session(read.result), next => { store.put(next, key); }); }
        catch { tx.abort(); }
      };
    });
  } finally { db.close(); }
}
function cookieResume(topic: Round2Topic): Round2BootstrapPreparation {
  let event = fallbackEvents.get(topic);
  if (!event) { event = globalThis.crypto.randomUUID(); fallbackEvents.set(topic, event); }
  return { kind: "cookie_resume", topic, bootstrap_intent: "cookie_resume", event_id: event };
}
function newSession(firstAttribution: Round2Attribution, now: number): Session {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const bootstrap_key = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const event_id = globalThis.crypto.randomUUID();
  return { version: VERSION, status: "pending", bootstrap_key, event_id, created_at: now, expires_at: Math.min(now + THIRTY_DAYS, END), first_attribution: firstAttribution, pending: [{ event_id, attribution: firstAttribution }] };
}
async function prepare(options: Round2BootstrapOptions, explicitRestart: boolean): Promise<Round2BootstrapPreparation> {
  const semantic = attribution(options.attribution);
  const now = options.nowMs ?? Date.now();
  if (!Number.isSafeInteger(now) || now < START || now >= END) return { kind: "restart_required", topic: options.topic };
  try {
    return await transaction(options.topic, options, (stored, save) => {
      let current = stored;
      if (current?.status === "restart_required" || (current && current.expires_at <= now)) {
        if (!explicitRestart) { save(restartMarker()); return { kind: "restart_required", topic: options.topic }; }
        current = undefined;
      }
      if (!current) { current = newSession(semantic, now); save(current); }
      const serialized = canonicalRound2Json(semantic);
      const initial = canonicalRound2Json(current.first_attribution) === serialized;
      let eventId = initial ? current.event_id : current.pending.find(item => canonicalRound2Json(item.attribution) === serialized)?.event_id;
      if (!eventId) {
        if (current.pending.length >= MAX_PENDING) return { kind: "queue_full", topic: options.topic };
        eventId = globalThis.crypto.randomUUID();
        current.pending.push({ event_id: eventId, attribution: semantic });
        save(current);
      }
      return { kind: "key", topic: options.topic, bootstrap_key: current.bootstrap_key, event_id: eventId, bootstrap_intent: current.status === "confirmed" ? "resume" : "create_or_resume", attribution: semantic, created_at: current.created_at };
    });
  } catch { return cookieResume(options.topic); }
}
export function prepareRound2Bootstrap(options: Round2BootstrapOptions): Promise<Round2BootstrapPreparation> {
  return prepare(options, false);
}
/** Call only from the user's explicit restart action, after the server expired the old cookie. */
export function restartRound2Bootstrap(options: Round2BootstrapOptions): Promise<Round2BootstrapPreparation> {
  return prepare(options, true);
}
export async function confirmRound2Bootstrap(options: StorageOptions & { topic: Round2Topic; bootstrapKey: string; eventId: string; expiresAt: string }): Promise<boolean> {
  const expiry = Date.parse(options.expiresAt);
  const now = options.nowMs ?? Date.now();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(options.expiresAt) || !Number.isSafeInteger(expiry) || expiry <= now) return false;
  try {
    return await transaction(options.topic, options, (current, save) => {
      if (!current || current.status === "restart_required" || current.bootstrap_key !== options.bootstrapKey ||
          (current.event_id !== options.eventId && !current.pending.some(item => item.event_id === options.eventId))) return false;
      current.status = "confirmed";
      current.expires_at = Math.min(current.expires_at, expiry);
      current.pending = current.pending.filter(item => item.event_id !== options.eventId);
      save(current);
      return true;
    });
  } catch { return false; }
}
/** A persisted marker clears capabilities but prevents reload from silently creating a new participation. */
export async function markRound2ParticipationExpired(options: StorageOptions & { topic: Round2Topic; bootstrapKey?: string }): Promise<boolean> {
  try {
    return await transaction(options.topic, options, (current, save) => {
      if (current && current.status !== "restart_required" && options.bootstrapKey && current.bootstrap_key !== options.bootstrapKey) return false;
      save(restartMarker());
      fallbackEvents.delete(options.topic);
      return true;
    });
  } catch { return false; }
}
function contextAttribution(token: string, topic: Round2Topic): Round2Attribution {
  try {
    const payloadPart = token.split(".")[0];
    const bytes = Uint8Array.from(atob(payloadPart.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
    const payload = parseRound2Json(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (payload.topic !== topic || payload.round_version !== ROUND2_VERSION) throw new Error();
    return attribution({ first_channel: payload.first_channel, utm_source: payload.utm_source, utm_medium: payload.utm_medium, utm_campaign: payload.utm_campaign, utm_content: payload.utm_content });
  } catch { throw new Round2Error("CONTEXT_INVALID"); }
}
/** Client comparison protects retry identity; only the server verifies the page-context signature. */
export function buildRound2BootstrapRequest(prepared: Round2BootstrapPreparation, pageContext?: string): Extract<Round2Request, { action: "bootstrap" }> {
  if (prepared.kind === "restart_required" || prepared.kind === "queue_full") throw new Round2Error("PARTICIPATION_REQUIRED");
  const common = { action: "bootstrap", event_id: prepared.event_id, topic: prepared.topic, round_version: ROUND2_VERSION, honeypot: "", bootstrap_intent: prepared.bootstrap_intent };
  if (prepared.kind === "cookie_resume") return parseRound2Request(JSON.stringify(common)) as Extract<Round2Request, { action: "bootstrap" }>;
  if (!pageContext || canonicalRound2Json(contextAttribution(pageContext, prepared.topic)) !== canonicalRound2Json(prepared.attribution)) throw new Round2Error("CONTEXT_INVALID");
  return parseRound2Request(JSON.stringify({ ...common, bootstrap_key: prepared.bootstrap_key, page_context: pageContext })) as Extract<Round2Request, { action: "bootstrap" }>;
}
/** Only allowlisted semantic UTM values are reconstructed; never include the key, event or raw query. */
export function round2BootstrapContextUrl(prepared: Round2BootstrapPreparation): string {
  const path = `/beta/r2/${prepared.topic}`;
  if (prepared.kind !== "key") return path;
  const semantic = attribution(prepared.attribution);
  const query = new URLSearchParams();
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const) {
    if (semantic[key] !== null) query.set(key, semantic[key]);
  }
  if (semantic.first_channel === "unknown" && query.size === 0) query.set("utm_source", "unknown");
  return query.size ? `${path}?${query.toString()}` : path;
}
