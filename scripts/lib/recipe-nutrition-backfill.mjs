import { createHash } from "node:crypto";

import {
  buildRecipeNutritionInputGuard,
  hydrateRecipeNutritionIngredients,
  loadRecipeNutritionPredecessors,
} from "./recipe-nutrition-predecessor.mjs";
import {
  canonicalStringify as stableCanonicalStringify,
  sha256,
} from "./public-nutrition-pipeline.mjs";

const FOODSAFETY_SCOPE_MARKERS = [
  "pilot_30_quality_corrected",
  "pilot_30_quality_corrected_replacement",
];
const ALL_RECIPE_INVENTORY_SCHEMA_VERSION = "all-recipe-nutrition-inventory-v1";
const ALL_RECIPE_SCOPE = "all-public-recipes";
const MAX_ALL_RECIPE_INVENTORY_PAGE_SIZE = 1000;
let calculatorModulePromise;

export class RecipeNutritionBackfillError extends Error {
  constructor(code) {
    super(code);
    this.name = "RecipeNutritionBackfillError";
    this.code = code;
  }
}

export function deriveRecipeNutritionSnapshotId(recipeId, inputHash, calculationVersion) {
  const hexadecimal = createHash("md5")
    .update(`${recipeId}\u001f${inputHash}\u001f${calculationVersion}`)
    .digest("hex");
  return [
    hexadecimal.slice(0, 8),
    hexadecimal.slice(8, 12),
    hexadecimal.slice(12, 16),
    hexadecimal.slice(16, 20),
    hexadecimal.slice(20),
  ].join("-");
}

export function sanitizeRecipeNutritionBackfillReport(report) {
  const safeReport = { ...report };
  const nextCursor = safeReport.next_cursor;
  delete safeReport.checkpoints;
  delete safeReport.next_cursor;
  return {
    ...safeReport,
    has_next_cursor: nextCursor !== null && nextCursor !== undefined,
  };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function compareUnicodeOrdinal(left, right) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0));
  const rightPoints = Array.from(right, (character) => character.codePointAt(0));
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) {
      return leftPoints[index] - rightPoints[index];
    }
  }
  return leftPoints.length - rightPoints.length;
}

function withChecksum(body) {
  return { ...body, checksum: sha256(body) };
}

function validateInventoryPageSize(pageSize) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_ALL_RECIPE_INVENTORY_PAGE_SIZE) {
    throw new RecipeNutritionBackfillError("INVALID_BACKFILL_BATCH_SIZE");
  }
}

function createOperationCounts() {
  return {
    inventory_page_reads: 0,
    recipe_reads: 0,
    ingredient_reads: 0,
    predecessor_reads: 0,
    current_snapshot_reads: 0,
    snapshot_write_calls: 0,
    restore_write_calls: 0,
  };
}

function addOperationCounts(target, source) {
  for (const key of Object.keys(target)) {
    target[key] += source[key] ?? 0;
  }
  return target;
}

function validateInventoryPageRows(page, {
  pageSize,
  afterRecipeId,
  seenRecipeIds,
}) {
  if (!Array.isArray(page) || page.length > pageSize) {
    throw new RecipeNutritionBackfillError("ALL_RECIPE_INVENTORY_INVALID");
  }
  let previousRecipeId = afterRecipeId;
  for (const row of page) {
    if (
      !isRecord(row) ||
      !nonEmptyText(row.recipe_id) ||
      !Number.isFinite(row.base_servings) ||
      row.base_servings <= 0 ||
      !nonEmptyText(row.updated_at)
    ) {
      throw new RecipeNutritionBackfillError("ALL_RECIPE_INVENTORY_INVALID");
    }
    const recipeId = row.recipe_id.trim();
    if (
      seenRecipeIds.has(recipeId) ||
      (previousRecipeId !== null && compareUnicodeOrdinal(recipeId, previousRecipeId) <= 0)
    ) {
      throw new RecipeNutritionBackfillError("ALL_RECIPE_INVENTORY_INVALID");
    }
    seenRecipeIds.add(recipeId);
    previousRecipeId = recipeId;
  }
}

export async function loadAllRecipeNutritionInventory({
  repository,
  queryVersion,
  pageSize = 250,
  operationCounts = createOperationCounts(),
}) {
  validateInventoryPageSize(pageSize);
  const rows = [];
  const seenRecipeIds = new Set();
  let afterRecipeId = null;
  for (;;) {
    operationCounts.inventory_page_reads += 1;
    const page = await repository.listAllRecipeInventoryPage({
      afterRecipeId,
      limit: pageSize,
    });
    validateInventoryPageRows(page, { pageSize, afterRecipeId, seenRecipeIds });
    rows.push(...page);
    if (page.length === 0) break;
    afterRecipeId = page.at(-1).recipe_id;
    if (page.length < pageSize) break;
  }
  return {
    inventory: buildAllRecipeNutritionInventoryArtifact({
      recipes: rows,
      query_version: queryVersion,
    }),
    operation_counts: operationCounts,
  };
}

export function buildAllRecipeNutritionInventoryArtifact(input) {
  if (
    !isRecord(input) ||
    !Array.isArray(input.recipes) ||
    !nonEmptyText(input.query_version)
  ) {
    throw new RecipeNutritionBackfillError("ALL_RECIPE_INVENTORY_INVALID");
  }

  const seenRecipeIds = new Set();
  const rows = input.recipes.map((recipe) => {
    if (
      !isRecord(recipe) ||
      !nonEmptyText(recipe.recipe_id) ||
      !Number.isFinite(recipe.base_servings) ||
      recipe.base_servings <= 0 ||
      !nonEmptyText(recipe.updated_at)
    ) {
      throw new RecipeNutritionBackfillError("ALL_RECIPE_INVENTORY_INVALID");
    }
    const recipeId = recipe.recipe_id.trim();
    if (seenRecipeIds.has(recipeId)) {
      throw new RecipeNutritionBackfillError("ALL_RECIPE_INVENTORY_DUPLICATE_ID");
    }
    seenRecipeIds.add(recipeId);
    return {
      recipe_id: recipeId,
      base_servings: recipe.base_servings,
      updated_at: recipe.updated_at.trim(),
    };
  }).sort((left, right) => compareUnicodeOrdinal(left.recipe_id, right.recipe_id));

  return withChecksum({
    schema_version: ALL_RECIPE_INVENTORY_SCHEMA_VERSION,
    scope: ALL_RECIPE_SCOPE,
    query_version: input.query_version.trim(),
    row_count: rows.length,
    rows,
  });
}

