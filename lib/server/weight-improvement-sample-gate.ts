import { hasCurrentWeightImprovementConsent } from "@/lib/weight-improvement-participation";
import { WEIGHT_IMPROVEMENT_PURPOSE, type WeightImprovementParticipation } from "@/types/weight-improvement-participation";
import type {
  WeightImprovementCleanupProof, WeightImprovementSampleCandidate, WeightImprovementSampleFeatures,
  WeightImprovementSamplePolicy, WeightImprovementSampleReason,
  WeightImprovementSampleSourceAddress, WeightImprovementSampleSourceBinding, WeightImprovementSampleSourceLineage,
  WeightImprovementSampleStorageDraft, WeightImprovementSampleInvalidationReason, WeightImprovementSampleInvalidationAddress,
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

// The future reader uses PostgreSQL's canonical lower-case UUIDs, not caller aliases.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function validSubject(subject: WeightImprovementParticipation["subject"]) {
  return subject !== null && typeof subject === "object" && typeof subject.owner_uuid === "string"
    && UUID.test(subject.owner_uuid) && Number.isSafeInteger(subject.account_generation) && subject.account_generation > 0;
}
function validLineage(source: WeightImprovementSampleSourceLineage) {
  return source !== null && typeof source === "object" && validSubject(source.subject)
    && source.purpose === WEIGHT_IMPROVEMENT_PURPOSE && typeof source.source_batch_id === "string" && UUID.test(source.source_batch_id)
    && typeof source.source_evidence_id === "string" && UUID.test(source.source_evidence_id)
    && Number.isSafeInteger(source.original_revision) && source.original_revision >= 0;
}
function validBinding(binding: WeightImprovementSampleSourceBinding) {
  return validLineage(binding) && typeof binding.sample_id === "string" && UUID.test(binding.sample_id)
    && Number.isSafeInteger(binding.consent_revision) && binding.consent_revision >= 0
    && typeof binding.consent_document_version === "string" && text(binding.consent_document_version)
    && typeof binding.consent_document_hash === "string" && /^[a-f0-9]{64}$/i.test(binding.consent_document_hash);
}
function sameSubject(left: WeightImprovementParticipation["subject"], right: WeightImprovementParticipation["subject"]) {
  return left.owner_uuid === right.owner_uuid && left.account_generation === right.account_generation;
}
function projectBinding(binding: WeightImprovementSampleSourceBinding): WeightImprovementSampleSourceBinding {
  return { sample_id: binding.sample_id, subject: { owner_uuid: binding.subject.owner_uuid, account_generation: binding.subject.account_generation },
    purpose: binding.purpose, consent_revision: binding.consent_revision, consent_document_version: binding.consent_document_version,
    consent_document_hash: binding.consent_document_hash, source_batch_id: binding.source_batch_id,
    source_evidence_id: binding.source_evidence_id, original_revision: binding.original_revision };
}

/** Private, batch-level address only; not an independence count or storage receipt. */
export function weightImprovementSampleSourceAddress(source: WeightImprovementSampleSourceLineage): WeightImprovementSampleSourceAddress | null {
  return validLineage(source) ? { subject: { owner_uuid: source.subject.owner_uuid, account_generation: source.subject.account_generation },
    purpose: source.purpose, source_batch_id: source.source_batch_id } : null;
}

