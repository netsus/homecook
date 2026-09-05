import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createMarketingValidationHandler,
  createTurnstileVerifierFromEnv,
} from "@/lib/server/marketing-validation-route";
import { parseMarketingValidationBody } from "@/lib/server/marketing-validation";
import type { MarketingValidationSessionRecord } from "@/types/marketing-validation";

const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const ORIGIN = "https://app.mumeok.kr";
const NOW = "2026-09-03T09:00:00.000Z";

function createSession(overrides: Record<string, unknown> = {}): MarketingValidationSessionRecord {
  return {
    id: SESSION_ID,
    creative_key: "mumeok_funnel_prototype_v2",
    viewed_at: NOW,
    quiz_started_at: null,
    quiz_completed_at: null,
    result_viewed_at: null,
    experience_started_at: null,
    experience_completed_at: null,
    beta_form_viewed_at: null,
    lead_submitted_at: null,
    quiz_result: null,
    quiz_answers: null,
    target_qualified: null,
    lead_submission_status: "none",
    solution_viewed_at: null,
    intent_choice: null,
    intent_clicked_at: null,
    planner_intent: null,
    planner_priority: null,
    followup_submitted_at: null,
    ...overrides,
  } as MarketingValidationSessionRecord;
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    now: () => new Date(NOW),
    newSessionId: () => SESSION_ID,
    allowedOrigins: [ORIGIN],
    paidAttributionOrigins: [ORIGIN],
    readSession: vi.fn(async () => null),
    insertViewSession: vi.fn(async () => createSession()),
    advanceSession: vi.fn(),
    markDuplicateLead: vi.fn(),
    marketingLeadGate: vi.fn(async () => ({
      ok: true as const,
      allowedOrigins: [ORIGIN],
      allowedHostnames: ["app.mumeok.kr"],
    })),
    verifyTurnstile: vi.fn(async () => ({ ok: true as const, verified_at: NOW })),
    ...overrides,
  };
}

