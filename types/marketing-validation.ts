export const MARKETING_VALIDATION_ACTIONS = [
  "view",
  "quiz_started",
  "quiz_completed",
  "result_viewed",
  "experience_started",
  "experience_completed",
  "beta_form_viewed",
  "lead_submitted",
] as const;

export type MarketingValidationAction = (typeof MARKETING_VALIDATION_ACTIONS)[number];
export type MarketingValidationAdVariant = "a" | "b" | "c" | "d" | "default";
export type MarketingValidationQuizResult =
  | "homecook-passer"
  | "eyeballing-master"
  | "ingredient-tracker"
  | "pro-measurer";
export type MarketingValidationLegacyQuizResult =
  | "ingredient_reentry"
  | "rough_match"
  | "split_tracking"
  | "weekly_blindspot"
  | "satisfied_control";
export type MarketingValidationLegacyAction =
  | "view" | "quiz_started" | "quiz_completed" | "solution_viewed"
  | "intent_selected" | "lead_submitted" | "followup_submitted";
export type MarketingValidationIntentChoice = "needed" | "enough";
export type MarketingValidationPlannerIntent = "definitely" | "maybe" | "not_needed";
export type MarketingValidationPlannerPriority =
  | "daily_macros" | "weekly_average" | "meal_table" | "plan_record_switch" | "not_interested";
export type MarketingValidationLeadSubmissionStatus = "none" | "accepted" | "duplicate";

export interface MarketingValidationQuizAnswers {
  q1: "daily" | "3_5" | "1_2" | "none";
  q2: "none" | "1_2" | "3_5" | "6_plus";
  q3: "pass" | "eyeball" | "track" | "measure";
  q4: "ingredients" | "weight" | "search" | "none";
}

/** Temporary compile-only shape for the historical v1 screen until Stage 4 replaces it. */
export interface MarketingValidationLegacyQuizAnswers {
  q1: string;
  q2: string;
  q3: string;
  q4: string;
  q5: string;
}

export type MarketingValidationLegacyRequestBody =
  | { action: "view"; honeypot: ""; utm_campaign?: string | null; utm_content?: string | null; utm_medium?: string | null; utm_source?: string | null; utm_term?: string | null }
  | { action: "quiz_started" | "solution_viewed"; honeypot: "" }
  | { action: "quiz_completed"; answers: MarketingValidationLegacyQuizAnswers; honeypot: "" }
  | { action: "intent_selected"; honeypot: ""; intent_choice: MarketingValidationIntentChoice }
  | { action: "lead_submitted"; consent: true; email: string; honeypot: ""; turnstile_token: string }
  | { action: "followup_submitted"; honeypot: ""; planner_intent?: MarketingValidationPlannerIntent | null; planner_priority?: MarketingValidationPlannerPriority | null };

export type MarketingValidationRequestBody =
  | {
      action: "view";
      honeypot: "";
      utm_campaign?: string | null;
      utm_content?: string | null;
      utm_medium?: string | null;
      utm_source?: string | null;
      utm_term?: string | null;
      ad_variant?: MarketingValidationAdVariant | null;
    }
  | { action: "quiz_started" | "result_viewed" | "experience_started" | "experience_completed" | "beta_form_viewed"; honeypot: "" }
  | { action: "quiz_completed"; answers: MarketingValidationQuizAnswers; honeypot: "" }
  | { action: "lead_submitted"; consent: true; email: string; honeypot: ""; turnstile_token: string };

export interface MarketingValidationDbError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export interface MarketingValidationSessionRecord {
  id: string;
  campaign_key?: string;
  creative_key?: string;
  audience_key?: string;
  ad_variant?: MarketingValidationAdVariant | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  attribution_status?: string | null;
  viewed_at: string;
  quiz_started_at: string | null;
  quiz_completed_at: string | null;
  result_viewed_at: string | null;
  experience_started_at: string | null;
  experience_completed_at: string | null;
  beta_form_viewed_at: string | null;
  quiz_result: MarketingValidationQuizResult | MarketingValidationLegacyQuizResult | null;
  quiz_answers: MarketingValidationQuizAnswers | Record<string, string> | null;
  target_qualified: boolean | null;
  email?: string | null;
  consent_version?: string | null;
  consented_at?: string | null;
  turnstile_verified_at?: string | null;
  lead_submitted_at: string | null;
  lead_submission_status: MarketingValidationLeadSubmissionStatus;
  retention_until?: string;
  created_at?: string;
  updated_at?: string;
  solution_viewed_at: string | null;
  intent_choice: "needed" | "enough" | null;
  intent_clicked_at: string | null;
  planner_intent: "definitely" | "maybe" | "not_needed" | null;
  planner_priority: "daily_macros" | "weekly_average" | "meal_table" | "plan_record_switch" | "not_interested" | null;
  followup_submitted_at: string | null;
}

export interface MarketingValidationResponseData {
  stage: MarketingValidationAction;
  state: MarketingValidationAction;
  quiz_result?: MarketingValidationQuizResult;
  target_qualified?: null;
}

export interface MarketingValidationLegacyResponseData {
  stage: MarketingValidationLegacyAction;
  state: MarketingValidationLegacyAction;
  quiz_result?: MarketingValidationLegacyQuizResult;
  target_qualified?: boolean;
}

export interface MarketingValidationPersistenceClient {
  from(table: "marketing_validation_sessions"): {
    select(columns: string): { eq(column: string, value: unknown): { maybeSingle(): PromiseLike<{ data: MarketingValidationSessionRecord | null; error: MarketingValidationDbError | null }> } };
    insert(payload: Record<string, unknown>): { select(columns: string): { single(): PromiseLike<{ data: MarketingValidationSessionRecord | null; error: MarketingValidationDbError | null }> } };
    update(payload: Record<string, unknown>): { eq(column: string, value: unknown): { is(column: string, value: null): { select(columns: string): { maybeSingle(): PromiseLike<{ data: MarketingValidationSessionRecord | null; error: MarketingValidationDbError | null }> } } } };
  };
}
