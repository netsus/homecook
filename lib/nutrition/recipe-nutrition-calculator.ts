import { createHash } from "node:crypto";

export const RECIPE_NUTRITION_CALCULATION_VERSION = "recipe-nutrition-v1";
export const RECIPE_NUTRITION_ROUNDING_POLICY_VERSION = "display-v1";

export const CORE_NUTRIENT_CODES = [
  "energy_kcal",
  "carbohydrate_g",
  "protein_g",
  "fat_g",
  "sodium_mg",
] as const;

export const OPTIONAL_NUTRIENT_CODES = [
  "sugars_g",
  "saturated_fat_g",
  "fiber_g",
] as const;

type CoreNutrientCode = (typeof CORE_NUTRIENT_CODES)[number];
type OptionalNutrientCode = (typeof OPTIONAL_NUTRIENT_CODES)[number];
export type RecipeNutrientCode = CoreNutrientCode | OptionalNutrientCode;
export type NutrientStatus = "complete" | "partial" | "unavailable";
export type CalculationQuality = "direct" | "estimated" | "mixed";

export interface RecipeNutritionSourceAttribution {
  provider: string;
  dataset: string;
  source_version: string;
  data_basis_date: string | null;
  license: string;
  source_url: string;
}

export interface RecipeNutritionInputValue {
  amount: number | null;
  value_status: "observed" | "missing" | "trace" | "parse_error";
}

export interface RecipeNutritionIngredientInput {
  id: string;
  ingredient_id: string;
  amount: number | null;
  unit: string | null;
  ingredient_type: "QUANT" | "TO_TASTE";
  scalable: boolean;
  preparation_state: string | null;
  size_code?: string | null;
  nutrition?: {
    link: {
      id: string;
      review_status: string;
      is_active: boolean;
      is_primary: boolean;
      preparation_state: string;
    };
    profile: {
      id: string;
      basis_amount: number;
      basis_unit: "g" | "ml";
      review_status: string;
      is_active: boolean;
      values: Partial<Record<RecipeNutrientCode, RecipeNutritionInputValue | undefined>>;
    };
    source: {
      id: string;
      review_status: string;
      freshness_status: string;
      is_active: boolean;
    } & RecipeNutritionSourceAttribution;
  };
  conversion_assignment?: {
    id: string;
    ingredient_id: string;
    preparation_state: string;
    review_status: string;
    is_active: boolean;
    profile: {
      code: string;
      basis_volume_ml: number;
      representative_weight_g: number;
      is_active: boolean;
    };
    evidence?: {
      review_status: string;
      is_active: boolean;
      source: {
        id: string;
        review_status: string;
        freshness_status: string;
        is_active: boolean;
      } & RecipeNutritionSourceAttribution;
    };
  } | null;
  piece_weight?: {
    id: string;
    ingredient_id: string;
    size_code: string;
    preparation_state: string;
    weight_g: number;
    review_status: string;
    is_active: boolean;
    evidence?: {
      review_status: string;
      is_active: boolean;
      source: {
        id: string;
        review_status: string;
        freshness_status: string;
        is_active: boolean;
      } & RecipeNutritionSourceAttribution;
    };
  } | null;
}

export interface RecipeNutritionCalculatorInput {
  recipe_id: string;
  recipe_version: number | string;
  base_servings: number;
  calculation_version?: string;
  rounding_policy_version?: string;
  ingredients: RecipeNutritionIngredientInput[];
}

export interface RecipeNutritionValue {
  amount: number | null;
  known_amount: number | null;
  status: NutrientStatus;
  display_mode: "total" | "minimum" | null;
}

export interface RecipeNutritionCalculation {
  basis: { amount: number; unit: "serving" };
  base_servings: number;
  values: Partial<Record<RecipeNutrientCode, RecipeNutritionValue>> &
    Record<CoreNutrientCode, RecipeNutritionValue>;
  scalable_values: Partial<Record<RecipeNutrientCode, number>>;
  fixed_values: Partial<Record<RecipeNutrientCode, number>>;
  calculation_status: NutrientStatus;
  calculation_quality: CalculationQuality | null;
  reflected_ingredient_count: number;
  target_ingredient_count: number;
  missing_reasons: string[];
  warnings: string[];
  sources: RecipeNutritionSourceAttribution[];
  input_hash: string;
  calculation_version: string;
  rounding_policy_version: string;
}