/** All source/selected inputs are prospective facts. Even a valid fixture cannot authorize storage. */
export function buildWeightImprovementSampleStorageDraft({ participation, candidate, binding, source_lineage,
  selected_bindings = [], policy = WEIGHT_IMPROVEMENT_SAMPLE_POLICY, now }: {
  participation: WeightImprovementParticipation; candidate: WeightImprovementSampleCandidate;
  binding: WeightImprovementSampleSourceBinding; source_lineage: WeightImprovementSampleSourceLineage;
  selected_bindings?: readonly WeightImprovementSampleSourceBinding[]; policy?: Readonly<WeightImprovementSamplePolicy>; now: string;
}): { reasons: WeightImprovementSampleReason[]; draft: WeightImprovementSampleStorageDraft | null; collection_allowed: false; storage_write_allowed: false } {
  const assessed = assessWeightImprovementSample({ participation, candidate, policy, now });
  const reasons = new Set(assessed.reasons);
  if (!validBinding(binding) || !validLineage(source_lineage) || !Array.isArray(selected_bindings) || !selected_bindings.every(validBinding)) {
    reasons.add("source_binding_invalid");
  } else {
    if (!sameSubject(binding.subject, participation.subject) || !sameSubject(binding.subject, candidate.subject)
      || !sameSubject(binding.subject, source_lineage.subject) || participation.purpose !== binding.purpose
      || binding.purpose !== source_lineage.purpose || binding.consent_revision !== participation.revision
      || binding.consent_revision !== candidate.consent_revision || binding.consent_document_version !== participation.consent_document_version
      || binding.consent_document_hash !== participation.consent_document_hash || binding.consent_document_version !== policy.document_version
      || binding.consent_document_hash !== policy.document_hash || binding.source_batch_id !== source_lineage.source_batch_id
      || binding.source_evidence_id !== source_lineage.source_evidence_id || binding.original_revision !== source_lineage.original_revision
      || binding.original_revision !== candidate.original_revision || binding.original_revision !== candidate.current_evidence_original_revision) reasons.add("source_binding_mismatch");
    if (selected_bindings.some(selected => sameSubject(selected.subject, binding.subject)
      && selected.purpose === binding.purpose && selected.source_batch_id === binding.source_batch_id)) reasons.add("duplicate_source");
    if (selected_bindings.some(selected => (selected.source_batch_id === binding.source_batch_id
      || selected.source_evidence_id === binding.source_evidence_id || selected.sample_id === binding.sample_id)
      && (!sameSubject(selected.subject, binding.subject) || selected.purpose !== binding.purpose
        || selected.source_batch_id !== binding.source_batch_id
        || (selected.sample_id === binding.sample_id && (selected.source_evidence_id !== binding.source_evidence_id
          || selected.original_revision !== binding.original_revision))))) reasons.add("source_binding_mismatch");
    if (assessed.features) {
      const privateValues = [candidate.cooked_at, candidate.observed_at, candidate.expires_at, participation.opted_in_at,
        ...candidate.rows.map(row => row.row_key)];
      for (const link of [binding, ...selected_bindings]) privateValues.push(link.sample_id, link.subject.owner_uuid, link.source_batch_id, link.source_evidence_id);
      const features = JSON.stringify(assessed.features).toLowerCase();
      if (privateValues.some(value => value !== null && features.includes(value.toLowerCase()))) reasons.add("private_feature_value");
    }
  }
  return { reasons: [...reasons], draft: reasons.size === 0 && assessed.features
    ? { features: assessed.features, private_binding: projectBinding(binding) } : null,
    collection_allowed: false, storage_write_allowed: false };
}

/** Target an old private link before source deletion; never mark cleanup or model release complete. */
export function buildWeightImprovementSampleInvalidationAddress({ binding, source_lineage, reason }: {
  binding: WeightImprovementSampleSourceBinding; source_lineage: WeightImprovementSampleSourceLineage;
  reason: WeightImprovementSampleInvalidationReason;
}): WeightImprovementSampleInvalidationAddress | null {
  if (!validBinding(binding) || !validLineage(source_lineage) || !sameSubject(binding.subject, source_lineage.subject)
    || binding.purpose !== source_lineage.purpose || binding.source_batch_id !== source_lineage.source_batch_id
    || binding.source_evidence_id !== source_lineage.source_evidence_id || binding.original_revision !== source_lineage.original_revision
    || !["withdrawal", "source_invalidated", "source_deleted", "account_deleted"].includes(reason)) return null;
  const source_address = weightImprovementSampleSourceAddress(binding);
  return source_address ? { reason, source_address, private_binding: projectBinding(binding), completion_write_allowed: false, model_release_allowed: false } : null;
}
