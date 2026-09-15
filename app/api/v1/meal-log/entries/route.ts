import { fail, ok } from "@/lib/api/response";
import { callMealLogRpc, parseIdempotencyKey, parseMealLogMutationRequest, projectMealLogData, toMealLogRpcPayload } from "@/lib/server/meal-log";
import { authorizeMealLogRequest, readMealLogJson } from "@/lib/server/meal-log-route";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const authorized = await authorizeMealLogRequest(); if (!authorized.ok) return authorized.response;
  const key = parseIdempotencyKey(request.headers.get("Idempotency-Key"));
  if (!key.ok) {
    const missing = key.fields.some((field) => field.reason === "required");
    return fail(missing ? "IDEMPOTENCY_KEY_REQUIRED" : "INVALID_IDEMPOTENCY_KEY", missing ? "요청 키가 필요해요." : "요청 키 형식을 확인해 주세요.", missing ? 428 : 400, key.fields);
  }
  const body = await readMealLogJson(request); if (!body.ok) return body.response;
  const parsed = parseMealLogMutationRequest(body.value, "create");
  if (!parsed.ok) {
    const mismatch = parsed.fields.some((field) => field.reason === "consumed_date_timezone_mismatch");
    return fail(mismatch ? "CONSUMED_DATE_TIMEZONE_MISMATCH" : "VALIDATION_ERROR", mismatch ? "날짜와 시간대를 확인해 주세요." : "요청 값을 확인해 주세요.", 422, parsed.fields);
  }
  const entryId = crypto.randomUUID();
  const payload = toMealLogRpcPayload(parsed.value);
  let rpcResult: { data: unknown; error: unknown } | null = null;
  if (parsed.value.source.type === "cooked_batch") {
    rpcResult = await authorized.client.rpc("create_legacy_leftover_meal_log_entry", {
      ...authorized.authorityArgs,
      p_entry_id: entryId,
      p_idempotency_key: key.value,
      p_payload: payload,
    });
    if (!rpcResult.error && isRecord(rpcResult.data) && rpcResult.data.handled === false) {
      rpcResult = null;
    }
  }
  rpcResult ??= await authorized.client.rpc("mutate_meal_log_entry", { ...authorized.authorityArgs, p_action: "create", p_entry_id: entryId, p_idempotency_key: key.value, p_expected_revision: null, p_payload: payload });
  const result = await callMealLogRpc({ rpc: async () => rpcResult }, "mutate_meal_log_entry", {});
  if (!result.ok) return result.response;
  const data = projectMealLogData(result.data);
  return data ? ok(data, { status: 201 }) : fail("INTERNAL_ERROR", "식사 기록 결과를 확인하지 못했어요.", 500);
}
