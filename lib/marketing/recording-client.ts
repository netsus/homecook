import { LINEAR_RECORDING_SURVEY_VERSION, ROUND2_UUID_PATTERN, type Round2LinearRecordingAnswers, type Round2SuccessData } from "@/lib/marketing-round2";
import { LINEAR_RECORDING_SURVEY } from "@/lib/marketing/round2-survey";
import { createRound2Client, type Round2ClientOptions, type Round2ClientState } from "@/lib/marketing/round2-client";
import type { MarketingValidationQuizResult } from "@/types/marketing-validation";

export type RecordingResult = MarketingValidationQuizResult;
export const RECORDING_CACHE_KEY = "mumeok:recording:r2.2-recording:ui";
const results = { pass: "homecook-passer", eyeball: "eyeballing-master", track: "ingredient-tracker", measure: "pro-measurer" } as const;
export function recordingSharedResult(search: string): RecordingResult | null {
  const values = new URLSearchParams(search).getAll("result");
  return values.length === 1 && Object.values(results).includes(values[0] as RecordingResult) ? values[0] as RecordingResult : null;
}
export function recordingShareUrl(origin: string, result: RecordingResult): string {
  const url = new URL("/beta/r2/recording", origin);
  url.searchParams.set("result", result);
  return url.toString();
}
type Screen = "quiz" | "result" | "returning" | "experience" | "planner" | "packaged" | "payoff" | "lead" | "done" | "legacy";
type Answers = Partial<Round2LinearRecordingAnswers>;
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Confirmation = { eventId: string; answers: Round2LinearRecordingAnswers };
type Cache = { topic: "recording"; version: typeof LINEAR_RECORDING_SURVEY_VERSION; participationId: string; expiresAt: string; answers: Answers; confirmed: Confirmation | null; screen: Screen; question: number; step: number };
export type RecordingClientState = { core: Round2ClientState; screen: Screen; question: number; step: number; answers: Answers; result: RecordingResult | null; shared: boolean; message: string | null };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
function validAnswers(value: unknown): value is Answers {
  return object(value) && Object.entries(value).every(([key, answer]) => LINEAR_RECORDING_SURVEY.questions.find(question => question.id === key)?.options.some(option => option.value === answer));
}
function complete(value: Answers): value is Round2LinearRecordingAnswers {
  return validAnswers(value) && LINEAR_RECORDING_SURVEY.questions.every(question => value[question.id] !== undefined);
}
function validCache(value: unknown, snapshot: Round2SuccessData, now: number): value is Cache {
  if (!object(value) || !exact(value, ["topic", "version", "participationId", "expiresAt", "answers", "confirmed", "screen", "question", "step"]) ||
    value.topic !== "recording" || value.version !== LINEAR_RECORDING_SURVEY_VERSION || value.participationId !== snapshot.participation_id ||
    value.expiresAt !== snapshot.participation_expires_at || Date.parse(snapshot.participation_expires_at) <= now || !validAnswers(value.answers) ||
    !["quiz", "result", "returning", "experience", "planner", "packaged", "payoff", "lead", "done", "legacy"].includes(value.screen as string) ||
    !Number.isInteger(value.question) || Number(value.question) < 0 || Number(value.question) > 3 || !Number.isInteger(value.step) || Number(value.step) < 1 || Number(value.step) > 5) return false;
  const proof = value.confirmed;
  return proof === null || (object(proof) && exact(proof, ["eventId", "answers"]) && typeof proof.eventId === "string" && ROUND2_UUID_PATTERN.test(proof.eventId) && validAnswers(proof.answers) && complete(proof.answers));
}

