import { predictCookedWeight, type CookedWeightFact, type CookedWeightPrediction } from "@/lib/server/cooked-weight-prediction";
import type { CookedWeightSummary } from "@/types/cooking";

export const PERSONAL_CORRECTION_VERSION = "personal-weight-ratio-fixture-v1";
// v9's minimum review threshold is not an accuracy guarantee.
const MINIMUM_INDEPENDENT_BATCHES = 3;

export interface PersonalCorrectionContext {
  readonly inputVersion: string;
  readonly catalogVersion: string;
  readonly baseServings: number;
  readonly prediction: CookedWeightPrediction;
}

export interface PersonalMeasurementFacts {
  readonly wholeDish: CookedWeightFact<"whole_edible_batch" | "leftover" | "portion">;
  readonly container: CookedWeightFact<"excluded" | "included">;
  readonly timing: CookedWeightFact<"before_consumption" | "after_consumption">;
  readonly edibleLiquids: CookedWeightFact<"included" | "none" | "excluded">;
  readonly actualIngredients: CookedWeightFact<"reported_actual" | "matches_pinned_quantities">;
  readonly independence: CookedWeightFact<"independent_batch">;
}

/** A future verified owner adapter must supply facts; display labels are not facts. */
export interface PersonalCorrectionObservation {
  readonly ownerUuid: string;
  readonly accountGeneration: number;
  readonly batchId: string;
  readonly sessionId: string;
  readonly observationId: string;
  readonly recordedRevision: number;
  readonly currentRevision: number;
  readonly state: "active" | "superseded" | "invalidated";
  readonly origin: "personal_report" | "qa" | "automatic" | "legacy";
  readonly source: CookedWeightSummary["source"];
  readonly measuredGrams: number;
  readonly context: PersonalCorrectionContext;
  readonly facts?: Partial<PersonalMeasurementFacts> | null;
}

/** No production default, approval, retention period or near-scale tolerance. */
export interface PersonalCorrectionFixturePolicy {
  readonly scope: "synthetic_fixture";
  readonly version: string;
  readonly validationEvidenceRef: string;
  readonly minimumRatio: number;
  readonly maximumRatio: number;
  readonly maximumMedianRelativeDeviation: number;
}

type Rejection = "owner_mismatch" | "invalid_observation" | "excluded_origin" | "not_reported_measurement"
  | "stale_or_invalidated" | "measurement_unconfirmed" | "context_unconfirmed" | "scale_mismatch"
  | "context_mismatch" | "duplicate_observation" | "physical_bound_exceeded" | "ratio_outside_policy";
type UnavailableReason = "invalid_subject" | "quality_policy_missing" | "quality_policy_invalid"
  | "target_context_unconfirmed" | "insufficient_independent_batches" | "unstable_ratios" | "invalid_correction";

export interface PersonalCorrectionResult {
  readonly version: typeof PERSONAL_CORRECTION_VERSION;
  readonly scope: "personal_offline_fixture";
  readonly apply: false;
  readonly status: "fixture_candidate" | "unavailable";
  readonly reason: UnavailableReason | null;
  readonly originalPredictedGrams: number | null;
  readonly correctedGrams: number | null;
  readonly medianRatio: number | null;
  readonly medianRelativeDeviation: number | null;
  readonly qualityPolicyVersion: string | null;
  readonly eligibleBatchIds: readonly string[];
  readonly rejected: readonly { readonly observationId: string; readonly reason: Rejection }[];
}

function text(value: string | null | undefined): value is string { return typeof value === "string" && value.trim().length > 0; }
function positive(value: number | null): value is number { return value !== null && Number.isFinite(value) && value > 0; }
function confirmed<T extends string | number>(fact: CookedWeightFact<T> | undefined) {
  return fact !== undefined && fact.status === "confirmed" && fact.value !== null && text(fact.evidenceRef);
}
function factKey<T extends string | number>(fact: CookedWeightFact<T>) { return [fact.value, fact.status]; }
function median(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2;
}