export function validateAllRecipeNutritionInventoryArtifact(inventory) {
  if (
    !isRecord(inventory) ||
    inventory.schema_version !== ALL_RECIPE_INVENTORY_SCHEMA_VERSION ||
    inventory.scope !== ALL_RECIPE_SCOPE ||
    !nonEmptyText(inventory.query_version) ||
    !Number.isInteger(inventory.row_count) ||
    !Array.isArray(inventory.rows) ||
    !nonEmptyText(inventory.checksum)
  ) {
    throw new RecipeNutritionBackfillError("ALL_RECIPE_INVENTORY_INVALID");
  }

  const seenRecipeIds = new Set();
  const rows = inventory.rows.map((row) => {
    if (
      !isRecord(row) ||
      !nonEmptyText(row.recipe_id) ||
      !Number.isFinite(row.base_servings) ||
      row.base_servings <= 0 ||
      !nonEmptyText(row.updated_at)
    ) {
      throw new RecipeNutritionBackfillError("ALL_RECIPE_INVENTORY_INVALID");
    }
    const recipeId = row.recipe_id.trim();
    if (seenRecipeIds.has(recipeId)) {
      throw new RecipeNutritionBackfillError("ALL_RECIPE_INVENTORY_DUPLICATE_ID");
    }
    seenRecipeIds.add(recipeId);
    return {
      recipe_id: recipeId,
      base_servings: row.base_servings,
      updated_at: row.updated_at.trim(),
    };
  });

  const expectedRows = rows.slice().sort((left, right) => compareUnicodeOrdinal(left.recipe_id, right.recipe_id));
  if (
    inventory.row_count !== expectedRows.length ||
    stableCanonicalStringify(rows) !== stableCanonicalStringify(expectedRows)
  ) {
    throw new RecipeNutritionBackfillError("ALL_RECIPE_INVENTORY_INVALID");
  }

  const body = {
    schema_version: inventory.schema_version,
    scope: inventory.scope,
    query_version: inventory.query_version,
    row_count: inventory.row_count,
    rows: expectedRows,
  };
  if (inventory.checksum !== sha256(body)) {
    throw new RecipeNutritionBackfillError("ALL_RECIPE_INVENTORY_CHECKSUM_MISMATCH");
  }

  return { ...body, checksum: inventory.checksum };
}

function isVolumeUnit(unit) {
  return ["ml", "l", "tbsp", "tsp", "cup"].includes(
    typeof unit === "string" ? unit.trim().toLowerCase() : "",
  );
}

function countIngredientSelectionIssues(ingredient, predecessor) {
  if (!ingredient || ingredient.ingredient_type === "TO_TASTE") {
    return { conflict: 0, multiple_current: 0 };
  }

  const nutritionCandidates = Array.isArray(predecessor?.nutrition_candidates)
    ? predecessor.nutrition_candidates
    : [];
  const conversionCandidates = Array.isArray(predecessor?.conversion_candidates)
    ? predecessor.conversion_candidates
    : [];
  const massCandidates = nutritionCandidates.filter((candidate) =>
    candidate?.nutrition?.profile?.basis_unit === "g"
  );
  const volumeCandidates = nutritionCandidates.filter((candidate) =>
    candidate?.nutrition?.profile?.basis_unit === "ml"
  );

  if (isVolumeUnit(ingredient.unit)) {
    if (volumeCandidates.length > 1) return { conflict: 0, multiple_current: 1 };
    if (volumeCandidates.length === 1) return { conflict: 0, multiple_current: 0 };
    if (massCandidates.length > 1 || conversionCandidates.length > 1) {
      return { conflict: 0, multiple_current: 1 };
    }
    return { conflict: 0, multiple_current: 0 };
  }

  if (massCandidates.length > 1) return { conflict: 0, multiple_current: 1 };
  return { conflict: 0, multiple_current: 0 };
}

function countRecipeSelectionIssues(ingredients, predecessors) {
  let conflict = 0;
  let multipleCurrent = 0;
  for (const ingredient of ingredients) {
    const issues = countIngredientSelectionIssues(
      ingredient,
      predecessors.get(ingredient.ingredient_id),
    );
    conflict += issues.conflict;
    multipleCurrent += issues.multiple_current;
  }
  return { conflict, multiple_current: multipleCurrent };
}

function validateDistinctCurrentRows(currentRows, recipeIds) {
  const counts = new Map();
  for (const row of currentRows) {
    if (!row || typeof row.recipe_id !== "string" || typeof row.id !== "string") {
      throw new RecipeNutritionBackfillError("BACKFILL_CURRENT_DRIFT");
    }
    counts.set(row.recipe_id, (counts.get(row.recipe_id) ?? 0) + 1);
  }
  let multipleCurrentCount = 0;
  for (const recipeId of recipeIds) {
    if ((counts.get(recipeId) ?? 0) > 1) {
      multipleCurrentCount += 1;
    }
  }
  return multipleCurrentCount;
}

function isValidRecipe(recipe) {
  return recipe &&
    typeof recipe.id === "string" && recipe.id.length > 0 &&
    Number.isFinite(recipe.base_servings) && recipe.base_servings > 0 &&
    typeof recipe.updated_at === "string" && recipe.updated_at.length > 0;
}

