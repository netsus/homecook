import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildQuizOutcome,
  classifyMarketingAttribution,
  normalizeAllowedOrigins,
  validateMarketingTransition,
} from "@/lib/marketing/demand-validation";
import {
  createMarketingLeadGateFromEnv,
  createTurnstileVerifierFromEnv,
  parseMarketingValidationBody,
} from "@/lib/server/marketing-validation";

describe("marketing demand validation shared rules", () => {
  it("recomputes the target-qualified weekly blindspot result on the server", () => {
    const outcome = buildQuizOutcome({
      q1: "시작했지만 중단함",
      q2: "2~3일",
      q3: "재료를 하나씩 검색해 입력",
      q4: "하루 합계와 주간 흐름을 한눈에 못 볼 때",
      q5: "레시피 기준 자동 계산",
    });

    expect(outcome).toEqual({
      quiz_result: "weekly_blindspot",
      target_qualified: true,
    });
  });

  it.each([
    {
      name: "q1 no interest",
      answers: {
        q1: "관심이 없음",
        q2: "2~3일",
        q3: "재료를 하나씩 검색해 입력",
        q4: "집밥과 완제품을 따로 기록할 때",
        q5: "레시피 기준 자동 계산",
      },
    },
    {
      name: "q1 already consistent",
      answers: {
        q1: "꾸준히 기록 중",
        q2: "2~3일",
        q3: "재료를 하나씩 검색해 입력",
        q4: "집밥과 완제품을 따로 기록할 때",
        q5: "레시피 기준 자동 계산",
      },
    },
    {
      name: "q2 zero days",
      answers: {
        q1: "시작했지만 중단함",
        q2: "0일",
        q3: "재료를 하나씩 검색해 입력",
        q4: "집밥과 완제품을 따로 기록할 때",
        q5: "레시피 기준 자동 계산",
      },
    },
    {
      name: "q2 one day",
      answers: {
        q1: "시작했지만 중단함",
        q2: "1일",
        q3: "재료를 하나씩 검색해 입력",
        q4: "집밥과 완제품을 따로 기록할 때",
        q5: "레시피 기준 자동 계산",
      },
    },
    {
      name: "q4 no pain",
      answers: {
        q1: "시작했지만 중단함",
        q2: "2~3일",
        q3: "재료를 하나씩 검색해 입력",
        q4: "특별히 불편하지 않음",
        q5: "레시피 기준 자동 계산",
      },
    },
    {
      name: "q5 current method enough",
      answers: {
        q1: "시작했지만 중단함",
        q2: "2~3일",
        q3: "재료를 하나씩 검색해 입력",
        q4: "집밥과 완제품을 따로 기록할 때",
        q5: "현재 방식으로 충분함",
      },
    },
  ])("keeps target_qualified false on boundary: $name", ({ answers }) => {
    expect(buildQuizOutcome(answers).target_qualified).toBe(false);
  });

  it("keeps the satisfied control precedence when q5 says the current method is sufficient", () => {
    const outcome = buildQuizOutcome({
      q1: "가끔 기록 중",
      q2: "4~7일",
      q3: "저장한 레시피를 재사용",
      q4: "집밥과 완제품을 따로 기록할 때",
      q5: "현재 방식으로 충분함",
    });

    expect(outcome).toEqual({
      quiz_result: "satisfied_control",
      target_qualified: false,
    });
  });

  it("accepts same-action replay but rejects skipped and retrograde transitions", () => {
    const session = {
      viewed_at: "2026-08-31T00:00:00.000Z",
      quiz_started_at: "2026-08-31T00:00:05.000Z",
      quiz_completed_at: null,
      solution_viewed_at: null,
      intent_choice: null,
      intent_clicked_at: null,
      lead_submitted_at: null,
      lead_submission_status: "none" as const,
      followup_submitted_at: null,
    };

    expect(validateMarketingTransition(session, "quiz_started")).toEqual({
      ok: true,
      mode: "replay",
    });
    expect(validateMarketingTransition(session, "quiz_completed")).toEqual({
      ok: true,
      mode: "advance",
    });
    expect(validateMarketingTransition(session, "solution_viewed")).toEqual({
      ok: false,
      code: "INVALID_TRANSITION",
    });
    expect(validateMarketingTransition(session, "view")).toEqual({
      ok: false,
      code: "INVALID_TRANSITION",
    });
  });

  it("rejects client-supplied session ids, payload drift, and oversized request bodies", () => {
    expect(parseMarketingValidationBody({
      action: "quiz_started",
      honeypot: "",
      session_id: "550e8400-e29b-41d4-a716-446655440000",
    })).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [{ field: "session_id", reason: "unexpected" }],
    });

    expect(parseMarketingValidationBody({
      action: "lead_submitted",
      honeypot: "",
      email: "user@example.com",
      consent: true,
      turnstile_token: "token",
      planner_intent: "definitely",
    })).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [{ field: "planner_intent", reason: "unexpected" }],
    });

    expect(parseMarketingValidationBody({
      action: "quiz_completed",
      honeypot: "",
      answers: {
        q1: "시작했지만 중단함",
        q2: "2~3일",
        q3: "재료를 하나씩 검색해 입력",
        q4: "하루 합계와 주간 흐름을 한눈에 못 볼 때",
        q5: "레시피 기준 자동 계산",
      },
    }, {
      bodyBytes: 16 * 1024 + 1,
    })).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [{ field: "body", reason: "too_large" }],
    });
  });

  it("normalizes only exact origins and fails closed for malformed allowlist entries", () => {
    expect(normalizeAllowedOrigins("https://app.mumeok.kr, http://localhost:3100"))
      .toEqual(["http://localhost:3100", "https://app.mumeok.kr"]);

    expect(() => normalizeAllowedOrigins("https://user:pass@app.mumeok.kr"))
      .toThrow(/ALLOWED_MARKETING_ORIGINS/iu);
    expect(() => normalizeAllowedOrigins("https://app.mumeok.kr./path"))
      .toThrow(/ALLOWED_MARKETING_ORIGINS/iu);
    expect(() => normalizeAllowedOrigins("https://app%2emumeok.kr"))
      .toThrow(/ALLOWED_MARKETING_ORIGINS/iu);
    expect(() => normalizeAllowedOrigins("https://app.mumeok.kr,"))
      .toThrow(/ALLOWED_MARKETING_ORIGINS/iu);
    expect(() => normalizeAllowedOrigins(
      "https://app.mumeok.kr,https://app.mumeok.kr",
    )).toThrow(/ALLOWED_MARKETING_ORIGINS/iu);
  });

  it("classifies only the locked paid campaign and preserves organic/unverified cohorts", () => {
    const paidInput = {
      utm_source: "meta",
      utm_medium: "paid_social",
      utm_campaign: "weekly_nutrition_2026",
      utm_content: "weekly_nutrition_v2",
      utm_term: null,
    };

    expect(classifyMarketingAttribution(
      paidInput,
      "https://app.mumeok.kr",
      ["https://app.mumeok.kr"],
    )).toBe("paid_allowlisted");
    expect(classifyMarketingAttribution(
      {
        utm_source: null,
        utm_medium: null,
        utm_campaign: null,
        utm_content: null,
        utm_term: null,
      },
      "http://localhost:3100",
      [],
    )).toBe("organic");
    expect(classifyMarketingAttribution(
      paidInput,
      "https://preview.mumeok.kr",
      ["https://app.mumeok.kr"],
    )).toBe("unverified");
    expect(classifyMarketingAttribution(
      { ...paidInput, utm_campaign: "client-overwrite" },
      "https://app.mumeok.kr",
      ["https://app.mumeok.kr"],
    )).toBe("unverified");
  });

  it("rejects UTM values beyond the documented 120-character limit", () => {
    expect(parseMarketingValidationBody({
      action: "view",
      honeypot: "",
      utm_source: "x".repeat(121),
    })).toEqual({
      ok: false,
      code: "VALIDATION_ERROR",
      fields: [{ field: "utm_source", reason: "too_long" }],
    });
  });

  it("allows either or both optional followup answers to be skipped", () => {
    expect(parseMarketingValidationBody({
      action: "followup_submitted",
      honeypot: "",
    })).toEqual({
      ok: true,
      value: {
        action: "followup_submitted",
        honeypot: "",
        planner_intent: null,
        planner_priority: null,
      },
    });
  });
});

