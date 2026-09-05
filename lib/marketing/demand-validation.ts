import type {
  MarketingValidationAction,
  MarketingValidationAdVariant,
  MarketingValidationLegacyQuizAnswers,
  MarketingValidationLegacyQuizResult,
  MarketingValidationQuizAnswers,
  MarketingValidationQuizResult,
  MarketingValidationSessionRecord,
} from "@/types/marketing-validation";
import { MARKETING_VALIDATION_ACTIONS } from "@/types/marketing-validation";
import campaignContract from "@/lib/marketing/marketing-validation-campaign.json";

export { MARKETING_VALIDATION_ACTIONS } from "@/types/marketing-validation";

export const MARKETING_VALIDATION_COOKIE = "mumeok_validation_session";
export const MARKETING_VALIDATION_COOKIE_PATH = "/api/v1/marketing/validation";
export const MARKETING_VALIDATION_COOKIE_TTL_SECONDS = 60 * 60 * 24 * 7;
export const MARKETING_VALIDATION_MAX_BODY_BYTES = 16 * 1024;
export const MARKETING_VALIDATION_TURNSTILE_ACTION = "marketing_validation_lead_submit";
export const MARKETING_VALIDATION_CONSENT_VERSION = "marketing-demand-validation-v2";
export const MARKETING_VALIDATION_CAMPAIGN_END_AT = campaignContract.campaignEndAt;
export const MARKETING_VALIDATION_EDGE_EVIDENCE_DIGEST = campaignContract.edgeRateLimitEvidenceDigest;
export const MARKETING_VALIDATION_RETENTION_DAYS = campaignContract.retentionDays;
export const MARKETING_VALIDATION_TURNSTILE_SITE_KEY = campaignContract.turnstileSiteKey;
export const MARKETING_VALIDATION_CAMPAIGN_KEY = "weekly_nutrition_2026";
export const MARKETING_VALIDATION_CREATIVE_KEY = "mumeok_funnel_prototype_v2";
export const MARKETING_VALIDATION_AUDIENCE_KEY = "weekly_nutrition_beta_interest";
export const MARKETING_VALIDATION_MAX_UTM_LENGTH = 120;

export const QUIZ_Q1_OPTIONS = ["daily", "3_5", "1_2", "none"] as const;
export const QUIZ_Q2_OPTIONS = ["none", "1_2", "3_5", "6_plus"] as const;
export const QUIZ_Q3_OPTIONS = ["pass", "eyeball", "track", "measure"] as const;
export const QUIZ_Q4_OPTIONS = ["ingredients", "weight", "search", "none"] as const;
export const MARKETING_AD_VARIANTS = ["a", "b", "c", "d", "default"] as const;

// Stage 4 replaces these historical v1 screen-only exports. The v2 route parser never accepts them.
export const MARKETING_VALIDATION_LEGACY_ACTIONS = [
  "view", "quiz_started", "quiz_completed", "solution_viewed",
  "intent_selected", "lead_submitted", "followup_submitted",
] as const;
export const MARKETING_INTENT_CHOICES = ["needed", "enough"] as const;
export const FOLLOWUP_INTENT_OPTIONS = ["definitely", "maybe", "not_needed"] as const;
export const FOLLOWUP_PRIORITY_OPTIONS = [
  "daily_macros", "weekly_average", "meal_table", "plan_record_switch", "not_interested",
] as const;
export const QUIZ_Q5_OPTIONS = [
  "빠른 추정값이면 충분", "레시피 기준 자동 계산",
  "완성 무게·섭취량까지 반영한 정확한 계산", "아직 잘 모르겠음", "현재 방식으로 충분함",
] as const;
export const LEGACY_QUIZ_OPTIONS = {
  q1: ["관심이 없음", "해보려 했지만 시작하지 못함", "시작했지만 중단함", "가끔 기록 중", "꾸준히 기록 중"],
  q2: ["0일", "1일", "2~3일", "4~7일"],
  q3: ["재료를 하나씩 검색해 입력", "비슷한 완성 음식을 선택", "대략 계산", "저장한 레시피를 재사용", "집밥은 기록하지 않음"],
  q4: ["레시피에 있는 재료를 다시 입력할 때", "조리 후 무게와 내가 먹은 양을 계산할 때", "집밥과 완제품을 따로 기록할 때", "하루 합계와 주간 흐름을 한눈에 못 볼 때", "특별히 불편하지 않음"],
  q5: QUIZ_Q5_OPTIONS,
} as const;

const RESULT_BY_Q3: Record<MarketingValidationQuizAnswers["q3"], MarketingValidationQuizResult> = {
  pass: "homecook-passer",
  eyeball: "eyeballing-master",
  track: "ingredient-tracker",
  measure: "pro-measurer",
};

const VARIANT_BY_UTM_CONTENT: Record<string, MarketingValidationAdVariant> = {
  hook_reentry: "a",
  hook_cooked_weight: "b",
  hook_calorie_quiz: "c",
  hook_workaround: "d",
};

