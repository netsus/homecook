import type { Round2ErrorCode, Round2SuccessData, Round2Topic } from "../marketing-round2";
import type { Round2Attribution } from "../server/marketing-round2-context";
export type Round2SurveyDraft = Partial<Record<"q1" | "q2" | "q3" | "q4", string>>;
export type Round2ClientError = { code: Round2ErrorCode | "STORAGE_BLOCKED" | "QUEUE_FULL" | "NETWORK_ERROR" | "PREVIEW_ONLY"; message: string; fields: string[]; retryAt: number | null };
export type Round2ClientState = {
  snapshot: Round2SuccessData | null; connection: "idle" | "connecting" | "ready" | "error" | "restart_required" | "campaign_ended";
  busy: boolean; error: Round2ClientError | null; draft: Round2SurveyDraft; leadForm: { email: string; consent: boolean };
  tokenReady: boolean; challengeEpoch: number; storageBlocked: boolean; preview: boolean;
};
export type Round2ClientOptions = { topic: Round2Topic; pageContext: string; attribution: Round2Attribution; preview: boolean; leadReady: boolean; hostname?: string; indexedDB?: IDBFactory | null; fetch?: typeof fetch; now?: () => number; tabId?: string };
export type Round2Client = {
  getState(): Round2ClientState; subscribe(listener: () => void): () => void;
  connect(): Promise<boolean>; openActivity(activity: Round2Activity): Promise<boolean>; returnToMenu(activity: Round2Activity): Promise<boolean>;
  completeExample(): Promise<boolean>; saveSurveyDraft(answers: Round2SurveyDraft): Promise<boolean>; submitSurvey(answers: Round2SurveyDraft): Promise<boolean>;
  setLeadForm(patch: Partial<Round2ClientState["leadForm"]>): void; setTurnstileToken(token: string | null): void;
  submitLead(): Promise<boolean>; retry(): Promise<boolean>; restart(): Promise<boolean>; dispose(): void;
};
import {
  CAMPAIGN_END, RETENTION_UNTIL, ROUND2_CONSENT_VERSION, ROUND2_PURPOSE, ROUND2_VERSION, ROUND2_ERRORS, ROUND2_UUID_PATTERN,
  Round2Error, canonicalRound2Json, normalizeRound2Email, parseRound2Request, type Round2Activity, type Round2Request,
} from "../marketing-round2";
import { buildRound2BootstrapRequest, checkRound2BootstrapOwnership, confirmRound2Bootstrap, markRound2ParticipationExpired, prepareRound2Bootstrap, restartRound2Bootstrap, round2BootstrapContextUrl, type Round2BootstrapPreparation } from "./round2-session";
import { enqueueRound2Request, loadRound2ClientRecord, removeRound2Request, validateRound2Draft, writeRound2ClientDraft, type Round2NonPiiRequest } from "./round2-client-storage";

