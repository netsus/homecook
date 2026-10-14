import { isUuid } from "@/lib/server/cooked-batches";
import { isParticipationRecord, hasCurrentWeightImprovementConsent } from "@/lib/weight-improvement-participation";
import { buildSessionAuthorityRpcArgs } from "@/lib/server/recipe-content-snapshot-future-propagation";
import type { AccountGenerationBootstrapSessionAuthority } from "@/lib/server/account-generation/session-authority";
import { createWeightImprovementParticipationInternalClient } from "@/lib/supabase/server";
import { isWeightImprovementSamplePolicyComplete, WEIGHT_IMPROVEMENT_SAMPLE_POLICY } from "@/lib/server/weight-improvement-sample-gate";
import type { C01StoredSamplePrediction, WeightImprovementSourceRecords, WeightImprovementSourceRepository } from "@/lib/server/weight-improvement-source-reader";
import type { WeightImprovementParticipation } from "@/types/weight-improvement-participation";
import type { WeightImprovementSamplePolicy } from "@/types/weight-improvement-sample";

type Row = NonNullable<C01StoredSamplePrediction["prediction"]["input"]>["rows"][number];
type Segment = NonNullable<C01StoredSamplePrediction["prediction"]["input"]>["segments"][number];
type SourceClient = Pick<NonNullable<ReturnType<typeof createWeightImprovementParticipationInternalClient>>, "readSource">;
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0 && value.length <= 256;
const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;
const integer = (value: unknown): value is number => positive(value) && Number.isSafeInteger(value);
const amount = (value: unknown): value is number | null => value === null || positive(value);
const date = (value: unknown): value is string => text(value) && Number.isFinite(Date.parse(value));
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return isParticipationRecord(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function enumValue<T extends string>(value: unknown, choices: readonly T[]): value is T {
  return typeof value === "string" && choices.some(choice => choice === value);
}
function fact<T extends string>(value: unknown, choices?: readonly T[]): { value: T | null; status: "confirmed" | "inferred" | "unknown"; evidenceRef: string | null } | null {
  if (!exact(value, ["value", "status", "evidenceRef"]) || !enumValue(value.status, ["confirmed", "inferred", "unknown"])
    || !(value.evidenceRef === null || text(value.evidenceRef))) return null;
  if (value.value === null) return { value: null, status: value.status, evidenceRef: value.evidenceRef };
  if (!choices || !enumValue(value.value, choices)) return null;
  return { value: value.value, status: value.status, evidenceRef: value.evidenceRef };
}
function parseRow(value: unknown): Row | null {
  if (!exact(value, ["rowKey", "sourceKind", "sourceId", "sourceVersion", "amount", "unit", "grams", "quantityOrigin", "gramsEvidence"])
    || !text(value.rowKey) || !enumValue(value.sourceKind, ["ingredient", "food_product"]) || !isUuid(value.sourceId)
    || !(value.sourceVersion === null || isUuid(value.sourceVersion)) || !amount(value.amount) || !amount(value.grams)
    || !(value.unit === null || text(value.unit)) || !enumValue(value.quantityOrigin, ["planned", "reported_actual", "unknown"])) return null;
  let evidence: Row["gramsEvidence"] = null;
  if (value.gramsEvidence !== null) {
    const e = value.gramsEvidence;
    if (!exact(e, ["kind", "status", "version", "quality"]) || !enumValue(e.kind, ["direct_mass", "ingredient_conversion", "product_relation"])
      || !enumValue(e.status, ["confirmed", "inferred", "unknown"]) || !enumValue(e.quality, ["exact", "estimated"])
      || !(e.version === null || text(e.version))) return null;
    evidence = { kind: e.kind, status: e.status, version: e.version, quality: e.quality };
  }
  return { rowKey: value.rowKey, sourceKind: value.sourceKind, sourceId: value.sourceId, sourceVersion: value.sourceVersion,
    amount: value.amount, unit: value.unit, grams: value.grams, quantityOrigin: value.quantityOrigin, gramsEvidence: evidence };
}
function parseSegment(value: unknown): Segment | null {
  if (!exact(value, ["method", "boundary", "drainage", "addedMedia", "protocol"])) return null;
  const method = fact(value.method, ["no_heat", "pan_browning", "boiling", "soup", "reheating", "other"]);
  const boundary = fact(value.boundary, ["entire_edible", "drained_edible"]);
  const drainage = fact(value.drainage, ["none", "retained", "drained", "colander"]);
  const addedMedia = fact(value.addedMedia, ["none", "water", "oil", "water_and_oil"]);
  const protocolValue = isParticipationRecord(value.protocol) ? value.protocol.value : null;
  const protocol = fact(value.protocol, text(protocolValue) ? [protocolValue] : undefined);
  return method && boundary && drainage && addedMedia && protocol ? { method, boundary, drainage, addedMedia, protocol } : null;
}
function parsePrediction(value: unknown): C01StoredSamplePrediction | null {
  if (!exact(value, ["schemaVersion", "inputVersion", "catalogVersion", "recipeSnapshotId", "cookingServings", "prediction"])
    || value.schemaVersion !== "cooked-weight-evidence-v1" || value.inputVersion !== "snapshot-weight-v2" || value.catalogVersion !== "usda-release2-2014"
    || !isUuid(value.recipeSnapshotId) || !integer(value.cookingServings)) return null;
  const prediction = value.prediction;
  if (!exact(prediction, ["modelVersion", "scope", "learningEligible", "input"]) || prediction.modelVersion !== "bounded-weight-v2"
    || !enumValue(prediction.scope, ["candidate", "test_fixture"]) || prediction.learningEligible !== false) return null;
  let input: C01StoredSamplePrediction["prediction"]["input"] = null;
  if (prediction.input !== null) {
    const i = prediction.input;
    if (!exact(i, ["recipeSnapshotId", "cookingServings", "rows", "segments"]) || !isUuid(i.recipeSnapshotId) || !integer(i.cookingServings)
      || !Array.isArray(i.rows) || i.rows.length === 0 || i.rows.length > 200 || !Array.isArray(i.segments) || i.segments.length > 200) return null;
    const rows: Row[] = []; const segments: Segment[] = [];
    for (const item of i.rows) { const row = parseRow(item); if (!row) return null; rows.push(row); }
    for (const item of i.segments) { const segment = parseSegment(item); if (!segment) return null; segments.push(segment); }
    input = { recipeSnapshotId: i.recipeSnapshotId, cookingServings: i.cookingServings, rows, segments };
  }
  return { schemaVersion: value.schemaVersion, inputVersion: value.inputVersion, catalogVersion: value.catalogVersion,
    recipeSnapshotId: value.recipeSnapshotId, cookingServings: value.cookingServings,
    prediction: { modelVersion: prediction.modelVersion, scope: prediction.scope, learningEligible: false, input } };
}
function identity(value: unknown) {
  if (!isParticipationRecord(value) || !isUuid(value.id) || !isUuid(value.owner_uuid) || !integer(value.account_generation)
    || !isUuid(value.batch_id) || !isUuid(value.recipe_content_snapshot_id) || !integer(value.original_revision)) return null;
  return { id: value.id, owner_uuid: value.owner_uuid, account_generation: value.account_generation, batch_id: value.batch_id,
    recipe_content_snapshot_id: value.recipe_content_snapshot_id, original_revision: value.original_revision };
}

/** Exact bounded private projection. No arbitrary prediction JSON or public DTO escapes this boundary. */
export function decodeWeightImprovementSource(value: unknown): WeightImprovementSourceRecords | null {
  if (!exact(value, ["schema_version", "status", "source"]) || value.schema_version !== "weight-improvement-source-v1" || value.status !== "source") return null;
  const source = value.source;
  if (!exact(source, ["batch", "observation", "prediction", "current_relation"])) return null;
  const b = source.batch, o = source.observation, p = source.prediction, r = source.current_relation;
  if (!exact(b, ["id", "user_id", "cooked_at", "recipe_content_snapshot_id", "cooking_servings", "revision"])
    || !isUuid(b.id) || !isUuid(b.user_id) || !date(b.cooked_at) || !isUuid(b.recipe_content_snapshot_id) || !integer(b.cooking_servings) || !integer(b.revision)
    || !exact(o, ["id", "owner_uuid", "account_generation", "batch_id", "recipe_content_snapshot_id", "original_revision", "event_kind", "input_source", "refers_to_prediction_id", "measured_g", "measurement_path", "observed_at"])
    || o.event_kind !== "reported_measurement" || o.input_source !== "reported_measured" || !isUuid(o.refers_to_prediction_id) || !positive(o.measured_g)
    || !enumValue(o.measurement_path, ["completion", "before_consumption"]) || !date(o.observed_at)
    || !exact(p, ["id", "owner_uuid", "account_generation", "batch_id", "recipe_content_snapshot_id", "original_revision", "event_kind", "prediction_json"])
    || p.event_kind !== "prediction" || !exact(r, ["subject", "purpose", "source_batch_id", "source_evidence_id", "original_revision", "state", "recipe_content_snapshot_id"])
    || r.purpose !== "cooked_weight_estimation_improvement" || r.state !== "current" || !isUuid(r.source_batch_id) || !isUuid(r.source_evidence_id)
    || !integer(r.original_revision) || !isUuid(r.recipe_content_snapshot_id) || !exact(r.subject, ["owner_uuid", "account_generation"])
    || !isUuid(r.subject.owner_uuid) || !integer(r.subject.account_generation)) return null;
  const observation = identity(o), prediction = identity(p), stored = parsePrediction(p.prediction_json);
  if (!observation || !prediction || !stored) return null;
  return { batch: { id: b.id, user_id: b.user_id, cooked_at: b.cooked_at, recipe_content_snapshot_id: b.recipe_content_snapshot_id,
    cooking_servings: b.cooking_servings, revision: b.revision },
    observation: { ...observation, event_kind: o.event_kind, input_source: o.input_source, refers_to_prediction_id: o.refers_to_prediction_id,
      measured_g: o.measured_g, measurement_path: o.measurement_path, observed_at: o.observed_at },
    prediction: { ...prediction, event_kind: p.event_kind, prediction_json: stored },
    current_relation: { subject: { owner_uuid: r.subject.owner_uuid, account_generation: r.subject.account_generation }, purpose: r.purpose,
      source_batch_id: r.source_batch_id, source_evidence_id: r.source_evidence_id, original_revision: r.original_revision,
      state: r.state, recipe_content_snapshot_id: r.recipe_content_snapshot_id } };
}

/** No product caller is installed. Policy/explicit read OFF never constructs a service client or queries a source. */
export function createWeightImprovementSourceRepository({ authority, participation, enabled = false,
  policy = WEIGHT_IMPROVEMENT_SAMPLE_POLICY, client }: {
  authority: AccountGenerationBootstrapSessionAuthority; participation: WeightImprovementParticipation;
  enabled?: boolean; policy?: Readonly<WeightImprovementSamplePolicy>; client?: SourceClient;
}): WeightImprovementSourceRepository {
  const pinned = structuredClone({ authority, participation, policy });
  return { async readSource(address) {
    const current = pinned.participation;
    if (!enabled || !isWeightImprovementSamplePolicyComplete(pinned.policy) || !hasCurrentWeightImprovementConsent(current)
      || !current.participation_enabled || pinned.authority.ownerUuid !== current.subject.owner_uuid
      || current.purpose !== "cooked_weight_estimation_improvement" || !integer(current.subject.account_generation)
      || current.consent_document_version !== pinned.policy.document_version || current.consent_document_hash !== pinned.policy.document_hash
      || address.subject.owner_uuid !== current.subject.owner_uuid || address.subject.account_generation !== current.subject.account_generation
      || address.purpose !== current.purpose || !isUuid(address.source_batch_id) || !isUuid(address.source_evidence_id)
      || !integer(address.original_revision)) return null;
    const internal = client ?? createWeightImprovementParticipationInternalClient();
    if (!internal) return null;
    const response = await internal.readSource({ ...buildSessionAuthorityRpcArgs(pinned.authority),
      p_expected_account_generation: current.subject.account_generation, p_consent_revision: current.revision,
      p_document_version: current.consent_document_version, p_document_hash: current.consent_document_hash,
      p_batch_id: address.source_batch_id, p_evidence_id: address.source_evidence_id, p_original_revision: address.original_revision });
    if (response.error) return null;
    const source = decodeWeightImprovementSource(response.data);
    if (!source || source.batch.id !== address.source_batch_id || source.batch.user_id !== current.subject.owner_uuid
      || source.observation.id !== address.source_evidence_id || source.observation.original_revision !== address.original_revision
      || source.observation.owner_uuid !== current.subject.owner_uuid || source.observation.account_generation !== current.subject.account_generation
      || source.prediction.owner_uuid !== current.subject.owner_uuid || source.prediction.account_generation !== current.subject.account_generation
      || source.observation.batch_id !== address.source_batch_id || source.prediction.batch_id !== address.source_batch_id
      || source.observation.refers_to_prediction_id !== source.prediction.id
      || source.observation.recipe_content_snapshot_id !== source.batch.recipe_content_snapshot_id
      || source.prediction.recipe_content_snapshot_id !== source.batch.recipe_content_snapshot_id
      || source.current_relation?.subject.owner_uuid !== current.subject.owner_uuid
      || source.current_relation.subject.account_generation !== current.subject.account_generation
      || source.current_relation.source_batch_id !== address.source_batch_id || source.current_relation.source_evidence_id !== address.source_evidence_id
      || source.current_relation.original_revision !== address.original_revision
      || source.current_relation.recipe_content_snapshot_id !== source.batch.recipe_content_snapshot_id) return null;
    return source;
  } };
}
