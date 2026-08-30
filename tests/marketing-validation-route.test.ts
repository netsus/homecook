import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  MarketingValidationAction,
  MarketingValidationQuizResult,
  MarketingValidationSessionRecord,
} from "@/types/marketing-validation";

const now = new Date("2026-08-31T09:00:00.000Z");

type SessionRow = MarketingValidationSessionRecord;

function createSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    viewed_at: "2026-08-31T09:00:00.000Z",
    quiz_started_at: null,
    quiz_completed_at: null,
    solution_viewed_at: null,
    intent_clicked_at: null,
    lead_submitted_at: null,
    followup_submitted_at: null,
    intent_choice: null,
    quiz_result: null,
    quiz_answers: null,
    target_qualified: null,
    lead_submission_status: "none",
    planner_intent: null,
    planner_priority: null,
    ...overrides,
  };
}

async function createHandler() {
  const importedModule = await import("@/lib/server/marketing-validation-route");
  return importedModule.createMarketingValidationHandler;
}

function createDependencies(overrides: Record<string, unknown> = {}) {
  return {
    now: () => now,
    newSessionId: () => "550e8400-e29b-41d4-a716-446655440000",
    allowedOrigins: ["http://localhost:3100", "https://app.mumeok.kr"],
    readSession: vi.fn(async () => null),
    insertViewSession: vi.fn(async () => createSession()),
    advanceSession: vi.fn(),
    markDuplicateLead: vi.fn(),
    marketingLeadGate: vi.fn(async () => ({
      ok: true as const,
      allowedOrigins: ["http://localhost:3100", "https://app.mumeok.kr"],
      allowedHostnames: ["app.mumeok.kr", "localhost"],
    })),
    verifyTurnstile: vi.fn(async () => ({
      ok: true as const,
      verified_at: "2026-08-31T09:00:05.000Z",
    })),
    ...overrides,
  };
}