export class RecipeNutritionCalculationError extends Error {
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  constructor(
    code: string,
    details: Record<string, unknown> = {},
  ) {
    super(code);
    this.code = code;
    this.details = details;
    this.name = "RecipeNutritionCalculationError";
  }
}

const APPROVED_VOLUME_PROFILES = new Map([
  ["VOLUME_G6", 6],
  ["VOLUME_G10", 10],
  ["VOLUME_G15", 15],
  ["VOLUME_G20", 20],
  ["VOLUME_G25", 25],
]);

const WARNING_PRIORITY = [
  "PREDECESSOR_NOT_APPROVED",
  "NUTRITION_PROFILE_MISSING",
  "INVALID_QUANTITY",
  "UNIT_CONVERSION_MISSING",
  "PIECE_WEIGHT_REQUIRED",
  "TO_TASTE_EXCLUDED",
  "REPRESENTATIVE_VOLUME_CONVERSION_USED",
  "PIECE_WEIGHT_CONVERSION_USED",
] as const;

const WARNING_INDEX = new Map<string, number>(
  WARNING_PRIORITY.map((warning, index) => [warning, index]),
);

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function compareUnicodeOrdinal(left: string, right: string) {
  const leftCodePoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightCodePoints = Array.from(right, (character) => character.codePointAt(0)!);
  const length = Math.min(leftCodePoints.length, rightCodePoints.length);

  for (let index = 0; index < length; index += 1) {
    if (leftCodePoints[index] !== rightCodePoints[index]) {
      return leftCodePoints[index] - rightCodePoints[index];
    }
  }

  return leftCodePoints.length - rightCodePoints.length;
}

function canonicalInput(input: RecipeNutritionCalculatorInput) {
  return {
    recipe_id: input.recipe_id,
    recipe_version: input.recipe_version,
    base_servings: input.base_servings,
    calculation_version:
      input.calculation_version ?? RECIPE_NUTRITION_CALCULATION_VERSION,
    rounding_policy_version:
      input.rounding_policy_version ?? RECIPE_NUTRITION_ROUNDING_POLICY_VERSION,
    ingredients: [...input.ingredients].sort((left, right) =>
      compareUnicodeOrdinal(left.id, right.id) ||
      compareUnicodeOrdinal(left.ingredient_id, right.ingredient_id)
    ),
  };
}

export function hashRecipeNutritionInput(input: RecipeNutritionCalculatorInput) {
  return createHash("sha256")
    .update(canonicalStringify(canonicalInput(input)))
    .digest("hex");
}

function normalizedUnit(unit: string | null) {
  return unit?.trim().toLowerCase() ?? null;
}

function massInGrams(amount: number, unit: string | null) {
  switch (normalizedUnit(unit)) {
    case "g":
      return amount;
    case "kg":
      return amount * 1000;
    default:
      return null;
  }
}

function volumeInMilliliters(amount: number, unit: string | null) {
  switch (normalizedUnit(unit)) {
    case "ml":
      return amount;
    case "l":
      return amount * 1000;
    case "tbsp":
      return amount * 15;
    case "tsp":
      return amount * 5;
    case "cup":
      return amount * 200;
    default:
      return null;
  }
}

function isPieceUnit(unit: string | null) {
  return ["개", "장", "piece", "pieces"].includes(normalizedUnit(unit) ?? "");
}

function isApprovedNutrition(ingredient: RecipeNutritionIngredientInput) {
  const nutrition = ingredient.nutrition;
  return Boolean(
    nutrition &&
      nutrition.link.review_status === "approved" &&
      nutrition.link.is_active &&
      nutrition.link.is_primary &&
      nutrition.link.preparation_state === ingredient.preparation_state &&
      nutrition.profile.review_status === "approved" &&
      nutrition.profile.is_active &&
      nutrition.source.review_status === "approved" &&
      nutrition.source.freshness_status === "current" &&
      nutrition.source.is_active &&
      Number.isFinite(nutrition.profile.basis_amount) &&
      nutrition.profile.basis_amount > 0,
  );
}

type UnitResolution = {
  factor: number;
  quality: "direct" | "estimated";
  warning: string | null;
  measurementSource: RecipeNutritionSourceAttribution | null;
};

function approvedAttributionSource(source: {
  review_status: string;
  freshness_status: string;
  is_active: boolean;
} & RecipeNutritionSourceAttribution) {
  return source.review_status === "approved" &&
    source.freshness_status === "current" &&
    source.is_active;
}

