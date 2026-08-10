import { fail, ok } from "@/lib/api/response";
import { callMealLogRpc, decodeMealLogRecentCursor, parseMealLogRecentQuery, projectMealLogRecentData } from "@/lib/server/meal-log";
import { authorizeMealLogRequest } from "@/lib/server/meal-log-route";

export async function GET(request: Request) {
  const authorized = await authorizeMealLogRequest(); if (!authorized.ok) return authorized.response;
  const parsed = parseMealLogRecentQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return fail("VALIDATION_ERROR", "조회 조건을 확인해 주세요.", 422, parsed.fields);
  const cursor = decodeMealLogRecentCursor(parsed.value.cursor);
  if (!cursor) return fail("VALIDATION_ERROR", "조회 위치를 확인해 주세요.", 422, [{ field: "cursor", reason: "invalid_cursor" }]);
  const result = await callMealLogRpc(authorized.client, "get_recent_meal_log_sources", { ...authorized.authorityArgs, p_limit: parsed.value.limit, p_cursor_date: cursor.date, p_cursor_id: cursor.id });
  if (!result.ok) return result.response;
  const data = projectMealLogRecentData(result.data);
  return data ? ok(data) : fail("INTERNAL_ERROR", "최근 식사 기록을 불러오지 못했어요.", 500);
}
