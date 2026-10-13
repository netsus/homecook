import type { RecipeNutritionSourceAttribution } from "./recipe-nutrition-calculator";

export const INGREDIENT_QUANTITY_POLICY_VERSION = "ingredient-units-v4";
export type IngredientBasisUnit = "g" | "ml";
export interface IngredientUnitSource extends RecipeNutritionSourceAttribution {
  id: string;
  review_status: string;
  is_active: boolean;
  freshness_status: string;
}
interface ReviewedEvidence {
  id: string;
  review_status: string;
  is_active: boolean;
  source: IngredientUnitSource;
}
export interface IngredientVolumeDefinition extends ReviewedEvidence {
  kind: "volume_definition";
  raw_unit: string;
  volume_ml: number;
  /** A contradictory reference stays unresolved instead of overriding raw text. */
  reference_volume_ml?: number | null;
}
interface IngredientMeasurement extends ReviewedEvidence {
  ingredient_id: string;
  preparation_state: string;
  edible_portion_basis: "edible" | "as_purchased";
  quality: "measured" | "average";
}
export interface IngredientDensityEvidence extends IngredientMeasurement {
  kind: "density";
  grams_per_ml: number;
}
export interface IngredientPieceEvidence extends IngredientMeasurement {
  kind: "piece";
  physical_unit: string;
  size_code: string;
  weight_g: number;
  observed_unit: string;
  observed_amount: number;
  observed_weight_g: number;
}
/** Hydrated from reviewed predecessors; never trusted from a submitted draft. */
export interface IngredientUnitContext {
  edible_portion_basis: "edible" | "as_purchased";
  /** Origin of this raw recipe quantity, to which source cup/spoon definitions bind. */
  source_id?: string | null;
  volume_definitions?: IngredientVolumeDefinition[];
  densities?: IngredientDensityEvidence[];
  pieces?: IngredientPieceEvidence[];
}
export interface IngredientQuantityInput {
  ingredient_id: string | null;
  preparation_state: string | null;
  size_code?: string | null;
  amount: number | null;
  unit: string | null;
  unit_context?: IngredientUnitContext;
}
export type IngredientQuantityResult =
  | { status: "resolved"; amount: number; unit: IngredientBasisUnit; quality: "direct" | "estimated";
      evidence_ids: string[]; sources: IngredientUnitSource[] }
  | { status: "unavailable"; reason: "INVALID_QUANTITY" | "UNIT_DEFINITION_REQUIRED" | "UNIT_DEFINITION_CONFLICT"
      | "PIECE_IDENTITY_REQUIRED" | "DENSITY_REQUIRED" | "AMBIGUOUS_EVIDENCE" };

const APP_VOLUME_UNITS: Readonly<Record<string, number>> = {
  "계량큰술": 15, "계량작은술": 5, "계량컵(200mL)": 200,
};
const PIECE_UNITS = ["개", "알", "쪽", "통", "장", "대", "줄기", "모", "줌", "꼬집", "밥숟가락", "스푼", "숟갈", "밥숟갈", "숟가락", "왕큰술", "piece", "pieces"];
const positive = (value: number) => Number.isFinite(value) && value > 0;
const present = (value: string | null | undefined) => typeof value === "string" && value.trim().length > 0;
function approved(evidence: ReviewedEvidence) {
  return present(evidence.id) && evidence.review_status === "approved" && evidence.is_active === true
    && present(evidence.source.id) && present(evidence.source.source_version)
    && evidence.source.review_status === "approved" && evidence.source.is_active === true
    && evidence.source.freshness_status === "current";
}
function matchesMeasurement(input: IngredientQuantityInput, evidence: IngredientMeasurement) {
  return approved(evidence) && present(input.ingredient_id) && present(input.preparation_state)
    && (input.unit_context?.edible_portion_basis === "edible" || input.unit_context?.edible_portion_basis === "as_purchased")
    && evidence.ingredient_id === input.ingredient_id && evidence.preparation_state === input.preparation_state
    && evidence.edible_portion_basis === input.unit_context?.edible_portion_basis
    && (evidence.quality === "measured" || evidence.quality === "average");
}

