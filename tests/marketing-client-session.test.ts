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
