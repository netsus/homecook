import {
  calculateRecipeIngredientWeightGrams,
  type RecipeNutritionIngredientInput,
} from "@/lib/nutrition/recipe-nutrition-calculator";
import { hydrateRecipeNutritionIngredients, loadRecipeNutritionPredecessors } from "@/scripts/lib/recipe-nutrition-predecessor.mjs";
import { hydrateRecipeProductNutrition, type RecipeProductNutritionClient } from "@/lib/server/recipe-product-nutrition";

interface Snapshot {
  id: string;
  recipe_id: string;
  owner_user_id: string | null;
  base_servings: number;
  ingredients_json: unknown[];
}
export interface CookingWeightSession {
  id: string;
  user_id: string;
  recipe_id: string;
  contract_version: string;
  cooking_servings: number;
  recipe_content_snapshot_id: string;
  recipe_content_snapshots: Snapshot | Snapshot[] | null;
}
interface SessionQuery {
  eq(column: string, value: string): SessionQuery;
  maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>;
}
export interface CookingWeightSessionClient extends Partial<RecipeProductNutritionClient> {
  from(table: "cooking_sessions"): { select(columns: string): SessionQuery };
}

/** All quantitative rows must be convertible; never use a partial sum as a total. */
export function estimateCookedWeight(ingredients: RecipeNutritionIngredientInput[], baseServings: number, cookingServings: number): number | null {
  if (!Number.isFinite(baseServings) || baseServings <= 0 || !Number.isFinite(cookingServings) || cookingServings <= 0) return null;
  let total = 0;
  for (const ingredient of ingredients) {
    if (ingredient.ingredient_type === "TO_TASTE") continue;
    const grams = calculateRecipeIngredientWeightGrams([
      ingredient.food_product_id || ingredient.food_product_nutrition_version_id
        ? { ...ingredient, conversion_assignment: null, piece_weight: null }
        : ingredient,
    ]);
    if (grams === null || !Number.isFinite(grams) || grams <= 0) return null;
    total += grams * (ingredient.scalable ? cookingServings / baseServings : 1);
  }
  const estimate = Math.round(total * 0.75 * 100) / 100;
  return Number.isFinite(estimate) && estimate > 0 ? estimate : null;
}

export function snapshotIngredients(value: unknown[]): RecipeNutritionIngredientInput[] | null {
  const result: RecipeNutritionIngredientInput[] = [];
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const row = item as Record<string, unknown>;
    const product = row.food_product_id ?? null;
    const version = row.food_product_nutrition_version_id ?? null;
    if ((typeof row.ingredient_id !== "string" && row.ingredient_id !== null)
      || (product === null) !== (version === null)
      || (product !== null && (typeof product !== "string" || typeof version !== "string" || !product || !version))
      || (row.ingredient_id === null && product === null) || typeof row.scalable !== "boolean"
      || (row.ingredient_type !== "QUANT" && row.ingredient_type !== "TO_TASTE")
      || (row.amount !== null && (typeof row.amount !== "number" || !Number.isFinite(row.amount)))
      || (row.unit !== null && typeof row.unit !== "string")) return null;
    result.push({ id: typeof row.row_key === "string" ? row.row_key : `${product ?? row.ingredient_id}:${index}`, ingredient_id: row.ingredient_id,
      ingredient_type: row.ingredient_type, amount: row.amount,
      unit: row.unit, scalable: row.scalable, preparation_state: null,
      food_product_id: typeof product === "string" ? product : null,
      food_product_nutrition_version_id: typeof version === "string" ? version : null });
  }
  return result;
}

export async function readCookedWeightEstimate({ client, weightClient, ownerId, sessionId }: {
  client: CookingWeightSessionClient;
  weightClient: { from(table: string): unknown } | null;
  ownerId: string;
  sessionId: string;
}) {
  const result = await client.from("cooking_sessions")
    .select("id,user_id,recipe_id,contract_version,cooking_servings,recipe_content_snapshot_id,recipe_content_snapshots(id,recipe_id,owner_user_id,base_servings,ingredients_json)")
    .eq("id", sessionId).eq("user_id", ownerId).maybeSingle();
  if (result.error) throw result.error;
  const session = result.data as CookingWeightSession | null;
  const snapshot = Array.isArray(session?.recipe_content_snapshots) ? session.recipe_content_snapshots[0] : session?.recipe_content_snapshots;
  if (!session || session.id !== sessionId || session.user_id !== ownerId || session.contract_version !== "snapshot_v2"
    || !snapshot || snapshot.id !== session.recipe_content_snapshot_id || snapshot.recipe_id !== session.recipe_id
    || (snapshot.owner_user_id !== null && snapshot.owner_user_id !== ownerId) || !Array.isArray(snapshot.ingredients_json)) return null;
  const ingredients = snapshotIngredients(snapshot.ingredients_json);
  if (!ingredients) return null;
  const direct = estimateCookedWeight(ingredients, snapshot.base_servings, session.cooking_servings);
  if (direct !== null) return direct;
  // This scope reads approved public conversion evidence only. A missing piece
  // weight/density (or unavailable evidence) leaves the batch's weight unknown.
  try {
    const genericIds = ingredients.flatMap((row) => !row.food_product_id && row.ingredient_id ? [row.ingredient_id] : []);
    if (genericIds.length && !weightClient) return null;
    const predecessors = genericIds.length && weightClient
      ? await loadRecipeNutritionPredecessors(weightClient, genericIds) : new Map();
    let hydrated: RecipeNutritionIngredientInput[] = hydrateRecipeNutritionIngredients(ingredients, predecessors);
    if (ingredients.some((row) => row.food_product_id)) {
      if (!client.rpc) return null;
      hydrated = (await hydrateRecipeProductNutrition({ rpc: client.rpc.bind(client) }, ingredients, hydrated, ownerId)).ingredients;
    }
    return estimateCookedWeight(hydrated, snapshot.base_servings, session.cooking_servings);
  } catch {
    return null;
  }
}
