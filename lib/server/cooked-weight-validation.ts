import { predictSnapshotWeight } from "@/lib/server/cooked-weight-snapshot-prediction";

type SnapshotInput = Parameters<typeof predictSnapshotWeight>[0];

/** Supplied by an offline reviewer, never inferred from a saved g value or attestation. */
export interface WeightValidationReference {
  readonly origin: "synthetic" | "qa" | "reported_only" | "reviewed_physical";
  readonly measuredGrams: number;
  readonly reviewEvidenceRef: string | null;
  readonly recipeSnapshotId: string;
  readonly baseServings: number;
  readonly cookingServings: number;
  /** Review of whole dish, container excluded, before consumption, edible liquids included,
   * and actual inputs matching this pinned recipe. A user checkbox alone is insufficient. */
  readonly matchesWholeDishAndPinnedInput: boolean;
}

export interface WeightValidationCase {
  readonly caseId: string;
  readonly independentBatchId: string;
  readonly input: SnapshotInput;
  readonly reference?: WeightValidationReference | null;
}

type Exclusion = "duplicate_case_or_batch" | "missing_identity" | "no_reference" | "not_reviewed_physical"
  | "invalid_measurement" | "measurement_context_unconfirmed" | "prediction_unavailable" | "nonfinite_error";

export interface WeightValidationReport {
  readonly version: "cooked-weight-validation-v1";
  readonly scope: "offline_validation";
  readonly apply: false;
  readonly accuracyValidated: false;
  readonly coverage: {
    readonly evaluated: number;
    readonly estimated: number;
    readonly unavailable: number;
    readonly estimateRate: number | null;
    /** Each reason is counted once per unavailable case, not once per ingredient. */
    readonly unavailableReasons: Readonly<Record<string, number>>;
  };
  readonly accuracy: {
    readonly status: "descriptive_only" | "unavailable";
    readonly matchedIndependentBatches: number;
    readonly meanAbsoluteErrorGrams: number | null;
    readonly meanSignedErrorGrams: number | null;
    readonly meanAbsolutePercentageError: number | null;
  };
  readonly exclusions: readonly { readonly caseId: string; readonly reason: Exclusion }[];
}

function positive(value: number) { return Number.isFinite(value) && value > 0; }
function hasText(value: string | null) { return value !== null && value.trim().length > 0; }

/** No IO, collection, training, threshold, production rule change, or record mutation.
 * Coverage fixtures and reviewed physical references are deliberately separate denominators. */
export function evaluateSnapshotWeightCases(cases: readonly WeightValidationCase[]): WeightValidationReport {
  const counts = new Map<string, number>();
  for (const row of cases) {
    for (const key of [`case:${row.caseId}`, `batch:${row.independentBatchId}`]) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const exclusions: Array<{ caseId: string; reason: Exclusion }> = [];
  const reasons: Record<string, number> = {};
  let evaluated = 0, estimated = 0, matched = 0;
  let absoluteMean = 0, signedMean = 0, percentageMean = 0;
  for (const row of cases) {
    const exclude = (reason: Exclusion) => exclusions.push(Object.freeze({ caseId: row.caseId, reason }));
    if (!hasText(row.caseId) || !hasText(row.independentBatchId)) { exclude("missing_identity"); continue; }
    if (counts.get(`case:${row.caseId}`) !== 1 || counts.get(`batch:${row.independentBatchId}`) !== 1) {
      exclude("duplicate_case_or_batch"); continue;
    }
    const result = predictSnapshotWeight(row.input).prediction;
    evaluated += 1;
    if (result.totalGrams !== null) estimated += 1;
    else for (const code of new Set(result.reasons.map(reason => reason.code))) reasons[code] = (reasons[code] ?? 0) + 1;
    const reference = row.reference;
    if (!reference) { exclude("no_reference"); continue; }
    if (reference.origin !== "reviewed_physical") { exclude("not_reviewed_physical"); continue; }
    if (!positive(reference.measuredGrams)) { exclude("invalid_measurement"); continue; }
    if (!hasText(reference.reviewEvidenceRef) || !reference.matchesWholeDishAndPinnedInput
      || reference.recipeSnapshotId !== row.input.snapshotId || reference.baseServings !== row.input.baseServings
      || reference.cookingServings !== row.input.cookingServings) { exclude("measurement_context_unconfirmed"); continue; }
    if (result.totalGrams === null) { exclude("prediction_unavailable"); continue; }
    const error = result.totalGrams - reference.measuredGrams;
    const percentage = Math.abs(error) / reference.measuredGrams * 100;
    if (!Number.isFinite(error) || !Number.isFinite(percentage)) { exclude("nonfinite_error"); continue; }
    matched += 1;
    // Weighted means avoid overflowing a sum of otherwise finite measurements.
    absoluteMean = absoluteMean * ((matched - 1) / matched) + Math.abs(error) / matched;
    signedMean = signedMean * ((matched - 1) / matched) + error / matched;
    percentageMean = percentageMean * ((matched - 1) / matched) + percentage / matched;
  }
  return Object.freeze({ version: "cooked-weight-validation-v1", scope: "offline_validation", apply: false, accuracyValidated: false,
    coverage: Object.freeze({ evaluated, estimated, unavailable: evaluated - estimated,
      estimateRate: evaluated ? estimated / evaluated : null, unavailableReasons: Object.freeze(reasons) }),
    accuracy: Object.freeze({ status: matched ? "descriptive_only" : "unavailable", matchedIndependentBatches: matched,
      meanAbsoluteErrorGrams: matched ? absoluteMean : null, meanSignedErrorGrams: matched ? signedMean : null,
      meanAbsolutePercentageError: matched ? percentageMean : null }), exclusions: Object.freeze(exclusions) });
}
