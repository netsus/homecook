import { calculateRecipeNutrition, RECIPE_NUTRITION_EXPLICIT_UNIT_VERSION, scaleNutritionForServings, type RecipeNutritionCalculatorInput, type RecipeNutritionIngredientInput } from "@/lib/nutrition/recipe-nutrition-calculator";
import { hydrateRecipeNutritionIngredients, loadRecipeNutritionPredecessors } from "@/scripts/lib/recipe-nutrition-predecessor.mjs";
import { snapshotIngredients } from "@/lib/server/cooked-batch-weight-estimate";
import { hydrateRecipeProductNutrition, type RecipeProductNutritionClient } from "@/lib/server/recipe-product-nutrition";
import { hydrateRecipeQuantityNutrition } from "@/lib/server/recipe-quantity-input";
import { predictSnapshotWeight } from "@/lib/server/cooked-weight-snapshot-prediction";
import { withRecipeMassProxy } from "@/lib/server/cooked-weight-mass-proxy";
import { withIngredientMassFallback } from "@/lib/server/cooked-weight-mass-fallback";
import type { CookingModeIngredient, CookingModeStep } from "@/types/cooking";
import { isCookedWeightSummary } from "@/lib/cooking/cooked-weight-summary";
import type { CookedWeightSummary } from "@/types/cooking";

export interface ExecutionQuantityChange { row_index: number; amount: number | null; unit: string | null }
export function parseExecutionQuantityChanges(value: unknown): { expected_revision: number; changes: ExecutionQuantityChange[] } | null {
  if (!record(value) || Object.keys(value).sort().join() !== "changes,expected_revision"
    || !Number.isSafeInteger(value.expected_revision) || Number(value.expected_revision) < 0
    || !Array.isArray(value.changes) || value.changes.length < 1 || value.changes.length > 200) return null;
  const changes: ExecutionQuantityChange[] = [];
  for (const row of value.changes) {
    if (!record(row) || Object.keys(row).sort().join() !== "amount,row_index,unit"
      || !Number.isSafeInteger(row.row_index) || Number(row.row_index) < 0 || Number(row.row_index) >= 200
      || row.amount !== null && (typeof row.amount !== "number" || !Number.isFinite(row.amount) || row.amount <= 0 || row.amount > 1000000)
      || row.unit !== null && (typeof row.unit !== "string" || !row.unit.trim() || row.unit.length > 32)
      || row.amount !== null && row.unit === null) return null;
    changes.push({ row_index: Number(row.row_index), amount: row.amount, unit: typeof row.unit === "string" ? row.unit.trim() : null });
  }
  return new Set(changes.map(row => row.row_index)).size === changes.length ? { expected_revision: Number(value.expected_revision), changes } : null;
}
export function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** Only quantity fields can change; every source identity and original snapshot stays frozen. */
export function applyExecutionQuantityChanges(rows: readonly unknown[], changes: readonly ExecutionQuantityChange[]): Record<string, unknown>[] {
  if (rows.length > 200 || rows.some(row => !record(row)) || changes.some(row => row.row_index >= rows.length)) throw new Error("INVALID_EXECUTION_QUANTITY");
  const edits = new Map(changes.map(row => [row.row_index, row]));
  return rows.map((row, index) => {
    if (!record(row)) throw new Error("INVALID_EXECUTION_QUANTITY");
    const edit = edits.get(index);
    if (!edit) return { ...row };
    const next: Record<string, unknown> = { ...row, amount: edit.amount, unit: edit.unit, ingredient_type: "QUANT", scalable: false, display_text: null };
    delete next.quantity_input;
    return next;
  });
}