/** UI progress is non-authoritative; the existing R2 queue owns every network event. */
export function createRecordingClient(options: Round2ClientOptions & { sharedResult?: RecordingResult | null; storage?: StorageLike | null }) {
  const now = options.now ?? Date.now;
  const listeners = new Set<() => void>();
  let state: RecordingClientState;
  let confirmed: Confirmation | null = null;
  let initialized = false, disposed = false, working = false, cacheBlocked = false;
  let connection: Promise<void> | null = null;
  let pending: "first" | "survey" | "experience" | "payoff" | "lead" | null = null;
  let storage: StorageLike | null = options.storage ?? null;
  if (!Object.hasOwn(options, "storage") && !options.preview && !options.sharedResult) {
    try { storage = globalThis.sessionStorage ?? null; } catch { /* A blocked UI cache does not replace cookie recovery. */ }
  }
  const core = createRound2Client({ ...options, topic: "recording", surveyVersion: LINEAR_RECORDING_SURVEY_VERSION,
    onSurveyConfirmed(request, data) {
      if (request.topic !== "recording" || request.survey_version !== LINEAR_RECORDING_SURVEY_VERSION || !complete(request.answers)) return;
      confirmed = { eventId: request.event_id, answers: { ...request.answers } };
      // Preserve the sent tuple, never a later local edit or an unrelated completed snapshot.
      state = { ...state, answers: { ...request.answers }, result: results[request.answers.q3] };
      persist(data);
    },
  });
  state = { core: core.getState(), screen: options.sharedResult ? "result" : "quiz", question: 0, step: 1, answers: {}, result: options.sharedResult ?? null, shared: !!options.sharedResult, message: options.preview ? "로컬 미리보기예요. 실제 응답이나 신청은 저장되지 않아요." : null };
  function emit(patch: Partial<RecordingClientState> = {}) {
    if (disposed) return;
    state = { ...state, ...patch, core: { ...core.getState(), busy: working || core.getState().busy } };
    listeners.forEach(listener => listener());
  }
  function persist(snapshot = core.getState().snapshot) {
    if (options.preview || state.shared || cacheBlocked || !snapshot || !initialized) return;
    const cache: Cache = { topic: "recording", version: LINEAR_RECORDING_SURVEY_VERSION, participationId: snapshot.participation_id, expiresAt: snapshot.participation_expires_at,
      answers: { ...state.answers }, confirmed, screen: state.screen, question: state.question, step: state.step };
    try { storage?.setItem(RECORDING_CACHE_KEY, JSON.stringify(cache)); } catch { /* Progress stays in memory; core still owns receipt recovery. */ }
  }
  function completedScreen() {
    const snapshot = core.getState().snapshot;
    if (!snapshot) return false;
    if (snapshot.state.lead === "completed") { emit({ screen: "done", message: options.preview ? state.message : null }); return true; }
    if (snapshot.state.survey !== "completed") return false;
    const result = confirmed ? results[confirmed.answers.q3] : options.preview && complete(state.answers) ? results[state.answers.q3] : null;
    emit({ result, screen: result ? "result" : "returning" });
    return true;
  }
  function restore() {
    const snapshot = core.getState().snapshot;
    if (!snapshot) return;
    let cache: Cache | null = null;
    if (!options.preview) {
      try {
        const raw = storage?.getItem(RECORDING_CACHE_KEY);
        if (raw) {
          const value: unknown = raw.length <= 12000 ? JSON.parse(raw) : null;
          if (validCache(value, snapshot, now())) cache = value;
          else cacheBlocked = true;
        }
      } catch { cacheBlocked = true; }
    }
    if (cache) {
      confirmed ??= cache.confirmed;
      emit({ answers: cache.answers, question: cache.question, step: cache.step });
    }
    initialized = true;
    if (completedScreen()) {
      if (cache && state.result && ["experience", "planner", "packaged", "payoff"].includes(cache.screen) && snapshot.state.lead !== "completed") emit({ screen: cache.screen });
      else if (snapshot.state.example === "completed" && snapshot.state.lead !== "completed") emit({ screen: "returning" });
    } else if (cacheBlocked || (!cache && Object.keys(core.getState().draft).length)) {
      cacheBlocked = true;
      emit({ screen: "legacy", answers: {}, question: 0, message: "이전에 시작한 설문을 새 질문에 섞어 복원할 수 없어요. 이 화면에서 설문을 다시 시작해 주세요. 기존 참여 기록은 유지돼요." });
    } else if (cache) {
      // Incomplete answers can only restore to a question they have actually reached.
      const firstMissing = LINEAR_RECORDING_SURVEY.questions.findIndex(question => !cache.answers[question.id]);
      emit({ screen: "quiz", question: Math.min(cache.question, firstMissing < 0 ? 3 : firstMissing) });
    }
    persist();
  }
  const unsubscribe = core.subscribe(() => {
    if (core.getState().connection === "restart_required" || core.getState().connection === "campaign_ended") {
      confirmed = null; initialized = false;
      emit({ answers: {}, result: null, screen: "legacy", message: "참여 유효기간이 끝났어요. 다시 연결을 선택해 주세요." });
    } else {
      emit();
      if (core.getState().snapshot?.state.lead === "completed" && !state.shared) emit({ screen: "done" });
    }
  });
  async function connect() {
    if (state.shared || disposed || initialized) return;
    if (!connection) connection = (async () => { if (await core.connect()) restore(); })().finally(() => { connection = null; });
    await connection;
  }
  async function work(action: () => Promise<void>) {
    if (working || disposed || state.shared) return;
    working = true; emit();
    try { await action(); } finally { working = false; emit(); persist(); }
  }
  async function enterExperience() {
    pending = "experience";
    if (core.getState().snapshot?.state.example === "not_started" && !await core.openActivity("example")) return;
    pending = null; emit({ screen: "experience", step: 1 });
  }
  async function finishPayoff() {
    pending = "payoff";
    if (core.getState().snapshot?.state.example !== "completed" && !await core.completeExample()) return;
    if (core.getState().snapshot?.state.example !== "completed") return;
    if (core.getState().snapshot?.state.lead === "completed") { pending = null; completedScreen(); return; }
    if (core.getState().snapshot?.state.lead === "not_started" && !await core.openActivity("lead")) return;
    pending = null; emit({ screen: "lead" });
  }
  return {
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    connect,
    async selectAnswer(id: keyof Round2LinearRecordingAnswers, value: string) {
      if (state.shared || state.screen !== "quiz" || working || pending || id !== LINEAR_RECORDING_SURVEY.questions[state.question].id || !validAnswers({ [id]: value })) return;
      emit({ answers: { ...state.answers, [id]: value } });
      await work(async () => {
        await connect();
        if (!initialized || state.screen !== "quiz" || completedScreen()) return;
        emit({ answers: { ...state.answers, [id]: value } });
        if (id === "q1") {
          pending = "first";
          if (core.getState().snapshot?.state.survey === "not_started" && !await core.openActivity("survey")) return;
          if (core.getState().snapshot?.state.survey !== "started") return;
          pending = null; emit({ question: 1 });
        } else if (id === "q4" && complete(state.answers)) {
          pending = "survey";
          if (!await core.submitSurvey({ ...state.answers })) return;
          pending = null; completedScreen();
        } else emit({ question: state.question + 1 });
      });
    },
    async next() {
      await work(async () => {
        if (pending) return;
        if (state.screen === "result" || state.screen === "returning") await enterExperience();
        else if (state.screen === "experience") emit(state.step < 5 ? { step: state.step + 1 } : { screen: "planner" });
        else if (state.screen === "planner") emit({ screen: "packaged" });
        else if (state.screen === "packaged") emit({ screen: "payoff" });
        else if (state.screen === "payoff") await finishPayoff();
      });
    },
    back() {
      if (working || pending || state.shared) return;
      if (state.screen === "quiz" && state.question > 0) emit({ question: state.question - 1 });
      else if (state.screen === "experience") emit(state.step > 1 ? { step: state.step - 1 } : { screen: state.result ? "result" : "returning" });
      else if (state.screen === "planner") emit({ screen: "experience", step: 5 });
      else if (state.screen === "packaged") emit({ screen: "planner" });
      else if (state.screen === "payoff" || state.screen === "lead") emit({ screen: state.screen === "lead" ? "payoff" : "packaged" });
      else if (state.screen === "done") emit({ screen: "payoff" });
      persist();
    },
    async retry() {
      await work(async () => {
        if (core.getState().connection === "restart_required") {
          if (await core.restart()) { cacheBlocked = false; initialized = true; pending = null; emit({ screen: "quiz", answers: {}, question: 0, result: null, message: null }); }
          return;
        }
        if (!await core.retry()) return;
        if (!initialized) restore();
        if (pending === "first" || (!pending && state.screen === "quiz" && state.question === 0 && state.answers.q1)) {
          if (completedScreen()) { pending = null; return; }
          if (core.getState().snapshot?.state.survey === "not_started" && !await core.openActivity("survey")) { pending = "first"; return; }
          if (core.getState().snapshot?.state.survey === "started") { pending = null; emit({ question: 1 }); }
        } else if (pending === "survey") { pending = null; completedScreen(); }
        else if (pending === "experience") await enterExperience();
        else if (pending === "payoff") await finishPayoff();
        else if (pending === "lead" && core.getState().snapshot?.state.lead === "completed") { pending = null; completedScreen(); }
      });
    },
    restartLocal() {
      if (working || state.shared || pending) return;
      if (core.getState().snapshot?.state.survey === "completed") {
        const result = confirmed ? results[confirmed.answers.q3] : null;
        emit({ screen: result ? "result" : "returning", result }); persist(); return;
      }
      cacheBlocked = false; confirmed = null;
      emit({ screen: "quiz", question: 0, step: 1, answers: {}, result: null, message: null }); persist();
    },
    startTest() {
      if (!state.shared) return;
      emit({ shared: false, screen: "quiz", result: null, answers: {}, question: 0 });
      // Explicitly returning to Q1 does not itself connect or start the survey.
    },
    setLeadForm: core.setLeadForm,
    setTurnstileToken: core.setTurnstileToken,
    restoreLeadAttempt: core.restoreLeadAttempt,
    async submitLead() { await work(async () => { pending = "lead"; if (await core.submitLead()) { pending = null; completedScreen(); } }); },
    dispose() { disposed = true; unsubscribe(); core.dispose(); listeners.clear(); },
  };
}