describe("marketing demand validation lead gates", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fails closed when readiness inputs are missing", async () => {
    vi.stubEnv("MARKETING_LEAD_PROTECTION_READY", "1");
    const gate = createMarketingLeadGateFromEnv();

    await expect(gate()).resolves.toEqual({
      ok: false,
      code: "LEAD_CAPTURE_NOT_READY",
      message: "베타 신청은 아직 열리지 않았어요.",
    });
  });

  it("requires exact allowed origins and explicit Turnstile hostnames", async () => {
    vi.stubEnv("MARKETING_LEAD_PROTECTION_READY", "1");
    vi.stubEnv(
      "ALLOWED_MARKETING_ORIGINS",
      "https://app.mumeok.kr, http://localhost:3100",
    );
    vi.stubEnv("MARKETING_TURNSTILE_SECRET", "secret-value");
    vi.stubEnv("MARKETING_TURNSTILE_ALLOWED_HOSTNAMES", "app.mumeok.kr,localhost");
    vi.stubEnv("MARKETING_EDGE_RATE_LIMIT_RULE_EVIDENCE", "cf-rule-2026-08-31");

    const gate = createMarketingLeadGateFromEnv();

    await expect(gate()).resolves.toEqual({
      ok: true,
      allowedOrigins: ["http://localhost:3100", "https://app.mumeok.kr"],
      allowedHostnames: ["app.mumeok.kr", "localhost"],
    });
  });

  it("rejects malformed, provider-failed, hostname-mismatched, and action-mismatched turnstile results", async () => {
    vi.stubEnv("MARKETING_TURNSTILE_SECRET", "secret-value");
    const verifier = createTurnstileVerifierFromEnv();
    const stubFetch = (payload: unknown, ok = true) =>
      vi.fn(async () => ({
        ok,
        json: async () => payload,
      })) as unknown as typeof fetch;

    vi.stubGlobal("fetch", stubFetch({}));
    await expect(verifier("token", ["app.mumeok.kr"])).resolves.toEqual({
      ok: false,
      code: "TURNSTILE_FAILED",
      message: "보안 확인에 실패했어요. 다시 시도해 주세요.",
    });

    vi.stubGlobal("fetch", stubFetch({ success: false, hostname: "app.mumeok.kr" }));
    await expect(verifier("token", ["app.mumeok.kr"])).resolves.toEqual({
      ok: false,
      code: "TURNSTILE_FAILED",
      message: "보안 확인에 실패했어요. 다시 시도해 주세요.",
    });

    vi.stubGlobal("fetch", stubFetch({
      success: true,
      hostname: "evil.example",
      action: "marketing_validation_lead_submit",
    }));
    await expect(verifier("token", ["app.mumeok.kr"])).resolves.toEqual({
      ok: false,
      code: "TURNSTILE_FAILED",
      message: "보안 확인에 실패했어요. 다시 시도해 주세요.",
    });

    vi.stubGlobal("fetch", stubFetch({
      success: true,
      hostname: "app.mumeok.kr",
      action: "wrong-action",
    }));
    await expect(verifier("token", ["app.mumeok.kr"])).resolves.toEqual({
      ok: false,
      code: "TURNSTILE_FAILED",
      message: "보안 확인에 실패했어요. 다시 시도해 주세요.",
    });

    vi.stubGlobal("fetch", stubFetch({
      success: true,
      hostname: "app.mumeok.kr",
      action: "marketing_validation_lead_submit",
    }, false));
    await expect(verifier("token", ["app.mumeok.kr"])).resolves.toEqual({
      ok: false,
      code: "TURNSTILE_FAILED",
      message: "보안 확인에 실패했어요. 다시 시도해 주세요.",
    });
  });
});
