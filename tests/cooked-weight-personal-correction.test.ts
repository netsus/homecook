import { describe, expect, it } from "vitest";
import { predictCookedWeight, type CookedWeightFact,
  type CookedWeightRow, type CookedWeightSegment } from "@/lib/server/cooked-weight-prediction";
import { evaluatePersonalWeightCorrection, type PersonalCorrectionContext, type PersonalCorrectionFixturePolicy,
  type PersonalCorrectionObservation, type PersonalMeasurementFacts } from "@/lib/server/cooked-weight-personal-correction";

const confirmed = <T extends string | number>(value: T, evidenceRef = "synthetic-fact"): CookedWeightFact<T> => ({ value, status: "confirmed", evidenceRef });
const unknown = <T extends string | number>(): CookedWeightFact<T> => ({ value: null, status: "unknown", evidenceRef: null });
const policy: PersonalCorrectionFixturePolicy = { scope: "synthetic_fixture", version: "synthetic-policy-1",
  validationEvidenceRef: "synthetic-offline-validation", minimumRatio: 0.25, maximumRatio: 1.5, maximumMedianRelativeDeviation: 0.1 };
const facts: PersonalMeasurementFacts = { wholeDish: confirmed("whole_edible_batch"), container: confirmed("excluded"),
  timing: confirmed("before_consumption"), edibleLiquids: confirmed("included"), actualIngredients: confirmed("matches_pinned_quantities"), independence: confirmed("independent_batch") };

function input(): { recipeSnapshotId: string; cookingServings: number; rows: CookedWeightRow[]; segments: CookedWeightSegment[] } {
  return { recipeSnapshotId: "snapshot-original-version", cookingServings: 2,
    rows: [{ rowKey: "fixed-row", sourceKind: "food_product", sourceId: "product-A", sourceVersion: "nutrition-fixed-v1",
      amount: 200, unit: "g", quantityKind: "quantitative", quantityOrigin: "planned", grams: 200,
      gramsEvidence: { kind: "direct_mass", status: "confirmed", evidenceId: null, version: null, quality: "exact" },
      preparationState: confirmed("raw"), role: confirmed("food"), foodIdentity: unknown() }],
    segments: [{ id: "whole-dish", rowKeys: ["fixed-row"], method: confirmed("no_heat"), boundary: confirmed("entire_edible"),
      drainage: confirmed("none"), addedMedia: confirmed("none"), protocol: confirmed("synthetic-closed-mix"), transformation: { kind: "closed_mix" } }] };
}
function context(data = input()): PersonalCorrectionContext {
  return { inputVersion: "snapshot-weight-v2", catalogVersion: "synthetic-catalog-v1", baseServings: 2, prediction: predictCookedWeight(data) };
}
function observation(index: number, measuredGrams = 180, patch: Partial<PersonalCorrectionObservation> = {}): PersonalCorrectionObservation {
  return { ownerUuid: "owner-A", accountGeneration: 3, batchId: `batch-${index}`, sessionId: `cook-${index}`, observationId: `observation-${index}`,
    recordedRevision: 1, currentRevision: 1, state: "active", origin: "personal_report", source: "reported_measured", measuredGrams, context: context(),
    facts: { ...facts, independence: confirmed("independent_batch", `synthetic-cook:${index}`) }, ...patch };
}
function evaluate(observations: readonly PersonalCorrectionObservation[], target = context(), qualityPolicy = policy) {
  return evaluatePersonalWeightCorrection({ ownerUuid: "owner-A", accountGeneration: 3, target, observations, policy: qualityPolicy });
}

