import { fail, ok } from "@/lib/api/response";
import { isWeightAttestationContext, isWeightAttestationRetraction } from "@/lib/cooking/cooked-weight-attestation";
import { authorizeCookedBatchRequest, readJson } from "@/lib/server/cooked-batch-route";
import { callCookedBatchRpc, isUuid } from "@/lib/server/cooked-batches";
import { readRequiredIdempotencyKey } from "@/lib/server/recipe-content-snapshot-future-propagation";

interface RouteContext { params: Promise<{ id: string }> }
export async function GET(request: Request, context: RouteContext) {
  const authority = await authorizeCookedBatchRequest();
  if (!authority.ok) return authority.response;
  const { id } = await context.params;
  const target = new URL(request.url).searchParams.get("target");
  if (!isUuid(id) || (target !== "session" && target !== "batch")) {
    return fail("VALIDATION_ERROR", "확인할 요리 기록을 선택해 주세요.", 422);
  }
  const result = await callCookedBatchRpc(authority.client, "read_cooked_weight_attestation", {
    ...authority.authorityArgs, p_target_kind: target, p_target_id: id,
  });
  if (!result.ok) return result.response;
  return isWeightAttestationContext(result.data) && result.data.subject.owner_uuid === authority.user.id
    && result.data.target_id === id && result.data.target_kind === target
    ? ok(result.data) : fail("INVALID_RESPONSE", "확인 기록의 주체를 확인하지 못했어요.", 500);
}
export async function PATCH(request: Request, context: RouteContext) {
  const authority = await authorizeCookedBatchRequest();
  if (!authority.ok) return authority.response;
  const key = readRequiredIdempotencyKey(request);
  if (!key.ok) return key.response;
  const { id } = await context.params;
  const body = await readJson(request);
  if (!body.ok) return body.response;
  if (!isUuid(id) || !isWeightAttestationRetraction(body.value)) {
    return fail("VALIDATION_ERROR", "취소할 확인 기록을 다시 열어 주세요.", 422);
  }
  if (body.value.expected_subject.owner_uuid.toLowerCase() !== authority.user.id.toLowerCase()) {
    return fail("WEIGHT_ATTESTATION_SUBJECT_CHANGED", "확인한 계정이 바뀌었어요.", 409);
  }
  const result = await callCookedBatchRpc(authority.client, "retract_cooked_weight_attestation", {
    ...authority.authorityArgs, p_batch_id: id, p_idempotency_key: key.key,
    p_expected_generation: body.value.expected_subject.account_generation,
    p_expected_record: body.value.expected_record_id, p_expected_revision: body.value.expected_revision,
    p_expected_context: body.value.expected_context_fingerprint,
  });
  if (!result.ok) return result.response;
  return isWeightAttestationContext(result.data) && result.data.subject.owner_uuid === authority.user.id
    && result.data.target_id === id && result.data.target_kind === "batch" && result.data.record?.status === "retracted"
    ? ok(result.data) : fail("INVALID_RESPONSE", "확인 취소 결과를 확인하지 못했어요.", 500);
}