export async function calculateExecutionQuantities(input: {
  client: { from(table: string): unknown } & RecipeProductNutritionClient; ownerId: string;
  recipeId: string; snapshotId: string; baseServings: number; cookingServings: number;
  rows: Record<string, unknown>[]; originalRows: readonly unknown[]; steps: readonly unknown[]; cookingSteps: readonly CookingModeStep[]; cookingIngredients?: readonly CookingModeIngredient[];
}) {
  const rows = snapshotIngredients(input.rows);
  if (!rows) throw new Error("INVALID_EXECUTION_QUANTITY");
  const ids = rows.flatMap(row => !row.food_product_id && row.ingredient_id ? [row.ingredient_id] : []);
  const predecessors = await loadRecipeNutritionPredecessors(input.client, ids);
  let hydrated: RecipeNutritionIngredientInput[] = hydrateRecipeNutritionIngredients(rows, predecessors);
  hydrated = (await hydrateRecipeProductNutrition(input.client, rows, hydrated, input.ownerId)).ingredients;
  const explicit = input.originalRows.some(row => record(row) && row.quantity_input !== undefined);
  if (explicit) hydrated = (await hydrateRecipeQuantityNutrition(input.client, rows, hydrated, input.ownerId)).ingredients;
  const calculationInput: RecipeNutritionCalculatorInput = { recipe_id: input.recipeId, recipe_version: `execution:${input.snapshotId}`,
    base_servings: input.baseServings, ingredients: hydrated };
  if (explicit) calculationInput.calculation_version = RECIPE_NUTRITION_EXPLICIT_UNIT_VERSION;
  const calculation = calculateRecipeNutrition(calculationInput);
  const scaled = scaleNutritionForServings(calculation, input.cookingServings);
  // Preserve unchanged frozen v4 proof. Edited rows have no stale raw quantity metadata.
  const weightRows = hydrated.map((row, index) => Object.hasOwn(input.rows[index], "quantity_input")
    ? { ...row, quantity_input: input.rows[index].quantity_input } : row);
  const predicted = predictSnapshotWeight({ snapshotId: input.snapshotId,
    baseServings: input.baseServings, cookingServings: input.cookingServings, ingredients: weightRows,
    snapshotSteps: input.steps, cookingSteps: input.cookingSteps });
  const changed = { ...predicted, prediction: { ...predicted.prediction,
    input: predicted.prediction.input ? { ...predicted.prediction.input, rows: predicted.prediction.input.rows.map((row, index) => {
      const original = input.originalRows[index];
      return record(original) && (original.amount !== input.rows[index].amount || original.unit !== input.rows[index].unit
        || original.scalable !== input.rows[index].scalable || original.ingredient_type !== input.rows[index].ingredient_type)
        ? { ...row, quantityOrigin: "reported_actual" as const } : row;
    }) } : null,
  } };
  const evidence = withIngredientMassFallback(withRecipeMassProxy(changed, input.rows, input.cookingIngredients ?? [], input.steps, input.cookingSteps));
  const nutrition = { recipe_content_snapshot_id: input.snapshotId, recipe_nutrition_snapshot_id: null,
    basis: { amount: input.cookingServings, unit: "serving" }, base_servings: input.baseServings,
    values: scaled.values, calculation_status: calculation.calculation_status, calculation_quality: calculation.calculation_quality,
    contains_ai_estimate: calculation.warnings.includes("AI_NUTRITION_ESTIMATE_USED"),
    reflected_ingredient_count: calculation.reflected_ingredient_count, target_ingredient_count: calculation.target_ingredient_count,
    missing_reasons: calculation.missing_reasons, warnings: calculation.warnings, sources: calculation.sources,
    snapshot_id: null, calculated_at: new Date().toISOString() };
  const fixedValues = Object.fromEntries(Object.entries(scaled.values).flatMap(([code, value]) => {
    const amount = value?.status === "complete" ? value.amount : value?.known_amount;
    return typeof amount === "number" ? [[code, amount]] : [];
  }));
  const nutritionSnapshot = {
    base_servings: input.cookingServings, calculated_at: nutrition.calculated_at, calculation_quality: calculation.calculation_quality,
    calculation_status: calculation.calculation_status, calculation_version: calculation.calculation_version,
    fixed_values: fixedValues, scalable_values: Object.fromEntries(Object.keys(fixedValues).map(code => [code, 0])),
    input_hash: calculation.input_hash, missing_reasons: calculation.missing_reasons, nutrient_status: scaled.values,
    reflected_ingredient_count: calculation.reflected_ingredient_count, target_ingredient_count: calculation.target_ingredient_count,
    sources: calculation.sources, warnings: calculation.warnings,
  };
  return { nutrition, nutritionSnapshot, prediction: evidence };
}

/** Snapshot storage omits display names. Reuse only the authorized reader's
 * matching row label; quantities and immutable source identity stay frozen. */
export function projectExecutionQuantityRows(rows: readonly Record<string, unknown>[], labelled: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(labelled) || rows.length !== labelled.length) return null;
  const identity = ["row_key", "ingredient_id", "food_product_id", "food_product_nutrition_version_id"];
  const result: Record<string, unknown>[] = [];
  for (const [index, row] of rows.entries()) {
    const source: unknown = labelled[index];
    if (!record(source) || typeof source.standard_name !== "string"
      || identity.some(key => (row[key] ?? null) !== (source[key] ?? null))) return null;
    result.push({ ...row, standard_name: source.standard_name });
  }
  return result;
}

export interface CookingExecutionState {
  revision: number; snapshot_id: string; base_servings: number; cooking_servings: number;
  original_rows: unknown[]; rows: Record<string, unknown>[]; steps: unknown[];
  nutrition_snapshot: Record<string, unknown> | null;
  prediction: Record<string, unknown> | null;
}
export function executionState(value: unknown): CookingExecutionState | null {
  if (!record(value) || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 0
    || typeof value.snapshot_id !== "string" || typeof value.base_servings !== "number" || value.base_servings <= 0
    || typeof value.cooking_servings !== "number" || value.cooking_servings <= 0
    || !Array.isArray(value.original_rows) || !Array.isArray(value.rows) || value.rows.some(row => !record(row))
    || !Array.isArray(value.steps) || value.rows.length !== value.original_rows.length || value.rows.length > 200
    || value.nutrition_snapshot !== null && !record(value.nutrition_snapshot)
    || value.prediction !== null && (!record(value.prediction) || !record(value.prediction.prediction))) return null;
  return { revision: value.revision, snapshot_id: value.snapshot_id, base_servings: value.base_servings,
    cooking_servings: value.cooking_servings, original_rows: value.original_rows, rows: value.rows.filter(record), steps: value.steps,
    nutrition_snapshot: record(value.nutrition_snapshot) ? value.nutrition_snapshot : null,
    prediction: record(value.prediction) ? value.prediction : null };
}

export function executionWeightSummary(state: CookingExecutionState): CookedWeightSummary | undefined {
  const prediction = state.prediction?.prediction;
  if (!record(prediction) || !Array.isArray(prediction.reasons)) return undefined;
  const summary = { source: prediction.totalGrams === null ? "unavailable" : "conditional_estimate",
    predicted_g: prediction.totalGrams, model_version: prediction.modelVersion,
    reason_codes: prediction.reasons.filter(record).map(reason => reason.code), assumption_codes: prediction.assumptions };
  return isCookedWeightSummary(summary) ? summary : undefined;
}
