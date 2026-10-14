import { fail, ok } from "@/lib/api/response";
import { readProfileAccountGeneration } from "@/lib/server/account-generation/profile-subject";
import { quantityInputContractRequested, quantityInputWriteEnabled } from "@/lib/server/quantity-input";
import { callFuturePropagationRpc } from "@/lib/server/recipe-content-snapshot-future-propagation";
import { parseRecipeQuantitySources, projectRecipeQuantityContext } from "@/lib/server/recipe-quantity-input";
import { createRouteHandlerClient } from "@/lib/supabase/server";
import type { RecipeQuantityContextData } from "@/types/recipe";

/** A bounded read body. It never creates, edits, previews, or saves a recipe. */
export async function POST(request: Request) {
  const client = await createRouteHandlerClient();
  const auth = await client.auth.getUser();
  const user = auth.data.user;
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  if (!quantityInputContractRequested(request)) return fail("VALIDATION_ERROR", "수량 입력을 다시 확인해 주세요.", 422);
  const generation = await readProfileAccountGeneration(client, user);
  if (generation === null) return fail("ACCOUNT_SESSION_STALE", "세션을 다시 확인해 주세요.", 409);
  let body: unknown;
  try { body = await request.json(); } catch { return fail("VALIDATION_ERROR", "요청 본문을 확인해 주세요.", 422); }
  const parsed = parseRecipeQuantitySources(body);
  if (!parsed.ok) return fail("VALIDATION_ERROR", "재료 정보를 확인해 주세요.", 422, parsed.fields);
  const result = await callFuturePropagationRpc({ rpc: (name, args) => client.rpc(name, args) },
    "read_recipe_product_nutrition_predecessors", {
      p_owner_uuid: user.id,
      p_ingredients: parsed.sources.map(source => ({ id: source.row_key, ingredient_id: source.ingredient_id,
        food_product_id: source.food_product_id, food_product_nutrition_version_id: source.food_product_nutrition_version_id,
        quantity_options_requested: true })),
    });
  if (!result.ok) return result.response;
  if (!Array.isArray(result.data) || result.data.length !== parsed.sources.length) return fail("INTERNAL_ERROR", "수량 정보를 확인하지 못했어요.", 500);
  const items: RecipeQuantityContextData["items"] = [];
  for (const [index, row] of result.data.entries()) {
    const source = parsed.sources[index];
    if (!row || typeof row !== "object" || Array.isArray(row) || !("id" in row) || row.id !== source.row_key
      || !("recipe_quantity_context" in row)) return fail("INTERNAL_ERROR", "수량 정보를 확인하지 못했어요.", 500);
    const context = projectRecipeQuantityContext(row.recipe_quantity_context, source);
    if (!context) return fail("INTERNAL_ERROR", "수량 정보를 확인하지 못했어요.", 500);
    if (!quantityInputWriteEnabled(request)) context.ready = false;
    items.push({ ...source, context });
  }
  // Do not attach a pre-rotation subject stamp to a later read result.
  if (await readProfileAccountGeneration(client, user) !== generation) return fail("ACCOUNT_SESSION_STALE", "세션을 다시 확인해 주세요.", 409);
  return ok({ subject: { owner_uuid: user.id, account_generation: generation }, items } satisfies RecipeQuantityContextData);
}
