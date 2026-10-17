import { withIngredientMassFallback } from "@/lib/server/cooked-weight-mass-fallback";
import { snapshotIngredients, type CookingWeightSessionClient, type CookingWeightSnapshotIngredient } from "@/lib/server/cooked-batch-weight-estimate";
import { hydrateRecipeProductNutrition, type RecipeProductNutritionClient } from "@/lib/server/recipe-product-nutrition";
import { predictSnapshotWeight } from "@/lib/server/cooked-weight-snapshot-prediction";
import { hydrateRecipeNutritionIngredients, loadRecipeNutritionPredecessors } from "@/scripts/lib/recipe-nutrition-predecessor.mjs";
import type { RecipeNutritionIngredientInput } from "@/lib/nutrition/recipe-nutrition-calculator";
import type { CookedWeightSummary, CookingModeStep } from "@/types/cooking";
import type { SnapshotWeightPrediction } from "@/lib/server/cooked-weight-snapshot-prediction";
import { callCookedBatchRpc, type CookedBatchRpcClient } from "@/lib/server/cooked-batches";
import { projectSnapshotV2CookModeData } from "@/lib/server/recipe-content-snapshot-future-propagation";

/** Default OFF. DB write gate is independent and also defaults OFF. */
export function cookedWeightEvidenceEnabled() {
  return process.env.HOMECOOK_COOKED_WEIGHT_EVIDENCE === "1";
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function readSnapshotWeightPrediction({ client, weightClient, ownerId, sessionId, cookingSteps, methodClient, authorityArgs }: {
  client: CookingWeightSessionClient & RecipeProductNutritionClient;
  weightClient: { from(table: string): unknown } | null;
  ownerId: string; sessionId: string;
  cookingSteps?: readonly CookingModeStep[];
  methodClient?: CookedBatchRpcClient;
  authorityArgs?: Record<string, unknown>;
}): Promise<SnapshotWeightPrediction | null> {
  const result = await client.from("cooking_sessions")
    .select("id,user_id,recipe_id,status,contract_version,cooking_servings,recipe_content_snapshot_id,recipe_content_snapshots(id,recipe_id,owner_user_id,base_servings,ingredients_json,steps_json)")
    .eq("id", sessionId).eq("user_id", ownerId).maybeSingle();
  if (result.error) throw result.error;
  const session = result.data;
  if (!record(session)) return null;
  const joined = session.recipe_content_snapshots;
  const snapshot = Array.isArray(joined) && joined.length === 1 ? joined[0] : joined;
  if (session.id !== sessionId || session.user_id !== ownerId || session.contract_version !== "snapshot_v2"
    || !["in_progress", "completed"].includes(String(session.status))
    || typeof session.cooking_servings !== "number" || !Number.isSafeInteger(session.cooking_servings) || session.cooking_servings <= 0
    || !record(snapshot) || typeof snapshot.id !== "string" || snapshot.id !== session.recipe_content_snapshot_id
    || snapshot.recipe_id !== session.recipe_id || (snapshot.owner_user_id !== null && snapshot.owner_user_id !== ownerId)
    || typeof snapshot.base_servings !== "number" || !Number.isFinite(snapshot.base_servings) || snapshot.base_servings <= 0
    || !Array.isArray(snapshot.ingredients_json)) return null;
  const ingredients = snapshotIngredients(snapshot.ingredients_json);
  if (!ingredients) return null;
  let hydrated: RecipeNutritionIngredientInput[] = ingredients;
  if (session.status === "completed") return predictSnapshotWeight({ snapshotId: snapshot.id, baseServings: snapshot.base_servings,
    cookingServings: session.cooking_servings, ingredients }); // Receipt replay never depends on today's conversion availability.
  let steps = cookingSteps ?? [];
  if (cookingSteps === undefined && methodClient && authorityArgs) {
    const mode = await callCookedBatchRpc(methodClient, "read_snapshot_v2_cook_mode", { ...authorityArgs, p_session_id: sessionId });
    if (mode.ok) {
      const data = projectSnapshotV2CookModeData(mode.data);
      if (data?.session_id === sessionId && data.recipe.id === session.recipe_id && data.recipe.cooking_servings === session.cooking_servings) steps = data.recipe.steps;
    }
    // Missing structured method context remains unknown; base completion still verifies authority.
  }
  if (weightClient) {
    const genericIds: string[] = [];
    for (const row of ingredients) if (!row.food_product_id && !row.food_product_nutrition_version_id && typeof row.ingredient_id === "string") genericIds.push(row.ingredient_id);
    try {
      const predecessors = await loadRecipeNutritionPredecessors(weightClient, genericIds);
      hydrated = hydrateRecipeNutritionIngredients(ingredients, predecessors);
    } catch { /* Missing approved conversion evidence remains unknown; no fallback. */ }
  }
  hydrated = (await hydrateRecipeProductNutrition(client, ingredients, hydrated, ownerId)).ingredients;
  const weighted: CookingWeightSnapshotIngredient[] = [];
  for (const [index, row] of hydrated.entries()) {
    const source = ingredients[index];
    if (!source || source.id !== row.id || source.ingredient_id !== row.ingredient_id
      || (source.food_product_id ?? null) !== (row.food_product_id ?? null)
      || (source.food_product_nutrition_version_id ?? null) !== (row.food_product_nutrition_version_id ?? null)) return null;
    const weightRow: CookingWeightSnapshotIngredient = { ...row };
    if (Object.hasOwn(source, "quantity_input")) weightRow.quantity_input = source.quantity_input;
    weighted.push(weightRow);
  }
  if (weighted.length !== ingredients.length) return null;
  return withIngredientMassFallback(predictSnapshotWeight({ snapshotId: snapshot.id, baseServings: snapshot.base_servings,
    cookingServings: session.cooking_servings, ingredients: weighted,
    snapshotSteps: Array.isArray(snapshot.steps_json) ? snapshot.steps_json : [], cookingSteps: steps }));
}

export function summarizeWeightPrediction(evidence: SnapshotWeightPrediction): CookedWeightSummary {
  const summary: CookedWeightSummary = { source: evidence.prediction.totalGrams === null ? "unavailable" : "conditional_estimate",
    predicted_g: evidence.prediction.totalGrams, model_version: evidence.prediction.modelVersion,
    reason_codes: [...new Set(evidence.prediction.reasons.map(reason => reason.code))] };
  if (evidence.prediction.assumptions.length > 0) summary.assumption_codes = [...evidence.prediction.assumptions];
  return summary;
}