function isValidIngredient(ingredient) {
  if (!ingredient || typeof ingredient.id !== "string" || ingredient.id.length === 0 ||
    typeof ingredient.ingredient_id !== "string" || ingredient.ingredient_id.length === 0 ||
    typeof ingredient.recipe_id !== "string" || ingredient.recipe_id.length === 0 ||
    !Number.isInteger(ingredient.sort_order) || typeof ingredient.scalable !== "boolean") {
    return false;
  }
  if (ingredient.ingredient_type === "TO_TASTE") {
    return ingredient.amount === null && ingredient.unit === null && !ingredient.scalable;
  }
  return ingredient.ingredient_type === "QUANT" &&
    Number.isFinite(ingredient.amount) && ingredient.amount > 0 &&
    typeof ingredient.unit === "string" && ingredient.unit.trim().length > 0;
}

export function buildRecipeNutritionCalculation(
  recipe,
  ingredients,
  predecessors,
  calculateRecipeNutrition,
) {
  if (!isValidRecipe(recipe) || !Array.isArray(ingredients) ||
    ingredients.some((ingredient) => !isValidIngredient(ingredient) || ingredient.recipe_id !== recipe.id) ||
    !(predecessors instanceof Map) || typeof calculateRecipeNutrition !== "function") {
    throw new RecipeNutritionBackfillError("INVALID_RECIPE_NUTRITION_INPUT");
  }

  const calculatorIngredients = hydrateRecipeNutritionIngredients(ingredients, predecessors)
    .sort((left, right) =>
      compareUnicodeOrdinal(left.id, right.id) ||
      compareUnicodeOrdinal(left.ingredient_id, right.ingredient_id)
    );
  return calculateRecipeNutrition({
    recipe_id: recipe.id,
    recipe_version: recipe.updated_at,
    base_servings: recipe.base_servings,
    ingredients: calculatorIngredients,
  });
}

async function loadSharedCalculator() {
  calculatorModulePromise ??= import("../../lib/nutrition/recipe-nutrition-calculator.ts");
  const calculatorModule = await calculatorModulePromise;
  if (typeof calculatorModule.calculateRecipeNutrition !== "function") {
    throw new RecipeNutritionBackfillError("RECIPE_NUTRITION_INPUT_READ_FAILED");
  }
  return calculatorModule.calculateRecipeNutrition;
}

function validateBatchSize(batchSize) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 30) {
    throw new RecipeNutritionBackfillError("INVALID_BACKFILL_BATCH_SIZE");
  }
}

function summarizeCalculations(calculations) {
  const calculationStatusCounts = { complete: 0, partial: 0, unavailable: 0 };
  const missingReasonCounts = new Map();
  const sourceFingerprints = new Set();
  const sensitivePattern = /api[_-]?key|servicekey|access[_-]?token|authorization|cookie|raw[_-]?(payload|row|provider|response)|[?&](key|token|auth|secret|signature|credential)=|\/(users|home|private)\//gi;
  let secretCount = 0;
  for (const calculation of calculations) {
    calculationStatusCounts[calculation.calculation_status] += 1;
    for (const reason of calculation.missing_reasons) {
      const code = reason.split(":", 1)[0];
      missingReasonCounts.set(code, (missingReasonCounts.get(code) ?? 0) + 1);
    }
    for (const source of calculation.sources) {
      sourceFingerprints.add(sha256(source));
    }
    secretCount += JSON.stringify(calculation).match(sensitivePattern)?.length ?? 0;
  }
  return {
    calculation_status_counts: calculationStatusCounts,
    missing_reason_counts: Object.fromEntries(
      [...missingReasonCounts].sort(([left], [right]) => compareUnicodeOrdinal(left, right)),
    ),
    source_count: sourceFingerprints.size,
    secret_count: secretCount,
  };
}

async function compensateAppliedSnapshots(repository, checkpoints) {
  for (const checkpoint of [...checkpoints].reverse()) {
    if (checkpoint.state !== "applied") continue;
    try {
      await repository.restoreCurrent(
        checkpoint.recipe_id,
        checkpoint.previous_snapshot_id,
        checkpoint.applied_snapshot_id,
      );
    } catch {
      throw new RecipeNutritionBackfillError("BACKFILL_ROLLBACK_FAILED");
    }
  }
}

function copyCheckpointJournal(checkpoints) {
  return checkpoints.map((checkpoint) => ({ ...checkpoint }));
}

