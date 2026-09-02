import { describe, expect, it } from "vitest";

import {
  buildQuizOutcome,
  MARKETING_VALIDATION_ACTIONS,
  resolveMarketingAdVariant,
  validateMarketingTransition,
} from "@/lib/marketing/demand-validation";

const answers = { q1: "daily", q2: "3_5", q3: "track", q4: "search" } as const;

type StageTimestamps = {
  viewed_at: string;
  quiz_started_at: string | null;
  quiz_completed_at: string | null;
  result_viewed_at: string | null;
  experience_started_at: string | null;
  experience_completed_at: string | null;
  beta_form_viewed_at: string | null;
  lead_submitted_at: string | null;
};

function sessionAt(state: (typeof MARKETING_VALIDATION_ACTIONS)[number]) {
  const row: StageTimestamps = {
    viewed_at: "2026-09-03T00:00:00.000Z",
    quiz_started_at: null,
    quiz_completed_at: null,
    result_viewed_at: null,
    experience_started_at: null,
    experience_completed_at: null,
    beta_form_viewed_at: null,
    lead_submitted_at: null,
  };
  const columns = {
    quiz_started: "quiz_started_at",
    quiz_completed: "quiz_completed_at",
    result_viewed: "result_viewed_at",
    experience_started: "experience_started_at",
    experience_completed: "experience_completed_at",
    beta_form_viewed: "beta_form_viewed_at",
    lead_submitted: "lead_submitted_at",
  } as const;
  for (const action of MARKETING_VALIDATION_ACTIONS.slice(1, MARKETING_VALIDATION_ACTIONS.indexOf(state) + 1)) {
    row[columns[action as keyof typeof columns]] = "2026-09-03T00:00:01.000Z";
  }
  return row;
}

describe("marketing demand validation v2 rules", () => {
  it("exposes only the approved v2 action sequence", () => {
    expect(MARKETING_VALIDATION_ACTIONS).toEqual([
      "view", "quiz_started", "quiz_completed", "result_viewed",
      "experience_started", "experience_completed", "beta_form_viewed", "lead_submitted",
    ]);
  });

  it.each([
    ["pass", "homecook-passer"],
    ["eyeball", "eyeballing-master"],
    ["track", "ingredient-tracker"],
    ["measure", "pro-measurer"],
  ] as const)("maps Q3 %s to %s with a null target", (q3, quizResult) => {
    expect(buildQuizOutcome({ ...answers, q3 })).toEqual({ quiz_result: quizResult, target_qualified: null });
  });

  it("does not let Q1, Q2, or Q4 influence the Q3 result", () => {
    expect(buildQuizOutcome({ q1: "none", q2: "none", q3: "track", q4: "none" }))
      .toEqual(buildQuizOutcome({ q1: "daily", q2: "6_plus", q3: "track", q4: "weight" }));
  });

  it.each([
    ["hook_reentry", "d", "a"], ["hook_cooked_weight", "a", "b"],
    ["hook_calorie_quiz", "b", "c"], ["hook_workaround", "c", "d"],
    ["unknown", "b", "b"], [null, "c", "c"],
    ["unknown", null, "default"], [null, null, "default"],
  ] as const)("resolves utm_content=%s candidate=%s to %s", (utmContent, candidate, expected) => {
    expect(resolveMarketingAdVariant(utmContent, candidate)).toBe(expected);
  });

  it("allows replay and one-step advance but rejects skip and reverse", () => {
    const resultViewed = sessionAt("result_viewed");
    expect(validateMarketingTransition(resultViewed, "result_viewed")).toEqual({ ok: true, mode: "replay" });
    expect(validateMarketingTransition(resultViewed, "experience_started")).toEqual({ ok: true, mode: "advance" });
    expect(validateMarketingTransition(resultViewed, "beta_form_viewed")).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(validateMarketingTransition(resultViewed, "quiz_completed")).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });
});
