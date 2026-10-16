import { calculateRecipeIngredientWeightGrams, type RecipeNutritionIngredientInput } from "@/lib/nutrition/recipe-nutrition-calculator";
import { predictCookedWeight, type CookedWeightFact, type CookedWeightPrediction, type CookedWeightRow } from "@/lib/server/cooked-weight-prediction";
import { isUuid } from "@/lib/server/cooked-batches";
import type { CookingModeStep } from "@/types/cooking";
import { convertProductQuantity } from "@/lib/nutrition/product-quantity";
import { pieceWeightMatchesIngredient } from "@/lib/nutrition/ingredient-piece-units.mjs";
import { isQuantityInputSnapshot, parseQuantityInput } from "@/lib/quantity-input";
import { FOOD_PRODUCT_BASIS_UNITS } from "@/types/food-product";
import type { CookingWeightSnapshotIngredient } from "@/lib/server/cooked-batch-weight-estimate";

export const COOKED_WEIGHT_INPUT_VERSION = "snapshot-weight-v2";

export interface SnapshotWeightPrediction {
  readonly schemaVersion: "cooked-weight-evidence-v1";
  readonly inputVersion: typeof COOKED_WEIGHT_INPUT_VERSION;
  readonly catalogVersion: "usda-release2-2014";
  readonly recipeSnapshotId: string;
  readonly baseServings: number;
  readonly cookingServings: number;
  readonly rawRows: readonly {
    readonly rowKey: string;
    readonly amount: number | null;
    readonly unit: string | null;
    readonly scalable: boolean;
  }[];
  readonly methodSteps: readonly SnapshotWeightMethodStep[];
  readonly prediction: CookedWeightPrediction;
}

export interface SnapshotWeightMethodStep {
  readonly stepNumber: number;
  readonly methodIds: readonly string[];
  readonly methodCodes: readonly string[];
  readonly heatLevel: string | null;
  readonly durationSeconds: number | null;
  readonly conflicts: readonly string[];
  readonly status: "inferred" | "unknown";
  readonly evidenceRef: string | null;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Text may veto a structured MIX tag, but never establishes a positive method.
function mixInstructionConflicts(instruction: string): string[] {
  const conflicts: string[] = [];
  if (/가열|끓|볶|데우|굽|불에|불을|전자레인지|오븐|\b(?:heat|boil|fry|bake|reheat)\b/iu.test(instruction)) conflicts.push("explicit_heat");
  if (/물기|배수|건져|버리|따라\s*내|짜\s*내|\b(?:drain|discard|strain|squeeze)\b/iu.test(instruction)) conflicts.push("external_outflow");
  if (/(?:물|기름)(?:을|를)?\s*(?:더|추가)|\badd\s+(?:more\s+)?(?:water|oil)\b/iu.test(instruction)) conflicts.push("added_media");
  return conflicts;
}

function frozenMethodProjection(value: unknown): Array<[string, string, string, string | null]> | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 20) return null;
  const projection: Array<[string, string, string, string | null]> = [];
  for (const method of value) {
    if (!record(method) || typeof method.code !== "string" || !method.code.trim()
      || typeof method.label !== "string" || !method.label.trim()
      || typeof method.color_key !== "string" || !method.color_key.trim()
      || (method.category_code !== undefined && method.category_code !== null && typeof method.category_code !== "string")) return null;
    projection.push([method.code, method.label, method.color_key, method.category_code ?? null]);
  }
  return projection;
}

