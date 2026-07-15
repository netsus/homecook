import { createHash } from "node:crypto";

const CALCULATION_VERSION = "recipe-nutrition-v1";
const ROUNDING_POLICY_VERSION = "display-v1";
const FOODSAFETY_SCOPE_MARKERS = [
  "pilot_30_quality_corrected",
  "pilot_30_quality_corrected_replacement",
];
const CORE_NUTRIENTS = [
  "energy_kcal",
  "carbohydrate_g",
  "protein_g",
  "fat_g",
  "sodium_mg",
];
const WARNING_PRIORITY = [
  "PREDECESSOR_NOT_APPROVED",
  "NUTRITION_PROFILE_MISSING",
  "INVALID_QUANTITY",
  "UNIT_CONVERSION_MISSING",
  "PIECE_WEIGHT_REQUIRED",
  "TO_TASTE_EXCLUDED",
  "REPRESENTATIVE_VOLUME_CONVERSION_USED",
  "PIECE_WEIGHT_CONVERSION_USED",
];

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

function canonicalStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
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

function stableWarnings(values) {
  return [...new Set(values)].sort((left, right) =>
    (WARNING_PRIORITY.indexOf(left) === -1 ? Number.MAX_SAFE_INTEGER : WARNING_PRIORITY.indexOf(left)) -
      (WARNING_PRIORITY.indexOf(right) === -1 ? Number.MAX_SAFE_INTEGER : WARNING_PRIORITY.indexOf(right)) ||
    compareUnicodeOrdinal(left, right)
  );
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

function calculatorIngredient(ingredient) {
  return {
    id: ingredient.id,
    ingredient_id: ingredient.ingredient_id,
    amount: ingredient.amount,
    unit: ingredient.unit,
    ingredient_type: ingredient.ingredient_type,
    scalable: ingredient.scalable,
    preparation_state: null,
    size_code: null,
    edible_state: null,
    nutrition: undefined,
    conversion_assignment: null,
    piece_weight: null,
  };
}

export function buildFailClosedRecipeNutritionCalculation(recipe, ingredients) {
  if (!isValidRecipe(recipe) || !Array.isArray(ingredients) ||
    ingredients.some((ingredient) => !isValidIngredient(ingredient) || ingredient.recipe_id !== recipe.id)) {
    throw new RecipeNutritionBackfillError("INVALID_RECIPE_NUTRITION_INPUT");
  }

  const calculatorIngredients = ingredients
    .map(calculatorIngredient)
    .sort((left, right) =>
      compareUnicodeOrdinal(left.id, right.id) ||
      compareUnicodeOrdinal(left.ingredient_id, right.ingredient_id)
    );
  const warnings = [];
  const missingReasons = [];
  let targetIngredientCount = 0;
  for (const ingredient of calculatorIngredients) {
    if (ingredient.ingredient_type === "TO_TASTE") {
      warnings.push("TO_TASTE_EXCLUDED");
      missingReasons.push(`TO_TASTE_EXCLUDED:${ingredient.id}`);
    } else {
      targetIngredientCount += 1;
      warnings.push("NUTRITION_PROFILE_MISSING");
      missingReasons.push(`NUTRITION_PROFILE_MISSING:${ingredient.id}`);
    }
  }

  const values = Object.fromEntries(CORE_NUTRIENTS.map((code) => [code, {
    amount: null,
    known_amount: null,
    status: "unavailable",
    display_mode: null,
  }]));
  const canonicalInput = {
    recipe_id: recipe.id,
    recipe_version: recipe.updated_at,
    base_servings: recipe.base_servings,
    calculation_version: CALCULATION_VERSION,
    rounding_policy_version: ROUNDING_POLICY_VERSION,
    ingredients: calculatorIngredients,
  };

  return {
    basis: { amount: recipe.base_servings, unit: "serving" },
    base_servings: recipe.base_servings,
    values,
    scalable_values: {},
    fixed_values: {},
    calculation_status: "unavailable",
    calculation_quality: null,
    reflected_ingredient_count: 0,
    target_ingredient_count: targetIngredientCount,
    missing_reasons: [...new Set(missingReasons)].sort(),
    warnings: stableWarnings(warnings),
    sources: [],
    input_hash: createHash("sha256").update(canonicalStringify(canonicalInput)).digest("hex"),
    calculation_version: CALCULATION_VERSION,
    rounding_policy_version: ROUNDING_POLICY_VERSION,
  };
}

function validateBatchSize(batchSize) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 30) {
    throw new RecipeNutritionBackfillError("INVALID_BACKFILL_BATCH_SIZE");
  }
}

function summarizeCalculations(calculations) {
  const calculationStatusCounts = { complete: 0, partial: 0, unavailable: 0 };
  const missingReasonCounts = new Map();
  const sources = new Set();
  const sensitivePattern = /api[_-]?key|servicekey|access[_-]?token|authorization|cookie|raw[_-]?(payload|row|provider|response)|[?&](key|token|auth|secret|signature|credential)=|\/(users|home|private)\//gi;
  let secretCount = 0;
  for (const calculation of calculations) {
    calculationStatusCounts[calculation.calculation_status] += 1;
    for (const reason of calculation.missing_reasons) {
      const code = reason.split(":", 1)[0];
      missingReasonCounts.set(code, (missingReasonCounts.get(code) ?? 0) + 1);
    }
    for (const source of calculation.sources) {
      sources.add(canonicalStringify(source));
    }
    secretCount += JSON.stringify(calculation).match(sensitivePattern)?.length ?? 0;
  }
  return {
    calculation_status_counts: calculationStatusCounts,
    missing_reason_counts: Object.fromEntries(
      [...missingReasonCounts].sort(([left], [right]) => compareUnicodeOrdinal(left, right)),
    ),
    source_count: sources.size,
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
  const calculationMap = new Map(recipeIds.map((recipeId) => [
    recipeId,
    buildFailClosedRecipeNutritionCalculation(
      recipeMap.get(recipeId),
      ingredientsByRecipe.get(recipeId),
    ),
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
    async loadCurrentSnapshots(recipeIds) {
      if (recipeIds.length === 0) return [];
      return assertQueryResult(await client
        .from("recipe_nutrition_snapshots")
        .select("recipe_id, id")
        .in("recipe_id", recipeIds)
        .eq("is_current", true));
    },
    async writeSnapshot(recipeId, calculation, calculatedAt, expectedRecipeVersion) {
      const result = await client.rpc("write_recipe_nutrition_snapshot", {
        p_recipe_id: recipeId,
        p_snapshot: snapshotPayload(calculation, calculatedAt),
        p_expected_recipe_updated_at: expectedRecipeVersion,
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
