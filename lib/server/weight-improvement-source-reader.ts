import type { WeightImprovementParticipation } from "@/types/weight-improvement-participation";
import { hasCurrentWeightImprovementConsent } from "@/lib/weight-improvement-participation";
import { isUuid } from "@/lib/server/cooked-batches";
import { buildWeightImprovementSampleStorageDraft, CURRENT_C01_MEASUREMENT_CONFIRMATIONS,
  isWeightImprovementSamplePolicyComplete, WEIGHT_IMPROVEMENT_SAMPLE_POLICY,
  weightImprovementSampleSourceAddress } from "@/lib/server/weight-improvement-sample-gate";
import type { WeightImprovementSampleCandidate, WeightImprovementSamplePolicy,
  WeightImprovementSampleSourceBinding, WeightImprovementSampleSourceLineage,
  WeightImprovementSampleReason, WeightImprovementSampleStorageDraft } from "@/types/weight-improvement-sample";

type Condition = NonNullable<WeightImprovementSampleCandidate["condition"]>;
type StoredFact<T> = { readonly value: T | null; readonly status: "confirmed" | "inferred" | "unknown"; readonly evidenceRef: string | null };

/** Narrow projection of C01 prediction_json, not a new persisted format. */
export interface C01StoredSamplePrediction {
  readonly schemaVersion: "cooked-weight-evidence-v1";
  readonly inputVersion: "snapshot-weight-v2";
  readonly catalogVersion: "usda-release2-2014";
  readonly recipeSnapshotId: string;
  readonly cookingServings: number;
  readonly prediction: {
    readonly modelVersion: "bounded-weight-v2";
    readonly scope: "candidate" | "test_fixture";
    readonly learningEligible: false;
    readonly input: {
      readonly recipeSnapshotId: string;
      readonly cookingServings: number;
      readonly rows: readonly {
        readonly rowKey: string; readonly sourceKind: "ingredient" | "food_product";
        readonly sourceId: string; readonly sourceVersion: string | null;
        readonly amount: number | null; readonly unit: string | null; readonly grams: number | null;
        readonly quantityOrigin: "planned" | "reported_actual" | "unknown";
        readonly gramsEvidence: { readonly kind: "direct_mass" | "ingredient_conversion" | "product_relation";
          readonly status: "confirmed" | "inferred" | "unknown"; readonly version: string | null;
          readonly quality: "exact" | "estimated" } | null;
      }[];
      readonly segments: readonly {
        readonly method: StoredFact<Condition["method"]>; readonly boundary: StoredFact<Condition["boundary"]>;
        readonly drainage: StoredFact<Condition["drainage"]>; readonly addedMedia: StoredFact<Condition["added_media"]>;
        readonly protocol: StoredFact<string>;
      }[];
    } | null;
  };
}

/** Fields consumed from private.cooked_batch_weight_evidence. */
interface StoredEvidenceIdentity {
  readonly id: string; readonly owner_uuid: string; readonly account_generation: number;
  readonly batch_id: string; readonly recipe_content_snapshot_id: string; readonly original_revision: number;
}

export interface WeightImprovementSourceRecords {
  readonly batch: { readonly id: string; readonly user_id: string; readonly cooked_at: string;
    readonly recipe_content_snapshot_id: string; readonly cooking_servings: number; readonly revision: number };
  readonly observation: StoredEvidenceIdentity & {
    readonly event_kind: "reported_measurement" | "manual_entry";
    readonly input_source: "reported_measured" | "manual_estimate";
    readonly refers_to_prediction_id: string | null; readonly measured_g: number | null;
    readonly measurement_path: "completion" | "before_consumption" | null; readonly observed_at: string;
  };
  readonly prediction: StoredEvidenceIdentity & { readonly event_kind: "prediction"; readonly prediction_json: C01StoredSamplePrediction };
  /** Derived by the server receipt-bound reader, not a mutable C01 column. */
  readonly current_relation: (WeightImprovementSampleSourceLineage & {
    readonly state: "current" | "superseded" | "invalidated" | "unknown";
    readonly recipe_content_snapshot_id: string;
  }) | null;
}

/** Injected read-only boundary; the receipt-bound repository has no product caller. */
export interface WeightImprovementSourceRepository {
  readSource(address: WeightImprovementSampleSourceLineage): Promise<WeightImprovementSourceRecords | null>;
}

