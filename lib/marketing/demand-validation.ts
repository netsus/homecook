import {
  type MarketingValidationAction,
  type MarketingValidationIntentChoice,
  type MarketingValidationPlannerIntent,
  type MarketingValidationPlannerPriority,
  type MarketingValidationQuizAnswers,
  type MarketingValidationQuizResult,
  type MarketingValidationSessionRecord,
} from "@/types/marketing-validation";

export {
  MARKETING_VALIDATION_ACTIONS,
} from "@/types/marketing-validation";

export const MARKETING_VALIDATION_COOKIE =
  "mumeok_validation_session";
export const MARKETING_VALIDATION_COOKIE_PATH =
  "/api/v1/marketing/validation";
export const MARKETING_VALIDATION_COOKIE_TTL_SECONDS =
  60 * 60 * 24 * 7;
export const MARKETING_VALIDATION_MAX_BODY_BYTES = 16 * 1024;
export const MARKETING_VALIDATION_TURNSTILE_ACTION =
  "marketing_validation_lead_submit";
export const MARKETING_VALIDATION_CONSENT_VERSION =
  "marketing-demand-validation-v1";
export const MARKETING_VALIDATION_CAMPAIGN_KEY =
  "weekly_nutrition_2026";
export const MARKETING_VALIDATION_CREATIVE_KEY =
  "weekly_nutrition_v2";
export const MARKETING_VALIDATION_AUDIENCE_KEY =
  "weekly_nutrition_beta_interest";
export const MARKETING_VALIDATION_MAX_UTM_LENGTH = 120;

export const QUIZ_Q1_OPTIONS = [
  "관심이 없음",
  "해보려 했지만 시작하지 못함",
  "시작했지만 중단함",
  "가끔 기록 중",
  "꾸준히 기록 중",
] as const;

export const QUIZ_Q2_OPTIONS = [
  "0일",
  "1일",
  "2~3일",
  "4~7일",
] as const;

export const QUIZ_Q3_OPTIONS = [
  "재료를 하나씩 검색해 입력",
  "비슷한 완성 음식을 선택",
  "대략 계산",
  "저장한 레시피를 재사용",
  "집밥은 기록하지 않음",
] as const;

export const QUIZ_Q4_OPTIONS = [
  "레시피에 있는 재료를 다시 입력할 때",
  "조리 후 무게와 내가 먹은 양을 계산할 때",
  "집밥과 완제품을 따로 기록할 때",
  "하루 합계와 주간 흐름을 한눈에 못 볼 때",
  "특별히 불편하지 않음",
] as const;

export const QUIZ_Q5_OPTIONS = [
  "빠른 추정값이면 충분",
  "레시피 기준 자동 계산",
  "완성 무게·섭취량까지 반영한 정확한 계산",
  "아직 잘 모르겠음",
  "현재 방식으로 충분함",
] as const;

export const MARKETING_INTENT_CHOICES: readonly MarketingValidationIntentChoice[] = [
  "needed",
  "enough",
] as const;

export const FOLLOWUP_INTENT_OPTIONS: readonly MarketingValidationPlannerIntent[] = [
  "definitely",
  "maybe",
  "not_needed",
] as const;

export const FOLLOWUP_PRIORITY_OPTIONS:
readonly MarketingValidationPlannerPriority[] = [
  "daily_macros",
  "weekly_average",
  "meal_table",
  "plan_record_switch",
  "not_interested",
] as const;

const QUALIFIED_Q1 = new Set([
  "해보려 했지만 시작하지 못함",
  "시작했지만 중단함",
  "가끔 기록 중",
]);

const QUALIFIED_Q2 = new Set([
  "2~3일",
  "4~7일",
]);

const PAIN_Q4 = new Set([
  "레시피에 있는 재료를 다시 입력할 때",
  "조리 후 무게와 내가 먹은 양을 계산할 때",
  "집밥과 완제품을 따로 기록할 때",
  "하루 합계와 주간 흐름을 한눈에 못 볼 때",
]);

const CONTROL_Q4 = "특별히 불편하지 않음";
const CONTROL_Q5 = "현재 방식으로 충분함";

const TRANSITION_ORDER: readonly MarketingValidationAction[] = [
  "view",
  "quiz_started",
  "quiz_completed",
  "solution_viewed",
  "intent_selected",
  "lead_submitted",
  "followup_submitted",
] as const;

export function isAllowedQuizAnswer(
  key: keyof MarketingValidationQuizAnswers,
  value: string,
) {
  switch (key) {
    case "q1":
      return (QUIZ_Q1_OPTIONS as readonly string[]).includes(value);
    case "q2":
      return (QUIZ_Q2_OPTIONS as readonly string[]).includes(value);
    case "q3":
      return (QUIZ_Q3_OPTIONS as readonly string[]).includes(value);
    case "q4":
      return (QUIZ_Q4_OPTIONS as readonly string[]).includes(value);
    case "q5":
      return (QUIZ_Q5_OPTIONS as readonly string[]).includes(value);
  }
}

