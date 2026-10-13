import type { WeightImprovementCleanupProof, WeightImprovementSampleCandidate, WeightImprovementSamplePolicy } from "../../types/weight-improvement-sample";
import { PARTICIPATION_DOCUMENT, PARTICIPATION_OWNER, participationStatus } from "./weight-improvement-participation";

// These are fictitious future confirmations. Current C01 cannot produce this complete candidate.
export const SAMPLE_FIXTURE_POLICY: WeightImprovementSamplePolicy = {
  document_version: PARTICIPATION_DOCUMENT.version, document_hash: PARTICIPATION_DOCUMENT.hash,
  sample_retention_rule: "fixture-only: delete at test end",
  evidence_retention_rule: "fixture-only: delete at test end",
  quality_evaluation_plan: "fixture-only: independent held-out learning curve",
  deletion_restore_validation: "fixture-only: completed isolated restore exercise",
  approved_condition_protocols: ["fixture-protocol-v1"],
};
export function sampleParticipation() {
  return participationStatus({ decision: "opted_in", revision: 4, opted_in_at: "2026-10-14T00:00:00Z",
    consent_document_version: PARTICIPATION_DOCUMENT.version, consent_document_hash: PARTICIPATION_DOCUMENT.hash });
}
export function sampleCandidate(overrides: Partial<WeightImprovementSampleCandidate> = {}): WeightImprovementSampleCandidate {
  return { subject: { owner_uuid: PARTICIPATION_OWNER, account_generation: 3 }, consent_revision: 4,
    event_kind: "reported_measurement", input_source: "reported_measured", measurement_path: "completion",
    cooked_at: "2026-10-14T01:00:00Z", observed_at: "2026-10-14T01:01:00Z",
    expires_at: "2026-10-14T02:01:00Z", measured_g: 160,
    original_revision: 2, current_evidence_original_revision: 2, source_current: true, already_selected: false,
    qa_record: false, whole_batch: true, before_consumption: true, container_excluded: true,
    schema_version: "cooked-weight-evidence-v1", input_version: "snapshot-weight-v1", model_version: "bounded-weight-v1",
    cooking_servings: 2, rows: [{ row_key: "550e8400-e29b-41d4-a716-446655440011", source_kind: "ingredient",
      source_id: "550e8400-e29b-41d4-a716-446655440012", source_version: null, quantity_origin: "reported_actual",
      amount: 200, unit: "g", grams: 200, conversion_confirmed: true, conversion_kind: "direct_mass", conversion_version: null,
      conversion_quality: "exact" }],
    condition: { method: "pan_browning", boundary: "drained_edible", drainage: "colander", added_media: "none", protocol: "fixture-protocol-v1" },
    ...overrides };
}
export function cleanupProof(overrides: Partial<WeightImprovementCleanupProof> = {}): WeightImprovementCleanupProof {
  return { requested_revision: 5, current_revision: 5, verification_receipt: "fixture-only: isolated cleanup and restore proof",
    sample_rows_remaining: 0, model_memberships_remaining: 0, affected_models_blocked_or_recomputed: true,
    affected_caches_invalidated: true, queued_jobs_cancelled: true, account_generation_links_resolved: true,
    backup_strategy: "excluded", backup_restore_verified: true, evidence_retention_rule: "fixture-only: delete at test end",
    retry_error: false, ...overrides };
}
