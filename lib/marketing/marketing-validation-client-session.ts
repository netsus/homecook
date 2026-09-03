import {
  MARKETING_VALIDATION_ACTIONS,
  type MarketingValidationAction,
  type MarketingValidationQuizAnswers,
  type MarketingValidationQuizResult,
} from "@/types/marketing-validation";

export const MARKETING_VALIDATION_CLIENT_STORAGE_KEY = "homecook.marketing-validation-client.v2";

export type MarketingValidationUiStage =
  | "hero"
  | "quiz"
  | "result"
  | "experience-1"
  | "experience-2"
  | "experience-3"
  | "experience-4"
  | "experience-5"
  | "planner-homecook"
  | "packaged-food"
  | "planner-complete"
  | "beta-form"
  | "done";

export type MarketingValidationQueueAction =
  | { action: "quiz_started" }
  | { action: "quiz_completed"; answers: MarketingValidationQuizAnswers }
  | { action: "result_viewed" | "experience_started" | "experience_completed" | "beta_form_viewed" };

export interface MarketingValidationClientSnapshot {
  quizAnswers?: MarketingValidationQuizAnswers;
  quizResult?: MarketingValidationQuizResult;
  serverState?: MarketingValidationAction;
  stage: MarketingValidationUiStage;
}

interface StoredClientState {
  queue: MarketingValidationQueueAction[];
  snapshot: MarketingValidationClientSnapshot | null;
  version: 2;
}

export interface MarketingValidationFlushResult {
  flushed: number;
  pending: number;
  stopped: "completed" | "request_failed";
}

type FlushSendResult =
  | { ok: true; state?: MarketingValidationAction }
  | { ok: false; retryable?: boolean };

let activeFlushPromise: Promise<MarketingValidationFlushResult> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isQuizAnswers(value: unknown): value is MarketingValidationQuizAnswers {
  if (!isRecord(value) || Object.keys(value).length !== 4) return false;
  return [
    ["q1", ["daily", "3_5", "1_2", "none"]],
    ["q2", ["none", "1_2", "3_5", "6_plus"]],
    ["q3", ["pass", "eyeball", "track", "measure"]],
    ["q4", ["ingredients", "weight", "search", "none"]],
  ].every(([key, allowed]) => (allowed as string[]).includes(value[key as string] as string));
}

function isQueueAction(value: unknown): value is MarketingValidationQueueAction {
  if (!isRecord(value) || typeof value.action !== "string") return false;
  if (value.action === "quiz_completed") {
    return Object.keys(value).length === 2 && isQuizAnswers(value.answers);
  }
  return ["quiz_started", "result_viewed", "experience_started", "experience_completed", "beta_form_viewed"].includes(value.action)
    && Object.keys(value).length === 1;
}

function isUiStage(value: unknown): value is MarketingValidationUiStage {
  return ["hero", "quiz", "result", "experience-1", "experience-2", "experience-3", "experience-4", "experience-5", "planner-homecook", "packaged-food", "planner-complete", "beta-form", "done"].includes(value as MarketingValidationUiStage);
}

function isResult(value: unknown): value is MarketingValidationQuizResult {
  return ["homecook-passer", "eyeballing-master", "ingredient-tracker", "pro-measurer"].includes(value as MarketingValidationQuizResult);
}

function isAction(value: unknown): value is MarketingValidationAction {
  return MARKETING_VALIDATION_ACTIONS.includes(value as MarketingValidationAction);
}

function isSnapshot(value: unknown): value is MarketingValidationClientSnapshot {
  if (!isRecord(value) || !isUiStage(value.stage)) return false;
  if (value.quizAnswers !== undefined && !isQuizAnswers(value.quizAnswers)) return false;
  if (value.quizResult !== undefined && !isResult(value.quizResult)) return false;
  return value.serverState === undefined || isAction(value.serverState);
}

function emptyState(): StoredClientState {
  return { queue: [], snapshot: null, version: 2 };
}

function readStoredState(): StoredClientState {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = window.sessionStorage.getItem(MARKETING_VALIDATION_CLIENT_STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<StoredClientState>;
    if (parsed.version !== 2) return emptyState();
    return {
      queue: Array.isArray(parsed.queue) ? parsed.queue.filter(isQueueAction) : [],
      snapshot: isSnapshot(parsed.snapshot) ? parsed.snapshot : null,
      version: 2,
    };
  } catch {
    return emptyState();
  }
}

function writeStoredState(state: StoredClientState) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(MARKETING_VALIDATION_CLIENT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Session recovery is best-effort; no PII is ever stored here.
  }
}

export function readMarketingQueue() { return readStoredState().queue; }

export function enqueueMarketingQueueAction(action: MarketingValidationQueueAction) {
  const current = readStoredState();
  writeStoredState({ ...current, queue: [...current.queue, action] });
}

export function replaceMarketingQueue(queue: MarketingValidationQueueAction[]) {
  const current = readStoredState();
  writeStoredState({ ...current, queue });
}

function actionRank(action: MarketingValidationAction) {
  return MARKETING_VALIDATION_ACTIONS.indexOf(action);
}

export function isMarketingQueueActionCoveredByServerState(action: MarketingValidationQueueAction, serverState: MarketingValidationAction) {
  return actionRank(serverState) >= actionRank(action.action);
}

export function reconcileMarketingQueueWithServerState(serverState: MarketingValidationAction) {
  const current = readStoredState();
  const queue = current.queue.filter((action) => !isMarketingQueueActionCoveredByServerState(action, serverState));
  const dropped = current.queue.length - queue.length;
  writeStoredState({
    queue,
    snapshot: current.snapshot ? { ...current.snapshot, serverState } : null,
    version: 2,
  });
  return { dropped, pending: queue.length };
}

export function readMarketingClientSnapshot() { return readStoredState().snapshot; }

export function writeMarketingClientSnapshot(snapshot: MarketingValidationClientSnapshot | null) {
  const current = readStoredState();
  writeStoredState({ ...current, snapshot });
}

export async function flushMarketingQueue(send: (action: MarketingValidationQueueAction) => Promise<FlushSendResult>): Promise<MarketingValidationFlushResult> {
  if (activeFlushPromise) return activeFlushPromise;
  activeFlushPromise = (async () => {
    let flushed = 0;
    while (true) {
      const current = readStoredState();
      const [head, ...rest] = current.queue;
      if (!head) return { flushed, pending: 0, stopped: "completed" };
      const result = await send(head);
      if (!result.ok) return { flushed, pending: current.queue.length, stopped: "request_failed" };
      writeStoredState({
        queue: rest,
        snapshot: current.snapshot ? { ...current.snapshot, serverState: result.state ?? current.snapshot.serverState } : null,
        version: 2,
      });
      flushed += 1;
    }
  })();
  try {
    return await activeFlushPromise;
  } finally {
    activeFlushPromise = null;
  }
}

export function flushQueueBeforeLeadSubmission(send: (action: MarketingValidationQueueAction) => Promise<FlushSendResult>) {
  return flushMarketingQueue(send);
}

export async function submitLeadWithPendingFlush(
  lead: { consent: true; email: string; turnstileToken: string },
  options: {
    sendQueuedAction: (action: MarketingValidationQueueAction) => Promise<FlushSendResult>;
    submitLead: (lead: { consent: true; email: string; turnstileToken: string }) => Promise<{ message?: string; ok: boolean; reason?: "lead_failed" }>;
  },
) {
  const flushed = await flushMarketingQueue(options.sendQueuedAction);
  if (flushed.stopped !== "completed") return { ok: false as const, reason: "pending_queue" as const };
  return options.submitLead(lead);
}
