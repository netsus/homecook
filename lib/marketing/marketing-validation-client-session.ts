import type {
  MarketingValidationLegacyAction as MarketingValidationAction,
  MarketingValidationIntentChoice,
  MarketingValidationPlannerIntent,
  MarketingValidationPlannerPriority,
  MarketingValidationLegacyQuizAnswers as MarketingValidationQuizAnswers,
  MarketingValidationLegacyQuizResult as MarketingValidationQuizResult,
} from "@/types/marketing-validation";
import {
  FOLLOWUP_INTENT_OPTIONS,
  FOLLOWUP_PRIORITY_OPTIONS,
  MARKETING_INTENT_CHOICES,
  MARKETING_VALIDATION_LEGACY_ACTIONS as MARKETING_VALIDATION_ACTIONS,
} from "@/lib/marketing/demand-validation";

export const MARKETING_VALIDATION_CLIENT_STORAGE_KEY =
  "homecook.marketing-validation-client.v1";

export type MarketingValidationUiStage =
  | "hero"
  | "quiz"
  | "result"
  | "intent"
  | "email"
  | "followup"
  | "done";

export type MarketingValidationQueueAction =
  | { action: "quiz_started" }
  | { action: "quiz_completed"; answers: MarketingValidationQuizAnswers }
  | { action: "solution_viewed" }
  | { action: "intent_selected"; intent_choice: MarketingValidationIntentChoice }
  | {
      action: "followup_submitted";
      planner_intent?: MarketingValidationPlannerIntent | null;
      planner_priority?: MarketingValidationPlannerPriority | null;
    };

export interface MarketingValidationClientSnapshot {
  intentChoice?: MarketingValidationIntentChoice;
  plannerIntent?: MarketingValidationPlannerIntent | null;
  plannerPriority?: MarketingValidationPlannerPriority | null;
  quizAnswers?: MarketingValidationQuizAnswers;
  quizResult?: MarketingValidationQuizResult;
  serverState?: MarketingValidationAction;
  stage: MarketingValidationUiStage;
  targetQualified?: boolean;
}

interface StoredClientState {
  queue: MarketingValidationQueueAction[];
  snapshot: MarketingValidationClientSnapshot | null;
  version: 1;
}

let activeFlushPromise: Promise<MarketingValidationFlushResult> | null = null;

export interface MarketingValidationFlushResult {
  flushed: number;
  pending: number;
  stopped: "completed" | "request_failed";
}

interface MarketingValidationFlushSuccess {
  ok: true;
  state?: MarketingValidationAction;
}

interface MarketingValidationFlushFailure {
  ok: false;
  retryable?: boolean;
}

type FlushSendResult =
  | MarketingValidationFlushSuccess
  | MarketingValidationFlushFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isQuizAnswers(value: unknown): value is MarketingValidationQuizAnswers {
  if (!isRecord(value)) return false;
  return ["q1", "q2", "q3", "q4", "q5"].every(
    (key) => typeof value[key] === "string" && value[key].length > 0,
  );
}

function isUiStage(value: unknown): value is MarketingValidationUiStage {
  return [
    "hero",
    "quiz",
    "result",
    "intent",
    "email",
    "followup",
    "done",
  ].includes(value as MarketingValidationUiStage);
}

function isQuizResult(value: unknown): value is MarketingValidationQuizResult {
  return [
    "ingredient_reentry",
    "rough_match",
    "split_tracking",
    "weekly_blindspot",
    "satisfied_control",
  ].includes(value as MarketingValidationQuizResult);
}

function isServerState(value: unknown): value is MarketingValidationAction {
  return MARKETING_VALIDATION_ACTIONS.includes(value as MarketingValidationAction);
}

function isIntentChoice(value: unknown): value is MarketingValidationIntentChoice {
  return MARKETING_INTENT_CHOICES.includes(value as MarketingValidationIntentChoice);
}

function isPlannerIntent(value: unknown): value is MarketingValidationPlannerIntent {
  return FOLLOWUP_INTENT_OPTIONS.includes(value as MarketingValidationPlannerIntent);
}

function isPlannerPriority(value: unknown): value is MarketingValidationPlannerPriority {
  return FOLLOWUP_PRIORITY_OPTIONS.includes(value as MarketingValidationPlannerPriority);
}

function isQueueAction(value: unknown): value is MarketingValidationQueueAction {
  if (!isRecord(value) || typeof value.action !== "string") {
    return false;
  }

  switch (value.action) {
    case "quiz_started":
    case "solution_viewed":
      return Object.keys(value).length === 1;
    case "quiz_completed":
      return isQuizAnswers(value.answers);
    case "intent_selected":
      return isIntentChoice(value.intent_choice);
    case "followup_submitted":
      return (
        (value.planner_intent === undefined
          || value.planner_intent === null
          || isPlannerIntent(value.planner_intent))
        && (value.planner_priority === undefined
          || value.planner_priority === null
          || isPlannerPriority(value.planner_priority))
      );
    default:
      return false;
  }
}