function approvedEvidence(
  evidence: RecipeNutritionIngredientInput["conversion_assignment"] extends infer Assignment
    ? Assignment extends { evidence?: infer Evidence } ? Evidence : never
    : never,
) {
  return Boolean(
    evidence &&
    (evidence as { review_status: string }).review_status === "approved" &&
    (evidence as { is_active: boolean }).is_active &&
    approvedAttributionSource((evidence as {
      source: Parameters<typeof approvedAttributionSource>[0];
    }).source),
  );
}

function resolveUnit(ingredient: RecipeNutritionIngredientInput): UnitResolution | null {
  const nutrition = ingredient.nutrition;
  const amount = ingredient.amount;
  if (!nutrition || amount === null || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const profile = nutrition.profile;
  const grams = massInGrams(amount, ingredient.unit);
  if (profile.basis_unit === "g" && grams !== null) {
    return {
      factor: grams / profile.basis_amount,
      quality: "direct",
      warning: null,
      measurementSource: null,
    };
  }

  const milliliters = volumeInMilliliters(amount, ingredient.unit);
  if (profile.basis_unit === "ml" && milliliters !== null) {
    return {
      factor: milliliters / profile.basis_amount,
      quality: "direct",
      warning: null,
      measurementSource: null,
    };
  }

  if (profile.basis_unit === "g" && milliliters !== null) {
    const assignment = ingredient.conversion_assignment;
    const expectedWeight = assignment
      ? APPROVED_VOLUME_PROFILES.get(assignment.profile.code)
      : undefined;
    if (
      assignment &&
      assignment.ingredient_id === ingredient.ingredient_id &&
      assignment.preparation_state === ingredient.preparation_state &&
      assignment.review_status === "approved" &&
      assignment.is_active &&
      assignment.profile.is_active &&
      assignment.profile.basis_volume_ml === 15 &&
      expectedWeight !== undefined &&
      assignment.profile.representative_weight_g === expectedWeight &&
      assignment.evidence &&
      approvedEvidence(assignment.evidence)
    ) {
      const estimatedGrams = milliliters * expectedWeight / 15;
      return {
        factor: estimatedGrams / profile.basis_amount,
        quality: "estimated",
        warning: "REPRESENTATIVE_VOLUME_CONVERSION_USED",
        measurementSource: assignment.evidence.source,
      };
    }
  }

  if (profile.basis_unit === "g" && isPieceUnit(ingredient.unit)) {
    const piece = ingredient.piece_weight;
    if (
      piece &&
      piece.ingredient_id === ingredient.ingredient_id &&
      piece.size_code === ingredient.size_code &&
      piece.preparation_state === ingredient.preparation_state &&
      piece.review_status === "approved" &&
      piece.is_active &&
      piece.evidence &&
      approvedEvidence(piece.evidence) &&
      Number.isFinite(piece.weight_g) &&
      piece.weight_g > 0
    ) {
      return {
        factor: amount * piece.weight_g / profile.basis_amount,
        quality: "estimated",
        warning: "PIECE_WEIGHT_CONVERSION_USED",
        measurementSource: piece.evidence.source,
      };
    }
  }

  return null;
}

function warningForMissingUnit(ingredient: RecipeNutritionIngredientInput) {
  if (ingredient.amount === null || !Number.isFinite(ingredient.amount) || ingredient.amount <= 0) {
    return "INVALID_QUANTITY";
  }
  if (isPieceUnit(ingredient.unit)) {
    return "PIECE_WEIGHT_REQUIRED";
  }
  return "UNIT_CONVERSION_MISSING";
}

function stableWarnings(warnings: Iterable<string>) {
  return [...new Set(warnings)].sort((left, right) =>
    (WARNING_INDEX.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (WARNING_INDEX.get(right) ?? Number.MAX_SAFE_INTEGER) ||
    compareUnicodeOrdinal(left, right)
  );
}

function sourceTuple(source: RecipeNutritionSourceAttribution) {
  return [
    source.provider,
    source.dataset,
    source.source_version,
    source.data_basis_date,
    source.license,
    source.source_url,
  ] as const;
}

function compareNullableUnicodeOrdinal(left: string | null, right: string | null) {
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return compareUnicodeOrdinal(left, right);
}

function compareSourceAttribution(
  left: RecipeNutritionSourceAttribution,
  right: RecipeNutritionSourceAttribution,
) {
  const leftTuple = sourceTuple(left);
  const rightTuple = sourceTuple(right);

  for (let index = 0; index < leftTuple.length; index += 1) {
    const comparison = compareNullableUnicodeOrdinal(leftTuple[index], rightTuple[index]);
    if (comparison !== 0) return comparison;
  }

  return 0;
}

function outputNutrientCodes(input: RecipeNutritionCalculatorInput) {
  const optional = OPTIONAL_NUTRIENT_CODES.filter((code) =>
    input.ingredients.some((ingredient) => {
      if (!isApprovedNutrition(ingredient) || !resolveUnit(ingredient)) return false;
      const value = ingredient.nutrition?.profile.values[code];
      return value?.value_status === "observed" && value.amount !== null;
    })
  );
  return [...CORE_NUTRIENT_CODES, ...optional] as RecipeNutrientCode[];
}

export function calculateRecipeNutrition(
  input: RecipeNutritionCalculatorInput,
): RecipeNutritionCalculation {
  if (!Number.isFinite(input.base_servings) || input.base_servings <= 0) {
    throw new RecipeNutritionCalculationError("INVALID_BASE_SERVINGS");
  }
  if (!Array.isArray(input.ingredients)) {
    throw new RecipeNutritionCalculationError("INVALID_INGREDIENTS");
  }

  const nutrientCodes = outputNutrientCodes(input);
  const accumulators = new Map(nutrientCodes.map((code) => [code, {
    known: 0,
    scalable: 0,
    fixed: 0,
    observedCount: 0,
    missingCount: 0,
  }]));
  const warnings: string[] = [];
  const missingReasons: string[] = [];
  const qualities = new Set<"direct" | "estimated">();
  const sources = new Map<string, RecipeNutritionSourceAttribution>();
  const sortedIngredients = [...input.ingredients].sort((left, right) =>
    compareUnicodeOrdinal(left.id, right.id) ||
    compareUnicodeOrdinal(left.ingredient_id, right.ingredient_id)
  );
  let reflectedIngredientCount = 0;
  let targetIngredientCount = 0;
  let hasToTaste = false;

  for (const ingredient of sortedIngredients) {
    if (ingredient.ingredient_type === "TO_TASTE") {
      hasToTaste = true;
      warnings.push("TO_TASTE_EXCLUDED");
      missingReasons.push(`TO_TASTE_EXCLUDED:${ingredient.id}`);
      continue;
    }

    targetIngredientCount += 1;
    const approved = isApprovedNutrition(ingredient);
    const unitResolution = approved ? resolveUnit(ingredient) : null;
    if (!approved || !unitResolution) {
      const warning = ingredient.nutrition
        ? approved
          ? warningForMissingUnit(ingredient)
          : "PREDECESSOR_NOT_APPROVED"
        : "NUTRITION_PROFILE_MISSING";
      warnings.push(warning);
      missingReasons.push(`${warning}:${ingredient.id}`);
      for (const accumulator of accumulators.values()) {
        accumulator.missingCount += 1;
      }
      continue;
    }

    if (unitResolution.warning) warnings.push(unitResolution.warning);
    let ingredientReflected = false;
    for (const code of nutrientCodes) {
      const accumulator = accumulators.get(code)!;
      const value = ingredient.nutrition!.profile.values[code];
      if (
        !value ||
        value.value_status !== "observed" ||
        value.amount === null ||
        !Number.isFinite(value.amount) ||
        value.amount < 0
      ) {
        accumulator.missingCount += 1;
        missingReasons.push(`NUTRIENT_VALUE_MISSING:${ingredient.id}:${code}`);
        continue;
      }

      const contribution = value.amount * unitResolution.factor;
      accumulator.known += contribution;
      accumulator.observedCount += 1;
      if (ingredient.scalable) accumulator.scalable += contribution;
      else accumulator.fixed += contribution;
      ingredientReflected = true;
    }

    if (ingredientReflected) {
      reflectedIngredientCount += 1;
      qualities.add(unitResolution.quality);
      const attribution: RecipeNutritionSourceAttribution = {
        provider: ingredient.nutrition!.source.provider,
        dataset: ingredient.nutrition!.source.dataset,
        source_version: ingredient.nutrition!.source.source_version,
        data_basis_date: ingredient.nutrition!.source.data_basis_date,
        license: ingredient.nutrition!.source.license,
        source_url: ingredient.nutrition!.source.source_url,
      };
      sources.set(canonicalStringify(sourceTuple(attribution)), attribution);
      if (unitResolution.measurementSource) {
        const measurementAttribution: RecipeNutritionSourceAttribution = {
          provider: unitResolution.measurementSource.provider,
          dataset: unitResolution.measurementSource.dataset,
          source_version: unitResolution.measurementSource.source_version,
          data_basis_date: unitResolution.measurementSource.data_basis_date,
          license: unitResolution.measurementSource.license,
          source_url: unitResolution.measurementSource.source_url,
        };
        sources.set(
          canonicalStringify(sourceTuple(measurementAttribution)),
          measurementAttribution,
        );
      }
    }
  }

  if (hasToTaste) {
    for (const accumulator of accumulators.values()) accumulator.missingCount += 1;
  }

  const values = {} as RecipeNutritionCalculation["values"];
  const scalableValues: Partial<Record<RecipeNutrientCode, number>> = {};
  const fixedValues: Partial<Record<RecipeNutrientCode, number>> = {};
  for (const code of nutrientCodes) {
    const accumulator = accumulators.get(code)!;
    if (accumulator.observedCount === 0) {
      values[code] = {
        amount: null,
        known_amount: null,
        status: "unavailable",
        display_mode: null,
      };
      continue;
    }

    scalableValues[code] = accumulator.scalable;
    fixedValues[code] = accumulator.fixed;
    if (accumulator.missingCount === 0) {
      values[code] = {
        amount: accumulator.known,
        known_amount: null,
        status: "complete",
        display_mode: "total",
      };
    } else {
      values[code] = {
        amount: null,
        known_amount: accumulator.known,
        status: "partial",
        display_mode: "minimum",
      };
    }
  }

  const coreStatuses = CORE_NUTRIENT_CODES.map((code) => values[code].status);
  const calculationStatus: NutrientStatus = coreStatuses.every((status) => status === "complete")
    ? "complete"
    : coreStatuses.every((status) => status === "unavailable")
      ? "unavailable"
      : "partial";
  const calculationQuality: CalculationQuality | null = calculationStatus === "unavailable"
    ? null
    : qualities.size === 2
      ? "mixed"
      : qualities.has("estimated")
        ? "estimated"
        : "direct";

  return {
    basis: { amount: input.base_servings, unit: "serving" },
    base_servings: input.base_servings,
    values,
    scalable_values: scalableValues,
    fixed_values: fixedValues,
    calculation_status: calculationStatus,
    calculation_quality: calculationQuality,
    reflected_ingredient_count: reflectedIngredientCount,
    target_ingredient_count: targetIngredientCount,
    missing_reasons: [...new Set(missingReasons)].sort(),
    warnings: stableWarnings(warnings),
    sources: [...sources.values()].sort(compareSourceAttribution),
    input_hash: hashRecipeNutritionInput(input),
    calculation_version:
      input.calculation_version ?? RECIPE_NUTRITION_CALCULATION_VERSION,
    rounding_policy_version:
      input.rounding_policy_version ?? RECIPE_NUTRITION_ROUNDING_POLICY_VERSION,
  };
}

export function scaleNutritionForServings(
  calculation: RecipeNutritionCalculation,
  selectedServings: number,
) {
  if (!Number.isFinite(selectedServings) || selectedServings <= 0) {
    throw new RecipeNutritionCalculationError("INVALID_SELECTED_SERVINGS");
  }
  if (!Number.isFinite(calculation.base_servings) || calculation.base_servings <= 0) {
    throw new RecipeNutritionCalculationError("INVALID_BASE_SERVINGS");
  }

  const values = structuredClone(calculation.values);
  for (const [code, value] of Object.entries(values) as Array<
    [RecipeNutrientCode, RecipeNutritionValue]
  >) {
    if (value.status === "unavailable") continue;
    const scalable = calculation.scalable_values[code];
    const fixed = calculation.fixed_values[code];
    if (scalable === undefined || fixed === undefined) continue;
    const selectedAmount = scalable * selectedServings / calculation.base_servings + fixed;
    if (value.status === "complete") value.amount = selectedAmount;
    else value.known_amount = selectedAmount;
  }

  return {
    ...calculation,
    basis: { amount: selectedServings, unit: "serving" as const },
    values,
  };
}
