/** A personal statement about a frozen recipe, never a verified measurement or model consent. */
export const WEIGHT_ATTESTATION_SCHEMA = "cooked-weight-user-attestation-v1";
export const WEIGHT_ATTESTATION_STATEMENT = "pinned-quantities-whole-net-weight-v1";
export const WEIGHT_ATTESTATION_TEXT = "이번 요리 재료표의 재료와 양(추가 물·기름 포함)을 그대로 사용했고, 먹거나 버리기 전에 용기를 뺀 음식 전체(먹을 국물 포함)를 저울로 쟀어요.";
export type WeightAttestationTarget = "session" | "batch";
export interface WeightAttestationSubject { owner_uuid: string; account_generation: number; }
export interface WeightAttestationInput {
  statement_version: typeof WEIGHT_ATTESTATION_STATEMENT;
  checked: true;
  expected_subject: WeightAttestationSubject;
  expected_context_fingerprint: string;
}
export interface WeightAttestationRecord {
  id: string;
  revision: number;
  status: "attested" | "retracted";
  statement_version: typeof WEIGHT_ATTESTATION_STATEMENT;
  measurement_evidence_id: string;
  measurement_original_revision: number;
  measured_g: number;
  recipe_content_snapshot_id: string;
  context_fingerprint: string;
  observed_at: string;
  row_count: number;
  provenance: "user_attested";
  physical_verification: "not_verified";
  record_usage: "qa_personal_record";
}
export interface WeightAttestationContext {
  schema_version: typeof WEIGHT_ATTESTATION_SCHEMA;
  statement_version: typeof WEIGHT_ATTESTATION_STATEMENT;
  subject: WeightAttestationSubject;
  target_kind: WeightAttestationTarget;
  target_id: string;
  context_fingerprint: string;
  recipe_content_snapshot_id: string;
  cooking_servings: number;
  can_attest: boolean;
  record: WeightAttestationRecord | null;
}
export interface WeightAttestationRetraction {
  expected_subject: WeightAttestationSubject;
  expected_record_id: string;
  expected_revision: number;
  expected_context_fingerprint: string;
}