export interface WeightImprovementSourceReaderInput {
  /** Default OFF; no environment flag or actual caller is installed. */
  enabled?: boolean;
  participation: WeightImprovementParticipation;
  binding: WeightImprovementSampleSourceBinding;
  repository: WeightImprovementSourceRepository;
  policy?: Readonly<WeightImprovementSamplePolicy>;
  selected_bindings?: readonly WeightImprovementSampleSourceBinding[];
  now: string;
}

export interface WeightImprovementSourceReaderResult {
  status: "disabled" | "source_unavailable" | "invalid_source" | "assessed";
  source_lookup_performed: boolean;
  reasons: WeightImprovementSampleReason[];
  draft: WeightImprovementSampleStorageDraft | null;
  collection_allowed: false;
  storage_write_allowed: false;
}

function stopped(status: WeightImprovementSourceReaderResult["status"], source_lookup_performed: boolean,
  reasons: WeightImprovementSampleReason[]): WeightImprovementSourceReaderResult {
  return { status, source_lookup_performed, reasons, draft: null,
    collection_allowed: false, storage_write_allowed: false };
}

function sameSubject(left: WeightImprovementParticipation["subject"], right: WeightImprovementParticipation["subject"]) {
  return left.owner_uuid === right.owner_uuid && left.account_generation === right.account_generation;
}

/** The injected read gate is preparation only. It never authorizes collection or persistence. */
export async function readWeightImprovementSourceDraft({ enabled = false, participation, binding, repository,
  policy = WEIGHT_IMPROVEMENT_SAMPLE_POLICY, selected_bindings = [], now }: WeightImprovementSourceReaderInput): Promise<WeightImprovementSourceReaderResult> {
  if (enabled !== true) return stopped("disabled", false, []);
  if (!isWeightImprovementSamplePolicyComplete(policy)) return stopped("disabled", false, ["policy_pending"]);
  if (!participation.participation_enabled || !hasCurrentWeightImprovementConsent(participation)
    || participation.consent_document_version !== policy.document_version || participation.consent_document_hash !== policy.document_hash) {
    return stopped("disabled", false, ["consent_not_current"]);
  }
  if (!weightImprovementSampleSourceAddress(binding) || binding.original_revision <= 0 || !isUuid(binding.sample_id)
    || binding.sample_id !== binding.sample_id.toLowerCase()
    || !/^[a-f0-9]{64}$/u.test(binding.consent_document_hash)) return stopped("disabled", false, ["source_binding_invalid"]);
  if (!sameSubject(binding.subject, participation.subject)) return stopped("disabled", false, ["subject_mismatch"]);
  if (binding.purpose !== participation.purpose) return stopped("disabled", false, ["source_binding_mismatch"]);
  if (binding.consent_revision !== participation.revision) return stopped("disabled", false, ["stale_consent_revision"]);
  if (binding.consent_document_version !== participation.consent_document_version
    || binding.consent_document_hash !== participation.consent_document_hash) return stopped("disabled", false, ["source_binding_mismatch"]);
  // Pin prospective inputs across the await and never give the repository the caller's binding object.
  const pinned = structuredClone({ participation, binding, policy, selected_bindings });
  const address: WeightImprovementSampleSourceLineage = { subject: { ...pinned.binding.subject }, purpose: pinned.binding.purpose,
    source_batch_id: pinned.binding.source_batch_id, source_evidence_id: pinned.binding.source_evidence_id,
    original_revision: pinned.binding.original_revision };
  try {
    const source = await repository.readSource(address);
    if (source === null) return stopped("source_unavailable", true, ["source_not_current"]);
    const projected = projectCurrentC01SampleSource(source, pinned.participation, pinned.binding);
    if (projected === null) return stopped("invalid_source", true, ["source_not_current"]);
    const assessed = buildWeightImprovementSampleStorageDraft({ ...pinned, ...projected, now });
    return { ...assessed, status: "assessed", source_lookup_performed: true };
  } catch {
    // No actual caller exists. A future post-success caller must keep read/selection failure separate from personal writes.
    return stopped("source_unavailable", true, ["source_not_current"]);
  }
}

function confirmed<T>(fact: StoredFact<T>): fact is StoredFact<T> & { value: T } {
  return fact.value !== null && fact.status === "confirmed" && fact.evidenceRef !== null && fact.evidenceRef.trim().length > 0;
}

