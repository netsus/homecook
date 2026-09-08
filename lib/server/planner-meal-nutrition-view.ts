import {
  PlannerNutritionReadError,
  readPlannerRecipeNutritionEntries,
  type PlannerNutritionDbClient,
} from "@/lib/server/planner-nutrition-summary";
import type { PlannerMealNutritionViewMap } from "@/types/planner-meal-nutrition";

function validDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export async function readPlannerMealNutrition(
  dbClient: Pick<PlannerNutritionDbClient, "from">,
  userId: string,
  range: { startDate: string; endDate: string },
): Promise<PlannerMealNutritionViewMap> {
  if (
    !userId.trim() || !validDateKey(range.startDate) || !validDateKey(range.endDate)
    || range.endDate < range.startDate
    || Date.parse(range.endDate) - Date.parse(range.startDate) > 6 * 86_400_000
  ) {
    throw new PlannerNutritionReadError();
  }
  const recipes = await readPlannerRecipeNutritionEntries(dbClient, userId, range);
  return Object.fromEntries(recipes.map(({ mealId, plannedServings, entry }) => [
    mealId,
    // Nutrition pins have no finished-weight evidence; do not infer it from servings.
    { plannedServings, totalWeightGrams: null, values: entry.values },
  ]));
}

export async function loadPlannerMealNutritionForServer(
  range: { startDate: string; endDate: string },
): Promise<PlannerMealNutritionViewMap> {
  try {
    const { hasSupabasePublicEnv } = await import("@/lib/supabase/env");
    if (!hasSupabasePublicEnv()) return {};
    const { createServerComponentClient } = await import("@/lib/supabase/server");
    const dbClient = await createServerComponentClient();
    const { data, error } = await dbClient.auth.getUser();
    // E2E/UI authentication hints never authorize private server reads.
    if (error || !data.user) return {};
    return await readPlannerMealNutrition(
      dbClient as unknown as Pick<PlannerNutritionDbClient, "from">,
      data.user.id,
      range,
    );
  } catch {
    return {};
  }
}
