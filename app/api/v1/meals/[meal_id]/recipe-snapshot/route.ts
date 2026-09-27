import { fail, ok } from "@/lib/api/response";
import { isUuid } from "@/lib/server/cooking";
import { createHybridAuthorityRouteError, withHybridAuthorityRouteError } from "@/lib/server/hybrid-auth/route-error";
import { projectMealRecipeSnapshot, type MealRecipeSnapshotRow } from "@/lib/server/meal-recipe-snapshot";
import { createRouteHandlerClient } from "@/lib/supabase/server";

export const GET = withHybridAuthorityRouteError("계획에 저장된 레시피를 불러오지 못했어요.", async (
  _request: Request, context: { params: Promise<{ meal_id: string }> },
) => {
  const { meal_id: mealId } = await context.params;
  if (!isUuid(mealId)) return fail("RESOURCE_NOT_FOUND", "계획을 찾을 수 없어요.", 404);
  const client = await createRouteHandlerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  // Only the plan chooses the snapshot. Never accept a snapshot id from the browser.
  const result = await client.from("meals")
    .select("id, user_id, recipe_id, planned_servings, recipe_content_snapshot_id, recipe_content_snapshots(id, recipe_id, owner_user_id, title, base_servings, ingredients_json, steps_json)")
    .eq("id", mealId).eq("user_id", user.id).maybeSingle();
  if (result.error) return createHybridAuthorityRouteError(result.error) ?? fail("INTERNAL_ERROR", "계획을 불러오지 못했어요.", 500);
  if (!result.data || result.data.user_id !== user.id) return fail("RESOURCE_NOT_FOUND", "계획을 찾을 수 없어요.", 404);
  const row = result.data as unknown as MealRecipeSnapshotRow;
  const names = new Map<string, string>();
  // Validate ownership and the pin before reading any ingredient labels.
  const initial = projectMealRecipeSnapshot(row, user.id, names);
  if (!initial) return fail("SNAPSHOT_UNAVAILABLE", "이 계획에 저장된 레시피 내용을 확인할 수 없어요.", 409);
  const ids = [...new Set(initial.ingredients.map((item) => item.ingredient_id))];
  if (ids.length) {
    const labels = await client.from("ingredients").select("id, standard_name").in("id", ids);
    if (labels.error) return createHybridAuthorityRouteError(labels.error) ?? fail("INTERNAL_ERROR", "재료를 불러오지 못했어요.", 500);
    for (const label of labels.data ?? []) names.set(label.id, label.standard_name);
  }
  return ok(projectMealRecipeSnapshot(row, user.id, names));
});
