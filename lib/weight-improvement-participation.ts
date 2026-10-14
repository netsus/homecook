import { WEIGHT_IMPROVEMENT_PURPOSE, type WeightImprovementDocument, type WeightImprovementParticipation } from "@/types/weight-improvement-participation";

export function isParticipationRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function nullableString(value: unknown) {
  return value === null || typeof value === "string";
}
function nullableTimestamp(value: unknown) {
  return value === null || (typeof value === "string" && Number.isFinite(Date.parse(value)));
}
function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim().length > 0);
}
export function isWeightImprovementDocument(value: unknown): value is WeightImprovementDocument {
  if (!isParticipationRecord(value)) return false;
  return ["version", "notice_version", "title", "purpose", "sample_retention", "evidence_retention", "withdrawal", "personal_service", "body"]
    .every((field) => typeof value[field] === "string" && value[field].trim().length > 0)
    && typeof value.hash === "string" && /^[0-9a-f]{64}$/.test(value.hash)
    && stringList(value.data_items) && value.data_items.length > 0 && stringList(value.excluded_items);
}

export function isWeightImprovementParticipation(value: unknown): value is WeightImprovementParticipation {
  if (!isParticipationRecord(value) || !isParticipationRecord(value.subject)) return false;
  return value.purpose === WEIGHT_IMPROVEMENT_PURPOSE
    && typeof value.subject.owner_uuid === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.subject.owner_uuid)
    && typeof value.subject.account_generation === "number" && Number.isSafeInteger(value.subject.account_generation) && value.subject.account_generation > 0
    && typeof value.decision === "string" && ["unanswered", "declined", "opted_in", "withdrawn"].includes(value.decision)
    && typeof value.revision === "number" && Number.isSafeInteger(value.revision) && value.revision >= 0
    && ["notice_seen_at", "notice_version_seen", "opted_in_at", "withdrawn_at", "consent_document_version", "consent_document_hash"].every((field) => nullableString(value[field]))
    && ["notice_seen_at", "opted_in_at", "withdrawn_at"].every((field) => nullableTimestamp(value[field]))
    && (value.decision !== "opted_in" || (typeof value.opted_in_at === "string" && Number.isFinite(Date.parse(value.opted_in_at))
      && typeof value.consent_document_version === "string" && value.consent_document_version.length > 0
      && typeof value.consent_document_hash === "string" && /^[0-9a-f]{64}$/.test(value.consent_document_hash)))
    && (value.decision !== "withdrawn" || (typeof value.withdrawn_at === "string" && Number.isFinite(Date.parse(value.withdrawn_at))))
    && typeof value.cleanup_status === "string" && ["none", "pending", "retrying", "completed"].includes(value.cleanup_status)
    && typeof value.participation_enabled === "boolean" && value.collection_enabled === false
    && (value.document === null || isWeightImprovementDocument(value.document))
    && (!value.participation_enabled || isWeightImprovementDocument(value.document));
}

export function hasCurrentWeightImprovementConsent(status: WeightImprovementParticipation) {
  return status.decision === "opted_in" && status.document !== null
    && status.consent_document_version === status.document.version && status.consent_document_hash === status.document.hash;
}
