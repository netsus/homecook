// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  MarketingValidationClientSnapshot,
  MarketingValidationQueueAction,
} from "@/lib/marketing/marketing-validation-client-session";

async function importSessionModule() {
  return import("@/lib/marketing/marketing-validation-client-session");
}

function quizCompletedAction(
  overrides: Partial<Extract<MarketingValidationQueueAction, { action: "quiz_completed" }>> = {},
): Extract<MarketingValidationQueueAction, { action: "quiz_completed" }> {
  return {
    action: "quiz_completed",
    answers: {
      q1: "시작했지만 중단함",
      q2: "2~3일",
      q3: "재료를 하나씩 검색해 입력",
      q4: "하루 합계와 주간 흐름을 한눈에 못 볼 때",
      q5: "레시피 기준 자동 계산",
    },
    ...overrides,
  };
}

describe("marketing client session queue", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("stores only non-lead FIFO actions, preserves a pii-free snapshot, and never writes email/token", async () => {
    const {
      MARKETING_VALIDATION_CLIENT_STORAGE_KEY,
      enqueueMarketingQueueAction,
      readMarketingClientSnapshot,
      readMarketingQueue,
      writeMarketingClientSnapshot,
    } = await importSessionModule();

    enqueueMarketingQueueAction(quizCompletedAction());
    enqueueMarketingQueueAction({
      action: "intent_selected",
      intent_choice: "needed",
    });
    writeMarketingClientSnapshot({
      intentChoice: "needed",
      quizAnswers: quizCompletedAction().answers,
      quizResult: "weekly_blindspot",
      serverState: "intent_selected",
      stage: "email",
      targetQualified: true,
    });

    const persisted = window.sessionStorage.getItem(
      MARKETING_VALIDATION_CLIENT_STORAGE_KEY,
    );

    expect(readMarketingQueue()).toEqual([
      quizCompletedAction(),
      { action: "intent_selected", intent_choice: "needed" },
    ]);
    expect(readMarketingClientSnapshot()).toEqual({
      intentChoice: "needed",
      quizAnswers: quizCompletedAction().answers,
      quizResult: "weekly_blindspot",
      serverState: "intent_selected",
      stage: "email",
      targetQualified: true,
    } satisfies MarketingValidationClientSnapshot);
    expect(persisted).toContain("\"version\":1");
    expect(persisted).not.toContain("tester@example.com");
    expect(persisted).not.toContain("turnstile");
  });

  it("flushes queued actions sequentially and deletes only the successful head", async () => {
    const {
      enqueueMarketingQueueAction,
      flushMarketingQueue,
      readMarketingQueue,
    } = await importSessionModule();

    enqueueMarketingQueueAction(quizCompletedAction());
    enqueueMarketingQueueAction({ action: "solution_viewed" });

    const send = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, state: "quiz_completed" })
      .mockResolvedValueOnce({ ok: false, retryable: true });

    const result = await flushMarketingQueue(send);

    expect(result).toEqual({
      flushed: 1,
      pending: 1,
      stopped: "request_failed",
    });
    expect(send).toHaveBeenNthCalledWith(1, quizCompletedAction());
    expect(send).toHaveBeenNthCalledWith(2, { action: "solution_viewed" });
    expect(readMarketingQueue()).toEqual([{ action: "solution_viewed" }]);
  });

  it("waits for pending queue flush before lead submission and blocks when flush stops early", async () => {
    const {
      enqueueMarketingQueueAction,
      flushQueueBeforeLeadSubmission,
      submitLeadWithPendingFlush,
    } = await importSessionModule();

    enqueueMarketingQueueAction({ action: "intent_selected", intent_choice: "needed" });
    const sendQueuedAction = vi.fn().mockResolvedValue({ ok: false, retryable: true });
    const submitLead = vi.fn();

    const flushResult = await flushQueueBeforeLeadSubmission(sendQueuedAction);
    const result = await submitLeadWithPendingFlush(
      {
        consent: true,
        email: "tester@example.com",
        turnstileToken: "real-token-must-not-persist",
      },
      {
        sendQueuedAction,
        submitLead,
      },
    );

    expect(flushResult).toEqual({
      flushed: 0,
      pending: 1,
      stopped: "request_failed",
    });
    expect(result).toEqual({
      ok: false,
      reason: "pending_queue",
    });
    expect(submitLead).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("homecook.marketing-validation-client.v1"))
      .not.toContain("tester@example.com");
    expect(window.sessionStorage.getItem("homecook.marketing-validation-client.v1"))
      .not.toContain("real-token-must-not-persist");
  });

  it("drops malformed persisted json instead of trusting arbitrary queue and snapshot values", async () => {
    const {
      MARKETING_VALIDATION_CLIENT_STORAGE_KEY,
      readMarketingClientSnapshot,
      readMarketingQueue,
    } = await importSessionModule();

    window.sessionStorage.setItem(
      MARKETING_VALIDATION_CLIENT_STORAGE_KEY,
      JSON.stringify({
        queue: [{ action: "lead_submitted", email: "not-allowed@example.com" }],
        snapshot: { stage: "email", quizResult: "unexpected" },
        version: 999,
      }),
    );

    expect(readMarketingQueue()).toEqual([]);
    expect(readMarketingClientSnapshot()).toBeNull();
  });

  it("shares a single in-flight flush so concurrent callers do not double-send the same head", async () => {
    const {
      enqueueMarketingQueueAction,
      flushMarketingQueue,
      readMarketingQueue,
    } = await importSessionModule();

    enqueueMarketingQueueAction({ action: "quiz_started" });
    enqueueMarketingQueueAction({ action: "solution_viewed" });

    let releaseHead: (() => void) | null = null;
    const send = vi.fn(async (action: MarketingValidationQueueAction) => {
      if (action.action === "quiz_started") {
        await new Promise<void>((resolve) => {
          releaseHead = resolve;
        });
      }
      return {
        ok: true as const,
        state: action.action,
      };
    });

    const first = flushMarketingQueue(send);
    const second = flushMarketingQueue(send);
    const resolveHead: () => void = releaseHead ?? (() => {
      throw new Error("releaseHead not assigned");
    });
    resolveHead();

    expect(await first).toEqual({
      flushed: 2,
      pending: 0,
      stopped: "completed",
    });
    expect(await second).toEqual({
      flushed: 2,
      pending: 0,
      stopped: "completed",
    });
    expect(send.mock.calls.map(([action]) => action)).toEqual([
      { action: "quiz_started" },
      { action: "solution_viewed" },
    ]);
    expect(readMarketingQueue()).toEqual([]);
  });

  it("drops stale queue heads already covered by a newer durable server state", async () => {
    const {
      enqueueMarketingQueueAction,
      readMarketingQueue,
      reconcileMarketingQueueWithServerState,
    } = await importSessionModule();

    enqueueMarketingQueueAction({ action: "quiz_started" });
    enqueueMarketingQueueAction(quizCompletedAction());
    enqueueMarketingQueueAction({ action: "solution_viewed" });

    expect(reconcileMarketingQueueWithServerState("quiz_completed")).toEqual({
      dropped: 2,
      pending: 1,
    });
    expect(readMarketingQueue()).toEqual([{ action: "solution_viewed" }]);
  });
});