type StageTimestampColumn =
  | "viewed_at" | "quiz_started_at" | "quiz_completed_at" | "result_viewed_at"
  | "experience_started_at" | "experience_completed_at" | "beta_form_viewed_at" | "lead_submitted_at";

const TRANSITION_COLUMNS: Record<MarketingValidationAction, StageTimestampColumn> = {
  view: "viewed_at",
  quiz_started: "quiz_started_at",
  quiz_completed: "quiz_completed_at",
  result_viewed: "result_viewed_at",
  experience_started: "experience_started_at",
  experience_completed: "experience_completed_at",
  beta_form_viewed: "beta_form_viewed_at",
  lead_submitted: "lead_submitted_at",
};

export function isAllowedQuizAnswer<K extends keyof MarketingValidationQuizAnswers>(
  key: K,
  value: string,
): value is MarketingValidationQuizAnswers[K] {
  const options = {
    q1: QUIZ_Q1_OPTIONS,
    q2: QUIZ_Q2_OPTIONS,
    q3: QUIZ_Q3_OPTIONS,
    q4: QUIZ_Q4_OPTIONS,
  }[key] as readonly string[];
  return options.includes(value);
}

export function buildQuizOutcome(answers: MarketingValidationQuizAnswers): {
  quiz_result: MarketingValidationQuizResult;
  target_qualified: null;
} {
  return { quiz_result: RESULT_BY_Q3[answers.q3], target_qualified: null };
}

export function buildLegacyQuizOutcome(answers: MarketingValidationLegacyQuizAnswers): {
  quiz_result: MarketingValidationLegacyQuizResult;
  target_qualified: boolean;
} {
  const control = answers.q4 === "특별히 불편하지 않음" || answers.q5 === "현재 방식으로 충분함";
  const quiz_result: MarketingValidationLegacyQuizResult = control
    ? "satisfied_control"
    : answers.q4 === "하루 합계와 주간 흐름을 한눈에 못 볼 때"
      ? "weekly_blindspot"
      : answers.q4 === "집밥과 완제품을 따로 기록할 때"
        ? "split_tracking"
        : answers.q4 === "조리 후 무게와 내가 먹은 양을 계산할 때"
          || ["대략 계산", "비슷한 완성 음식을 선택", "집밥은 기록하지 않음"].includes(answers.q3)
          ? "rough_match"
          : "ingredient_reentry";
  return {
    quiz_result,
    target_qualified: !control
      && ["해보려 했지만 시작하지 못함", "시작했지만 중단함", "가끔 기록 중"].includes(answers.q1)
      && ["2~3일", "4~7일"].includes(answers.q2),
  };
}

export function resolveMarketingAdVariant(
  utmContent: string | null,
  candidate: MarketingValidationAdVariant | null,
): MarketingValidationAdVariant {
  return (utmContent ? VARIANT_BY_UTM_CONTENT[utmContent] : undefined) ?? candidate ?? "default";
}

export function readMarketingValidationState(
  session: Pick<MarketingValidationSessionRecord, StageTimestampColumn>,
): MarketingValidationAction {
  for (const action of [...MARKETING_VALIDATION_ACTIONS].reverse()) {
    if (session[TRANSITION_COLUMNS[action]]) return action;
  }
  return "view";
}

export function validateMarketingTransition(
  session: Pick<MarketingValidationSessionRecord, StageTimestampColumn>,
  action: MarketingValidationAction,
) {
  const currentIndex = MARKETING_VALIDATION_ACTIONS.indexOf(readMarketingValidationState(session));
  const requestedIndex = MARKETING_VALIDATION_ACTIONS.indexOf(action);
  if (requestedIndex === currentIndex) return { ok: true as const, mode: "replay" as const };
  if (requestedIndex === currentIndex + 1) return { ok: true as const, mode: "advance" as const };
  return { ok: false as const, code: "INVALID_TRANSITION" as const };
}

export function normalizeAllowedOrigins(raw: string) {
  const values = raw.split(",").map((value) => value.trim());
  if (values.some((value) => !value)) throw new Error("ALLOWED_MARKETING_ORIGINS 형식이 올바르지 않아요.");
  const unique = new Set<string>();
  for (const value of values) {
    if (!/^https?:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?$/u.test(value)) throw new Error("ALLOWED_MARKETING_ORIGINS 형식이 올바르지 않아요.");
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || url.hostname.endsWith(".") || url.origin !== value || unique.has(value)) {
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

export type MarketingAttributionStatus = "paid_allowlisted" | "organic" | "unverified";

export function classifyMarketingAttribution(
  input: MarketingAttributionInput,
  requestOrigin: string,
  paidOrigins: readonly string[],
): MarketingAttributionStatus {
  if (!Object.values(input).some((value) => value !== null)) return "organic";
  return input.utm_source === "meta"
    && input.utm_medium === "paid_social"
    && input.utm_campaign === MARKETING_VALIDATION_CAMPAIGN_KEY
    && paidOrigins.includes(requestOrigin)
    ? "paid_allowlisted"
    : "unverified";
}