export async function runFoodSafetyRecipeNutritionBackfill({
  repository,
  mode,
  batchSize,
  afterRecipeId,
  calculatedAt = new Date().toISOString(),
  onCheckpoint = async () => undefined,
  calculateRecipeNutrition = undefined,
}) {
  validateBatchSize(batchSize);
  if (mode !== "dry-run" && mode !== "apply") {
    throw new RecipeNutritionBackfillError("INVALID_BACKFILL_MODE");
  }

  try {
    await repository.assertExactScope();
  } catch {
    throw new RecipeNutritionBackfillError("INVALID_BACKFILL_SCOPE");
  }

  const scopeRows = await repository.listScopeRecipeIds({ afterRecipeId, batchSize });
  const recipeIds = scopeRows.map((row) => row.recipe_id);
  if (new Set(recipeIds).size !== recipeIds.length || recipeIds.length > batchSize ||
    recipeIds.some((recipeId) => typeof recipeId !== "string" || recipeId.length === 0)) {
    throw new RecipeNutritionBackfillError("INVALID_BACKFILL_SCOPE");
  }
  const nextCursor = recipeIds.at(-1) ?? null;
  if (recipeIds.length === 0) {
    return {
      scope: "foodsafety-30",
      mode,
      candidate_count: recipeIds.length,
      processed_count: 0,
      next_cursor: nextCursor,
      ...summarizeCalculations([]),
      checkpoints: [],
    };
  }

  const [recipeRows, ingredientRows, currentRows] = await Promise.all([
    repository.loadRecipes(recipeIds),
    repository.loadIngredients(recipeIds),
    mode === "apply" ? repository.loadCurrentSnapshots(recipeIds) : Promise.resolve([]),
  ]);
  const recipeMap = new Map(recipeRows.map((row) => [row.id, row]));
  const ingredientsByRecipe = new Map(recipeIds.map((recipeId) => [recipeId, []]));
  for (const ingredient of ingredientRows) {
    const rows = ingredientsByRecipe.get(ingredient.recipe_id);
    if (!rows) throw new RecipeNutritionBackfillError("INVALID_BACKFILL_SCOPE");
    rows.push(ingredient);
  }
  if (recipeMap.size !== recipeIds.length) {
    throw new RecipeNutritionBackfillError("RECIPE_NUTRITION_INPUT_READ_FAILED");
  }
  const ingredientIds = [...new Set(ingredientRows.map((row) => row.ingredient_id))]
    .sort(compareUnicodeOrdinal);
  let predecessors;
  let calculator;
  try {
    [predecessors, calculator] = await Promise.all([
      repository.loadPredecessors(ingredientIds),
      calculateRecipeNutrition ? Promise.resolve(calculateRecipeNutrition) : loadSharedCalculator(),
    ]);
  } catch {
    throw new RecipeNutritionBackfillError("RECIPE_NUTRITION_INPUT_READ_FAILED");
  }
  if (!(predecessors instanceof Map)) {
    throw new RecipeNutritionBackfillError("RECIPE_NUTRITION_INPUT_READ_FAILED");
  }
  const calculationMap = new Map(recipeIds.map((recipeId) => [
    recipeId,
    buildRecipeNutritionCalculation(
      recipeMap.get(recipeId),
      ingredientsByRecipe.get(recipeId),
      predecessors,
      calculator,
    ),
  ]));
  const inputGuardMap = new Map(recipeIds.map((recipeId) => [
    recipeId,
    buildRecipeNutritionInputGuard(ingredientsByRecipe.get(recipeId), predecessors),
  ]));
  const calculationSummary = summarizeCalculations([...calculationMap.values()]);
  if (mode === "dry-run") {
    return {
      scope: "foodsafety-30",
      mode,
      candidate_count: recipeIds.length,
      processed_count: 0,
      next_cursor: nextCursor,
      ...calculationSummary,
      checkpoints: [],
    };
  }
  const currentMap = new Map(currentRows.map((row) => [row.recipe_id, row]));
  const checkpoints = [];

  for (const recipeId of recipeIds) {
    const calculation = calculationMap.get(recipeId);
    const previousSnapshotId = currentMap.get(recipeId)?.id ?? null;
    const expectedSnapshotId = repository.deriveSnapshotId(recipeId, calculation);
    const checkpoint = {
      recipe_id: recipeId,
      previous_snapshot_id: previousSnapshotId,
      expected_input_hash: calculation.input_hash,
      applied_snapshot_id: expectedSnapshotId,
      state: "planned",
    };
    checkpoints.push(checkpoint);
    try {
      await onCheckpoint(copyCheckpointJournal(checkpoints));
    } catch {
      await compensateAppliedSnapshots(repository, checkpoints);
      throw new RecipeNutritionBackfillError("BACKFILL_APPLY_FAILED");
    }
    let written;
    try {
      written = await repository.writeSnapshot(
        recipeId,
        calculation,
        calculatedAt,
        recipeMap.get(recipeId).updated_at,
        inputGuardMap.get(recipeId),
      );
      if (written.snapshot_id !== expectedSnapshotId) {
        checkpoint.applied_snapshot_id = written.snapshot_id;
        checkpoint.state = "applied";
        throw new RecipeNutritionBackfillError("BACKFILL_SNAPSHOT_ID_MISMATCH");
      }
    } catch {
      await compensateAppliedSnapshots(repository, checkpoints);
      throw new RecipeNutritionBackfillError("BACKFILL_APPLY_FAILED");
    }
    if (previousSnapshotId !== written.snapshot_id) {
      checkpoint.state = "applied";
    } else {
      checkpoints.pop();
    }
    try {
      await onCheckpoint(copyCheckpointJournal(checkpoints));
    } catch {
      await compensateAppliedSnapshots(repository, checkpoints);
      throw new RecipeNutritionBackfillError("BACKFILL_APPLY_FAILED");
    }
  }

  return {
    scope: "foodsafety-30",
    mode,
    candidate_count: recipeIds.length,
    processed_count: recipeIds.length,
    next_cursor: nextCursor,
    ...calculationSummary,
    checkpoints,
  };
}

