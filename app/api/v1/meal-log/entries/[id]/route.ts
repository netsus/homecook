import { fail, ok } from "@/lib/api/response";
import { callMealLogRpc, isMealLogEntryId, parseIdempotencyKey, parseMealLogDeleteRequest, parseMealLogMutationRequest, projectMealLogData } from "@/lib/server/meal-log";
import { authorizeMealLogRequest, readMealLogJson } from "@/lib/server/meal-log-route";

interface Context { params: Promise<{ id: string }> }

function keyResponse(request: Request) {
  const parsed = parseIdempotencyKey(request.headers.get("Idempotency-Key"));
  if (parsed.ok) return parsed;
  const missing = parsed.fields.some((field) => field.reason === "required");
  return { ok: false as const, response: fail(missing ? "IDEMPOTENCY_KEY_REQUIRED" : "INVALID_IDEMPOTENCY_KEY", missing ? "요청 키가 필요해요." : "요청 키 형식을 확인해 주세요.", missing ? 428 : 400, parsed.fields) };
}

async function mutate(request: Request, context: Context, action: "patch" | "delete") {
  const authorized = await authorizeMealLogRequest(); if (!authorized.ok) return authorized.response;
  const key = keyResponse(request); if (!key.ok) return key.response;
  const { id } = await context.params; if (!isMealLogEntryId(id)) return fail("RESOURCE_NOT_FOUND", "요청한 항목을 찾을 수 없어요.", 404);
  const body = await readMealLogJson(request); if (!body.ok) return body.response;
  const parsed = action === "patch" ? parseMealLogMutationRequest(body.value, "patch") : parseMealLogDeleteRequest(body.value);
  if (!parsed.ok) {
    const mismatch = parsed.fields.some((field) => field.reason === "consumed_date_timezone_mismatch");
    return fail(mismatch ? "CONSUMED_DATE_TIMEZONE_MISMATCH" : "VALIDATION_ERROR", mismatch ? "날짜와 시간대를 확인해 주세요." : "요청 값을 확인해 주세요.", 422, parsed.fields);
  }
  const expectedRevision = parsed.value.expectedRevision;
  const result = await callMealLogRpc(authorized.client, "mutate_meal_log_entry", { ...authorized.authorityArgs, p_action: action, p_entry_id: id, p_idempotency_key: key.value, p_expected_revision: expectedRevision, p_payload: action === "patch" ? body.value : {} });
  if (!result.ok) return result.response;
  const data = projectMealLogData(result.data);
  return data ? ok(data) : fail("INTERNAL_ERROR", "식사 기록 결과를 확인하지 못했어요.", 500);
}

export async function PATCH(request: Request, context: Context) { return mutate(request, context, "patch"); }
export async function DELETE(request: Request, context: Context) { return mutate(request, context, "delete"); }