function contextEvidence(context: PersonalCorrectionContext) {
  const prediction = context.prediction;
  const input = prediction.input;
  if (!text(context.inputVersion) || !text(context.catalogVersion) || !positive(context.baseServings)
    || !input || !text(input.recipeSnapshotId) || !positive(input.cookingServings)
    || prediction.status !== "estimated" || prediction.scope !== "candidate" || !positive(prediction.totalGrams)
    || input.rows.length === 0 || input.rows.some(row => !confirmed(row.preparationState) || !confirmed(row.role))
    || input.segments.some(segment => !confirmed(segment.method) || !confirmed(segment.boundary)
      || !confirmed(segment.drainage) || !confirmed(segment.addedMedia) || !confirmed(segment.protocol))) return null;
  // Revalidate the frozen input/rules, without reading today's catalog or modifying history.
  const checked = predictCookedWeight(input, prediction.appliedRules);
  if (checked.status !== "estimated" || checked.scope !== "candidate" || checked.totalGrams !== prediction.totalGrams
    || checked.modelVersion !== prediction.modelVersion) return null;
  let inputMass = 0;
  for (const row of input.rows) { if (!positive(row.grams)) return null; inputMass += row.grams; }
  if (!positive(inputMass)) return null;
  const key = JSON.stringify({ inputVersion: context.inputVersion, catalogVersion: context.catalogVersion,
    modelVersion: prediction.modelVersion, recipeSnapshotId: input.recipeSnapshotId, baseServings: context.baseServings,
    cookingServings: input.cookingServings, predictedGrams: prediction.totalGrams,
    rows: [...input.rows].sort((a, b) => a.rowKey.localeCompare(b.rowKey)).map(row => ({ rowKey: row.rowKey,
      sourceKind: row.sourceKind, sourceId: row.sourceId, sourceVersion: row.sourceVersion, amount: row.amount, unit: row.unit,
      quantityKind: row.quantityKind, quantityOrigin: row.quantityOrigin, grams: row.grams, gramsEvidence: row.gramsEvidence,
      preparationState: factKey(row.preparationState), role: factKey(row.role), foodIdentity: factKey(row.foodIdentity) })),
    segments: [...input.segments].sort((a, b) => a.id.localeCompare(b.id)).map(segment => ({ id: segment.id,
      rowKeys: [...segment.rowKeys].sort(), method: factKey(segment.method), boundary: factKey(segment.boundary),
      drainage: factKey(segment.drainage), addedMedia: factKey(segment.addedMedia), protocol: factKey(segment.protocol),
      transformation: segment.transformation.kind === "known_external_loss"
        ? { kind: segment.transformation.kind, grams: factKey(segment.transformation.grams), coverage: factKey(segment.transformation.coverage) }
        : segment.transformation })),
    rules: [...prediction.appliedRules].sort((a, b) => a.id.localeCompare(b.id)), assumptions: prediction.assumptions });
  return { key, inputMass, predictedGrams: prediction.totalGrams, cookingServings: input.cookingServings };
}

function measurementConfirmed(facts: Partial<PersonalMeasurementFacts> | null | undefined, context: PersonalCorrectionContext) {
  const input = context.prediction.input;
  const requiredOrigin = facts?.actualIngredients?.value === "matches_pinned_quantities" ? "planned"
    : facts?.actualIngredients?.value === "reported_actual" ? "reported_actual" : null;
  return facts !== null && facts !== undefined && input !== null && input.rows.length > 0 && requiredOrigin !== null
    && input.rows.every(row => row.quantityOrigin === requiredOrigin)
    && [facts.wholeDish, facts.container, facts.timing, facts.edibleLiquids, facts.actualIngredients, facts.independence].every(confirmed)
    && facts.wholeDish?.value === "whole_edible_batch" && facts.container?.value === "excluded"
    && facts.timing?.value === "before_consumption" && ["included", "none"].includes(facts.edibleLiquids?.value ?? "")
    && facts.independence?.value === "independent_batch";
}