export function resolveIngredientQuantity(input: IngredientQuantityInput, target: IngredientBasisUnit): IngredientQuantityResult {
  const rawUnit = input.unit?.trim(); // T and t remain distinct source units.
  if (input.amount === null || !positive(input.amount) || !rawUnit) return { status: "unavailable", reason: "INVALID_QUANTITY" };
  let unit: IngredientBasisUnit;
  let amount = input.amount;
  let quality: "direct" | "estimated" = "direct";
  const used: ReviewedEvidence[] = [];
  if (rawUnit === "g" || rawUnit === "kg") {
    unit = "g";
    if (rawUnit === "kg") amount *= 1000;
  } else if (["ml", "mL", "l", "L"].includes(rawUnit)) {
    unit = "ml";
    if (rawUnit === "l" || rawUnit === "L") amount *= 1000;
  } else if (Object.hasOwn(APP_VOLUME_UNITS, rawUnit)) {
    unit = "ml";
    amount *= APP_VOLUME_UNITS[rawUnit];
  } else {
    const definitions = (input.unit_context?.volume_definitions ?? []).filter((row) =>
      row.kind === "volume_definition" && row.raw_unit === rawUnit && approved(row)
      && present(input.unit_context?.source_id) && row.source.id === input.unit_context?.source_id);
    if (definitions.length > 1) return { status: "unavailable", reason: "AMBIGUOUS_EVIDENCE" };
    const definition = definitions[0];
    if (definition) {
      if (!positive(definition.volume_ml) || (definition.reference_volume_ml !== null && definition.reference_volume_ml !== undefined
        && definition.reference_volume_ml !== definition.volume_ml)) return { status: "unavailable", reason: "UNIT_DEFINITION_CONFLICT" };
      unit = "ml";
      amount *= definition.volume_ml;
      used.push(definition);
    } else {
      const pieces = (input.unit_context?.pieces ?? []).filter((row) => PIECE_UNITS.includes(rawUnit) && row.kind === "piece"
        && row.physical_unit === rawUnit && present(input.size_code) && row.size_code === input.size_code
        && row.observed_amount === 1 && row.observed_unit.trim().replace(/^1\s*/, "") === rawUnit
        && row.observed_weight_g === row.weight_g
        && positive(row.weight_g) && matchesMeasurement(input, row));
      if (pieces.length > 1) return { status: "unavailable", reason: "AMBIGUOUS_EVIDENCE" };
      const piece = pieces[0];
      if (!piece) return { status: "unavailable", reason: PIECE_UNITS.includes(rawUnit) ? "PIECE_IDENTITY_REQUIRED" : "UNIT_DEFINITION_REQUIRED" };
      unit = "g";
      amount *= piece.weight_g;
      quality = piece.quality === "average" ? "estimated" : "direct";
      used.push(piece);
    }
  }
  if (unit !== target) {
    const densities = (input.unit_context?.densities ?? []).filter((row) => row.kind === "density"
      && positive(row.grams_per_ml) && matchesMeasurement(input, row));
    if (densities.length > 1) return { status: "unavailable", reason: "AMBIGUOUS_EVIDENCE" };
    const density = densities[0];
    if (!density) return { status: "unavailable", reason: "DENSITY_REQUIRED" };
    amount = target === "g" ? amount * density.grams_per_ml : amount / density.grams_per_ml;
    if (density.quality === "average") quality = "estimated";
    used.push(density);
  }
  if (!positive(amount)) return { status: "unavailable", reason: "INVALID_QUANTITY" };
  return { status: "resolved", amount, unit: target, quality,
    evidence_ids: used.map((row) => row.id), sources: used.map((row) => row.source) };
}

export function getIngredientUnitChoices(input: IngredientQuantityInput, basis: IngredientBasisUnit, preferredUnit?: string) {
  const canonicalChoice = (unit: string) => unit === "mL" ? "ml" : unit === "L" ? "l" : unit;
  const candidates = [...new Set([
    preferredUnit, input.unit, ...(input.unit_context?.pieces ?? []).map((row) => row.physical_unit),
    basis, basis === "g" ? "kg" : "L", "g", "kg", "mL", "L",
    ...Object.keys(APP_VOLUME_UNITS), ...(input.unit_context?.volume_definitions ?? []).map((row) => row.raw_unit),
  ].flatMap((unit) => unit ? [canonicalChoice(unit)] : []))];
  const allowed = candidates.flatMap((unit) => {
    const quantity = resolveIngredientQuantity({ ...input, amount: 1, unit }, basis);
    return quantity.status === "resolved" ? [{ unit, label: unit === "ml" ? "mL" : unit === "l" ? "L" : unit,
      normalized_amount: quantity.amount, normalized_unit: quantity.unit,
      quality: quantity.quality, evidence_ids: quantity.evidence_ids }] : [];
  });
  return { recommended: allowed[0] ?? null, alternatives: allowed.slice(1, 4), other: allowed.slice(4),
    preserved_raw_unit: input.unit, policy_version: INGREDIENT_QUANTITY_POLICY_VERSION };
}
