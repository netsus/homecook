import { wantsCookedWeightEvidence } from "@/lib/cooking/cooked-weight-response-contract";
import { fail, ok } from "@/lib/api/response";
import { createHybridAuthorityRouteError } from "@/lib/server/hybrid-auth/route-error";
import { createRecipeMealWeightReadInternalClient } from "@/lib/supabase/server";
import { readCookedWeightEstimate, type CookingWeightSessionClient } from "@/lib/server/cooked-batch-weight-estimate";
import { cookedWeightEvidenceEnabled, readSnapshotWeightPrediction } from "@/lib/server/cooked-batch-weight-evidence";
import {
  callCookedBatchRpc,
  isUuid,
  parseSnapshotV2CompleteRequest,
  projectCookedBatchGamification,
  projectSnapshotV2CompleteData,
} from "@/lib/server/cooked-batches";
import { authorizeCookedBatchRequest, readJson } from
  "@/lib/server/cooked-batch-route";
import { readRequiredIdempotencyKey } from
  "@/lib/server/recipe-content-snapshot-future-propagation";

interface RouteContext { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  const authorized = await authorizeCookedBatchRequest();
  if (!authorized.ok) return authorized.response;
  const key = readRequiredIdempotencyKey(request);
  if (!key.ok) return key.response;
  const { id } = await context.params;
  if (!isUuid(id)) return fail("RESOURCE_NOT_FOUND", "요청한 항목을 찾을 수 없어요.", 404);
  const body = await readJson(request);
  if (!body.ok) return body.response;
  const parsed = parseSnapshotV2CompleteRequest(body.value);
  if (!parsed.ok) return fail("VALIDATION_ERROR", "요청 값을 확인해 주세요.", 422, parsed.fields);
  const evidenceEnabled = cookedWeightEvidenceEnabled();
  const withEvidence = evidenceEnabled || parsed.value.weightInputSource !== null;
  const args: Record<string, unknown> = {
    ...authorized.authorityArgs, p_session_id: id, p_idempotency_key: key.key,
    p_consumed_pantry_item_ids: parsed.value.consumedPantryItemIds,
    p_weight_action: parsed.value.weightAction, p_finished_weight_g: parsed.value.finishedWeightG,
  };
  try {
    if (withEvidence) {
      args.p_prediction = await readSnapshotWeightPrediction({
        client: authorized.routeClient, weightClient: createRecipeMealWeightReadInternalClient(),
        ownerId: authorized.user.id, sessionId: id, methodClient: authorized.client, authorityArgs: authorized.authorityArgs,
      });
      args.p_weight_input_source = parsed.value.weightInputSource;
      args.p_write_enabled = evidenceEnabled;
    } else if (parsed.value.weightAction === "weigh_later") {
      args.p_weight_action = "estimate_from_ingredients";
      args.p_finished_weight_g = await readCookedWeightEstimate({
        client: authorized.routeClient as unknown as CookingWeightSessionClient,
        weightClient: createRecipeMealWeightReadInternalClient(), ownerId: authorized.user.id, sessionId: id,
      });
    }
  } catch (error) {
    return createHybridAuthorityRouteError(error)
      ?? fail("INTERNAL_ERROR", "요리 중량 근거를 확인하지 못했어요. 다시 시도해 주세요.", 500);
  }
  const result = await callCookedBatchRpc(authorized.client, withEvidence
    ? "complete_snapshot_v2_cooking_session_with_weight_evidence" : "complete_snapshot_v2_cooking_session", args);
  if (!result.ok) return result.response;
  await projectCookedBatchGamification(
    authorized.routeClient,
    authorized.user.id,
    "cooking_completed",
    id,
  );
  const data = projectSnapshotV2CompleteData(result.data, wantsCookedWeightEvidence(request));
  return data ? ok(data) : fail("INTERNAL_ERROR", "요리 완료 결과를 확인하지 못했어요.", 500);
}
