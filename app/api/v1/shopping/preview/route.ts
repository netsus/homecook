import { fail, ok } from "@/lib/api/response";
import {
  ensurePublicUserRow,
  ensureUserBootstrapState,
  formatBootstrapErrorMessage,
  type UserBootstrapDbClient,
} from "@/lib/server/user-bootstrap";
import { isMealEligibleForShopping } from "@/lib/server/shopping";
import { createRouteHandlerClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { ShoppingPreviewData } from "@/types/shopping";

interface QueryError {
  message: string;
}

interface QueryOrderOption {
  ascending: boolean;
}

interface MealRow {
  id: string;
  recipe_id: string;
  plan_date: string;
  planned_servings: number;
  status: string;
  shopping_list_id: string | null;
  created_at: string;
}

interface RecipeRow {
  id: string;
  title: string;
  thumbnail_url: string | null;
}

type ArrayQueryResult<T> = PromiseLike<{
  data: T[] | null;
  error: QueryError | null;
}>;

interface MealsSelectQuery {
  eq(column: string, value: string): MealsSelectQuery;
  is(column: string, value: null): MealsSelectQuery;
  order(column: string, options: QueryOrderOption): MealsSelectQuery;
  then: ArrayQueryResult<MealRow>["then"];
}

interface RecipesSelectQuery {
  in(column: string, values: string[]): RecipesSelectQuery;
  then: ArrayQueryResult<RecipeRow>["then"];
}

interface MealsTable {
  select(columns: string): MealsSelectQuery;
}

interface RecipesTable {
  select(columns: string): RecipesSelectQuery;
}

interface ShoppingPreviewDbClient {
  from(table: "meals"): MealsTable;
  from(table: "recipes"): RecipesTable;
}

async function requireUser(routeClient: Awaited<ReturnType<typeof createRouteHandlerClient>>) {
  const authResult = await routeClient.auth.getUser();
  return authResult.data.user;
}

export async function GET() {
  const routeClient = await createRouteHandlerClient();
  const user = await requireUser(routeClient);

  if (!user) {
    return fail("UNAUTHORIZED", "로그인이 필요해요.", 401);
  }

  const dbClient = (createServiceRoleClient() ?? routeClient) as unknown as
    ShoppingPreviewDbClient & UserBootstrapDbClient;

  try {
    await ensurePublicUserRow(dbClient, user);
    await ensureUserBootstrapState(dbClient, user.id);
  } catch (bootstrapError) {
    return fail(
      "INTERNAL_ERROR",
      formatBootstrapErrorMessage(bootstrapError, "장보기 미리보기를 불러오지 못했어요."),
      500,
    );
  }

  const mealsResult = await dbClient
    .from("meals")
    .select("id, recipe_id, plan_date, planned_servings, status, shopping_list_id, created_at")
    .eq("user_id", user.id)
    .eq("status", "registered")
    .is("shopping_list_id", null)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (mealsResult.error || !mealsResult.data) {
    return fail("INTERNAL_ERROR", "장보기 미리보기를 불러오지 못했어요.", 500);
  }

  const eligibleMeals = mealsResult.data.filter(isMealEligibleForShopping);
  const recipeIds = [...new Set(eligibleMeals.map((meal) => meal.recipe_id))];
  const recipeMap = new Map<string, RecipeRow>();

  if (recipeIds.length > 0) {
    const recipesResult = await dbClient
      .from("recipes")
      .select("id, title, thumbnail_url")
      .in("id", recipeIds);

    if (recipesResult.error || !recipesResult.data) {
      return fail("INTERNAL_ERROR", "장보기 미리보기를 불러오지 못했어요.", 500);
    }

    recipesResult.data.forEach((recipe) => {
      recipeMap.set(recipe.id, recipe);
    });
  }

  const recipeGroups = new Map<
    string,
    {
      recipe_id: string;
      meal_ids: string[];
      planned_servings_total: number;
      first_created_at: string;
    }
  >();

  eligibleMeals.forEach((meal) => {
    const existing = recipeGroups.get(meal.recipe_id);

    if (existing) {
      existing.meal_ids.push(meal.id);
      existing.planned_servings_total += meal.planned_servings;
      if (meal.created_at < existing.first_created_at) {
        existing.first_created_at = meal.created_at;
      }
      return;
    }

    recipeGroups.set(meal.recipe_id, {
      recipe_id: meal.recipe_id,
      meal_ids: [meal.id],
      planned_servings_total: meal.planned_servings,
      first_created_at: meal.created_at,
    });
  });

  return ok({
    eligible_meals: eligibleMeals.map((meal) => ({
      id: meal.id,
      recipe_id: meal.recipe_id,
      recipe_name: recipeMap.get(meal.recipe_id)?.title ?? "",
      recipe_thumbnail: recipeMap.get(meal.recipe_id)?.thumbnail_url ?? null,
      planned_servings: meal.planned_servings,
      created_at: meal.created_at,
    })),
    recipes: [...recipeGroups.values()]
      .sort((left, right) => {
        const byCreatedAt = left.first_created_at.localeCompare(right.first_created_at);
        if (byCreatedAt !== 0) {
          return byCreatedAt;
        }

        return left.recipe_id.localeCompare(right.recipe_id);
      })
      .map((recipe) => ({
        recipe_id: recipe.recipe_id,
        recipe_name: recipeMap.get(recipe.recipe_id)?.title ?? "",
        recipe_thumbnail: recipeMap.get(recipe.recipe_id)?.thumbnail_url ?? null,
        meal_ids: recipe.meal_ids,
        planned_servings_total: recipe.planned_servings_total,
        shopping_servings: recipe.planned_servings_total,
        is_selected: true,
      })),
  } satisfies ShoppingPreviewData);
}
