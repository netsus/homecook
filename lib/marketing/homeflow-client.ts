import {
  CAMPAIGN_END, LINEAR_HOMEFLOW_SURVEY_VERSION, RETENTION_UNTIL, ROUND2_ERRORS,
  ROUND2_UUID_PATTERN, parseRound2Request,
  type Round2ErrorCode, type Round2LinearHomeflowAnswers, type Round2Request, type Round2SuccessData,
} from "@/lib/marketing-round2";
import { LINEAR_HOMEFLOW_SURVEY } from "@/lib/marketing/round2-survey";
import { INITIAL_HOMEFLOW_DEMO, type HomeflowDemoState } from "@/lib/marketing/homeflow-content";

export const HOMEFLOW_CACHE_KEY = "mumeok:homeflow:r2.2-homeflow:ui";
export type HomeflowScreen = "hero" | "quiz" | "result" | "returning" | "experience" | "lead" | "done";
export type HomeflowAnonymousRequest =
  | (Extract<Round2Request, { action: "activity_start" | "example_complete" }> & { topic: "homeflow" })
  | Extract<Round2Request, { action: "survey_submit"; survey_version: typeof LINEAR_HOMEFLOW_SURVEY_VERSION }>;
export type HomeflowUiState = {
  version: typeof LINEAR_HOMEFLOW_SURVEY_VERSION;
  participationId: string | null;
  expiresAt: string;
  screen: HomeflowScreen;
  question: number;
  step: number;
  answers: Partial<Round2LinearHomeflowAnswers>;
  confirmedSurveyEventId: string | null;
  demo: HomeflowDemoState;
  pending: HomeflowAnonymousRequest | null;
};
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const screens = ["hero", "quiz", "result", "returning", "experience", "lead", "done"];
const ingredientIds = ["pork", "scallion", "kimchi", "sugar", "chili", "soy", "rice", "butter", "egg"];
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
export function initialHomeflowUi(): HomeflowUiState {
  return { version: LINEAR_HOMEFLOW_SURVEY_VERSION, participationId: null, expiresAt: CAMPAIGN_END, screen: "hero", question: 0, step: 1, answers: {}, confirmedSurveyEventId: null, demo: { ...INITIAL_HOMEFLOW_DEMO, purchased: [...INITIAL_HOMEFLOW_DEMO.purchased], excluded: [...INITIAL_HOMEFLOW_DEMO.excluded] }, pending: null };
}
export function completeHomeflowAnswers(answers: Partial<Round2LinearHomeflowAnswers>): answers is Round2LinearHomeflowAnswers {
  return LINEAR_HOMEFLOW_SURVEY.questions.every(question => question.options.some(option => option.value === answers[question.id]));
}
function validCache(value: unknown): value is HomeflowUiState {
  if (!object(value) || !exact(value, ["version", "participationId", "expiresAt", "screen", "question", "step", "answers", "confirmedSurveyEventId", "demo", "pending"]) ||
    value.version !== LINEAR_HOMEFLOW_SURVEY_VERSION || (value.participationId !== null && (typeof value.participationId !== "string" || !ROUND2_UUID_PATTERN.test(value.participationId))) ||
    typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) > Date.parse(CAMPAIGN_END) ||
    !screens.includes(value.screen as string) || !Number.isInteger(value.question) || Number(value.question) < 0 || Number(value.question) > 3 ||
    !Number.isInteger(value.step) || Number(value.step) < 1 || Number(value.step) > 6 || !object(value.answers) || !object(value.demo)) return false;
  if (value.confirmedSurveyEventId !== null && (typeof value.confirmedSurveyEventId !== "string" || !ROUND2_UUID_PATTERN.test(value.confirmedSurveyEventId))) return false;
  for (const [key, answer] of Object.entries(value.answers)) {
    const question = LINEAR_HOMEFLOW_SURVEY.questions.find(item => item.id === key);
    if (!question?.options.some(option => option.value === answer)) return false;
  }
  const demo = value.demo;
  if (!exact(demo, ["purchased", "excluded", "recorded", "shoppingCompleted"]) || typeof demo.recorded !== "boolean" || typeof demo.shoppingCompleted !== "boolean") return false;
  for (const key of ["purchased", "excluded"]) {
    const ids = demo[key];
    if (!Array.isArray(ids) || ids.length > 9 || new Set(ids).size !== ids.length || !ids.every(id => ingredientIds.includes(id))) return false;
  }
  if ((demo.purchased as string[]).some(id => (demo.excluded as string[]).includes(id))) return false;
  if (value.pending !== null) {
    if (!object(value.pending) || !["activity_start", "survey_submit", "example_complete"].includes(value.pending.action as string)) return false;
    try {
      const command = parseRound2Request(JSON.stringify(value.pending));
      if (command.topic !== "homeflow" || (command.action === "survey_submit" && command.survey_version !== LINEAR_HOMEFLOW_SURVEY_VERSION)) return false;
    } catch { return false; }
  }
  return true;
}
export function readHomeflowCache(storage: StorageLike | null, now = Date.now()): HomeflowUiState | null {
  try {
    const raw = storage?.getItem(HOMEFLOW_CACHE_KEY);
    if (!raw) return null;
    if (raw.length > 12000) throw Error();
    const value: unknown = JSON.parse(raw);
    if (!validCache(value) || Date.parse(value.expiresAt) <= now) throw Error();
    return value;
  } catch { try { storage?.removeItem(HOMEFLOW_CACHE_KEY); } catch {} return null; }
}
export function writeHomeflowCache(storage: StorageLike | null, value: unknown): boolean {
  try {
    if (!storage || !validCache(value)) { storage?.removeItem(HOMEFLOW_CACHE_KEY); return false; }
    storage.setItem(HOMEFLOW_CACHE_KEY, JSON.stringify(value));
    return true;
  } catch { return false; }
}
export function reconcileHomeflowCache(cache: HomeflowUiState | null, server: Round2SuccessData): HomeflowUiState {
  const matching = cache?.participationId === server.participation_id ? cache : null;
  const state: HomeflowUiState = { ...(matching ?? initialHomeflowUi()), participationId: server.participation_id, expiresAt: server.participation_expires_at };
  if (server.state.lead === "completed" && server.receipt) return { ...state, screen: "done", pending: null };
  if (server.state.survey !== "completed") return { ...state, screen: matching?.screen === "hero" || !matching ? "hero" : "quiz", step: 1 };
  if (!state.confirmedSurveyEventId || !completeHomeflowAnswers(state.answers)) return { ...state, screen: "returning" };
  if (server.state.example === "completed") return { ...state, screen: matching?.screen === "experience" && matching.step === 6 ? "experience" : "lead", step: 6, demo: { ...state.demo, shoppingCompleted: true, recorded: true } };
  return { ...state, screen: matching?.screen === "experience" ? "experience" : "result", step: Math.min(state.step, 6) };
}
export class HomeflowClientError extends Error {
  constructor(readonly code: Round2ErrorCode | "NETWORK", readonly retryable = false) {
    super(code === "NETWORK" ? "전송 결과를 확인하지 못했어요. 다시 시도해 주세요." : ROUND2_ERRORS[code][1]);
    this.name = "HomeflowClientError";
  }
}
export function mergeHomeflowServerState(current: Round2SuccessData | null, incoming: Round2SuccessData): Round2SuccessData {
  if (current && current.participation_id !== incoming.participation_id) throw new HomeflowClientError("PARTICIPATION_REQUIRED");
  return current && current.revision > incoming.revision ? current : incoming;
}
function validServer(value: unknown): value is Round2SuccessData {
  if (!object(value) || !exact(value, ["round_version", "topic", "participation_id", "event_id", "revision", "consent_generation", "state", "receipt", "participation_expires_at", "retention_until"]) ||
    value.round_version !== "r2.1" || value.topic !== "homeflow" || typeof value.participation_id !== "string" || !ROUND2_UUID_PATTERN.test(value.participation_id) ||
    typeof value.event_id !== "string" || !ROUND2_UUID_PATTERN.test(value.event_id) || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1 ||
    !Number.isSafeInteger(value.consent_generation) || Number(value.consent_generation) < 1 || value.retention_until !== RETENTION_UNTIL ||
    typeof value.participation_expires_at !== "string" || !Number.isFinite(Date.parse(value.participation_expires_at)) || !object(value.state) || !exact(value.state, ["survey", "example", "lead"]) ||
    !Object.values(value.state).every(s => ["not_started", "started", "completed"].includes(String(s)))) return false;
  if (value.state.lead !== "completed") return value.receipt === null;
  return object(value.receipt) && exact(value.receipt, ["event_id", "status"]) && typeof value.receipt.event_id === "string" && ROUND2_UUID_PATTERN.test(value.receipt.event_id) && value.receipt.status === "received";
}
export async function postHomeflowRequest(body: Round2Request, fetcher: typeof fetch = fetch): Promise<Round2SuccessData> {
  let response: Response;
  let value: unknown;
  try {
    response = await fetcher("/api/v1/marketing/round2", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    value = await response.json();
  } catch { throw new HomeflowClientError("NETWORK", true); }
  if (response.ok && object(value) && value.success === true && value.error === null && validServer(value.data) && value.data.event_id === body.event_id) return value.data;
  if (object(value) && object(value.error) && typeof value.error.code === "string" && Object.hasOwn(ROUND2_ERRORS, value.error.code)) {
    const code = value.error.code as Round2ErrorCode;
    throw new HomeflowClientError(code, response.status >= 500 || response.status === 429);
  }
  throw new HomeflowClientError("NETWORK", true);
}
