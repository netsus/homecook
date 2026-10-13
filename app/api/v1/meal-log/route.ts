import { fail, ok } from "@/lib/api/response";
import { callMealLogRpc, parseMealLogDateQuery, projectMealLogData } from "@/lib/server/meal-log";
import { authorizeMealLogRequest } from "@/lib/server/meal-log-route";
import { quantityInputContractRequested, quantityInputWriteEnabled } from "@/lib/server/quantity-input";

export async function GET(request: Request) {
  const authorized = await authorizeMealLogRequest(); if (!authorized.ok) return authorized.response;
  const parsed = parseMealLogDateQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return fail("VALIDATION_ERROR", "날짜를 확인해 주세요.", 422, parsed.fields);
  const result = await callMealLogRpc(authorized.client, "get_meal_log_day", { ...authorized.authorityArgs, p_date: parsed.value.date });
  if (!result.ok) return result.response;
  const data = projectMealLogData(result.data, quantityInputContractRequested(request));
  if (data && "quantity_policy" in data && !quantityInputWriteEnabled(request)) delete data.quantity_policy;
  return data ? ok(data) : fail("INTERNAL_ERROR", "식사 기록을 불러오지 못했어요.", 500);
}