export async function rollbackFoodSafetyRecipeNutritionBackfill({ repository, checkpoints }) {
  if (!Array.isArray(checkpoints) || checkpoints.length > 30) {
    throw new RecipeNutritionBackfillError("INVALID_BACKFILL_CHECKPOINT");
  }
  const recipeIds = checkpoints.map((checkpoint) => checkpoint.recipe_id);
  if (new Set(recipeIds).size !== recipeIds.length || checkpoints.some((checkpoint) =>
    typeof checkpoint.recipe_id !== "string" ||
    typeof checkpoint.expected_input_hash !== "string" ||
    !/^[0-9a-f]{64}$/.test(checkpoint.expected_input_hash) ||
    typeof checkpoint.applied_snapshot_id !== "string" ||
    !["planned", "applied"].includes(checkpoint.state) ||
    (checkpoint.previous_snapshot_id !== null && typeof checkpoint.previous_snapshot_id !== "string")
  )) {
    throw new RecipeNutritionBackfillError("INVALID_BACKFILL_CHECKPOINT");
  }

  try {
    await repository.assertScopeRecipeIds(recipeIds);
  } catch {
    throw new RecipeNutritionBackfillError("INVALID_BACKFILL_SCOPE");
  }

  const currentRows = await repository.loadCurrentSnapshots(recipeIds);
  const currentMap = new Map(currentRows.map((row) => [row.recipe_id, row]));
  const resolvedCheckpoints = [];
  for (const checkpoint of checkpoints) {
    const current = currentMap.get(checkpoint.recipe_id);
    if (checkpoint.state === "applied") {
      if (current?.id !== checkpoint.applied_snapshot_id) {
        throw new RecipeNutritionBackfillError("BACKFILL_CURRENT_DRIFT");
      }
      resolvedCheckpoints.push(checkpoint);
    } else if (current?.id === checkpoint.applied_snapshot_id) {
      resolvedCheckpoints.push({ ...checkpoint, state: "applied" });
    }
  }
  if (resolvedCheckpoints.some((checkpoint) => !checkpoint.applied_snapshot_id)) {
    throw new RecipeNutritionBackfillError("BACKFILL_CURRENT_DRIFT");
  }

  for (const checkpoint of [...resolvedCheckpoints].reverse()) {
    try {
      await repository.restoreCurrent(
        checkpoint.recipe_id,
        checkpoint.previous_snapshot_id,
        checkpoint.applied_snapshot_id,
      );
    } catch {
      throw new RecipeNutritionBackfillError("BACKFILL_ROLLBACK_FAILED");
    }
  }
  return {
    scope: "foodsafety-30",
    mode: "rollback",
    processed_count: resolvedCheckpoints.length,
  };
}

