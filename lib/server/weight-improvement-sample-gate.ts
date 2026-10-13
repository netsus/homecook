import { hasCurrentWeightImprovementConsent } from "@/lib/weight-improvement-participation";
import type { WeightImprovementParticipation } from "@/types/weight-improvement-participation";
import type {
  WeightImprovementCleanupProof, WeightImprovementSampleCandidate, WeightImprovementSampleFeatures,
  WeightImprovementSamplePolicy, WeightImprovementSampleReason,
} from "@/types/weight-improvement-sample";

/** No environment switch, collector, RPC or model writer consumes this local draft. */
export const WEIGHT_IMPROVEMENT_SAMPLE_POLICY: Readonly<WeightImprovementSamplePolicy> = Object.freeze({
  document_version: null, document_hash: null, sample_retention_rule: null,
  evidence_retention_rule: null, quality_evaluation_plan: null, deletion_restore_validation: null,
  approved_condition_protocols: null,
});

/** The current C01 source does not persist these confirmations. */
export const CURRENT_C01_MEASUREMENT_CONFIRMATIONS = Object.freeze({
  qa_record: null, whole_batch: null, before_consumption: null, container_excluded: null,
});

function text(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}
function positive(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}
type ConfirmedSampleRow = WeightImprovementSampleCandidate["rows"][number]
  & { amount: number; grams: number; unit: string; conversion_quality: "exact" | "estimated" };
function confirmedQuantity(row: WeightImprovementSampleCandidate["rows"][number]): row is ConfirmedSampleRow {
  if (!text(row.row_key) || !text(row.source_id) || !positive(row.amount) || !positive(row.grams)
    || !text(row.unit) || !row.conversion_confirmed || row.conversion_quality === null) return false;
  if (row.source_kind === "food_product" && !text(row.source_version)) return false;
  if (row.conversion_kind === "direct_mass") {
    if (row.unit !== "g" && row.unit !== "kg") return false;
    const expected = row.amount * (row.unit === "kg" ? 1000 : 1);
    return Math.abs(row.grams - expected) <= Number.EPSILON * Math.max(1, expected) * 8;
  }
  return text(row.conversion_version) && (row.source_kind === "food_product"
    ? row.conversion_kind === "product_relation" && row.conversion_version === row.source_version
    : row.conversion_kind === "ingredient_conversion");
}

