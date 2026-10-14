export const WEIGHT_IMPROVEMENT_PURPOSE = "cooked_weight_estimation_improvement";
export type WeightImprovementDecision = "unanswered" | "declined" | "opted_in" | "withdrawn";
export type WeightImprovementCleanupStatus = "none" | "pending" | "retrying" | "completed";
export type WeightImprovementSurface = "mobile_web" | "mobile_pwa" | "settings_mobile" | "settings_desktop";

export interface WeightImprovementDocument {
  version: string;
  hash: string;
  notice_version: string;
  title: string;
  purpose: string;
  data_items: string[];
  excluded_items: string[];
  sample_retention: string;
  evidence_retention: string;
  withdrawal: string;
  personal_service: string;
  body: string;
}

export interface WeightImprovementParticipation {
  purpose: typeof WEIGHT_IMPROVEMENT_PURPOSE;
  subject: { owner_uuid: string; account_generation: number };
  decision: WeightImprovementDecision;
  revision: number;
  notice_seen_at: string | null;
  notice_version_seen: string | null;
  opted_in_at: string | null;
  withdrawn_at: string | null;
  consent_document_version: string | null;
  consent_document_hash: string | null;
  cleanup_status: WeightImprovementCleanupStatus;
  participation_enabled: boolean;
  collection_enabled: false;
  document: WeightImprovementDocument | null;
}

interface ParticipationMutationBase {
  /** Client-visible subject precondition; verified session remains the authority. */
  expected_subject: WeightImprovementParticipation["subject"];
  expected_revision: number;
  surface: WeightImprovementSurface;
}
export type WeightImprovementMutation =
  | (ParticipationMutationBase & { action: "notice_seen" | "decline" | "withdraw" })
  | (ParticipationMutationBase & {
    action: "opt_in";
    consent_checked: true;
    document_version: string;
    document_hash: string;
  });
