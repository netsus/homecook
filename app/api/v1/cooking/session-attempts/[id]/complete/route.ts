import { fail, ok } from "@/lib/api/response";
import {
  callCookedBatchRpc,
  isUuid,
  parseSnapshotV2CompleteRequest,
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
  const result = await callCookedBatchRpc(authorized.client, "complete_snapshot_v2_cooking_session", {
    ...authorized.authorityArgs,
    p_session_id: id,
    p_idempotency_key: key.key,
    p_consumed_pantry_item_ids: parsed.value.consumedPantryItemIds,
    p_weight_action: parsed.value.weightAction,
    p_finished_weight_g: parsed.value.finishedWeightG,
  });
  if (!result.ok) return result.response;
  const data = projectSnapshotV2CompleteData(result.data);
  return data ? ok(data) : fail("INTERNAL_ERROR", "요리 완료 결과를 확인하지 못했어요.", 500);
}
