export const MARKETING_VALIDATION_ACTIONS = [
  "view",
  "quiz_started",
  "quiz_completed",
  "solution_viewed",
  "intent_selected",
  "lead_submitted",
  "followup_submitted",
] as const;

export type MarketingValidationAction =
  (typeof MARKETING_VALIDATION_ACTIONS)[number];

export type MarketingValidationQuizResult =
  | "ingredient_reentry"
  | "rough_match"
  | "split_tracking"
  | "weekly_blindspot"
  | "satisfied_control";

export type MarketingValidationIntentChoice = "needed" | "enough";

export type MarketingValidationLeadSubmissionStatus =
  | "none"
  | "accepted"
  | "duplicate";

export type MarketingValidationPlannerIntent =
  | "definitely"
  | "maybe"
  | "not_needed";

export type MarketingValidationPlannerPriority =
  | "daily_macros"
  | "weekly_average"
  | "meal_table"
  | "plan_record_switch"
  | "not_interested";

export type MarketingValidationRequestBody =
  | {
      action: "view";
      honeypot: "";
      utm_campaign?: string | null;
      utm_content?: string | null;
      utm_medium?: string | null;
      utm_source?: string | null;
      utm_term?: string | null;
    }
  | {
      action: "quiz_started" | "solution_viewed";
      honeypot: "";
    }
  | {
      action: "quiz_completed";
      answers: MarketingValidationQuizAnswers;
      honeypot: "";
    }
  | {
      action: "intent_selected";
      honeypot: "";
      intent_choice: MarketingValidationIntentChoice;
    }
  | {
      action: "lead_submitted";
      consent: true;
      email: string;
      honeypot: "";
      turnstile_token: string;
    }
  | {
      action: "followup_submitted";
      honeypot: "";
      planner_intent?: MarketingValidationPlannerIntent | null;
      planner_priority?: MarketingValidationPlannerPriority | null;
    };

export interface MarketingValidationQuizAnswers {
  q1: string;
  q2: string;
  q3: string;
  q4: string;
  q5: string;
}

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
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
  utm_term?: string | null;
  attribution_status?: string | null;
  viewed_at: string;
  quiz_started_at: string | null;
  quiz_completed_at: string | null;
  solution_viewed_at: string | null;
  intent_choice: MarketingValidationIntentChoice | null;
  intent_clicked_at: string | null;
  quiz_result: MarketingValidationQuizResult | null;
  quiz_answers: MarketingValidationQuizAnswers | null;
  target_qualified: boolean | null;
  email?: string | null;
  consent_version?: string | null;
  consented_at?: string | null;
  turnstile_verified_at?: string | null;
  lead_submitted_at: string | null;
  lead_submission_status: MarketingValidationLeadSubmissionStatus;
  planner_intent: MarketingValidationPlannerIntent | null;
  planner_priority: MarketingValidationPlannerPriority | null;
  followup_submitted_at: string | null;
  retention_until?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MarketingValidationResponseData {
  stage: MarketingValidationAction;
  state: MarketingValidationAction;
  quiz_result?: MarketingValidationQuizResult;
  target_qualified?: boolean;
}

export interface MarketingValidationPersistenceClient {
  from(table: "marketing_validation_sessions"): {
    select(columns: string): {
      eq(column: string, value: unknown): {
        maybeSingle(): PromiseLike<{
          data: MarketingValidationSessionRecord | null;
          error: MarketingValidationDbError | null;
        }>;
      };
    };
    insert(payload: Record<string, unknown>): {
      select(columns: string): {
        single(): PromiseLike<{
          data: MarketingValidationSessionRecord | null;
          error: MarketingValidationDbError | null;
        }>;
      };
    };
    update(payload: Record<string, unknown>): {
      eq(column: string, value: unknown): {
        is(column: string, value: null): {
          select(columns: string): {
            maybeSingle(): PromiseLike<{
              data: MarketingValidationSessionRecord | null;
              error: MarketingValidationDbError | null;
            }>;
          };
        };
      };
    };
  };
}