export async function runAllRecipeNutritionRecalculation({
  repository,
  inventory,
  mode,
  batchSize,
  inventoryPageSize = 250,
  validateLiveInventory = true,
  afterRecipeId,
  calculatedAt = new Date().toISOString(),
  onCheckpoint = async () => undefined,
  calculateRecipeNutrition = undefined,
}) {
  validateBatchSize(batchSize);
  validateInventoryPageSize(inventoryPageSize);
  if (mode !== "dry-run" && mode !== "apply") {
    throw new RecipeNutritionBackfillError("INVALID_BACKFILL_MODE");
  }

  const operationCounts = createOperationCounts();
  const validatedInventory = validateAllRecipeNutritionInventoryArtifact(inventory);
  if (validateLiveInventory) {
    const { inventory: liveInventory } = await loadAllRecipeNutritionInventory({
      repository,
      queryVersion: validatedInventory.query_version,
      pageSize: inventoryPageSize,
      operationCounts,
    });
    if (liveInventory.checksum !== validatedInventory.checksum) {
      throw new RecipeNutritionBackfillError("ALL_RECIPE_INVENTORY_DRIFT");
    }
  }

  const candidateRows = validatedInventory.rows
    .filter((row) => afterRecipeId === null || compareUnicodeOrdinal(row.recipe_id, afterRecipeId) > 0)
    .slice(0, batchSize);
  const recipeIds = candidateRows.map((row) => row.recipe_id);
  const nextCursor = recipeIds.at(-1) ?? null;
  if (recipeIds.length === 0) {
    return {
      scope: ALL_RECIPE_SCOPE,
      mode,
      denominator_count: validatedInventory.row_count,
      candidate_count: 0,
      processed_count: 0,
      writes_committed: 0,
      next_cursor: nextCursor,
      calculation_status_counts: { complete: 0, partial: 0, unavailable: 0 },
      unclassified_count: 0,
      conflict_count: 0,
      multiple_current_count: 0,
      missing_reason_counts: {},
      source_count: 0,
      source_fingerprints: [],
      secret_count: 0,
      operation_counts: operationCounts,
      checkpoints: [],
      inventory_checksum: validatedInventory.checksum,
    };
  }

  operationCounts.recipe_reads += 1;
  operationCounts.ingredient_reads += 1;
  if (mode === "apply") operationCounts.current_snapshot_reads += 1;
  const [recipeRows, ingredientRows, currentRows] = await Promise.all([
    repository.loadRecipes(recipeIds),
    repository.loadIngredients(recipeIds),
    mode === "apply" ? repository.loadCurrentSnapshots(recipeIds) : Promise.resolve([]),
  ]);
  const recipeMap = new Map(recipeRows.map((row) => [row.id, row]));
  const ingredientsByRecipe = new Map(recipeIds.map((recipeId) => [recipeId, []]));
  for (const ingredient of ingredientRows) {
    const rows = ingredientsByRecipe.get(ingredient.recipe_id);
    if (!rows) throw new RecipeNutritionBackfillError("ALL_RECIPE_INVENTORY_DRIFT");
    rows.push(ingredient);
  }
  if (recipeMap.size !== recipeIds.length) {
    throw new RecipeNutritionBackfillError("ALL_RECIPE_INVENTORY_DRIFT");
  }
  for (const row of candidateRows) {
    const recipe = recipeMap.get(row.recipe_id);
    if (
      !recipe ||
      recipe.base_servings !== row.base_servings ||
      recipe.updated_at !== row.updated_at
    ) {
      throw new RecipeNutritionBackfillError("ALL_RECIPE_INVENTORY_DRIFT");
    }
  }

  const ingredientIds = [...new Set(ingredientRows.map((row) => row.ingredient_id))]
    .sort(compareUnicodeOrdinal);
  let predecessors;
  let calculator;
  operationCounts.predecessor_reads += 1;
  try {
    [predecessors, calculator] = await Promise.all([
      repository.loadPredecessors(ingredientIds),
      calculateRecipeNutrition ? Promise.resolve(calculateRecipeNutrition) : loadSharedCalculator(),
    ]);
  } catch {
    throw new RecipeNutritionBackfillError("RECIPE_NUTRITION_INPUT_READ_FAILED");
  }
  if (!(predecessors instanceof Map)) {
    throw new RecipeNutritionBackfillError("RECIPE_NUTRITION_INPUT_READ_FAILED");
  }

  const currentRowMultiplicity = mode === "apply"
    ? validateDistinctCurrentRows(currentRows, recipeIds)
    : 0;
  let conflictCount = 0;
  let multipleCurrentCount = currentRowMultiplicity;
  for (const recipeId of recipeIds) {
    const issues = countRecipeSelectionIssues(
      ingredientsByRecipe.get(recipeId) ?? [],
      predecessors,
    );
    conflictCount += issues.conflict;
    multipleCurrentCount += issues.multiple_current;
  }
  if (mode === "apply" && (conflictCount > 0 || multipleCurrentCount > 0)) {
    throw new RecipeNutritionBackfillError("ALL_RECIPE_CONFLICT_DETECTED");
  }

  const calculationMap = new Map(recipeIds.map((recipeId) => [
    recipeId,
    buildRecipeNutritionCalculation(
      recipeMap.get(recipeId),
      ingredientsByRecipe.get(recipeId),
      predecessors,
      calculator,
    ),
  ]));
  const inputGuardMap = new Map(recipeIds.map((recipeId) => [
    recipeId,
    buildRecipeNutritionInputGuard(ingredientsByRecipe.get(recipeId), predecessors),
  ]));
  const calculationSummary = summarizeCalculations([...calculationMap.values()]);
  const sourceFingerprints = [...new Set(
    [...calculationMap.values()].flatMap((calculation) =>
      calculation.sources.map((source) => sha256(source))
    ),
  )].sort(compareUnicodeOrdinal);
  const warningsJson = [...new Set(
    [...calculationMap.values()].flatMap((calculation) => calculation.warnings)
  )].sort(compareUnicodeOrdinal);

  if (mode === "dry-run") {
    return {
      scope: ALL_RECIPE_SCOPE,
      mode,
      denominator_count: validatedInventory.row_count,
      candidate_count: recipeIds.length,
      processed_count: 0,
      writes_committed: 0,
      next_cursor: nextCursor,
      ...calculationSummary,
      warnings_json: warningsJson,
      source_fingerprints: sourceFingerprints,
      unclassified_count: recipeIds.length - (
        calculationSummary.calculation_status_counts.complete +
        calculationSummary.calculation_status_counts.partial +
        calculationSummary.calculation_status_counts.unavailable
      ),
      conflict_count: conflictCount,
      multiple_current_count: multipleCurrentCount,
      operation_counts: operationCounts,
      checkpoints: [],
      inventory_checksum: validatedInventory.checksum,
    };
  }

  const currentMap = new Map(currentRows.map((row) => [row.recipe_id, row]));
  const checkpoints = [];

  for (const recipeId of recipeIds) {
    const calculation = calculationMap.get(recipeId);
    const previousSnapshotId = currentMap.get(recipeId)?.id ?? null;
    const expectedSnapshotId = repository.deriveSnapshotId(recipeId, calculation);
    const checkpoint = {
      recipe_id: recipeId,
      previous_snapshot_id: previousSnapshotId,
      expected_input_hash: calculation.input_hash,
      applied_snapshot_id: expectedSnapshotId,
      state: "planned",
    };
    checkpoints.push(checkpoint);
    try {
      await onCheckpoint(copyCheckpointJournal(checkpoints));
    } catch {
      await compensateAppliedSnapshots(repository, checkpoints);
      throw new RecipeNutritionBackfillError("BACKFILL_APPLY_FAILED");
    }

    let written;
    try {
      operationCounts.snapshot_write_calls += 1;
      written = await repository.writeSnapshot(
        recipeId,
        calculation,
        calculatedAt,
        recipeMap.get(recipeId).updated_at,
        inputGuardMap.get(recipeId),
      );
      if (written.snapshot_id !== expectedSnapshotId) {
        checkpoint.applied_snapshot_id = written.snapshot_id;
        checkpoint.state = "applied";
        throw new RecipeNutritionBackfillError("BACKFILL_SNAPSHOT_ID_MISMATCH");
      }
    } catch {
      await compensateAppliedSnapshots(repository, checkpoints);
      throw new RecipeNutritionBackfillError("BACKFILL_APPLY_FAILED");
    }
    if (previousSnapshotId !== written.snapshot_id) {
      checkpoint.state = "applied";
    } else {
      checkpoints.pop();
    }
    try {
      await onCheckpoint(copyCheckpointJournal(checkpoints));
    } catch {
      await compensateAppliedSnapshots(repository, checkpoints);
      throw new RecipeNutritionBackfillError("BACKFILL_APPLY_FAILED");
    }
  }

  return {
    scope: ALL_RECIPE_SCOPE,
    mode: "apply",
    denominator_count: validatedInventory.row_count,
    candidate_count: recipeIds.length,
    processed_count: recipeIds.length,
    writes_committed: checkpoints.length,
    next_cursor: nextCursor,
    ...calculationSummary,
    warnings_json: warningsJson,
    source_fingerprints: sourceFingerprints,
    unclassified_count: recipeIds.length - (
      calculationSummary.calculation_status_counts.complete +
      calculationSummary.calculation_status_counts.partial +
      calculationSummary.calculation_status_counts.unavailable
    ),
    conflict_count: conflictCount,
    multiple_current_count: multipleCurrentCount,
    operation_counts: operationCounts,
    checkpoints,
    inventory_checksum: validatedInventory.checksum,
  };
}