/** Called only with the owner-verified immutable snapshot and its cook-mode projection. */
function methodSteps(snapshotId: string, raw: readonly unknown[], projected: readonly CookingModeStep[]): SnapshotWeightMethodStep[] {
  if (raw.length > 200 || projected.length !== raw.length) return [];
  const numbers = new Set<number>();
  return raw.map((value, index) => {
    const row = record(value) ? value : null;
    const stepNumber = row && typeof row.step_number === "number" && Number.isSafeInteger(row.step_number) ? row.step_number : index + 1;
    const plural = row?.cooking_method_ids;
    const noPlural = plural === undefined || plural === null || (Array.isArray(plural) && plural.length === 0);
    const ids = Array.isArray(plural) && plural.length > 0 ? plural
      : noPlural && row && isUuid(row.cooking_method_id) ? [row.cooking_method_id] : [];
    const matching = projected[index]?.step_number === stepNumber ? projected[index] : undefined;
    const methods = matching?.cooking_methods ?? (matching?.cooking_method ? [matching.cooking_method] : []);
    const codes = methods.map(method => typeof method.code === "string" ? method.code.toUpperCase() : "");
    const frozen = frozenMethodProjection(row?.cooking_methods);
    const current = frozenMethodProjection(methods);
    // Newer server snapshots freeze method fields instead of IDs. Never replace
    // malformed declared IDs or look up today's catalog to invent a missing ID.
    const frozenRef = noPlural && (row?.cooking_method_id === undefined || row?.cooking_method_id === null)
      && frozen && current && JSON.stringify(frozen) === JSON.stringify(current) ? JSON.stringify(frozen) : null;
    const validMethods = ids.length > 0 && ids.length <= 20 && ids.every(isUuid)
      && new Set(ids).size === ids.length && methods.length === ids.length;
    const heat = matching?.heat_level ?? null;
    const conflicts = row && typeof row.instruction === "string" && codes.every(code => code === "MIX") ? mixInstructionConflicts(row.instruction) : [];
    const complete = Boolean(row && row.step_number === index + 1 && stepNumber > 0 && !numbers.has(stepNumber)
      && typeof row.instruction === "string" && row.instruction.trim().length > 0 && row.instruction === matching?.instruction
      && (validMethods || frozenRef !== null)
      && codes.every(code => code.length > 0) && conflicts.length === 0
      && Object.hasOwn(row, "heat_level") && row.heat_level === heat);
    numbers.add(stepNumber);
    return Object.freeze({ stepNumber, methodIds: Object.freeze(ids.filter(isUuid)), methodCodes: Object.freeze(codes),
      heatLevel: heat, durationSeconds: matching?.duration_seconds ?? null, conflicts: Object.freeze(conflicts), status: complete ? "inferred" : "unknown",
      evidenceRef: complete ? frozenRef !== null ? `snapshot:${snapshotId}:step:${stepNumber}:frozen-methods:${frozenRef}`
        : `snapshot:${snapshotId}:step:${stepNumber}:methods:${ids.join(",")}:codes:${codes.join(",")}` : null });
  });
}

function inferredFact<T extends string | number>(value: T, evidenceRef: string): CookedWeightFact<T> {
  return { value, status: "inferred", evidenceRef };
}

function inferredMethod(steps: readonly SnapshotWeightMethodStep[]): CookedWeightFact<"no_heat" | "pan_browning" | "boiling" | "reheating" | "other"> {
  if (steps.length === 0 || steps.some(step => step.status !== "inferred")) return unknownFact();
  const codes = steps.flatMap(step => step.methodCodes);
  const ref = steps.map(step => step.evidenceRef).join("|");
  if (codes.every(code => code === "MIX") && steps.every(step => step.heatLevel === null)) return inferredFact("no_heat", ref);
  if (codes.every(code => ["BOIL", "SIMMER", "BLANCH"].includes(code))) return inferredFact("boiling", ref);
  if (codes.every(code => ["STIR_FRY", "SAUTE", "PAN_FRY"].includes(code))) return inferredFact("pan_browning", ref);
  if (codes.every(code => code === "REHEAT")) return inferredFact("reheating", ref);
  return inferredFact("other", ref);
}

function unknownFact<T extends string | number>(): CookedWeightFact<T> {
  return { value: null, status: "unknown", evidenceRef: null };
}

function gramsEvidence(row: RecipeNutritionIngredientInput, grams: number | null): CookedWeightRow["gramsEvidence"] {
  if (grams === null) return null;
  const unit = row.unit?.trim().toLowerCase();
  if (unit === "g" || unit === "kg") return { kind: "direct_mass", status: "confirmed", evidenceId: null, version: null, quality: "exact" };
  if (row.food_product_id || row.food_product_nutrition_version_id) return { kind: "product_relation", status: "confirmed",
    evidenceId: row.food_product_nutrition_version_id ?? null, version: row.food_product_nutrition_version_id ?? null, quality: "exact" };
  const assignment = row.conversion_assignment;
  const piece = row.piece_weight && pieceWeightMatchesIngredient(row.piece_weight, row) ? row.piece_weight : null;
  const evidence = piece?.evidence ?? assignment?.evidence;
  if (!evidence) return null;
  const evidenceId = piece?.evidence_id ?? evidence.id;
  if (!isUuid(evidenceId)) return null;
  return { kind: "ingredient_conversion", status: "confirmed",
    evidenceId,
    version: evidence.source.source_version, quality: "estimated" };
}

