import { fail, ok } from "@/lib/api/response";
import { callMealLogRpc } from "@/lib/server/meal-log";
import { authorizeMealLogRequest } from "@/lib/server/meal-log-route";
import { parseMealLogNutritionPreviewQuery, projectMealLogNutritionPreview } from "@/lib/server/meal-log-nutrition-preview";

export async function GET(request: Request) {
  const authorized = await authorizeMealLogRequest();
  if (!authorized.ok) return authorized.response;
  const parsed = parseMealLogNutritionPreviewQuery(new URL(request.url).searchParams);
  if (!parsed.ok) return fail("VALIDATION_ERROR", "음식과 양을 확인해 주세요.", 422, parsed.fields);
  const { source, quantity } = parsed.value;
  const result = await callMealLogRpc(authorized.client, "preview_meal_log_nutrition", {
    ...authorized.authorityArgs, p_source_type: source.type, p_source_id: source.id,
    p_amount: quantity.amount, p_unit: quantity.unit,
  });
  if (!result.ok) return result.response;
  const data = projectMealLogNutritionPreview(result.data, parsed.value);
  const response = data ? ok(data) : fail("INTERNAL_ERROR", "영양 정보를 불러오지 못했어요.", 500);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