/** A tab owns its private form; only nonPII requests can enter persistent storage. */
export function createRound2Client(options: Round2ClientOptions): Round2Client {
  const now = options.now ?? Date.now;
  const fetcher = options.fetch ?? globalThis.fetch;
  const hostname = typeof location !== "undefined" ? location.hostname : options.hostname;
  const previewAllowed = options.preview && ["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname ?? "");
  let state: Round2ClientState = { snapshot: null, connection: "idle", busy: false, error: null, draft: {}, leadForm: { email: options.preview ? "preview@example.com" : "", consent: false }, tokenReady: false, challengeEpoch: 0, storageBlocked: false, preview: options.preview };
  let tail: Promise<unknown> = Promise.resolve(); let disposed = false; let token: string | null = null;
  let preparation: Round2BootstrapPreparation | null = null; let pageContext = options.pageContext;
  let outbox: Round2NonPiiRequest[] = [];
  const requestedStarts = new Set<Round2Activity>();
  let leadAttempt: Extract<Round2Request, { action: "lead_submit" }> | null = null;
  let tabId: string | undefined = options.tabId;
  let cookieValidated = false;
  let tabOwnership: Promise<void> | null = null;
  let releaseTab: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const storageOptions = () => ({ topic: options.topic, nowMs: now(), ...(Object.hasOwn(options, "indexedDB") ? { indexedDB: options.indexedDB } : {}) });
  const bootstrapOptions = () => ({ ...storageOptions(), attribution: options.attribution });
  const activityOptions = () => ({ ...storageOptions(), ...(preparation?.kind === "key" ? { bootstrapKey: preparation.bootstrap_key } : {}) });
  const update = (patch: Partial<Round2ClientState>) => { if (disposed) return; state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
  function error(code: Round2ClientError["code"], fields: string[] = [], retryAt: number | null = null) {
    const messages = { STORAGE_BLOCKED: "브라우저 저장소를 허용한 뒤 다시 연결해 주세요. 기존 참여는 쿠키로 복원할 수 있어요.", QUEUE_FULL: "대기 중인 기록이 많아요. 기록 재시도 후 계속해 주세요.", NETWORK_ERROR: "저장 결과를 확인하지 못했어요. 연결을 확인한 뒤 같은 요청을 다시 시도해 주세요.", PREVIEW_ONLY: "로컬 미리보기는 이 컴퓨터에서만 열 수 있어요." };
    update({ error: { code, message: code in ROUND2_ERRORS ? ROUND2_ERRORS[code as Round2ErrorCode][1] : messages[code as keyof typeof messages], fields, retryAt } });
  }
  function invalidateConsent() {
    token = null; leadAttempt = null;
    update({ leadForm: { ...state.leadForm, consent: false }, tokenReady: false, challengeEpoch: state.challengeEpoch + 1 });
  }
  function active() {
    if (options.preview && !previewAllowed) { error("PREVIEW_ONLY"); update({ connection: "error" }); return false; }
    if (state.connection === "restart_required" || state.connection === "campaign_ended") return false;
    if (state.error?.retryAt && now() < state.error.retryAt) return false;
    return !disposed;
  }
  function run(work: () => Promise<boolean>): Promise<boolean> {
    const next = tail.then(async () => {
      if (!active()) return false;
      update({ busy: true });
      try {
        const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
        return locks && !options.preview ? await locks.request(`mumeok-r2-post:${options.topic}`, work) : await work();
      } catch (caught) {
        if (caught instanceof Round2Error) {
          if (caught.code === "BOOTSTRAP_CONFLICT") { invalidateConsent(); update({ connection: "error" }); }
          error(caught.code, caught.fields);
        }
        else error("NETWORK_ERROR");
        return false;
      } finally { update({ busy: false }); }
    });
    tail = next.catch(() => undefined); return next;
  }
  function identity() {
    if (tabId) return tabId;
    tabId = crypto.randomUUID();
    if (!options.preview && typeof sessionStorage !== "undefined") {
      try {
        const stored = sessionStorage.getItem("mumeok-r2:tab-id");
        if (stored && ROUND2_UUID_PATTERN.test(stored)) tabId = stored;
        else sessionStorage.setItem("mumeok-r2:tab-id", tabId);
      } catch { /* Draft remains in this tab's memory if session metadata is blocked. */ }
    }
    return tabId;
  }
  async function claimTab(): Promise<void> {
    if (options.preview || tabOwnership) return tabOwnership ?? undefined;
    const candidate = identity();
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (!locks) return;
    // Duplicating a tab copies sessionStorage. A live ownership lock prevents
    // that copy from overwriting the original tab's still-unsubmitted answers.
    tabOwnership = new Promise<void>(resolve => {
      const reserve = (id: string) => {
        void locks.request(`mumeok-r2-tab:${options.topic}:${id}`, { ifAvailable: true }, async lock => {
          if (disposed) { resolve(); return; }
          if (!lock) {
            tabId = crypto.randomUUID();
            try { sessionStorage.setItem("mumeok-r2:tab-id", tabId); } catch { /* Memory-only tab identity. */ }
            reserve(tabId); return;
          }
          await new Promise<void>(release => { releaseTab = release; resolve(); });
        }).catch(() => resolve());
      };
      reserve(candidate);
    });
    await tabOwnership;
  }
  function accept(value: unknown, request: Round2Request): boolean {
    const data = value as Round2SuccessData | null;
    const statuses = ["not_started", "started", "completed"];
    if (!data || data.round_version !== ROUND2_VERSION || data.topic !== options.topic || data.event_id !== request.event_id || !ROUND2_UUID_PATTERN.test(data.participation_id ?? "") ||
      !Number.isSafeInteger(data.revision) || data.revision < 1 || !Number.isSafeInteger(data.consent_generation) || data.consent_generation < 1 ||
      !data.state || !["example", "survey", "lead"].every(key => statuses.includes(data.state[key as Round2Activity])) ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(data.participation_expires_at) || Date.parse(data.participation_expires_at) <= now() || data.retention_until !== RETENTION_UNTIL ||
      (data.state.lead === "completed" ? !data.receipt || data.receipt.status !== "received" || !ROUND2_UUID_PATTERN.test(data.receipt.event_id) : data.receipt !== null)) { error("NETWORK_ERROR"); return false; }
    const completedActivity = request.action === "example_complete" ? "example" : request.action === "survey_submit" ? "survey" : request.action === "lead_submit" ? "lead" : null;
    if (completedActivity && data.state[completedActivity] !== "completed") { error("NETWORK_ERROR"); return false; }
    if (state.snapshot && data.participation_id !== state.snapshot.participation_id) throw new Round2Error("BOOTSTRAP_CONFLICT");
    if (state.snapshot && data.consent_generation > state.snapshot.consent_generation) invalidateConsent();
    if (!state.snapshot || data.revision >= state.snapshot.revision) update({ snapshot: { ...data, consent_generation: Math.max(data.consent_generation, state.snapshot?.consent_generation ?? 1) } });
    else if (data.consent_generation > state.snapshot.consent_generation) update({ snapshot: { ...state.snapshot, consent_generation: data.consent_generation } });
    update({ connection: "ready", error: null }); return true;
  }
  async function expire(campaign: boolean) {
    const key = preparation?.kind === "key" ? preparation.bootstrap_key : undefined;
    await markRound2ParticipationExpired({ ...storageOptions(), ...(key ? { bootstrapKey: key } : {}) });
    // The matching-key transaction already clears activity data. A stale 410
    // must not perform a second unowned delete after another tab has restarted.
    preparation = null; outbox = []; requestedStarts.clear(); token = null; leadAttempt = null;
    update({ snapshot: null, draft: {}, leadForm: { email: options.preview ? "preview@example.com" : "", consent: false }, tokenReady: false, challengeEpoch: state.challengeEpoch + 1, connection: campaign ? "campaign_ended" : "restart_required" });
  }
  function preview(request: Round2Request): boolean {
    const previous = state.snapshot;
    const activities = { ...(previous?.state ?? { example: "not_started", survey: "not_started", lead: "not_started" }) };
    if (request.action === "activity_start" && activities[request.activity] === "not_started") activities[request.activity] = "started";
    if (request.action === "example_complete") activities.example = "completed";
    if (request.action === "survey_submit") activities.survey = "completed";
    if (request.action === "lead_submit") activities.lead = "completed";
    return accept({ round_version: ROUND2_VERSION, topic: options.topic, participation_id: previous?.participation_id ?? crypto.randomUUID(), event_id: request.event_id, revision: (previous?.revision ?? 0) + 1, consent_generation: 1, state: activities, receipt: request.action === "lead_submit" ? { status: "received", event_id: request.event_id } : previous?.receipt ?? null, participation_expires_at: new Date(Math.min(now() + 30 * 86400000, Date.parse(CAMPAIGN_END))).toISOString().replace(/\.\d{3}Z$/, "Z"), retention_until: RETENTION_UNTIL }, request);
  }
  async function refreshContext(): Promise<boolean> {
    if (!preparation || options.preview || typeof DOMParser === "undefined") return false;
    try {
      const response = await fetcher(round2BootstrapContextUrl(preparation), { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error" });
      if (!response.ok) return false;
      const document = new DOMParser().parseFromString(await response.text(), "text/html");
      const fresh = document.querySelector('meta[name="mumeok-r2-page-context"]')?.getAttribute("content");
      if (!fresh || document.querySelector('meta[name="mumeok-r2-topic"]')?.getAttribute("content") !== options.topic) return false;
      buildRound2BootstrapRequest(preparation, fresh); pageContext = fresh; return true;
    } catch { return false; }
  }
  async function post(request: Round2Request, refreshed = false): Promise<boolean> {
    if (options.preview) return previewAllowed && preview(request);
    if (now() >= Date.parse(CAMPAIGN_END)) { await expire(true); error("CAMPAIGN_ENDED"); return false; }
    if (request.action !== "bootstrap") {
      const owned = preparation?.kind === "key" && !state.storageBlocked
        ? await checkRound2BootstrapOwnership({ ...storageOptions(), bootstrapKey: preparation.bootstrap_key }) : null;
      if (owned === false) throw new Round2Error("BOOTSTRAP_CONFLICT");
      // Storage-blocked tabs cannot observe key changes. Re-read the signed
      // cookie's participation before sending any old form payload.
      if (owned === null && !await recoverCookie()) return false;
      if (request.action === "lead_submit" && request.consent_generation !== state.snapshot?.consent_generation) throw new Round2Error("CONSENT_REFRESH_REQUIRED");
    }
    let response: Response;
    let payload;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15_000);
    try {
      response = await fetcher("/api/v1/marketing/round2", { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: abort.signal });
      payload = await response.json().catch(() => null);
    } catch { error("NETWORK_ERROR"); return false; }
    finally { clearTimeout(timeout); }
    if (response.ok && payload?.success === true && payload.error === null) return accept(payload.data, request);
    const candidate = payload?.error?.code;
    const code: Round2ErrorCode = typeof candidate === "string" && Object.hasOwn(ROUND2_ERRORS, candidate) ? candidate as Round2ErrorCode : "ROUND2_UNAVAILABLE";
    if (code === "CONTEXT_EXPIRED" && request.action === "bootstrap" && !refreshed && await refreshContext()) return post(buildRound2BootstrapRequest(preparation!, pageContext), true);
    if (code === "PARTICIPATION_EXPIRED" || code === "CAMPAIGN_ENDED") await expire(code === "CAMPAIGN_ENDED");
    if (code === "CONSENT_REFRESH_REQUIRED") invalidateConsent();
    if (code === "PARTICIPATION_REQUIRED") update({ connection: "error" });
    const seconds = response.headers.get("Retry-After");
    const retryAt = code === "RATE_LIMITED" ? now() + (/^[1-9]\d*$/.test(seconds ?? "") ? Number(seconds) : 60) * 1000 : null;
    error(code, code === "VALIDATION_ERROR" && Array.isArray(payload?.error?.fields) ? payload.error.fields.filter((v: unknown) => typeof v === "string") : [], retryAt);
    return false;
  }
  function common() { return { event_id: crypto.randomUUID(), topic: options.topic, round_version: ROUND2_VERSION, honeypot: "" as const }; }
  async function recoverCookie(): Promise<boolean> {
    update({ storageBlocked: true });
    const prepared = await prepareRound2Bootstrap({ ...bootstrapOptions(), indexedDB: null });
    if (prepared.kind !== "cookie_resume") return false;
    cookieValidated = await post(buildRound2BootstrapRequest(prepared));
    return cookieValidated;
  }
  async function connect(restart = false): Promise<boolean> {
    if (options.preview) return post({ ...common(), action: "bootstrap", bootstrap_intent: "cookie_resume" });
    update({ connection: "connecting" });
    await claimTab();
    const nextPreparation = restart ? await restartRound2Bootstrap(bootstrapOptions()) : await prepareRound2Bootstrap(bootstrapOptions());
    if (state.snapshot && preparation?.kind === "key" && nextPreparation.kind === "key" && preparation.bootstrap_key !== nextPreparation.bootstrap_key) throw new Round2Error("BOOTSTRAP_CONFLICT");
    preparation = nextPreparation;
    if (preparation.kind === "restart_required") { await expire(now() >= Date.parse(CAMPAIGN_END)); error(now() >= Date.parse(CAMPAIGN_END) ? "CAMPAIGN_ENDED" : "PARTICIPATION_EXPIRED"); return false; }
    if (preparation.kind === "queue_full") { update({ connection: "error" }); error("QUEUE_FULL"); return false; }
    update({ storageBlocked: preparation.kind === "cookie_resume" });
    const request = buildRound2BootstrapRequest(preparation, pageContext);
    if (!await post(request)) { if (state.connection === "connecting") update({ connection: "error" }); return false; }
    cookieValidated = preparation?.kind === "cookie_resume";
    if (preparation?.kind === "key" && state.snapshot) {
      const confirmed = await confirmRound2Bootstrap({ ...storageOptions(), bootstrapKey: preparation.bootstrap_key, eventId: preparation.event_id, expiresAt: state.snapshot.participation_expires_at });
      if (!confirmed && !await recoverCookie()) return false;
    }
    if (!state.storageBlocked) {
      try {
        const stored = await loadRound2ClientRecord(activityOptions());
        if (stored && stored.participation_id === state.snapshot?.participation_id) {
          outbox = [...stored.outbox, ...outbox.filter(item => !stored.outbox.some(saved => saved.event_id === item.event_id))];
          if (!Object.keys(state.draft).length) update({ draft: stored.drafts[identity()] ?? {} });
        }
        if (Object.keys(state.draft).length && state.snapshot) {
          await writeRound2ClientDraft({ ...activityOptions(), participationId: state.snapshot.participation_id, expiresAt: state.snapshot.participation_expires_at, tabId: identity(), draft: state.draft });
        }
      } catch (caught) { if (caught instanceof Round2Error) throw caught; if (!await recoverCookie()) return false; }
    }
    return true;
  }
  async function ensure() {
    if (state.connection !== "ready" || !state.snapshot) return connect();
    if (state.storageBlocked && !cookieValidated && !options.preview) return recoverCookie();
    return true;
  }
  async function flush(): Promise<boolean> {
    for (const item of [...outbox]) {
      if (!await post(item)) {
        if (state.error?.code !== "ACTIVITY_ALREADY_COMPLETED") return false;
        const activity = item.action === "survey_submit" ? "survey" : item.action === "example_complete" ? "example" : null;
        if (!activity || !await connect() || state.snapshot?.state[activity] !== "completed") return false;
      }
      outbox = outbox.filter(request => request.event_id !== item.event_id);
      if (!state.storageBlocked && !options.preview) await removeRound2Request({ ...activityOptions(), eventId: item.event_id }).catch(() => update({ storageBlocked: true }));
    }
    return true;
  }
  async function resumeStarts(): Promise<boolean> {
    for (const activity of [...requestedStarts]) if (!await nonPii({ ...common(), action: "activity_start", activity })) return false;
    return true;
  }
  async function nonPii(request: Round2NonPiiRequest): Promise<boolean> {
    if (!await ensure()) return false;
    if (request.action !== "activity_start" && !await resumeStarts()) return false;
    const existing = outbox.find(item => canonicalRound2Json({ ...item, event_id: "" }) === canonicalRound2Json({ ...request, event_id: "" }));
    if (!existing) {
      if (outbox.length >= 50) { error("QUEUE_FULL"); return false; }
      if (!state.storageBlocked && !options.preview) {
        try {
          if (!await enqueueRound2Request({ ...activityOptions(), participationId: state.snapshot!.participation_id, expiresAt: state.snapshot!.participation_expires_at, request })) { error("QUEUE_FULL"); return false; }
        } catch (caught) {
          if (caught instanceof Round2Error) throw caught;
          update({ storageBlocked: true });
          // Storage failure must validate the existing cookie before memory-only submissions.
          if (!await recoverCookie()) return false;
        }
      }
      outbox.push(request);
    }
    const result = await flush();
    if (result && request.action === "activity_start") requestedStarts.delete(request.activity);
    return result;
  }
  async function submitLead(explicitRetry: boolean, submittedToken: string | null): Promise<boolean> {
    if (!await ensure() || !await resumeStarts() || !await flush()) return false;
    if (!options.leadReady) { error("LEAD_CAPTURE_NOT_READY"); return false; }
    if (state.snapshot?.state.lead === "completed") return true;
    if (!state.leadForm.consent) { error("VALIDATION_ERROR", ["consent"]); return false; }
    if (!options.preview && !submittedToken && !explicitRetry) { error("TURNSTILE_FAILED", ["turnstile_token"]); return false; }
    const email = options.preview ? "preview@example.com" : normalizeRound2Email(state.leadForm.email);
    if (!leadAttempt || !explicitRetry) leadAttempt = { ...common(), action: "lead_submit", email, consent: true, consent_version: ROUND2_CONSENT_VERSION, purpose: ROUND2_PURPOSE, consent_generation: state.snapshot!.consent_generation };
    const request = { ...leadAttempt, ...(submittedToken ? { turnstile_token: submittedToken } : {}) };
    const result = await post(request);
    delete request.turnstile_token;
    if (result) { leadAttempt = null; update({ leadForm: { email: options.preview ? "preview@example.com" : "", consent: false } }); }
    return result;
  }
  const takeToken = () => { const current = token; token = null; update({ tokenReady: false, challengeEpoch: state.challengeEpoch + 1 }); return current; };
  const client: Round2Client = {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    connect: () => run(async () => await connect() && await resumeStarts() && await flush()),
    openActivity(activity) {
      requestedStarts.add(activity);
      return run(() => requestedStarts.has(activity) ? nonPii({ ...common(), action: "activity_start", activity }) : Promise.resolve(true));
    },
    returnToMenu: from_activity => run(() => nonPii({ ...common(), action: "menu_return", from_activity })),
    completeExample: () => run(() => nonPii({ ...common(), action: "example_complete" })),
    saveSurveyDraft(answers) {
      const draft = validateRound2Draft(answers, options.topic); update({ draft });
      // Draft saving must never bootstrap or collect a view just because an answer changed.
      if (options.preview || state.storageBlocked || !state.snapshot) return Promise.resolve(true);
      return run(async () => {
        try { await writeRound2ClientDraft({ ...activityOptions(), participationId: state.snapshot!.participation_id, expiresAt: state.snapshot!.participation_expires_at, tabId: identity(), draft }); return true; }
        catch (caught) { if (caught instanceof Round2Error) throw caught; cookieValidated = false; update({ storageBlocked: true }); return true; }
      });
    },
    submitSurvey: answers => run(() => nonPii(parseRound2Request(JSON.stringify({ ...common(), action: "survey_submit", survey_version: `${ROUND2_VERSION}-${options.topic}`, answers })) as Round2NonPiiRequest)),
    setLeadForm(patch) {
      const next = { ...state.leadForm, ...patch, ...(options.preview ? { email: "preview@example.com" } : {}) };
      if (next.email !== state.leadForm.email || next.consent !== state.leadForm.consent) { leadAttempt = null; token = null; update({ tokenReady: false, challengeEpoch: state.challengeEpoch + 1 }); }
      update({ leadForm: next });
    },
    setTurnstileToken(value) { token = value; update({ tokenReady: !!value }); },
    submitLead() { const submittedToken = takeToken(); return run(() => submitLead(!!leadAttempt, submittedToken)); },
    retry() {
      const submittedToken = leadAttempt ? takeToken() : null;
      return run(async () => {
        if (state.error?.code === "CONSENT_REFRESH_REQUIRED") return connect();
        if (state.error?.code === "ACTIVITY_ALREADY_COMPLETED" && leadAttempt) { leadAttempt = null; return connect(); }
        if (leadAttempt) return submitLead(true, submittedToken);
        if (state.connection !== "ready" && !await connect()) return false;
        return await resumeStarts() && await flush();
      });
    },
    restart() {
      if (state.connection !== "restart_required") return Promise.resolve(false);
      update({ connection: "idle", error: null });
      return run(async () => { await refreshContext(); return connect(true); });
    },
    dispose() { disposed = true; releaseTab?.(); token = null; leadAttempt = null; outbox = []; requestedStarts.clear(); listeners.clear(); state = { ...state, leadForm: { email: "", consent: false }, tokenReady: false }; },
  };
  return client;
}
