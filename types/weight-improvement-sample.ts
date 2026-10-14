import type { WEIGHT_IMPROVEMENT_PURPOSE, WeightImprovementParticipation } from "@/types/weight-improvement-participation";

/** Draft server projection. Missing C01 facts stay null; they are not inferred from UI copy. */
export interface WeightImprovementSampleCandidate {
  subject: WeightImprovementParticipation["subject"];
  consent_revision: number;
  event_kind: "prediction" | "reported_measurement" | "manual_entry";
  input_source: "conditional_estimate" | "unavailable" | "reported_measured" | "manual_estimate" | "legacy_unknown";
  measurement_path: "completion" | "before_consumption" | null;
  cooked_at: string;
  observed_at: string;
  /** Computed by a future server reader from an approved retention rule; null until then. */
  expires_at: string | null;
  measured_g: number | null;
  original_revision: number;
  /** Source reader resolves revision applicability, rather than comparing a mutation's before/after revisions. */
  current_evidence_original_revision: number;
  source_current: boolean;
  already_selected: boolean;
  qa_record: boolean | null;
  whole_batch: boolean | null;
  before_consumption: boolean | null;
  container_excluded: boolean | null;
  schema_version: string | null;
  input_version: string | null;
  model_version: string | null;
  cooking_servings: number;
  rows: readonly {
    row_key: string;
    source_kind: "ingredient" | "food_product";
    source_id: string;
    source_version: string | null;
    quantity_origin: "planned" | "reported_actual" | "unknown";
    amount: number | null;
    unit: string | null;
    grams: number | null;
    conversion_confirmed: boolean;
    conversion_kind: "direct_mass" | "ingredient_conversion" | "product_relation" | null;
    conversion_version: string | null;
    conversion_quality: "exact" | "estimated" | null;
  }[];
  /** Confirmed condition stratum from C01/C04, never recipe text parsing. */
  condition: {
    method: "no_heat" | "pan_browning" | "boiling" | "soup" | "reheating" | "other";
    boundary: "entire_edible" | "drained_edible";
    drainage: "none" | "retained" | "drained" | "colander";
    added_media: "none" | "water" | "oil" | "water_and_oil";
    protocol: string;
  } | null;
}

export interface WeightImprovementSamplePolicy {
  document_version: string | null;
  document_hash: string | null;
  sample_retention_rule: string | null;
  evidence_retention_rule: string | null;
  quality_evaluation_plan: string | null;
  deletion_restore_validation: string | null;
  approved_condition_protocols: readonly string[] | null;
}

export interface WeightImprovementSampleFeatures {
  schema_version: string;
  input_version: string;
  model_version: string;
  cooking_servings: number;
  measured_g: number;
  rows: readonly {
    source_kind: "ingredient" | "food_product";
    source_id: string;
    source_version: string | null;
    amount: number;
    unit: string;
    grams: number;
    conversion_version: string | null;
    conversion_quality: "exact" | "estimated";
  }[];
  condition: NonNullable<WeightImprovementSampleCandidate["condition"]>;
}

export type WeightImprovementSampleReason =
  | "policy_pending" | "consent_not_current" | "subject_mismatch" | "stale_consent_revision"
  | "source_not_current" | "duplicate_source" | "not_reported_measurement" | "invalid_time"
  | "cook_before_consent" | "qa_or_unknown" | "measurement_boundary_unconfirmed"
  | "invalid_weight" | "metadata_pending" | "planned_or_unknown_input" | "quantity_unconfirmed"
  | "conditions_unconfirmed" | "retention_pending_or_expired"
  | "source_binding_invalid" | "source_binding_mismatch" | "private_feature_value";

/** Prospective reader input only; this type does not assert actual source authority. */
export interface WeightImprovementSampleSourceLineage {
  subject: WeightImprovementParticipation["subject"];
  purpose: typeof WEIGHT_IMPROVEMENT_PURPOSE;
  source_batch_id: string;
  source_evidence_id: string;
  original_revision: number;
}

/** Private deletion/trace link. Never pass this object to model features. */
export interface WeightImprovementSampleSourceBinding extends WeightImprovementSampleSourceLineage {
  sample_id: string;
  consent_revision: number;
  consent_document_version: string;
  consent_document_hash: string;
}

/** Evidence, consent revision and sample ID cannot create another independent batch. */
export type WeightImprovementSampleSourceAddress = Pick<WeightImprovementSampleSourceLineage,
  "subject" | "purpose" | "source_batch_id">;

export interface WeightImprovementSampleStorageDraft {
  features: WeightImprovementSampleFeatures;
  private_binding: WeightImprovementSampleSourceBinding;
}

export type WeightImprovementSampleInvalidationReason =
  | "withdrawal" | "source_invalidated" | "source_deleted" | "account_deleted";

export interface WeightImprovementSampleInvalidationAddress {
  reason: WeightImprovementSampleInvalidationReason;
  source_address: WeightImprovementSampleSourceAddress;
  private_binding: WeightImprovementSampleSourceBinding;
  completion_write_allowed: false;
  model_release_allowed: false;
}

export interface WeightImprovementCleanupProof {
  requested_revision: number;
  current_revision: number;
  verification_receipt: string | null;
  sample_rows_remaining: number | null;
  model_memberships_remaining: number | null;
  affected_models_blocked_or_recomputed: boolean | null;
  affected_caches_invalidated: boolean | null;
  queued_jobs_cancelled: boolean | null;
  account_generation_links_resolved: boolean | null;
  /** Exclusion itself needs a verified restore test, just like tombstone reapplication. */
  backup_strategy: "excluded" | "tombstones_on_restore" | null;
  backup_restore_verified: boolean | null;
  evidence_retention_rule: string | null;
  retry_error: boolean;
}
