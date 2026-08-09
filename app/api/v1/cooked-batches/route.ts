import { fail, ok } from "@/lib/api/response";
import {
  callCookedBatchRpc,
  parseCookedBatchListQuery,
  projectCookedBatchListData,
} from "@/lib/server/cooked-batches";
import { authorizeCookedBatchRequest } from "@/lib/server/cooked-batch-route";

export async function GET(request: Request) {
  const authorized = await authorizeCookedBatchRequest();
  if (!authorized.ok) return authorized.response;
  const query = parseCookedBatchListQuery(new URL(request.url).searchParams);
  if (!query.ok) return fail("VALIDATION_ERROR", "조회 조건을 확인해 주세요.", 422, query.fields);
  const result = await callCookedBatchRpc(authorized.client, "list_cooked_batches", {
    ...authorized.authorityArgs,
    p_availability: query.value.availability,
    p_limit: query.value.limit,
    p_cursor_cooked_at: query.value.cursor?.cookedAt ?? null,
    p_cursor_id: query.value.cursor?.id ?? null,
  });
  if (!result.ok) return result.response;
  const data = projectCookedBatchListData(result.data, query.value.availability);
  return data ? ok(data) : fail("INTERNAL_ERROR", "요리 목록을 불러오지 못했어요.", 500);
}