/** Private server projection only; absent C01 confirmations/expiry stay null. Not a model/public DTO. */
export function projectCurrentC01SampleSource(source: WeightImprovementSourceRecords,
  participation: WeightImprovementParticipation, binding: WeightImprovementSampleSourceBinding): {
    candidate: WeightImprovementSampleCandidate; source_lineage: WeightImprovementSampleSourceLineage;
  } | null {
  const { batch, observation, prediction, current_relation: relation } = source;
  if (binding.purpose !== participation.purpose || !isUuid(batch.recipe_content_snapshot_id)
    || relation === null || relation.state !== "current" || !sameSubject(relation.subject, binding.subject)
    || !sameSubject(relation.subject, participation.subject) || relation.purpose !== binding.purpose
    || relation.source_batch_id !== batch.id || relation.source_evidence_id !== observation.id
    || relation.original_revision !== observation.original_revision || relation.recipe_content_snapshot_id !== batch.recipe_content_snapshot_id
    || batch.id !== binding.source_batch_id || batch.user_id !== binding.subject.owner_uuid
    || observation.id !== binding.source_evidence_id || observation.original_revision !== binding.original_revision
    || !Number.isSafeInteger(observation.original_revision) || observation.original_revision <= 0
    || !Number.isSafeInteger(batch.revision) || batch.revision < observation.original_revision
    || observation.refers_to_prediction_id !== prediction.id || prediction.event_kind !== "prediction"
    || !Number.isSafeInteger(prediction.original_revision) || prediction.original_revision <= 0
    || prediction.original_revision > observation.original_revision) return null;
  for (const row of [observation, prediction]) {
    if (!isUuid(row.id) || row.owner_uuid !== binding.subject.owner_uuid || row.account_generation !== binding.subject.account_generation
      || row.batch_id !== batch.id || row.recipe_content_snapshot_id !== batch.recipe_content_snapshot_id) return null;
  }
  const stored = prediction.prediction_json, input = stored.prediction.input;
  if (stored.schemaVersion !== "cooked-weight-evidence-v1" || stored.inputVersion !== "snapshot-weight-v2"
    || stored.catalogVersion !== "usda-release2-2014" || stored.prediction.modelVersion !== "bounded-weight-v2"
    || stored.prediction.scope !== "candidate" || stored.prediction.learningEligible !== false || input === null
    || stored.recipeSnapshotId !== batch.recipe_content_snapshot_id || input.recipeSnapshotId !== batch.recipe_content_snapshot_id
    || stored.cookingServings !== batch.cooking_servings || input.cookingServings !== batch.cooking_servings
    || input.rows.length === 0 || input.rows.length > 200) return null;
  let condition: Condition | null = null;
  if (input.segments.length === 1) {
    const segment = input.segments[0];
    if (confirmed(segment.method) && confirmed(segment.boundary) && confirmed(segment.drainage)
      && confirmed(segment.addedMedia) && confirmed(segment.protocol)) {
      condition = { method: segment.method.value, boundary: segment.boundary.value, drainage: segment.drainage.value,
        added_media: segment.addedMedia.value, protocol: segment.protocol.value };
    }
  }
  const subject = { owner_uuid: observation.owner_uuid, account_generation: observation.account_generation };
  const candidate: WeightImprovementSampleCandidate = { subject, consent_revision: participation.revision,
    event_kind: observation.event_kind, input_source: observation.input_source, measurement_path: observation.measurement_path,
    cooked_at: batch.cooked_at, observed_at: observation.observed_at, expires_at: null, measured_g: observation.measured_g,
    original_revision: observation.original_revision, current_evidence_original_revision: relation.original_revision,
    source_current: true, already_selected: false,
    ...CURRENT_C01_MEASUREMENT_CONFIRMATIONS,
    schema_version: stored.schemaVersion, input_version: stored.inputVersion, model_version: stored.prediction.modelVersion,
    cooking_servings: stored.cookingServings,
    rows: input.rows.map(row => ({ row_key: row.rowKey, source_kind: row.sourceKind, source_id: row.sourceId,
      source_version: row.sourceVersion, amount: row.amount, unit: row.unit, grams: row.grams, quantity_origin: row.quantityOrigin,
      conversion_confirmed: row.gramsEvidence?.status === "confirmed", conversion_kind: row.gramsEvidence?.kind ?? null,
      conversion_version: row.gramsEvidence?.version ?? null, conversion_quality: row.gramsEvidence?.quality ?? null })), condition };
  return { candidate, source_lineage: { subject: { ...subject }, purpose: relation.purpose,
    source_batch_id: batch.id, source_evidence_id: observation.id, original_revision: observation.original_revision } };
}
