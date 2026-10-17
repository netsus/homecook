import { attestationOwnerPrecondition, attestationRpcArgs } from "@/lib/server/cooked-weight-attestation";
import { wantsCookedWeightEvidence } from "@/lib/cooking/cooked-weight-response-contract";
import { fail, ok } from "@/lib/api/response";
import { createHybridAuthorityRouteError } from "@/lib/server/hybrid-auth/route-error";
import { createRecipeMealWeightReadInternalClient } from "@/lib/supabase/server";
import { readCookedWeightEstimate, type CookingWeightSessionClient } from "@/lib/server/cooked-batch-weight-estimate";
import { cookedWeightEvidenceEnabled, readSnapshotWeightPrediction } from "@/lib/server/cooked-batch-weight-evidence";
import type { RecipeProductNutritionClient } from "@/lib/server/recipe-product-nutrition";
import {
  callCookedBatchRpc,
  isCookedWeightEvidenceDisabledResponse,
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
  const attestation = parsed.value.weightAttestation;
  if (attestation) {
    const error = attestationOwnerPrecondition(attestation, authorized.user.id);
    if (error) return error;
  }
  const executionRevision = attestation && parsed.value.executionRevision === 0 ? undefined : parsed.value.executionRevision;
  if (executionRevision !== undefined && attestation) return fail("CONFLICT", "재료를 수정한 요리는 무게를 다시 확인해 주세요.", 409);
  const evidenceEnabled = cookedWeightEvidenceEnabled();
  const withEvidence = evidenceEnabled || parsed.value.weightInputSource !== null;
  const args: Record<string, unknown> = {
    ...authorized.authorityArgs, p_session_id: id, p_idempotency_key: key.key,
    p_consumed_pantry_item_ids: parsed.value.consumedPantryItemIds,
    p_weight_action: parsed.value.weightAction, p_finished_weight_g: parsed.value.finishedWeightG,
  };
  const sessionClient: CookingWeightSessionClient & RecipeProductNutritionClient = {
    rpc: (name, params) => authorized.routeClient.rpc(name, params),
    from: (table) => ({ select: (columns) => {
      let query = authorized.routeClient.from(table).select(columns);
      const reader = {
        eq: (column: string, value: string) => { query = query.eq(column, value); return reader; },
        maybeSingle: async () => {
          const result = await query.maybeSingle();
          return { data: result.data, error: result.error };
        },
      };
      return reader;
    } }),
  };
  try {
    if (withEvidence || executionRevision !== undefined) {
      args.p_prediction = executionRevision && executionRevision > 0 ? null : await readSnapshotWeightPrediction({
        client: sessionClient, weightClient: createRecipeMealWeightReadInternalClient(),
        ownerId: authorized.user.id, sessionId: id, methodClient: authorized.client, authorityArgs: authorized.authorityArgs,
      });
      args.p_weight_input_source = parsed.value.weightInputSource;
      args.p_write_enabled = evidenceEnabled;
    } else if (parsed.value.weightAction === "weigh_later") {
      args.p_weight_action = "estimate_from_ingredients";
      args.p_finished_weight_g = await readCookedWeightEstimate({
        client: sessionClient,
        weightClient: createRecipeMealWeightReadInternalClient(), ownerId: authorized.user.id, sessionId: id,
      });
    }
  } catch (error) {
    return createHybridAuthorityRouteError(error)
      ?? fail("INTERNAL_ERROR", "요리 중량 근거를 확인하지 못했어요. 다시 시도해 주세요.", 500);
  }
  if (attestation) Object.assign(args, attestationRpcArgs(attestation));
  if (executionRevision !== undefined) args.p_expected_execution_revision = executionRevision;
  let result = await callCookedBatchRpc(authorized.client, executionRevision !== undefined ? "complete_cooking_execution" : attestation ? "complete_snapshot_v2_cooking_session_with_attestation" : withEvidence
    ? "complete_snapshot_v2_cooking_session_with_weight_evidence" : "complete_snapshot_v2_cooking_session", args);
  if (executionRevision !== undefined && withEvidence && parsed.value.weightInputSource === null && !result.ok
    && await isCookedWeightEvidenceDisabledResponse(result.response)) {
    // Keep the execution revision lock and its frozen nutrition/prediction even
    // when the independent evidence writer is OFF. Never discard a measurement.
    result = await callCookedBatchRpc(authorized.client, "complete_cooking_execution", { ...args, p_write_enabled: false });
  }
  if (executionRevision === undefined && withEvidence && parsed.value.weightInputSource === null && !result.ok && await isCookedWeightEvidenceDisabledResponse(result.response)) {
    const legacyArgs = { ...args };
    delete legacyArgs.p_prediction;
    delete legacyArgs.p_weight_input_source;
    delete legacyArgs.p_write_enabled;
    try {
      if (parsed.value.weightAction === "weigh_later") {
        legacyArgs.p_weight_action = "estimate_from_ingredients";
        legacyArgs.p_finished_weight_g = await readCookedWeightEstimate({ client: sessionClient,
          weightClient: createRecipeMealWeightReadInternalClient(), ownerId: authorized.user.id, sessionId: id });
      }
    } catch (error) {
      return createHybridAuthorityRouteError(error)
        ?? fail("INTERNAL_ERROR", "요리 중량을 확인하지 못했어요. 다시 시도해 주세요.", 500);
    }
    result = await callCookedBatchRpc(authorized.client, "complete_snapshot_v2_cooking_session", legacyArgs);
  }
  if (!result.ok) return result.response;
  await projectCookedBatchGamification(
    authorized.routeClient,
    authorized.user.id,
    "cooking_completed",
    id,
  );
  const data = projectSnapshotV2CompleteData(result.data, wantsCookedWeightEvidence(request), attestation);
  return data ? ok(data) : fail("INTERNAL_ERROR", "요리 완료 결과를 확인하지 못했어요.", 500);
}