describe("inactive personal whole-weight correction", () => {
  it("requires three independent eligible batches and keeps one or two values from overriding a prediction", () => {
    for (const count of [0, 1, 2]) {
      const result = evaluate(Array.from({ length: count }, (_, i) => observation(i)));
      expect(result.reason).toBe("insufficient_independent_batches"); expect(result.correctedGrams).toBeNull(); expect(result.apply).toBe(false);
    }
    const result = evaluate([observation(1, 180), observation(2, 182), observation(3, 190)]);
    expect(result).toMatchObject({ status: "fixture_candidate", scope: "personal_offline_fixture", apply: false,
      originalPredictedGrams: 200, correctedGrams: 182, medianRatio: 0.91, qualityPolicyVersion: policy.version });
    expect(result.eligibleBatchIds).toEqual(["batch-1", "batch-2", "batch-3"]);
  });
  it("uses the median rather than the mean, including an even sample count, and never changes inputs or history", () => {
    const rows = [observation(1, 160), observation(2, 180), observation(3, 182), observation(4, 200)];
    const target = context(); const before = JSON.stringify({ rows, target });
    const result = evaluate(rows, target);
    expect(result.correctedGrams).toBeCloseTo(181); expect(result.correctedGrams).not.toBe(180.5);
    expect(JSON.stringify({ rows, target })).toBe(before);
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.eligibleBatchIds)).toBe(true);
    expect(Object.isFrozen(result.rejected)).toBe(true);
  });
  it("does not require global improvement participation for this private synthetic calculation", () => {
    const result = evaluate([observation(1), observation(2), observation(3)]);
    expect(result.status).toBe("fixture_candidate"); expect(result.apply).toBe(false);
    expect(result).not.toHaveProperty("consent"); expect(result).not.toHaveProperty("globalSample");
  });
  it.each([
    { origins: ["planned"], use: "matches_pinned_quantities", eligible: true },
    { origins: ["planned"], use: "reported_actual", eligible: false },
    { origins: ["reported_actual"], use: "reported_actual", eligible: true },
    { origins: ["reported_actual"], use: "matches_pinned_quantities", eligible: false },
    { origins: ["unknown"], use: "reported_actual", eligible: false },
    { origins: ["unknown"], use: "matches_pinned_quantities", eligible: false },
    { origins: ["planned", "reported_actual"], use: "reported_actual", eligible: false },
    { origins: ["planned", "reported_actual"], use: "matches_pinned_quantities", eligible: false },
  ] as const)("binds actual-use $use to the input rows $origins", ({ origins, use, eligible }) => {
    const data = input(); const template = data.rows[0];
    data.rows = origins.map((quantityOrigin, index) => ({ ...template, rowKey: `fixed-row-${index}`, sourceId: `product-${index}`,
      amount: 200 / origins.length, grams: 200 / origins.length, quantityOrigin }));
    data.segments[0] = { ...data.segments[0], rowKeys: data.rows.map(row => row.rowKey) };
    const matching = context(data);
    const rows = [1, 2, 3].map(index => observation(index, 180, { context: matching, facts: { ...facts,
      actualIngredients: confirmed(use), independence: confirmed("independent_batch", `origin-cook:${index}`) } }));
    const before = JSON.stringify({ matching, rows }); const result = evaluate(rows, matching);
    expect(result.status).toBe(eligible ? "fixture_candidate" : "unavailable");
    expect(result.correctedGrams).toBe(eligible ? 180 : null); expect(result.eligibleBatchIds).toHaveLength(eligible ? 3 : 0);
    expect(result.apply).toBe(false); expect(JSON.stringify({ matching, rows })).toBe(before);
  });
  it.each(["planned", "reported_actual"] as const)("does not combine a target's %s origin with the other valid quantity-use path", targetOrigin => {
    const data = input(); data.rows[0] = { ...data.rows[0], quantityOrigin: targetOrigin };
    const target = context(data); const other = input();
    const sampleOrigin = targetOrigin === "planned" ? "reported_actual" : "planned";
    other.rows[0] = { ...other.rows[0], quantityOrigin: sampleOrigin };
    const rows = [1, 2, 3].map(index => observation(index, 180, { context: context(other), facts: { ...facts,
      actualIngredients: confirmed(sampleOrigin === "planned" ? "matches_pinned_quantities" : "reported_actual"),
      independence: confirmed("independent_batch", `separate-origin-cook:${index}`) } }));
    const result = evaluate(rows, target);
    expect(result.correctedGrams).toBeNull(); expect(result.eligibleBatchIds).toHaveLength(0);
    expect(result.rejected.every(row => row.reason === "context_mismatch")).toBe(true);
  });
  it.each(["ownerUuid", "accountGeneration"] as const)("keeps another %s outside the personal cohort", key => {
    const changed = key === "ownerUuid" ? observation(3, 180, { ownerUuid: "owner-B" }) : observation(3, 180, { accountGeneration: 4 });
    const result = evaluate([observation(1), observation(2), changed]);
    expect(result.reason).toBe("insufficient_independent_batches"); expect(result.rejected[0].reason).toBe("owner_mismatch");
  });
  it.each(["qa", "automatic", "legacy"] as const)("excludes %s records even when their numeric value is plausible", origin => {
    const result = evaluate([observation(1), observation(2), observation(3, 180, { origin })]);
    expect(result.rejected[0].reason).toBe("excluded_origin"); expect(result.correctedGrams).toBeNull();
  });
  it.each(["conditional_estimate", "manual_estimate", "historical_estimate", "legacy_unknown", "unavailable"] as const)("never promotes %s to a measured answer", source => {
    const result = evaluate([observation(1), observation(2), observation(3, 180, { source })]);
    expect(result.rejected[0].reason).toBe("not_reported_measurement");
  });
  it.each(["superseded", "invalidated"] as const)("excludes an observation marked %s", state => {
    expect(evaluate([observation(1, 180, { state })]).rejected[0].reason).toBe("stale_or_invalidated");
  });
  it("excludes a revision changed after recording and does not automatically pick a newer replacement", () => {
    expect(evaluate([observation(1, 180, { currentRevision: 2 })]).rejected[0].reason).toBe("stale_or_invalidated");
  });
  it.each(Object.keys(facts) as (keyof PersonalMeasurementFacts)[])("requires explicit confirmed %s evidence rather than a label or inferred fact", key => {
    const pending = { ...facts }; delete pending[key];
    expect(evaluate([observation(1, 180, { facts: pending })]).rejected[0].reason).toBe("measurement_unconfirmed");
    const inferred = { ...facts, [key]: { ...facts[key], status: "inferred" } };
    expect(evaluate([observation(1, 180, { facts: inferred })]).rejected[0].reason).toBe("measurement_unconfirmed");
  });
  it.each([
    { wholeDish: confirmed("leftover" as const) }, { wholeDish: confirmed("portion" as const) },
    { container: confirmed("included" as const) }, { timing: confirmed("after_consumption" as const) },
    { edibleLiquids: confirmed("excluded" as const) }, { actualIngredients: { ...facts.actualIngredients, evidenceRef: null } },
  ])("rejects partial, remaining, untared or post-consumption measurements: %j", patch => {
    expect(evaluate([observation(1, 180, { facts: { ...facts, ...patch } })]).rejected[0].reason).toBe("measurement_unconfirmed");
  });
  it("keeps today's one-field C01 reports at zero eligible samples without invented quality facts", () => {
    const result = evaluate([observation(1, 180, { facts: null }), observation(2, 180, { facts: null }), observation(3, 180, { facts: null })]);
    expect(result.eligibleBatchIds).toEqual([]); expect(result.correctedGrams).toBeNull();
    expect(evaluate([observation(1, 180, { facts: undefined })]).rejected[0].reason).toBe("measurement_unconfirmed");
    const current = input();
    current.rows[0] = { ...current.rows[0], preparationState: unknown(), role: unknown() };
    current.segments[0] = { ...current.segments[0], method: { ...confirmed("no_heat"), status: "inferred" },
      boundary: { ...confirmed("entire_edible"), status: "inferred" }, drainage: { ...confirmed("none"), status: "inferred" },
      addedMedia: unknown(), protocol: { ...confirmed("snapshot-mix-only-v1"), status: "inferred" }, transformation: { kind: "inferred_closed_mix" } };
    const target = context(current);
    expect(target.prediction.totalGrams).toBe(200);
    expect(evaluate([observation(1), observation(2), observation(3)], target).reason).toBe("target_context_unconfirmed");
  });
  it.each(["batchId", "sessionId", "observationId"] as const)("rejects all duplicate %s entries so they cannot create three independent cooks", key => {
    const first = observation(1); const duplicate = observation(2, 180, { [key]: first[key] });
    const result = evaluate([first, duplicate, observation(3)]);
    expect(result.eligibleBatchIds).toEqual(["batch-3"]); expect(result.rejected.map(row => row.reason)).toEqual(["duplicate_observation", "duplicate_observation"]);
  });
  it("does not count one repeated independence proof as multiple cooks with new labels", () => {
    const sharedFacts = { ...facts, independence: confirmed("independent_batch", "same-cook-proof") };
    const result = evaluate([observation(1, 180, { facts: sharedFacts }), observation(2, 180, { facts: sharedFacts }), observation(3)]);
    expect(result.eligibleBatchIds).toEqual(["batch-3"]); expect(result.rejected.map(row => row.reason)).toEqual(["duplicate_observation", "duplicate_observation"]);
  });
  it.each([0, -1, NaN, Infinity])("rejects an invalid measurement %s", measured => {
    expect(evaluate([observation(1, measured)]).rejected[0].reason).toBe("invalid_observation");
  });
  it("rejects a measurement beyond the full frozen input mass without altering the source value", () => {
    const row = observation(1, 201);
    expect(evaluate([row]).rejected[0].reason).toBe("physical_bound_exceeded"); expect(row.measuredGrams).toBe(201);
  });
  it("requires a named explicit synthetic quality policy and applies no invented tolerance or retention period", () => {
    const args = { ownerUuid: "owner-A", accountGeneration: 3, target: context(), observations: [observation(1), observation(2), observation(3)] };
    expect(evaluatePersonalWeightCorrection(args).reason).toBe("quality_policy_missing");
    for (const patch of [{ validationEvidenceRef: "" }, { minimumRatio: 0 }, { minimumRatio: 2 }, { maximumRatio: Infinity }, { maximumMedianRelativeDeviation: -1 }]) {
      expect(evaluatePersonalWeightCorrection({ ...args, policy: { ...policy, ...patch } }).reason).toBe("quality_policy_invalid");
    }
    const missingVersion = { ...policy }; expect(Reflect.deleteProperty(missingVersion, "version")).toBe(true);
    expect(evaluatePersonalWeightCorrection({ ...args, policy: missingVersion }).reason).toBe("quality_policy_invalid");
    const unapproved = { ...policy }; expect(Reflect.set(unapproved, "scope", "production")).toBe(true);
    expect(evaluatePersonalWeightCorrection({ ...args, policy: unapproved }).reason).toBe("quality_policy_invalid");
  });
  it("excludes numeric outliers only with supplied bounds and closes an unstable cohort", () => {
    const outlier = observation(3, 10);
    const result = evaluate([observation(1, 180), observation(2, 182), outlier]);
    expect(result.rejected[0].reason).toBe("ratio_outside_policy"); expect(result.correctedGrams).toBeNull(); expect(outlier.measuredGrams).toBe(10);
    expect(evaluate([observation(1, 80), observation(2, 140), observation(3, 200)]).reason).toBe("unstable_ratios");
  });
  it.each(["recipe", "product", "product-version", "unit", "conversion-version", "state", "protocol", "model-input", "catalog"])("isolates a changed %s context", change => {
    const data = input();
    if (change === "recipe") data.recipeSnapshotId = "different-content-version";
    if (change === "product") data.rows[0] = { ...data.rows[0], sourceId: "product-B" };
    if (change === "product-version") data.rows[0] = { ...data.rows[0], sourceVersion: "nutrition-fixed-v2" };
    if (change === "unit") data.rows[0] = { ...data.rows[0], amount: 0.2, unit: "kg" };
    if (change === "conversion-version") data.rows[0] = { ...data.rows[0], gramsEvidence: { ...data.rows[0].gramsEvidence!, version: "other-proof" } };
    if (change === "state") data.rows[0] = { ...data.rows[0], preparationState: confirmed("cooked") };
    if (change === "protocol") data.segments[0] = { ...data.segments[0], protocol: confirmed("different-protocol") };
    const changed = { ...context(data), inputVersion: change === "model-input" ? "snapshot-weight-v3" : "snapshot-weight-v2",
      catalogVersion: change === "catalog" ? "different-catalog-v2" : "synthetic-catalog-v1" };
    const result = evaluate([observation(1), observation(2), observation(3, 180, { context: changed })]);
    expect(result.rejected[0].reason).toBe("context_mismatch"); expect(result.correctedGrams).toBeNull();
  });
  it("refuses extrapolation to larger or even slightly different batch sizes without a validated scale contract", () => {
    for (const servings of [2.01, 4]) {
      const data = input(); data.cookingServings = servings;
      data.rows[0] = { ...data.rows[0], amount: servings * 100, grams: servings * 100 };
      const result = evaluate([observation(1), observation(2), observation(3)], context(data));
      expect(result.rejected.every(row => row.reason === "scale_mismatch")).toBe(true); expect(result.correctedGrams).toBeNull();
    }
  });
  it("keeps a previous stored model out of the current-model cohort", () => {
    const current = context();
    // Deliberate old JSON shape: the runtime guard must reject this obsolete enum.
    const old = { ...current, prediction: { ...current.prediction } };
    expect(Reflect.set(old.prediction, "modelVersion", "bounded-weight-v1")).toBe(true);
    expect(evaluate([observation(1, 180, { context: old })]).rejected[0].reason).toBe("context_unconfirmed");
  });
  it.each(["method", "boundary", "drainage"] as const)("separates the confirmed %s even when the baseline grams happen to be equal", field => {
    const data = input();
    data.segments[0] = { ...data.segments[0], transformation: { kind: "known_external_loss", grams: confirmed(0), coverage: confirmed("all_external_outflow") } };
    const target = context(data); const changed = input();
    changed.segments[0] = { ...data.segments[0] };
    if (field === "method") changed.segments[0] = { ...changed.segments[0], method: confirmed("boiling") };
    if (field === "boundary") changed.segments[0] = { ...changed.segments[0], boundary: confirmed("drained_edible") };
    if (field === "drainage") changed.segments[0] = { ...changed.segments[0], drainage: confirmed("drained") };
    const changedContext = context(changed);
    expect(changedContext.prediction.totalGrams).toBe(target.prediction.totalGrams);
    const result = evaluate([observation(1, 180, { context: target }), observation(2, 180, { context: target }),
      observation(3, 180, { context: changedContext })], target);
    expect(result.rejected[0].reason).toBe("context_mismatch"); expect(result.correctedGrams).toBeNull();
  });
});