export async function runAllRecipeNutritionRecalculationLifecycle({
  repository,
  inventory,
  mode,
  batchSize,
  inventoryPageSize = 250,
  calculatedAt = new Date().toISOString(),
  onCheckpoint = async () => undefined,
  calculateRecipeNutrition = undefined,
}) {
  if (mode !== "dry-run" && mode !== "apply") {
    throw new RecipeNutritionBackfillError("INVALID_BACKFILL_MODE");
  }
  const validatedInventory = validateAllRecipeNutritionInventoryArtifact(inventory);
  const totals = {
    scope: validatedInventory.scope,
    mode,
    inventory_checksum: validatedInventory.checksum,
    denominator_count: validatedInventory.row_count,
    candidate_count: 0,
    processed_count: 0,
    writes_committed: 0,
    calculation_status_counts: { complete: 0, partial: 0, unavailable: 0 },
    missing_reason_counts: {},
    warnings_json: [],
    source_count: 0,
    source_fingerprints: [],
    secret_count: 0,
    conflict_count: 0,
    multiple_current_count: 0,
    operation_counts: createOperationCounts(),
    checkpoints: [],
    next_cursor: null,
  };
  const sourceFingerprints = new Set();
  const warnings = new Set();

  let afterRecipeId = null;
  let validateLiveInventory = true;
  for (;;) {
    const result = await runAllRecipeNutritionRecalculation({
      repository,
      inventory: validatedInventory,
      mode,
      batchSize,
      inventoryPageSize,
      validateLiveInventory,
      afterRecipeId,
      calculatedAt,
      calculateRecipeNutrition,
      onCheckpoint: mode === "apply"
        ? async (batchJournal) => onCheckpoint([...totals.checkpoints, ...batchJournal])
        : undefined,
    });
    validateLiveInventory = false;
    if (result.candidate_count === 0) break;
    totals.candidate_count += result.candidate_count;
    totals.processed_count += mode === "dry-run" ? result.candidate_count : result.processed_count;
    totals.writes_committed += result.writes_committed;
    totals.calculation_status_counts.complete += result.calculation_status_counts.complete;
    totals.calculation_status_counts.partial += result.calculation_status_counts.partial;
    totals.calculation_status_counts.unavailable += result.calculation_status_counts.unavailable;
    totals.secret_count += result.secret_count;
    totals.conflict_count += result.conflict_count;
    totals.multiple_current_count += result.multiple_current_count;
    for (const warning of result.warnings_json ?? []) {
      warnings.add(warning);
    }
    totals.warnings_json = [...warnings].sort(compareUnicodeOrdinal);
    for (const fingerprint of result.source_fingerprints ?? []) {
      sourceFingerprints.add(fingerprint);
    }
    totals.source_count = sourceFingerprints.size;
    totals.source_fingerprints = [...sourceFingerprints].sort(compareUnicodeOrdinal);
    addOperationCounts(totals.operation_counts, result.operation_counts ?? createOperationCounts());
    totals.checkpoints.push(...result.checkpoints);
    for (const [reason, count] of Object.entries(result.missing_reason_counts)) {
      totals.missing_reason_counts[reason] = (totals.missing_reason_counts[reason] ?? 0) + count;
    }
    afterRecipeId = result.next_cursor;
    totals.next_cursor = afterRecipeId;
    if (!afterRecipeId) break;
  }

  const classifiedCount =
    totals.calculation_status_counts.complete +
    totals.calculation_status_counts.partial +
    totals.calculation_status_counts.unavailable;
  totals.unclassified_count = totals.denominator_count - classifiedCount;
  if (totals.candidate_count !== totals.denominator_count || totals.unclassified_count !== 0) {
    throw new RecipeNutritionBackfillError("ALL_RECIPE_ACCOUNTING_MISMATCH");
  }
  if (mode === "apply" && (totals.conflict_count > 0 || totals.multiple_current_count > 0)) {
    throw new RecipeNutritionBackfillError("ALL_RECIPE_CONFLICT_DETECTED");
  }
  totals.next_cursor = null;
  return totals;
}

export async function rollbackAllRecipeNutritionRecalculation({
  repository,
  inventory,
  checkpoints,
  inventoryPageSize = 250,
}) {
  validateInventoryPageSize(inventoryPageSize);
  const operationCounts = createOperationCounts();
  const validatedInventory = validateAllRecipeNutritionInventoryArtifact(inventory);
  const { inventory: liveInventory } = await loadAllRecipeNutritionInventory({
    repository,
    queryVersion: validatedInventory.query_version,
    pageSize: inventoryPageSize,
    operationCounts,
  });
  if (liveInventory.checksum !== validatedInventory.checksum) {
    throw new RecipeNutritionBackfillError("ALL_RECIPE_INVENTORY_DRIFT");
  }
  const recipeIds = checkpoints.map((checkpoint) => checkpoint.recipe_id);
  const inventoryRecipeIds = new Set(inventory.rows.map((row) => row.recipe_id));
  if (recipeIds.some((recipeId) => !inventoryRecipeIds.has(recipeId))) {
    throw new RecipeNutritionBackfillError("ALL_RECIPE_INVENTORY_DRIFT");
  }

  operationCounts.current_snapshot_reads += 1;
  const currentRows = await repository.loadCurrentSnapshots(recipeIds);
  if (validateDistinctCurrentRows(currentRows, recipeIds) > 0) {
    throw new RecipeNutritionBackfillError("BACKFILL_CURRENT_DRIFT");
  }
  const currentMap = new Map(currentRows.map((row) => [row.recipe_id, row]));
  const resolvedCheckpoints = [];
  for (const checkpoint of checkpoints) {
    const current = currentMap.get(checkpoint.recipe_id);
    if (checkpoint.state === "applied") {
      if (current?.id !== checkpoint.applied_snapshot_id) {
        throw new RecipeNutritionBackfillError("BACKFILL_CURRENT_DRIFT");
      }
      resolvedCheckpoints.push(checkpoint);
    } else if (current?.id === checkpoint.applied_snapshot_id) {
      resolvedCheckpoints.push({ ...checkpoint, state: "applied" });
    }
  }

  for (const checkpoint of [...resolvedCheckpoints].reverse()) {
    try {
      operationCounts.restore_write_calls += 1;
      await repository.restoreCurrent(
        checkpoint.recipe_id,
        checkpoint.previous_snapshot_id,
        checkpoint.applied_snapshot_id,
      );
    } catch {
      throw new RecipeNutritionBackfillError("BACKFILL_ROLLBACK_FAILED");
    }
  }

  return {
    scope: ALL_RECIPE_SCOPE,
    mode: "rollback",
    processed_count: resolvedCheckpoints.length,
    writes_committed: resolvedCheckpoints.length,
    operation_counts: operationCounts,
    inventory_checksum: inventory.checksum,
  };
}