/** Evaluates prospective facts only. Even a complete fixture never authorizes a write. */
export function assessWeightImprovementSample({ participation, candidate, policy = WEIGHT_IMPROVEMENT_SAMPLE_POLICY, now }: {
  participation: WeightImprovementParticipation;
  candidate: WeightImprovementSampleCandidate;
  policy?: Readonly<WeightImprovementSamplePolicy>;
  now: string;
}): { reasons: WeightImprovementSampleReason[]; features: WeightImprovementSampleFeatures | null; collection_allowed: false } {
  const reasons: WeightImprovementSampleReason[] = [];
  if (![policy.document_version, policy.document_hash, policy.sample_retention_rule, policy.evidence_retention_rule,
    policy.quality_evaluation_plan, policy.deletion_restore_validation].every(text)
    || policy.approved_condition_protocols === null || policy.approved_condition_protocols.length === 0
    || !policy.approved_condition_protocols.every(text)) reasons.push("policy_pending");
  if (!participation.participation_enabled || !hasCurrentWeightImprovementConsent(participation)
    || participation.consent_document_version !== policy.document_version
    || participation.consent_document_hash !== policy.document_hash) reasons.push("consent_not_current");
  if (participation.subject.owner_uuid !== candidate.subject.owner_uuid
    || participation.subject.account_generation !== candidate.subject.account_generation) reasons.push("subject_mismatch");
  if (candidate.consent_revision !== participation.revision) reasons.push("stale_consent_revision");
  if (!candidate.source_current || !Number.isSafeInteger(candidate.original_revision) || candidate.original_revision < 0
    || candidate.original_revision !== candidate.current_evidence_original_revision) reasons.push("source_not_current");
  if (candidate.already_selected) reasons.push("duplicate_source");
  if (candidate.event_kind !== "reported_measurement" || candidate.input_source !== "reported_measured"
    || (candidate.measurement_path !== "completion" && candidate.measurement_path !== "before_consumption")) reasons.push("not_reported_measurement");
  const cookedAt = Date.parse(candidate.cooked_at);
  const observedAt = Date.parse(candidate.observed_at);
  const optedAt = participation.opted_in_at === null ? NaN : Date.parse(participation.opted_in_at);
  const evaluatedAt = Date.parse(now);
  const expiresAt = candidate.expires_at === null ? NaN : Date.parse(candidate.expires_at);
  if (![cookedAt, observedAt, optedAt, evaluatedAt].every(Number.isFinite)
    || observedAt < cookedAt || observedAt > evaluatedAt) reasons.push("invalid_time");
  else if (cookedAt <= optedAt) reasons.push("cook_before_consent");
  if (!Number.isFinite(expiresAt) || !Number.isFinite(evaluatedAt) || expiresAt <= evaluatedAt) reasons.push("retention_pending_or_expired");
  if (candidate.qa_record !== false) reasons.push("qa_or_unknown");
  if (candidate.whole_batch !== true || candidate.before_consumption !== true
    || candidate.container_excluded !== true) reasons.push("measurement_boundary_unconfirmed");
  if (!positive(candidate.measured_g) || !Number.isSafeInteger(candidate.cooking_servings)
    || candidate.cooking_servings <= 0) reasons.push("invalid_weight");
  if (!text(candidate.schema_version) || !text(candidate.input_version) || !text(candidate.model_version)) reasons.push("metadata_pending");
  if (candidate.rows.length === 0 || candidate.rows.some(row => row.quantity_origin !== "reported_actual")) reasons.push("planned_or_unknown_input");
  if (candidate.rows.length > 200 || new Set(candidate.rows.map(row => row.row_key)).size !== candidate.rows.length
    || !candidate.rows.every(confirmedQuantity)) reasons.push("quantity_unconfirmed");
  if (candidate.condition === null || !Object.values(candidate.condition).every(text)
    || !policy.approved_condition_protocols?.includes(candidate.condition.protocol)) reasons.push("conditions_unconfirmed");
  let features: WeightImprovementSampleFeatures | null = null;
  // Narrow at the projection boundary; never spread the source or account object into model features.
  if (reasons.length === 0 && positive(candidate.measured_g) && text(candidate.schema_version)
    && text(candidate.input_version) && text(candidate.model_version) && candidate.condition !== null
    && candidate.rows.every(confirmedQuantity)) {
    const rows = candidate.rows.map(row => ({ source_kind: row.source_kind, source_id: row.source_id, source_version: row.source_version,
      amount: row.amount, unit: row.unit, grams: row.grams, conversion_version: row.conversion_version,
      conversion_quality: row.conversion_quality }));
    features = { schema_version: candidate.schema_version, input_version: candidate.input_version,
      model_version: candidate.model_version, cooking_servings: candidate.cooking_servings, measured_g: candidate.measured_g,
      rows, condition: { method: candidate.condition.method, boundary: candidate.condition.boundary,
        drainage: candidate.condition.drainage, added_media: candidate.condition.added_media, protocol: candidate.condition.protocol } };
  }
  return { reasons, features, collection_allowed: false };
}

/** The future cleanup worker must provide independently verified facts; this does not mark completion. */
export function assessWeightImprovementCleanup(proof: WeightImprovementCleanupProof) {
  const checksComplete = !proof.retry_error && Number.isSafeInteger(proof.requested_revision) && proof.requested_revision >= 0
    && proof.requested_revision === proof.current_revision
    && text(proof.verification_receipt) && proof.sample_rows_remaining === 0 && proof.model_memberships_remaining === 0
    && proof.affected_models_blocked_or_recomputed === true && proof.affected_caches_invalidated === true
    && proof.queued_jobs_cancelled === true && proof.account_generation_links_resolved === true
    && proof.backup_strategy !== null && proof.backup_restore_verified === true && text(proof.evidence_retention_rule);
  return { checks_complete: checksComplete, completion_write_allowed: false, model_release_allowed: false };
}
