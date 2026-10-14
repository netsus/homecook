import { attestationOwnerPrecondition, attestationRpcArgs } from "@/lib/server/cooked-weight-attestation";
import { wantsCookedWeightEvidence } from "@/lib/cooking/cooked-weight-response-contract";
import { fail, ok } from "@/lib/api/response";
import { callCookedBatchRpc, isCookedWeightEvidenceDisabledResponse, isUuid, parseBatchWeightRequest, projectCookedBatchMutationData } from "@/lib/server/cooked-batches";
import { authorizeCookedBatchRequest, readJson } from "@/lib/server/cooked-batch-route";
import { readRequiredIdempotencyKey } from "@/lib/server/recipe-content-snapshot-future-propagation";
import { cookedWeightEvidenceEnabled } from "@/lib/server/cooked-batch-weight-evidence";

interface RouteContext { params: Promise<{ id: string }> }
export async function PATCH(request: Request, context: RouteContext) {
  const authorized = await authorizeCookedBatchRequest(); if (!authorized.ok) return authorized.response;
  const key = readRequiredIdempotencyKey(request); if (!key.ok) return key.response;
  const { id } = await context.params; if (!isUuid(id)) return fail("RESOURCE_NOT_FOUND", "요청한 항목을 찾을 수 없어요.", 404);
  const body = await readJson(request); if (!body.ok) return body.response;
  const parsed = parseBatchWeightRequest(body.value); if (!parsed.ok) return fail("VALIDATION_ERROR", "요청 값을 확인해 주세요.", 422, parsed.fields);
  const attestation = parsed.value.action === "set_finished_weight" ? parsed.value.weightAttestation : undefined;
  if (attestation) {
    const error = attestationOwnerPrecondition(attestation, authorized.user.id);
    if (error) return error;
  }
  const evidence = parsed.value.action === "set_finished_weight" && (cookedWeightEvidenceEnabled() || parsed.value.weightInputSource !== null);
  const args: Record<string, unknown> = {
    ...authorized.authorityArgs, p_batch_id: id, p_idempotency_key: key.key,
    p_action: parsed.value.action, p_finished_weight_g: parsed.value.finishedWeightG,
    p_expected_revision: parsed.value.expectedRevision,
  };
  if (evidence) {
    args.p_weight_input_source = parsed.value.weightInputSource;
    args.p_write_enabled = cookedWeightEvidenceEnabled();
  }
  if (attestation) Object.assign(args, attestationRpcArgs(attestation));
  let result = await callCookedBatchRpc(authorized.client, attestation ? "mutate_cooked_batch_weight_with_attestation" : evidence ? "mutate_cooked_batch_weight_with_evidence" : "mutate_cooked_batch_weight", args);
  if (evidence && parsed.value.weightInputSource === null && !result.ok && await isCookedWeightEvidenceDisabledResponse(result.response)) {
    const legacyArgs = { ...args };
    delete legacyArgs.p_weight_input_source;
    delete legacyArgs.p_write_enabled;
    result = await callCookedBatchRpc(authorized.client, "mutate_cooked_batch_weight", legacyArgs);
  }
  if (!result.ok) return result.response; const data = projectCookedBatchMutationData(result.data, wantsCookedWeightEvidence(request), attestation);
  return data ? ok(data) : fail("INTERNAL_ERROR", "중량 변경 결과를 확인하지 못했어요.", 500);
}