type WeightQuantity = Pick<CookedWeightRow, "amount" | "unit" | "grams" | "gramsEvidence">;

function frozenQuantity(row: CookingWeightSnapshotIngredient, scale: number): WeightQuantity {
  const unknown: WeightQuantity = { amount: row.amount === null ? null : row.amount * scale, unit: row.unit, grams: null, gramsEvidence: null };
  if (!record(row.quantity_input) || row.amount === null || row.unit === null) return unknown;
  const input = { ...row.quantity_input };
  if (Object.hasOwn(input, "context_sha256")) {
    if (typeof input.context_sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(input.context_sha256)) return unknown;
    delete input.context_sha256;
  }
  if (!isQuantityInputSnapshot(input, { amount: row.amount, unit: row.unit }) || !input.display_quantity
    || input.batch_basis !== null || !Number.isFinite(Number(input.numerator))
    || !Number.isFinite(Number(input.denominator))) return unknown;
  const parsed = parseQuantityInput(input.raw_value);
  if (!parsed) return unknown;
  const quantity: WeightQuantity = { amount: parsed.amount * scale, unit: input.raw_unit, grams: null, gramsEvidence: null };
  if (!Number.isFinite(quantity.amount) || !Number.isFinite(scale) || scale <= 0
    || input.quality === "unavailable" || input.reason !== null || input.normalized === null) return quantity;
  const product = Boolean(row.food_product_id || row.food_product_nutrition_version_id);
  if (product && (input.source_versions.length !== 1 || input.source_versions[0] !== row.food_product_nutrition_version_id)) return quantity;
  const rawUnit = input.raw_unit.trim();
  const direct = rawUnit.toLowerCase() === "g" || rawUnit.toLowerCase() === "kg";
  const mass = (amount: number, unit: string) => unit.trim().toLowerCase() === "g" ? amount
    : unit.trim().toLowerCase() === "kg" ? amount * 1000 : null;
  const agrees = (left: number, right: number) => Math.abs(left - right) <= Math.max(1, Math.abs(left), Math.abs(right)) * 1e-12;
  const grams = input.normalized.unit === "g" ? input.normalized.amount
    : product ? convertProductQuantity(input.normalized.amount, "ml", "g", row.product_basis_relations ?? []) : null;
  if (grams === null || !Number.isFinite(grams) || grams <= 0) return quantity;
  const displayGrams = mass(row.amount, row.unit);
  if (displayGrams !== null && !agrees(displayGrams, grams)) return quantity;
  if (product && row.product_basis_relations !== undefined) {
    const converted = convertProductQuantity(parsed.amount, direct ? rawUnit.toLowerCase() : rawUnit, "g", row.product_basis_relations);
    if (converted === null || !agrees(converted, grams)) return quantity;
  }
  const quality = input.quality === "estimated" ? "estimated" : "exact";
  if (direct) {
    const rawGrams = mass(parsed.amount, rawUnit);
    if (rawGrams === null || !agrees(rawGrams, grams)) return quantity;
    return { ...quantity, grams: rawGrams * scale, gramsEvidence: { kind: "direct_mass", status: "confirmed", evidenceId: null, version: null, quality } };
  }
  if (product) {
    if (!FOOD_PRODUCT_BASIS_UNITS.some(unit => unit === rawUnit) && convertProductQuantity(1, rawUnit, "ml", []) === null) return quantity;
    return { ...quantity, grams: grams * scale, gramsEvidence: { kind: "product_relation", status: "confirmed",
      evidenceId: row.food_product_nutrition_version_id ?? null, version: row.food_product_nutrition_version_id ?? null, quality } };
  }
  // A single recorded conversion reference fits the existing evidence contract.
  // Do not discard parts of an ambiguous multi-source conversion to fill it.
  if (input.evidence_ids.length !== 1 || !isUuid(input.evidence_ids[0]) || input.source_versions.length !== 1) return quantity;
  return { ...quantity, grams: grams * scale, gramsEvidence: { kind: "ingredient_conversion", status: "confirmed",
    evidenceId: input.evidence_ids[0], version: input.source_versions[0], quality } };
}

