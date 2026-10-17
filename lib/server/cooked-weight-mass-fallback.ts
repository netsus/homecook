import type { SnapshotWeightPrediction } from "@/lib/server/cooked-weight-snapshot-prediction";

export const INGREDIENT_MASS_FALLBACK_VERSION = "ingredient-mass-75-v1";
export const INGREDIENT_MASS_FALLBACK_ASSUMPTION = "ingredient_mass_seventy_five_percent";

// Only cooking-condition failures qualify. Quantity, identity and evidence
// failures never become an apparently known total through this fallback.
const CONDITION_REASONS = new Set(["missing_segments", "row_role_unconfirmed", "boundary_unconfirmed", "boundary_condition_mismatch",
  "rule_not_found", "rule_condition_unconfirmed", "rule_condition_mismatch"]);

// Match PostgreSQL numeric on the serialized row values, including exponent
// notation. Summing binary floats before rounding loses half-cent boundaries.
function estimateRoundedMass(values: readonly number[]): number {
  const decimals = values.map(value => {
    const [mantissa, exponent = "0"] = String(value).toLowerCase().split("e");
    const [whole, fraction = ""] = mantissa.split(".");
    return { digits: BigInt(whole + fraction), scale: fraction.length - Number(exponent) };
  });
  const scale = Math.max(0, ...decimals.map(value => value.scale));
  const sum = decimals.reduce((total, value) => total + value.digits * BigInt(10) ** BigInt(scale - value.scale), BigInt(0));
  const divisor = BigInt(10) ** BigInt(scale);
  const cents = (sum * BigInt(75) * BigInt(2) + divisor) / (divisor * BigInt(2));
  return Number(cents) / 100;
}

export function withIngredientMassFallback(evidence: SnapshotWeightPrediction): SnapshotWeightPrediction {
  const original = evidence.prediction;
  if (original.totalGrams !== null || original.scope !== "candidate" || !original.input
    || original.reasons.length === 0 || original.reasons.some(reason => !CONDITION_REASONS.has(reason.code))) return evidence;
  const rows = original.input.rows;
  if (!rows.length || rows.length > 200 || new Set(rows.map(row => row.rowKey)).size !== rows.length) return evidence;
  const masses: number[] = [];
  for (const row of rows) {
    if (row.quantityKind !== "quantitative" || !row.sourceId || !row.rowKey
      || !["planned", "reported_actual"].includes(row.quantityOrigin) || !row.unit
      || row.amount === null || !Number.isFinite(row.amount) || row.amount <= 0
      || row.grams === null || !Number.isFinite(row.grams) || row.grams <= 0
      || row.gramsEvidence?.status !== "confirmed") return evidence;
    const proof = row.gramsEvidence;
    if (proof.kind === "direct_mass") {
      const unit = row.unit.trim().toLowerCase();
      if (unit !== "g" && unit !== "kg") return evidence;
      const expected = row.amount * (unit === "kg" ? 1000 : 1);
      if (Math.abs(expected - row.grams) > Number.EPSILON * Math.max(1, expected) * 8) return evidence;
    } else if (!proof.evidenceId || !proof.version || (row.sourceKind === "food_product"
      ? proof.kind !== "product_relation" || proof.version !== row.sourceVersion : proof.kind !== "ingredient_conversion")) return evidence;
    masses.push(row.grams);
  }
  const grams = estimateRoundedMass(masses);
  if (!Number.isFinite(grams) || grams <= 0) return evidence;
  return Object.freeze({ ...evidence, prediction: Object.freeze({ ...original,
    modelVersion: INGREDIENT_MASS_FALLBACK_VERSION, status: "estimated" as const, totalGrams: grams,
    learningEligible: false as const, appliedRules: Object.freeze([]),
    assumptions: Object.freeze([INGREDIENT_MASS_FALLBACK_ASSUMPTION]),
  }) });
}