describe("marketing demand validation route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("sets the HttpOnly session cookie on the first https view", async () => {
    const createMarketingValidationHandler = await createHandler();
    const inserted = createSession();
    const handler = createMarketingValidationHandler(createDependencies({
      newSessionId: () => inserted.id,
      insertViewSession: vi.fn(async () => inserted),
    }));

    const response = await handler(new Request("https://app.mumeok.kr/api/v1/marketing/validation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.mumeok.kr",
      },
      body: JSON.stringify({ action: "view", honeypot: "", utm_source: "meta" }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { stage: "view", state: "view" },
      error: null,
    });
    expect(response.headers.get("set-cookie")).toMatch(
      /mumeok_validation_session=550e8400-e29b-41d4-a716-446655440000;.*Path=\/api\/v1\/marketing\/validation.*HttpOnly.*SameSite=Lax.*Secure/i,
    );
  });

  it("keeps Secure=false on local http view cookies", async () => {
    const createMarketingValidationHandler = await createHandler();
    const handler = createMarketingValidationHandler(createDependencies());

    const response = await handler(new Request("http://localhost:3100/api/v1/marketing/validation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3100",
      },
      body: JSON.stringify({ action: "view", honeypot: "" }),
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).not.toContain("Secure");
  });

  it("replays view against the existing progressed row instead of replacing the session", async () => {
    const createMarketingValidationHandler = await createHandler();
    const progressed = createSession({
      quiz_started_at: "2026-08-31T09:00:02.000Z",
    });
    const insertViewSession = vi.fn();
    const handler = createMarketingValidationHandler(createDependencies({
      readSession: vi.fn(async () => progressed),
      insertViewSession,
    }));

    const response = await handler(new Request("https://app.mumeok.kr/api/v1/marketing/validation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.mumeok.kr",
        cookie: `mumeok_validation_session=${progressed.id}`,
      },
      body: JSON.stringify({ action: "view", honeypot: "" }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: { stage: "view", state: "quiz_started" },
      error: null,
    });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(insertViewSession).not.toHaveBeenCalled();
  });

  it("derives paid attribution from server locks rather than trusting client labels", async () => {
    const createMarketingValidationHandler = await createHandler();
    const insertViewSession = vi.fn(async () => createSession({
      attribution_status: "paid_allowlisted",
    }));
    const handler = createMarketingValidationHandler(createDependencies({
      paidAttributionOrigins: ["https://app.mumeok.kr"],
      insertViewSession,
    }));

    const response = await handler(new Request("https://app.mumeok.kr/api/v1/marketing/validation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.mumeok.kr",
      },
      body: JSON.stringify({
        action: "view",
        honeypot: "",
        utm_source: "meta",
        utm_medium: "paid_social",
        utm_campaign: "weekly_nutrition_2026",
        utm_content: "weekly_nutrition_v2",
      }),
    }));

    expect(response.status).toBe(200);
    expect(insertViewSession).toHaveBeenCalledWith(expect.objectContaining({
      attribution_status: "paid_allowlisted",
      request_origin: "https://app.mumeok.kr",
      sessionId: expect.any(String),
    }));
  });

  it("fails closed before view insert when retention readiness is missing", async () => {
    const createMarketingValidationHandler = await createHandler();
    const handler = createMarketingValidationHandler(createDependencies({
      insertViewSession: vi.fn(async () => {
        throw Object.assign(new Error("missing campaign end"), {
          code: "MARKETING_RETENTION_NOT_READY",
        });
      }),
    }));

    const response = await handler(new Request("https://app.mumeok.kr/api/v1/marketing/validation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.mumeok.kr",
      },
      body: JSON.stringify({ action: "view", honeypot: "" }),
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      success: false,
      data: null,
      error: {
        code: "LEAD_CAPTURE_UNAVAILABLE",
        message: "요청을 처리할 수 없어요. 잠시 후 다시 시도해 주세요.",
        fields: [],
      },
    });
  });

  it("rejects missing, malformed, and nonexistent session cookies before writes", async () => {
    const createMarketingValidationHandler = await createHandler();
    const advanceSession = vi.fn();
    const insertViewSession = vi.fn();
    const handler = createMarketingValidationHandler(createDependencies({
      insertViewSession,
      advanceSession,
      readSession: vi.fn(async () => null),
    }));

    const missing = await handler(new Request("https://app.mumeok.kr/api/v1/marketing/validation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.mumeok.kr",
      },
      body: JSON.stringify({ action: "quiz_started", honeypot: "" }),
    }));
    expect(missing.status).toBe(422);

    const malformed = await handler(new Request("https://app.mumeok.kr/api/v1/marketing/validation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.mumeok.kr",
        cookie: "mumeok_validation_session=bad-cookie",
      },
      body: JSON.stringify({ action: "quiz_started", honeypot: "" }),
    }));
    expect(malformed.status).toBe(422);

    const missingRow = await handler(new Request("https://app.mumeok.kr/api/v1/marketing/validation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.mumeok.kr",
        cookie: "mumeok_validation_session=550e8400-e29b-41d4-a716-446655440000",
      },
      body: JSON.stringify({ action: "quiz_started", honeypot: "" }),
    }));
    expect(missingRow.status).toBe(409);
    expect(insertViewSession).not.toHaveBeenCalled();
    expect(advanceSession).not.toHaveBeenCalled();
  });

  it("requires exact allowed origin for every post", async () => {
    const createMarketingValidationHandler = await createHandler();
    const insertViewSession = vi.fn();
    const handler = createMarketingValidationHandler(createDependencies({
      insertViewSession,
    }));

    const response = await handler(new Request("https://app.mumeok.kr/api/v1/marketing/validation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
      },
      body: JSON.stringify({ action: "view", honeypot: "" }),
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      data: null,
      error: {
        code: "ORIGIN_NOT_ALLOWED",
        message: "허용되지 않은 접근이에요.",
        fields: [],
      },
    });
    expect(insertViewSession).not.toHaveBeenCalled();
  });

  it("keeps quiz/result actions working even when lead protection readiness is missing", async () => {
    const createMarketingValidationHandler = await createHandler();
    const session = createSession({
      quiz_started_at: "2026-08-31T09:00:02.000Z",
    });
    const advanceSession = vi.fn(async (_id: string, action: MarketingValidationAction) => {
      expect(action).toBe("quiz_completed");
      return createSession({
        ...session,
        quiz_completed_at: "2026-08-31T09:00:05.000Z",
        quiz_result: "weekly_blindspot" as MarketingValidationQuizResult,
        quiz_answers: {
          q1: "시작했지만 중단함",
          q2: "2~3일",
          q3: "재료를 하나씩 검색해 입력",
          q4: "하루 합계와 주간 흐름을 한눈에 못 볼 때",
          q5: "레시피 기준 자동 계산",
        },
        target_qualified: true,
      });
    });
    const handler = createMarketingValidationHandler(createDependencies({
      readSession: vi.fn(async () => session),
      advanceSession,
      marketingLeadGate: vi.fn(async () => ({
        ok: false,
        code: "LEAD_CAPTURE_NOT_READY",
        message: "lead disabled",
      })),
    }));

    const response = await handler(new Request("http://localhost:3100/api/v1/marketing/validation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3100",
        cookie: `mumeok_validation_session=${session.id}`,
      },
      body: JSON.stringify({
        action: "quiz_completed",
        honeypot: "",
        answers: {
          q1: "시작했지만 중단함",
          q2: "2~3일",
          q3: "재료를 하나씩 검색해 입력",
          q4: "하루 합계와 주간 흐름을 한눈에 못 볼 때",
          q5: "레시피 기준 자동 계산",
        },
      }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        stage: "quiz_completed",
        state: "quiz_completed",
        quiz_result: "weekly_blindspot",
        target_qualified: true,
      },
      error: null,
    });
    expect(advanceSession).toHaveBeenCalledOnce();
  });

  it("returns byte-for-byte identical success for accepted and duplicate leads", async () => {
    const createMarketingValidationHandler = await createHandler();
    const baseSession = createSession({
      quiz_started_at: "2026-08-31T09:00:01.000Z",
      quiz_completed_at: "2026-08-31T09:00:02.000Z",
      solution_viewed_at: "2026-08-31T09:00:03.000Z",
      intent_clicked_at: "2026-08-31T09:00:04.000Z",
      intent_choice: "needed",
      quiz_result: "weekly_blindspot" as MarketingValidationQuizResult,
      target_qualified: true,
    });
    const verifyTurnstile = vi.fn(async () => ({
      ok: true,
      verified_at: "2026-08-31T09:00:05.000Z",
    }));
    const acceptedHandler = createMarketingValidationHandler(createDependencies({
      readSession: vi.fn(async () => baseSession),
      advanceSession: vi.fn(async () => createSession({
        ...baseSession,
        lead_submitted_at: "2026-08-31T09:00:06.000Z",
        lead_submission_status: "accepted",
      })),
      verifyTurnstile,
    }));
    const duplicateMarker = vi.fn(async () => createSession({
      ...baseSession,
      lead_submitted_at: "2026-08-31T09:00:06.000Z",
      lead_submission_status: "duplicate",
    }));
    const duplicateHandler = createMarketingValidationHandler(createDependencies({
      readSession: vi.fn(async () => baseSession),
      advanceSession: vi.fn(async () => {
        throw Object.assign(new Error("duplicate"), { code: "MARKETING_EMAIL_DUPLICATE" });
      }),
      markDuplicateLead: duplicateMarker,
      verifyTurnstile,
    }));
    const request = () => new Request("https://app.mumeok.kr/api/v1/marketing/validation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.mumeok.kr",
        cookie: `mumeok_validation_session=${baseSession.id}`,
      },
      body: JSON.stringify({
        action: "lead_submitted",
        honeypot: "",
        email: "user@example.com",
        consent: true,
        turnstile_token: "turnstile-token",
      }),
    });

    const acceptedResponse = await acceptedHandler(request());
    const duplicateResponse = await duplicateHandler(request());

    expect(await acceptedResponse.text()).toBe(await duplicateResponse.text());
    expect(verifyTurnstile).toHaveBeenCalledTimes(2);
    expect(duplicateMarker).toHaveBeenCalledOnce();
  });

  it("skips Turnstile verification when the same session already completed lead submission", async () => {
    const createMarketingValidationHandler = await createHandler();
    const submittedSession = createSession({
      quiz_started_at: "2026-08-31T09:00:01.000Z",
      quiz_completed_at: "2026-08-31T09:00:02.000Z",
      solution_viewed_at: "2026-08-31T09:00:03.000Z",
      intent_clicked_at: "2026-08-31T09:00:04.000Z",
      lead_submitted_at: "2026-08-31T09:00:05.000Z",
      intent_choice: "needed",
      quiz_result: "weekly_blindspot" as MarketingValidationQuizResult,
      target_qualified: true,
      lead_submission_status: "accepted",
    });
    const verifyTurnstile = vi.fn();
    const handler = createMarketingValidationHandler(createDependencies({
      readSession: vi.fn(async () => submittedSession),
      verifyTurnstile,
    }));

    const response = await handler(new Request("https://app.mumeok.kr/api/v1/marketing/validation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.mumeok.kr",
        cookie: `mumeok_validation_session=${submittedSession.id}`,
      },
      body: JSON.stringify({
        action: "lead_submitted",
        honeypot: "",
        email: "user@example.com",
        consent: true,
        turnstile_token: "turnstile-token",
      }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        stage: "lead_submitted",
        state: "lead_submitted",
      },
      error: null,
    });
    expect(verifyTurnstile).not.toHaveBeenCalled();
  });

  it("fails closed on readiness gaps and turnstile failures during lead submission", async () => {
    const createMarketingValidationHandler = await createHandler();
    const session = createSession({
      quiz_started_at: "2026-08-31T09:00:01.000Z",
      quiz_completed_at: "2026-08-31T09:00:02.000Z",
      solution_viewed_at: "2026-08-31T09:00:03.000Z",
      intent_clicked_at: "2026-08-31T09:00:04.000Z",
      intent_choice: "needed",
    });
    const advanceSession = vi.fn();
    const verifyTurnstile = vi.fn(async () => ({
      ok: false,
      code: "TURNSTILE_FAILED",
      message: "expected action mismatch",
    }));
    const notReadyHandler = createMarketingValidationHandler(createDependencies({
      readSession: vi.fn(async () => session),
      advanceSession,
      verifyTurnstile,
      marketingLeadGate: vi.fn(async () => ({
        ok: false,
        code: "LEAD_CAPTURE_NOT_READY",
        message: "베타 신청은 아직 열리지 않았어요.",
      })),
    }));

    const notReady = await notReadyHandler(new Request("https://app.mumeok.kr/api/v1/marketing/validation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.mumeok.kr",
        cookie: `mumeok_validation_session=${session.id}`,
      },
      body: JSON.stringify({
        action: "lead_submitted",
        honeypot: "",
        email: "user@example.com",
        consent: true,
        turnstile_token: "turnstile-token",
      }),
    }));
    expect(notReady.status).toBe(503);
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(advanceSession).not.toHaveBeenCalled();

    const handler = createMarketingValidationHandler(createDependencies({
      readSession: vi.fn(async () => session),
      advanceSession,
      verifyTurnstile,
    }));
    const turnstileFailure = await handler(new Request("https://app.mumeok.kr/api/v1/marketing/validation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.mumeok.kr",
        cookie: `mumeok_validation_session=${session.id}`,
      },
      body: JSON.stringify({
        action: "lead_submitted",
        honeypot: "",
        email: "user@example.com",
        consent: true,
        turnstile_token: "turnstile-token",
      }),
    }));
    expect(turnstileFailure.status).toBe(422);
    expect((await turnstileFailure.json()).error.code).toBe("TURNSTILE_FAILED");
    expect(advanceSession).not.toHaveBeenCalled();
  });

  it("does not accept an email after the neutral negative intent", async () => {
    const createMarketingValidationHandler = await createHandler();
    const session = createSession({
      quiz_started_at: "2026-08-31T09:00:01.000Z",
      quiz_completed_at: "2026-08-31T09:00:02.000Z",
      solution_viewed_at: "2026-08-31T09:00:03.000Z",
      intent_clicked_at: "2026-08-31T09:00:04.000Z",
      intent_choice: "enough",
    });
    const advanceSession = vi.fn();
    const verifyTurnstile = vi.fn();
    const marketingLeadGate = vi.fn();
    const handler = createMarketingValidationHandler(createDependencies({
      readSession: vi.fn(async () => session),
      advanceSession,
      verifyTurnstile,
      marketingLeadGate,
    }));

    const response = await handler(new Request("https://app.mumeok.kr/api/v1/marketing/validation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.mumeok.kr",
        cookie: `mumeok_validation_session=${session.id}`,
      },
      body: JSON.stringify({
        action: "lead_submitted",
        honeypot: "",
        email: "user@example.com",
        consent: true,
        turnstile_token: "turnstile-token",
      }),
    }));

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("INVALID_TRANSITION");
    expect(marketingLeadGate).not.toHaveBeenCalled();
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(advanceSession).not.toHaveBeenCalled();
  });

  it("records an explicitly skipped optional followup after a completed lead", async () => {
    const createMarketingValidationHandler = await createHandler();
    const session = createSession({
      quiz_started_at: "2026-08-31T09:00:01.000Z",
      quiz_completed_at: "2026-08-31T09:00:02.000Z",
      solution_viewed_at: "2026-08-31T09:00:03.000Z",
      intent_clicked_at: "2026-08-31T09:00:04.000Z",
      intent_choice: "needed",
      lead_submitted_at: "2026-08-31T09:00:05.000Z",
      lead_submission_status: "accepted",
    });
    const advanceSession = vi.fn(async () => createSession({
      ...session,
      followup_submitted_at: "2026-08-31T09:00:06.000Z",
    }));
    const handler = createMarketingValidationHandler(createDependencies({
      readSession: vi.fn(async () => session),
      advanceSession,
    }));

    const response = await handler(new Request("https://app.mumeok.kr/api/v1/marketing/validation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://app.mumeok.kr",
        cookie: `mumeok_validation_session=${session.id}`,
      },
      body: JSON.stringify({
        action: "followup_submitted",
        honeypot: "",
      }),
    }));

    expect(response.status).toBe(200);
    expect(advanceSession).toHaveBeenCalledWith(
      session.id,
      "followup_submitted",
      expect.objectContaining({
        planner_intent: null,
        planner_priority: null,
      }),
    );
  });

  it("fails closed before any write when the internal marketing client is unavailable", async () => {
    const { POST } = await import("@/app/api/v1/marketing/validation/route");

    const response = await POST(new Request("http://localhost:3100/api/v1/marketing/validation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost:3100",
      },
      body: JSON.stringify({ action: "view", honeypot: "" }),
    }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      success: false,
      data: null,
      error: {
        code: "LEAD_CAPTURE_UNAVAILABLE",
        message: "요청을 처리할 수 없어요. 잠시 후 다시 시도해 주세요.",
        fields: [],
      },
    });
  });
});
