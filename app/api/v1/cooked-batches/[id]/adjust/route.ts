import { fail, ok } from "@/lib/api/response";
import { callCookedBatchRpc, isUuid, parseBatchAdjustmentRequest, projectCookedBatchMutationData } from "@/lib/server/cooked-batches";
import { authorizeCookedBatchRequest, readJson } from "@/lib/server/cooked-batch-route";
import { readRequiredIdempotencyKey } from "@/lib/server/recipe-content-snapshot-future-propagation";
interface RouteContext { params: Promise<{ id: string }> }
export async function POST(request: Request, context: RouteContext) {
  const authorized = await authorizeCookedBatchRequest(); if (!authorized.ok) return authorized.response;
  const key = readRequiredIdempotencyKey(request); if (!key.ok) return key.response;
  const { id } = await context.params; if (!isUuid(id)) return fail("RESOURCE_NOT_FOUND", "요청한 항목을 찾을 수 없어요.", 404);
  const body = await readJson(request); if (!body.ok) return body.response;
  const parsed = parseBatchAdjustmentRequest(body.value); if (!parsed.ok) return fail("VALIDATION_ERROR", "요청 값을 확인해 주세요.", 422, parsed.fields);
  const result = await callCookedBatchRpc(authorized.client, "adjust_cooked_batch", {
    ...authorized.authorityArgs, p_batch_id: id, p_idempotency_key: key.key,
    p_delta_g: parsed.value.deltaG, p_reason: parsed.value.reason,
    p_expected_revision: parsed.value.expectedRevision,
  });
  if (!result.ok) return result.response; const data = projectCookedBatchMutationData(result.data);
  return data ? ok(data) : fail("INTERNAL_ERROR", "보정 결과를 확인하지 못했어요.", 500);
}
