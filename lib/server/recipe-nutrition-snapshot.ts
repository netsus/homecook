import type {
  RecipeNutritionCalculation,
  RecipeNutritionSourceAttribution,
  RecipeNutritionValue,
} from "@/lib/nutrition/recipe-nutrition-calculator";
import type { RecipeNutrition } from "@/types/recipe";

const SOURCE_KEYS = [
  "provider",
  "dataset",
  "source_version",
  "data_basis_date",
  "license",
  "source_url",
] as const;

const FORBIDDEN_SOURCE_TEXT = /(?:raw[_-]?(?:payload|row|provider|response)|api[_-]?key|servicekey|secret|cookie|authorization|access[_-]?token|manifest[_-]?(?:sha|path)|(?:^|\/)private(?:\/|$)|(?:^|\/)internal(?:\/|$))/i;
const AUTH_QUERY_KEYS = /^(?:api[_-]?key|servicekey|key|token|access[_-]?token|authorization|auth|secret|cookie)$/i;
const VECTOR_EPSILON = 1e-9;

export class RecipeNutritionSnapshotError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "RecipeNutritionSnapshotError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareUnicodeOrdinal(left: string, right: string) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0)!);
  const length = Math.min(leftPoints.length, rightPoints.length);

  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) {
      return leftPoints[index] - rightPoints[index];
    }
  }

  return leftPoints.length - rightPoints.length;
}

function compareNullable(left: string | null, right: string | null) {
  if (left === right) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return compareUnicodeOrdinal(left, right);
}

function sourceTuple(source: RecipeNutritionSourceAttribution) {
  return SOURCE_KEYS.map((key) => source[key]);
}

function compareSources(
  left: RecipeNutritionSourceAttribution,
  right: RecipeNutritionSourceAttribution,
) {
  const leftTuple = sourceTuple(left);
  const rightTuple = sourceTuple(right);

  for (let index = 0; index < leftTuple.length; index += 1) {
    const comparison = compareNullable(leftTuple[index], rightTuple[index]);
    if (comparison !== 0) return comparison;
  }

  return 0;
}

function tupleKey(source: RecipeNutritionSourceAttribution) {
  return JSON.stringify(sourceTuple(source));
}

function validateSource(source: unknown): asserts source is RecipeNutritionSourceAttribution {
  if (!isRecord(source) || !Array.isArray(SOURCE_KEYS)) {
    throw new RecipeNutritionSnapshotError("UNSAFE_SNAPSHOT_SOURCE");
  }

  const actualKeys = Object.keys(source).sort(compareUnicodeOrdinal);
  const expectedKeys = [...SOURCE_KEYS].sort(compareUnicodeOrdinal);
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    throw new RecipeNutritionSnapshotError("UNSAFE_SNAPSHOT_SOURCE");
  }

  for (const key of ["provider", "dataset", "source_version", "license", "source_url"] as const) {
    if (typeof source[key] !== "string" || source[key].trim().length === 0) {
      throw new RecipeNutritionSnapshotError("UNSAFE_SNAPSHOT_SOURCE");
    }
  }
  if (source.data_basis_date !== null && typeof source.data_basis_date !== "string") {
    throw new RecipeNutritionSnapshotError("UNSAFE_SNAPSHOT_SOURCE");
  }

  const sourceText = JSON.stringify(source);
  if (FORBIDDEN_SOURCE_TEXT.test(sourceText)) {
    throw new RecipeNutritionSnapshotError("UNSAFE_SNAPSHOT_SOURCE");
  }

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(source.source_url as string);
  } catch {
    throw new RecipeNutritionSnapshotError("UNSAFE_SNAPSHOT_SOURCE");
  }
  if (!['http:', 'https:'].includes(sourceUrl.protocol)) {
    throw new RecipeNutritionSnapshotError("UNSAFE_SNAPSHOT_SOURCE");
  }
  for (const key of sourceUrl.searchParams.keys()) {
    if (AUTH_QUERY_KEYS.test(key)) {
      throw new RecipeNutritionSnapshotError("UNSAFE_SNAPSHOT_SOURCE");
    }
  }
}

function validateNutrientValue(value: RecipeNutritionValue) {
  if (value.status === "complete") {
    return Number.isFinite(value.amount) && value.amount! >= 0 &&
      value.known_amount === null && value.display_mode === "total";
  }
  if (value.status === "partial") {
    return value.amount === null && Number.isFinite(value.known_amount) &&
      value.known_amount! >= 0 && value.display_mode === "minimum";
  }
  return value.status === "unavailable" && value.amount === null &&
    value.known_amount === null && value.display_mode === null;
}

