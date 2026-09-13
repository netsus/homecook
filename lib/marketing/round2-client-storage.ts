import { CAMPAIGN_END, ROUND2_UUID_PATTERN, ROUND2_VERSION, Round2Error, parseRound2Request, type Round2Request, type Round2Topic } from "../marketing-round2";
import { ROUND2_SURVEYS } from "./round2-survey";
import { ROUND2_SESSION_DATABASE } from "./round2-session";

export type Round2SurveyDraft = Partial<Record<"q1" | "q2" | "q3" | "q4", string>>;
export type Round2NonPiiRequest = Exclude<Round2Request, { action: "bootstrap" | "lead_submit" }>;
export type Round2ClientRecord = { version: 1; created_at: number; expires_at: number; participation_id: string; drafts: Record<string, Round2SurveyDraft>; outbox: Round2NonPiiRequest[] };
export type Round2ClientStorageOptions = { topic: Round2Topic; indexedDB?: IDBFactory | null; nowMs: number; bootstrapKey?: string };
const MAX_AGE = 30 * 86400000;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export function validateRound2Draft(value: unknown, topic: Round2Topic): Round2SurveyDraft {
  if (!object(value)) throw new Error("Invalid survey draft");
  for (const [key, item] of Object.entries(value)) {
    const question = ROUND2_SURVEYS[topic].questions.find(question => question.id === key);
    if (!question || !question.options.some(option => option.value === item)) throw new Error("Invalid survey draft");
  }
  return { ...value } as Round2SurveyDraft;
}
/** Re-parse allowlisted requests at the persistence boundary; never serialize a lead form. */
export function parseRound2ClientRecord(value: unknown, topic: Round2Topic, now: number): Round2ClientRecord | null {
  if (value === undefined) return null;
  if (!object(value) || Object.keys(value).sort().join() !== "created_at,drafts,expires_at,outbox,participation_id,version" || value.version !== 1 ||
    !Number.isSafeInteger(value.created_at) || !Number.isSafeInteger(value.expires_at) || (value.expires_at as number) <= (value.created_at as number) ||
    (value.expires_at as number) > Math.min((value.created_at as number) + MAX_AGE, Date.parse(CAMPAIGN_END)) ||
    typeof value.participation_id !== "string" || !ROUND2_UUID_PATTERN.test(value.participation_id) || !object(value.drafts) || !Array.isArray(value.outbox) || value.outbox.length > 50) throw new Error("Unreadable activity storage");
  if ((value.expires_at as number) <= now) return null;
  const drafts: Record<string, Round2SurveyDraft> = {};
  for (const [tab, draft] of Object.entries(value.drafts)) {
    if (!ROUND2_UUID_PATTERN.test(tab)) throw new Error("Invalid draft owner");
    drafts[tab] = validateRound2Draft(draft, topic);
  }
  const outbox = value.outbox.map(item => {
    const request = parseRound2Request(JSON.stringify(item));
    if (request.topic !== topic || request.action === "bootstrap" || request.action === "lead_submit") throw new Error("Private request cannot enter the outbox");
    return request;
  });
  return { ...value, drafts, outbox } as Round2ClientRecord;
}
function open(options: Round2ClientStorageOptions): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const factory = Object.hasOwn(options, "indexedDB") ? options.indexedDB : globalThis.indexedDB;
    if (!factory) { reject(new Error("Activity storage unavailable")); return; }
    const request = factory.open(ROUND2_SESSION_DATABASE, 1);
    let failed = false;
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("bootstrap")) request.result.createObjectStore("bootstrap"); };
    request.onerror = request.onblocked = () => { failed = true; reject(new Error("Activity storage unavailable")); };
    request.onsuccess = () => {
      if (failed) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close(); resolve(request.result);
    };
  });
}
/** Both bootstrap pending and activity events are read under one IDB write lock. */
async function update<T>(options: Round2ClientStorageOptions, mutate: (record: Round2ClientRecord | null, bootstrapPending: number, save: (record: Round2ClientRecord | null) => void) => T): Promise<T> {
  const db = await open(options);
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("bootstrap", "readwrite"); const store = tx.objectStore("bootstrap");
      const key = `${ROUND2_VERSION}:${options.topic}`;
      const session = store.get(key); const activity = store.get(`${key}:activity`);
      let result: T; let failure: unknown;
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(failure ?? new Error("Activity storage transaction failed"));
      activity.onsuccess = () => {
        try {
          if (options.bootstrapKey && (!object(session.result) || session.result.bootstrap_key !== options.bootstrapKey ||
            session.result.status === "restart_required" || typeof session.result.expires_at !== "number" || session.result.expires_at <= options.nowMs)) throw new Round2Error("BOOTSTRAP_CONFLICT");
          const stored = parseRound2ClientRecord(activity.result, options.topic, options.nowMs);
          if (activity.result && !stored) store.delete(`${key}:activity`);
          const pending = object(session.result) && Array.isArray(session.result.pending) ? session.result.pending.length : 0;
          result = mutate(stored, pending, next => { if (next) store.put(next, `${key}:activity`); else store.delete(`${key}:activity`); });
        } catch (error) { failure = error; tx.abort(); }
      };
    });
  } finally { db.close(); }
}
export function loadRound2ClientRecord(options: Round2ClientStorageOptions): Promise<Round2ClientRecord | null> {
  return update(options, record => record);
}
export function writeRound2ClientDraft(options: Round2ClientStorageOptions & { participationId: string; expiresAt: string; tabId: string; draft: Round2SurveyDraft }): Promise<void> {
  const draft = validateRound2Draft(options.draft, options.topic);
  if (!ROUND2_UUID_PATTERN.test(options.tabId)) return Promise.reject(new Error("Invalid draft owner"));
  return update(options, (record, _pending, save) => {
    const current = forParticipation(record, options);
    current.drafts[options.tabId] = draft;
    save(current);
  });
}
function forParticipation(record: Round2ClientRecord | null, options: Round2ClientStorageOptions & { participationId: string; expiresAt: string }): Round2ClientRecord {
  if (record && record.participation_id !== options.participationId) throw new Round2Error("BOOTSTRAP_CONFLICT");
  if (record) return record;
  return { version: 1, created_at: options.nowMs, expires_at: Math.min(options.nowMs + MAX_AGE, Date.parse(options.expiresAt), Date.parse(CAMPAIGN_END)), participation_id: options.participationId, drafts: {}, outbox: [] };
}
export function enqueueRound2Request(options: Round2ClientStorageOptions & { participationId: string; expiresAt: string; request: Round2NonPiiRequest }): Promise<boolean> {
  const parsed = parseRound2Request(JSON.stringify(options.request));
  if (parsed.action === "lead_submit" || parsed.action === "bootstrap" || parsed.topic !== options.topic) return Promise.reject(new Error("Private request cannot enter the outbox"));
  return update(options, (record, pending, save) => {
    const current = forParticipation(record, options);
    if (current.outbox.some(item => item.event_id === parsed.event_id)) return true;
    if (current.outbox.length + pending >= 50) return false;
    current.outbox.push(parsed); save(current); return true;
  });
}
export function removeRound2Request(options: Round2ClientStorageOptions & { eventId: string }): Promise<void> {
  return update(options, (record, _pending, save) => {
    if (!record) return;
    record.outbox = record.outbox.filter(item => item.event_id !== options.eventId); save(record);
  });
}
export function clearRound2ClientRecord(options: Round2ClientStorageOptions): Promise<void> {
  return update(options, (_record, _pending, save) => save(null));
}