/** Existing snapshots do not assert closed boundaries, drainage, or exact yield protocols. */
export function predictSnapshotWeight({ snapshotId, baseServings, cookingServings, ingredients, snapshotSteps = [], cookingSteps = [] }: {
  snapshotId: string; baseServings: number; cookingServings: number; ingredients: CookingWeightSnapshotIngredient[];
  snapshotSteps?: readonly unknown[]; cookingSteps?: readonly CookingModeStep[];
}): SnapshotWeightPrediction {
  const scale = Number.isFinite(baseServings) && baseServings > 0 ? cookingServings / baseServings : NaN;
  const rows: CookedWeightRow[] = ingredients.map(row => {
    const amount = row.amount === null ? null : row.amount * (row.scalable ? scale : 1);
    const product = Boolean(row.food_product_id || row.food_product_nutrition_version_id);
    const grams = row.ingredient_type === "TO_TASTE" ? null
      : product ? amount !== null && row.unit !== null && row.food_product_id && row.food_product_nutrition_version_id
        ? convertProductQuantity(amount, ["g", "kg"].includes(row.unit.trim().toLowerCase()) ? row.unit.trim().toLowerCase() : row.unit.trim(), "g", row.product_basis_relations ?? []) : null
        : calculateRecipeIngredientWeightGrams([{ ...row, amount }]);
    const quantity = row.ingredient_type !== "TO_TASTE" && Object.hasOwn(row, "quantity_input")
      ? frozenQuantity(row, row.scalable ? scale : 1)
      : { amount: Number.isFinite(amount) ? amount : null, unit: row.unit, grams, gramsEvidence: gramsEvidence(row, grams) };
    return { rowKey: row.id, sourceKind: product ? "food_product" : "ingredient",
      sourceId: product ? row.food_product_id ?? "" : row.ingredient_id ?? "",
      sourceVersion: product ? row.food_product_nutrition_version_id ?? null : null,
      amount: quantity.amount, unit: quantity.unit,
      quantityKind: row.ingredient_type === "TO_TASTE" ? "to_taste" : "quantitative",
      quantityOrigin: "planned", grams: quantity.grams, gramsEvidence: quantity.gramsEvidence,
      preparationState: unknownFact(), role: unknownFact(), foodIdentity: unknownFact() };
  });
  const steps = methodSteps(snapshotId, snapshotSteps, cookingSteps);
  const method = inferredMethod(steps);
  const mixOnly = method.status === "inferred" && method.value === "no_heat";
  const assumptionRef = `assumption:snapshot:${snapshotId}:all-declared-inputs-retained`;
  const prediction = predictCookedWeight({ recipeSnapshotId: snapshotId, cookingServings,
    rows, segments: [{ id: "snapshot-boundary-unknown", rowKeys: rows.map(row => row.rowKey),
      method, boundary: mixOnly ? inferredFact("entire_edible", assumptionRef) : unknownFact(),
      drainage: mixOnly ? inferredFact("none", assumptionRef) : unknownFact(), addedMedia: unknownFact(),
      protocol: mixOnly ? inferredFact("snapshot-mix-only-v1", assumptionRef) : unknownFact(),
      transformation: { kind: mixOnly ? "inferred_closed_mix" : "closed_mix" } }] });
  return Object.freeze({ schemaVersion: "cooked-weight-evidence-v1", inputVersion: COOKED_WEIGHT_INPUT_VERSION,
    catalogVersion: "usda-release2-2014", recipeSnapshotId: snapshotId, baseServings, cookingServings,
    methodSteps: Object.freeze(steps), rawRows: Object.freeze(ingredients.map(row => Object.freeze({ rowKey: row.id, amount: row.amount, unit: row.unit, scalable: row.scalable }))), prediction });
}
