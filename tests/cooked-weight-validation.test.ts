import { describe, expect, it } from "vitest";
import { evaluateSnapshotWeightCases, type WeightValidationCase, type WeightValidationReference } from "@/lib/server/cooked-weight-validation";

const snapshotId = "550e8400-e29b-41d4-a716-446655440001";
const methodId = "550e8400-e29b-41d4-a716-446655440002";
function sample(id: string, patch: Partial<WeightValidationReference> = {}): WeightValidationCase {
  return { caseId: id, independentBatchId: `batch-${id}`, input: { snapshotId, baseServings: 2, cookingServings: 2,
    ingredients: [{ id: "row-1", ingredient_id: "550e8400-e29b-41d4-a716-446655440003", amount: 100, unit: "g",
      scalable: true, ingredient_type: "QUANT", preparation_state: null }],
    snapshotSteps: [{ step_number: 1, instruction: "섞는다", cooking_method_id: methodId, heat_level: null }],
    cookingSteps: [{ step_number: 1, instruction: "섞는다", cooking_method: { code: "MIX", label: "섞기", color_key: "green" },
      ingredients_used: [], heat_level: null, duration_seconds: null, duration_text: null }] },
    // Synthetic test of the reviewer adapter contract; not an actual measured dish.
    reference: { origin: "reviewed_physical", measuredGrams: 80, reviewEvidenceRef: `synthetic-review:${id}`,
      recipeSnapshotId: snapshotId, baseServings: 2, cookingServings: 2, matchesWholeDishAndPinnedInput: true, ...patch } };
}

describe("offline cooked weight validation, not collection or an accuracy gate", () => {
  it("never invents an accuracy result for no real reviewed references", () => {
    const empty = evaluateSnapshotWeightCases([]);
    expect(empty.coverage.estimateRate).toBeNull();
    expect(empty.accuracy).toEqual({ status: "unavailable", matchedIndependentBatches: 0,
      meanAbsoluteErrorGrams: null, meanSignedErrorGrams: null, meanAbsolutePercentageError: null });
    const fixtures = evaluateSnapshotWeightCases([
      sample("qa-200g", { origin: "qa", measuredGrams: 200 }), sample("synthetic", { origin: "synthetic" }),
      sample("self-report", { origin: "reported_only" }), { ...sample("no-reference"), reference: null },
    ]);
    expect(fixtures.coverage).toMatchObject({ evaluated: 4, estimated: 4, estimateRate: 1 });
    expect(fixtures.accuracy).toEqual(empty.accuracy);
    expect(fixtures.apply).toBe(false); expect(fixtures.accuracyValidated).toBe(false);
  });
  it("reports signed bias separately from absolute errors and uses measured g as the percentage denominator", () => {
    const result = evaluateSnapshotWeightCases([sample("a"), sample("b", { measuredGrams: 120 })]);
    expect(result.accuracy).toMatchObject({ status: "descriptive_only", matchedIndependentBatches: 2,
      meanAbsoluteErrorGrams: 20, meanSignedErrorGrams: 0 });
    expect(result.accuracy.meanAbsolutePercentageError).toBeCloseTo((25 + 100 / 6) / 2);
    expect(result.accuracyValidated).toBe(false);
  });
  it("keeps unavailable predictions in the coverage denominator, not the accuracy denominator", () => {
    const unknown = sample("unknown");
    unknown.input.ingredients[0].unit = "mL"; // No density: never assume g = mL.
    const result = evaluateSnapshotWeightCases([sample("known"), unknown]);
    expect(result.coverage).toMatchObject({ evaluated: 2, estimated: 1, unavailable: 1, estimateRate: 0.5,
      unavailableReasons: { quantity_conversion_missing: 1 } });
    expect(result.accuracy.matchedIndependentBatches).toBe(1);
    expect(result.exclusions).toContainEqual({ caseId: "unknown", reason: "prediction_unavailable" });
  });
  it("counts an unavailable reason once per case even when multiple rows have the same issue", () => {
    const row = sample("unknown");
    row.input.ingredients = [0, 1].map(index => ({ ...row.input.ingredients[0], id: `row-${index}`, amount: null,
      unit: null, ingredient_type: "TO_TASTE" as const }));
    expect(evaluateSnapshotWeightCases([row]).coverage.unavailableReasons).toEqual({ unquantified_ingredient: 1 });
  });
  it.each([0, -1, NaN, Infinity])("excludes invalid measurement %s without a zero error or percentage", measuredGrams => {
    const result = evaluateSnapshotWeightCases([sample("bad", { measuredGrams })]);
    expect(result.accuracy.status).toBe("unavailable");
    expect(result.exclusions).toEqual([{ caseId: "bad", reason: "invalid_measurement" }]);
  });
  it.each([
    { reviewEvidenceRef: null }, { matchesWholeDishAndPinnedInput: false }, { recipeSnapshotId: "other-snapshot" },
    { baseServings: 3 }, { cookingServings: 3 },
  ])("rejects unmatched or unreviewed whole-dish context %j", patch => {
    const result = evaluateSnapshotWeightCases([sample("unmatched", patch)]);
    expect(result.accuracy.status).toBe("unavailable");
    expect(result.exclusions).toEqual([{ caseId: "unmatched", reason: "measurement_context_unconfirmed" }]);
  });
  it("excludes every duplicate batch or case instead of treating repeated saves as independent dishes", () => {
    const one = sample("one"), two = sample("two");
    const duplicateBatch = { ...two, independentBatchId: one.independentBatchId };
    const result = evaluateSnapshotWeightCases([one, duplicateBatch, sample("same"), sample("same")]);
    expect(result.coverage.evaluated).toBe(0); expect(result.accuracy.matchedIndependentBatches).toBe(0);
    expect(result.exclusions).toHaveLength(4);
    expect(result.exclusions.every(row => row.reason === "duplicate_case_or_batch")).toBe(true);
  });
  it("does not mutate snapshots, raw quantities, references, or prior results", () => {
    const cases = [sample("immutable")], before = JSON.stringify(cases);
    const first = evaluateSnapshotWeightCases(cases);
    expect(evaluateSnapshotWeightCases(cases)).toEqual(first); expect(JSON.stringify(cases)).toBe(before);
    expect(Object.isFrozen(first.accuracy)).toBe(true); expect(Object.isFrozen(first.exclusions)).toBe(true);
  });
});
