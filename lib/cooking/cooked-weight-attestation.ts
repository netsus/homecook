import { WEIGHT_ATTESTATION_SCHEMA, WEIGHT_ATTESTATION_STATEMENT, type WeightAttestationContext,
  type WeightAttestationRecord, type WeightAttestationInput, type WeightAttestationRetraction } from "@/types/cooked-weight-attestation";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const SHA = /^[a-f0-9]{64}$/u;
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
}
function positive(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value > 0; }
function subject(value: unknown) {
  return record(value) && exact(value, ["owner_uuid", "account_generation"]) && typeof value.owner_uuid === "string"
    && UUID.test(value.owner_uuid) && positive(value.account_generation);
}
export function isWeightAttestationInput(value: unknown): value is WeightAttestationInput {
  return record(value) && exact(value, ["statement_version", "checked", "expected_subject", "expected_context_fingerprint"])
    && value.statement_version === WEIGHT_ATTESTATION_STATEMENT && value.checked === true && subject(value.expected_subject)
    && typeof value.expected_context_fingerprint === "string" && SHA.test(value.expected_context_fingerprint);
}
export function isWeightAttestationRetraction(value: unknown): value is WeightAttestationRetraction {
  return record(value) && exact(value, ["expected_subject", "expected_record_id", "expected_revision", "expected_context_fingerprint"])
    && subject(value.expected_subject) && typeof value.expected_record_id === "string" && UUID.test(value.expected_record_id)
    && positive(value.expected_revision) && typeof value.expected_context_fingerprint === "string" && SHA.test(value.expected_context_fingerprint);
}
export function isWeightAttestationContext(value: unknown): value is WeightAttestationContext {
  if (!record(value) || !exact(value, ["schema_version", "statement_version", "subject", "target_kind", "target_id", "context_fingerprint",
    "recipe_content_snapshot_id", "cooking_servings", "can_attest", "record"]) || value.schema_version !== WEIGHT_ATTESTATION_SCHEMA
    || value.statement_version !== WEIGHT_ATTESTATION_STATEMENT || !subject(value.subject)
    || !["session", "batch"].includes(String(value.target_kind)) || typeof value.target_id !== "string" || !UUID.test(value.target_id)
    || typeof value.context_fingerprint !== "string" || !SHA.test(value.context_fingerprint)
    || typeof value.recipe_content_snapshot_id !== "string" || !UUID.test(value.recipe_content_snapshot_id)
    || !positive(value.cooking_servings) || typeof value.can_attest !== "boolean") return false;
  return value.record === null || (value.can_attest === false && isWeightAttestationRecord(value.record)
    && value.record.recipe_content_snapshot_id === value.recipe_content_snapshot_id);
}
export function isWeightAttestationRecord(item: unknown): item is WeightAttestationRecord {
  return record(item) && exact(item, ["id", "revision", "status", "statement_version", "measurement_evidence_id", "measurement_original_revision", "measured_g",
    "recipe_content_snapshot_id", "context_fingerprint", "observed_at", "row_count", "provenance", "physical_verification", "record_usage"])
    && typeof item.id === "string" && UUID.test(item.id)
    && ((item.status === "attested" && item.revision === 1) || (item.status === "retracted" && item.revision === 2))
    && item.statement_version === WEIGHT_ATTESTATION_STATEMENT && typeof item.measurement_evidence_id === "string" && UUID.test(item.measurement_evidence_id)
    && typeof item.measured_g === "number" && Number.isFinite(item.measured_g) && item.measured_g > 0
    && positive(item.measurement_original_revision) && typeof item.recipe_content_snapshot_id === "string" && UUID.test(item.recipe_content_snapshot_id)
    && typeof item.context_fingerprint === "string" && SHA.test(item.context_fingerprint)
    && typeof item.observed_at === "string" && Number.isFinite(Date.parse(item.observed_at))
    && typeof item.row_count === "number" && Number.isSafeInteger(item.row_count) && item.row_count > 0 && item.row_count <= 200
    && item.provenance === "user_attested" && item.physical_verification === "not_verified" && item.record_usage === "qa_personal_record";
}
export function matchesWeightAttestationAcknowledgement(value: unknown, input: WeightAttestationInput): value is WeightAttestationRecord {
  return isWeightAttestationRecord(value) && value.status === "attested" && value.statement_version === input.statement_version
    && value.context_fingerprint === input.expected_context_fingerprint;
}

export function weightAttestationInput(context: WeightAttestationContext): WeightAttestationInput {
  return { statement_version: context.statement_version, checked: true, expected_subject: context.subject,
    expected_context_fingerprint: context.context_fingerprint };
}
