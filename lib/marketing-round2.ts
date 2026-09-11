/** The r2.1 public contract. No server secrets or legacy marketing state live here. */
export const ROUND2_VERSION = "r2.1" as const;
export const CAMPAIGN_START = "2026-09-10T15:00:00Z";
export const CAMPAIGN_END = "2026-10-31T15:00:00Z";
export const RETENTION_UNTIL = "2026-11-30T15:00:00Z";
export const ROUND2_CONSENT_VERSION = "mumeok-r2-beta-notice-20260911" as const;
export const ROUND2_PURPOSE = "beta_open_notice" as const;
export const ROUND2_BODY_LIMIT = 8192;
export const ROUND2_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const ROUND2_BOOTSTRAP_KEY_PATTERN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
export type Round2Topic = "recording" | "homeflow";
export type Round2Activity = "example" | "survey" | "lead";
export type Round2ActivityState = "not_started" | "started" | "completed";
export const ROUND2_FREQUENCIES = ["none", "one_two", "three_five", "six_plus"] as const;
export const ROUND2_INTENTS = ["yes", "maybe", "no", "unsure"] as const;
export const ROUND2_RECORDING_METHODS = ["no_record", "photo_memo", "search_app", "ingredient_entry", "reuse_saved", "other"] as const;
export const ROUND2_RECORDING_FEATURES = ["reuse_recipe", "portion_nutrition", "record_history", "none"] as const;
export const ROUND2_HOMEFLOW_METHODS = ["on_the_day", "memo_list", "separate_apps", "shared_plan", "not_managing", "other"] as const;
export const ROUND2_HOMEFLOW_FEATURES = ["meal_plan", "combined_shopping", "pantry_exclusion", "leftover_management", "none"] as const;
type AnswerBase = { q1: (typeof ROUND2_FREQUENCIES)[number]; q4: (typeof ROUND2_INTENTS)[number] };
export type Round2RecordingAnswers = AnswerBase & { q2: (typeof ROUND2_RECORDING_METHODS)[number]; q3: (typeof ROUND2_RECORDING_FEATURES)[number] };
export type Round2HomeflowAnswers = AnswerBase & { q2: (typeof ROUND2_HOMEFLOW_METHODS)[number]; q3: (typeof ROUND2_HOMEFLOW_FEATURES)[number] };
export const LINEAR_HOMEFLOW_SURVEY_VERSION = "r2.2-homeflow" as const;
export const LINEAR_HOMEFLOW_COOKING_DAYS = ["none", "one_two", "three_four", "five_seven"] as const;
export const LINEAR_HOMEFLOW_YOUTUBE_FREQUENCIES = ["none", "once", "two_three", "four_plus"] as const;
export const LINEAR_HOMEFLOW_PLANNING_METHODS = ["spontaneous", "mental", "memo", "scheduled"] as const;
export const LINEAR_HOMEFLOW_DIFFICULTIES = ["planning", "shopping", "video", "none"] as const;
export type Round2LinearHomeflowAnswers = {
  q1: (typeof LINEAR_HOMEFLOW_COOKING_DAYS)[number];
  q2: (typeof LINEAR_HOMEFLOW_YOUTUBE_FREQUENCIES)[number];
  q3: (typeof LINEAR_HOMEFLOW_PLANNING_METHODS)[number];
  q4: (typeof LINEAR_HOMEFLOW_DIFFICULTIES)[number];
};
type Common = { event_id: string; topic: Round2Topic; round_version: typeof ROUND2_VERSION; honeypot: "" };
export type Round2Request = Common & (
  | { action: "bootstrap"; bootstrap_intent: "create_or_resume" | "resume"; bootstrap_key: string; page_context: string }
  | { action: "bootstrap"; bootstrap_intent: "cookie_resume" }
  | { action: "activity_start"; activity: Round2Activity }
  | { action: "example_complete" }
  | { action: "survey_submit"; topic: "recording"; survey_version: "r2.1-recording"; answers: Round2RecordingAnswers }
  | { action: "survey_submit"; topic: "homeflow"; survey_version: "r2.1-homeflow"; answers: Round2HomeflowAnswers }
  | { action: "survey_submit"; topic: "homeflow"; survey_version: typeof LINEAR_HOMEFLOW_SURVEY_VERSION; answers: Round2LinearHomeflowAnswers }
  | { action: "lead_submit"; email: string; consent: true; consent_version: typeof ROUND2_CONSENT_VERSION; purpose: typeof ROUND2_PURPOSE; consent_generation: number; turnstile_token?: string }
  | { action: "menu_return"; from_activity: Round2Activity }
);
export type Round2SuccessData = {
  round_version: typeof ROUND2_VERSION; topic: Round2Topic; participation_id: string; event_id: string;
  revision: number; consent_generation: number; state: Record<Round2Activity, Round2ActivityState>;
  receipt: { event_id: string; status: "received" } | null;
  participation_expires_at: string; retention_until: typeof RETENTION_UNTIL;
};
export type Round2Success = { success: true; data: Round2SuccessData; error: null };
export type Round2Failure = { success: false; data: null; error: { code: Round2ErrorCode; message: string; fields: string[] } };
export const ROUND2_ERRORS = {
  INVALID_JSON: [400, "요청 형식을 확인해 주세요."],
  PARTICIPATION_REQUIRED: [401, "참여 정보를 다시 연결해 주세요."],
  ORIGIN_NOT_ALLOWED: [403, "허용되지 않은 요청이에요."],
  CONTEXT_INVALID: [403, "페이지를 새로 열어 주세요."],
  METHOD_NOT_ALLOWED: [405, "지원하지 않는 요청 방식이에요."],
  EVENT_CONFLICT: [409, "요청 정보가 달라 다시 확인이 필요해요."],
  BOOTSTRAP_CONFLICT: [409, "브라우저 참여 정보를 복구해 주세요."],
  CONSENT_REFRESH_REQUIRED: [409, "동의 내용을 다시 확인해 주세요."],
  INVALID_TRANSITION: [409, "활동을 먼저 열어 주세요."],
  ACTIVITY_ALREADY_COMPLETED: [409, "이미 완료한 활동이에요."],
  CONTEXT_EXPIRED: [410, "페이지를 새로 열어 주세요."],
  PARTICIPATION_EXPIRED: [410, "참여 기간이 끝났어요. 새 참여를 시작해 주세요."],
  CAMPAIGN_ENDED: [410, "이번 알림 신청 기간이 끝났어요."],
  BODY_TOO_LARGE: [413, "요청 크기가 너무 커요."],
  UNSUPPORTED_MEDIA_TYPE: [415, "요청 형식을 확인해 주세요."],
  VALIDATION_ERROR: [422, "입력 내용을 확인해 주세요."],
  TURNSTILE_FAILED: [422, "보안 확인을 다시 진행해 주세요."],
  RATE_LIMITED: [429, "잠시 후 다시 시도해 주세요."],
  ROUND2_DISABLED: [503, "현재 참여를 받고 있지 않아요."],
  ROUND2_UNAVAILABLE: [503, "연결이 원활하지 않아요. 다시 시도해 주세요."],
  LEAD_CAPTURE_NOT_READY: [503, "알림 신청 준비 중이에요."],
  LEAD_CAPTURE_UNAVAILABLE: [503, "신청을 확인하지 못했어요. 다시 시도해 주세요."],
} as const;
export type Round2ErrorCode = keyof typeof ROUND2_ERRORS;
const FIELDS = new Set("action,event_id,topic,round_version,honeypot,bootstrap_key,page_context,bootstrap_intent,activity,survey_version,answers,answers.q1,answers.q2,answers.q3,answers.q4,email,consent,consent_version,purpose,consent_generation,turnstile_token,from_activity".split(","));
export class Round2Error extends Error {
  readonly code: Round2ErrorCode;
  readonly status: number;
  readonly fields: string[];
  readonly retryAfter?: number;
  constructor(code: Round2ErrorCode, fields: string[] = [], retryAfter?: number) {
    super(ROUND2_ERRORS[code][1]);
    this.name = "Round2Error";
    this.code = code;
    this.status = ROUND2_ERRORS[code][0];
    this.fields = code === "VALIDATION_ERROR" ? [...new Set(fields.filter(field => FIELDS.has(field)))].sort() : [];
    if (code === "RATE_LIMITED" && Number.isInteger(retryAfter) && retryAfter! > 0) this.retryAfter = retryAfter;
  }
}

