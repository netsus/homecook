import {
  calculateRecipeIngredientWeightGrams,
  type RecipeNutritionIngredientInput,
} from "@/lib/nutrition/recipe-nutrition-calculator";
import {
  PlannerNutritionReadError,
  readPlannerRecipeNutritionEntries,
  type PlannerNutritionDbClient,
} from "@/lib/server/planner-nutrition-summary";
import {
  hydrateRecipeNutritionIngredients,
  loadRecipeNutritionPredecessors,
} from "@/scripts/lib/recipe-nutrition-predecessor.mjs";
import type { PlannerMealNutritionViewMap } from "@/types/planner-meal-nutrition";

function validDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function weightIngredient(
  value: unknown,
  index: number,
): RecipeNutritionIngredientInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const ingredient = value as Record<string, unknown>;
  const ingredientId = ingredient.ingredient_id;
  const ingredientType = ingredient.ingredient_type;
  const amount = ingredient.amount;
  const unit = ingredient.unit;
  const scalable = ingredient.scalable;
  if (
    typeof ingredientId !== "string"
    || (ingredientType !== "QUANT" && ingredientType !== "TO_TASTE")
    || (amount !== null && (typeof amount !== "number" || !Number.isFinite(amount)))
    || (unit !== null && typeof unit !== "string")
    || typeof scalable !== "boolean"
  ) {
    return null;
  }
  return {
    id: `${ingredientId}:${index}`,
    ingredient_id: ingredientId,
    amount,
    unit,
    ingredient_type: ingredientType,
    scalable,
    preparation_state: null,
  } satisfies RecipeNutritionIngredientInput;
}

export async function readPlannerMealNutrition(
  dbClient: Pick<PlannerNutritionDbClient, "from">,
  userId: string,
  range: { startDate: string; endDate: string },
  weightClient?: { from(table: string): unknown },
): Promise<PlannerMealNutritionViewMap> {
  if (
    !userId.trim() || !validDateKey(range.startDate) || !validDateKey(range.endDate)
    || range.endDate < range.startDate
    || Date.parse(range.endDate) - Date.parse(range.startDate) > 6 * 86_400_000
  ) {
    throw new PlannerNutritionReadError();
  }
  const recipes = await readPlannerRecipeNutritionEntries(dbClient, userId, range);
  let weightsByMeal = new Map<string, number>();
  if (weightClient) {
    try {
      const ingredientsByMeal = new Map(recipes.map((recipe) => [
        recipe.mealId,
        recipe.ingredients
          .map(weightIngredient)
          .filter((ingredient): ingredient is RecipeNutritionIngredientInput => ingredient !== null),
      ]));
      const ingredientRows = [...ingredientsByMeal.values()].flat();
      const predecessors = await loadRecipeNutritionPredecessors(
        weightClient,
        ingredientRows.map((ingredient) => ingredient.ingredient_id),
      );
      weightsByMeal = new Map(recipes.map((recipe) => {
        if (!(typeof recipe.baseServings === "number" && Number.isFinite(recipe.baseServings) && recipe.baseServings > 0)) {
          return [recipe.mealId, Number.NaN];
        }
        const hydrated = hydrateRecipeNutritionIngredients(
          ingredientsByMeal.get(recipe.mealId) ?? [],
          predecessors,
        ) as RecipeNutritionIngredientInput[];
        const baseWeight = calculateRecipeIngredientWeightGrams(hydrated);
        return [
          recipe.mealId,
          baseWeight === null
            ? Number.NaN
            : baseWeight * recipe.plannedServings / recipe.baseServings,
        ];
      }));
    } catch {
      weightsByMeal = new Map();
    }
  }
  return Object.fromEntries(recipes.map(({ mealId, plannedServings, entry }) => [
    mealId,
    {
      plannedServings,
      totalWeightGrams: Number.isFinite(weightsByMeal.get(mealId))
        ? weightsByMeal.get(mealId)!
        : null,
      values: entry.values,
    },
  ]));
}

export async function loadPlannerMealNutritionForServer(
  range: { startDate: string; endDate: string },
): Promise<PlannerMealNutritionViewMap> {
  try {
    const { hasSupabasePublicEnv } = await import("@/lib/supabase/env");
    if (!hasSupabasePublicEnv()) return {};
    const {
      createRecipeMealWeightReadInternalClient,
      createServerComponentClient,
    } = await import("@/lib/supabase/server");
    const dbClient = await createServerComponentClient();
    const { data, error } = await dbClient.auth.getUser();
    // E2E/UI authentication hints never authorize private server reads.
    if (error || !data.user) return {};
    return await readPlannerMealNutrition(
      dbClient as unknown as Pick<PlannerNutritionDbClient, "from">,
      data.user.id,
      range,
      createRecipeMealWeightReadInternalClient() ?? undefined,
    );
  } catch {
    return {};
  }
}