function isSnapshot(value: unknown): value is MarketingValidationClientSnapshot {
  if (!isRecord(value) || !isUiStage(value.stage)) {
    return false;
  }

  if (value.intentChoice !== undefined && !isIntentChoice(value.intentChoice)) {
    return false;
  }
  if (
    value.plannerIntent !== undefined
    && value.plannerIntent !== null
    && !isPlannerIntent(value.plannerIntent)
  ) {
    return false;
  }
  if (
    value.plannerPriority !== undefined
    && value.plannerPriority !== null
    && !isPlannerPriority(value.plannerPriority)
  ) {
    return false;
  }
  if (value.quizAnswers !== undefined && !isQuizAnswers(value.quizAnswers)) {
    return false;
  }
  if (value.quizResult !== undefined && !isQuizResult(value.quizResult)) {
    return false;
  }
  if (value.serverState !== undefined && !isServerState(value.serverState)) {
    return false;
  }
  if (
    value.targetQualified !== undefined
    && typeof value.targetQualified !== "boolean"
  ) {
    return false;
  }

  return true;
}

function readStoredState(): StoredClientState {
  if (typeof window === "undefined") {
    return {
      queue: [],
      snapshot: null,
      version: 1,
    };
  }

  try {
    const raw = window.sessionStorage.getItem(MARKETING_VALIDATION_CLIENT_STORAGE_KEY);
    if (!raw) {
      return { queue: [], snapshot: null, version: 1 };
    }
    const parsed = JSON.parse(raw) as Partial<StoredClientState> | null;
    if (!parsed || parsed.version !== 1) {
      return { queue: [], snapshot: null, version: 1 };
    }

    return {
      queue: Array.isArray(parsed.queue)
        ? parsed.queue.filter((action): action is MarketingValidationQueueAction => isQueueAction(action))
        : [],
      snapshot: isSnapshot(parsed.snapshot) ? parsed.snapshot : null,
      version: 1,
    };
  } catch {
    return { queue: [], snapshot: null, version: 1 };
  }
}

function writeStoredState(state: StoredClientState) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      MARKETING_VALIDATION_CLIENT_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch {
    // Best effort only; runtime state still stays in memory.
  }
}

export function readMarketingQueue() {
  return readStoredState().queue;
}

export function enqueueMarketingQueueAction(action: MarketingValidationQueueAction) {
  const current = readStoredState();
  writeStoredState({
    ...current,
    queue: [...current.queue, action],
  });
}

export function replaceMarketingQueue(queue: MarketingValidationQueueAction[]) {
  const current = readStoredState();
  writeStoredState({
    ...current,
    queue,
  });
}

function marketingActionRank(action: MarketingValidationAction) {
  return MARKETING_VALIDATION_ACTIONS.indexOf(action);
}

export function isMarketingQueueActionCoveredByServerState(
  action: MarketingValidationQueueAction,
  serverState: MarketingValidationAction,
) {
  return marketingActionRank(serverState) >= marketingActionRank(action.action);
}

export function reconcileMarketingQueueWithServerState(
  serverState: MarketingValidationAction,
) {
  const current = readStoredState();
  const queue = current.queue.filter(
    (action) => !isMarketingQueueActionCoveredByServerState(action, serverState),
  );
  const dropped = current.queue.length - queue.length;

  if (dropped > 0) {
    writeStoredState({
      queue,
      snapshot: current.snapshot
        ? { ...current.snapshot, serverState }
        : current.snapshot,
      version: 1,
    });
  }

  return {
    dropped,
    pending: queue.length,
  };
}

export function readMarketingClientSnapshot() {
  return readStoredState().snapshot;
}

export function writeMarketingClientSnapshot(
  snapshot: MarketingValidationClientSnapshot | null,
) {
  const current = readStoredState();
  writeStoredState({
    ...current,
    snapshot,
  });
}

export async function flushMarketingQueue(
  send: (action: MarketingValidationQueueAction) => Promise<FlushSendResult>,
): Promise<MarketingValidationFlushResult> {
  if (activeFlushPromise) {
    return activeFlushPromise;
  }

  activeFlushPromise = (async () => {
    let flushed = 0;

    while (true) {
      const current = readStoredState();
      const [head, ...rest] = current.queue;

      if (!head) {
        return {
          flushed,
          pending: 0,
          stopped: "completed",
        };
      }

      const result = await send(head);
      if (!result.ok) {
        return {
          flushed,
          pending: current.queue.length,
          stopped: "request_failed",
        };
      }

      const snapshot = current.snapshot
        ? {
            ...current.snapshot,
            serverState: result.state ?? current.snapshot.serverState,
          }
        : current.snapshot;

      writeStoredState({
        queue: rest,
        snapshot,
        version: 1,
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

export function flushQueueBeforeLeadSubmission(
  send: (action: MarketingValidationQueueAction) => Promise<FlushSendResult>,
) {
  return flushMarketingQueue(send);
}

export async function submitLeadWithPendingFlush(
  lead: {
    consent: true;
    email: string;
    turnstileToken: string;
  },
  options: {
    sendQueuedAction: (
      action: MarketingValidationQueueAction,
    ) => Promise<FlushSendResult>;
    submitLead: (lead: {
      consent: true;
      email: string;
      turnstileToken: string;
    }) => Promise<{ message?: string; ok: boolean; reason?: "lead_failed" }>;
  },
) {
  void lead;
  const flushed = await flushMarketingQueue(options.sendQueuedAction);
  if (flushed.stopped !== "completed") {
    return {
      ok: false as const,
      reason: "pending_queue" as const,
    };
  }

  return options.submitLead(lead);
}
