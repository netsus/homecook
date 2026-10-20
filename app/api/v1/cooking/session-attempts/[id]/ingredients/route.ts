import { fail, ok } from "@/lib/api/response";
import { authorizeCookedBatchRequest, readJson } from "@/lib/server/cooked-batch-route";
import { readRequiredIdempotencyKey, callFuturePropagationRpc, projectSnapshotV2CookModeData, isUuid } from "@/lib/server/recipe-content-snapshot-future-propagation";
import { applyExecutionQuantityChanges, calculateExecutionQuantities, executionState, parseExecutionQuantityChanges } from "@/lib/server/cooking-execution-quantities";
import { createRecipeMealWeightReadInternalClient } from "@/lib/supabase/server";
import { createHybridAuthorityRouteError } from "@/lib/server/hybrid-auth/route-error";

export async function PATCH(request: Request, context: { params: Promise<{id:string}> }) {
  const authorized=await authorizeCookedBatchRequest();if(!authorized.ok)return authorized.response;
  const {id}=await context.params;if(!isUuid(id))return fail("RESOURCE_NOT_FOUND","요리 기록을 찾을 수 없어요.",404);
  const key=readRequiredIdempotencyKey(request);if(!key.ok)return key.response;
  const body=await readJson(request);if(!body.ok)return body.response;
  const parsed=parseExecutionQuantityChanges(body.value);if(!parsed)return fail("VALIDATION_ERROR","재료의 양과 단위를 확인해 주세요.",422);
  const args={...authorized.authorityArgs,p_session_id:id};
  const modeResult=await callFuturePropagationRpc(authorized.client,"read_snapshot_v2_cook_mode",args);if(!modeResult.ok)return modeResult.response;
  const mode=projectSnapshotV2CookModeData(modeResult.data);if(!mode)return fail("INTERNAL_ERROR","요리 기록을 확인하지 못했어요.",500);
  const stored=await callFuturePropagationRpc(authorized.client,"read_cooking_execution_quantities",args);if(!stored.ok)return stored.response;
  const state=executionState(stored.data);if(!state)return fail("INTERNAL_ERROR","요리 기록을 확인하지 못했어요.",500);
  // Exact retries must reach the SQL receipt even after a successful save or completion.
  const nutritionClient=createRecipeMealWeightReadInternalClient();if(!nutritionClient)return fail("INTERNAL_ERROR","영양 계산 근거를 불러오지 못했어요.",503);
  let rows;let calculation;
  try {
    rows=applyExecutionQuantityChanges(state.rows,parsed.changes);
    calculation=await calculateExecutionQuantities({client:{from:table=>nutritionClient.from(table),rpc:(name,args)=>authorized.routeClient.rpc(name,args)},
      ownerId:authorized.user.id,recipeId:mode.recipe.id,snapshotId:state.snapshot_id,baseServings:state.base_servings,cookingServings:state.cooking_servings,
      rows,originalRows:state.original_rows,steps:state.steps,cookingSteps:mode.recipe.steps,cookingIngredients:mode.recipe.ingredients});
  } catch(error) {
    return createHybridAuthorityRouteError(error) ?? (error instanceof Error && error.message === "INVALID_EXECUTION_QUANTITY"
      ? fail("VALIDATION_ERROR","재료의 양을 확인해 주세요.",422) : fail("INTERNAL_ERROR","영양 계산 근거를 불러오지 못했어요. 입력은 유지돼요.",503));
  }
  const saved=await callFuturePropagationRpc(authorized.client,"save_cooking_execution_quantities",{...args,p_idempotency_key:key.key,
    p_expected_revision:parsed.expected_revision,p_snapshot_id:state.snapshot_id,p_rows:rows,p_nutrition_snapshot:calculation.nutritionSnapshot,p_prediction:calculation.prediction,p_request_changes:parsed.changes});
  return saved.ok?ok(saved.data):saved.response;
}