/** Reject duplicates before JSON.parse can silently discard them, including escaped keys. */
export function parseRound2Json(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    let cursor = 0;
    const whitespace = () => { while (/\s/.test(raw[cursor] ?? "") && cursor < raw.length) cursor++; };
    const string = (): string => {
      const start = cursor++;
      while (cursor < raw.length) {
        if (raw[cursor] === "\\") { cursor += 2; continue; }
        if (raw[cursor++] === '"') return JSON.parse(raw.slice(start, cursor)) as string;
      }
      throw new Error();
    };
    const visit = (depth: number): void => {
      if (depth > 8) throw new Error();
      whitespace();
      const kind = raw[cursor];
      if (kind === '"') { string(); return; }
      if (kind === "{" || kind === "[") {
        const keys = new Set<string>();
        const end = kind === "{" ? "}" : "]";
        cursor++; whitespace();
        while (raw[cursor] !== end) {
          if (kind === "{") {
            const key = string();
            if (keys.has(key)) throw new Error();
            keys.add(key); whitespace(); cursor++;
          }
          visit(depth + 1); whitespace();
          if (raw[cursor] !== ",") break;
          cursor++; whitespace();
        }
        cursor++; return;
      }
      while (cursor < raw.length && !/[\s,}\]]/.test(raw[cursor])) cursor++;
    };
    visit(1);
    return parsed as Record<string, unknown>;
  } catch { throw new Round2Error("INVALID_JSON"); }
}
export function canonicalRound2Json(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalRound2Json).join(",")}]`;
  if (typeof value === "object" && value && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalRound2Json((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  throw new Round2Error("VALIDATION_ERROR");
}
export function normalizeRound2Email(input: string): string {
  if (typeof input !== "string" || input.length > 254) throw new Round2Error("VALIDATION_ERROR", ["email"]);
  const email = input.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "").replace(/[A-Z]/g, char => char.toLowerCase());
  const parts = email.split("@");
  const [local, domain] = parts;
  if (email.length < 3 || email.length > 254 || parts.length !== 2 || !local || local.length > 64 || !domain || domain.length > 253 ||
      !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..") ||
      domain.split(".").length < 2 || !domain.split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new Round2Error("VALIDATION_ERROR", ["email"]);
  }
  return email;
}
export async function readRound2Body(request: Request): Promise<string> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(request.headers.get("content-type") ?? "")) throw new Round2Error("UNSUPPORTED_MEDIA_TYPE");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > ROUND2_BODY_LIMIT) { await reader.cancel().catch(() => undefined); throw new Round2Error("BODY_TOO_LARGE"); }
      chunks.push(result.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (error) {
    if (error instanceof Round2Error) throw error;
    throw new Round2Error("INVALID_JSON");
  } finally { reader.releaseLock(); }
}
export function parseRound2Request(raw: string): Round2Request {
  if (new TextEncoder().encode(raw).byteLength > ROUND2_BODY_LIMIT) throw new Round2Error("BODY_TOO_LARGE");
  const value = parseRound2Json(raw);
  const invalid: string[] = [];
  const check = (field: string, valid: boolean) => { if (!valid) invalid.push(field); };
  const member = (item: unknown, values: readonly string[]) => typeof item === "string" && values.includes(item);
  const actions = ["bootstrap", "activity_start", "example_complete", "survey_submit", "lead_submit", "menu_return"];
  const activities = ["example", "survey", "lead"];
  const keys = ["action", "event_id", "topic", "round_version", "honeypot"];
  check("action", member(value.action, actions));
  check("event_id", typeof value.event_id === "string" && ROUND2_UUID_PATTERN.test(value.event_id));
  check("topic", member(value.topic, ["recording", "homeflow"]));
  check("round_version", value.round_version === ROUND2_VERSION);
  check("honeypot", value.honeypot === "");
  if (value.action === "bootstrap") {
    keys.push("bootstrap_intent");
    check("bootstrap_intent", member(value.bootstrap_intent, ["create_or_resume", "resume", "cookie_resume"]));
    if (value.bootstrap_intent !== "cookie_resume") {
      keys.push("bootstrap_key", "page_context");
      check("bootstrap_key", typeof value.bootstrap_key === "string" && ROUND2_BOOTSTRAP_KEY_PATTERN.test(value.bootstrap_key));
      check("page_context", typeof value.page_context === "string" && /^[\x00-\x7f]{1,2048}$/.test(value.page_context));
    }
  } else if (value.action === "activity_start" || value.action === "menu_return") {
    const field = value.action === "activity_start" ? "activity" : "from_activity";
    keys.push(field); check(field, member(value[field], activities));
  } else if (value.action === "survey_submit") {
    keys.push("survey_version", "answers");
    const linearHomeflow = value.topic === "homeflow" && value.survey_version === LINEAR_HOMEFLOW_SURVEY_VERSION;
    check("survey_version", value.survey_version === `${ROUND2_VERSION}-${value.topic}` || linearHomeflow);
    if (!value.answers || typeof value.answers !== "object" || Array.isArray(value.answers)) invalid.push("answers");
    else {
      const answers = value.answers as Record<string, unknown>;
      if (Object.keys(answers).some(key => !["q1", "q2", "q3", "q4"].includes(key))) throw new Round2Error("VALIDATION_ERROR");
      check("answers.q1", member(answers.q1, linearHomeflow ? LINEAR_HOMEFLOW_COOKING_DAYS : ROUND2_FREQUENCIES));
      check("answers.q2", member(answers.q2, linearHomeflow ? LINEAR_HOMEFLOW_YOUTUBE_FREQUENCIES : value.topic === "recording" ? ROUND2_RECORDING_METHODS : ROUND2_HOMEFLOW_METHODS));
      check("answers.q3", member(answers.q3, linearHomeflow ? LINEAR_HOMEFLOW_PLANNING_METHODS : value.topic === "recording" ? ROUND2_RECORDING_FEATURES : ROUND2_HOMEFLOW_FEATURES));
      check("answers.q4", member(answers.q4, linearHomeflow ? LINEAR_HOMEFLOW_DIFFICULTIES : ROUND2_INTENTS));
    }
  } else if (value.action === "lead_submit") {
    keys.push("email", "consent", "consent_version", "purpose", "consent_generation", "turnstile_token");
    try { value.email = normalizeRound2Email(value.email as string); } catch { invalid.push("email"); }
    check("consent", value.consent === true);
    check("consent_version", value.consent_version === ROUND2_CONSENT_VERSION);
    check("purpose", value.purpose === ROUND2_PURPOSE);
    check("consent_generation", typeof value.consent_generation === "number" && Number.isInteger(value.consent_generation) && value.consent_generation >= 1 && value.consent_generation <= 2147483647);
    if (Object.hasOwn(value, "turnstile_token")) check("turnstile_token", typeof value.turnstile_token === "string" && value.turnstile_token.length <= 2048 && value.turnstile_token.trim().length > 0);
  }
  if (Object.keys(value).some(key => !keys.includes(key))) throw new Round2Error("VALIDATION_ERROR");
  if (invalid.length) throw new Round2Error("VALIDATION_ERROR", invalid);
  return value as Round2Request;
}