function request(body: Record<string, unknown>, cookie = true) {
  return new Request(`${ORIGIN}/api/v1/marketing/validation`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: ORIGIN,
      ...(cookie ? { cookie: `mumeok_validation_session=${SESSION_ID}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function requestAt(url: string, origin: string, body: Record<string, unknown>, cookie = true) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      ...(cookie ? { cookie: `mumeok_validation_session=${SESSION_ID}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const completedAnswers = { q1: "daily", q2: "3_5", q3: "track", q4: "search" };

describe("marketing validation v2 route", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("creates a v2 session and stores the server-resolved Hero variant", async () => {
    const insertViewSession = vi.fn(async (input) => createSession({ ad_variant: input.ad_variant }));
    const handler = createMarketingValidationHandler(dependencies({ insertViewSession }));
    const response = await handler(request({
      action: "view", honeypot: "", utm_content: "hook_reentry", ad_variant: "d",
    }, false));

    expect(response.status).toBe(200);
    expect(insertViewSession).toHaveBeenCalledWith(expect.objectContaining({ ad_variant: "a" }));
    expect(response.headers.get("set-cookie")).toContain(`mumeok_validation_session=${SESSION_ID}`);
  });

  it("restarts a v1 cookie with a new v2 row without writing the historical row", async () => {
    const old = createSession({ creative_key: "weekly_nutrition_v2" });
    const insertViewSession = vi.fn(async () => createSession());
    const handler = createMarketingValidationHandler(dependencies({
      readSession: vi.fn(async () => old), insertViewSession,
    }));
    const response = await handler(request({ action: "view", honeypot: "" }));

    expect(response.status).toBe(200);
    expect(insertViewSession).toHaveBeenCalledOnce();
    expect(response.headers.get("set-cookie")).toContain(`mumeok_validation_session=${SESSION_ID}`);
  });

  it("rejects every non-view write through a historical v1 cookie", async () => {
    const advanceSession = vi.fn();
    const handler = createMarketingValidationHandler(dependencies({
      readSession: vi.fn(async () => createSession({ creative_key: "weekly_nutrition_v2" })),
      advanceSession,
    }));
    const response = await handler(request({ action: "quiz_started", honeypot: "" }));

    expect(response.status).toBe(409);
    expect(advanceSession).not.toHaveBeenCalled();
  });

  it.each(["solution_viewed", "intent_selected", "followup_submitted"])("rejects legacy action %s", async (action) => {
    const handler = createMarketingValidationHandler(dependencies());
    const response = await handler(request({ action, honeypot: "" }));
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects q5, missing answers, old result fields, and unknown answers", async () => {
    const handler = createMarketingValidationHandler(dependencies());
    for (const body of [
      { action: "quiz_completed", honeypot: "", answers: { ...completedAnswers, q5: "legacy" } },
      { action: "quiz_completed", honeypot: "", answers: { q1: "daily", q2: "3_5", q3: "track" } },
      { action: "quiz_completed", honeypot: "", answers: { ...completedAnswers, q3: "unknown" } },
      { action: "quiz_completed", honeypot: "", answers: completedAnswers, result: "rough_match" },
      { action: "view", honeypot: "", ad_variant: "unknown" },
      { action: "view", honeypot: "", variant: "a" },
    ]) {
      const response = await handler(request(body));
      expect(response.status).toBe(422);
      expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("never reflects arbitrary unknown key names into validation errors", async () => {
    const handler = createMarketingValidationHandler(dependencies());
    const sensitiveUnknownKeys = [
      "person@example.com",
      "turnstile-secret-token",
    ];
    const response = await handler(request({
      action: "quiz_started",
      honeypot: "",
      [sensitiveUnknownKeys[0]]: "x",
      [sensitiveUnknownKeys[1]]: "x",
    }));
    const text = await response.text();

    expect(response.status).toBe(422);
    for (const sensitive of sensitiveUnknownKeys) expect(text).not.toContain(sensitive);
    expect(JSON.parse(text).error.fields).toEqual([{ field: "body", reason: "unexpected" }]);
  });

  it.each(
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]
      .flatMap((field) => [1, true, { value: "x" }, ["x"]].map((value) => [field, value] as const)),
  )("rejects invalid %s types instead of normalizing them to null", (field, value) => {
    expect(parseMarketingValidationBody({ action: "view", honeypot: "", [field]: value }))
      .toEqual({
        ok: false,
        code: "VALIDATION_ERROR",
        fields: [{ field, reason: "invalid_type" }],
      });
  });

  it("rejects email, consent, and Turnstile fields on every anonymous action", async () => {
    const handler = createMarketingValidationHandler(dependencies());
    for (const action of ["view", "quiz_started", "quiz_completed", "result_viewed", "experience_started", "experience_completed", "beta_form_viewed"]) {
      const response = await handler(request({
        action, honeypot: "", email: "person@example.com", consent: true,
        turnstile_token: "secret", ...(action === "quiz_completed" ? { answers: completedAnswers } : {}),
      }, action !== "view"));
      expect(response.status).toBe(422);
    }
  });

  it("returns a Q3-derived result and explicit null target", async () => {
    const current = createSession({ quiz_started_at: NOW });
    const advanceSession = vi.fn(async () => createSession({
      quiz_started_at: NOW, quiz_completed_at: NOW,
      quiz_answers: completedAnswers, quiz_result: "ingredient-tracker", target_qualified: null,
    }));
    const handler = createMarketingValidationHandler(dependencies({
      readSession: vi.fn(async () => current), advanceSession,
    }));
    const response = await handler(request({ action: "quiz_completed", honeypot: "", answers: completedAnswers }));

    expect(await response.json()).toEqual({
      success: true,
      data: { stage: "quiz_completed", state: "quiz_completed", quiz_result: "ingredient-tracker", target_qualified: null },
      error: null,
    });
  });

  it("enforces one-step ordering and keeps anonymous stages independent of lead readiness", async () => {
    const current = createSession({ quiz_started_at: NOW, quiz_completed_at: NOW });
    const gate = vi.fn(async () => ({ ok: false, code: "LEAD_CAPTURE_NOT_READY", message: "closed" }));
    const advanceSession = vi.fn(async () => createSession({
      ...current, result_viewed_at: NOW,
    }));
    const handler = createMarketingValidationHandler(dependencies({
      readSession: vi.fn(async () => current), advanceSession, marketingLeadGate: gate,
    }));
    expect((await handler(request({ action: "experience_started", honeypot: "" }))).status).toBe(409);
    expect((await handler(request({ action: "result_viewed", honeypot: "" }))).status).toBe(200);
    expect(gate).not.toHaveBeenCalled();
  });

  it("writes lead PII only after beta form, using v2 consent and server time", async () => {
    const current = createSession({
      quiz_started_at: NOW, quiz_completed_at: NOW, result_viewed_at: NOW,
      experience_started_at: NOW, experience_completed_at: NOW, beta_form_viewed_at: NOW,
    });
    const advanceSession = vi.fn(async () => createSession({ ...current, lead_submitted_at: NOW, lead_submission_status: "accepted" }));
    const handler = createMarketingValidationHandler(dependencies({
      readSession: vi.fn(async () => current), advanceSession,
    }));
    const response = await handler(request({
      action: "lead_submitted", honeypot: "", email: " Person@Example.com ", consent: true, turnstile_token: "secret",
    }));

    expect(response.status).toBe(200);
    expect(advanceSession).toHaveBeenCalledWith(SESSION_ID, "lead_submitted", expect.objectContaining({
      lead: expect.objectContaining({
        email: "person@example.com", consent_version: "marketing-demand-validation-v2",
        consented_at: NOW, lead_submitted_at: NOW, turnstile_verified_at: NOW,
      }),
    }));
    expect(await response.text()).not.toMatch(/person@example|secret/i);
  });

  it("binds successful Turnstile verification to the exact request origin hostname", async () => {
    const current = createSession({
      quiz_started_at: NOW,
      quiz_completed_at: NOW,
      result_viewed_at: NOW,
      experience_started_at: NOW,
      experience_completed_at: NOW,
      beta_form_viewed_at: NOW,
    });
    const verifyTurnstile = vi.fn(async (
      token: string,
      allowedHostnames: readonly string[],
      expectedHostname?: string,
    ) => (
      token === "secret"
      && allowedHostnames.includes("beta-preview.mumeok.kr")
      && expectedHostname === "app.mumeok.kr"
        ? { ok: true as const, verified_at: NOW }
        : { ok: false as const, code: "TURNSTILE_FAILED" as const, message: "보안 확인에 실패했어요. 다시 시도해 주세요." }
    ));
    const handler = createMarketingValidationHandler(dependencies({
      readSession: vi.fn(async () => current),
      marketingLeadGate: vi.fn(async () => ({
        ok: true as const,
        allowedOrigins: [ORIGIN, "https://beta-preview.mumeok.kr"],
        allowedHostnames: ["app.mumeok.kr", "beta-preview.mumeok.kr"],
      })),
      verifyTurnstile,
      advanceSession: vi.fn(async () => createSession({
        ...current,
        lead_submitted_at: NOW,
        lead_submission_status: "accepted",
      })),
    }));

    const response = await handler(request({
      action: "lead_submitted",
      honeypot: "",
      email: "person@example.com",
      consent: true,
      turnstile_token: "secret",
    }));

    expect(response.status).toBe(200);
    expect(verifyTurnstile).toHaveBeenCalledWith(
      "secret",
      ["app.mumeok.kr", "beta-preview.mumeok.kr"],
      "app.mumeok.kr",
    );
  });

  it("returns byte-identical generic success for accepted, duplicate, and same-session replay", async () => {
    const current = createSession({
      quiz_started_at: NOW, quiz_completed_at: NOW, result_viewed_at: NOW,
      experience_started_at: NOW, experience_completed_at: NOW, beta_form_viewed_at: NOW,
    });
    const body = { action: "lead_submitted", honeypot: "", email: "person@example.com", consent: true, turnstile_token: "secret" };
    const accepted = createMarketingValidationHandler(dependencies({
      readSession: vi.fn(async () => current),
      advanceSession: vi.fn(async () => createSession({ ...current, lead_submitted_at: NOW, lead_submission_status: "accepted" })),
    }));
    const duplicate = createMarketingValidationHandler(dependencies({
      readSession: vi.fn(async () => current),
      advanceSession: vi.fn(async () => { throw Object.assign(new Error("duplicate"), { code: "MARKETING_EMAIL_DUPLICATE" }); }),
      markDuplicateLead: vi.fn(async () => createSession({ ...current, lead_submitted_at: NOW, lead_submission_status: "duplicate", email: null })),
    }));
    const verifyReplay = vi.fn();
    const replay = createMarketingValidationHandler(dependencies({
      readSession: vi.fn(async () => createSession({ ...current, lead_submitted_at: NOW, lead_submission_status: "accepted" })),
      verifyTurnstile: verifyReplay,
    }));

    const responses = await Promise.all([accepted(request(body)), duplicate(request(body)), replay(request(body))]);
    const texts = await Promise.all(responses.map((response) => response.text()));
    expect(new Set(texts).size).toBe(1);
    expect(verifyReplay).not.toHaveBeenCalled();
  });

  it("fails closed on origin, readiness, and Turnstile without leaking provider details", async () => {
    const current = createSession({
      quiz_started_at: NOW, quiz_completed_at: NOW, result_viewed_at: NOW,
      experience_started_at: NOW, experience_completed_at: NOW, beta_form_viewed_at: NOW,
    });
    const gate = createMarketingValidationHandler(dependencies({
      readSession: vi.fn(async () => current),
      marketingLeadGate: vi.fn(async () => ({ ok: false, code: "LEAD_CAPTURE_NOT_READY", message: "베타 신청은 아직 열리지 않았어요." })),
    }));
    const gateResponse = await gate(request({ action: "lead_submitted", honeypot: "", email: "person@example.com", consent: true, turnstile_token: "secret" }));
    expect(gateResponse.status).toBe(503);
    expect(await gateResponse.text()).not.toMatch(/person@example|secret/i);
  });

  it("rejects a Turnstile token solved for a different allowlisted preview hostname", async () => {
    vi.stubEnv("MARKETING_TURNSTILE_SECRET", "preview-secret");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      success: true,
      hostname: "beta-preview.mumeok.kr",
      action: "marketing_validation_lead_submit",
      challenge_ts: NOW,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const verifyTurnstile = createTurnstileVerifierFromEnv();
    const result = await verifyTurnstile(
      "secret",
      ["app.mumeok.kr", "beta-preview.mumeok.kr"],
      "app.mumeok.kr",
    );

    expect(result).toEqual({
      ok: false,
      code: "TURNSTILE_FAILED",
      message: "보안 확인에 실패했어요. 다시 시도해 주세요.",
    });
  });

  it("documents that Secure cookies follow request.url protocol, not the Origin header", async () => {
    const insertViewSession = vi.fn(async () => createSession());
    const handler = createMarketingValidationHandler(dependencies({ insertViewSession }));
    const response = await handler(requestAt(
      "http://127.0.0.1:3000/api/v1/marketing/validation",
      ORIGIN,
      { action: "view", honeypot: "" },
      false,
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).not.toContain("Secure");
  });
});