export function buildQuizOutcome({
  q1,
  q2,
  q3,
  q4,
  q5,
}: MarketingValidationQuizAnswers): {
  quiz_result: MarketingValidationQuizResult;
  target_qualified: boolean;
} {
  if (q4 === CONTROL_Q4 || q5 === CONTROL_Q5) {
    return {
      quiz_result: "satisfied_control",
      target_qualified: false,
    };
  }

  let quizResult: MarketingValidationQuizResult;
  if (q4 === "하루 합계와 주간 흐름을 한눈에 못 볼 때") {
    quizResult = "weekly_blindspot";
  } else if (q4 === "집밥과 완제품을 따로 기록할 때") {
    quizResult = "split_tracking";
  } else if (
    q4 === "조리 후 무게와 내가 먹은 양을 계산할 때"
    || q3 === "대략 계산"
    || q3 === "비슷한 완성 음식을 선택"
    || q3 === "집밥은 기록하지 않음"
  ) {
    quizResult = "rough_match";
  } else {
    quizResult = "ingredient_reentry";
  }

  return {
    quiz_result: quizResult,
    target_qualified:
      QUALIFIED_Q1.has(q1)
      && QUALIFIED_Q2.has(q2)
      && PAIN_Q4.has(q4)
      && q5 !== CONTROL_Q5,
  };
}

export function readMarketingValidationState(
  session: Pick<
    MarketingValidationSessionRecord,
    | "viewed_at"
    | "quiz_started_at"
    | "quiz_completed_at"
    | "solution_viewed_at"
    | "intent_clicked_at"
    | "lead_submitted_at"
    | "followup_submitted_at"
  >,
): MarketingValidationAction {
  if (session.followup_submitted_at) return "followup_submitted";
  if (session.lead_submitted_at) return "lead_submitted";
  if (session.intent_clicked_at) return "intent_selected";
  if (session.solution_viewed_at) return "solution_viewed";
  if (session.quiz_completed_at) return "quiz_completed";
  if (session.quiz_started_at) return "quiz_started";
  return "view";
}

export function validateMarketingTransition(
  session: Pick<
    MarketingValidationSessionRecord,
    | "viewed_at"
    | "quiz_started_at"
    | "quiz_completed_at"
    | "solution_viewed_at"
    | "intent_clicked_at"
    | "lead_submitted_at"
    | "followup_submitted_at"
  >,
  action: MarketingValidationAction,
) {
  const currentState = readMarketingValidationState(session);
  const currentIndex = TRANSITION_ORDER.indexOf(currentState);
  const requestedIndex = TRANSITION_ORDER.indexOf(action);

  if (requestedIndex === currentIndex) {
    return { ok: true as const, mode: "replay" as const };
  }
  if (requestedIndex === currentIndex + 1) {
    return { ok: true as const, mode: "advance" as const };
  }
  return { ok: false as const, code: "INVALID_TRANSITION" as const };
}

export function normalizeAllowedOrigins(raw: string) {
  const fragments = raw.split(",");
  const values: string[] = [];
  for (const fragment of fragments) {
    const trimmed = fragment.trim();
    if (!trimmed) {
      throw new Error("ALLOWED_MARKETING_ORIGINS 형식이 올바르지 않아요.");
    }
    values.push(trimmed);
  }

  const unique = new Set<string>();
  for (const value of values) {
    if (!/^https?:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?$/u.test(value)) {
      throw new Error("ALLOWED_MARKETING_ORIGINS 형식이 올바르지 않아요.");
    }

    const url = new URL(value);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
      throw new Error("ALLOWED_MARKETING_ORIGINS 형식이 올바르지 않아요.");
    }
    if (url.hostname.endsWith(".")) {
      throw new Error("ALLOWED_MARKETING_ORIGINS 형식이 올바르지 않아요.");
    }
    if (url.origin !== value) {
      throw new Error("ALLOWED_MARKETING_ORIGINS 형식이 올바르지 않아요.");
    }

    if (unique.has(value)) {
      throw new Error("ALLOWED_MARKETING_ORIGINS 형식이 올바르지 않아요.");
    }
    unique.add(value);
  }

  return [...unique].sort();
}

interface MarketingAttributionInput {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
}

export type MarketingAttributionStatus =
  | "paid_allowlisted"
  | "organic"
  | "unverified";

export function classifyMarketingAttribution(
  input: MarketingAttributionInput,
  requestOrigin: string,
  paidOrigins: readonly string[],
): MarketingAttributionStatus {
  const hasAnyUtm = Object.values(input).some((value) => value !== null);
  if (!hasAnyUtm) {
    return "organic";
  }

  const exactPaidMeta =
    input.utm_source === "meta"
    && input.utm_medium === "paid_social"
    && input.utm_campaign === MARKETING_VALIDATION_CAMPAIGN_KEY
    && input.utm_content === MARKETING_VALIDATION_CREATIVE_KEY
    && paidOrigins.includes(requestOrigin);

  return exactPaidMeta ? "paid_allowlisted" : "unverified";
}