function assertQueryResult(result) {
  if (result.error || !result.data) {
    throw new RecipeNutritionBackfillError("RECIPE_NUTRITION_INPUT_READ_FAILED");
  }
  return result.data;
}

function snapshotPayload(calculation, calculatedAt) {
  return {
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
  };
}

export function createSupabaseRecipeNutritionBackfillRepository(client) {
  return {
    deriveSnapshotId(recipeId, calculation) {
      return deriveRecipeNutritionSnapshotId(
        recipeId,
        calculation.input_hash,
        calculation.calculation_version,
      );
    },
    async assertExactScope() {
      const rows = assertQueryResult(await client
        .from("recipe_sources")
        .select("recipe_id")
        .eq("extraction_meta_json->>source_provider", "foodsafety-cookrcp")
        .in("extraction_meta_json->>reviewed_scope", FOODSAFETY_SCOPE_MARKERS)
        .limit(31));
      const recipeIds = rows.map((row) => row.recipe_id);
      if (recipeIds.length !== 30 || new Set(recipeIds).size !== 30) {
        throw new RecipeNutritionBackfillError("INVALID_BACKFILL_SCOPE");
      }
    },
    async listScopeRecipeIds({ afterRecipeId, batchSize }) {
      let query = client
        .from("recipe_sources")
        .select("recipe_id")
        .eq("extraction_meta_json->>source_provider", "foodsafety-cookrcp")
        .in("extraction_meta_json->>reviewed_scope", FOODSAFETY_SCOPE_MARKERS)
        .order("recipe_id", { ascending: true })
        .limit(batchSize);
      if (afterRecipeId) query = query.gt("recipe_id", afterRecipeId);
      return assertQueryResult(await query);
    },
    async assertScopeRecipeIds(recipeIds) {
      if (recipeIds.length === 0) return;
      const rows = assertQueryResult(await client
        .from("recipe_sources")
        .select("recipe_id")
        .eq("extraction_meta_json->>source_provider", "foodsafety-cookrcp")
        .in("extraction_meta_json->>reviewed_scope", FOODSAFETY_SCOPE_MARKERS)
        .in("recipe_id", recipeIds));
      const matchedIds = new Set(rows.map((row) => row.recipe_id));
      if (matchedIds.size !== recipeIds.length || recipeIds.some((id) => !matchedIds.has(id))) {
        throw new RecipeNutritionBackfillError("INVALID_BACKFILL_SCOPE");
      }
    },
    async loadRecipes(recipeIds) {
      if (recipeIds.length === 0) return [];
      return assertQueryResult(await client
        .from("recipes")
        .select("id, base_servings, updated_at")
        .in("id", recipeIds)
        .order("id", { ascending: true }));
    },
    async listAllRecipeInventoryPage({ afterRecipeId, limit }) {
      let query = client
        .from("recipes")
        .select("id, base_servings, updated_at")
        .order("id", { ascending: true })
        .limit(limit);
      if (afterRecipeId) query = query.gt("id", afterRecipeId);
      const rows = assertQueryResult(await query);
      return rows.map((row) => ({
        recipe_id: row.id,
        base_servings: row.base_servings,
        updated_at: row.updated_at,
      }));
    },
    async loadIngredients(recipeIds) {
      if (recipeIds.length === 0) return [];
      return assertQueryResult(await client
        .from("recipe_ingredients")
        .select("id, recipe_id, ingredient_id, amount, unit, ingredient_type, scalable, sort_order")
        .in("recipe_id", recipeIds)
        .order("recipe_id", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true }));
    },
    async loadPredecessors(ingredientIds) {
      return loadRecipeNutritionPredecessors(client, ingredientIds);
    },
    async loadCurrentSnapshots(recipeIds) {
      if (recipeIds.length === 0) return [];
      return assertQueryResult(await client
        .from("recipe_nutrition_snapshots")
        .select("recipe_id, id")
        .in("recipe_id", recipeIds)
        .eq("is_current", true));
    },
    async writeSnapshot(recipeId, calculation, calculatedAt, expectedRecipeVersion, inputGuard) {
      const result = await client.rpc("write_recipe_nutrition_snapshot", {
        p_recipe_id: recipeId,
        p_snapshot: snapshotPayload(calculation, calculatedAt),
        p_expected_recipe_updated_at: expectedRecipeVersion,
        p_input_guard: inputGuard,
      });
      if (result.error || !result.data) {
        throw new RecipeNutritionBackfillError("BACKFILL_APPLY_FAILED");
      }
      return result.data;
    },
    async restoreCurrent(recipeId, snapshotId, expectedCurrentSnapshotId) {
      const result = await client.rpc("restore_recipe_nutrition_snapshot_current", {
        p_recipe_id: recipeId,
        p_snapshot_id: snapshotId,
        p_expected_current_snapshot_id: expectedCurrentSnapshotId,
      });
      if (result.error || !result.data) {
        throw new RecipeNutritionBackfillError("BACKFILL_ROLLBACK_FAILED");
      }
      return result.data;
    },
  };
}
