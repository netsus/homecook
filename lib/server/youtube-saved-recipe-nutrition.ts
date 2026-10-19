import { calculateRecipeNutrition, RECIPE_NUTRITION_EXPLICIT_UNIT_VERSION, type RecipeNutritionCalculatorInput } from "@/lib/nutrition/recipe-nutrition-calculator";
import { buildRecipeNutritionInputGuard, hydrateRecipeNutritionIngredients, loadRecipeNutritionPredecessors } from "@/scripts/lib/recipe-nutrition-predecessor.mjs";
import { hasExactFrozenQuantity } from "@/lib/server/youtube-public-recipe-nutrition";
import { parseYoutubeSavedPublicRecipeProjection } from "@/lib/server/youtube-saved-public-recipe";
import { hydrateRecipeQuantityNutrition } from "@/lib/server/recipe-quantity-input";
import { writeRecipeNutritionSnapshot } from "@/lib/server/recipe-nutrition-snapshot";
import { buildSessionAuthorityRpcArgs } from "@/lib/server/recipe-content-snapshot-future-propagation";
import type { AccountGenerationBootstrapSessionAuthority } from "@/lib/server/account-generation/session-authority";
import type { RecipeProductNutritionClient } from "@/lib/server/recipe-product-nutrition";
import type { YoutubeSavedRecipeResult } from "@/types/youtube-saved-recipe";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const hash = /^[0-9a-f]{64}$/u;
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
interface SavedNutritionOwnerClient {
  readRecipe(recipeId: string): PromiseLike<{ data: unknown; error: unknown }>;
  writeSnapshot(args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
export type SavedNutritionPublication = NonNullable<YoutubeSavedRecipeResult["nutrition_publication"]>;
class StaleSavedNutrition extends Error {}

/** The durable save has already succeeded. Publication may only use that exact
 * receipt's revision/hash, including on replay; it never follows a newer edit. */
export async function publishSavedYoutubeRecipeNutrition(input: {
  receipt: unknown;
  authority: AccountGenerationBootstrapSessionAuthority;
  ownerClient: SavedNutritionOwnerClient;
  internalClient: RecipeProductNutritionClient & { from(table: string): unknown };
}): Promise<SavedNutritionPublication> {
  const receipt = input.receipt;
  if (!record(receipt) || typeof receipt.draft_id !== "string" || !uuid.test(receipt.draft_id)
    || typeof receipt.recipe_id !== "string" || !uuid.test(receipt.recipe_id)
    || !Number.isSafeInteger(receipt.revision) || Number(receipt.revision) <= 0
    || typeof receipt.canonical_content_hash !== "string" || !hash.test(receipt.canonical_content_hash)
    || typeof receipt.updated_at !== "string") return { status: "pending" };
  try {
    const owned = await input.internalClient.rpc("read_youtube_saved_recipe_results", {
      ...buildSessionAuthorityRpcArgs(input.authority), p_result_id: receipt.draft_id,
    });
    const envelope = owned.data;
    if (owned.error || !record(envelope) || envelope.success !== true || !record(envelope.data)) return { status: "pending" };
    const current = envelope.data;
    if (current.draft_id !== receipt.draft_id || current.recipe_id !== receipt.recipe_id
      || current.revision !== receipt.revision || current.canonical_content_hash !== receipt.canonical_content_hash
      || current.updated_at !== receipt.updated_at) return { status: "stale" };
    if (!record(current.content) || !Array.isArray(current.content.ingredients)
      || current.content.ingredients.some(row => !record(row) || typeof row.row_id !== "string" || !uuid.test(row.row_id))) return { status: "pending" };
    const rowIds = current.content.ingredients.map(row => String(row.row_id));
    const recipeRead = await input.ownerClient.readRecipe(receipt.recipe_id);
    const recipe = recipeRead.data;
    if (recipeRead.error || !record(recipe) || recipe.id !== receipt.recipe_id || recipe.created_by !== input.authority.ownerUuid
      || recipe.visibility !== "public" || recipe.source_type !== "youtube" || recipe.deleted_at !== null) return { status: "pending" };
    if (recipe.revision !== receipt.revision || recipe.updated_at !== receipt.updated_at) return { status: "stale" };
    if (typeof recipe.base_servings !== "number" || !Number.isFinite(recipe.base_servings) || recipe.base_servings <= 0) return { status: "pending" };
    const projected = await input.internalClient.rpc("read_public_youtube_saved_recipe_detail", { p_recipe_id: receipt.recipe_id });
    const projection = projected.error ? null : parseYoutubeSavedPublicRecipeProjection(projected.data);
    if (!projection || projection.ingredients.length !== rowIds.length) return { status: "pending" };
    const explicit = projection.ingredients.some(row => Boolean(row.quantity_input));
    const rows = projection.ingredients.map((row, index) => ({ id: rowIds[index], ingredient_id: row.ingredient_id,
      amount: hasExactFrozenQuantity(row) && (!explicit || ["g", "kg", "ml", "mL", "l", "L"].includes(row.unit ?? "")) ? row.amount : null,
      unit: row.unit, ingredient_type: row.ingredient_type, scalable: row.scalable, sort_order: index }));
    const predecessors = await loadRecipeNutritionPredecessors(input.internalClient, [...new Set(rows.map(row => row.ingredient_id))]);
    let hydrated = hydrateRecipeNutritionIngredients(rows, predecessors);
    const guard = buildRecipeNutritionInputGuard(rows, predecessors);
    if (explicit) {
      const quantity = await hydrateRecipeQuantityNutrition(input.internalClient, rows.map(row => ({ id: row.id, ingredient_id: row.ingredient_id })), hydrated, input.authority.ownerUuid);
      hydrated = quantity.ingredients;
      guard.recipe_ingredients = guard.recipe_ingredients.map(row => ({ ...row, recipe_quantity_context_sha256: quantity.hashes.get(row.id) }));
      Object.assign(guard, { quantity_policy_version: "quantity-v4", quantity_recipe_revision: receipt.revision });
    }
    Object.assign(guard, { canonical_saved_recipe: { revision: receipt.revision, content_hash: receipt.canonical_content_hash } });
    const calculationInput: RecipeNutritionCalculatorInput = { recipe_id: receipt.recipe_id, recipe_version: receipt.updated_at,
      base_servings: recipe.base_servings, ingredients: hydrated };
    if (explicit) calculationInput.calculation_version = RECIPE_NUTRITION_EXPLICIT_UNIT_VERSION;
    const calculation = calculateRecipeNutrition(calculationInput);
    calculation.input_hash = receipt.canonical_content_hash;
    await writeRecipeNutritionSnapshot({ rpc: async (_name, args) => {
      // Keep the existing authenticated owner wrapper. No service-role writer
      // or direct owner-only input-guard RPC is introduced.
      const result = await input.ownerClient.writeSnapshot(args);
      if (record(result.error) && /INPUT_STALE|STALE_REVISION/u.test(String(result.error.message))) throw new StaleSavedNutrition();
      const value = result.data;
      return { error: result.error, data: record(value) && typeof value.snapshot_id === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(value.snapshot_id)
        && typeof value.created === "boolean" && value.is_current === true
        ? { snapshot_id: value.snapshot_id, created: value.created, is_current: value.is_current } : null };
    } }, receipt.recipe_id, calculation, { expectedRecipeVersion: receipt.updated_at, inputGuard: guard });
    return { status: "ready" };
  } catch (error) {
    return { status: error instanceof StaleSavedNutrition ? "stale" : "pending" };
  }
}