/** Inactive personal calculation only. No DB, clock, consent, collection, nutrient change or model application. */
export function evaluatePersonalWeightCorrection({ ownerUuid, accountGeneration, target, observations, policy }: {
  ownerUuid: string; accountGeneration: number; target: PersonalCorrectionContext;
  observations: readonly PersonalCorrectionObservation[]; policy?: PersonalCorrectionFixturePolicy | null;
}): PersonalCorrectionResult {
  const accepted: { batchId: string; ratio: number }[] = [];
  const rejected: { observationId: string; reason: Rejection }[] = [];
  const finish = (reason: UnavailableReason | null, ratio: number | null = null, deviation: number | null = null,
    grams: number | null = null): PersonalCorrectionResult => Object.freeze({ version: PERSONAL_CORRECTION_VERSION,
    scope: "personal_offline_fixture", apply: false, status: reason === null ? "fixture_candidate" : "unavailable", reason,
    originalPredictedGrams: target.prediction.totalGrams, correctedGrams: grams, medianRatio: ratio, medianRelativeDeviation: deviation,
    qualityPolicyVersion: policy?.version ?? null, eligibleBatchIds: Object.freeze(accepted.map(row => row.batchId)),
    rejected: Object.freeze(rejected.map(row => Object.freeze({ ...row }))) });
  if (!text(ownerUuid) || !Number.isSafeInteger(accountGeneration) || accountGeneration <= 0) return finish("invalid_subject");
  if (!policy) return finish("quality_policy_missing");
  if (policy.scope !== "synthetic_fixture" || !text(policy.version) || !text(policy.validationEvidenceRef)
    || !positive(policy.minimumRatio) || !positive(policy.maximumRatio) || policy.minimumRatio > policy.maximumRatio
    || !Number.isFinite(policy.maximumMedianRelativeDeviation) || policy.maximumMedianRelativeDeviation < 0) return finish("quality_policy_invalid");
  const expected = contextEvidence(target);
  if (!expected) return finish("target_context_unconfirmed");
  const duplicates = new Set<string>(); const identities = new Set<string>();
  for (const row of observations) {
    const keys = [`batch:${row.batchId}`, `session:${row.sessionId}`, `observation:${row.observationId}`];
    if (row.facts?.independence && confirmed(row.facts.independence)) keys.push(`independence:${row.facts.independence.evidenceRef}`);
    for (const key of keys) {
      if (identities.has(key)) duplicates.add(key); else identities.add(key);
    }
  }
  for (const row of observations) {
    let rejection: Rejection | null = null;
    if (row.ownerUuid !== ownerUuid || row.accountGeneration !== accountGeneration) rejection = "owner_mismatch";
    else if (![row.batchId, row.sessionId, row.observationId].every(text) || !positive(row.measuredGrams)
      || !Number.isSafeInteger(row.recordedRevision) || row.recordedRevision <= 0) rejection = "invalid_observation";
    else if (row.origin !== "personal_report") rejection = "excluded_origin";
    else if (row.source !== "reported_measured") rejection = "not_reported_measurement";
    else if (row.state !== "active" || row.currentRevision !== row.recordedRevision) rejection = "stale_or_invalidated";
    else if (!measurementConfirmed(row.facts, row.context)) rejection = "measurement_unconfirmed";
    else if (duplicates.has(`batch:${row.batchId}`) || duplicates.has(`session:${row.sessionId}`)
      || duplicates.has(`observation:${row.observationId}`) || duplicates.has(`independence:${row.facts?.independence?.evidenceRef}`)) rejection = "duplicate_observation";
    else {
      const context = contextEvidence(row.context);
      if (!context) rejection = "context_unconfirmed";
      else if (context.cookingServings !== expected.cookingServings || row.context.baseServings !== target.baseServings) rejection = "scale_mismatch";
      else if (context.key !== expected.key) rejection = "context_mismatch";
      else if (row.measuredGrams > context.inputMass) rejection = "physical_bound_exceeded";
      else {
        const ratio = row.measuredGrams / context.predictedGrams;
        if (!positive(ratio) || ratio < policy.minimumRatio || ratio > policy.maximumRatio) rejection = "ratio_outside_policy";
        else accepted.push({ batchId: row.batchId, ratio });
      }
    }
    if (rejection) rejected.push({ observationId: row.observationId, reason: rejection });
  }
  if (accepted.length < MINIMUM_INDEPENDENT_BATCHES) return finish("insufficient_independent_batches");
  const ratio = median(accepted.map(row => row.ratio));
  const deviation = median(accepted.map(row => Math.abs(row.ratio - ratio) / ratio));
  if (deviation > policy.maximumMedianRelativeDeviation) return finish("unstable_ratios");
  const grams = expected.predictedGrams * ratio;
  if (!positive(grams) || grams > expected.inputMass) return finish("invalid_correction");
  return finish(null, ratio, deviation, grams);
}