export function validateRecipeNutritionSnapshot(calculation: RecipeNutritionCalculation) {
  if (!Number.isFinite(calculation.base_servings) || calculation.base_servings <= 0) {
    throw new RecipeNutritionSnapshotError("INVALID_SNAPSHOT_BASE_SERVINGS");
  }
  if (!/^[0-9a-f]{64}$/i.test(calculation.input_hash) ||
    calculation.calculation_version.trim().length === 0) {
    throw new RecipeNutritionSnapshotError("INVALID_SNAPSHOT_IDENTITY");
  }
  if (!Number.isInteger(calculation.reflected_ingredient_count) ||
    !Number.isInteger(calculation.target_ingredient_count) ||
    calculation.reflected_ingredient_count < 0 ||
    calculation.target_ingredient_count < calculation.reflected_ingredient_count) {
    throw new RecipeNutritionSnapshotError("INVALID_SNAPSHOT_COUNTS");
  }
  if (
    (calculation.calculation_status === "unavailable" && calculation.calculation_quality !== null) ||
    (calculation.calculation_status !== "unavailable" && calculation.calculation_quality === null)
  ) {
    throw new RecipeNutritionSnapshotError("INVALID_SNAPSHOT_STATUS");
  }

  for (const [code, value] of Object.entries(calculation.values)) {
    if (!validateNutrientValue(value)) {
      throw new RecipeNutritionSnapshotError("INVALID_SNAPSHOT_NUTRIENT_STATUS");
    }

    const scalable = calculation.scalable_values[code as keyof typeof calculation.scalable_values];
    const fixed = calculation.fixed_values[code as keyof typeof calculation.fixed_values];
    if (value.status === "unavailable") {
      if (scalable !== undefined || fixed !== undefined) {
        throw new RecipeNutritionSnapshotError("INVALID_SNAPSHOT_VECTOR");
      }
      continue;
    }
    if (!Number.isFinite(scalable) || scalable! < 0 || !Number.isFinite(fixed) || fixed! < 0) {
      throw new RecipeNutritionSnapshotError("INVALID_SNAPSHOT_VECTOR");
    }
    const expected = value.status === "complete" ? value.amount! : value.known_amount!;
    if (Math.abs(scalable! + fixed! - expected) > VECTOR_EPSILON) {
      throw new RecipeNutritionSnapshotError("SNAPSHOT_VECTOR_SUM_MISMATCH");
    }
  }

  calculation.sources.forEach(validateSource);
  const canonicalSources = [...new Map(
    calculation.sources.map((source) => [tupleKey(source), source]),
  ).values()].sort(compareSources);
  if (JSON.stringify(canonicalSources) !== JSON.stringify(calculation.sources)) {
    throw new RecipeNutritionSnapshotError("NON_CANONICAL_SNAPSHOT_SOURCES");
  }
  if (calculation.calculation_status !== "unavailable" && calculation.sources.length === 0) {
    throw new RecipeNutritionSnapshotError("SNAPSHOT_SOURCE_REQUIRED");
  }
}

interface SnapshotWriterClient {
  rpc(
    functionName: "write_recipe_nutrition_snapshot",
    args: { p_recipe_id: string; p_snapshot: Record<string, unknown> },
  ): PromiseLike<{
    data: { snapshot_id: string; created: boolean; is_current: boolean } | null;
    error: unknown;
  }>;
}

export async function writeRecipeNutritionSnapshot(
  dbClient: SnapshotWriterClient,
  recipeId: string,
  calculation: RecipeNutritionCalculation,
  options: { calculatedAt?: string } = {},
) {
  validateRecipeNutritionSnapshot(calculation);
  const calculatedAt = options.calculatedAt ?? new Date().toISOString();
  const result = await dbClient.rpc("write_recipe_nutrition_snapshot", {
    p_recipe_id: recipeId,
    p_snapshot: {
      base_servings: calculation.base_servings,
      input_hash: calculation.input_hash,
      calculation_version: calculation.calculation_version,
      scalable_values: calculation.scalable_values,
      fixed_values: calculation.fixed_values,
      nutrient_status: calculation.values,
      calculation_status: calculation.calculation_status,
      calculation_quality: calculation.calculation_quality,
      reflected_ingredient_count: calculation.reflected_ingredient_count,
      target_ingredient_count: calculation.target_ingredient_count,
      missing_reasons: calculation.missing_reasons,
      warnings: calculation.warnings,
      sources: calculation.sources,
      calculated_at: calculatedAt,
    },
  });

  if (result.error || !result.data) {
    throw new RecipeNutritionSnapshotError("SNAPSHOT_WRITE_FAILED");
  }

  return result.data;
}

export interface RecipeNutritionSnapshotRow {
  id: string;
  base_servings: number;
  scalable_values_json: RecipeNutritionCalculation["scalable_values"];
  fixed_values_json: RecipeNutritionCalculation["fixed_values"];
  nutrient_status_json: RecipeNutritionCalculation["values"];
  calculation_status: RecipeNutritionCalculation["calculation_status"];
  calculation_quality: RecipeNutritionCalculation["calculation_quality"];
  reflected_ingredient_count: number;
  target_ingredient_count: number;
  warnings_json: string[];
  sources_json: RecipeNutritionSourceAttribution[];
  calculated_at: string;
}

export function mapRecipeNutritionSnapshot(row: RecipeNutritionSnapshotRow): RecipeNutrition {
  const calculation = {
    basis: { amount: row.base_servings, unit: "serving" as const },
    base_servings: row.base_servings,
    values: row.nutrient_status_json,
    scalable_values: row.scalable_values_json,
    fixed_values: row.fixed_values_json,
    calculation_status: row.calculation_status,
    calculation_quality: row.calculation_quality,
    reflected_ingredient_count: row.reflected_ingredient_count,
    target_ingredient_count: row.target_ingredient_count,
    warnings: row.warnings_json,
    sources: row.sources_json,
    snapshot_id: row.id,
    calculated_at: row.calculated_at,
  };

  return calculation;
}
