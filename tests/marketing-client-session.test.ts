// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MarketingValidationClientSnapshot, MarketingValidationQueueAction } from "@/lib/marketing/marketing-validation-client-session";

async function importSessionModule() {
  return import("@/lib/marketing/marketing-validation-client-session");
}

const answers = { q1: "daily", q2: "3_5", q3: "track", q4: "search" } as const;

describe("marketing v2 client session queue", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("persists only pii-free v2 actions and snapshots", async () => {
    const { MARKETING_VALIDATION_CLIENT_STORAGE_KEY, enqueueMarketingQueueAction, readMarketingClientSnapshot, readMarketingQueue, writeMarketingClientSnapshot } = await importSessionModule();
    enqueueMarketingQueueAction({ action: "quiz_completed", answers });
    enqueueMarketingQueueAction({ action: "experience_started" });
    writeMarketingClientSnapshot({ quizAnswers: answers, quizResult: "ingredient-tracker", serverState: "experience_started", stage: "experience-1" });

    expect(readMarketingQueue()).toEqual([
      { action: "quiz_completed", answers },
      { action: "experience_started" },
    ] satisfies MarketingValidationQueueAction[]);
    expect(readMarketingClientSnapshot()).toEqual({ quizAnswers: answers, quizResult: "ingredient-tracker", serverState: "experience_started", stage: "experience-1" } satisfies MarketingValidationClientSnapshot);
    const persisted = window.sessionStorage.getItem(MARKETING_VALIDATION_CLIENT_STORAGE_KEY) ?? "";
    expect(persisted).toContain('"version":2');
    expect(persisted).not.toMatch(/email|turnstile|utm_|ad_variant/i);
  });

  it("rejects legacy v1 storage and malformed v2 values", async () => {
    const { MARKETING_VALIDATION_CLIENT_STORAGE_KEY, readMarketingClientSnapshot, readMarketingQueue } = await importSessionModule();
    window.sessionStorage.setItem(MARKETING_VALIDATION_CLIENT_STORAGE_KEY, JSON.stringify({ version: 1, queue: [{ action: "solution_viewed" }], snapshot: { stage: "email", quizResult: "weekly_blindspot" } }));
    expect(readMarketingQueue()).toEqual([]);
    expect(readMarketingClientSnapshot()).toBeNull();
  });

  it("shares an in-flight flush and keeps only the failed tail", async () => {
    const { enqueueMarketingQueueAction, flushMarketingQueue, readMarketingQueue } = await importSessionModule();
    enqueueMarketingQueueAction({ action: "quiz_started" });
    enqueueMarketingQueueAction({ action: "result_viewed" });
    const send = vi.fn().mockResolvedValueOnce({ ok: true, state: "quiz_started" }).mockResolvedValueOnce({ ok: false, retryable: true });
    const first = flushMarketingQueue(send);
    const second = flushMarketingQueue(send);
    expect(await first).toEqual({ flushed: 1, pending: 1, stopped: "request_failed" });
    expect(await second).toEqual({ flushed: 1, pending: 1, stopped: "request_failed" });
    expect(send).toHaveBeenCalledTimes(2);
    expect(readMarketingQueue()).toEqual([{ action: "result_viewed" }]);
  });

  it("keeps actions and the latest snapshot written while a flush request is in flight", async () => {
    const { enqueueMarketingQueueAction, flushMarketingQueue, readMarketingQueue, writeMarketingClientSnapshot, readMarketingClientSnapshot } = await importSessionModule();
    enqueueMarketingQueueAction({ action: "quiz_started" });
    let resolveSend!: (value: { ok: true; state: "quiz_started" }) => void;
    const send = vi.fn().mockImplementationOnce(() => new Promise((resolve) => { resolveSend = resolve; })).mockResolvedValue({ ok: true, state: "result_viewed" });
    const flushing = flushMarketingQueue(send);
    enqueueMarketingQueueAction({ action: "result_viewed" });
    writeMarketingClientSnapshot({ stage: "result", quizResult: "ingredient-tracker", serverState: "quiz_completed" });
    resolveSend({ ok: true, state: "quiz_started" });
    await flushing;
    expect(send.mock.calls.map(([action]) => action.action)).toEqual(["quiz_started", "result_viewed"]);
    expect(readMarketingQueue()).toEqual([]);
    expect(readMarketingClientSnapshot()).toEqual({ stage: "result", quizResult: "ingredient-tracker", serverState: "result_viewed" });
  });

  it("does not move a known server state backwards when an older action is replayed", async () => {
    const { enqueueMarketingQueueAction, flushMarketingQueue, writeMarketingClientSnapshot, readMarketingClientSnapshot } = await importSessionModule();
    writeMarketingClientSnapshot({ stage: "result", serverState: "result_viewed" });
    enqueueMarketingQueueAction({ action: "quiz_started" });
    await flushMarketingQueue(async () => ({ ok: true, state: "quiz_started" }));
    expect(readMarketingClientSnapshot()?.serverState).toBe("result_viewed");
  });

  it("drops stale future actions when view establishes a fresh cookie session", async () => {
    const { enqueueMarketingQueueAction, writeMarketingClientSnapshot, readMarketingQueue, reconcileMarketingQueueWithServerState } = await importSessionModule();
    writeMarketingClientSnapshot({ stage: "result", serverState: "result_viewed" });
    enqueueMarketingQueueAction({ action: "experience_started" });
    expect(reconcileMarketingQueueWithServerState("view")).toEqual({ dropped: 1, pending: 0 });
    expect(readMarketingQueue()).toEqual([]);
  });

  it("drops queue actions covered by a durable v2 server state", async () => {
    const { enqueueMarketingQueueAction, readMarketingQueue, reconcileMarketingQueueWithServerState } = await importSessionModule();
    enqueueMarketingQueueAction({ action: "quiz_started" });
    enqueueMarketingQueueAction({ action: "quiz_completed", answers });
    enqueueMarketingQueueAction({ action: "result_viewed" });
    enqueueMarketingQueueAction({ action: "experience_started" });
    expect(reconcileMarketingQueueWithServerState("result_viewed")).toEqual({ dropped: 3, pending: 1 });
    expect(readMarketingQueue()).toEqual([{ action: "experience_started" }]);
  });
});
