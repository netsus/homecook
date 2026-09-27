import { fail, ok } from "@/lib/api/response";
import { readVerifiedAccountGenerationSession } from "@/lib/server/account-generation/session-authority";
import { isUuid } from "@/lib/server/cooking";
import { withHybridAuthorityRouteError } from "@/lib/server/hybrid-auth/route-error";
import { publishManualRecipe } from "@/lib/server/manual-recipe-publication";
import { buildSessionAuthorityRpcArgs, callFuturePropagationRpc } from "@/lib/server/recipe-content-snapshot-future-propagation";
import { createRecipeNutritionSnapshotPayload } from "@/lib/server/recipe-nutrition-snapshot";
import { prepareRecipeNutritionSnapshot, type RecipeNutritionServiceClient } from "@/lib/server/recipe-nutrition-service";
import { createRecipeFuturePropagationInternalClient, createRecipeImageInternalClient, createRouteHandlerClient } from "@/lib/supabase/server";

// An explicit owner action for previously authored private originals. No GET
// changes visibility, and an origin-less recipe alone is not proof of authorship.
export const POST = withHybridAuthorityRouteError("공개 등록을 완료하지 못했어요. 다시 시도해 주세요.", async (
  _request: Request, context: { params: Promise<{ id: string }> },
) => {
  const { id } = await context.params;
  if (!isUuid(id)) return fail("RESOURCE_NOT_FOUND", "레시피를 찾을 수 없어요.", 404);
  const client = await createRouteHandlerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  const verified = await readVerifiedAccountGenerationSession(client, user);
  if (!verified.ok || verified.sessionAuthority.ownerUuid !== user.id) {
    return fail("ACCOUNT_SESSION_STALE", "다시 로그인한 뒤 공개해 주세요.", 409);
  }
  const rpcClient = createRecipeFuturePropagationInternalClient();
  const storageClient = createRecipeImageInternalClient();
  if (!rpcClient || !storageClient) return fail("INTERNAL_ERROR", "공개 등록을 준비하지 못했어요.", 503);
  const authorityParams = buildSessionAuthorityRpcArgs(verified.sessionAuthority);
  const contextResult = await callFuturePropagationRpc(rpcClient, "read_owned_manual_recipe_publication_context", {
    ...authorityParams, p_recipe_id: id,
  });
  if (!contextResult.ok) return contextResult.response;
  const receipt = contextResult.data as { recipe_id?: unknown; idempotency_key?: unknown } | null;
  if (!receipt || receipt.recipe_id !== id || typeof receipt.idempotency_key !== "string" || !isUuid(receipt.idempotency_key)) {
    return fail("RESOURCE_NOT_FOUND", "직접 등록한 내 레시피만 공개할 수 있어요.", 404);
  }
  const prepared = await prepareRecipeNutritionSnapshot(client as unknown as RecipeNutritionServiceClient, id, rpcClient as unknown as RecipeNutritionServiceClient);
  const result = await publishManualRecipe({
    rpcClient, storageClient, authorityParams, recipeId: id,
    idempotencyKey: receipt.idempotency_key,
    expectedUpdatedAt: prepared.expectedRecipeVersion,
    nutritionSnapshot: createRecipeNutritionSnapshotPayload(prepared.calculation), inputGuard: prepared.inputGuard,
  });
  if (result.id !== id || result.visibility !== "public") return fail("INTERNAL_ERROR", "공개 등록이 완료되지 않았어요.", 503);
  return ok({ id, visibility: "public" as const });
});
